/**
 * Projects are issues in order; a code issue is planned into sub-issues; the sub-issues form the graph the engine
 * builds. This is the single writer's view: create a project with its issues and sub-issues in one transaction, read
 * graphs, run a dispatch pass. Issue order is an implicit dependency: a sub-issue of a later issue starts only after
 * every sub-issue of the earlier issues has landed. Explicit dependencies (blocks) and file claims come from the
 * sub-issues themselves. Each code sub-issue has a build: the engine's status, attempts and worktree for it.
 */
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, build, BUILD_STATE, decision, event, fileClaim, idea, issue, issueRelation, project, pr, question, run, step, type BuildStatus } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { getIssue, identifier, insertIssues, nextSort, PlanError, rollUp, setState, type Issue, type Source } from './issues.js'
import { claimsOverlap, findCycle, pickTasksToStart, type SchedTask } from './scheduler.js'

export { PlanError } from './issues.js'

export interface NewSubIssue { key: string; title: string; description?: string; brief?: string; dependsOn?: string[]; files?: string[]; priority?: number }
export interface NewProjectIssue { title: string; description?: string; brief?: string; subIssues?: NewSubIssue[] }
export interface NewProject { appId: string; name: string; content?: string; description?: string; ideaId?: string; workflowId?: string | null; issues: NewProjectIssue[] }

const BACKLOG = ['triage', 'backlog']
const ACTIVE: BuildStatus[] = ['running', 'awaiting_answer', 'merging', 'testing']
const FINISHED: BuildStatus[] = ['done', 'failed', 'cancelled']

/** Sub-issues to insert, with their builds, blocks relations and file claims. Dependencies may name keys or existing sub-issue ids. */
async function insertSubIssues(tx: Tx, appId: string, projectId: string, parentId: string, subs: NewSubIssue[], known: Map<string, string>, startSort: number, actor: string) {
  const keys = new Set(subs.map((s) => s.key))
  if (keys.size !== subs.length) throw new PlanError('sub-issue keys must be unique')
  for (const s of subs) for (const d of s.dependsOn ?? []) if (!keys.has(d) && !known.has(d)) throw new PlanError(`sub-issue ${s.key} depends on unknown sub-issue ${d}`)
  const idByKey = new Map(subs.map((s) => [s.key, newId('issue')]))
  const rows = await insertIssues(tx, appId, subs.map((s, i) => ({
    id: idByKey.get(s.key)!, kind: 'code' as const, parentId, projectId, title: s.title, description: s.description, brief: s.brief,
    priority: s.priority ?? 0, sortOrder: startSort + i, delegate: 'builder' as const, source: actor === 'planner' ? 'planner' as const : 'person' as const,
  })), actor)
  if (rows.length) await tx.insert(build).values(rows.map((r) => ({ issueId: r.id, appId })))
  for (const [k, v] of idByKey) known.set(k, v)
  const deps = subs.flatMap((s) => (s.dependsOn ?? []).map((d) => ({ appId, issueId: idByKey.get(d) ?? known.get(d)!, relatedIssueId: idByKey.get(s.key)!, type: 'blocks' })))
  if (deps.length) await tx.insert(issueRelation).values(deps)
  const claims = subs.flatMap((s) => (s.files ?? []).map((path) => ({ appId, issueId: idByKey.get(s.key)!, path })))
  if (claims.length) await tx.insert(fileClaim).values(claims)
  return rows
}

export async function createProject(input: NewProject, actor = 'engine') {
  if (!input.name?.trim()) throw new PlanError('a project needs a name')
  if (!input.issues?.length) throw new PlanError('a project needs at least one issue')
  const all = input.issues.flatMap((t, ti) => (t.subIssues ?? []).map((s) => ({ ...s, issueIndex: ti })))
  const keys = new Map(all.map((s) => [s.key, s]))
  if (keys.size !== all.length) throw new PlanError('sub-issue keys must be unique within the project')
  for (const s of all) for (const d of s.dependsOn ?? []) {
    const dep = keys.get(d)
    if (!dep) throw new PlanError(`sub-issue ${s.key} depends on unknown sub-issue ${d}`)
    if (dep.issueIndex > s.issueIndex) throw new PlanError(`sub-issue ${s.key} (issue ${s.issueIndex + 1}) depends on ${d} in a later issue; issues run in order`)
  }
  const cycle = findCycle(all.map((s) => ({ id: s.key, status: 'queued', dependsOn: s.dependsOn ?? [], files: [] })))
  if (cycle) throw new PlanError(`dependency cycle: ${cycle.join(' → ')}`)

  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    const projectId = newId('project')
    const [p] = await tx.insert(project).values({
      id: projectId, appId: a.id, ideaId: input.ideaId ?? null, name: input.name.trim(), description: input.description?.trim() || null,
      content: input.content?.trim() || null, integrationBranch: `project/${projectId}`, workflowId: input.workflowId ?? null,
    }).returning()
    if (input.ideaId) await tx.update(idea).set({ lane: 'build' }).where(eq(idea.id, input.ideaId)) // the idea has left the inbox
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId, actor, type: 'project.created', payload: { name: p.name, issues: input.issues.length, subIssues: all.length } })
    const issues = await insertIssues(tx, a.id, input.issues.map((t, i) => ({
      kind: 'code' as const, projectId, ideaId: input.ideaId ?? null, title: t.title, description: t.description, brief: t.brief, sortOrder: i, delegate: 'planner' as const,
    })), actor)
    const subs: Issue[] = []
    let sort = 0
    const known = new Map<string, string>() // key → id, across the project's issues: a later issue may depend on an earlier one's sub-issues
    for (const [i, t] of input.issues.entries()) {
      const rows = await insertSubIssues(tx, a.id, projectId, issues[i].id, t.subIssues ?? [], known, sort, actor)
      sort += rows.length
      subs.push(...rows)
    }
    return { project: p, issues, subIssues: subs }
  })
}

/** Add sub-issues to an existing code issue (the planner's output, or a person's). Dependencies may name keys in this batch or existing sub-issue ids. */
export async function addSubIssues(issueId: string, subs: NewSubIssue[], actor = 'engine', outer?: Tx) {
  const work = async (tx: Tx) => {
    const t = await getIssue(tx, issueId)
    if (t.parentId) throw new PlanError('sub-issues go one level deep')
    if (t.kind !== 'code') throw new PlanError('only a code issue is built in sub-issues; a to-do has a checklist')
    if (!t.projectId) throw new PlanError(`${t.title}: add it to a project before planning it`)
    const known = new Map((await tx.select({ id: issue.id }).from(issue).where(and(eq(issue.projectId, t.projectId), sql`${issue.parentId} is not null`))).map((e) => [e.id, e.id]))
    const [{ maxSort }] = await tx.select({ maxSort: sql<number>`coalesce(max(${issue.sortOrder}), -1)` }).from(issue).where(and(eq(issue.projectId, t.projectId), sql`${issue.parentId} is not null`))
    return insertSubIssues(tx, t.appId, t.projectId, t.id, subs, known, Number(maxSort) + 1, actor)
  }
  return outer ? work(outer) : db.transaction(work)
}

/**
 * A new code issue at the end of a project (from its backlog, or by hand). In a running project it is planned when
 * the issues before it have landed, like any other; a project that has landed, stopped or been superseded takes none.
 */
export async function addIssue(projectId: string, input: { title: string; description?: string; brief?: string; ideaId?: string; state?: 'todo' | 'backlog'; source?: Source; sourceRef?: Record<string, unknown> }, actor = 'user', outer?: Tx) {
  if (!input.title?.trim()) throw new PlanError('an issue needs a title')
  const work = async (tx: Tx) => {
    const [p] = await tx.select().from(project).where(eq(project.id, projectId))
    if (!p) throw new PlanError(`no project ${projectId}`)
    if (['landed', 'stopped', 'superseded'].includes(p.status)) throw new PlanError(`project is ${p.status}; it takes no new issues`)
    const [row] = await insertIssues(tx, p.appId, [{
      kind: 'code', projectId, ideaId: input.ideaId ?? null, title: input.title, description: input.description, brief: input.brief, state: input.state ?? 'todo',
      sortOrder: await nextSort(tx, { projectId }), delegate: input.state === 'backlog' ? null : 'planner', source: input.source, sourceRef: input.sourceRef,
    }], actor)
    return row
  }
  return outer ? work(outer) : db.transaction(work)
}

async function loadProject(tx: Tx | typeof db, projectId: string) {
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p) return null
  const [a] = await tx.select().from(app).where(eq(app.id, p.appId))
  const all = await tx.select().from(issue).where(eq(issue.projectId, projectId)).orderBy(asc(issue.sortOrder), asc(issue.number))
  const id = (i: Issue) => ({ ...i, identifier: identifier(a.key, i.number) })
  const top = all.filter((i) => !i.parentId)
  const code = top.filter((i) => i.kind === 'code')
  const backlogIds = new Set(code.filter((i) => BACKLOG.includes(i.state) || (['duplicate', 'canceled'].includes(i.state) && !all.some((s) => s.parentId === i.id) && !i.startedAt)).map((i) => i.id))
  const issues = code.filter((i) => !backlogIds.has(i.id))
  const subs = all.filter((i) => i.parentId && i.kind === 'code')
  const ids = subs.map((x) => x.id)
  const builds = ids.length ? await tx.select().from(build).where(inArray(build.issueId, ids)) : []
  const rels = all.length ? await tx.select().from(issueRelation).where(inArray(issueRelation.relatedIssueId, all.map((i) => i.id))) : []
  const claims = ids.length ? await tx.select().from(fileClaim).where(inArray(fileClaim.issueId, ids)) : []
  const runs = ids.length ? await tx.select().from(run).where(inArray(run.issueId, ids)) : []
  const steps = ids.length ? await tx.select().from(step).where(inArray(step.issueId, ids)).orderBy(asc(step.position)) : []
  const prs = await tx.select().from(pr).where(eq(pr.projectId, projectId))
  const decisions = await tx.select().from(decision).where(eq(decision.projectId, projectId))
  const questions = await tx.select().from(question).where(eq(question.projectId, projectId)).orderBy(asc(question.askedAt))
  const todos = top.filter((i) => i.kind === 'todo')
  const lines = all.filter((i) => i.parentId && i.kind === 'todo')
  const full = subs.map((x) => {
    const b = builds.find((q) => q.issueId === x.id)
    const last = runs.filter((r) => r.issueId === x.id).sort((r, q) => q.attempt - r.attempt)[0] ?? null
    return {
      ...id(x), status: (b?.status ?? 'queued') as BuildStatus, attempt: b?.attempt ?? 0, maxAttempts: b?.maxAttempts ?? 3, heldReason: b?.heldReason ?? null,
      branch: b?.branch ?? null, worktreePath: b?.worktreePath ?? null, baseSha: b?.baseSha ?? null,
      dependsOn: rels.filter((d) => d.relatedIssueId === x.id && d.type === 'blocks').map((d) => d.issueId),
      files: claims.filter((c) => c.issueId === x.id).map((c) => c.path),
      lastRun: last,
      steps: last ? steps.filter((s) => s.issueId === x.id && s.runId === last.id) : [],
    }
  })
  const order = orderEdges(full, issues)
  return {
    project: p, app: { id: a.id, name: a.name, key: a.key, defaultBranch: a.defaultBranch, workspaceId: a.workspaceId },
    pr: prs.find((q) => !q.issueId) ?? prs[0] ?? null, prs,
    todos: todos.map((t) => ({ ...id(t), checklist: lines.filter((l) => l.parentId === t.id).map(id) })), // work outside the code that unblocks this project
    // everything the project has to cover: open (backlog), or closed without being built (a duplicate of what covers it, or canceled with why)
    backlog: code.filter((i) => backlogIds.has(i.id)).map((i) => ({ ...id(i), duplicateOf: rels.find((r) => r.relatedIssueId === i.id && r.type === 'duplicate')?.issueId ?? null })),
    decisions, questions, // the planner's: what it settled (provisional until approved) and what it could not
    issues: issues.map((t) => ({ ...id(t), subIssueIds: subs.filter((x) => x.parentId === t.id).map((x) => x.id) })),
    subIssues: full.map((x) => ({ ...x, orderedAfter: order.get(x.id) ?? [] })),
    conflicts: fileConflicts(full),
    files: sharedFiles(full),
  }
}

/** Pairs of open sub-issues that claim the same path (a file, or a directory above it): they never build at once. */
export function fileConflicts(subs: { id: string; status: string; files: string[] }[]): [string, string][] {
  const open = subs.filter((x) => !FINISHED.includes(x.status as BuildStatus))
  const out: [string, string][] = []
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const x = open[i], y = open[j]
    if (x.files.length && y.files.length && x.files.some((f) => y.files.some((g) => claimsOverlap(f, g)))) out.push([x.id, y.id])
  }
  return out
}

/**
 * Shared files, as the graph draws them: one node per contested path, by the scheduler's own rule (claimsOverlap: a
 * directory covers everything inside it). The node is the most specific path in the overlap; a sub-issue that claims a
 * directory above it joins that node, so a wait the scheduler enforces is always a wait the graph shows.
 */
export function sharedFiles(subs: { id: string; status: string; files: string[] }[]): { path: string; subIssues: string[]; heldBy: string | null }[] {
  const open = subs.filter((x) => !FINISHED.includes(x.status as BuildStatus))
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
    return { path, subIssues: ids, heldBy: ids.find((id) => ACTIVE.includes(open.find((x) => x.id === id)!.status as BuildStatus)) ?? null }
  })
}

export const projectGraph = (projectId: string) => loadProject(db, projectId)
export type Graph = NonNullable<Awaited<ReturnType<typeof projectGraph>>>

/**
 * Issue order, drawn: the sub-issues that start an issue point back at the sub-issues that finish the nearest earlier
 * issue with sub-issues. Transitively the same constraint as impliedDeps, with far fewer edges, so a graph reads left
 * to right: whatever a sub-issue waits on is to its left.
 */
export function orderEdges(subs: { id: string; parentId: string | null; dependsOn: string[] }[], issues: { id: string; sortOrder: number }[]): Map<string, string[]> {
  const pos = new Map(issues.map((t) => [t.id, t.sortOrder]))
  const byParent = new Map<string, typeof subs>()
  for (const x of subs) byParent.set(x.parentId!, [...(byParent.get(x.parentId!) ?? []), x])
  const ordered = [...byParent.entries()].sort((a, b) => (pos.get(a[0]) ?? 0) - (pos.get(b[0]) ?? 0)).map((e) => e[1])
  const out = new Map<string, string[]>(subs.map((x) => [x.id, []]))
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i]
    const curIds = new Set(cur.map((x) => x.id))
    const finishers = prev.filter((x) => !prev.some((y) => y.dependsOn.includes(x.id))).map((x) => x.id)
    for (const x of cur) if (!x.dependsOn.some((d) => curIds.has(d))) out.set(x.id, finishers.filter((f) => !x.dependsOn.includes(f)))
  }
  return out
}

/** Issue order as edges: a sub-issue depends on every sub-issue of the earlier issues in its project. */
function impliedDeps(subs: { id: string; parentId: string | null }[], issues: { id: string; sortOrder: number }[]): Map<string, string[]> {
  const pos = new Map(issues.map((t) => [t.id, t.sortOrder]))
  const out = new Map<string, string[]>()
  for (const x of subs) {
    const mine = pos.get(x.parentId!) ?? 0
    out.set(x.id, subs.filter((y) => (pos.get(y.parentId!) ?? 0) < mine).map((y) => y.id))
  }
  return out
}

/** A build's status, and the sub-issue's state that follows it; the parent rolls up. Logs build.status. */
export async function setBuild(tx: Tx, issueId: string, set: Partial<typeof build.$inferInsert>, ev?: { actor?: string; runId?: string; payload?: Record<string, unknown>; type?: string }) {
  const [before] = await tx.select().from(build).where(eq(build.issueId, issueId))
  if (!before) throw new PlanError(`no build for ${issueId}`)
  await tx.update(build).set({ ...set, updatedAt: new Date() }).where(eq(build.issueId, issueId))
  const x = await getIssue(tx, issueId)
  if (set.status && set.status !== before.status) {
    const to = BUILD_STATE[set.status as BuildStatus]
    if (to !== x.state) await setState(tx, x, to, { actor: ev?.actor ?? 'engine', reason: to === 'canceled' ? (set.heldReason ?? 'canceled') : null })
    if (x.parentId) await rollUp(tx, x.parentId, ev?.actor ?? 'engine')
  }
  if (ev) {
    const [a] = await tx.select().from(app).where(eq(app.id, x.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: x.appId, projectId: x.projectId, issueId, runId: ev.runId ?? null, actor: ev.actor ?? 'engine', type: ev.type ?? 'build.status',
      payload: { identifier: identifier(a.key, x.number), number: x.number, ...(set.status && set.status !== before.status ? { from: before.status, to: set.status } : {}), ...ev.payload } })
  }
  return { before, issue: x }
}

/**
 * One dispatch pass across every running project (or one project, for drafts and demos): the ready set is all open
 * builds, file claims are checked across projects within an app (namespaced by app, so different repos never
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
    const all = await tx.select().from(issue).where(and(inArray(issue.projectId, projectIds), eq(issue.kind, 'code'))).orderBy(asc(issue.sortOrder))
    const parents = all.filter((i) => !i.parentId && !BACKLOG.includes(i.state))
    const subs = all.filter((i) => i.parentId)
    const ids = subs.map((x) => x.id)
    const builds = ids.length ? await tx.select().from(build).where(inArray(build.issueId, ids)) : []
    const deps = ids.length ? await tx.select().from(issueRelation).where(and(inArray(issueRelation.relatedIssueId, ids), eq(issueRelation.type, 'blocks'))) : []
    const claims = ids.length ? await tx.select().from(fileClaim).where(inArray(fileClaim.issueId, ids)) : []
    const projectIndex = new Map(projectIds.map((id, i) => [id, i]))
    const implied = new Map<string, string[]>()
    for (const pid of projectIds) {
      for (const [k, v] of impliedDeps(subs.filter((x) => x.projectId === pid), parents.filter((t) => t.projectId === pid))) implied.set(k, v)
    }
    const statusOf = (id: string) => builds.find((b) => b.issueId === id)?.status as BuildStatus
    // Linear's priority: 1 urgent … 4 low, 0 none. The scheduler wants bigger first.
    const rank = (p: number) => (p === 0 ? 0 : 5 - p)
    const sched: SchedTask[] = subs.map((x) => {
      const files = claims.filter((c) => c.issueId === x.id).map((c) => `${x.appId}/${c.path}`)
      return {
        id: x.id, status: statusOf(x.id),
        dependsOn: [...new Set([...deps.filter((d) => d.relatedIssueId === x.id).map((d) => d.issueId), ...(implied.get(x.id) ?? [])])],
        files: files.length ? files : [x.appId], // no claims = the whole app, never another app
        priority: rank(x.priority), position: projectIndex.get(x.projectId!)! * 10_000 + x.sortOrder, // older projects first
      }
    })
    const pick = pickTasksToStart(sched, room)
    const key = (x: Issue) => apps.find((q) => q.id === x.appId)!.key
    // A sub-issue held over a file is waiting on the one that has it, the same as a dependency; say so, and name the
    // file (Sandy, 2026-10-22: "if it shares the file and goes second, it's dependent on it").
    const describe = (reason: string, me: Issue) => reason.replace(/(waiting on|shares files with|shares (\S+) with|blocked:) ((?:iss|ph)_\S+)/, (_, verb, file, other) => {
      const o = subs.find((q) => q.id === other)
      if (!o) return `${verb} ${other}`
      const t = parents.find((q) => q.id === o.parentId)
      const name = identifier(key(o), o.number)
      const where = o.projectId !== me.projectId ? ' (another project)' : o.parentId !== me.parentId ? ` (${t ? identifier(key(t), t.number) : 'an issue'}, earlier in the project)` : ''
      const path = file?.replace(/^app_[A-Za-z0-9]+\/?/, '') // claims are namespaced by app; the person wants the path
      if (path) return `waiting on ${name} (${path})${where}`
      if (file !== undefined || verb === 'shares files with') return `waiting on ${name} (the whole app)${where}`
      return `${verb} ${name}${where}`
    })
    for (const id of pick.start) {
      if (statusOf(id) === 'ready') continue
      await setBuild(tx, id, { status: 'ready', heldReason: null }, { payload: { why: 'dependencies done, files free' } })
    }
    for (const h of pick.held) {
      const me = subs.find((x) => x.id === h.id)!
      const reason = describe(h.reason, me)
      if (builds.find((b) => b.issueId === h.id)?.heldReason === reason) continue
      await setBuild(tx, h.id, { heldReason: reason }, { type: 'build.held', payload: { reason } })
    }
    return pick
  })
}

/** One dispatch pass for one project: drafts and demos. Running projects are dispatched together by tickAll. */
export const tick = (projectId: string, room: number) => tickAll(room, { projectId })

/** A manual transition, for driving a draft's graph by hand. */
export async function setBuildStatus(issueId: string, to: BuildStatus, actor = 'user') {
  return db.transaction(async (tx) => {
    const { issue: x } = await setBuild(tx, issueId, { status: to, heldReason: null }, { actor })
    return { ...x, status: to }
  })
}

/** Remove a draft issue's sub-issues, and what the planner wrote with them, so the issue can be planned again. */
export async function clearSubIssues(issueId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const t = await getIssue(tx, issueId)
    if (!t.projectId) throw new PlanError('that issue is in no project')
    const [p] = await tx.select().from(project).where(eq(project.id, t.projectId))
    if (!['drafting', 'proposed', 'approved'].includes(p.status)) throw new PlanError(`project is ${p.status}; only a draft's sub-issues can be cleared`)
    const ids = (await tx.select({ id: issue.id }).from(issue).where(eq(issue.parentId, issueId))).map((x) => x.id)
    if (ids.length) {
      const dependents = await tx.select().from(issueRelation).where(and(inArray(issueRelation.issueId, ids), notInArray(issueRelation.relatedIssueId, ids), eq(issueRelation.type, 'blocks')))
      if (dependents.length) throw new PlanError(`${dependents.length} sub-issue(s) of other issues depend on this one's; clear those first`)
      await tx.delete(issueRelation).where(inArray(issueRelation.relatedIssueId, ids))
      await tx.delete(issueRelation).where(inArray(issueRelation.issueId, ids))
      await tx.delete(fileClaim).where(inArray(fileClaim.issueId, ids))
      await tx.delete(step).where(inArray(step.issueId, ids))
      await tx.delete(run).where(inArray(run.issueId, ids))
      await tx.delete(build).where(inArray(build.issueId, ids))
      await tx.delete(issue).where(inArray(issue.id, ids))
    }
    await tx.delete(decision).where(eq(decision.issueId, issueId))
    await tx.delete(question).where(eq(question.issueId, issueId))
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    if (t.state !== 'todo') await tx.update(issue).set({ state: 'todo', startedAt: null, updatedAt: new Date() }).where(eq(issue.id, issueId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId, actor, type: 'issue.cleared', payload: { subIssues: ids.length, identifier: identifier(a.key, t.number) } })
    return { cleared: ids.length }
  })
}

/** Every project, newest first, with its app and counts: the Projects page. Superseded projects are hidden unless asked. */
export async function listProjects(opts: { all?: boolean; appId?: string } = {}) {
  const projects = (await db.select().from(project).orderBy(sql`${project.createdAt} desc`)).filter((p) => (opts.all || p.status !== 'superseded') && (!opts.appId || p.appId === opts.appId))
  const apps = await db.select().from(app)
  const ids = projects.map((p) => p.id)
  const issues = ids.length ? await db.select({ id: issue.id, projectId: issue.projectId, parentId: issue.parentId, kind: issue.kind, state: issue.state }).from(issue).where(inArray(issue.projectId, ids)) : []
  const subIds = issues.filter((i) => i.parentId && i.kind === 'code').map((i) => i.id)
  const builds = subIds.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, subIds)) : []
  return projects.map((p) => {
    const mine = issues.filter((i) => i.projectId === p.id)
    return {
      ...p, app: apps.find((a) => a.id === p.appId) ?? null,
      issueCount: mine.filter((i) => !i.parentId && i.kind === 'code' && !BACKLOG.includes(i.state)).length,
      backlogOpen: mine.filter((i) => !i.parentId && BACKLOG.includes(i.state)).length,
      builds: builds.filter((b) => mine.some((i) => i.id === b.issueId)).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {}),
    }
  })
}

/**
 * Every top-level code issue of an app (in a project or not; superseded projects aside), with its project, its
 * sub-issues' builds by status, and where planning stands: the Issues page.
 */
export async function listCodeIssues(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const projects = (await db.select().from(project).where(eq(project.appId, appId))).filter((p) => p.status !== 'superseded')
  const rows = (await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.kind, 'code'), isNull(issue.parentId))))
    .filter((i) => !i.projectId || projects.some((p) => p.id === i.projectId))
  const subs = rows.length ? await db.select({ id: issue.id, parentId: issue.parentId }).from(issue).where(inArray(issue.parentId, rows.map((r) => r.id))) : []
  const builds = subs.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, subs.map((s) => s.id))) : []
  const planning = rows.length ? await db.select({ issueId: event.issueId, type: event.type, seq: event.seq }).from(event)
    .where(and(inArray(event.issueId, rows.map((r) => r.id)), sql`${event.type} like 'issue.plan%'`)).orderBy(desc(event.seq)) : []
  const order = new Map(projects.map((p) => [p.id, p.createdAt.getTime()]))
  return rows
    .sort((x, y) => (!x.projectId ? -1 : 0) - (!y.projectId ? -1 : 0) || (order.get(y.projectId!) ?? 0) - (order.get(x.projectId!) ?? 0) || x.sortOrder - y.sortOrder || x.number - y.number)
    .map((t) => {
      const p = projects.find((x) => x.id === t.projectId)
      const mine = subs.filter((s) => s.parentId === t.id).map((s) => builds.find((b) => b.issueId === s.id)?.status ?? 'queued')
      return {
        id: t.id, identifier: identifier(a.key, t.number), number: t.number, title: t.title, description: t.description, state: t.state, sortOrder: t.sortOrder, priority: t.priority,
        project: p ? { id: p.id, name: p.name, status: p.status } : null,
        builds: mine.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {}),
        planning: planning.find((e) => e.issueId === t.id)?.type ?? null, // issue.planning | issue.plan_waiting | issue.planned | issue.plan_failed
      }
    })
}

/** One issue in full: its sub-issues as a list (with their builds or checklist state), relations, and runs. */
export async function issueDetail(issueId: string) {
  const i = await getIssue(db, issueId)
  const [a] = await db.select().from(app).where(eq(app.id, i.appId))
  const subs = await db.select().from(issue).where(eq(issue.parentId, issueId)).orderBy(asc(issue.sortOrder), asc(issue.number))
  const ids = subs.map((s) => s.id)
  const builds = ids.length ? await db.select().from(build).where(inArray(build.issueId, ids)) : []
  const rels = await db.select().from(issueRelation).where(sql`${issueRelation.issueId} = ${issueId} or ${issueRelation.relatedIssueId} = ${issueId}`)
  const [p] = i.projectId ? await db.select().from(project).where(eq(project.id, i.projectId)) : []
  const [parent] = i.parentId ? await db.select().from(issue).where(eq(issue.id, i.parentId)) : []
  const questions = await db.select().from(question).where(eq(question.issueId, issueId))
  const decisions = await db.select().from(decision).where(eq(decision.issueId, issueId))
  const [b] = await db.select().from(build).where(eq(build.issueId, issueId))
  const [last] = await db.select().from(run).where(eq(run.issueId, issueId)).orderBy(desc(run.attempt)).limit(1)
  const steps = last ? await db.select().from(step).where(and(eq(step.issueId, issueId), eq(step.runId, last.id))).orderBy(asc(step.position)) : []
  return {
    ...i, identifier: identifier(a.key, i.number), project: p ? { id: p.id, name: p.name, status: p.status } : null,
    parent: parent ? { id: parent.id, identifier: identifier(a.key, parent.number), title: parent.title } : null,
    build: b ?? null, questions, decisions, relations: rels, steps, stepsAttempt: last?.attempt ?? null, // the builder's list, from its latest run
    subIssues: subs.map((s) => ({ ...s, identifier: identifier(a.key, s.number), build: builds.find((x) => x.issueId === s.id) ?? null })),
  }
}

/**
 * The top-level graph: every sub-issue of every project in an app (superseded projects aside), with its issue and
 * project, the dependencies, and the pairs of open sub-issues that share a file (drawn as dashed links).
 */
export async function appGraph(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) return null
  const projects = (await db.select().from(project).where(eq(project.appId, appId)).orderBy(asc(project.createdAt))).filter((p) => p.status !== 'superseded')
  const graphs = (await Promise.all(projects.map((p) => projectGraph(p.id)))).filter(Boolean) as Graph[]
  const subIssues = graphs.flatMap((g) => g.subIssues)
  return {
    app: { id: a.id, name: a.name, key: a.key, defaultBranch: a.defaultBranch },
    projects: graphs.map((g) => ({ ...g.project, pr: g.pr })),
    issues: graphs.flatMap((g) => g.issues), subIssues, conflicts: fileConflicts(subIssues), files: sharedFiles(subIssues),
  }
}
