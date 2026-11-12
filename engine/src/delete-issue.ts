/**
 * Deleting a task (Sandy, 2026-11-12: "we need a way to delete a task"). For one made by mistake, a test, or a ticket
 * brought in that shouldn't have been: the task, its sub-tasks and what was written on them go, and it leaves no
 * row behind. The event log keeps one line saying it was deleted.
 *
 * Only a task with no work on it. One that an agent has run on, that has a pull request, a recorded check or a
 * prototype is refused: its record is what happened, so it is canceled (with a reason) and kept. An open
 * conversation pinned to the task is ended first, which removes its worktree.
 */
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, decision, fileClaim, issue, issueComment, issueRelation, pr, prototype, question, run, session, step, stepWork, verification } from './db/schema.js'
import { appendEvent } from './events.js'
import { identifier, PlanError, resolveIssue } from './issues.js'

type EndTalk = (sessionId: string) => Promise<unknown>

export async function deleteIssue(ref: string, actor = 'user', endTalk?: EndTalk) {
  const t = await resolveIssue(db, ref)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const name = identifier(a.key, t.number)
  const subs = await db.select().from(issue).where(eq(issue.parentId, t.id))
  const ids = [t.id, ...subs.map((s) => s.id)]
  const count = async (table: typeof run | typeof pr | typeof verification) => (await db.select({ n: sql<number>`count(*)::int` }).from(table).where(inArray(table.issueId, ids)))[0].n
  const [runs, prs, checks] = await Promise.all([count(run), count(pr), count(verification)])
  const protos = (await db.select().from(prototype).where(and(inArray(prototype.issueId, ids), ne(prototype.status, 'discarded')))).length
  const has = [runs && `${runs} agent run${runs === 1 ? '' : 's'}`, prs && `${prs} pull request${prs === 1 ? '' : 's'}`, checks && `${checks} recorded check${checks === 1 ? '' : 's'}`, protos && `${protos} prototype${protos === 1 ? '' : 's'}`].filter(Boolean)
  if (has.length) throw new PlanError(`${name} has work on it (${has.join(', ')}), so it can't be deleted: cancel it instead, and its record stays.`)

  const talks = await db.select().from(session).where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), inArray(sql`${session.subjectRef}->>'issueId'`, ids)))
  if (endTalk) for (const s of talks) await endTalk(s.id) // its worktree goes; a branch with commits is kept

  await db.transaction(async (tx) => {
    await tx.delete(issueRelation).where(or(inArray(issueRelation.issueId, ids), inArray(issueRelation.relatedIssueId, ids)))
    await tx.delete(issueComment).where(inArray(issueComment.issueId, ids))
    await tx.delete(step).where(inArray(step.issueId, ids))
    await tx.delete(fileClaim).where(inArray(fileClaim.issueId, ids))
    await tx.delete(build).where(inArray(build.issueId, ids))
    await tx.delete(stepWork).where(inArray(stepWork.issueId, ids))
    await tx.delete(decision).where(inArray(decision.issueId, ids))
    await tx.delete(question).where(inArray(question.issueId, ids))
    await tx.update(prototype).set({ issueId: null }).where(inArray(prototype.issueId, ids)) // discarded ones: kept, no longer a step of anything
    await tx.update(session).set({ issueId: null }).where(inArray(session.issueId, ids))
    if (subs.length) await tx.delete(issue).where(eq(issue.parentId, t.id))
    await tx.delete(issue).where(eq(issue.id, t.id))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: t.appId, projectId: t.projectId, actor, type: 'issue.deleted', payload: { identifier: name, title: t.title, subIssues: subs.length } })
  })
  return { deleted: name, title: t.title, subIssues: subs.length, talksEnded: endTalk ? talks.length : 0 }
}
