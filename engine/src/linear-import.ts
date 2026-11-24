/**
 * Linear tickets brought in (Sandy, 2026-11-12: "we should be able to create plans and tasks from linear"). The other
 * direction from the Linear integration's declared actions: here Evident reads. A team's open tickets are listed
 * for an app, the person ticks the ones to bring in, and each becomes an idea (Sandy, 2026-11-20: "bring them in as
 * ideas and then decide whether or not they should be projects or tasks … it might be that they should be a project
 * with tasks. For one ticket"): its title, its description, and where it came from (`source: 'linear'`,
 * `sourceRef.linear`: the ticket's id, identifier, URL, the branch name Linear gives it, and its Linear project).
 * Converting the idea (work.ts) hands `sourceRef.linear` to the task it makes, so the branch and the reports still
 * name the ticket.
 *
 * A project's "Add tasks" has decided already: there (`as: 'task'`) a ticket becomes a task, with its priority.
 *
 * Read only: nothing is written to Linear. Bringing a ticket in again updates what it already is here (title,
 * description) and never makes a second one; its state here is left as it stands.
 *
 * The team and the key are the app's Linear integration (Integrations › Linear: team key, key variable).
 */
import { LinearClient } from '@linear/sdk'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, idea, issue, workspace, type IssueState } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { effectiveIntegrations, type Values } from './integrations.js'
import { identifier, insertIssues, PlanError } from './issues.js'
import { keepFiles, keepOrigin } from './origins.js'

export interface LinearTicket {
  id: string; identifier: string; title: string; description: string | null; url: string; branchName: string | null
  priority: number; state: { name: string; type: string }; assignee: string | null; mine: boolean; project: string | null
  /** Asked for when tickets are brought in, not when they are listed: what was said on it, and what it links to. */
  comments?: { author: string | null; at: string; body: string }[]; links?: { title: string; url: string }[]
}
export type Scope = 'mine' | 'unassigned' | 'all'
/** The team's tickets that are still open (or the ones named, whatever their state), newest change first. */
export type FetchTickets = (apiKey: string, teamKey: string, opts: { scope?: Scope; identifiers?: string[] }) => Promise<LinearTicket[]>

const FIELDS = 'id identifier title description url branchName priority state { name type } assignee { id name } project { name }'
const WHOLE = `${FIELDS} comments(first: 100) { nodes { body createdAt user { name } } } attachments(first: 50) { nodes { title url } }` // bringing in: the whole ticket
const query = (fields: string) => `query Tickets($filter: IssueFilter, $after: String) { viewer { id } issues(first: 100, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } }`
interface Node { id: string; identifier: string; title: string; description: string | null; url: string; branchName: string | null; priority: number; state: { name: string; type: string }; assignee: { id: string; name: string } | null; project: { name: string } | null
  comments?: { nodes: { body: string; createdAt: string; user: { name: string } | null }[] }; attachments?: { nodes: { title: string | null; url: string }[] } }

const fetchTickets: FetchTickets = async (apiKey, teamKey, opts) => {
  const client = new LinearClient({ apiKey })
  const numbers = (opts.identifiers ?? []).map((i) => Number(i.split('-').pop())).filter((n) => Number.isInteger(n))
  const filter = {
    team: { key: { eq: teamKey } },
    ...(opts.identifiers ? { number: { in: numbers } } : { state: { type: { nin: ['completed', 'canceled'] } } }),
    ...(opts.scope === 'mine' ? { assignee: { isMe: { eq: true } } } : opts.scope === 'unassigned' ? { assignee: { null: true } } : {}),
  }
  const out: LinearTicket[] = []
  let after: string | null = null
  for (let page = 0; page < 5; page++) { // 500 tickets is more than a person ticks through
    const res: { data?: { viewer: { id: string }; issues: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await client.client.rawRequest(query(opts.identifiers ? WHOLE : FIELDS), { filter, after })
    const d = res.data
    if (!d) break
    for (const n of d.issues.nodes) out.push({ id: n.id, identifier: n.identifier, title: n.title, description: n.description, url: n.url, branchName: n.branchName, priority: n.priority, state: n.state, assignee: n.assignee?.name ?? null, mine: n.assignee?.id === d.viewer.id, project: n.project?.name ?? null,
      ...(n.comments ? { comments: n.comments.nodes.map((c) => ({ author: c.user?.name ?? null, at: c.createdAt, body: c.body })).sort((x, y) => x.at.localeCompare(y.at)) } : {}),
      ...(n.attachments ? { links: n.attachments.nodes.map((l) => ({ title: l.title || l.url, url: l.url })) } : {}) })
    if (!d.issues.pageInfo.hasNextPage) break
    after = d.issues.pageInfo.endCursor
  }
  return out
}

/** The app's Linear team and key, or why there is none, in words for the page. */
async function connection(appId: string, env: Record<string, string | undefined>): Promise<{ team: string; key: string }> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const [w] = await db.select().from(workspace).where(eq(workspace.id, a.workspaceId))
  const eff = effectiveIntegrations(((w?.settings ?? {}) as { integrations?: Values }).integrations ?? {}, (a.setup as { integrations?: Values }).integrations ?? {})
  const team = eff.linear?.team?.value?.trim().toUpperCase()
  const keyVar = eff.linear?.key_env?.value?.trim()
  if (!team || !keyVar) throw new PlanError(`Linear isn't set for ${a.name}: give it the team key and the key variable under Settings › ${a.name} › Integrations › Linear.`)
  const key = env[keyVar]
  if (!key) throw new PlanError(`${keyVar} has no key. Create a personal API key in Linear (Settings › Account › Security & access) and paste it under Settings › Integrations › Linear: it is kept on this computer, so you do it once.`)
  return { team, key }
}

const said = (e: unknown) => new PlanError(`Linear refused: ${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 300)}`)

const ticketId = (ref: unknown) => (ref as { linear?: { id?: string } } | null)?.linear?.id ?? ''
/** What this app already has from Linear, by the ticket's id: the tasks that name a ticket (made from one, or from an idea that was one), and the ideas. */
async function broughtIn(appId: string) {
  const tasks = await db.select().from(issue).where(and(eq(issue.appId, appId), sql`${issue.sourceRef}->'linear'->>'id' is not null`))
  const ideas = await db.select().from(idea).where(and(eq(idea.appId, appId), eq(idea.source, 'linear')))
  return { tasks: new Map(tasks.map((r) => [ticketId(r.sourceRef), r])), ideas: new Map(ideas.map((r) => [ticketId(r.sourceRef), r])) }
}

/** The team's open tickets, each with what it already is here, if anything: the task it became, or the idea it is. */
export async function linearTickets(appId: string, scope: Scope = 'mine', env: Record<string, string | undefined> = process.env, fetch: FetchTickets = fetchTickets) {
  const { team, key } = await connection(appId, env)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  let tickets: LinearTicket[]
  try { tickets = await fetch(key, team, { scope }) } catch (e) { throw said(e) }
  const have = await broughtIn(appId)
  return { team, tickets: tickets.map(({ description: _, ...t }) => {
    const task = have.tasks.get(t.id), was = have.ideas.get(t.id)
    return { ...t, task: task ? { id: task.id, identifier: identifier(a.key, task.number) } : null, idea: was ? { id: was.id, number: was.number } : null }
  }) }
}

/** Linear's state types as ours: a ticket someone has started is still to do here until work starts here. */
const STATE: Record<string, IssueState> = { triage: 'triage', backlog: 'backlog', unstarted: 'todo', started: 'todo', completed: 'done', canceled: 'canceled' }

/** What a person reads on the task: the ticket's own words, and where they came from. */
const describe = (t: LinearTicket) => [`From Linear ${t.identifier}: ${t.url}`, t.description?.trim()].filter(Boolean).join('\n\n')

export type ImportAs = 'idea' | 'task'
export interface Brought { kind: ImportAs; id: string; identifier: string; title: string; linear: string }

/** Linear's own uploads in a ticket's text: they open only with the key. */
const LINEAR_UPLOAD = (url: string) => /^https:\/\/uploads\.linear\.app\//.test(url)

/**
 * Each ticket named becomes an idea (or, `as: 'task'`, a task), or updates what it already is here. Every ticket
 * named is kept whole as an origin (origins.ts), its images fetched beside it, and brought up to date each time it is
 * brought in, whatever became of it here. Returns both lists, in the order asked, and the tickets not found.
 */
export async function importTickets(appId: string, identifiers: string[], actor = 'user', env: Record<string, string | undefined> = process.env, fetch: FetchTickets = fetchTickets, as: ImportAs = 'idea', getFile: typeof globalThis.fetch = globalThis.fetch) {
  const wanted = [...new Set(identifiers.map((i) => i.trim().toUpperCase()).filter(Boolean))]
  if (!wanted.length) throw new PlanError('name at least one ticket')
  const { team, key } = await connection(appId, env)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  let tickets: LinearTicket[]
  try { tickets = (await fetch(key, team, { identifiers: wanted })).filter((t) => wanted.includes(t.identifier)) } catch (e) { throw said(e) }
  tickets.sort((x, y) => wanted.indexOf(x.identifier) - wanted.indexOf(y.identifier)) // in the order asked
  const missing = wanted.filter((w) => !tickets.some((t) => t.identifier === w))
  const have = await broughtIn(appId)
  const ref = (t: LinearTicket) => ({ linear: { id: t.id, identifier: t.identifier, url: t.url, branchName: t.branchName, project: t.project } })
  const task = (r: typeof issue.$inferSelect): Brought => ({ kind: 'task', id: r.id, identifier: identifier(a.key, r.number), title: r.title, linear: (r.sourceRef as { linear: { identifier: string } }).linear.identifier })
  const anIdea = (r: typeof idea.$inferSelect): Brought => ({ kind: 'idea', id: r.id, identifier: `#${r.number}`, title: r.title, linear: (r.sourceRef as { linear: { identifier: string } }).linear.identifier })
  // Its images, fetched before anything is written: a slow download never holds the database.
  const files = new Map<string, Awaited<ReturnType<typeof keepFiles>>>()
  for (const t of tickets) files.set(t.id, await keepFiles(appId, 'linear', t.identifier, [t.description, ...(t.comments ?? []).map((c) => c.body)], LINEAR_UPLOAD, { Authorization: key }, getFile))
  return db.transaction(async (tx) => {
    const made: Brought[] = [], updated: Brought[] = []
    const origins = new Map<string, string>()
    for (const t of tickets) origins.set(t.id, (await keepOrigin(tx, appId, { source: 'linear', ref: t.identifier, url: t.url, title: t.title, body: t.description, comments: t.comments ?? [], links: t.links ?? [], files: files.get(t.id) ?? [] })).id)
    // Already here: a task made from it, or the idea it is, has its words brought up to date. A task made from that
    // idea is the person's own by now (its title may have been trimmed to its part of a project): it is left alone.
    const kept = new Set<string>()
    for (const t of tickets) {
      const was = have.tasks.get(t.id), thought = have.ideas.get(t.id)
      if (was?.source === 'linear') {
        const [row] = await tx.update(issue).set({ title: t.title.slice(0, 500), description: describe(t), priority: t.priority, sourceRef: ref(t), originId: origins.get(t.id)!, updatedAt: sql`now()` }).where(eq(issue.id, was.id)).returning()
        updated.push(task(row)); kept.add(t.id)
      } else if (was) kept.add(t.id)
      else if (thought && as === 'idea') {
        const [row] = await tx.update(idea).set({ title: t.title.slice(0, 500), body: describe(t), sourceRef: ref(t), originId: origins.get(t.id)!, updatedAt: new Date() }).where(eq(idea.id, thought.id)).returning()
        updated.push(anIdea(row)); kept.add(t.id)
      }
    }
    const fresh = tickets.filter((t) => !kept.has(t.id))
    if (as === 'task') {
      const rows = await insertIssues(tx, appId, fresh.map((t) => ({ title: t.title, description: describe(t), priority: t.priority, state: STATE[t.state.type] === 'canceled' ? 'backlog' : STATE[t.state.type] ?? 'todo', source: 'linear', sourceRef: ref(t), originId: origins.get(t.id)! })), actor)
      made.push(...rows.map(task))
    } else if (fresh.length) {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${idea.number}), 0)` }).from(idea).where(eq(idea.appId, appId))
      const rows = await tx.insert(idea).values(fresh.map((t, n) => ({ id: newId('idea'), appId, number: Number(max) + 1 + n, title: t.title.slice(0, 500), body: describe(t), source: 'linear', sourceRef: ref(t), originId: origins.get(t.id)!, lane: 'inbox' }))).returning()
      for (const r of rows) await appendEvent(tx, { workspaceId: a.workspaceId, appId, ideaId: r.id, actor, type: 'idea.created', payload: { number: r.number, title: r.title, linear: (r.sourceRef as { linear: { identifier: string } }).linear.identifier } })
      made.push(...rows.sort((x, y) => x.number - y.number).map(anIdea))
    }
    return { made, updated, missing }
  })
}

/**
 * One ticket kept whole as an origin, or brought up to date, and nothing made from it: a reference doc in a Context
 * (context.ts), and what its Refresh does.
 */
export async function keepTicket(appId: string, identifier: string, env: Record<string, string | undefined> = process.env, fetch: FetchTickets = fetchTickets, getFile: typeof globalThis.fetch = globalThis.fetch) {
  const wanted = identifier.trim().toUpperCase()
  if (!wanted) throw new PlanError('name the ticket: its id in Linear, like SHOP-12')
  const { team, key } = await connection(appId, env)
  let t: LinearTicket | undefined
  try { t = (await fetch(key, team, { identifiers: [wanted] })).find((x) => x.identifier === wanted) } catch (e) { throw said(e) }
  if (!t) throw new PlanError(`Linear's team ${team} has no ticket ${wanted} that this key can read.`)
  const files = await keepFiles(appId, 'linear', t.identifier, [t.description, ...(t.comments ?? []).map((c) => c.body)], LINEAR_UPLOAD, { Authorization: key }, getFile)
  return keepOrigin(db, appId, { source: 'linear', ref: t.identifier, url: t.url, title: t.title, body: t.description, comments: t.comments ?? [], links: t.links ?? [], files })
}
