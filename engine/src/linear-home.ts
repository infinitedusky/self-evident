/**
 * Linear as the home of an app's tickets (Sandy, 2026-11-10: "I want to setup linear integration with both", then
 * "Linear is the home"). With tkt's "Tickets live in Linear" switch on, tkt's skills read and change the tickets in
 * Linear through its hosted MCP server, and Self Evident makes the issue from an approved brief as before. Here: what
 * the tracker guide needs to know about the team, read with the key Integrations › Linear already names, and the guide's
 * States section worked out from the team's own states.
 */
import { LinearClient } from '@linear/sdk'

/** The MCP server the agents reach Linear through, as named in the harness (`claude mcp add … linear https://mcp.linear.app/mcp`). */
export const LINEAR_SERVER = 'linear'

export interface LinearState { name: string; type: string }
export interface LinearHome {
  server: string
  workspace: string
  slug: string
  team: { name: string; key: string; id: string }
  states: LinearState[]
  /** The team's Git automation, one line per rule; null when it could not be read. */
  automation: string[] | null
}
export type LinearFacts = { linear: LinearHome } | { trackerProblem: string }
export type FetchLinear = (apiKey: string, teamKey: string) => Promise<Omit<LinearHome, 'server'> | null>

const EVENTS: Record<string, string> = { draft: 'a draft pull request opens', start: 'a pull request opens', review: 'a review is requested', mergeable: 'the pull request is ready to merge', merge: 'the pull request merges' }

const fetchLinear: FetchLinear = async (apiKey, teamKey) => {
  const client = new LinearClient({ apiKey })
  const teams = await client.teams({ filter: { key: { eq: teamKey } } })
  const team = teams.nodes[0]
  if (!team) return null
  const [org, states] = await Promise.all([client.organization, team.states({ first: 100 })])
  let automation: string[] | null = null
  try {
    const rules = await team.gitAutomationStates({ first: 50 })
    automation = []
    for (const r of rules.nodes) {
      const to = await r.state
      const on = EVENTS[String(r.event)] ?? String(r.event)
      automation.push(`when ${on}${r.branchPattern ? ` on a branch matching \`${r.branchPattern}\`` : ''}, the issue moves to ${to?.name ?? 'no state (the rule is off)'}`)
    }
  } catch { automation = null } // the rest of the guide does not depend on it
  return {
    workspace: org.name, slug: org.urlKey,
    team: { name: team.name, key: team.key, id: team.id },
    states: [...states.nodes].sort((a, b) => a.position - b.position).map((s) => ({ name: s.name, type: s.type })),
    automation,
  }
}

/**
 * The team the app's Linear integration names, as the tracker guide needs it; or, in words, why tickets cannot live in
 * Linear yet. `values` are the app's effective Linear values (team, key_env).
 */
export async function linearFor(values: { team?: string | null; key_env?: string | null }, env: Record<string, string | undefined> = process.env, fetch: FetchLinear = fetchLinear): Promise<LinearFacts> {
  const team = values.team?.trim().toUpperCase()
  const keyVar = values.key_env?.trim()
  if (!team || !keyVar) return { trackerProblem: 'Tickets are set to live in Linear, but Linear isn\'t set for this app: give it the team key and the key variable under Integrations › Linear.' }
  const key = env[keyVar]
  if (!key) return { trackerProblem: `Tickets are set to live in Linear, but ${keyVar} isn't set in the engine's environment. Add it there and restart the engine.` }
  try {
    const found = await fetch(key, team)
    if (!found) return { trackerProblem: `Tickets are set to live in Linear, but the key ${keyVar} sees no team with key ${team}.` }
    return { linear: { server: LINEAR_SERVER, ...found } }
  } catch (e) {
    return { trackerProblem: `Linear refused the lookup of team ${team}: ${(e as Error).message.split('\n')[0]}` }
  }
}

const first = (states: LinearState[], type: string, prefer?: RegExp) => {
  const of = states.filter((s) => s.type === type)
  return (prefer && of.find((s) => prefer.test(s.name))) || of[0]
}

/**
 * The guide's roles for the team's states, by Linear's state types (the tracker guide's own rule: new is the backlog
 * state, or triage where the team triages; ready the unstarted one; in-progress and in-review the started ones; done
 * the completed one; blocked a state of that name when the team has one).
 */
export function stateRoles(states: LinearState[]): { rows: [string, string][]; terminal: string[] } {
  const name = (s?: LinearState) => s?.name
  const triage = first(states, 'triage')
  const backlog = first(states, 'backlog', /^backlog$/i)
  const todo = first(states, 'unstarted', /^to-?do$/i)
  const progress = first(states, 'started', /progress/i)
  const review = states.find((s) => s.type === 'started' && /review/i.test(s.name))
  const fresh = name(triage) ?? name(backlog) ?? name(todo)
  const ready = [name(backlog), name(todo)].filter((n) => n && n !== fresh).join(' and ')
  const rows: [string, string][] = [
    ['new', fresh ?? 'none'],
    ['ready', ready || 'none'],
    ['in-progress', name(progress) ?? 'none'],
    ['in-review', name(review) ?? name(progress) ?? 'none'],
    ['done', name(first(states, 'completed', /^done$/i)) ?? 'none'],
    ['canceled', name(first(states, 'canceled', /^cancell?ed$/i)) ?? 'none'],
    ['blocked', states.find((s) => /blocked/i.test(s.name))?.name ?? 'none'],
  ]
  return { rows, terminal: states.filter((s) => s.type === 'completed' || s.type === 'canceled').map((s) => s.name) }
}

/** What the words about a ticket need from tkt's context. */
interface Tracked { app: { key: string; name: string }; uiUrl: string; linear?: LinearHome }
/** The letters before a ticket's number: the Linear team's key when the tickets live there, else the app's. */
export const ticketKey = (ctx: Tracked) => ctx.linear?.team.key ?? ctx.app.key
export const ticketUrl = (ctx: Tracked, id: string) => (ctx.linear ? `https://linear.app/${ctx.linear.slug}/issue/${id}` : `${ctx.uiUrl}/tasks/${id}`)
/** The tracker and project in a few words, for the Ticket lifecycle block. */
export const trackerWords = (ctx: Tracked) => (ctx.linear ? `Linear, the team ${ctx.linear.team.name} (${ctx.linear.team.key})` : `Self Evident, the app ${ctx.app.name} (${ctx.app.key})`)
