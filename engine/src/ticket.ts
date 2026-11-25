/**
 * A task's team ticket, and its name for the team (found on a client's first pull request, 2026-11-20: the task
 * linked the team's ticket in its description and had none recorded, so {ticket} fell back to our own id, and the
 * branch and the pull request's title came out with it; their CI rejects a title whose bracket is not one of their
 * ticket keys. And {title} was our working title, "…, third build: …", which is for us).
 *
 * The ticket is, first of these that there is:
 * - the ticket record a person or the task's agent linked the task to (issue.ticket_id);
 * - the ticket it was imported from (source_ref.linear);
 * - a link to a ticket in its description or its brief (linear.app/…/issue/ENT-322/…);
 * - the same in the idea it came from.
 * `team_title` is the task's name as the team would say it, used for {title} in a pull request's title and a
 * branch's name; without one it is our title.
 *
 * An app can require a team ticket (`setup.ticket_required`): then our id is never used in its place. A task with
 * none is held before its branch is first cut, since a branch cannot be renamed once its pull request is open, and
 * its pull request is not opened; both say what is missing.
 *
 * A ticket is a record of its own (Sandy, 2026-11-24: "ticket needs to become an actual record, not just text … and
 * then we can link them that way. And that way it would just be an organizational thing"): one per app and key, with
 * its title, link and origin once it was read from its tracker. A ticket bigger than one pull request is several tasks
 * under one ticket: each still has its own brief, prototype, build and pull request, and the ticket builds and
 * approves nothing. `ticketsOf` is every ticket of an app with its tasks, whichever way each task's ticket was read;
 * it is done when all of them are.
 *
 * A task can be under more than one ticket (Sandy, 2026-11-25: "a task can have more than one ticket it's pointing
 * at"): one piece of work that answers two tickets. The first, above, is the one that names its branch, commits and
 * pull request, which carry one key. The others (`issue_ticket`) only place the task under those tickets as well.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, contextDoc, idea, issue, issueTicket, pr, project, ticket } from './db/schema.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'

/** A ticket key as trackers write them: ENT-322, ALL-40841. */
export const TICKET = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/
/** The first ticket a text links to on Linear; null when it links to none. A bare "ENT-322" in prose is not taken: it may be a mention of some other ticket. */
export function ticketIn(text?: string | null): string | null {
  const m = /linear\.app\/[\w-]+\/issue\/([A-Za-z][A-Za-z0-9]{1,9}-\d{1,7})\b/.exec(text ?? '')
  return m ? m[1].toUpperCase() : null
}

export type TicketFrom = 'set' | 'import' | 'link' | 'idea'
/** `teamTicket` is the key of the ticket record the task is linked to, when it is linked to one. */
export interface Ticketed { teamTicket?: string | null; sourceRef?: unknown; description?: string | null; brief?: string | null }
type Task = Omit<Ticketed, 'teamTicket'> & { ticketId?: string | null; ideaId?: string | null }
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

/** The key of the ticket record a task is linked to; null when it is linked to none. */
async function linkedKey(t: { ticketId?: string | null }) {
  if (!t.ticketId) return null
  const [r] = await db.select({ key: ticket.key }).from(ticket).where(eq(ticket.id, t.ticketId))
  return r?.key ?? null
}

/** The same, with the ticket record it is linked to and the idea it came from read. */
export async function teamTicket(t: Task) {
  const mine = { ...t, teamTicket: await linkedKey(t) }
  const own = ticketOfTask(mine)
  if (own || !t.ideaId) return own
  const [i] = await db.select({ title: idea.title, body: idea.body }).from(idea).where(eq(idea.id, t.ideaId))
  return i ? ticketOfTask(mine, `${i.title}\n${i.body ?? ''}`) : null
}

/**
 * The ticket record for a key, made if there is none. What is given of its title, link, source and origin is written;
 * what is left out stays as it was, so a ticket known by its key alone gains the rest when it is read from its tracker.
 */
export async function keepTicketRecord(tx: Tx | typeof db, appId: string, key: string, known: { title?: string | null; url?: string | null; source?: string | null; originId?: string | null } = {}) {
  const k = key.trim().toUpperCase()
  const set = Object.fromEntries(Object.entries(known).filter(([, v]) => v != null))
  const [row] = await tx.insert(ticket).values({ id: newId('ticket'), appId, key: k, ...set })
    .onConflictDoUpdate({ target: [ticket.appId, ticket.key], set: { ...set, updatedAt: new Date() } }).returning()
  return row
}

export const ticketRequired = (setup: unknown) => (setup as { ticket_required?: boolean } | null)?.ticket_required === true
/** What is said when an app requires a team ticket and a task has none. */
export const needsTicket = (identifier: string, what: string) => `${identifier} has no team ticket, and this app requires one: ${what}. Set the ticket on the task (or link it in its description), and it carries on.`

/**
 * Link a task to a team ticket, or unlink it, and set its name for the team. An empty string unlinks; a field left out
 * is left alone. The ticket is linked by its key: the record for it is the one the app already has, or a new one, so
 * two tasks given the same key are under the same ticket. `read` reads a ticket from its tracker (linear-import.ts's
 * keepTicket): given, a ticket with no title yet is read, so the record has its title and link; when the tracker
 * can't be reached or has no such ticket, the link stands with the key alone.
 */
export async function setTeamNames(issueId: string, i: { ticket?: string | null; title?: string | null; /** The other tickets it is under, by key: the whole list, replacing what was there. */ also?: string[] | null }, read?: (appId: string, key: string) => Promise<unknown>) {
  const [was] = await db.select().from(issue).where(eq(issue.id, issueId))
  if (!was) throw new PlanError(`no task ${issueId}`)
  if (was.parentId) throw new PlanError('a team ticket is a task\'s, not a sub-task\'s')
  const set: { ticketId?: string | null; teamTitle?: string | null } = {}
  if (i.ticket !== undefined) {
    const t = (i.ticket ?? '').trim().toUpperCase()
    if (t && !TICKET.test(t)) throw new PlanError(`a team ticket is its key, like ENT-322 (got "${i.ticket}")`)
    const record = t ? await keepTicketRecord(db, was.appId, t) : null
    set.ticketId = record?.id ?? null
    if (record && !record.title && read) await read(was.appId, t).catch(() => {})
  }
  if (i.title !== undefined) set.teamTitle = (i.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null
  if (!Object.keys(set).length && i.also === undefined) throw new PlanError('give a ticket or a title for the team')
  const [row] = await db.update(issue).set({ ...set, updatedAt: new Date() }).where(eq(issue.id, issueId)).returning()
  if (i.also !== undefined) {
    const keys = [...new Set((i.also ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean))]
    for (const k of keys) if (!TICKET.test(k)) throw new PlanError(`a team ticket is its key, like ENT-322 (got "${k}")`)
    const records = []
    for (const k of keys) { const r = await keepTicketRecord(db, was.appId, k); records.push(r); if (!r.title && read) await read(was.appId, k).catch(() => {}) }
    const others = records.filter((r) => r.id !== row.ticketId) // the one that names its branch is not also one of the rest
    await db.transaction(async (tx) => {
      await tx.delete(issueTicket).where(eq(issueTicket.issueId, issueId))
      if (others.length) await tx.insert(issueTicket).values(others.map((r) => ({ issueId, ticketId: r.id, appId: was.appId })))
    })
  } else if (row.ticketId) await db.delete(issueTicket).where(and(eq(issueTicket.issueId, issueId), eq(issueTicket.ticketId, row.ticketId))) // made its first ticket: no longer one of the rest
  return { teamTitle: row.teamTitle, ...(await ticketView(row)) }
}

/**
 * For the task's page: the ticket in force and where it was read from, the key it is linked to by hand (`teamTicket`),
 * and whether the app requires one that is missing.
 */
export async function ticketView(t: Task & { id?: string }, setup?: unknown) {
  const found = await teamTicket(t)
  const also = t.id ? (await db.select({ key: ticket.key }).from(issueTicket).innerJoin(ticket, eq(ticket.id, issueTicket.ticketId)).where(eq(issueTicket.issueId, t.id))).map((r) => r.key).filter((k) => k !== found?.ticket).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })) : []
  return { ticket: found?.ticket ?? null, ticketFrom: found?.from ?? null, teamTicket: await linkedKey(t), /** The other tickets it is under. */ alsoTickets: also, ticketMissing: !found && ticketRequired(setup) }
}

const OVER = ['canceled', 'duplicate']
export interface TicketTask { id: string; identifier: string; title: string; teamTitle: string | null; state: string; /** How it comes under this ticket; `also`: one of its other tickets, not the one that names its branch. */ from: TicketFrom | 'also'; projectId: string | null; project: { id: string; name: string } | null; pr: { number: number | null; url: string | null; status: string } | null }
export interface TicketGroup {
  key: string; title: string | null; url: string | null; source: string | null
  /** It was read from its tracker, word for word: its tasks' agents are given it when it is their origin. */ read: boolean
  /** Its tasks, in their projects' order. Dropped ones are listed and not counted. */ tasks: TicketTask[]
  done: number; total: number; /** Every task that counts is done, and there is at least one. */ finished: boolean
}

/**
 * Every ticket of an app with the tasks under it: a task is under the ticket in force for it, whether it was linked,
 * imported, or read from a link in its text or its idea's. A ticket with a record and no task is listed too, empty.
 * Tickets with open tasks first, then by key.
 */
export async function ticketsOf(appId: string): Promise<TicketGroup[]> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const records = await db.select().from(ticket).where(eq(ticket.appId, appId))
  const projects = await db.select().from(project).where(eq(project.appId, appId))
  const live = new Map(projects.filter((p) => p.status !== 'superseded').map((p) => [p.id, p]))
  const tasks = (await db.select().from(issue).where(and(eq(issue.appId, appId), isNull(issue.parentId)))).filter((t) => !t.projectId || live.has(t.projectId))
  const ideaIds = [...new Set(tasks.map((t) => t.ideaId).filter((x): x is string => !!x))]
  const ideas = new Map((ideaIds.length ? await db.select({ id: idea.id, title: idea.title, body: idea.body }).from(idea).where(inArray(idea.id, ideaIds)) : []).map((i) => [i.id, `${i.title}\n${i.body ?? ''}`]))
  const prs = await db.select().from(pr).where(eq(pr.appId, appId))
  const keyOf = new Map(records.map((r) => [r.id, r.key]))
  const also = new Map<string, string[]>() // a task's other tickets, by key
  for (const l of await db.select().from(issueTicket).where(eq(issueTicket.appId, appId))) { const k = keyOf.get(l.ticketId); if (k) also.set(l.issueId, [...(also.get(l.issueId) ?? []), k]) }
  const groups = new Map<string, TicketTask[]>(records.map((r) => [r.key, []]))
  const order = (t: typeof tasks[number]) => [live.get(t.projectId ?? '')?.createdAt.getTime() ?? 0, t.sortOrder, t.number]
  for (const t of [...tasks].sort((x, y) => { const p = order(x), q = order(y); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2] })) {
    const found = ticketOfTask({ ...t, teamTicket: t.ticketId ? keyOf.get(t.ticketId) : null }, t.ideaId ? ideas.get(t.ideaId) : null)
    const under: [string, TicketFrom | 'also'][] = found ? [[found.ticket.toUpperCase(), found.from]] : []
    for (const k of also.get(t.id) ?? []) if (!under.some(([u]) => u === k)) under.push([k, 'also'])
    if (!under.length) continue
    const p = t.projectId ? live.get(t.projectId) : null
    const q = prs.find((x) => x.issueId === t.id) ?? prs.find((x) => !x.issueId && !!t.projectId && x.projectId === t.projectId)
    for (const [key, from] of under) groups.set(key, [...(groups.get(key) ?? []), { id: t.id, identifier: identifier(a.key, t.number), title: t.title, teamTitle: t.teamTitle, state: t.state, from, projectId: t.projectId,
      project: p && !p.solo ? { id: p.id, name: p.name } : null, pr: q ? { number: q.number, url: q.url, status: q.status } : null }])
  }
  const out = [...groups].map(([key, of]): TicketGroup => {
    const r = records.find((x) => x.key === key)
    const counted = of.filter((t) => !OVER.includes(t.state)), done = counted.filter((t) => t.state === 'done').length
    return { key, title: r?.title ?? null, url: r?.url ?? null, source: r?.source ?? null, read: !!r?.originId, tasks: of, done, total: counted.length, finished: counted.length > 0 && done === counted.length }
  })
  const open = (g: TicketGroup) => (g.total > 0 && !g.finished ? 0 : g.total ? 1 : 2)
  return out.sort((x, y) => open(x) - open(y) || x.key.localeCompare(y.key, undefined, { numeric: true }))
}

/** One ticket of an app, by its key, with its tasks. A key that is no record and on no task is not a ticket here. */
export async function ticketOf(appId: string, key: string): Promise<TicketGroup> {
  const k = key.trim().toUpperCase()
  const found = (await ticketsOf(appId)).find((g) => g.key === k)
  if (!found) throw new PlanError(`no ticket ${k} here: no task is under it, and it was never read from its tracker`)
  return found
}


/**
 * A project's tickets: the ones in its Context as reference docs (and the one it came from), and the ones its tasks
 * are under. Each with all its tasks, wherever they are, so a ticket shared with another project shows whole. The
 * ones still to be worked first: a ticket in the Context with no task yet is what there is still to plan.
 */
export async function projectTickets(projectId: string): Promise<(TicketGroup & { /** It is in the project's Context. */ inContext: boolean; /** How many of its tasks are in this project. */ here: number })[]> {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p) throw new PlanError(`no project ${projectId}`)
  const docs = await db.select({ originId: contextDoc.originId }).from(contextDoc).where(and(eq(contextDoc.projectId, projectId), eq(contextDoc.kind, 'ticket')))
  const origins = [p.originId, ...docs.map((d) => d.originId)].filter((x): x is string => !!x)
  const inContext = new Set((origins.length ? await db.select({ key: ticket.key }).from(ticket).where(and(eq(ticket.appId, p.appId), inArray(ticket.originId, origins))) : []).map((r) => r.key))
  const out = (await ticketsOf(p.appId)).map((g) => ({ ...g, inContext: inContext.has(g.key), here: g.tasks.filter((t) => t.projectId === projectId).length })).filter((g) => g.inContext || g.here > 0)
  const rank = (g: typeof out[number]) => (!g.tasks.length ? 0 : g.finished ? 2 : 1) // nothing planned for it yet, then being worked, then done
  return out.sort((x, y) => rank(x) - rank(y) || x.key.localeCompare(y.key, undefined, { numeric: true }))
}
