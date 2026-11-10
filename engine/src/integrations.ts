/**
 * Integrations: the services the factory and its apps report to, set once for the workspace and overridden per app,
 * field by field (Homework Gate can send to its own PostHog project while the rest share one). The workspace's
 * values live in `workspace.settings.integrations`, an app's overrides in `app.setup.integrations`; an empty field
 * inherits. Keys and tokens are never stored here: they stay in each program's .env, and a field only names the
 * variable that holds one.
 *
 * The shape (SHAPE.md, "The shape of an integration"): what it is, its fields, the variable holding its key, the
 * actions a workflow step can take with it, and whether the engine itself calls it. One the engine calls needs its key
 * in the engine's own environment, and can be checked from Settings; the others (telemetry) are read by each app.
 * Every integration is the service's official API or SDK, with no paid middleman (Sandy, 2026-10-29).
 */
import { LinearClient } from '@linear/sdk'
import { checkStorybook, installAsk, installStorybook, storybookDefaults, type Check, type StorybookContext, type StorybookDeps } from './storybook.js'
import { checkTkt, setupTkt, type Deps as TktDeps, type TktContext } from './tkt.js'

/**
 * `secret` marks the field naming the key's variable; `required` ones must be set before it counts as connected.
 * A `switch` holds "true" or "false" instead of a value: on or off.
 */
export interface Field { key: string; label: string; placeholder?: string; required?: boolean; secret?: boolean; kind?: 'switch'; states?: { on: string; off: string } } // states: what on and off mean, for a switch
/**
 * What can be done with it. A workflow step's action takes content from an earlier step and gives a link and an id
 * back. One with a `kind` is a button on the integration's page: `start` runs the tool, `link` opens what the check
 * found, `ask` hands the agent a job (`ask` is the text) in a conversation in the app's repo.
 */
export interface Action { key: string; name: string; does: string; kind?: 'start' | 'link' | 'ask'; ask?: string }
export interface Integration {
  key: string; name: string; role: string; does: string; fields: Field[]
  calls: boolean // the engine calls it, so its key must be in the engine's environment
  actions: Action[]
  docs?: string // where to make a key
  perApp?: boolean // set under each app, nothing to set for all apps: a tool that runs an app's work or shows its screens, not a service
}

export const INTEGRATIONS: Integration[] = [
  {
    // tkt (gitlab.com/rogs/tkt), the runner: on for an app, it builds the app's tickets and Self Evident hands none to
    // its own planner. Nothing of tkt's is configured here (SHAPE.md, "tkt is the runner"); the check says what is wrong.
    key: 'tkt', name: 'tkt', role: 'Runner', does: 'Builds this app\'s tickets from their approved briefs: a worktree, a herdr tab, the lifecycle skills on the harness and model its preset says; the plan, the handoff, the review and the completion written back on the ticket',
    fields: [
      { key: 'on', label: 'Runs this app\'s tasks', kind: 'switch', required: true, states: { on: 'tkt builds this app\'s tickets; Self Evident hands none to its own planner', off: 'this app\'s tasks go to Self Evident\'s own planner and builder' } },
      // Where tkt reads the tickets (Sandy, 2026-11-10: "Linear is the home"). The team and the key are Linear's own, under Integrations › Linear.
      { key: 'linear', label: 'Tickets live in Linear', kind: 'switch', states: { on: 'tkt reads and updates this app\'s tickets in Linear, in the team under Integrations › Linear; Self Evident makes the issue from an approved brief', off: 'tkt reads this app\'s tickets from Self Evident' } },
    ],
    calls: true, perApp: true, docs: 'https://gitlab.com/rogs/tkt',
    actions: [
      { key: 'start', name: 'Start', does: '`tkt start <ticket>`: a worktree and a tab; start-ticket reads the ticket here, moves it to in progress and plans from the brief.' },
      { key: 'approve', name: 'Approve the plan', does: '`tkt approve <ticket>`: work-ticket builds, commits, opens the pull request and hands off on the ticket.' },
      { key: 'review', name: 'Review', does: '`tkt run <ticket> review`: review-pr in a fresh session, its verdict on the pull request; verify-pr runs the human verification steps.' },
      { key: 'merge', name: 'Merge and finish', does: '`tkt merge <ticket> --passed`, then `tkt done`: finish-ticket merges and moves the ticket to done.' },
      { key: 'setup', name: 'Set up what\'s missing', does: 'Writes everything tkt and its skills read from the repo (the tracker guide, the forge, the workflow, the domain docs, the pull request template, the Ticket lifecycle block in CLAUDE.md) from the app, the repo and the house profile; installs tkt\'s hooks with tkt\'s own installer; commits to the base branch and pushes. Only what tkt itself still lacks goes to the agent.', kind: 'ask' },
    ],
  },
  {
    // Storybook, per app (SHAPE.md: the home of the design system, stories and mockups). Its command and URL were
    // plain app setup until 2026-11-09; the check reads the repo for the screen-map standard (storybook.ts).
    key: 'storybook', name: 'Storybook', role: 'Mockups', does: 'This app\'s mockups, as stories: the real ones, after the sketches; Mockups shows them inside Self Evident, the agent opens one to show what it means, and the screen map draws the app as the user walks it',
    fields: [ // the switch is the integration; the command and URL have defaults read from the repo (storybookDefaults), set here only when those are wrong
      { key: 'on', label: 'Mockups in Storybook', kind: 'switch', required: true, states: { on: 'this app\'s mockups are stories, checked against the standard', off: 'no Storybook for this app' } },
      { key: 'cmd', label: 'Command', placeholder: 'default: the repo\'s storybook script, with --no-open' },
      { key: 'url', label: 'URL', placeholder: 'default: http://localhost:6006, or the port the script names' },
    ],
    calls: true, perApp: true, docs: 'https://github.com/zigbang/storybook-addon-story-flow',
    actions: [
      { key: 'start', name: 'Start', does: 'Starts Storybook from the checkout with the command and keeps it running; Mockups shows it.', kind: 'start' },
      { key: 'map', name: 'Open the map', does: 'The screen map: every page as the user sees it, and the taps between them. Here once the check finds a map and Storybook is up.', kind: 'link' },
      { key: 'setup', name: 'Set up Storybook', does: 'Installs Storybook to the standard when the repo has none (Storybook\'s own installer, docs only), then the screen map: the add-on, its stylesheet, the main and preview entries, a first map, a line in the README; commits on the base branch and pushes. Every step is skipped when already done. Only what cannot be done from here goes to the agent.', kind: 'ask' },
    ],
  },
  {
    key: 'posthog', name: 'PostHog', role: 'Telemetry', does: 'What users do, and every log line: events, flags, experiments, LLM calls, logs over OTLP',
    fields: [
      { key: 'host', label: 'Host', placeholder: 'https://us.i.posthog.com' },
      { key: 'project_id', label: 'Project id', placeholder: '677236' },
      { key: 'key_env', label: 'Key variable', placeholder: 'POSTHOG_API_KEY (in .env, never here)', secret: true },
    ],
    calls: false, actions: [],
  },
  {
    key: 'datadog', name: 'Datadog', role: 'Telemetry', does: 'What services do: traces, logs, errors',
    fields: [
      { key: 'site', label: 'Site', placeholder: 'datadoghq.com' },
      { key: 'service', label: 'Service', placeholder: 'the service name' },
      { key: 'key_env', label: 'Key variable', placeholder: 'DD_API_KEY (in .env, never here)', secret: true },
    ],
    calls: false, actions: [],
  },
  {
    key: 'linear', name: 'Linear', role: 'Planning', does: 'Tasks as Linear issues: made from an approved brief, commented on, moved as the build goes',
    fields: [
      { key: 'team', label: 'Team key', placeholder: 'HG', required: true },
      { key: 'key_env', label: 'Key variable', placeholder: 'LINEAR_API_KEY (in the engine\'s environment)', required: true, secret: true },
    ],
    calls: true, docs: 'https://linear.app/settings/account/security',
    actions: [
      { key: 'issue.create', name: 'Create an issue', does: 'A Linear issue from the task and a step\'s content, linked back; run again, it updates that issue.' },
      { key: 'issue.comment', name: 'Comment', does: 'A step\'s content as a comment on the task\'s issue.' },
      { key: 'issue.move', name: 'Move the issue', does: 'The task\'s issue to a state, like In progress or Done.' },
    ],
  },
  {
    key: 'confluence', name: 'Confluence', role: 'Docs', does: 'Pages from steps: an ADR published as an RFC, a brief as a spec',
    fields: [
      { key: 'site', label: 'Site', placeholder: 'https://yourteam.atlassian.net', required: true },
      { key: 'email', label: 'Account email', placeholder: 'the account the key belongs to', required: true },
      { key: 'space', label: 'Space key', placeholder: 'ENG', required: true },
      { key: 'parent', label: 'Parent page id', placeholder: 'optional: new pages go under it' },
      { key: 'key_env', label: 'Key variable', placeholder: 'CONFLUENCE_API_TOKEN (in the engine\'s environment)', required: true, secret: true },
    ],
    calls: true, docs: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    actions: [
      { key: 'page.publish', name: 'Publish a page', does: 'A step\'s content as a page in the space, from Markdown; run again, it updates that page.' },
    ],
  },
]

export type Values = Record<string, Record<string, string>> // integration → field → value
export interface Effective { value: string | null; from: 'app' | 'workspace' | null }

/** Each integration's fields as the app sees them: its override, else the workspace's value, else unset. */
export function effectiveIntegrations(workspace: Values = {}, app: Values = {}): Record<string, Record<string, Effective>> {
  return Object.fromEntries(INTEGRATIONS.map((i) => [i.key, Object.fromEntries(i.fields.map((f) => {
    const own = app[i.key]?.[f.key]?.trim()
    const shared = workspace[i.key]?.[f.key]?.trim()
    return [f.key, own ? { value: own, from: 'app' } : shared ? { value: shared, from: 'workspace' } : { value: null, from: null }]
  }))]))
}

/** Only known integrations and fields, trimmed, empties dropped: what is stored is what inherits nothing. */
export function cleanValues(v: unknown): Values {
  const out: Values = {}
  for (const i of INTEGRATIONS) {
    const given = (v as Values | undefined)?.[i.key] ?? {}
    const kept = Object.fromEntries(i.fields.map((f) => [f.key, typeof given[f.key] === 'string' ? given[f.key].trim() : '']).filter(([, x]) => x))
    if (Object.keys(kept).length) out[i.key] = kept
  }
  return out
}

/**
 * Where one stands: nothing set; set but missing required fields; set, but its key's variable isn't in the engine's
 * environment (only for those the engine calls); or ready.
 */
export interface Status { state: 'off' | 'incomplete' | 'no-key' | 'ready'; missing: string[]; keyVar: string | null }

export function integrationStatus(i: Integration, values: Record<string, string | null | undefined>, env: Record<string, string | undefined> = process.env): Status {
  const val = (k: string) => values[k]?.trim() || null
  const keyVar = val(i.fields.find((f) => f.secret)?.key ?? '')
  const switched = i.fields.find((f) => f.kind === 'switch')
  if (switched) return { state: val(switched.key) === 'true' ? 'ready' : 'off', missing: [], keyVar } // on or off; nothing to fill in
  const missing = i.fields.filter((f) => f.required && !val(f.key)).map((f) => f.label)
  if (!i.fields.some((f) => val(f.key))) return { state: 'off', missing, keyVar }
  if (missing.length) return { state: 'incomplete', missing, keyVar }
  if (i.calls && keyVar && !env[keyVar]) return { state: 'no-key', missing, keyVar }
  return { state: 'ready', missing, keyVar }
}

/** Each integration's status from effective values (an app's) or plain ones (the workspace's). */
export function statuses(values: Values | Record<string, Record<string, Effective>>, env: Record<string, string | undefined> = process.env): Record<string, Status> {
  const plain = (v: Record<string, string | Effective> = {}) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x : x?.value]))
  return Object.fromEntries(INTEGRATIONS.map((i) => [i.key, integrationStatus(i, plain((values as Record<string, Record<string, string | Effective>>)[i.key]), env)]))
}

export class IntegrationError extends Error {}

/** What a per-app check needs from the app: tkt's context, or Storybook's; `deps` only in tests. */
export interface Local { tkt?: { ctx: TktContext; deps?: TktDeps }; storybook?: { ctx: StorybookContext; deps?: StorybookDeps } }

/**
 * Tries the connection: signs in with the key and finds the team or space; for tkt, looks for the runner and the
 * tracker guide in the app's checkout; for Storybook, reads the repo for the screen-map standard. Says what it
 * found, or what went wrong, and for Storybook the link to the map when there is one to open.
 */
export async function checkIntegration(key: string, values: Record<string, string | null | undefined>, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, local?: Local): Promise<Check> {
  const i = INTEGRATIONS.find((x) => x.key === key)
  if (!i) throw new IntegrationError(`no integration ${key}`)
  if (!i.calls) throw new IntegrationError(`${i.name} is read by each app, not the engine, so there is nothing to check here`)
  const st = integrationStatus(i, values, env)
  if (key === 'tkt') {
    if (!local?.tkt) throw new IntegrationError('tkt is switched on per app: check it from an app\'s Integrations')
    if (st.state === 'off') return { ok: false, detail: 'tkt is off for this app: its tasks go to Self Evident\'s own planner.' }
    return checkTkt(local.tkt.ctx, local.tkt.deps)
  }
  if (key === 'storybook') {
    if (!local?.storybook) throw new IntegrationError('Storybook is set per app: check it from an app\'s Integrations')
    if (st.state === 'off') return { ok: false, detail: 'Storybook is off for this app: switch it on and the check reads the repo.' }
    return checkStorybook(local.storybook.ctx, local.storybook.deps)
  }
  if (st.state === 'off' || st.state === 'incomplete') return { ok: false, detail: `Missing: ${st.missing.join(', ')}.` }
  if (st.state === 'no-key') return { ok: false, detail: `${st.keyVar} isn't set in the engine's environment. Add it there and restart the engine.` }
  const token = env[st.keyVar!]!
  const v = (k: string) => values[k]!.trim()
  try {
    if (key === 'linear') {
      const client = new LinearClient({ apiKey: token })
      const me = await client.viewer
      const teams = await client.teams({ filter: { key: { eq: v('team').toUpperCase() } } })
      const team = teams.nodes[0]
      return team ? { ok: true, detail: `Signed in as ${me.name}; team ${team.key} (${team.name}) found.` } : { ok: false, detail: `Signed in as ${me.name}, but there is no team with key ${v('team')}.` }
    }
    if (key === 'confluence') {
      const site = v('site').replace(/\/+$/, '')
      const auth = `Basic ${Buffer.from(`${v('email')}:${token}`).toString('base64')}`
      const res = await fetcher(`${site}/wiki/api/v2/spaces?keys=${encodeURIComponent(v('space'))}`, { headers: { authorization: auth, accept: 'application/json' } })
      if (res.status === 401 || res.status === 403) return { ok: false, detail: `${site} refused the key (${res.status}). Check the email and the key.` }
      if (!res.ok) return { ok: false, detail: `${site} answered ${res.status}.` }
      const space = ((await res.json()) as { results?: { key: string; name: string }[] }).results?.[0]
      return space ? { ok: true, detail: `Connected to ${site}; space ${space.key} (${space.name}) found.` } : { ok: false, detail: `Connected to ${site}, but there is no space with key ${v('space')} this account can see.` }
    }
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message ?? e) }
  }
  throw new IntegrationError(`no check for ${i.name} yet`)
}

export interface SetupResult { done: boolean; did: string[]; ask: string | null; detail: string }

/**
 * "Set up what's missing": what the engine can do itself, done; what is left, as the job for the agent (`ask`), with the
 * check's words first; or nothing to hand over, when the person has to set something (the checkout, the values) first.
 */
export async function setupIntegration(key: string, values: Record<string, string | null | undefined>, env: Record<string, string | undefined> = process.env, local?: Local): Promise<SetupResult> {
  const i = INTEGRATIONS.find((x) => x.key === key)
  if (!i) throw new IntegrationError(`no integration ${key}`)
  const action = i.actions.find((a) => a.kind === 'ask')
  if (!action) throw new IntegrationError(`nothing to set up for ${i.name}`)
  const st = integrationStatus(i, values, env)
  if (key === 'tkt') {
    if (!local?.tkt) throw new IntegrationError('tkt is switched on per app: set it up from an app\'s Integrations')
    if (st.state === 'off') return { done: false, did: [], ask: null, detail: 'tkt is off for this app: switch it on first.' }
    return setupTkt(local.tkt.ctx, local.tkt.deps)
  }
  if (key === 'storybook') {
    if (!local?.storybook) throw new IntegrationError('Storybook is set per app: set it up from an app\'s Integrations')
    if (st.state === 'off') return { done: false, did: [], ask: null, detail: 'Storybook is off for this app: switch it on first.' }
    const ctx = local.storybook.ctx
    if (!ctx.repoPath) return { done: false, did: [], ask: null, detail: 'No local checkout under Repo: Storybook is installed in the repo. Set it under Settings › Repo first.' }
    const inst = await installStorybook(ctx, local.storybook.deps)
    const d = await storybookDefaults(ctx.repoPath) // the installer may have just made the script the defaults come from
    const check = await checkStorybook({ ...ctx, url: ctx.url ?? d?.url ?? null, cmd: ctx.cmd ?? d?.cmd ?? null }, local.storybook.deps)
    if (check.ok && !inst.left.length) return { done: true, did: inst.did, ask: null, detail: check.detail }
    const ask = [`Self Evident's Storybook check for ${ctx.app.name} says: ${check.detail}`, ...(inst.left.length ? ['Left from the install:', ...inst.left.map((l) => `- ${l}`)] : []), '', await installAsk()].join('\n')
    return { done: false, did: inst.did, ask, detail: check.detail }
  }
  throw new IntegrationError(`nothing to set up for ${i.name}`)
}
