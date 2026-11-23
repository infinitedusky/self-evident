/** The service tool: an agent sets up the app's outside services as the person does in Settings, within two limits. Everything here is made up. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { handleMcp } from './mcp.js'
import { editEndpoint, giveRecording, libraryStandIns, mockHistory, servicesPrompt, listMocks } from './mocks.js'
import { fakeData } from './mock-data.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

let n = 0
const rpc = (name: string, args: Record<string, unknown>) => new Request('http://localhost:4000/api/mcp/x', {
  method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }),
  headers: { host: 'localhost:4000', 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
})

describe.skipIf(!reachable)('the service tool', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = ''
  const call = async (args: Record<string, unknown>) => { const r = (await (await handleMcp(appId, rpc('service', args), 4000)).json()).result as { isError?: boolean; content: { text: string }[] }; return { error: !!r.isError, text: r.content[0].text, json: () => JSON.parse(r.content[0].text) } }
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'service-tool-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks')
    await db.insert(workspace).values({ id: wsId, name: 'service tool test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME']) delete process.env[k]; await pool.end() })

  it('adds a service with how the app reaches it, and refuses the same one written differently', async () => {
    const made = await call({ op: 'add', name: 'Scanner', what: 'The vendor that scans (sample)', address: 'https://api.scanner.example', addressVariable: 'SCANNER_BASE_URL', keyVariable: 'SCANNER_API_KEY' })
    expect(made.json()).toMatchObject({ key: 'scanner', served: 'none', pointed: true, connection: { address: 'https://api.scanner.example', addressSetting: 'SCANNER_BASE_URL', keySetting: 'SCANNER_API_KEY' } })
    const again = await call({ op: 'add', name: 'scanner_' })
    expect(again).toMatchObject({ error: true, text: expect.stringContaining('already one of this app\'s services') })
  })

  it('adds, changes and removes its endpoints, so it can be used at once', async () => {
    await call({ op: 'endpoint_add', service: 'Scanner', method: 'post', path: '/runs', answers: 'A job id' })
    await call({ op: 'endpoint_add', service: 'scanner', method: 'GET', path: '/runs/{id}/cost' })
    const m = (await call({ op: 'endpoint_add', service: 'scanner', method: 'GET', path: '/people/{id}/profile', answers: 'Who they are', sensitive: true })).json()
    expect(m).toMatchObject({ served: 'general' })
    expect(m.endpoints.map((e: { key: string; method: string; sensitive?: boolean }) => [e.key, e.method, !!e.sensitive])).toEqual([['runs', 'POST', false], ['runs-cost', 'GET', false], ['people-profile', 'GET', true]])
    expect((await call({ op: 'endpoint_edit', service: 'scanner', endpoint: 'runs-cost', answers: 'What the run cost' })).json().endpoints[1]).toMatchObject({ what: 'What the run cost' })
    expect((await call({ op: 'endpoint_remove', service: 'scanner', endpoint: 'runs-cost' })).json().endpoints).toHaveLength(2)
    expect((await libraryStandIns(appId)).map((s) => s.key)).toEqual(['scanner']) // nothing was written for it
    expect((await call({ op: 'list', service: 'scanner' })).json()).toMatchObject({ name: 'Scanner', endpoints: [{ key: 'runs' }, { key: 'people-profile' }] })
    expect((await call({ op: 'endpoint_add', service: 'nobody', path: '/x' }))).toMatchObject({ error: true, text: expect.stringContaining('is not one of this app\'s services') })
  })

  it('may mark an endpoint sensitive, and never take it off: that is the person\'s', async () => {
    expect(await call({ op: 'endpoint_edit', service: 'scanner', endpoint: 'people-profile', sensitive: false })).toMatchObject({ error: true, text: expect.stringContaining('only the person can take sensitive off') })
    expect((await call({ op: 'endpoint_edit', service: 'scanner', endpoint: 'runs', sensitive: true })).json().endpoints[0]).toMatchObject({ sensitive: true })
    expect((await editEndpoint(appId, 'scanner', 'runs', { sensitive: false }, 'user')).endpoints[0].sensitive).toBeUndefined()
  })

  it('gives an endpoint data it wrote only when that could be checked against a real response', async () => {
    const files = { 'start.json': JSON.stringify({ job_id: 'sample-job' }) }
    expect(await call({ op: 'endpoint_data', service: 'scanner', endpoint: 'runs', files })).toMatchObject({ error: true, text: expect.stringContaining('only when a person states it holds nothing real') })
    // The person gives a real response of that call; from then on what the agent writes is checked against it.
    await giveRecording(appId, 'scanner', [{ name: 'r.json', bytes: new TextEncoder().encode(JSON.stringify({ job_id: 'job-7c1e5f0a', owner: 'rowan.vale@northgate-holdings.com' })) }], 'user', 'runs')
    await fakeData(appId, 'scanner', {})
    expect(await call({ op: 'endpoint_data', service: 'scanner', endpoint: 'runs', files: { 'start.json': JSON.stringify({ job_id: 'x', owner: 'rowan.vale@northgate-holdings.com' }) } })).toMatchObject({ error: true, text: expect.stringContaining('so it is not invented') })
    expect((await call({ op: 'endpoint_data', service: 'scanner', endpoint: 'runs', files })).json()).toMatchObject({ key: 'runs', data: { app: { safe: { kind: 'provided', files: ['runs.json'] } } } })
    expect((await call({ op: 'endpoint_data_remove', service: 'scanner', endpoint: 'runs' })).json()).toMatchObject({ removed: true, real: 0 })
    expect((await listMocks(appId))[0].endpoints[0].data.app).toMatchObject({ recorded: { how: 'given' }, safe: null }) // the real response stays: only the person deletes one
  })

  it('leaves each change in the service\'s history, and the app\'s own agent is told what there is', async () => {
    expect((await mockHistory(appId, 'scanner')).filter((h) => h.by === 'an agent').map((h) => h.what)).toEqual(expect.arrayContaining(['The call POST /runs was added', 'The call "runs-cost" was taken off']))
    expect(servicesPrompt(await listMocks(appId))).toContain('The app has: Scanner (scanner; 2 endpoints).')
  })
})
