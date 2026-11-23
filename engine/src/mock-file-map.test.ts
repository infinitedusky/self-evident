/** An endpoint's data mapped from a file of the fixtures: who the mock answers for is who the tester brings. Everything here is made up, the "real" file included. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { mapFromFile } from './fixtures.js'
import { newId } from './ids.js'
import { csvRecords, withFilePeople } from './mock-file-map.js'
import { plansFor } from './mock-places.js'
import { giveEndpointData, served } from './mock-serve.js'
import { listMocks, rowOf, saveMock } from './mocks.js'
import { createProject } from './projects.js'
import { addTestFile, editTestFile } from './test-files.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const bytes = (t: string) => new TextEncoder().encode(t)
// What the service's file looks like: no column for who it is about, as a response given by hand may not have.
const results = 'first_name,last_name,Status,findings\nSample,Person,completed,2\n'

describe('a file\'s people written into data', () => {
  it('writes the template once for each person, adds a mapped column the data lacks, and leaves one empty when told to', () => {
    const out = withFilePeople(results, results, [{ email: 'a@northwind.example', first: 'Ada' }, { email: 'b@northwind.example', first: 'Bo' }], { work_email: 'email', first_name: 'first', tracking_id: '' }, false)
    expect(out.split('\n').slice(0, 3)).toEqual(['first_name,last_name,Status,findings,work_email,tracking_id', 'Ada,Person,completed,2,a@northwind.example,', 'Bo,Person,completed,2,b@northwind.example,'])
  })
  it('keeps the rows made for a database fixture\'s people and puts the file\'s after them', () => {
    const filled = 'first_name,last_name,Status,findings\nMorgan,Lee,completed,2\nRiley,Shaw,completed,2\n'
    const rows = csvRecords(withFilePeople(results, filled, [{ first: 'Ada' }], { first_name: 'first' }, true)).rows
    expect(rows.map((r) => r.first_name)).toEqual(['Morgan', 'Riley', 'Ada'])
  })
})

describe.skipIf(!reachable)('an endpoint mapped from a file', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = ''
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'file-map-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks'); process.env.TEST_FILES_HOME = join(home, 'test-files')
    await db.insert(workspace).values({ id: wsId, name: 'file map test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [a] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = a.id
    await saveMock(appId, { name: 'Scanner', status: 'assumed', cmd: 'node server.mjs', env: { SCANNER_BASE_URL: '{url}' }, files: { 'server.mjs': '// sample' }, provenance: {}, issueId, endpoints: [{ key: 'results', method: 'GET', path: '/runs/{id}/results' }] })
    await giveEndpointData(appId, 'scanner', 'results', [{ name: 'results.csv', bytes: bytes(results) }], { real: false, stated: true })
    // The tester's file, said to be real: it is kept here and a fake is made of it.
    await addTestFile(appId, { name: 'import.csv', bytes: bytes('first_name,last_name,email\nMarisol,Okonkwo,marisol.okonkwo@harborline-freight.com\n'), issueId, real: true })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME', 'TEST_FILES_HOME']) delete process.env[k]; await pool.end() })
  const text = async (place: 'prototype' | 'smoke' | 'review') => { const s = await served((await rowOf(appId, 'scanner'))!, { form: 'faked', issueId, place }); return { s, text: s.files[0].text ?? '' } }

  it('keeps only the mapping, and answers each place for the version of the file it uses', async () => {
    await expect(mapFromFile(appId, 'scanner', 'results', { file: 'import.csv', map: { work_email: 'nope' } }, null)).rejects.toThrow('has no column "nope"')
    const r = await mapFromFile(appId, 'scanner', 'results', { file: 'import.csv', map: { work_email: 'email', first_name: 'first_name', tracking_id: '' } }, null)
    expect(r.fromFile).toEqual({ file: 'import.csv', map: { work_email: 'email', first_name: 'first_name', tracking_id: '' } })
    expect((await listMocks(appId, issueId)).find((x) => x.key === 'scanner')!.endpoints[0].data.app?.safe?.fromFile?.file).toBe('import.csv')
    // Every place is on the fake to begin with: the made-up person, the same in the file and in the answer.
    const fake = await text('smoke')
    expect(fake.text.split('\n')[0]).toBe('first_name,last_name,Status,findings,work_email,tracking_id')
    expect(fake.text).not.toContain('marisol')
    expect(fake.s.real).toEqual([])
    // The smoke test is turned to the real file: it is answered for the real person, and the run is marked as on real data.
    const f = (await import('./test-files.js')).listTestFiles
    await editTestFile(appId, (await f(appId, issueId)).find((x) => x.name === 'import.csv')!.id, { use: { smoke: 'real' } })
    const real = await text('smoke')
    expect(csvRecords(real.text).rows).toEqual([{ first_name: 'Marisol', last_name: 'Person', Status: 'completed', findings: '2', work_email: 'marisol.okonkwo@harborline-freight.com', tracking_id: '' }])
    expect(real.s.real).toEqual(['results'])
    expect((await plansFor(appId, 'smoke', issueId)).real).toEqual(['scanner'])
    // A prototype was not turned, and a reviewer cannot be: neither is given the real person.
    for (const place of ['prototype', 'review'] as const) { const x = await text(place); expect(x.text).not.toContain('marisol'); expect(x.s.real).toEqual([]) }
    expect((await served((await rowOf(appId, 'scanner'))!, { form: 'faked', issueId })).files[0].text).not.toContain('marisol') // no place said: a reviewer's
  })

  it('stops mapping, and the data is as it was', async () => {
    expect((await mapFromFile(appId, 'scanner', 'results', { file: null }, null)).fromFile).toBeNull()
    expect((await text('smoke')).text).toBe(results)
  })
})
