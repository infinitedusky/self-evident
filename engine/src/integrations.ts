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

/** `secret` marks the field naming the key's variable; `required` ones must be set before it counts as connected. */
export interface Field { key: string; label: string; placeholder?: string; required?: boolean; secret?: boolean }
/** What a workflow step can do with it: content from an earlier step in, a link and an id back. */
export interface Action { key: string; name: string; does: string }
export interface Integration {
  key: string; name: string; role: string; does: string; fields: Field[]
  calls: boolean // the engine calls it, so its key must be in the engine's environment
  actions: Action[]
  docs?: string // where to make a key
}

export const INTEGRATIONS: Integration[] = [
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

/** Tries the connection: signs in with the key and finds the team or space. Says what it found, or what went wrong. */
export async function checkIntegration(key: string, values: Record<string, string | null | undefined>, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  const i = INTEGRATIONS.find((x) => x.key === key)
  if (!i) throw new IntegrationError(`no integration ${key}`)
  if (!i.calls) throw new IntegrationError(`${i.name} is read by each app, not the engine, so there is nothing to check here`)
  const st = integrationStatus(i, values, env)
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
