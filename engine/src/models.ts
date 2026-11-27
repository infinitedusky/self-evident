/**
 * Which model each kind of job runs on (Sandy, 2026-11-26: "can we add this as an option in the settings, then … you
 * can choose it as an option for tasks"; asked which, "per kind of job", and the proxy "once, for all apps").
 *
 * Until now an app had one model (`setup.model`), on its Claude account (account.ts). Two things are added:
 *
 * - **The model proxy**, an integration (integrations.ts, `proxy`; docs/integrations/proxy.md): a gateway that speaks
 *   Anthropic's Messages API and serves other vendors' models behind it (Lazer's proxy, LiteLLM). Its address, the
 *   name of its key's variable and the models it offers are set once under All apps › Integrations.
 * - **A model per job**, per app (`setup.models_by_job`, under the app's Settings › Agents): a job left out runs as
 *   before. A value is a model's name; `proxy/<name>` is that model through the proxy.
 *
 * A job on the proxy is the same Claude Code loop, pointed at another address: the SDK is given `ANTHROPIC_BASE_URL`,
 * the proxy's key as a bearer token, and the model's name for every size of model it would otherwise pick itself (a
 * proxy knows its own names, not Anthropic's ids). The app's Claude login folder is kept, so the conversation is
 * stored where the app's others are; the token wins over the login for where the requests go (tried on 2026-11-26,
 * LOG.md). One model carries on another's conversation, in both directions (tried the same day).
 *
 * As with an app's own account, a choice that can't be used is an error said plainly, never a quiet fall back: the
 * point of choosing is knowing which model did the work, and whose bill it is on.
 *
 * The key is in the environment of the agent that runs on the proxy, as an app's own API key is: Claude Code reads
 * it from there. No other agent is given it.
 */
import { eq } from 'drizzle-orm'
import { accountEnv, configDirOf, CREDENTIALS } from './account.js'
import { db } from './db/client.js'
import { workspace } from './db/schema.js'
import { effectiveIntegrations, INTEGRATIONS, integrationStatus, type Status, type Values } from './integrations.js'
import { PlanError } from './issues.js'
import { envFor } from './secrets.js'

type Env = Record<string, string | undefined>

/** The kinds of job an app's agents do, in the order they happen to a task. */
export const MODEL_JOBS = [
  { key: 'talk', name: 'Conversation', what: 'The agent you talk with: a task\'s, an idea\'s, the app\'s' },
  { key: 'prototype', name: 'Prototype', what: 'The agent that builds a prototype' },
  { key: 'checks', name: 'Checks before the build', what: 'Fresh agents that read the prototype and the plan: analysis, draft ADR, blast radius, audit' },
  { key: 'plan', name: 'Plan', what: 'The planner, cutting a task into sub-tasks' },
  { key: 'build', name: 'Build', what: 'The builders, one per sub-task' },
  { key: 'review', name: 'Check after the build', what: 'Fresh agents that read the build against its criteria, and the reviewers' },
] as const
export type ModelJob = (typeof MODEL_JOBS)[number]['key']
const JOB_KEYS = new Set<string>(MODEL_JOBS.map((j) => j.key))
export type JobModels = Partial<Record<ModelJob, string>>

/** In front of a model's name: through the proxy. */
export const VIA_PROXY = 'proxy/'
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$/

/**
 * The model a job runs on when the app chose none for it. A prototype is for speed, so its agent runs on Sonnet
 * (Sandy, 2026-11-10: "the prototype agent should be sonnet and it should build fast"); an app can name another with
 * `prototype_model`. Every other job runs on the app's `model`, or the harness's default.
 */
export const PROTOTYPE_MODEL = 'claude-sonnet-5-5'
export const modelFor = (setup: { model?: string; prototype_model?: string }, prototype: boolean) => (prototype ? setup.prototype_model || PROTOTYPE_MODEL : setup.model)

const jobsOf = (setup: unknown): JobModels => ((setup ?? {}) as { models_by_job?: JobModels }).models_by_job ?? {}
/** What the app chose for a job, as stored; undefined when it chose nothing. */
export const chosenFor = (setup: unknown, job: ModelJob) => jobsOf(setup)[job]?.trim() || undefined
/** The model's name a job runs on, for a line that says so (a run's row): the proxy's own name for it, without the prefix. */
export function modelNameFor(setup: unknown, job: ModelJob): string | undefined {
  const chosen = chosenFor(setup, job)
  if (chosen) return chosen.startsWith(VIA_PROXY) ? chosen.slice(VIA_PROXY.length) : chosen
  return modelFor((setup ?? {}) as { model?: string; prototype_model?: string }, job === 'prototype')
}

/** What Settings saved for an app's jobs, tidied: known jobs only, each a model's name; an empty one is dropped. */
export function cleanJobModels(given: unknown): JobModels {
  const out: JobModels = {}
  for (const [job, value] of Object.entries((given ?? {}) as Record<string, unknown>)) {
    if (!JOB_KEYS.has(job) || typeof value !== 'string' || !value.trim()) continue
    const v = value.trim()
    const name = v.startsWith(VIA_PROXY) ? v.slice(VIA_PROXY.length) : v
    if (!NAME.test(name)) throw new PlanError(`"${v.slice(0, 40)}" isn't a model's name.`)
    out[job as ModelJob] = v
  }
  return out
}

const PROXY = INTEGRATIONS.find((i) => i.key === 'proxy')!
export interface Proxy { url: string; keyVar: string; models: string[]; small: string | null }
/** The proxy as its fields say it: the address without a trailing slash or `/v1`, the models as a list. Null until the address and the key's variable are set. */
export function proxyOf(values: Record<string, string | null | undefined> = {}): Proxy | null {
  const v = (k: string) => values[k]?.trim() || ''
  if (!v('url') || !v('key_env')) return null
  return { url: v('url').replace(/\/+$/, '').replace(/\/v1$/, ''), keyVar: v('key_env'), models: listed(v('models')), small: v('small') || null }
}
/** The models a field lists: commas, spaces or lines between them, each once. */
export const listed = (text: string) => [...new Set(text.split(/[\s,]+/).map((m) => m.trim()).filter(Boolean))]

export interface Agent { /** The model's name as the SDK is given it; undefined: the harness's own default. */ model?: string; /** The SDK's `env` option, when it is not the engine's own environment. */ env?: Env }

/**
 * What the SDK is given for a job: the model, and the environment that puts it on the app's account or on the proxy.
 * Pure: `values` are the proxy's fields as the app sees them, `env` holds the keys (secrets.ts over the engine's own).
 */
export function resolveAgent(setup: unknown, job: ModelJob, values: Record<string, string | null | undefined> = {}, env: Env = process.env): Agent {
  const chosen = chosenFor(setup, job)
  if (!chosen?.startsWith(VIA_PROXY)) return { model: chosen ?? modelFor((setup ?? {}) as { model?: string; prototype_model?: string }, job === 'prototype'), ...accountEnv(setup, env) }
  const model = chosen.slice(VIA_PROXY.length)
  const name = MODEL_JOBS.find((j) => j.key === job)!.name
  const proxy = proxyOf(values)
  if (!proxy) throw new PlanError(`${name} runs on ${model} through the model proxy, and the proxy isn't set up. Set it under Settings › All apps › Integrations › Model proxy, or choose another model under this app's Settings › Agents.`)
  const key = env[proxy.keyVar]
  if (!key) throw new PlanError(`${name} runs on ${model} through the model proxy, and ${proxy.keyVar} has no key. Paste it under Settings › All apps › Integrations › Model proxy, or choose another model under this app's Settings › Agents.`)
  const dir = configDirOf(setup) ?? env.CLAUDE_CONFIG_DIR
  const rest = Object.fromEntries(Object.entries(env).filter(([k]) => !CREDENTIALS.includes(k) && k !== proxy.keyVar))
  const small = proxy.small ?? model
  return {
    model,
    env: {
      ...rest, ...(dir ? { CLAUDE_CONFIG_DIR: dir } : {}),
      ANTHROPIC_BASE_URL: proxy.url, ANTHROPIC_AUTH_TOKEN: key,
      // Every size Claude Code picks by itself (a title, a sub-agent asked for "sonnet"), by a name the proxy knows.
      ANTHROPIC_DEFAULT_OPUS_MODEL: model, ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: small, ANTHROPIC_SMALL_FAST_MODEL: small,
    },
  }
}

/** The proxy's status from its fields as an app sees them. */
export const integrationStatusOfProxy = (eff: Record<string, { value: string | null }> = {}, env: Env = process.env) => integrationStatus(PROXY, Object.fromEntries(Object.entries(eff).map(([k, x]) => [k, x.value])), env)

export interface AppRef { key: string; workspaceId: string; setup: unknown }
/** The proxy's fields as an app sees them (its own over the workspace's), and the keys it can read. */
export async function proxyFor(a: AppRef | null | undefined): Promise<{ values: Record<string, string | null>; env: Env; status: Status }> {
  const [w] = a ? await db.select().from(workspace).where(eq(workspace.id, a.workspaceId)) : await db.select().from(workspace).limit(1)
  const eff = effectiveIntegrations(((w?.settings ?? {}) as { integrations?: Values }).integrations, ((a?.setup ?? {}) as { integrations?: Values }).integrations).proxy ?? {}
  const values = Object.fromEntries(Object.entries(eff).map(([k, x]) => [k, x.value]))
  const env = await envFor(a?.key)
  return { values, env, status: integrationStatus(PROXY, values, env) }
}

/** What the SDK is given for one of an app's jobs. Reads the proxy only when the job is on it. */
export async function agentFor(a: AppRef | null | undefined, job: ModelJob): Promise<Agent> {
  if (!chosenFor(a?.setup, job)?.startsWith(VIA_PROXY)) return resolveAgent(a?.setup, job)
  const p = await proxyFor(a)
  return resolveAgent(a?.setup, job, p.values, { ...process.env, ...p.env })
}

export interface JobModelView { key: ModelJob; name: string; what: string; /** As stored: a name, `proxy/<name>`, or null for none chosen. */ chosen: string | null; /** What it runs on with none chosen; null: the agent's own default. */ unchosen: string | null }
export interface ModelsView { jobs: JobModelView[]; /** The proxy's models, to choose from: `value` is what is stored. */ offered: { value: string; name: string }[]; proxy: Status['state']; /** A job is on the proxy and the proxy can't be used: why, in a line. */ problem: string | null }
/** An app's jobs with what each runs on, and the proxy's models to choose from, for Settings › Agents. */
export function describeModels(setup: unknown, values: Record<string, string | null | undefined>, status: Status): ModelsView {
  const jobs = MODEL_JOBS.map((j) => ({ ...j, chosen: chosenFor(setup, j.key) ?? null, unchosen: modelFor((setup ?? {}) as { model?: string; prototype_model?: string }, j.key === 'prototype') ?? null }))
  const onProxy = jobs.some((j) => j.chosen?.startsWith(VIA_PROXY))
  const problem = !onProxy || status.state === 'ready' ? null
    : status.state === 'no-key' ? `${status.keyVar} has no key, so the jobs on the proxy won't start.`
    : 'The model proxy isn\'t set up, so the jobs on it won\'t start.'
  return { jobs, offered: (proxyOf(values)?.models ?? []).map((m) => ({ value: VIA_PROXY + m, name: m })), proxy: status.state, problem }
}

/**
 * Tries the proxy: one short request per model it offers (twelve at most), so a mistyped name is found here and not
 * by a build. Says which answered and what the others said.
 */
export async function checkProxy(values: Record<string, string | null | undefined>, key: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  const proxy = proxyOf(values)!
  if (!proxy.models.length) return { ok: false, detail: 'Missing: Models offered.' }
  const models = [...new Set([...proxy.models, ...(proxy.small ? [proxy.small] : [])])].slice(0, 12)
  const tried = await Promise.all(models.map(async (model) => {
    try {
      const res = await fetcher(`${proxy.url}/v1/messages`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Say ok.' }] }) })
      if (res.ok) return { model, status: 200, said: '' }
      const body = await res.text().catch(() => '')
      let said = body
      try { const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }; said = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? body } catch { /* not JSON: its own words */ }
      return { model, status: res.status, said: said.replace(/\s+/g, ' ').trim().slice(0, 160) }
    } catch (e) { return { model, status: 0, said: String((e as Error)?.message ?? e).slice(0, 160) } }
  }))
  const bad = tried.filter((t) => t.status !== 200)
  if (bad.length && bad.every((t) => t.status === 401 || t.status === 403)) return { ok: false, detail: `${proxy.url} refused the key (${bad[0].status}).` }
  if (bad.length === tried.length && bad.every((t) => t.status === 0)) return { ok: false, detail: `Couldn't reach ${proxy.url}: ${bad[0].said}` }
  if (bad.length) return { ok: false, detail: `${tried.length - bad.length} of ${tried.length} models answered. Not ${bad.map((t) => `${t.model} (${t.status || 'no answer'}${t.said ? `: ${t.said}` : ''})`).join('; ')}.` }
  return { ok: true, detail: `Connected to ${proxy.url}; ${tried.length === 1 ? `${tried[0].model} answered` : `all ${tried.length} models answered`}.` }
}
