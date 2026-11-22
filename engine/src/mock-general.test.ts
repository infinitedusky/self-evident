/**
 * The general mock server: a service is usable the moment it has an endpoint and the variable that points the app
 * at it. Nothing is written for it. Everything here is made up.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { placesTable } from './mock-places.js'
import { giveEndpointData } from './mock-serve.js'
import { addEndpoint, addService, exportMock, getMock, libraryStandIns, saveMock } from './mocks.js'
import { startStandIns, stopStandIns } from './stand-ins.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const up = async (url: string, init?: RequestInit) => { for (let i = 0; i < 50; i++) { const r = await fetch(url, init).catch(() => null); if (r) return r; await new Promise((x) => setTimeout(x, 100)) } throw new Error(`${url} never answered`) }
const flags = JSON.stringify({ featureFlags: { 'new-findings-page': true } })

describe.skipIf(!reachable)('the general mock server', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = ''
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'mock-general-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks'); process.env.STAND_INS_HOME = join(home, 'prototypes')
    await db.insert(workspace).values({ id: wsId, name: 'mock general test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME', 'STAND_INS_HOME']) delete process.env[k]; await pool.end() })

  it('has nothing to start for a service with no endpoints, and says so', async () => {
    expect(await addService(appId, { name: 'Flags', upstream: 'https://flags.example', addressSetting: 'FLAGS_HOST' })).toMatchObject({ status: 'needs_recording', served: 'none', pointed: true })
    expect(await libraryStandIns(appId)).toEqual([])
    expect((await placesTable(appId))[0].places.review).toMatchObject({ how: 'none', says: 'Nothing yet: it has no endpoints', blocked: expect.stringContaining('no endpoints yet') })
  })

  it('serves a service straight from its endpoints once it has one: nothing is written for it', async () => {
    await addEndpoint(appId, 'flags', { method: 'POST', path: '/decide', what: 'Which flags are on' })
    const m = await addEndpoint(appId, 'flags', { method: 'GET', path: '/users/{id}/flags' })
    expect(m).toMatchObject({ served: 'general', cmd: null })
    await giveEndpointData(appId, 'flags', 'decide', [{ name: 'anything.json', bytes: new TextEncoder().encode(flags) }], { real: false })
    expect((await placesTable(appId))[0].places.prototype).toMatchObject({ how: 'data', says: 'The mock, with provided data' })
    const [s] = await libraryStandIns(appId)
    expect(s).toMatchObject({ key: 'flags', env: { FLAGS_HOST: expect.any(String) } })
    expect(s.cmd).toContain('node server.mjs')
    const ports = await startStandIns('proto_general', [s], home)
    try {
      const base = `http://127.0.0.1:${ports.flags}`
      const ok = await up(`${base}/decide?v=3`, { method: 'POST', body: '{"distinct_id":"sample"}', headers: { authorization: 'Bearer anything' } })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toBe('application/json')
      expect(await ok.json()).toEqual({ featureFlags: { 'new-findings-page': true } })
      const noData = await fetch(`${base}/users/42/flags`)
      expect(noData.status).toBe(501)
      expect(await noData.json()).toMatchObject({ mock: true, error: 'this mock has no data for GET /users/{id}/flags yet' })
      const unknown = await fetch(`${base}/elsewhere`)
      expect(unknown.status).toBe(404)
      expect((await unknown.json() as { error: string }).error).toContain('It has: POST /decide, GET /users/{id}/flags')
    } finally { await stopStandIns('proto_general') }
  })

  it('exports as plain files that need nothing of ours: the server, its endpoints and its data', async () => {
    const out = join(home, 'export')
    const r = await exportMock(appId, 'flags', out)
    expect(r.files).toEqual(['PROVENANCE.md', 'data/decide.json', 'endpoints.json', 'mock.json', 'server.mjs'])
    expect(JSON.parse(readFileSync(join(out, 'mock.json'), 'utf8'))).toMatchObject({ served: 'general', cmd: 'node server.mjs', env: { FLAGS_HOST: expect.any(String) } })
    expect(readFileSync(join(out, 'server.mjs'), 'utf8')).not.toMatch(/from '\.\.?\//) // one file, no imports of ours
    expect(JSON.parse(readFileSync(join(out, 'endpoints.json'), 'utf8'))).toEqual([{ key: 'decide', method: 'POST', path: '/decide' }, { key: 'users-flags', method: 'GET', path: '/users/{id}/flags' }])
  })

  it('is not started for a service the app cannot be pointed at, and gives way to a server written for the service', async () => {
    await addService(appId, { name: 'Lookup' })
    await addEndpoint(appId, 'lookup', { method: 'GET', path: '/v1/lookup' })
    expect(await getMock(appId, 'lookup')).toMatchObject({ served: 'general', pointed: false })
    expect((await libraryStandIns(appId)).map((x) => x.key)).toEqual(['flags'])
    expect((await placesTable(appId)).find((r) => r.mock === 'lookup')!.places.smoke.note).toContain('variable to override is not set')
    await saveMock(appId, { name: 'Flags', status: 'assumed', cmd: 'node own.mjs', env: { FLAGS_HOST: '{url}' }, files: { 'own.mjs': '// sample' }, provenance: {} })
    expect(await getMock(appId, 'flags')).toMatchObject({ served: 'written' })
    expect((await libraryStandIns(appId))[0].cmd).toContain('node own.mjs')
  })
})
