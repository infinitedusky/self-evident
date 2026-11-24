/**
 * Closing a task (Sandy, 2026-11-18: "a close button … that can only happen once the pull request has been merged and
 * everything has been checked or skipped"; then "This is about closing tasks, not projects"; and, asked what Close
 * does: "Close makes it Done").
 *
 * Until now a task was marked Done by itself the moment its pull request merged, with checks of the person's still
 * unmarked, the ones that can only be made after the merge among them. Now a merge leaves it In review, and Done is
 * the person's, by pressing Close: its pull request is merged, and every check left to a person on it is passed or
 * skipped (smoke.ts: a skip is a choice not to try it, never a pass).
 *
 * `taskWaits` says what still stands in the way, in the person's words, so the button can say why it cannot be
 * pressed. A project needs no button of its own: once it has landed and its last task is closed, it is closed
 * (`settleProject`); that is over like landed, with no new tasks and out of the open lists.
 */
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { acceptanceOf } from './acceptance.js'
import { db } from './db/client.js'
import { app, issue, pr, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { changeState, getIssue, PlanError } from './issues.js'
import { leftTo } from './probe-list.js'
import { releaseChecks, smokeChecks, type SmokeCheck } from './smoke.js'
import { styleOf } from './steps.js'
import { guardComplete, workflowFor } from './work.js'

export interface CloseFacts { state: string; pr: { number: number | null; status: string } | null; checks: (Pick<SmokeCheck, 'mark'> & { when?: SmokeCheck['when'] })[]; /** Checks of the repository's CI this app holds a build to (held.ts, `pr`) that are failing on the pull request. */ ci?: string[]; /** Release checks nobody has said are done at deploy (smoke.ts, releaseChecks). */ release?: number }
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What stands between a task and being closed; empty when it can be. Pure. */
export function taskWaits(f: CloseFacts): string[] {
  if (f.state === 'done') return ['It is closed already.']
  if (f.state === 'canceled' || f.state === 'duplicate') return ['It was not built.']
  const waits: string[] = []
  if (f.state !== 'in_review') waits.push('It is not built yet.')
  if (!f.pr) waits.push('It has no pull request.')
  else if (f.pr.status !== 'merged') waits.push(`Pull request ${f.pr.number ? `#${f.pr.number}` : '(not opened)'} is ${f.pr.status === 'closed' ? 'closed without being merged' : 'not merged'}.`)
  for (const name of f.ci ?? []) waits.push(`The pull request's check "${name}" is failing.`)
  const todo = f.checks.filter((c) => c.mark === 'todo' && c.when !== 'nightly').length, failed = f.checks.filter((c) => c.mark === 'fail').length
  if (todo) waits.push(`${n(todo, 'check of yours is', 'checks of yours are')} not passed or skipped.`)
  if (failed) waits.push(`${n(failed, 'check', 'checks')} failed by hand.`)
  if (f.release) waits.push(`${n(f.release, 'release check is', 'release checks are')} owed at deploy and not said done.`)
  return waits
}

/** The CI checks this app holds a build to (held.ts: left to the pull request, and blocking) that the pull request's last read from GitHub shows failing. Pure. */
export function ciFailing(setup: unknown, signals: unknown): string[] {
  const failing = (((signals ?? {}) as { failing?: string[] }).failing ?? []).map((x) => x.toLowerCase())
  return leftTo(setup, 'pr').filter((p) => p.blocks && failing.includes(p.runs.toLowerCase())).map((p) => p.runs)
}

async function facts(issueId: string) {
  const t = await getIssue(db, issueId)
  if (t.parentId || t.kind !== 'code') throw new PlanError('a task is closed, not a sub-task or a to-do')
  const prs = t.projectId ? await db.select().from(pr).where(eq(pr.projectId, t.projectId)) : []
  const pull = prs.find((x) => x.issueId === t.id) ?? prs.find((x) => !x.issueId) ?? null // its own when each task has one, else its project's
  const staged = styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist'
  const [a] = await db.select({ setup: app.setup }).from(app).where(eq(app.id, t.appId))
  return { t, f: { state: t.state, pr: pull ? { number: pull.number, status: pull.status } : null, checks: smokeChecks(acceptanceOf(t), null, staged), ci: pull ? ciFailing(a?.setup, pull.signals) : [], release: releaseChecks(acceptanceOf(t)).filter((x) => x.done !== true).length } satisfies CloseFacts }
}

/** What a task still waits on before it can be closed, from rows already read (Build's list: one lookup a task). */
export async function waitsOf(t: typeof issue.$inferSelect, pull: { number: number | null; status: string; signals?: unknown } | null, setup?: unknown): Promise<string[]> {
  const staged = styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist'
  return taskWaits({ state: t.state, pr: pull, checks: smokeChecks(acceptanceOf(t), null, staged), ci: pull ? ciFailing(setup, pull.signals) : [], release: releaseChecks(acceptanceOf(t)).filter((x) => x.done !== true).length })
}

/** Whether a task can be closed now, and if not, what it waits on. */
export async function closeView(issueId: string): Promise<{ can: boolean; waits: string[] }> {
  const waits = taskWaits((await facts(issueId)).f)
  return { can: !waits.length, waits }
}

/** Close a task: it is Done. Its project is closed with it when it was the last. */
export async function closeTask(issueId: string, by = 'user') {
  const { t, f } = await facts(issueId)
  const waits = taskWaits(f)
  if (waits.length) throw new PlanError(`this task cannot be closed yet: ${waits.join(' ')}`)
  await guardComplete(db, t.id)
  const row = await changeState(t.id, 'done', { actor: by })
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'task.closed', payload: { pr: f.pr?.number ?? null, skipped: f.checks.filter((c) => c.mark === 'skip').length } }))
  const closed = t.projectId ? await settleProject(t.projectId, by) : false
  void import('./hooks.js').then((h) => h.afterwards(a.id, 'task-closed', { BRANCH: t.branch ?? '' }, { issueId: t.id })) // the app's own tidying, if it hooked any (hooks.ts)
  return { id: row.id, state: 'done' as const, projectClosed: closed }
}

/** A landed project whose tasks are all closed is closed. True when this call closed it. */
export async function settleProject(projectId: string, by = 'engine'): Promise<boolean> {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p || p.status !== 'landed') return false
  const tasks = await db.select({ state: issue.state }).from(issue).where(and(eq(issue.projectId, projectId), isNull(issue.parentId), eq(issue.kind, 'code'), notInArray(issue.state, ['canceled', 'duplicate', 'backlog', 'triage'])))
  if (!tasks.length || tasks.some((t) => t.state !== 'done')) return false
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  await db.transaction(async (tx) => {
    await tx.update(project).set({ status: 'closed', updatedAt: new Date() }).where(eq(project.id, p.id))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: p.id, actor: by, type: 'project.closed', payload: { tasks: tasks.length } })
  })
  return true
}

/**
 * Once, for what was marked Done by a merge before 2026-11-18: a task that is Done, in a project still running, with
 * checks of the person's not marked, goes back to In review, where it can be closed. Nothing else is touched: a
 * project that has landed or stopped keeps its tasks as they are. Safe to run at every start; it finds nothing after
 * the first, since a task cannot be closed with a check unmarked.
 */
export async function reopenUnclosed(): Promise<string[]> {
  const running = (await db.select({ id: project.id }).from(project).where(inArray(project.status, ['running', 'paused']))).map((p) => p.id)
  if (!running.length) return []
  const done = await db.select().from(issue).where(and(inArray(issue.projectId, running), isNull(issue.parentId), eq(issue.kind, 'code'), eq(issue.state, 'done')))
  const back: string[] = []
  for (const t of done) {
    const staged = styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist'
    if (staged || !smokeChecks(acceptanceOf(t), null, false).some((c) => c.mark === 'todo')) continue // only what a check after the build left to a person
    await changeState(t.id, 'in_review', { actor: 'engine', reason: undefined })
    back.push(t.id)
  }
  return back
}
