/**
 * A task's acceptance criteria: how we will know it is done, as statements a person can check (Sandy, 2026-11-13:
 * "we need to add acceptance criteria to the brief, and this is something that the agent should build as it's
 * building the prototype … part of what you approve before you actually start building is whether or not your
 * acceptance criteria is sufficient").
 *
 * They are part of the brief, kept as a list of their own (`issue.acceptance`) so each can be added, sharpened and
 * checked off one at a time while the steps go by: the conductor writes the first ones from what was asked, the
 * prototype's agent works to them, adds the ones building it turns up (edge cases, guarantees) and records for each
 * whether the prototype showed it and where. The person approves them with the brief, and a change after that asks
 * for the approval again, the same as a change to the brief's text. The planner then covers each with a sub-task.
 *
 * After the acceptance criteria on a user story (a short checkable statement, and how it is verified), and Linear's
 * sub-issue checklists for the one-line-each form.
 */
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { getIssue, PlanError } from './issues.js'

export interface Criterion {
  id: string
  /** What must be true, as one statement a person can check. */
  text: string
  /** How we will know: the page, the scenario, the test or the script that shows it. */
  check?: string
  /** What the prototype showed: true, it works there (evidence says where to see it); false, it does not yet. Absent: not tried. */
  shown?: boolean
  evidence?: string
  by: string
  at: string
}
export interface AcceptanceChange {
  add?: { text: string; check?: string; shown?: boolean; evidence?: string }[]
  update?: { id: string; text?: string; check?: string | null; shown?: boolean | null; evidence?: string | null }[]
  remove?: string[]
}

const MAX = 60
const line = (s: unknown, n = 600) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
export const acceptanceOf = (i: { acceptance?: unknown }) => (Array.isArray(i.acceptance) ? i.acceptance : []) as Criterion[]

/** The change applied to a list: pure, so it can be tested without a database. Says whether what the person approves changed. */
export function applyAcceptance(list: Criterion[], c: AcceptanceChange, by: string, now = new Date()): { list: Criterion[]; changed: boolean } {
  let out = list.map((x) => ({ ...x }))
  let changed = false // only what is approved counts: the statement and how it is checked, not what the prototype showed
  for (const id of c.remove ?? []) {
    if (!out.some((x) => x.id === id)) throw new PlanError(`no acceptance criterion ${id}`)
    out = out.filter((x) => x.id !== id); changed = true
  }
  for (const u of c.update ?? []) {
    const x = out.find((y) => y.id === u.id)
    if (!x) throw new PlanError(`no acceptance criterion ${u.id}`)
    if (u.text !== undefined) { const t = line(u.text); if (!t) throw new PlanError('a criterion needs its statement; remove it instead'); if (t !== x.text) { x.text = t; changed = true } }
    if (u.check !== undefined) { const k = line(u.check) || undefined; if (k !== x.check) { x.check = k; changed = true } }
    if (u.shown !== undefined) { if (u.shown === null) delete x.shown; else x.shown = u.shown }
    if (u.evidence !== undefined) { const e = line(u.evidence, 1000); if (e) x.evidence = e; else delete x.evidence }
    x.by = by; x.at = now.toISOString()
  }
  for (const a of c.add ?? []) {
    const text = line(a.text)
    if (!text) throw new PlanError('a criterion needs its statement')
    if (out.some((x) => x.text.toLowerCase() === text.toLowerCase())) continue // said already
    out.push({ id: newId('run').replace(/^run_/, 'ac_'), text, ...(line(a.check) ? { check: line(a.check) } : {}), ...(a.shown !== undefined ? { shown: a.shown } : {}), ...(line(a.evidence, 1000) ? { evidence: line(a.evidence, 1000) } : {}), by, at: now.toISOString() })
    changed = true
  }
  if (out.length > MAX) throw new PlanError(`${MAX} acceptance criteria at most: merge the ones that say the same thing`)
  return { list: out, changed }
}

/** Add, change or remove a task's acceptance criteria. Changing what is approved (a statement, how it is checked) takes the brief's approval back. */
export async function setAcceptance(issueId: string, change: AcceptanceChange, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getIssue(tx, issueId)
    if (i.parentId || i.kind !== 'code') throw new PlanError('only a top-level code task has acceptance criteria')
    const { list, changed } = applyAcceptance(acceptanceOf(i), change, actor)
    const reopened = changed && !!i.briefApprovedBy
    await tx.update(issue).set({ acceptance: list, updatedAt: new Date(), ...(reopened ? { briefApprovedBy: null, briefApprovedAt: null } : {}) }).where(eq(issue.id, issueId))
    const [a] = await tx.select().from(app).where(eq(app.id, i.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, issueId, actor, type: 'issue.updated', payload: { number: i.number, changed: ['acceptance'], criteria: list.length } })
    if (reopened) await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, issueId, actor, type: 'brief.unapproved', payload: { title: i.title, why: 'its acceptance criteria changed' } })
    return { acceptance: list, ...(reopened ? { note: 'The brief was approved; its acceptance criteria changed, so it asks for the person\'s approval again.' } : {}) }
  })
}

/** The criteria as the lines an agent is given: each with its id, how it is checked, and what the prototype showed. */
export function acceptanceLines(list: Criterion[]): string {
  return list.map((c) => `- [${c.id}] ${c.text}${c.check ? ` (how we will know: ${c.check})` : ''}${c.shown === true ? ` · shown in the prototype${c.evidence ? `: ${c.evidence}` : ''}` : c.shown === false ? ` · NOT shown in the prototype${c.evidence ? `: ${c.evidence}` : ''}` : ''}`).join('\n')
}
