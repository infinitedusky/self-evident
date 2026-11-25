/** Two Evidents on one computer: which is which, where the other is, and that one database is noticed. Made-up addresses. */
import { describe, expect, it } from 'vitest'
import { databaseMark, instances, otherEngineUrl, pageUrl, thisInstance, type Instance } from './instance.js'

const OWN = 'postgres://ideafactory:ideafactory@localhost:5433/selfevident', FAR = 'postgres://someone:secret-sample@localhost:15432/selfevident'

describe('which Evident this is', () => {
  it('is named by its database: the checkout\'s own is This computer, any other is Shared; a name can be given', () => {
    expect(thisInstance({}, OWN)).toMatchObject({ name: 'This computer', kind: 'local', url: 'http://localhost:5180', beside: false })
    expect(thisInstance({ UI_URL: 'https://evident.example' }, FAR)).toMatchObject({ name: 'Shared', kind: 'shared', url: 'https://evident.example' })
    expect(thisInstance({ EVIDENT_NAME: ' Work ', PORT: '4001', UI_PORT: '5181', EVIDENT_BESIDE: '1' }, OWN)).toMatchObject({ name: 'Work', url: 'http://localhost:5181', beside: true })
    expect(pageUrl({ UI_PORT: '5181' })).toBe('http://localhost:5181')
  })
  it('marks its database without its user or password, the same for the same database', () => {
    expect(databaseMark(OWN)).toBe(databaseMark('postgres://other:pw@localhost:5433/selfevident'))
    expect(databaseMark(OWN)).not.toBe(databaseMark(FAR))
    expect(databaseMark(FAR)).toMatch(/^[0-9a-f]{12}$/); expect(databaseMark('not a url')).toBe('unknown')
  })
  it('looks for the other on the other of the two ports, or where it is told', () => {
    expect(otherEngineUrl({})).toBe('http://localhost:4001')
    expect(otherEngineUrl({ PORT: '4001' })).toBe('http://localhost:4000')
    expect(otherEngineUrl({ OTHER_ENGINE_URL: 'http://localhost:4100/' })).toBe('http://localhost:4100')
  })
})

describe('the other Evident', () => {
  const shared: Instance = { name: 'Shared', kind: 'shared', url: 'http://localhost:5180', database: databaseMark(FAR), beside: false }
  it('up: its name and its page, asked of its engine', async () => {
    const asked: string[] = []
    const v = await instances({ env: { PORT: '4001', UI_PORT: '5181', EVIDENT_BESIDE: '1' }, url: OWN, ask: async (u) => { asked.push(u); return shared } })
    expect(asked).toEqual(['http://localhost:4000'])
    expect(v).toEqual({ here: expect.objectContaining({ name: 'This computer', url: 'http://localhost:5181' }), other: { up: true, name: 'Shared', kind: 'shared', url: 'http://localhost:5180', same: false } })
  })
  it('not answering: it is the other kind, with what starts it', async () => {
    expect((await instances({ env: {}, url: OWN, ask: async () => null })).other).toEqual({ up: false, name: 'Shared', kind: 'shared', start: 'pnpm arrive' })
    expect((await instances({ env: {}, url: FAR, ask: async () => null })).other).toEqual({ up: false, name: 'This computer', kind: 'local', start: 'pnpm local' })
  })
  it('two engines on one database are told apart from two databases', async () => {
    const v = await instances({ env: {}, url: FAR, ask: async () => ({ ...shared, url: 'http://localhost:5181' }) })
    expect(v.other).toMatchObject({ up: true, same: true })
  })
})
