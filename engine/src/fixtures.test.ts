/** Fixtures: the data is a template, the fixture supplies who. Everything here is made up, the "real" response included. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { like } from 'drizzle-orm'
import { app, mockData, workspace } from './db/schema.js'
import { assignFixture, canMakeFixture, dataColumns, deleteFixture, fixtureForTask, fixtureRows, fixtureSample, listFixtures, makeFixtureFromSeed, pin, renameFixture } from './fixtures.js'
import { newId } from './ids.js'
import { fakeData } from './mock-data.js'
import { parseCsv } from './mock-leaks.js'
import { giveEndpointData, served } from './mock-serve.js'
import { listMocks, rowOf, saveMock } from './mocks.js'
import { createProject } from './projects.js'
import { writeScenario } from './prototype-data.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const head = 'tracking_id,work_email,full_name,status,person_summary'
const real = `${head}\n7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b,rowan.vale@northgate-holdings.com,Rowan Vale,completed,"Rowan Vale is a regional director at Northgate Holdings in Denver."\n`
const employees = [1, 2, 3, 4].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, first_name: `Sample${n}`, last_name: 'Person', work_email: `sample${n}@meridian.example`, metadata: { n } }))

describe('pinning columns', () => {
  it('sets named columns in every row of a CSV and leaves the rest', () => {
    const r = pin(`${head}\r\nx,a@b.example,"Sample, Person",completed,"Two\nlines"\r\n`, { tracking_id: 'id-1', work_email: 'one@meridian.example', nothing: 'x' })
    expect(parseCsv(r.text)).toEqual([head.split(','), ['id-1', 'one@meridian.example', 'Sample, Person', 'completed', 'Two\nlines']])
    expect(r.text.endsWith('\r\n')).toBe(true)
    expect(r.changed).toBe(2)
  })
  it('sets a key wherever it holds a plain value in JSON, and names a file\'s columns', () => {
    expect(JSON.parse(pin(JSON.stringify({ owner: 'x', runs: [{ owner: 'y', tags: { owner: ['kept'] } }] }), { owner: 'z' }).text)).toEqual({ owner: 'z', runs: [{ owner: 'z', tags: { owner: ['kept'] } }] })
    expect(dataColumns(real)).toEqual(head.split(','))
    expect(dataColumns(JSON.stringify([{ a: 1, b: 2 }]))).toEqual(['a', 'b'])
  })
})

describe.skipIf(!reachable)('fixtures', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = ''
  const rowsServed = async (task?: string) => parseCsv((await served((await rowOf(appId, 'scanner'))!, { form: 'faked', issueId: task })).files.find((f) => f.name === 'results.csv')!.text!)
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'fixtures-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks')
    await db.insert(workspace).values({ id: wsId, name: 'fixtures test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [t] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = t.id
    await writeScenario({ appId }, 'meridian', { employees, departments: [{ id: 'd1', name: 'Sales (sample)' }], empty: [] }, true)
    await saveMock(appId, { name: 'Scanner', status: 'assumed', cmd: 'node server.mjs', env: { SCANNER_BASE_URL: '{url}' }, files: { 'server.mjs': '// sample' }, provenance: {}, issueId, endpoints: [{ key: 'results', method: 'GET', path: '/runs/{id}/results' }] })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME']) delete process.env[k]; await pool.end() })

  it('lists the app\'s fixtures with their tables, and a table\'s rows by who they are', async () => {
    expect(await listFixtures(appId)).toMatchObject([{ name: 'meridian', tables: [{ name: 'employees', rows: 4, columns: expect.arrayContaining(['id', 'first_name', 'last_name', 'work_email', 'metadata']) }, { name: 'departments', rows: 1 }] }])
    const r = await fixtureRows(appId, 'meridian', 'employees')
    expect(r.rows[1]).toMatchObject({ index: 1, label: 'Sample2 Person · sample2@meridian.example · 00000000-0000-4000-8000-000000000002' })
    await expect(fixtureRows(appId, 'meridian', 'empty')).rejects.toThrow('has no rows')
  })

  it('needs faked data first, then fills it out for one fixture person: their id and email, the rest faked', async () => {
    await giveEndpointData(appId, 'scanner', 'results', [{ name: 'export.csv', bytes: new TextEncoder().encode(real) }], { real: true })
    const map = { tracking_id: 'id', work_email: 'work_email' }
    await expect(assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 0, map }, null)).rejects.toThrow('the real response is faked first')
    await fakeData(appId, 'scanner', { plan: { keep: ['status'] } })
    await expect(assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 0, map: { nope: 'id' } }, null)).rejects.toThrow('is a column of this endpoint\'s data')
    await expect(assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 0, map: { tracking_id: 'metadata' } }, null)).rejects.toThrow('holds nothing to set')
    expect(await assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', where: { column: 'work_email', value: 'sample2@meridian.example' }, map }, null)).toMatchObject({ madeFor: { fixture: 'meridian', who: 'Sample2 Person, sample2@meridian.example', people: 1 } })
    const [h, row, ...more] = await rowsServed()
    expect(h.join(',')).toBe(head)
    expect(more).toEqual([])
    expect(row.slice(0, 2)).toEqual(['00000000-0000-4000-8000-000000000002', 'sample2@meridian.example'])
    expect(row[3]).toBe('completed')
    expect(row.join(' ')).not.toMatch(/Rowan|Northgate/)
    expect((await listMocks(appId))[0].endpoints[0].data.app?.safe).toMatchObject({ columns: head.split(','), madeFor: { fixture: 'meridian', people: 1 } })
  })

  it('fills the template out for several people, each faked afresh, and again from the template when asked again', async () => {
    const map = { tracking_id: 'id', work_email: 'work_email' }
    expect((await assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 1, count: 3, map }, null)).madeFor).toMatchObject({ people: 3, who: '3 people, from Sample2 Person, sample2@meridian.example' })
    const [, ...rows] = await rowsServed()
    expect(rows.map((r) => r[1])).toEqual(['sample2@meridian.example', 'sample3@meridian.example', 'sample4@meridian.example'])
    expect(rows.map((r) => r[0])).toEqual(employees.slice(1).map((e) => e.id))
    expect(new Set(rows.map((r) => r[2])).size).toBe(3) // not the same person three times
    expect(rows.flat().join(' ')).not.toMatch(/Rowan|Northgate/)
    await assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 3, count: 10, map }, null)
    expect((await rowsServed()).slice(1).map((r) => r[1])).toEqual(['sample4@meridian.example']) // from the template again, and only the people there are
  })

  it('keeps a file per fixture beside the one it was made from, and the fixture a run starts from picks which is served', async () => {
    const m = async () => (await rowOf(appId, 'scanner'))!
    const emails = async (fixture: string | null | undefined) => parseCsv((await served(await m(), { form: 'faked', fixture })).files.find((f) => f.name === 'results.csv')!.text!).slice(1).map((r) => r[1])
    // The file it was made from is still there, for no fixture: a run started empty gets it, with nobody of meridian's in it.
    const plain = await emails(null)
    expect(plain).toHaveLength(1)
    expect(plain[0]).not.toMatch(/meridian\.example/)
    expect(await emails('meridian')).toEqual(['sample4@meridian.example'])
    // A second fixture gets a file of its own; the first's is left as it was.
    await writeScenario({ appId }, 'northwind', { employees: [{ id: '00000000-0000-4000-9000-000000000001', first_name: 'North', last_name: 'Person', work_email: 'north1@northwind.example' }] }, true)
    expect(await assignFixture(appId, 'scanner', 'results', { fixture: 'northwind', table: 'employees', row: 0, map: { tracking_id: 'id', work_email: 'work_email' } }, null)).toMatchObject({ fresh: true, madeFor: { fixture: 'northwind' } })
    expect(await emails('northwind')).toEqual(['north1@northwind.example'])
    expect(await emails('meridian')).toEqual(['sample4@meridian.example'])
    expect(await emails(null)).toEqual(plain)
    expect(await emails('a fixture with no file of its own')).toEqual(plain) // falls back to the one made for no fixture
    // Filling out again for a fixture that has a file changes that file, and makes no third.
    expect((await assignFixture(appId, 'scanner', 'results', { fixture: 'northwind', table: 'employees', row: 0, map: { tracking_id: 'id', work_email: 'work_email' } }, null)).fresh).toBe(false)
    const safe = (await listMocks(appId))[0].endpoints[0].data.app!.safe!
    expect([safe.madeFor?.fixture ?? null, ...(safe.also ?? []).map((a) => a.fixture)].sort((a, b) => String(a).localeCompare(String(b)))).toEqual(['meridian', 'northwind', null].sort((a, b) => String(a).localeCompare(String(b))))
    // Put back as it was for the tests below: the second fixture and its file are taken away.
    await deleteFixture(appId, 'northwind')
    await db.delete(mockData).where(like(mockData.key, '%-for-northwind'))
  })

  it('takes a file as one fixture\'s own, serves it to a run from that fixture, and maps its fields row by row', async () => {
    const m = async () => (await rowOf(appId, 'scanner'))!
    const rowsFor = async (fixture: string | null) => parseCsv((await served(await m(), { form: 'faked', fixture })).files.find((f) => f.name === 'results.csv')!.text!).slice(1)
    const before = await rowsFor(null)
    const own = `${head}\nx1,a@sample.example,One Sample,completed,"Nothing found."\nx2,b@sample.example,Two Sample,completed,"Two fake profiles."\nx3,c@sample.example,Three Sample,completed,"A doxxing post."\n`
    await expect(giveEndpointData(appId, 'scanner', 'results', [{ name: 'company.csv', bytes: new TextEncoder().encode(own) }], { real: true, fixture: 'meridian' })).rejects.toThrow('a file for one fixture is made up')
    await giveEndpointData(appId, 'scanner', 'results', [{ name: 'company.csv', bytes: new TextEncoder().encode(own) }], { real: false, fixture: 'meridian' })
    expect((await rowsFor('meridian')).map((r) => r[4])).toEqual(['Nothing found.', 'Two fake profiles.', 'A doxxing post.'])
    expect(await rowsFor(null)).toEqual(before) // the data for no fixture is as it was
    // Its fields mapped from the fixture: each row takes one person, in order, and keeps what else it says. No row is added.
    const r = await assignFixture(appId, 'scanner', 'results', { fixture: 'meridian', table: 'employees', row: 0, count: 4, map: { tracking_id: 'id', work_email: 'work_email' } }, null)
    expect(r.fresh).toBe(false)
    const rows = await rowsFor('meridian')
    expect(rows.map((x) => x[1])).toEqual(['sample1@meridian.example', 'sample2@meridian.example', 'sample3@meridian.example'])
    expect(rows.map((x) => x[0])).toEqual(employees.slice(0, 3).map((e) => e.id))
    expect(rows.map((x) => x[4])).toEqual(['Nothing found.', 'Two fake profiles.', 'A doxxing post.'])
    await db.delete(mockData).where(like(mockData.key, 'provided-%-for-meridian')) // put back as it was for the tests below
  })

  it('builds a task\'s runs from the fixture its data was made for', async () => {
    expect(await fixtureForTask(appId, issueId)).toBe('meridian')
    expect(await fixtureForTask(newId('app'), null)).toBeNull()
  })

  it('shows a table of a fixture as it is: its first rows, every column, as text', async () => {
    const r = await fixtureSample(appId, 'meridian', 'employees', 2)
    expect(r.total).toBe(4)
    expect([...r.columns].sort()).toEqual(['first_name', 'id', 'last_name', 'metadata', 'work_email']) // in the order the database keeps them
    const asObjects = r.rows.map((row) => Object.fromEntries(r.columns.map((c, n) => [c, row[n]])))
    expect(asObjects).toEqual([1, 2].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, first_name: `Sample${n}`, last_name: 'Person', work_email: `sample${n}@meridian.example`, metadata: `{"n":${n}}` })))
    await expect(fixtureSample(appId, 'nothing', 'employees')).rejects.toThrow('no fixture')
  })

  it('renames a fixture and the data filled out for its people follows; a name taken is refused', async () => {
    await writeScenario({ appId }, 'other', { employees: employees.slice(0, 1) }, true)
    const before = await fixtureForTask(appId, issueId)
    await expect(renameFixture(appId, 'meridian', 'other')).rejects.toThrow('already')
    await expect(renameFixture(appId, 'meridian', 'Not A Name')).rejects.toThrow('letters, numbers and dashes')
    await renameFixture(appId, 'meridian', 'meridian-group')
    const list = await listFixtures(appId)
    expect(list.map((f) => f.name)).toEqual(['meridian-group', 'other'])
    if (before === 'meridian') { expect(await fixtureForTask(appId, issueId)).toBe('meridian-group'); expect(list[0].madeFor).toBeGreaterThan(0) }
    await renameFixture(appId, 'meridian-group', 'meridian')
  })

  it('deletes a fixture, and what was made for it no longer says a task is built from it', async () => {
    await deleteFixture(appId, 'other')
    expect((await listFixtures(appId)).map((f) => f.name)).toEqual(['meridian'])
    await expect(deleteFixture(appId, 'other')).rejects.toThrow('no fixture')
  })

  it('says what is missing before a fixture can be made from the seed', async () => {
    expect(await canMakeFixture(appId)).toMatchObject({ ok: false, missing: expect.stringContaining('no database') })
    await expect(makeFixtureFromSeed(appId)).rejects.toThrow('cannot be made from the seed yet')
  })
})
