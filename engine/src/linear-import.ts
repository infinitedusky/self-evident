/**
 * Tasks from Linear tickets (Sandy, 2026-11-12: "we should be able to create plans and tasks from linear"). The other
 * direction from the Linear integration's declared actions: here Self Evident reads. A team's open tickets are listed
 * for an app, the person ticks the ones to bring in, and each becomes a task: its title, its description, its
 * priority, and where it came from (`source: 'linear'`, `sourceRef.linear`: the ticket's id, identifier, URL, the
 * branch name Linear gives it, and its Linear project).
 *
 * Read only: nothing is written to Linear. Bringing a ticket in again updates the task it made (title, description,
 * priority) and never makes a second one; the task's own state is left as it stands here.
 *
 * The team and the key are the app's Linear integration (Integrations › Linear: team key, key variable).
 */
import { LinearClient } from '@linear/sdk'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, workspace, type IssueState } from './db/schema.js'
import { effectiveIntegrations, type Values } from './integrations.js'
import { identifier, insertIssues, PlanError } from './issues.js'

export interface LinearTicket {
  id: string; identifier: string; title: string; description: string | null; url: string; branchName: string | null
  priority: number; state: { name: string; type: string }; assignee: string | null; mine: boolean; project: string | null
}
export type Scope = 'mine' | 'unassigned' | 'all'
/** The team's tickets that are still open (or the ones named, whatever their state), newest change first. */
export type FetchTickets = (apiKey: string, teamKey: string, opts: { scope?: Scope; identifiers?: string[] }) => Promise<LinearTicket[]>

const FIELDS = 'id identifier title description url branchName priority state { name type } assignee { id name } project { name }'
const QUERY = `query Tickets($filter: IssueFilter, $after: String) { viewer { id } issues(first: 100, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ${FIELDS} } pageInfo { hasNextPage endCursor } } }`
interface Node { id: string; identifier: string; title: string; description: string | null; url: string; branchName: string | null; priority: number; state: { name: string; type: string }; assignee: { id: string; name: string } | null; project: { name: string } | null }

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
    const res: { data?: { viewer: { id: string }; issues: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await client.client.rawRequest(QUERY, { filter, after })
    const d = res.data
    if (!d) break
    for (const n of d.issues.nodes) out.push({ id: n.id, identifier: n.identifier, title: n.title, description: n.description, url: n.url, branchName: n.branchName, priority: n.priority, state: n.state, assignee: n.assignee?.name ?? null, mine: n.assignee?.id === d.viewer.id, project: n.project?.name ?? null })
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
  if (!key) throw new PlanError(`${keyVar} isn't set in the engine's environment. Create a personal API key in Linear (Settings › Account › Security & access), export it as ${keyVar} where the engine starts, and restart the engine.`)
  return { team, key }
}

const said = (e: unknown) => new PlanError(`Linear refused: ${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 300)}`)

/** The tasks of this app that came from Linear, by the ticket's id. */
async function broughtIn(appId: string) {
  const rows = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.source, 'linear')))
  return new Map(rows.map((r) => [(r.sourceRef as { linear?: { id?: string } } | null)?.linear?.id ?? '', r]))
}

/** The team's open tickets, each with the task it already is here, if any. */
export async function linearTickets(appId: string, scope: Scope = 'mine', env: Record<string, string | undefined> = process.env, fetch: FetchTickets = fetchTickets) {
  const { team, key } = await connection(appId, env)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  let tickets: LinearTicket[]
  try { tickets = await fetch(key, team, { scope }) } catch (e) { throw said(e) }
  const have = await broughtIn(appId)
  return { team, tickets: tickets.map(({ description: _, ...t }) => { const task = have.get(t.id); return { ...t, task: task ? { id: task.id, identifier: identifier(a.key, task.number) } : null } }) }
}

/** Linear's state types as ours: a ticket someone has started is still to do here until work starts here. */
const STATE: Record<string, IssueState> = { triage: 'triage', backlog: 'backlog', unstarted: 'todo', started: 'todo', completed: 'done', canceled: 'canceled' }

/** What a person reads on the task: the ticket's own words, and where they came from. */
const describe = (t: LinearTicket) => [`From Linear ${t.identifier}: ${t.url}`, t.description?.trim()].filter(Boolean).join('\n\n')

/** Each ticket named becomes a task, or updates the one it already is. Returns both lists. */
export async function importTickets(appId: string, identifiers: string[], actor = 'user', env: Record<string, string | undefined> = process.env, fetch: FetchTickets = fetchTickets) {
  const wanted = [...new Set(identifiers.map((i) => i.trim().toUpperCase()).filter(Boolean))]
  if (!wanted.length) throw new PlanError('name at least one ticket')
  const { team, key } = await connection(appId, env)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  let tickets: LinearTicket[]
  try { tickets = (await fetch(key, team, { identifiers: wanted })).filter((t) => wanted.includes(t.identifier)) } catch (e) { throw said(e) }
  const missing = wanted.filter((w) => !tickets.some((t) => t.identifier === w))
  const have = await broughtIn(appId)
  const ref = (t: LinearTicket) => ({ linear: { id: t.id, identifier: t.identifier, url: t.url, branchName: t.branchName, project: t.project } })
  return db.transaction(async (tx) => {
    const fresh = tickets.filter((t) => !have.has(t.id)).sort((x, y) => wanted.indexOf(x.identifier) - wanted.indexOf(y.identifier)) // in the order asked
    const made = await insertIssues(tx, appId, fresh.map((t) => ({ title: t.title, description: describe(t), priority: t.priority, state: STATE[t.state.type] === 'canceled' ? 'backlog' : STATE[t.state.type] ?? 'todo', source: 'linear', sourceRef: ref(t) })), actor)
    const updated: typeof made = []
    for (const t of tickets.filter((x) => have.has(x.id))) {
      const [row] = await tx.update(issue).set({ title: t.title.slice(0, 500), description: describe(t), priority: t.priority, sourceRef: ref(t), updatedAt: sql`now()` }).where(eq(issue.id, have.get(t.id)!.id)).returning()
      updated.push(row)
    }
    const named = (rows: typeof made) => rows.map((r) => ({ id: r.id, identifier: identifier(a.key, r.number), title: r.title, linear: (r.sourceRef as { linear: { identifier: string } }).linear.identifier }))
    return { made: named(made), updated: named(updated), missing }
  })
}
