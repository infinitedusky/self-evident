/**
 * A project's backlog: everything the project has to cover, so nothing has to be remembered by a person (Sandy,
 * 2026-10-23). Linear's way: an issue in the project's Backlog state. It comes from a person, the agent, an idea, the
 * planner (what it noticed but left out of an issue) or a builder (the same, from a sub-issue that landed). Every one
 * leaves the backlog one of three ways: it becomes work (Todo, at the end of the project; or a to-do, work outside the
 * code), it is a duplicate of an issue that already covers it, or it is canceled with a reason. Nothing disappears
 * silently, and a project lands only when nothing is left in its backlog (the runner checks).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, idea, issue, issueRelation, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { getIssue, identifier, insertIssues, nextSort, PlanError, relate, setState, type Source } from './issues.js'

export interface NewItem { text: string; body?: string; source?: Source; sourceRef?: Record<string, unknown>; ideaId?: string }

const CLOSED = ['landed', 'stopped', 'superseded']

async function openProject(tx: Tx | typeof db, projectId: string) {
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p) throw new PlanError(`no project ${projectId}`)
  if (CLOSED.includes(p.status)) throw new PlanError(`project is ${p.status}; its backlog is closed`)
  return p
}

async function backlogIssue(tx: Tx, issueId: string) {
  const i = await getIssue(tx, issueId)
  if (!i.projectId || i.parentId) throw new PlanError('that is not in a project\'s backlog')
  if (!['backlog', 'triage'].includes(i.state)) throw new PlanError(`that task is ${i.state}, not in the backlog`)
  await openProject(tx, i.projectId)
  return i
}

/** The project's backlog: what is open, and what left it without being built (a duplicate, or canceled with why). */
export const listBacklog = (projectId: string) => db.select().from(issue).where(and(eq(issue.projectId, projectId), isNull(issue.parentId), inArray(issue.state, ['triage', 'backlog', 'duplicate', 'canceled'])))

/** Add to a project's backlog. Blank lines are skipped; one the backlog already has open is not added twice. */
export async function addItems(projectId: string, items: NewItem[], actor = 'user', outer?: Tx) {
  const work = async (tx: Tx) => {
    const p = await openProject(tx, projectId)
    const open = new Set((await tx.select({ title: issue.title }).from(issue).where(and(eq(issue.projectId, projectId), eq(issue.state, 'backlog')))).map((r) => r.title.toLowerCase()))
    const fresh = items.map((i) => ({ ...i, text: i.text?.trim().replace(/\s+/g, ' ') ?? '' })).filter((i) => i.text && !open.has(i.text.toLowerCase()) && (open.add(i.text.toLowerCase()), true))
    if (!fresh.length) return []
    const start = await nextSort(tx, { projectId })
    return insertIssues(tx, p.appId, fresh.map((i, n) => ({
      kind: 'code' as const, projectId, state: 'backlog' as const, title: i.text, description: i.body, ideaId: i.ideaId ?? null,
      source: i.source ?? 'person', sourceRef: i.sourceRef ?? null, sortOrder: start + n,
    })), actor)
  }
  return outer ? work(outer) : db.transaction(work)
}

/** An idea joins a project's backlog, linked to the idea, which leaves the inbox. */
export async function addIdea(projectId: string, ideaId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const p = await openProject(tx, projectId)
    const [i] = await tx.select().from(idea).where(eq(idea.id, ideaId))
    if (!i || i.appId !== p.appId) throw new PlanError(`no idea ${ideaId} in this app`)
    const [already] = await tx.select().from(issue).where(and(eq(issue.projectId, projectId), eq(issue.ideaId, ideaId), isNull(issue.parentId)))
    if (already && !['canceled', 'duplicate'].includes(already.state)) throw new PlanError(`idea #${i.number} is already in this project`)
    const [row] = await addItems(projectId, [{ text: i.title, body: i.body ?? undefined, source: 'idea', ideaId: i.id }], actor, tx)
    if (!row) throw new PlanError(`the backlog already has "${i.title}" open`)
    if (i.lane === 'inbox') await tx.update(idea).set({ lane: 'build', updatedAt: new Date() }).where(eq(idea.id, i.id))
    return row
  })
}

/** A backlog issue becomes work: Todo, at the end of the project's order. In a running project the engine plans it when its turn comes. */
export async function promote(issueId: string, input: { title?: string; brief?: string } = {}, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await backlogIssue(tx, issueId)
    const sortOrder = await nextSort(tx, { projectId: i.projectId })
    await tx.update(issue).set({
      title: input.title?.trim() || i.title, brief: input.brief?.trim() || i.brief || [i.title, i.description].filter(Boolean).join('\n\n'),
      sortOrder, delegate: 'planner', updatedAt: new Date(),
    }).where(eq(issue.id, issueId))
    return setState(tx, await getIssue(tx, issueId), 'todo', { actor })
  })
}

/** A backlog issue is already covered by another issue of the project: it is a duplicate of that one. */
export async function markDuplicate(issueId: string, ofIssueId: string, reason?: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await backlogIssue(tx, issueId)
    const of = await getIssue(tx, ofIssueId)
    if (of.projectId !== i.projectId || of.parentId) throw new PlanError('the task that covers it must be in the same project')
    await relate(tx, i.appId, ofIssueId, issueId, 'duplicate')
    const [a] = await tx.select().from(app).where(eq(app.id, i.appId))
    return setState(tx, i, 'duplicate', { actor, reason: reason?.trim() || `covered by ${identifier(a.key, of.number)} ${of.title}` })
  })
}

/** A backlog issue is dropped; the reason is required, so the backlog says why it was not done. */
export async function dropItem(issueId: string, reason: string, actor = 'user') {
  if (!reason?.trim()) throw new PlanError('say why it is dropped')
  return db.transaction(async (tx) => setState(tx, await backlogIssue(tx, issueId), 'canceled', { actor, reason }))
}

/** A duplicate or canceled backlog issue goes back to the backlog (what covered it stays). */
export async function reopenItem(issueId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getIssue(tx, issueId)
    if (i.state === 'backlog') return i
    if (!['duplicate', 'canceled'].includes(i.state) || i.startedAt) throw new PlanError('only a backlog item that was dropped or covered goes back')
    if (i.state === 'duplicate') {
      await tx.delete(issueRelation).where(and(eq(issueRelation.relatedIssueId, issueId), eq(issueRelation.type, 'duplicate')))
      const [a] = await tx.select().from(app).where(eq(app.id, i.appId))
      await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, issueId, actor, type: 'issue.updated', payload: { identifier: identifier(a.key, i.number), changed: ['relations'], removed: 'duplicate' } })
    }
    return setState(tx, i, 'backlog', { actor })
  })
}

/**
 * A builder's "left for later": the bullet lines under a `Later:` line at the end of its summary. The builder is
 * asked to write it that way (executor.ts); anything else in the summary is ignored.
 */
export function laterFrom(summary: string | null | undefined): string[] {
  if (!summary) return []
  const lines = summary.split('\n')
  const at = lines.map((l) => /^\s*(#+\s*)?(\*\*|__)?(left for )?later:?(\*\*|__)?:?\s*$/i.test(l)).lastIndexOf(true)
  if (at < 0) return []
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/)
    if (m) out.push(m[1].replace(/^\[ \]\s*/, ''))
    else if (l.trim() && out.length) break
  }
  return out.filter((t) => !/^(none|nothing|n\/a)\.?$/i.test(t))
}
