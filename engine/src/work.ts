/**
 * Steps and workflows, stored (LOG.md, 2026-10-29). The rules are in steps.ts; this keeps the rows: workflows and
 * which app, project or task uses one, the work done on each step of an idea, a task or a project, a task's brief
 * approval, and an idea converted into a task or a project, taking its steps with it.
 *
 * A task's steps are read from where they live: the brief is the issue's own, the prototype is the prototype table,
 * "starts as an idea" is the idea it came from, and the rest are step_work rows.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, idea, issue, project, prototype, stepWork, workflow } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { getIssue, insertIssues, PlanError } from './issues.js'
import { blocking, CAN, normalize, resolve, rows, step, STEPS, validOrder, type On, type Resolved, type Row, type StepKey, type StepState, type Workflow, type WorkflowStep } from './steps.js'

export type Subject = { ideaId: string } | { issueId: string } | { projectId: string }
const onOf = (s: Subject): On => ('ideaId' in s ? 'idea' : 'issueId' in s ? 'task' : 'project')
const subjectCol = (s: Subject) => ('ideaId' in s ? eq(stepWork.ideaId, s.ideaId) : 'issueId' in s ? eq(stepWork.issueId, s.issueId) : eq(stepWork.projectId, s.projectId))

type WorkflowRow = typeof workflow.$inferSelect
const asWorkflow = (w: WorkflowRow | undefined | null): Workflow | null => (w ? normalize({ id: w.id, name: w.name, steps: w.steps as WorkflowStep[], ordered: w.ordered }) : null)
const KEYS = STEPS.map((s) => s.key)

async function appOf(tx: Tx | typeof db, appId: string) {
  const [a] = await tx.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  return a
}

// ── Workflows ────────────────────────────────────────────────────────────────

export async function listWorkflows(appId: string) {
  const a = await appOf(db, appId)
  const rows = await db.select().from(workflow).where(eq(workflow.appId, appId)).orderBy(workflow.createdAt)
  const projects = await db.select({ id: project.id, workflowId: project.workflowId }).from(project).where(eq(project.appId, appId))
  const issues = await db.select({ id: issue.id, workflowId: issue.workflowId }).from(issue).where(and(eq(issue.appId, appId), isNull(issue.parentId)))
  return rows.map((w) => ({
    ...asWorkflow(w)!, appDefault: a.workflowId === w.id,
    projects: projects.filter((p) => p.workflowId === w.id).length, tasks: issues.filter((i) => i.workflowId === w.id).length,
  }))
}

/** Make or change a workflow. Its steps are checked against the fixed rules; the brief and the idea are always kept. */
export async function saveWorkflow(input: { id?: string; appId: string; name: string; steps: WorkflowStep[]; ordered?: boolean }, actor = 'user') {
  if (!input.name?.trim()) throw new PlanError('a workflow needs a name')
  const unknown = (input.steps ?? []).find((s) => !KEYS.includes(s.key))
  if (unknown) throw new PlanError(`no step "${unknown.key}"; the steps are ${KEYS.join(', ')}`)
  if (!validOrder(input.steps ?? [])) throw new PlanError('that order breaks the rules: the idea first, research before the brief, the checks after it')
  const w = normalize({ id: input.id ?? newId('workflow'), name: input.name.trim(), steps: input.steps ?? [], ordered: !!input.ordered })
  return db.transaction(async (tx) => {
    const a = await appOf(tx, input.appId)
    if (input.id) {
      const [old] = await tx.select().from(workflow).where(eq(workflow.id, input.id))
      if (!old || old.appId !== a.id) throw new PlanError(`no workflow ${input.id} in this app`)
      await tx.update(workflow).set({ name: w.name, steps: w.steps, ordered: w.ordered, updatedAt: new Date() }).where(eq(workflow.id, w.id))
    } else {
      await tx.insert(workflow).values({ id: w.id, appId: a.id, name: w.name, steps: w.steps, ordered: w.ordered })
    }
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type: 'workflow.saved', payload: { id: w.id, name: w.name } })
    return w
  })
}

/** Attach a workflow to the app (its default), a project or a task; null takes it off, so it inherits again. */
export async function useWorkflow(target: { appId: string } | { projectId: string } | { issueId: string }, workflowId: string | null, actor = 'user') {
  return db.transaction(async (tx) => {
    const appId = 'appId' in target ? target.appId
      : 'projectId' in target ? (await tx.select().from(project).where(eq(project.id, target.projectId)))[0]?.appId
      : (await tx.select().from(issue).where(eq(issue.id, target.issueId)))[0]?.appId
    if (!appId) throw new PlanError('no such app, project or task')
    const a = await appOf(tx, appId)
    if (workflowId) {
      const [w] = await tx.select().from(workflow).where(eq(workflow.id, workflowId))
      if (!w || w.appId !== a.id) throw new PlanError(`no workflow ${workflowId} in this app`)
    }
    if ('appId' in target) await tx.update(app).set({ workflowId }).where(eq(app.id, a.id))
    else if ('projectId' in target) await tx.update(project).set({ workflowId, updatedAt: new Date() }).where(eq(project.id, target.projectId))
    else await tx.update(issue).set({ workflowId, updatedAt: new Date() }).where(eq(issue.id, target.issueId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type: 'workflow.used', payload: { ...target, workflowId } })
    return { ok: true }
  })
}

/** The workflow in force on a task (its own, its project's, the app's) or a project (its own, the app's). */
export async function workflowFor(tx: Tx | typeof db, s: { issueId: string } | { projectId: string }): Promise<Resolved> {
  const byId = async (id: string | null | undefined) => (id ? asWorkflow((await tx.select().from(workflow).where(eq(workflow.id, id)))[0]) : null)
  if ('issueId' in s) {
    const i = await getIssue(tx, s.issueId)
    const p = i.projectId ? (await tx.select().from(project).where(eq(project.id, i.projectId)))[0] : null
    return resolve(await byId(i.workflowId), await byId(p?.workflowId), await byId((await appOf(tx, i.appId)).workflowId))
  }
  const [p] = await tx.select().from(project).where(eq(project.id, s.projectId))
  if (!p) throw new PlanError(`no project ${s.projectId}`)
  const r = resolve(null, await byId(p.workflowId), await byId((await appOf(tx, p.appId)).workflowId))
  return r.from === 'project' ? { ...r, from: 'task' } : r // a project's own workflow is "its own"
}

// ── Steps ────────────────────────────────────────────────────────────────────

/** What each step on one idea, task or project has so far. */
async function statesOf(tx: Tx | typeof db, s: Subject): Promise<{ states: StepState[]; fromIdea: { id: string; number: number; title: string } | null }> {
  const work = await tx.select().from(stepWork).where(subjectCol(s))
  const states: StepState[] = work.map((w) => ({ key: w.key as StepKey, status: w.status as StepState['status'], detail: w.detail ?? undefined }))
  const set = (st: StepState) => { const i = states.findIndex((x) => x.key === st.key); if (i >= 0) states[i] = { ...states[i], ...st, status: states[i].status === 'done' ? 'done' : st.status }; else states.push(st) }
  const protos = await tx.select().from(prototype).where(and(
    'ideaId' in s ? eq(prototype.ideaId, s.ideaId) : 'issueId' in s ? eq(prototype.issueId, s.issueId) : eq(prototype.projectId, s.projectId),
    inArray(prototype.status, ['running', 'stopped']))).orderBy(desc(prototype.createdAt))
  if (protos.length) set({ key: 'prototype', status: 'started', detail: `${protos[0].title}: ${protos[0].status}` })
  let ideaId: string | null = null
  if ('issueId' in s) {
    const i = await getIssue(tx, s.issueId)
    if (i.brief?.trim()) {
      const st: StepState = { key: 'brief', status: 'done', detail: i.briefApprovedBy ? undefined : 'waiting for approval' }
      if (i.briefApprovedBy) st.approved = { by: i.briefApprovedBy, at: (i.briefApprovedAt ?? i.createdAt).toISOString() }
      states.splice(0, states.length, ...states.filter((x) => x.key !== 'brief'), st)
    }
    ideaId = i.ideaId
  } else if ('projectId' in s) {
    ideaId = (await tx.select().from(project).where(eq(project.id, s.projectId)))[0]?.ideaId ?? null
  }
  const [from] = ideaId ? await tx.select().from(idea).where(eq(idea.id, ideaId)) : []
  if (from) set({ key: 'idea', status: 'done', detail: `#${from.number} ${from.title}` })
  return { states, fromIdea: from ? { id: from.id, number: from.number, title: from.title } : null }
}

export interface StepsView { on: On; resolved: Resolved; states: StepState[]; rows: Row[]; blocking: StepKey[]; fromIdea: { id: string; number: number; title: string } | null }

/** The steps on one idea, task or project: the workflow in force, what each has, and what still stops a task completing. */
export async function stepsOf(s: Subject, tx: Tx | typeof db = db): Promise<StepsView> {
  const on = onOf(s)
  const resolved = on === 'idea' ? { workflow: null, from: null } : await workflowFor(tx, s as { issueId: string } | { projectId: string })
  const { states, fromIdea } = await statesOf(tx, s)
  return { on, resolved, states, rows: rows(on, states, resolved.workflow), blocking: on === 'task' ? blocking(states, resolved.workflow) : [], fromIdea }
}

async function subjectApp(tx: Tx, s: Subject) {
  const appId = 'ideaId' in s ? (await tx.select().from(idea).where(eq(idea.id, s.ideaId)))[0]?.appId
    : 'issueId' in s ? (await tx.select().from(issue).where(eq(issue.id, s.issueId)))[0]?.appId
    : (await tx.select().from(project).where(eq(project.id, s.projectId)))[0]?.appId
  if (!appId) throw new PlanError('no such idea, task or project')
  return appOf(tx, appId)
}

/**
 * Record work on a step: research notes, a rough draft, an ADR, the mockups' story ids. A task's brief is written
 * on the issue itself (updateIssue), and "starts as an idea" by converting one, so neither is set here.
 */
export async function setStep(s: Subject, key: StepKey, input: { status?: 'started' | 'done' | 'none'; detail?: string | null; body?: string | null; refs?: string[] }, actor = 'user') {
  const on = onOf(s)
  if (!KEYS.includes(key)) throw new PlanError(`no step "${key}"; the steps are ${KEYS.join(', ')}`)
  if (!CAN[on].includes(key)) throw new PlanError(`${step(key).label} isn't done on ${on === 'idea' ? 'an idea' : `a ${on}`}`)
  if (key === 'idea') throw new PlanError('a task starts as an idea by converting the idea')
  if (key === 'brief' && on === 'task') throw new PlanError('a task\'s brief is written on the task itself')
  return db.transaction(async (tx) => {
    const a = await subjectApp(tx, s)
    if (input.status !== 'none') await guardOrder(tx, s, key)
    const [old] = await tx.select().from(stepWork).where(and(subjectCol(s), eq(stepWork.key, key)))
    const values = {
      status: input.status ?? old?.status ?? 'started', detail: input.detail !== undefined ? input.detail : old?.detail ?? null,
      body: input.body !== undefined ? input.body : old?.body ?? null, refs: input.refs ?? (old?.refs as string[] | undefined) ?? [], updatedBy: actor, updatedAt: new Date(),
    }
    const [row] = old
      ? await tx.update(stepWork).set(values).where(eq(stepWork.id, old.id)).returning()
      : await tx.insert(stepWork).values({ id: newId('stepWork'), appId: a.id, ...('ideaId' in s ? { ideaId: s.ideaId } : 'issueId' in s ? { issueId: s.issueId } : { projectId: s.projectId }), key, ...values }).returning()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type: 'step.updated', ...('ideaId' in s ? { ideaId: s.ideaId } : 'issueId' in s ? { issueId: s.issueId } : { projectId: s.projectId }), payload: { key, status: row.status } })
    return row
  })
}

export async function getStep(s: Subject, key: StepKey) {
  const [row] = await db.select().from(stepWork).where(and(subjectCol(s), eq(stepWork.key, key)))
  return row ?? null
}

/** Throws when an enforced order says this step waits for a required one before it. */
async function guardOrder(tx: Tx | typeof db, s: Subject, key: StepKey) {
  if ('ideaId' in s) return // an idea has no workflow
  const waits = (await stepsOf(s, tx)).rows.find((r) => r.key === key)?.waitingOn
  if (waits) throw new PlanError(`${step(key).label} waits for ${step(waits).label} first: the workflow's order is enforced`)
}

/** A person approves a task's brief; a change to the brief afterwards asks for approval again (see updateIssue). */
export async function approveBrief(issueId: string, by: string, approve = true) {
  return db.transaction(async (tx) => {
    const i = await getIssue(tx, issueId)
    if (i.parentId || i.kind !== 'code') throw new PlanError('only a task (a top-level code issue) has a brief to approve')
    if (approve && !i.brief?.trim()) throw new PlanError('write the brief before approving it')
    if (approve) await guardOrder(tx, { issueId }, 'brief')
    const [row] = await tx.update(issue).set({ briefApprovedBy: approve ? by : null, briefApprovedAt: approve ? new Date() : null, updatedAt: new Date() }).where(eq(issue.id, issueId)).returning()
    const a = await appOf(tx, i.appId)
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, issueId, actor: by, type: approve ? 'brief.approved' : 'brief.unapproved', payload: { title: i.title } })
    return row
  })
}

/** Throws when a task can't be completed yet: a required step isn't finished (its brief approved, always among them). */
export async function guardComplete(tx: Tx | typeof db, issueId: string) {
  const i = await getIssue(tx, issueId)
  if (i.parentId || i.kind !== 'code') return
  const v = await stepsOf({ issueId }, tx)
  if (v.blocking.length) throw new PlanError(`it can't be completed yet: ${v.blocking.map((k) => (k === 'brief' ? 'the brief isn\'t approved' : `${step(k).label} isn't done`)).join('; ')}`)
}

/** Throws when a workflow in force wants tasks to start as ideas: make an idea and convert it instead. */
export async function guardDirect(tx: Tx | typeof db, appId: string, projectId?: string | null) {
  const a = await appOf(tx, appId)
  const p = projectId ? (await tx.select().from(project).where(eq(project.id, projectId)))[0] : null
  const id = p?.workflowId ?? a.workflowId
  const w = id ? asWorkflow((await tx.select().from(workflow).where(eq(workflow.id, id)))[0]) : null
  if (w?.steps.find((s) => s.key === 'idea')?.required) throw new PlanError(`the workflow "${w.name}" starts every task as an idea: capture the idea, then convert it`)
}

// ── Converting an idea ───────────────────────────────────────────────────────

/**
 * An idea becomes a task or a project, and its steps come with it: research, mockups and the rest move over, its
 * prototypes point at the new thing, and its rough draft becomes the task's brief, unapproved.
 */
export async function convertIdea(ideaId: string, as: 'task' | 'project', opts: { title?: string; projectId?: string; why?: string } = {}, actor = 'user') {
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(idea).where(eq(idea.id, ideaId))
    if (!i) throw new PlanError(`no idea ${ideaId}`)
    const a = await appOf(tx, i.appId)
    const work = await tx.select().from(stepWork).where(eq(stepWork.ideaId, ideaId))
    const draft = work.find((w) => w.key === 'brief')
    const title = opts.title?.trim() || i.title
    let target: { issueId: string } | { projectId: string }
    if (as === 'task') {
      if (opts.projectId) {
        const [p] = await tx.select().from(project).where(eq(project.id, opts.projectId))
        if (!p || p.appId !== a.id) throw new PlanError(`no project ${opts.projectId} in this app`)
      }
      const [row] = await insertIssues(tx, a.id, [{ kind: 'code', projectId: opts.projectId ?? null, ideaId: i.id, title, description: i.body ?? undefined, brief: draft?.body ?? undefined, delegate: 'planner', source: 'idea' }], actor)
      target = { issueId: row.id }
    } else {
      const id = newId('project')
      await tx.insert(project).values({ id, appId: a.id, ideaId: i.id, name: title, content: i.body ?? null, integrationBranch: `project/${id}` })
      await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: id, actor, type: 'project.created', payload: { name: title, issues: 0, subIssues: 0, fromIdea: i.number } })
      target = { projectId: id }
    }
    const can = CAN[as === 'task' ? 'task' : 'project']
    for (const w of work) {
      if (w.key === 'brief' || !can.includes(w.key as StepKey)) continue // the draft became the brief; a project has none
      await tx.update(stepWork).set({ ideaId: null, ...target, updatedAt: new Date() }).where(eq(stepWork.id, w.id))
    }
    if (draft && as === 'task') await tx.delete(stepWork).where(eq(stepWork.id, draft.id))
    await tx.update(prototype).set({ ideaId: null, ...target, updatedAt: new Date() }).where(eq(prototype.ideaId, ideaId))
    await tx.update(idea).set({ lane: 'build', updatedAt: new Date() }).where(eq(idea.id, ideaId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, ideaId, ...target, actor, type: 'idea.converted', payload: { as, title, ...(opts.why ? { why: opts.why } : {}) } })
    return { as, ...target }
  })
}

// ── Plan's page ──────────────────────────────────────────────────────────────

const OPEN_PROJECTS = ['drafting', 'proposed', 'approved', 'running', 'paused']
const OPEN_STATES = ['triage', 'backlog', 'todo', 'in_progress', 'in_review']

/** Plan's page: open projects with their tasks, tasks in no project, open to-dos, and the workflows. */
export async function planView(appId: string) {
  const a = await appOf(db, appId)
  const projects = (await db.select().from(project).where(eq(project.appId, appId)).orderBy(project.sortOrder, project.createdAt)).filter((p) => OPEN_PROJECTS.includes(p.status))
  const tops = await db.select().from(issue).where(and(eq(issue.appId, appId), isNull(issue.parentId))).orderBy(issue.sortOrder, issue.number)
  const wfs = await db.select().from(workflow).where(eq(workflow.appId, appId))
  const name = (id: string | null) => wfs.find((w) => w.id === id)?.name
  const task = async (i: typeof tops[number]) => {
    const v = await stepsOf({ issueId: i.id })
    return { id: i.id, identifier: `${a.key}-${i.number}`, title: i.title, state: i.state, workflow: name(i.workflowId), steps: v.states, keys: v.rows.map((r) => r.key) }
  }
  const code = tops.filter((i) => i.kind === 'code' && OPEN_STATES.includes(i.state))
  return {
    projects: await Promise.all(projects.map(async (p) => {
      const v = await stepsOf({ projectId: p.id })
      return { id: p.id, name: p.name, status: p.status, workflow: name(p.workflowId), steps: v.states.filter((s) => s.key !== 'idea'), keys: v.rows.map((r) => r.key).filter((k) => k !== 'idea'),
        tasks: await Promise.all(code.filter((i) => i.projectId === p.id).map(task)) }
    })),
    loose: await Promise.all(code.filter((i) => !i.projectId).map(task)),
    todosOpen: tops.filter((i) => i.kind === 'todo' && OPEN_STATES.includes(i.state)).length,
    workflows: wfs.map(asWorkflow), appWorkflow: name(a.workflowId),
  }
}
