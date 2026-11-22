/**
 * Data on the endpoint: the app's for each endpoint, a task's own in place of it for one, the form a run is served
 * (faked, or recorded as it came), and a sensitive endpoint, of which no real response is ever stored. Everything
 * here is made up, the "real" responses included.
 */
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { fakeData } from './mock-data.js'
import { placesTable, plansFor, setChoice } from './mock-places.js'
import { giveEndpointData, removeEndpointData, served, servedDir } from './mock-serve.js'
import { addEndpoint, editEndpoint, getMock, listMocks, listReal, mockHistory, removeMock, rowOf, saveMock } from './mocks.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const bytes = (t: string) => new TextEncoder().encode(t)
const head = 'tracking_id,work_email,full_name,status,person_summary'
const real = `${head}\n7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b,rowan.vale@northgate-holdings.com,Rowan Vale,completed,"Rowan Vale is a regional director at Northgate Holdings in Denver."\n`
const other = `${head}\n1a2b3c4d-2b3d-4e6f-8a9b-0c1d2e3f4a5b,juno.park@halden-freight.com,Juno Park,completed,"Juno Park runs operations at Halden Freight in Tacoma."\n`
const profile = JSON.stringify({ person: { name: 'Rowan Vale', email: 'rowan.vale@northgate-holdings.com', home: '41 Larkspur Lane, Denver' }, plan: 'team' })

describe.skipIf(!reachable)('data on the endpoint', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = '', otherTask = ''
  const m = async () => (await rowOf(appId, 'scanner'))!
  const data = async (task?: string) => Object.fromEntries((await listMocks(appId, task)).find((x) => x.key === 'scanner')!.endpoints.map((e) => [e.key, e.data]))
  const text = (s: Awaited<ReturnType<typeof served>>, name: string) => { const f = s.files.find((x) => x.name === name); return f ? f.text ?? readFileSync(f.link!, 'utf8') : null }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'mock-serve-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks')
    await db.insert(workspace).values({ id: wsId, name: 'mock serve test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [a, b] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }, { title: 'Another (sample)', brief: 'Build it.' }] })
    issueId = a.id; otherTask = b.id
    await saveMock(appId, { name: 'Scanner', status: 'assumed', cmd: 'node server.mjs', env: { SCANNER_BASE_URL: '{url}' }, files: { 'server.mjs': '// sample' }, provenance: {}, issueId, endpoints: [{ key: 'start', method: 'POST', path: '/runs' }, { key: 'results', method: 'GET', path: '/runs/{id}/results' }] })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME']) delete process.env[k]; await pool.end() })

  it('keeps a real response on the endpoint it was given for, and serves nothing of it until it is faked', async () => {
    expect(await giveEndpointData(appId, 'scanner', 'results', [{ name: 'export.csv', bytes: bytes(real) }], { real: true })).toMatchObject({ kept: 'recorded', issueId })
    expect((await data()).results).toMatchObject({ app: { recorded: { how: 'given', files: ['results.csv'] }, safe: null }, task: null })
    expect((await data()).start).toEqual({ app: null, task: null })
    expect(await served(await m(), { form: 'faked' })).toMatchObject({ files: [], unfaked: ['results'], real: [] })
    const row = (await placesTable(appId, issueId))[0]
    expect(row.places.prototype).toMatchObject({ how: 'own', note: expect.stringContaining('GET /runs/{id}/results is not faked yet') })
    expect(row.places.review.blocked).toContain('has no fake yet')
    await expect(plansFor(appId, 'review', issueId)).rejects.toThrow('a reviewer is never given a real one')
  })

  it('fakes it into that endpoint\'s own data, and serves the fake, or the recorded response where that is turned on', async () => {
    const { data: d } = await fakeData(appId, 'scanner', { plan: { keep: ['status'] } })
    expect(d).toMatchObject({ kind: 'faked', provenance: { scope: { endpoint: 'results' } }, files: [{ path: 'results.csv' }] })
    expect((await data()).results.app).toMatchObject({ recorded: { how: 'given' }, safe: { kind: 'faked', files: ['results.csv'] } })
    const faked = await served(await m(), { form: 'faked' })
    expect(faked).toMatchObject({ real: [], unfaked: [], per: { results: { from: 'app', kind: 'faked' }, start: { kind: 'none' } } })
    expect(text(faked, 'results.csv')).not.toMatch(/Rowan|Northgate/)
    const recorded = await served(await m(), { form: 'recorded' })
    expect(recorded).toMatchObject({ real: ['results'], per: { results: { kind: 'recorded' } } })
    expect(text(recorded, 'results.csv')).toBe(real)
    // The folder a server is given: the fake written out, the recorded one a link into its recording.
    expect(lstatSync(join(servedDir(await m(), faked)!, 'results.csv')).isSymbolicLink()).toBe(false)
    expect(lstatSync(join(servedDir(await m(), recorded)!, 'results.csv')).isSymbolicLink()).toBe(true)
    await setChoice(appId, 'scanner', 'smoke', { source: 'replay' }, issueId)
    expect(await plansFor(appId, 'smoke', issueId)).toMatchObject({ pick: { scanner: { form: 'recorded', issueId } }, real: ['scanner'] })
    expect((await plansFor(appId, 'review', issueId)).real).toEqual([])
  })

  it('lets a task put its own data in place of the app\'s for one endpoint, and takes it away again', async () => {
    const mine = `${head}\n00000000-0000-4000-8000-00000000000a,nobody@acme.example,Sample Nobody,completed,Sample data: nothing found.\n`
    expect(await giveEndpointData(appId, 'scanner', 'results', [{ name: 'mine.csv', bytes: bytes(mine) }], { real: false, issueId })).toMatchObject({ kept: 'provided' })
    expect((await data(issueId)).results).toMatchObject({ app: { safe: { kind: 'faked' } }, task: { recorded: null, safe: { kind: 'provided', files: ['results.csv'] } } })
    expect((await data(otherTask)).results.task).toBeNull()
    const own = await served(await m(), { form: 'recorded', issueId })
    expect(own).toMatchObject({ real: [], per: { results: { from: 'task', kind: 'provided' } } }) // its own has no recorded form: nothing real is served
    expect(text(own, 'results.csv')).toBe(mine)
    expect(text(await served(await m(), { form: 'faked', issueId: otherTask }), 'results.csv')).not.toBe(mine) // another task has the app's
    // A real response for this task alone: kept apart from the app's, and faked into the task's own.
    await giveEndpointData(appId, 'scanner', 'results', [{ name: 'other.csv', bytes: bytes(other) }], { real: true, issueId })
    expect((await data(issueId)).results.task).toMatchObject({ recorded: { how: 'given' }, safe: { kind: 'provided' } })
    expect((await data()).results.app?.recorded?.files).toEqual(['results.csv'])
    expect(text(await served(await m(), { form: 'recorded', issueId }), 'results.csv')).toBe(other)
    expect(text(await served(await m(), { form: 'recorded' }), 'results.csv')).toBe(real)
    expect(await removeEndpointData(appId, 'scanner', 'results', { issueId, real: true })).toMatchObject({ removed: true, real: 1 })
    expect((await data(issueId)).results.task).toBeNull()
    expect((await data(issueId)).results.app).toMatchObject({ recorded: { how: 'given' }, safe: { kind: 'faked' } }) // the app's is untouched
  })

  it('never stores a real response of a sensitive endpoint: it is faked as it arrives', async () => {
    const added = await addEndpoint(appId, 'scanner', { method: 'GET', path: '/people/{id}/profile', what: 'who they are', sensitive: true })
    const key = added.endpoints.find((e) => e.path === '/people/{id}/profile')!.key
    expect(added.endpoints.find((e) => e.key === key)).toMatchObject({ sensitive: true })
    const before = (await listReal(appId, 'scanner')).length
    expect(await giveEndpointData(appId, 'scanner', key, [{ name: 'profile.json', bytes: bytes(profile) }], { real: true })).toMatchObject({ kept: 'faked', faked: true })
    expect((await listReal(appId, 'scanner')).length).toBe(before) // nothing new on this computer
    expect((await data())[key].app).toMatchObject({ recorded: null, safe: { kind: 'faked', note: expect.stringContaining('was not kept') } })
    const s = await served(await m(), { form: 'recorded' })
    expect(s.per[key]).toEqual({ from: 'app', kind: 'faked' })
    expect(text(s, `${key}.json`)).not.toMatch(/Rowan|Larkspur|northgate/)
    expect(JSON.parse(text(s, `${key}.json`)!)).toMatchObject({ person: { name: expect.any(String) } })
  })

  it('fakes and deletes what is already here when an endpoint is marked sensitive', async () => {
    expect((await data()).results.app?.recorded).not.toBeNull()
    await editEndpoint(appId, 'scanner', 'results', { sensitive: true })
    expect((await data()).results.app).toMatchObject({ recorded: null, safe: { kind: 'faked' } })
    expect(readdirSync(join(home, 'recordings'), { recursive: true }).filter((f) => String(f).endsWith('.csv'))).toEqual([])
    expect((await served(await m(), { form: 'recorded' })).real).toEqual([])
    expect((await mockHistory(appId, 'scanner')).map((h) => h.what)).toEqual(expect.arrayContaining(['The call GET /people/{id}/profile was added']))
  })

  it('leaves nothing behind when the mock is removed', async () => {
    expect(existsSync(join(home, 'mocks', appId, 'scanner'))).toBe(true)
    await removeMock(appId, 'scanner', 'user', { files: true })
    expect(existsSync(join(home, 'mocks', appId, 'scanner'))).toBe(false)
    await expect(getMock(appId, 'scanner')).rejects.toThrow('no mock')
  })
})
