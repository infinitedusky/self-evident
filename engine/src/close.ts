/**
 * Closing a project (Sandy, 2026-11-18: "a close button on projects that can only happen once the pull request has
 * been merged and everything has been checked or skipped"). The engine calls a project landed by itself, when its
 * last sub-task is in: that is before anyone has merged anything, and before the checks that can only be made after
 * the merge. Closed is the person's, and last: every pull request of the project is merged, and every check left to
 * a person on its tasks is passed or skipped (smoke.ts: a skip is a choice not to try it, never a pass).
 *
 * `closeWaits` says what still stands in the way, in the person's words, so the button can say why it cannot be
 * pressed. A closed project is over like a landed one: no new tasks, no planning, out of the open lists.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { acceptanceOf } from './acceptance.js'
import { db } from './db/client.js'
import { app, issue, pr, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { identifier, PlanError } from './issues.js'
import { smokeChecks, type SmokeCheck } from './smoke.js'
import { styleOf } from './steps.js'
import { workflowFor } from './work.js'

export interface CloseFacts { status: string; prs: { number: number | null; status: string }[]; tasks: { identifier: string; checks: Pick<SmokeCheck, 'mark'>[] }[] }
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What stands between a project and being closed; empty when it can be. Pure. */
export function closeWaits(f: CloseFacts): string[] {
  if (f.status === 'closed') return ['It is closed already.']
  if (f.status === 'stopped' || f.status === 'superseded') return [`It was ${f.status}, not finished.`]
  const waits: string[] = []
  if (f.status !== 'landed') waits.push('It is not built yet.')
  if (!f.prs.length) waits.push('It has no pull request.')
  for (const p of f.prs) if (p.status !== 'merged') waits.push(`Pull request ${p.number ? `#${p.number}` : '(not opened)'} is ${p.status === 'closed' ? 'closed without being merged' : 'not merged'}.`)
  for (const t of f.tasks) {
    const todo = t.checks.filter((c) => c.mark === 'todo').length, failed = t.checks.filter((c) => c.mark === 'fail').length
    if (todo) waits.push(`${t.identifier}: ${n(todo, 'check of yours is', 'checks of yours are')} not passed or skipped.`)
    if (failed) waits.push(`${t.identifier}: ${n(failed, 'check', 'checks')} failed by hand.`)
  }
  return waits
}

async function facts(projectId: string) {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p) throw new PlanError(`no project ${projectId}`)
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  const prs = await db.select({ number: pr.number, status: pr.status }).from(pr).where(eq(pr.projectId, projectId))
  const tasks = (await db.select().from(issue).where(and(eq(issue.projectId, projectId), isNull(issue.parentId), eq(issue.kind, 'code')))).filter((t) => t.state !== 'canceled' && t.state !== 'duplicate')
  const f: CloseFacts = { status: p.status, prs, tasks: [] }
  for (const t of tasks.sort((x, y) => x.sortOrder - y.sortOrder)) {
    const staged = styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist'
    f.tasks.push({ identifier: identifier(a.key, t.number), checks: smokeChecks(acceptanceOf(t), null, staged) })
  }
  return { p, a, f }
}

/** Whether a project can be closed now, and if not, what it waits on. */
export async function closeView(projectId: string): Promise<{ can: boolean; waits: string[] }> {
  const waits = closeWaits((await facts(projectId)).f)
  return { can: !waits.length, waits }
}

export async function closeProject(projectId: string, by = 'user') {
  const { p, a, f } = await facts(projectId)
  const waits = closeWaits(f)
  if (waits.length) throw new PlanError(`this project cannot be closed yet: ${waits.join(' ')}`)
  await db.transaction(async (tx) => {
    await tx.update(project).set({ status: 'closed', updatedAt: new Date() }).where(eq(project.id, p.id))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: p.id, actor: by, type: 'project.closed', payload: { prs: f.prs.map((x) => x.number), skipped: f.tasks.reduce((k, t) => k + t.checks.filter((c) => c.mark === 'skip').length, 0) } })
  })
  return { id: p.id, status: 'closed' as const }
}
