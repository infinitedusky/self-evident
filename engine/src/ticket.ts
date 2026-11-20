/**
 * A task's team ticket, and its name for the team (found on a client's first pull request, 2026-11-20: the task
 * linked the team's ticket in its description and had none recorded, so {ticket} fell back to our own id, and the
 * branch and the pull request's title came out with it; their CI rejects a title whose bracket is not one of their
 * ticket keys. And {title} was our working title, "…, third build: …", which is for us).
 *
 * The ticket is, first of these that there is:
 * - what a person or the task's agent set on the task (issue.team_ticket);
 * - the ticket it was imported from (source_ref.linear);
 * - a link to a ticket in its description or its brief (linear.app/…/issue/ENT-322/…);
 * - the same in the idea it came from.
 * `team_title` is the task's name as the team would say it, used for {title} in a pull request's title and a
 * branch's name; without one it is our title.
 *
 * An app can require a team ticket (`setup.ticket_required`): then our id is never used in its place. A task with
 * none is held before its branch is first cut, since a branch cannot be renamed once its pull request is open, and
 * its pull request is not opened; both say what is missing.
 */
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { idea, issue } from './db/schema.js'
import { PlanError } from './issues.js'

/** A ticket key as trackers write them: ENT-322, ALL-40841. */
export const TICKET = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/
/** The first ticket a text links to on Linear; null when it links to none. A bare "ENT-322" in prose is not taken: it may be a mention of some other ticket. */
export function ticketIn(text?: string | null): string | null {
  const m = /linear\.app\/[\w-]+\/issue\/([A-Za-z][A-Za-z0-9]{1,9}-\d{1,7})\b/.exec(text ?? '')
  return m ? m[1].toUpperCase() : null
}

export type TicketFrom = 'set' | 'import' | 'link' | 'idea'
export interface Ticketed { teamTicket?: string | null; sourceRef?: unknown; description?: string | null; brief?: string | null }
/** A task's team ticket and where it was read from; null when it has none. Pure: `ideaText` is the idea it came from, when there is one. */
export function ticketOfTask(t: Ticketed, ideaText?: string | null): { ticket: string; from: TicketFrom } | null {
  if (t.teamTicket?.trim()) return { ticket: t.teamTicket.trim(), from: 'set' }
  const imported = (t.sourceRef as { linear?: { identifier?: string } } | null | undefined)?.linear?.identifier
  if (imported) return { ticket: imported, from: 'import' }
  const linked = ticketIn(t.description) ?? ticketIn(t.brief)
  if (linked) return { ticket: linked, from: 'link' }
  const fromIdea = ticketIn(ideaText)
  return fromIdea ? { ticket: fromIdea, from: 'idea' } : null
}

/** The same, with the idea it came from read. */
export async function teamTicket(t: Ticketed & { ideaId?: string | null }) {
  const own = ticketOfTask(t)
  if (own || !t.ideaId) return own
  const [i] = await db.select({ title: idea.title, body: idea.body }).from(idea).where(eq(idea.id, t.ideaId))
  return i ? ticketOfTask(t, `${i.title}\n${i.body ?? ''}`) : null
}

export const ticketRequired = (setup: unknown) => (setup as { ticket_required?: boolean } | null)?.ticket_required === true
/** What is said when an app requires a team ticket and a task has none. */
export const needsTicket = (identifier: string, what: string) => `${identifier} has no team ticket, and this app requires one: ${what}. Set the ticket on the task (or link it in its description), and it carries on.`

/** Set, or clear, a task's team ticket and its name for the team. An empty string clears; a field left out is left alone. */
export async function setTeamNames(issueId: string, i: { ticket?: string | null; title?: string | null }) {
  const set: { teamTicket?: string | null; teamTitle?: string | null } = {}
  if (i.ticket !== undefined) {
    const t = (i.ticket ?? '').trim().toUpperCase()
    if (t && !TICKET.test(t)) throw new PlanError(`a team ticket is its key, like ENT-322 (got "${i.ticket}")`)
    set.teamTicket = t || null
  }
  if (i.title !== undefined) set.teamTitle = (i.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null
  if (!Object.keys(set).length) throw new PlanError('give a ticket or a title for the team')
  const [row] = await db.update(issue).set({ ...set, updatedAt: new Date() }).where(eq(issue.id, issueId)).returning()
  if (!row) throw new PlanError(`no task ${issueId}`)
  if (row.parentId) throw new PlanError('a team ticket is a task\'s, not a sub-task\'s')
  return { teamTicket: row.teamTicket, teamTitle: row.teamTitle, ...(await ticketView(row)) }
}

/** For the task's page: the ticket in force and where it was read from, and whether the app requires one that is missing. */
export async function ticketView(t: Ticketed & { ideaId?: string | null }, setup?: unknown) {
  const found = await teamTicket(t)
  return { ticket: found?.ticket ?? null, ticketFrom: found?.from ?? null, ticketMissing: !found && ticketRequired(setup) }
}
