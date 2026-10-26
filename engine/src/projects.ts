/**
 * Plans are tasks in order; tasks are made of phases; phases form the graph the engine runs.
 * This is the single writer's view: create a project with its tasks and phases in one transaction, read graphs, run a
 * dispatch pass. Task order is an implicit dependency: a phase in a later task starts only after every phase of
 * the earlier tasks has landed. Explicit dependencies and file claims come from the phases themselves.
 */
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, backlogItem, checklistItem, todo, decision, event, idea, phase, phaseDependency, phaseFileClaim, project, pr, question, run, step, task, type PhaseStatus } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { claimsOverlap, findCycle, pickTasksToStart, type SchedTask } from './scheduler.js'

export interface NewPhase { key: string; title: string; description?: string; brief?: string; dependsOn?: string[]; files?: string[]; priority?: number }
export interface NewTask { title: string; description?: string; brief?: string; phases?: NewPhase[] }
export interface NewProject { appId: string; title: string; spec?: string; ideaId?: string; tasks: NewTask[] }

export class PlanError extends Error {}

export async function createProject(input: NewProject) {
  if (!input.tasks?.length) throw new PlanError('a project needs at least one task')
  const allPhases = input.tasks.flatMap((t, ti) => (t.phases ?? []).map((p) => ({ ...p, taskIndex: ti })))
  const keys = new Map(allPhases.map((p) => [p.key, p]))
  if (keys.size !== allPhases.length) throw new PlanError('phase keys must be unique within the project')
  for (const p of allPhases) for (const d of p.dependsOn ?? []) {
    const dep = keys.get(d)
    if (!dep) throw new PlanError(`phase ${p.key} depends on unknown phase ${d}`)
    if (dep.taskIndex > p.taskIndex) throw new PlanError(`phase ${p.key} (task ${p.taskIndex + 1}) depends on ${d} in a later task; tasks run in order`)
  }
  const cycle = findCycle(allPhases.map((p) => ({ id: p.key, status: 'queued', dependsOn: p.dependsOn ?? [], files: [] })))
  if (cycle) throw new PlanError(`dependency cycle: ${cycle.join(' → ')}`)

  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    const projectId = newId('project')
    const [p] = await tx.insert(project).values({
      id: projectId, appId: a.id, ideaId: input.ideaId ?? null, title: input.title, spec: input.spec ?? null, integrationBranch: `project/${projectId}`,
    }).returning()
    if (input.ideaId) await tx.update(idea).set({ lane: 'build' }).where(eq(idea.id, input.ideaId)) // the idea has left the inbox
    const [{ maxTask }] = await tx.select({ maxTask: sql<number>`coalesce(max(${task.number}), 0)` }).from(task).where(eq(task.appId, a.id))
    const [{ maxPhase }] = await tx.select({ maxPhase: sql<number>`coalesce(max(${phase.number}), 0)` }).from(phase).where(eq(phase.appId, a.id))
    let taskNumber = Number(maxTask), phaseNumber = Number(maxPhase)
    const taskRows = input.tasks.map((t, i) => ({
      id: newId('task'), appId: a.id, projectId, ideaId: input.ideaId ?? null, number: ++taskNumber, position: i, title: t.title, description: t.description ?? null, brief: t.brief ?? null,
    }))
    await tx.insert(task).values(taskRows)
    const idByKey = new Map(allPhases.map((ph) => [ph.key, newId('phase')]))
    const phaseRows = allPhases.map((ph, i) => ({
      id: idByKey.get(ph.key)!, appId: a.id, projectId, taskId: taskRows[ph.taskIndex].id, number: ++phaseNumber,
      title: ph.title, description: ph.description ?? null, brief: ph.brief ?? null, priority: ph.priority ?? 0, position: i,
    }))
    if (phaseRows.length) await tx.insert(phase).values(phaseRows)
    const deps = allPhases.flatMap((ph) => (ph.dependsOn ?? []).map((d) => ({ appId: a.id, phaseId: idByKey.get(ph.key)!, dependsOnPhaseId: idByKey.get(d)! })))
    if (deps.length) await tx.insert(phaseDependency).values(deps)
    const claims = allPhases.flatMap((ph) => (ph.files ?? []).map((path) => ({ appId: a.id, phaseId: idByKey.get(ph.key)!, path })))
    if (claims.length) await tx.insert(phaseFileClaim).values(claims)

    const base = { workspaceId: a.workspaceId, appId: a.id, projectId, actor: 'engine' }
    await appendEvent(tx, { ...base, type: 'project.created', payload: { title: p.title, tasks: taskRows.length, phases: phaseRows.length } })
    for (const t of taskRows) await appendEvent(tx, { ...base, taskId: t.id, type: 'task.created', payload: { number: t.number, title: t.title } })
    for (const r of phaseRows) await appendEvent(tx, { ...base, taskId: r.taskId, phaseId: r.id, type: 'phase.created', payload: { number: r.number, title: r.title } })
    return { project: p, tasks: taskRows, phases: phaseRows }
  })
}

/** Add phases to an existing task (the planner's output, or a person's). Dependencies may name keys in this batch or existing phase ids. */
export async function addPhases(taskId: string, phases: NewPhase[], actor = 'engine', outer?: Tx) {
  const work = async (tx: Tx) => {
    const [t] = await tx.select().from(task).where(eq(task.id, taskId))
    if (!t) throw new PlanError(`no task ${taskId}`)
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    const existing = new Set((await tx.select({ id: phase.id }).from(phase).where(eq(phase.projectId, t.projectId))).map((e) => e.id))
    const keys = new Set(phases.map((p) => p.key))
    if (keys.size !== phases.length) throw new PlanError('phase keys must be unique')
    for (const p of phases) for (const d of p.dependsOn ?? []) if (!keys.has(d) && !existing.has(d)) throw new PlanError(`phase ${p.key} depends on unknown phase ${d}`)
    const [{ maxPhase }] = await tx.select({ maxPhase: sql<number>`coalesce(max(${phase.number}), 0)` }).from(phase).where(eq(phase.appId, a.id))
    const [{ maxPos }] = await tx.select({ maxPos: sql<number>`coalesce(max(${phase.position}), -1)` }).from(phase).where(eq(phase.projectId, t.projectId))
    let number = Number(maxPhase), position = Number(maxPos)
    const idByKey = new Map(phases.map((p) => [p.key, newId('phase')]))
    const rows = phases.map((p) => ({
      id: idByKey.get(p.key)!, appId: a.id, projectId: t.projectId, taskId: t.id, number: ++number, title: p.title, description: p.description ?? null, brief: p.brief ?? null,
      priority: p.priority ?? 0, position: ++position, createdBy: actor,
    }))
    await tx.insert(phase).values(rows)
    const deps = phases.flatMap((p) => (p.dependsOn ?? []).map((d) => ({ appId: a.id, phaseId: idByKey.get(p.key)!, dependsOnPhaseId: idByKey.get(d) ?? d })))
    if (deps.length) await tx.insert(phaseDependency).values(deps)
    const claims = phases.flatMap((p) => (p.files ?? []).map((path) => ({ appId: a.id, phaseId: idByKey.get(p.key)!, path })))
    if (claims.length) await tx.insert(phaseFileClaim).values(claims)
    const base = { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, taskId: t.id, actor }
    for (const r of rows) await appendEvent(tx, { ...base, phaseId: r.id, type: 'phase.created', payload: { number: r.number, title: r.title } })
    return rows
  }
  return outer ? work(outer) : db.transaction(work)
}

/**
 * A new task at the end of an existing project (from its backlog, or by hand). In a running project it is planned
 * when the tasks before it have landed, like any other; a project that has landed, stopped or been superseded takes
 * no new tasks.
 */
export async function addTask(projectId: string, input: { title: string; description?: string; brief?: string; ideaId?: string }, actor = 'user', outer?: Tx) {
  if (!input.title?.trim()) throw new PlanError('a task needs a title')
  const work = async (tx: Tx) => {
    const [p] = await tx.select().from(project).where(eq(project.id, projectId))
    if (!p) throw new PlanError(`no project ${projectId}`)
    if (['landed', 'stopped', 'superseded'].includes(p.status)) throw new PlanError(`project is ${p.status}; it takes no new tasks`)
    const [a] = await tx.select().from(app).where(eq(app.id, p.appId))
    const [{ maxTask }] = await tx.select({ maxTask: sql<number>`coalesce(max(${task.number}), 0)` }).from(task).where(eq(task.appId, a.id))
    const [{ maxPos }] = await tx.select({ maxPos: sql<number>`coalesce(max(${task.position}), -1)` }).from(task).where(eq(task.projectId, projectId))
    const [t] = await tx.insert(task).values({
      id: newId('task'), appId: a.id, projectId, ideaId: input.ideaId ?? null, number: Number(maxTask) + 1, position: Number(maxPos) + 1,
      title: input.title.trim(), description: input.description?.trim() || null, brief: input.brief?.trim() || null, createdBy: actor,
    }).returning()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId, taskId: t.id, actor, type: 'task.created', payload: { number: t.number, title: t.title } })
    return t
  }
  return outer ? work(outer) : db.transaction(work)
}

async function loadProject(tx: Tx | typeof db, projectId: string) {
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p) return null
  const [a] = await tx.select().from(app).where(eq(app.id, p.appId))
  const tasks = await tx.select().from(task).where(eq(task.projectId, projectId)).orderBy(asc(task.position))
  const phases = await tx.select().from(phase).where(eq(phase.projectId, projectId)).orderBy(asc(phase.position))
  const ids = phases.map((x) => x.id)
  const deps = ids.length ? await tx.select().from(phaseDependency).where(inArray(phaseDependency.phaseId, ids)) : []
  const claims = ids.length ? await tx.select().from(phaseFileClaim).where(inArray(phaseFileClaim.phaseId, ids)) : []
  const runs = ids.length ? await tx.select().from(run).where(inArray(run.phaseId, ids)) : []
  const steps = ids.length ? await tx.select().from(step).where(inArray(step.phaseId, ids)).orderBy(asc(step.position)) : []
  const [thePr] = await tx.select().from(pr).where(eq(pr.projectId, projectId))
  const decisions = await tx.select().from(decision).where(eq(decision.projectId, projectId))
  const questions = await tx.select().from(question).where(eq(question.projectId, projectId)).orderBy(asc(question.askedAt))
  const backlog = await tx.select().from(backlogItem).where(eq(backlogItem.projectId, projectId)).orderBy(asc(backlogItem.createdAt))
  const todos = await tx.select().from(todo).where(eq(todo.projectId, projectId)).orderBy(asc(todo.number))
  const lines = todos.length ? await tx.select().from(checklistItem).where(inArray(checklistItem.todoId, todos.map((t) => t.id))).orderBy(asc(checklistItem.position)) : []
  const full = phases.map((x) => {
    const last = runs.filter((r) => r.phaseId === x.id).sort((r, q) => q.attempt - r.attempt)[0] ?? null
    return {
      ...x,
      dependsOn: deps.filter((d) => d.phaseId === x.id).map((d) => d.dependsOnPhaseId),
      files: claims.filter((c) => c.phaseId === x.id).map((c) => c.path),
      lastRun: last,
      steps: last ? steps.filter((s) => s.phaseId === x.id && s.runId === last.id) : [],
    }
  })
  const order = orderEdges(full, tasks)
  return {
    project: p, app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch, workspaceId: a.workspaceId }, pr: thePr ?? null,
    todos: todos.map((t) => ({ ...t, checklist: lines.filter((l) => l.todoId === t.id) })), // work outside the code that unblocks this project
    backlog, // everything the project has to cover: open, covered by a task, or dropped with a reason
    decisions, questions, // the planner's: what it settled (provisional until approved) and what it could not
    tasks: tasks.map((t) => ({ ...t, phaseIds: phases.filter((x) => x.taskId === t.id).map((x) => x.id) })),
    phases: full.map((x) => ({ ...x, orderedAfter: order.get(x.id) ?? [] })),
    conflicts: fileConflicts(full),
    files: sharedFiles(full),
  }
}

/** Pairs of open phases that claim the same path (a file, or a directory above it): they never run at once. */
export function fileConflicts(phases: { id: string; status: string; files: string[] }[]): [string, string][] {
  const open = phases.filter((x) => !['done', 'failed', 'cancelled'].includes(x.status))
  const out: [string, string][] = []
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const x = open[i], y = open[j]
    if (x.files.length && y.files.length && x.files.some((f) => y.files.some((g) => claimsOverlap(f, g)))) out.push([x.id, y.id])
  }
  return out
}

/** Files more than one open phase claims: nodes of their own on the graph, with who has the file right now. */
/**
 * Shared files, as the graph draws them: one node per contested path, by the scheduler's own rule (claimsOverlap: a
 * directory covers everything inside it). The node is the most specific path in the overlap; a phase that claims a
 * directory above it joins that node, so a wait the scheduler enforces is always a wait the graph shows.
 */
export function sharedFiles(phases: { id: string; status: string; files: string[] }[]): { path: string; phases: string[]; heldBy: string | null }[] {
  const open = phases.filter((x) => !['done', 'failed', 'cancelled'].includes(x.status))
  const active = (s: string) => ['running', 'awaiting_answer', 'merging', 'testing'].includes(s)
  const claims = open.map((x) => ({ id: x.id, files: [...new Set(x.files.map((p) => p.replace(/\/+$/, '')))] }))
  const byPath = new Map<string, Set<string>>()
  for (let i = 0; i < claims.length; i++) for (let j = i + 1; j < claims.length; j++) {
    for (const f of claims[i].files) for (const g of claims[j].files) {
      if (!claimsOverlap(f, g)) continue
      const path = f.length >= g.length ? f : g // the more specific side names the node
      const ids = byPath.get(path) ?? new Set<string>()
      ids.add(claims[i].id); ids.add(claims[j].id); byPath.set(path, ids)
    }
  }
  return [...byPath].sort(([a], [b]) => a.localeCompare(b)).map(([path, set]) => {
    const ids = open.filter((x) => set.has(x.id)).map((x) => x.id) // project order
    return { path, phases: ids, heldBy: ids.find((id) => active(open.find((x) => x.id === id)!.status)) ?? null }
  })
}

export const projectGraph = (projectId: string) => loadProject(db, projectId)
export type Graph = NonNullable<Awaited<ReturnType<typeof projectGraph>>>

/**
 * Task order, drawn: the phases that start a task point back at the phases that finish the nearest earlier task
 * with phases. Transitively the same constraint as impliedDeps, with far fewer edges, so a graph reads left to
 * right: whatever a phase waits on is to its left.
 */
export function orderEdges(phases: { id: string; taskId: string; dependsOn: string[] }[], tasks: { id: string; position: number }[]): Map<string, string[]> {
  const pos = new Map(tasks.map((t) => [t.id, t.position]))
  const byTask = new Map<string, typeof phases>()
  for (const x of phases) byTask.set(x.taskId, [...(byTask.get(x.taskId) ?? []), x])
  const ordered = [...byTask.entries()].sort((a, b) => (pos.get(a[0]) ?? 0) - (pos.get(b[0]) ?? 0)).map((e) => e[1])
  const out = new Map<string, string[]>(phases.map((x) => [x.id, []]))
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i]
    const curIds = new Set(cur.map((x) => x.id))
    const finishers = prev.filter((x) => !prev.some((y) => y.dependsOn.includes(x.id))).map((x) => x.id)
    for (const x of cur) if (!x.dependsOn.some((d) => curIds.has(d))) out.set(x.id, finishers.filter((f) => !x.dependsOn.includes(f)))
  }
  return out
}

/** Task order as edges: a phase depends on every phase of the earlier tasks in its project. */
function impliedDeps(phases: { id: string; taskId: string }[], tasks: { id: string; position: number }[]): Map<string, string[]> {
  const pos = new Map(tasks.map((t) => [t.id, t.position]))
  const out = new Map<string, string[]>()
  for (const x of phases) {
    const mine = pos.get(x.taskId) ?? 0
    out.set(x.id, phases.filter((y) => (pos.get(y.taskId) ?? 0) < mine).map((y) => y.id))
  }
  return out
}

/**
 * One dispatch pass across every running project (or one project, for drafts and demos): the ready set is all open
 * phases, file claims are checked across projects within an app (namespaced by app, so different repos never
 * collide), the cap is global. What can start is marked `ready`; everything else records why it waits.
 */
export async function tickAll(room: number, opts: { projectId?: string } = {}) {
  return db.transaction(async (tx) => {
    const projects = opts.projectId
      ? await tx.select().from(project).where(eq(project.id, opts.projectId))
      : await tx.select().from(project).where(eq(project.status, 'running')).orderBy(asc(project.createdAt))
    if (opts.projectId && !projects.length) throw new PlanError(`no project ${opts.projectId}`)
    if (!projects.length) return { start: [], held: [] }
    const projectIds = projects.map((p) => p.id)
    const apps = await tx.select().from(app).where(inArray(app.id, [...new Set(projects.map((p) => p.appId))]))
    const tasks = await tx.select().from(task).where(inArray(task.projectId, projectIds))
    const phases = await tx.select().from(phase).where(inArray(phase.projectId, projectIds)).orderBy(asc(phase.position))
    const ids = phases.map((x) => x.id)
    const deps = ids.length ? await tx.select().from(phaseDependency).where(inArray(phaseDependency.phaseId, ids)) : []
    const claims = ids.length ? await tx.select().from(phaseFileClaim).where(inArray(phaseFileClaim.phaseId, ids)) : []
    const projectIndex = new Map(projectIds.map((id, i) => [id, i]))
    const implied = new Map<string, string[]>()
    for (const pid of projectIds) {
      for (const [k, v] of impliedDeps(phases.filter((x) => x.projectId === pid), tasks.filter((t) => t.projectId === pid))) implied.set(k, v)
    }
    const sched: SchedTask[] = phases.map((x) => {
      const files = claims.filter((c) => c.phaseId === x.id).map((c) => `${x.appId}/${c.path}`)
      return {
        id: x.id, status: x.status as PhaseStatus,
        dependsOn: [...new Set([...deps.filter((d) => d.phaseId === x.id).map((d) => d.dependsOnPhaseId), ...(implied.get(x.id) ?? [])])],
        files: files.length ? files : [x.appId], // no claims = the whole app, never another app
        priority: x.priority, position: projectIndex.get(x.projectId)! * 10_000 + x.position, // older projects first
      }
    })
    const pick = pickTasksToStart(sched, room)
    const baseFor = (x: typeof phases[number]) => {
      const a = apps.find((q) => q.id === x.appId)!
      return { workspaceId: a.workspaceId, appId: x.appId, projectId: x.projectId, taskId: x.taskId, actor: 'engine' }
    }
    // A phase held over a file is waiting on the phase that has it, the same as a dependency; say so, and name the
    // file (Sandy, 2026-10-22: "if it shares the file and goes second, it's dependent on it").
    const describe = (reason: string, me: typeof phases[number]) => reason.replace(/(waiting on|shares files with|shares (\S+) with|blocked:) (ph_\S+)/, (_, verb, file, other) => {
      const o = phases.find((q) => q.id === other)
      if (!o) return `${verb} ${other}`
      const t = tasks.find((q) => q.id === o.taskId)
      const where = o.projectId !== me.projectId ? ' (another project)' : o.taskId !== me.taskId ? ` (task #${t?.number}, earlier in the project)` : ''
      const path = file?.replace(/^app_[A-Za-z0-9]+\/?/, '') // claims are namespaced by app; the person wants the path
      if (path) return `waiting on phase #${o.number} (${path})${where}`
      if (file !== undefined || verb === 'shares files with') return `waiting on phase #${o.number} (the whole app)${where}`
      return `${verb} phase #${o.number}${where}`
    })
    for (const id of pick.start) {
      const before = phases.find((x) => x.id === id)!
      if (before.status === 'ready') continue
      await tx.update(phase).set({ status: 'ready', heldReason: null, updatedAt: new Date() }).where(eq(phase.id, id))
      await appendEvent(tx, { ...baseFor(before), phaseId: id, type: 'phase.status', payload: { from: before.status, to: 'ready', why: 'dependencies done, files free' } })
    }
    for (const h of pick.held) {
      const before = phases.find((x) => x.id === h.id)!
      const reason = describe(h.reason, before)
      if (before.heldReason === reason) continue
      await tx.update(phase).set({ heldReason: reason, updatedAt: new Date() }).where(eq(phase.id, h.id))
      await appendEvent(tx, { ...baseFor(before), phaseId: h.id, type: 'phase.held', payload: { reason } })
    }
    return pick
  })
}

/** One dispatch pass for one project: drafts and demos. Running projects are dispatched together by tickAll. */
export const tick = (projectId: string, room: number) => tickAll(room, { projectId })

/** A manual transition, for driving a draft's graph by hand. */
export async function setPhaseStatus(phaseId: string, to: PhaseStatus, actor = 'user') {
  return db.transaction(async (tx) => {
    const [x] = await tx.select().from(phase).where(eq(phase.id, phaseId))
    if (!x) throw new PlanError(`no phase ${phaseId}`)
    const [a] = await tx.select().from(app).where(eq(app.id, x.appId))
    await tx.update(phase).set({ status: to, heldReason: null, updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: x.appId, projectId: x.projectId, taskId: x.taskId, phaseId, actor, type: 'phase.status', payload: { from: x.status, to } })
    return { ...x, status: to }
  })
}

/** Remove a draft task's phases, and what the planner wrote with them, so the task can be planned again. */
export async function clearPhases(taskId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(task).where(eq(task.id, taskId))
    if (!t) throw new PlanError(`no task ${taskId}`)
    const [p] = await tx.select().from(project).where(eq(project.id, t.projectId))
    if (!['drafting', 'proposed', 'approved'].includes(p.status)) throw new PlanError(`project is ${p.status}; only a draft's phases can be cleared`)
    const ids = (await tx.select({ id: phase.id }).from(phase).where(eq(phase.taskId, taskId))).map((x) => x.id)
    if (ids.length) {
      const dependents = await tx.select().from(phaseDependency).where(and(inArray(phaseDependency.dependsOnPhaseId, ids), notInArray(phaseDependency.phaseId, ids)))
      if (dependents.length) throw new PlanError(`${dependents.length} phase(s) in other tasks depend on this task's phases; clear those tasks first`)
      await tx.delete(phaseDependency).where(inArray(phaseDependency.phaseId, ids))
      await tx.delete(phaseFileClaim).where(inArray(phaseFileClaim.phaseId, ids))
      await tx.delete(step).where(inArray(step.phaseId, ids))
      await tx.delete(run).where(inArray(run.phaseId, ids))
      await tx.delete(phase).where(inArray(phase.id, ids))
    }
    await tx.delete(decision).where(eq(decision.taskId, taskId))
    await tx.delete(question).where(eq(question.taskId, taskId))
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, taskId, actor, type: 'task.cleared', payload: { phases: ids.length, number: t.number } })
    return { cleared: ids.length }
  })
}

/** Every project, newest first, with its app and counts: the Plans page. Superseded projects are hidden unless asked. */
export async function listProjects(opts: { all?: boolean; appId?: string } = {}) {
  const projects = (await db.select().from(project).orderBy(sql`${project.createdAt} desc`)).filter((p) => (opts.all || p.status !== 'superseded') && (!opts.appId || p.appId === opts.appId))
  const apps = await db.select().from(app)
  const ids = projects.map((p) => p.id)
  const tasks = ids.length ? await db.select({ projectId: task.projectId }).from(task).where(inArray(task.projectId, ids)) : []
  const phases = ids.length ? await db.select({ projectId: phase.projectId, status: phase.status }).from(phase).where(inArray(phase.projectId, ids)) : []
  const items = ids.length ? await db.select({ projectId: backlogItem.projectId }).from(backlogItem).where(and(inArray(backlogItem.projectId, ids), eq(backlogItem.state, 'open'))) : []
  return projects.map((p) => ({
    ...p, app: apps.find((a) => a.id === p.appId) ?? null,
    taskCount: tasks.filter((t) => t.projectId === p.id).length, backlogOpen: items.filter((i) => i.projectId === p.id).length,
    phases: phases.filter((x) => x.projectId === p.id).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {}),
  }))
}

/** Every task of an app's projects (superseded aside), with its project, its phases by status, and where planning stands. */
export async function listTasks(appId: string) {
  const projects = (await db.select().from(project).where(eq(project.appId, appId))).filter((p) => p.status !== 'superseded')
  const ids = projects.map((p) => p.id)
  if (!ids.length) return []
  const tasks = await db.select().from(task).where(inArray(task.projectId, ids))
  const phases = await db.select({ taskId: phase.taskId, status: phase.status }).from(phase).where(inArray(phase.projectId, ids))
  const taskIds = tasks.map((t) => t.id)
  const planning = taskIds.length ? await db.select({ taskId: event.taskId, type: event.type, seq: event.seq }).from(event)
    .where(and(inArray(event.taskId, taskIds), sql`${event.type} like 'task.plan%'`)).orderBy(desc(event.seq)) : []
  const order = new Map(projects.map((p) => [p.id, p.createdAt.getTime()]))
  return tasks
    .sort((a, b) => (order.get(b.projectId)! - order.get(a.projectId)!) || a.position - b.position)
    .map((t) => {
      const p = projects.find((x) => x.id === t.projectId)!
      const mine = phases.filter((x) => x.taskId === t.id)
      return {
        id: t.id, number: t.number, title: t.title, description: t.description, position: t.position,
        project: { id: p.id, title: p.title, status: p.status },
        phases: mine.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {}),
        planning: planning.find((e) => e.taskId === t.id)?.type ?? null, // task.planning | task.plan_waiting | task.planned | task.plan_failed
      }
    })
}

/**
 * The top-level graph: every phase of every project in an app (superseded projects aside), with its task and project, the
 * dependencies, and the pairs of open phases that share a file (they will never run at once; drawn as dashed links).
 */
export async function appGraph(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) return null
  const projects = (await db.select().from(project).where(eq(project.appId, appId)).orderBy(asc(project.createdAt))).filter((p) => p.status !== 'superseded')
  const projectIds = projects.map((p) => p.id)
  const tasks = projectIds.length ? await db.select().from(task).where(inArray(task.projectId, projectIds)).orderBy(asc(task.position)) : []
  const phases = projectIds.length ? await db.select().from(phase).where(inArray(phase.projectId, projectIds)).orderBy(asc(phase.position)) : []
  const ids = phases.map((x) => x.id)
  const deps = ids.length ? await db.select().from(phaseDependency).where(inArray(phaseDependency.phaseId, ids)) : []
  const claims = ids.length ? await db.select().from(phaseFileClaim).where(inArray(phaseFileClaim.phaseId, ids)) : []
  const runs = ids.length ? await db.select().from(run).where(inArray(run.phaseId, ids)) : []
  const prs = projectIds.length ? await db.select().from(pr).where(inArray(pr.projectId, projectIds)) : []
  const full = phases.map((x) => ({
    ...x,
    dependsOn: deps.filter((d) => d.phaseId === x.id).map((d) => d.dependsOnPhaseId),
    files: claims.filter((c) => c.phaseId === x.id).map((c) => c.path),
    lastRun: runs.filter((r) => r.phaseId === x.id).sort((r, q) => q.attempt - r.attempt)[0] ?? null,
  }))
  const conflicts = fileConflicts(full)
  const order = new Map<string, string[]>()
  for (const p of projects) for (const [id, after] of orderEdges(full.filter((x) => x.projectId === p.id), tasks.filter((t) => t.projectId === p.id))) order.set(id, after)
  return {
    app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch },
    projects: projects.map((p) => ({ ...p, pr: prs.find((q) => q.projectId === p.id) ?? null })),
    tasks, phases: full.map((x) => ({ ...x, orderedAfter: order.get(x.id) ?? [] })), conflicts, files: sharedFiles(full),
  }
}
