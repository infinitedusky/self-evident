/** Integrations: set for the workspace, overridden per app field by field; an empty field inherits. */
import { describe, expect, it } from 'vitest'
import { checkIntegration, cleanValues, effectiveIntegrations, integrationStatus, INTEGRATIONS, statuses } from './integrations.js'

describe('effectiveIntegrations', () => {
  it('an app override wins field by field; the rest inherits from the workspace', () => {
    const e = effectiveIntegrations({ posthog: { host: 'https://us.i.posthog.com', project_id: '1' } }, { posthog: { project_id: '677236' } })
    expect(e.posthog.project_id).toEqual({ value: '677236', from: 'app' })
    expect(e.posthog.host).toEqual({ value: 'https://us.i.posthog.com', from: 'workspace' })
    expect(e.posthog.key_env).toEqual({ value: null, from: null })
    expect(e.datadog.site).toEqual({ value: null, from: null })
  })
  it('a blank override inherits rather than clearing', () => {
    expect(effectiveIntegrations({ posthog: { host: 'h' } }, { posthog: { host: '  ' } }).posthog.host).toEqual({ value: 'h', from: 'workspace' })
  })
})

describe('cleanValues', () => {
  it('keeps known integrations and fields, trimmed, and drops empties', () => {
    expect(cleanValues({ posthog: { host: ' h ', project_id: '', nope: 'x' }, datadog: { site: '' }, other: { a: 'b' } })).toEqual({ posthog: { host: 'h' } })
    expect(cleanValues(undefined)).toEqual({})
  })
})

const of = (key: string) => INTEGRATIONS.find((i) => i.key === key)!

describe('integrationStatus', () => {
  it('nothing set is off; some set is incomplete, naming what is missing', () => {
    expect(integrationStatus(of('linear'), {}, {}).state).toBe('off')
    expect(integrationStatus(of('linear'), { team: 'HG' }, {})).toEqual({ state: 'incomplete', missing: ['Key variable'], keyVar: null })
  })
  it('one the engine calls needs its key in the engine\'s environment', () => {
    expect(integrationStatus(of('linear'), { team: 'HG', key_env: 'LINEAR_API_KEY' }, {}).state).toBe('no-key')
    expect(integrationStatus(of('linear'), { team: 'HG', key_env: 'LINEAR_API_KEY' }, { LINEAR_API_KEY: 'x' }).state).toBe('ready')
  })
  it('one each app reads is ready once its fields are set; the engine never looks for its key', () => {
    expect(integrationStatus(of('posthog'), { host: 'h', key_env: 'POSTHOG_API_KEY' }, {}).state).toBe('ready')
  })
  it('works from an app\'s effective values', () => {
    const e = effectiveIntegrations({ linear: { key_env: 'LINEAR_API_KEY' } }, { linear: { team: 'HG' } })
    expect(statuses(e, { LINEAR_API_KEY: 'x' }).linear.state).toBe('ready')
  })
})

describe('checkIntegration', () => {
  const values = { site: 'https://team.atlassian.net/', email: 'a@example.com', space: 'ENG', key_env: 'CONFLUENCE_API_TOKEN' }
  const env = { CONFLUENCE_API_TOKEN: 'secret' }
  it('says what is missing before calling anything', async () => {
    expect(await checkIntegration('confluence', { site: 'x' }, env)).toEqual({ ok: false, detail: 'Missing: Account email, Space key, Key variable.' })
    expect((await checkIntegration('confluence', values, {})).detail).toMatch(/CONFLUENCE_API_TOKEN isn't set/)
  })
  it('finds the Confluence space with the account\'s email and key', async () => {
    let asked: { url: string; auth: string } | null = null
    const fetcher = (async (url: string, init: RequestInit) => {
      asked = { url, auth: (init.headers as Record<string, string>).authorization }
      return new Response(JSON.stringify({ results: [{ key: 'ENG', name: 'Engineering' }] }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await checkIntegration('confluence', values, env, fetcher)).toEqual({ ok: true, detail: 'Connected to https://team.atlassian.net; space ENG (Engineering) found.' })
    expect(asked!.url).toBe('https://team.atlassian.net/wiki/api/v2/spaces?keys=ENG')
    expect(asked!.auth).toBe(`Basic ${Buffer.from('a@example.com:secret').toString('base64')}`)
  })
  it('says when the key is refused or the space isn\'t there', async () => {
    const answer = (status: number, body: object = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    expect((await checkIntegration('confluence', values, env, answer(401))).detail).toMatch(/refused the key/)
    expect((await checkIntegration('confluence', values, env, answer(200, { results: [] }))).detail).toMatch(/no space with key ENG/)
  })
  it('refuses one the engine doesn\'t call', async () => {
    await expect(checkIntegration('posthog', {})).rejects.toThrow(/read by each app/)
  })
})
