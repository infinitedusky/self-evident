/**
 * A task on its own (Sandy, 2026-11-12: "stand alone tasks should be possible. Maybe we create a throwaway project for
 * each solo task, deleting it if the task is moved to an actual project?"). Planning, building, landing and the pull
 * request are all a project's, so a task in no project gets one of its own the first time it is planned: named after
 * the task, marked `solo`, and never listed as a project. The task still reads as in no project everywhere. Moved into
 * a real project before building starts, its questions and decisions go with it and the solo project is put away
 * (superseded: hidden everywhere, its events kept); once building has started it finishes on its own.
 */
import { and, eq, inArray, or } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, decision, issue, project, question } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'

/** The task's project, made as its own when it has none. */
export async function ensureSolo(issueId: string, actor = 'engine'): Promise<string> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    if (t.projectId) return t.projectId
    if (t.kind !== 'code' || t.parentId) throw new PlanError('only a top-level code task is planned')
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    const id = newId('project')
    await tx.insert(project).values({ id, appId: t.appId, ideaId: t.ideaId ?? null, name: t.title, content: t.description?.trim() || null, integrationBranch: `project/${id}`, workflowId: t.workflowId ?? null, solo: true })
    await tx.update(issue).set({ projectId: id, sortOrder: 0, updatedAt: new Date() }).where(or(eq(issue.id, t.id), eq(issue.parentId, t.id)))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: id, issueId: t.id, actor, type: 'project.created', payload: { name: t.title, issues: 1, subIssues: 0, solo: true } })
    return id
  })
}

/** Before a task leaves its own project: not once building has started (the branch and the pull request are that project's). */
export function guardLeavingSolo(from: typeof project.$inferSelect) {
  if (from.solo && !['drafting', 'proposed', 'approved'].includes(from.status)) throw new PlanError(`${from.name} is already being built on its own (${from.status}): it finishes there and cannot join a project now.`)
}

/** After a task has left its own project: what was asked and decided while planning goes to the new one, and the old one is put away. */
export async function foldSolo(tx: Tx, from: typeof project.$inferSelect, issueId: string, toProjectId: string | null) {
  if (!from.solo) return
  if (toProjectId) {
    const ids = [issueId, ...(await tx.select({ id: issue.id }).from(issue).where(eq(issue.parentId, issueId))).map((s) => s.id)]
    await tx.update(question).set({ projectId: toProjectId }).where(and(eq(question.projectId, from.id), inArray(question.issueId, ids)))
    await tx.update(decision).set({ projectId: toProjectId }).where(and(eq(decision.projectId, from.id), inArray(decision.issueId, ids)))
  }
  await tx.update(project).set({ status: 'superseded', updatedAt: new Date() }).where(eq(project.id, from.id))
}
