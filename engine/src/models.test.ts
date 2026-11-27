/** Which model each kind of job runs on: the app's, or one through the model proxy; never a quiet fall back. Made-up names throughout. */
import { describe, expect, it } from 'vitest'
import { checkIntegration, INTEGRATIONS, integrationStatus } from './integrations.js'
import { checkProxy, cleanJobModels, describeModels, listed, MODEL_JOBS, modelNameFor, proxyOf, resolveAgent } from './models.js'

const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'default-key', CLAUDE_CODE_OAUTH_TOKEN: 'default-token', CLAUDE_CONFIG_DIR: '/home/sample/.claude', PROXY_KEY: 'proxy-key' }
const values = { url: 'https://proxy.example.com/v1/', key_env: 'PROXY_KEY', models: 'gpt-sample-2, gemini-sample-pro\nqwen-sample-max', small: 'gpt-sample-mini' }
const PROXY = INTEGRATIONS.find((i) => i.key === 'proxy')!

describe('cleanJobModels', () => {
  it('keeps known jobs with a model’s name, and drops the rest', () => {
    expect(cleanJobModels({ review: ' proxy/gpt-sample-2 ', build: 'claude-sample-1', talk: '', nonsense: 'x', plan: 3 })).toEqual({ review: 'proxy/gpt-sample-2', build: 'claude-sample-1' })
    expect(cleanJobModels(null)).toEqual({})
  })
  it('refuses what is not a model’s name', () => {
    expect(() => cleanJobModels({ build: 'gpt sample; rm -rf' })).toThrow("isn't a model's name")
    expect(() => cleanJobModels({ build: 'proxy/' })).toThrow("isn't a model's name")
  })
})

describe('proxyOf', () => {
  it('reads the address without its /v1, and the models as a list', () => {
    expect(proxyOf(values)).toEqual({ url: 'https://proxy.example.com', keyVar: 'PROXY_KEY', models: ['gpt-sample-2', 'gemini-sample-pro', 'qwen-sample-max'], small: 'gpt-sample-mini' })
    expect(proxyOf({ url: 'https://proxy.example.com' })).toBeNull()
    expect(listed('a, a b')).toEqual(['a', 'b'])
  })
})

describe('resolveAgent', () => {
  it('runs a job the app chose nothing for as before: the app’s model, on its account', () => {
    expect(resolveAgent({ model: 'claude-sample-1' }, 'build', values, env)).toEqual({ model: 'claude-sample-1' })
    expect(resolveAgent({}, 'talk', values, env)).toEqual({ model: undefined })
    expect(resolveAgent({}, 'prototype', values, env).model).toBe('claude-sonnet-5-5')
    expect(resolveAgent({ model: 'claude-sample-1', account: { key_env: 'PROXY_KEY' } }, 'plan', values, env).env!.ANTHROPIC_API_KEY).toBe('proxy-key')
  })
  it('runs a job on a plain name on the app’s account, with that model', () => {
    expect(resolveAgent({ model: 'claude-sample-1', models_by_job: { build: 'claude-sample-small' } }, 'build', values, env)).toEqual({ model: 'claude-sample-small' })
  })
  it('points a job on the proxy at it: its address, its key as the token, its names for every size, and no other credential', () => {
    const got = resolveAgent({ model: 'claude-sample-1', models_by_job: { review: 'proxy/gpt-sample-2' } }, 'review', values, env)
    expect(got.model).toBe('gpt-sample-2')
    expect(got.env).toMatchObject({ PATH: '/bin', ANTHROPIC_BASE_URL: 'https://proxy.example.com', ANTHROPIC_AUTH_TOKEN: 'proxy-key', ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-sample-2', ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-sample-2', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-sample-mini', ANTHROPIC_SMALL_FAST_MODEL: 'gpt-sample-mini', CLAUDE_CONFIG_DIR: '/home/sample/.claude' })
    expect(got.env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(got.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
    expect(got.env).not.toHaveProperty('PROXY_KEY')
    // the other jobs of the same app are untouched
    expect(resolveAgent({ model: 'claude-sample-1', models_by_job: { review: 'proxy/gpt-sample-2' } }, 'build', values, env)).toEqual({ model: 'claude-sample-1' })
  })
  it('keeps the app’s own login folder, so the conversation is stored with the app’s others; the small model is the job’s when none is named', () => {
    const got = resolveAgent({ account: { config_dir: '/home/sample/.claude-work' }, models_by_job: { talk: 'proxy/gpt-sample-2' } }, 'talk', { ...values, small: '' }, env)
    expect(got.env!.CLAUDE_CONFIG_DIR).toBe('/home/sample/.claude-work')
    expect(got.env!.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-sample-2')
  })
  it('says so, and never falls back, when the proxy is not set up or has no key', () => {
    const setup = { model: 'claude-sample-1', models_by_job: { review: 'proxy/gpt-sample-2' } }
    expect(() => resolveAgent(setup, 'review', {}, env)).toThrow("Check after the build runs on gpt-sample-2 through the model proxy, and the proxy isn't set up")
    expect(() => resolveAgent(setup, 'review', values, { PATH: '/bin' })).toThrow('PROXY_KEY has no key')
  })
})

describe('modelNameFor', () => {
  it('is the name a run’s row shows: the proxy’s own name, the plain one, or the app’s', () => {
    const setup = { model: 'claude-sample-1', models_by_job: { review: 'proxy/gpt-sample-2', build: 'claude-sample-small' } }
    expect(modelNameFor(setup, 'review')).toBe('gpt-sample-2')
    expect(modelNameFor(setup, 'build')).toBe('claude-sample-small')
    expect(modelNameFor(setup, 'plan')).toBe('claude-sample-1')
    expect(modelNameFor({}, 'plan')).toBeUndefined()
  })
})

describe('describeModels', () => {
  it('lists every job with what it runs on, and the proxy’s models to choose from', () => {
    const got = describeModels({ model: 'claude-sample-1', models_by_job: { review: 'proxy/gpt-sample-2' } }, values, integrationStatus(PROXY, values, env))
    expect(got.jobs.map((j) => j.key)).toEqual(MODEL_JOBS.map((j) => j.key))
    expect(got.jobs.find((j) => j.key === 'review')).toMatchObject({ chosen: 'proxy/gpt-sample-2', unchosen: 'claude-sample-1' })
    expect(got.jobs.find((j) => j.key === 'prototype')).toMatchObject({ chosen: null, unchosen: 'claude-sonnet-5-5' })
    expect(got.offered).toEqual([{ value: 'proxy/gpt-sample-2', name: 'gpt-sample-2' }, { value: 'proxy/gemini-sample-pro', name: 'gemini-sample-pro' }, { value: 'proxy/qwen-sample-max', name: 'qwen-sample-max' }])
    expect(got).toMatchObject({ proxy: 'ready', problem: null })
  })
  it('says what is wrong only when a job is on the proxy', () => {
    const noKey = integrationStatus(PROXY, values, {})
    expect(describeModels({ models_by_job: { review: 'proxy/gpt-sample-2' } }, values, noKey).problem).toBe("PROXY_KEY has no key, so the jobs on the proxy won't start.")
    expect(describeModels({}, values, noKey).problem).toBeNull()
    expect(describeModels({ models_by_job: { review: 'proxy/gpt-sample-2' } }, {}, integrationStatus(PROXY, {}, env)).problem).toMatch(/isn't set up/)
  })
})

describe('checkProxy', () => {
  const answering = (bad: Record<string, { status: number; body: string }> = {}) => {
    const asked: { url: string; model: string; auth: string }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      const model = (JSON.parse(String(init.body)) as { model: string }).model
      asked.push({ url, model, auth: (init.headers as Record<string, string>).authorization })
      const b = bad[model]
      return new Response(b ? b.body : '{"content":[]}', { status: b ? b.status : 200 })
    }) as unknown as typeof fetch
    return { asked, fetcher }
  }
  it('asks every model it offers, and its small one, for a word', async () => {
    const { asked, fetcher } = answering()
    expect(await checkProxy(values, 'proxy-key', fetcher)).toEqual({ ok: true, detail: 'Connected to https://proxy.example.com; all 4 models answered.' })
    expect(asked.map((a) => a.model).sort()).toEqual(['gemini-sample-pro', 'gpt-sample-2', 'gpt-sample-mini', 'qwen-sample-max'])
    expect(asked[0]).toMatchObject({ url: 'https://proxy.example.com/v1/messages', auth: 'Bearer proxy-key' })
  })
  it('names the model that did not answer, in the proxy’s words', async () => {
    const { fetcher } = answering({ 'qwen-sample-max': { status: 404, body: '{"error":{"message":"unknown model qwen-sample-max"}}' } })
    expect(await checkProxy(values, 'proxy-key', fetcher)).toEqual({ ok: false, detail: '3 of 4 models answered. Not qwen-sample-max (404: unknown model qwen-sample-max).' })
  })
  it('says the key was refused', async () => {
    const all = Object.fromEntries(['gpt-sample-2', 'gemini-sample-pro', 'qwen-sample-max', 'gpt-sample-mini'].map((m) => [m, { status: 401, body: '{"error":"bad key"}' }]))
    expect((await checkProxy(values, 'nope', answering(all).fetcher)).detail).toBe('https://proxy.example.com refused the key (401).')
  })
  it('is the check behind the integration’s page', async () => {
    expect(await checkIntegration('proxy', values, env, answering().fetcher)).toMatchObject({ ok: true })
    expect(await checkIntegration('proxy', { ...values, models: '' }, env, answering().fetcher)).toEqual({ ok: false, detail: 'Missing: Models offered.' })
    expect(await checkIntegration('proxy', values, {}, answering().fetcher)).toMatchObject({ ok: false, detail: expect.stringContaining('PROXY_KEY has no key') })
  })
})
