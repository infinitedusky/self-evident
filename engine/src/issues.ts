/**
 * Issues: the one unit of work, as Linear has it. Code or a to-do; at the app's top level, in a project, or under a
 * parent (a sub-issue). Numbered once per app (HG-12). Every change of state goes through setState, which stamps the
 * times and logs `issue.state`; canceling a code issue cancels its unbuilt sub-issues. A code issue's state follows its sub-issues (rollUp), and a sub-issue's follows its
 * build (projects.ts). Tasks can live without a project and be added to one, in order (Sandy, 2026-10-27).
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, build, CLOSED_STATES, issue, issueRelation, project, STATE_TYPE, type IssueKind, type IssueState } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'

export class PlanError extends Error {}

export type Issue = typeof issue.$inferSelect
export type Source = 'person' | 'agent' | 'idea' | 'planner' | 'builder'
export interface NewIssue {
  kind?: IssueKind; title: string; description?: string | null; brief?: string | null; parentId?: string | null; projectId?: string | null
  ideaId?: string | null; cycleId?: string | null; state?: IssueState; priority?: number; estimate?: string | null; sortOrder?: number
  assignee?: string | null; delegate?: 'builder' | 'planner' | 'agent' | null; waitingOn?: string | null
  source?: Source; sourceRef?: Record<string, unknown> | null; id?: string
  workflowId?: string | null // its own workflow rules, chosen when it's made; else it inherits
}

export const identifier = (key: string, number: number) => `${key}-${number}`
export const CLOSED_PROJECTS = ['landed', 'stopped', 'superseded']

/** The app, locked for numbering: one writer hands out numbers at a time. */
export async function lockApp(tx: Tx, appId: string) {
  await tx.execute(sql`select 1 from app where id = ${appId} for update`)
  const [a] = await tx.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  return a
}

/** Insert issues in one go, numbered in order after the app's last. Logs issue.created for each. */
export async function insertIssues(tx: Tx, appId: string, rows: NewIssue[], actor: string) {
  if (!rows.length) return []
  const a = await lockApp(tx, appId)
  const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${issue.number}), 0)` }).from(issue).where(eq(issue.appId, appId))
  let n = Number(max)
  const now = new Date()
  const values = rows.map((r) => {
    const title = r.title?.trim().replace(/\s+/g, ' ')
    if (!title) throw new PlanError('a task needs a title')
    const state = r.state ?? 'todo'
    return {
      id: r.id ?? newId('issue'), appId, number: ++n, kind: r.kind ?? 'code', parentId: r.parentId ?? null, projectId: r.projectId ?? null,
      cycleId: r.cycleId ?? null, ideaId: r.ideaId ?? null, title: title.slice(0, 500), description: r.description?.trim() || null, brief: r.brief?.trim() || null,
      state, priority: r.priority ?? 0, estimate: r.estimate ?? null, sortOrder: r.sortOrder ?? 0, assignee: r.assignee ?? null, delegate: r.delegate ?? null,
      waitingOn: r.waitingOn?.trim() || null, source: r.source ?? 'person', sourceRef: r.sourceRef ?? null, createdBy: actor, workflowId: r.workflowId ?? null,
      startedAt: STATE_TYPE[state] === 'started' ? now : null, completedAt: state === 'done' ? now : null,
    }
  })
  const out = await tx.insert(issue).values(values).returning()
  for (const i of out) {
    await appendEvent(tx, { workspaceId: a.workspaceId, appId, projectId: i.projectId, issueId: i.id, actor, type: 'issue.created', payload: { identifier: identifier(a.key, i.number), number: i.number, title: i.title, kind: i.kind, state: i.state, parentId: i.parentId } })
  }
  return out
}

export async function createIssue(appId: string, input: NewIssue, actor = 'user') {
  return db.transaction(async (tx) => {
    if (input.projectId) await openProjectIn(tx, input.projectId, appId)
    if (input.parentId) await parentIn(tx, input.parentId, appId)
    if (input.projectId && input.sortOrder === undefined) input = { ...input, sortOrder: await nextSort(tx, { projectId: input.projectId, parentId: input.parentId ?? null }) }
    const [i] = await insertIssues(tx, appId, [input], actor)
    return i
  })
}

/** The next position at the end of a list of siblings: a project's top-level issues, or a parent's sub-issues. */
export async function nextSort(tx: Tx | typeof db, where: { projectId?: string | null; parentId?: string | null; appId?: string }) {
  const cond = where.parentId ? eq(issue.parentId, where.parentId) : and(isNull(issue.parentId), where.projectId ? eq(issue.projectId, where.projectId) : and(isNull(issue.projectId), eq(issue.appId, where.appId!)))
  const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${issue.sortOrder}), -1)` }).from(issue).where(cond)
  return Number(max) + 1
}

async function openProjectIn(tx: Tx, projectId: string, appId: string) {
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p || p.appId !== appId) throw new PlanError('that project is not in this app')
  if (CLOSED_PROJECTS.includes(p.status)) throw new PlanError(`project is ${p.status}; it takes no new tasks`)
  return p
}

async function parentIn(tx: Tx, parentId: string, appId: string) {
  const [p] = await tx.select().from(issue).where(eq(issue.id, parentId))
  if (!p || p.appId !== appId) throw new PlanError('that parent task is not in this app')
  if (p.parentId) throw new PlanError('sub-tasks go one level deep')
  return p
}

export async function getIssue(tx: Tx | typeof db, issueId: string) {
  const [i] = await tx.select().from(issue).where(eq(issue.id, issueId))
  if (!i) throw new PlanError(`no task ${issueId}`)
  return i
}

async function baseOf(tx: Tx | typeof db, i: Issue) {
  const [a] = await tx.select().from(app).where(eq(app.id, i.appId))
  return { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, issueId: i.id, key: a.key }
}

/** Move an issue to a state. Stamps started, completed or canceled; canceling says why (a sub-issue goes with its parent). */
export async function setState(tx: Tx, i: Issue, to: IssueState, opts: { actor?: string; reason?: string | null } = {}) {
  const actor = opts.actor ?? 'user'
  if (i.state === to) return i
  if (to === 'canceled' && !opts.reason?.trim() && !i.parentId) throw new PlanError('say why it is canceled')
  const now = new Date()
  const closing = CLOSED_STATES.includes(to)
  const [row] = await tx.update(issue).set({
    state: to, updatedAt: now,
    startedAt: STATE_TYPE[to] === 'started' ? (i.startedAt ?? now) : i.startedAt,
    completedAt: to === 'done' ? now : null, canceledAt: to === 'canceled' || to === 'duplicate' ? now : null,
    closedBy: closing ? actor : null, reason: closing ? (opts.reason?.trim() || null) : null,
  }).where(eq(issue.id, i.id)).returning()
  const base = await baseOf(tx, i)
  await appendEvent(tx, { ...base, actor, type: 'issue.state', payload: { identifier: identifier(base.key, i.number), number: i.number, title: i.title, kind: i.kind, from: i.state, to, ...(opts.reason ? { reason: opts.reason } : {}) } })
  if (to === 'canceled' && !i.parentId && i.kind === 'code') { // a to-do's checklist stays as it was, so reopening it loses nothing
    const open = await tx.select().from(issue).where(and(eq(issue.parentId, i.id), sql`${issue.state} not in ('done', 'canceled', 'duplicate')`))
    for (const s of open) await setState(tx, s, 'canceled', { actor, reason: opts.reason })
    if (open.length) await tx.update(build).set({ status: 'cancelled', heldReason: opts.reason ?? 'canceled', updatedAt: now }).where(and(inArray(build.issueId, open.map((s) => s.id)), sql`${build.status} <> 'done'`)) // and the engine stops building them
  }
  return row
}

export async function changeState(issueId: string, to: IssueState, opts: { actor?: string; reason?: string } = {}) {
  return db.transaction(async (tx) => setState(tx, await getIssue(tx, issueId), to, opts))
}

/** Change what an issue says or where it sits. Moving it into a project puts it at the end unless an order is given. */
export async function updateIssue(issueId: string, input: Partial<Pick<NewIssue, 'title' | 'description' | 'brief' | 'priority' | 'estimate' | 'assignee' | 'delegate' | 'waitingOn' | 'cycleId' | 'projectId' | 'sortOrder' | 'kind'>>, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getIssue(tx, issueId)
    if (input.title !== undefined && !input.title.trim()) throw new PlanError('a task needs a title')
    if (input.projectId && input.projectId !== i.projectId) {
      if (i.parentId) throw new PlanError('a sub-task goes where its parent goes')
      await openProjectIn(tx, input.projectId, i.appId)
    }
    const set: Partial<Issue> = {}
    for (const k of ['title', 'description', 'brief', 'priority', 'estimate', 'assignee', 'delegate', 'waitingOn', 'cycleId', 'projectId', 'sortOrder', 'kind'] as const) {
      if (input[k] === undefined) continue
      const v = input[k]
      ;(set as any)[k] = typeof v === 'string' ? (v.trim() || (k === 'title' ? v : null)) : v
    }
    if (set.brief !== undefined && set.brief !== i.brief && i.briefApprovedBy) { set.briefApprovedBy = null; set.briefApprovedAt = null } // a changed brief is approved again
    if (input.projectId !== undefined && input.projectId !== i.projectId && input.sortOrder === undefined) set.sortOrder = await nextSort(tx, { projectId: input.projectId, appId: i.appId })
    if (!Object.keys(set).length) return i
    const [row] = await tx.update(issue).set({ ...set, updatedAt: new Date() }).where(eq(issue.id, issueId)).returning()
    if (input.projectId !== undefined && !i.parentId) await tx.update(issue).set({ projectId: input.projectId ?? null }).where(eq(issue.parentId, issueId)) // sub-issues follow
    const base = await baseOf(tx, row)
    await appendEvent(tx, { ...base, actor, type: 'issue.updated', payload: { identifier: identifier(base.key, i.number), number: i.number, changed: Object.keys(set), ...(set.projectId !== undefined ? { from: i.projectId } : {}) } })
    return row
  })
}

/** Put a project's top-level issues (or a parent's sub-issues) in this order. Ids not given keep their place after. */
export async function reorder(ids: string[], actor = 'user') {
  return db.transaction(async (tx) => {
    if (!ids.length) return []
    const rows = await tx.select().from(issue).where(inArray(issue.id, ids))
    if (rows.length !== ids.length) throw new PlanError('some of those tasks do not exist')
    const scope = (r: Issue) => `${r.appId}:${r.projectId}:${r.parentId}`
    if (new Set(rows.map(scope)).size > 1) throw new PlanError('only siblings can be ordered together: one project, or one parent')
    for (const [n, id] of ids.entries()) await tx.update(issue).set({ sortOrder: n, updatedAt: new Date() }).where(eq(issue.id, id))
    const base = await baseOf(tx, rows[0])
    await appendEvent(tx, { ...base, issueId: null, actor, type: 'issue.reordered', payload: { ids } })
    return ids
  })
}

export async function relate(tx: Tx, appId: string, issueId: string, relatedIssueId: string, type: 'blocks' | 'related' | 'duplicate') {
  if (issueId === relatedIssueId) throw new PlanError('a task cannot relate to itself')
  await tx.insert(issueRelation).values({ appId, issueId, relatedIssueId, type }).onConflictDoNothing()
}

/**
 * A code issue's state follows its sub-issues: none started, it keeps its own; any started, in progress; all done,
 * in review (landed on its branch, the PR to merge); its PR merged, done (the sync says so).
 */
export async function rollUp(tx: Tx, parentId: string, actor = 'engine') {
  const p = await getIssue(tx, parentId)
  if (p.kind !== 'code' || CLOSED_STATES.includes(p.state as IssueState)) return p
  const subs = await tx.select().from(issue).where(eq(issue.parentId, parentId))
  const live = subs.filter((s) => s.state !== 'canceled')
  if (!live.length) return p
  const to: IssueState = live.every((s) => s.state === 'done') ? 'in_review' : live.some((s) => STATE_TYPE[s.state as IssueState] !== 'unstarted') ? 'in_progress' : p.state as IssueState
  return to === p.state ? p : setState(tx, p, to, { actor })
}

/** The issues of an app, newest first within each place, with their identifiers. Filters: kind, project, state, top level. */
export async function listIssues(appId: string, f: { kind?: IssueKind; projectId?: string | null; topLevel?: boolean; open?: boolean } = {}) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const where = [eq(issue.appId, appId)]
  if (f.kind) where.push(eq(issue.kind, f.kind))
  if (f.projectId) where.push(eq(issue.projectId, f.projectId))
  if (f.projectId === null) where.push(isNull(issue.projectId))
  if (f.topLevel) where.push(isNull(issue.parentId))
  if (f.open) where.push(sql`${issue.state} not in ('done', 'canceled', 'duplicate')`)
  const rows = await db.select().from(issue).where(and(...where)).orderBy(asc(issue.sortOrder), asc(issue.number))
  return rows.map((r) => ({ ...r, identifier: identifier(a.key, r.number) }))
}
