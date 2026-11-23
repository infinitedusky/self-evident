/** Test files: what a person needs in their hands to try a change. Everything here is made up, the "real" response included. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { giveEndpointData } from './mock-serve.js'
import { saveMock } from './mocks.js'
import { createProject } from './projects.js'
import { addTestFile, editTestFile, listTestFiles, placedFiles, placeTestFiles, removeTestFile, testFilePath, testFilesSay } from './test-files.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const bytes = (t: string) => new TextEncoder().encode(t)
const real = 'tracking_id,work_email,full_name,status,person_summary\n7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b,rowan.vale@northgate-holdings.com,Rowan Vale,completed,"Rowan Vale is a regional director at Northgate Holdings in Denver."\n'

describe.skipIf(!reachable)('test files', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = '', otherTask = ''
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'test-files-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks'); process.env.TEST_FILES_HOME = join(home, 'test-files')
    await db.insert(workspace).values({ id: wsId, name: 'test files test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [a, b] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }, { title: 'Another (sample)', brief: 'Build it.' }] })
    issueId = a.id; otherTask = b.id
    await saveMock(appId, { name: 'Scanner', status: 'assumed', cmd: 'node server.mjs', env: { SCANNER_BASE_URL: '{url}' }, files: { 'server.mjs': '// sample' }, provenance: {}, issueId, endpoints: [{ key: 'results', method: 'GET', path: '/runs/{id}/results' }] })
    await giveEndpointData(appId, 'scanner', 'results', [{ name: 'export.csv', bytes: bytes(real) }], { real: true })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME', 'TEST_FILES_HOME']) delete process.env[k]; await pool.end() })

  it('keeps a task\'s file on this computer with what to do with it, read against the real responses here', async () => {
    const f = await addTestFile(appId, { name: '../imports/one person.csv', bytes: bytes('first_name,last_name,work_email\nSample,Person,sample.person@northwind.example\n'), what: 'Import it on the Employees page', issueId, stated: true })
    expect(f).toMatchObject({ name: 'one person.csv', what: 'Import it on the Employees page', mediaType: 'text/csv', scope: 'task', here: true, checked: { against: 1 } })
    const at = await testFilePath(appId, f.id)
    expect(readFileSync(at.path, 'utf8')).toContain('sample.person@northwind.example')
    expect(at.path.startsWith(join(home, 'test-files', appId))).toBe(true)
  })

  it('takes a picture on the person\'s word, and several files of any kind', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    const card = await addTestFile(appId, { name: 'id-card.png', bytes: png, what: 'Upload it as the ID', stated: true })
    expect(card).toMatchObject({ mediaType: 'image/png', scope: 'app', checked: null, bytes: 7 })
    // The app's are every task's; a task's own are its alone.
    expect((await listTestFiles(appId, issueId)).map((x) => [x.name, x.scope])).toEqual([['id-card.png', 'app'], ['one person.csv', 'task']])
    expect((await listTestFiles(appId, otherTask)).map((x) => x.name)).toEqual(['id-card.png'])
    expect((await listTestFiles(appId)).map((x) => x.name)).toEqual(['id-card.png'])
  })

  it('refuses one nobody says holds nothing real, an empty one, and text with a real value in it, which it does not quote', async () => {
    await expect(addTestFile(appId, { name: 'x.csv', bytes: bytes('a\n1\n'), stated: false })).rejects.toThrow('say it holds nothing real')
    await expect(addTestFile(appId, { name: 'x.csv', bytes: new Uint8Array(), stated: true })).rejects.toThrow('is empty')
    const err = await addTestFile(appId, { name: 'real.csv', bytes: bytes('work_email\nrowan.vale@northgate-holdings.com\n'), issueId, stated: true }).catch((e: Error) => e.message)
    expect(err).toMatch(/refused: real\.csv holds \d+ values? of a real response/)
    expect(err).toContain('an email from a real response of Scanner')
    expect(err).not.toContain('rowan')
    expect((await listTestFiles(appId, issueId)).some((x) => x.name === 'real.csv')).toBe(false)
  })

  it('keeps a real file on this computer with a fake made of it, and each place gets the version it says', async () => {
    const f = await addTestFile(appId, { name: 'import.csv', bytes: bytes('first_name,last_name,work_email\nMarisol,Okonkwo,marisol.okonkwo@harborline-freight.com\n'), what: 'Import it', issueId, real: true })
    expect(f).toMatchObject({ has: { fake: true, real: true }, use: { prototype: 'fake', smoke: 'fake', review: 'fake' } })
    expect(f.checked?.faked).toBeGreaterThan(0)
    const kept = readFileSync((await testFilePath(appId, f.id)).path, 'utf8')
    expect(kept.split('\n')[0]).toBe('first_name,last_name,work_email')
    for (const v of ['Marisol', 'Okonkwo', 'harborline']) expect(kept).not.toContain(v)
    expect(readFileSync((await testFilePath(appId, f.id, 'real')).path, 'utf8')).toContain('Marisol')
    // A smoke test is turned to the real one; a prototype and a reviewer are not.
    expect((await editTestFile(appId, f.id, { use: { smoke: 'real' } })).use).toEqual({ prototype: 'fake', smoke: 'real', review: 'fake' })
    const smoke = await placeTestFiles(appId, issueId, 'smoke', join(home, 'placed-smoke'))
    expect(smoke.files.find((x) => x.name === 'import.csv')).toMatchObject({ version: 'real', what: 'Import it' })
    expect(readFileSync(join(smoke.dir, 'import.csv'), 'utf8')).toContain('Marisol')
    expect(readFileSync(join(smoke.dir, 'README.md'), 'utf8')).toContain('`import.csv` (REAL: this computer only): Import it')
    for (const place of ['prototype', 'review'] as const) {
      const p = await placeTestFiles(appId, issueId, place, join(home, `placed-${place}`))
      expect(readFileSync(join(p.dir, 'import.csv'), 'utf8')).not.toContain('Marisol')
      expect(p.files.map((x) => x.name).sort()).toEqual(['id-card.png', 'import.csv', 'one person.csv'])
    }
    expect(testFilesSay(smoke).join('\n')).toContain('- import.csv: Import it')
    // Read back from the folder, for a page: what it was given, and in which version.
    expect((await placedFiles(appId, issueId, 'smoke', smoke.dir))?.files.find((x) => x.name === 'import.csv')).toMatchObject({ version: 'real', what: 'Import it' })
    expect(await placedFiles(appId, issueId, 'smoke', join(home, 'never-placed'))).toBeNull()
    await removeTestFile(appId, f.id)
  })

  it('keeps a real picture with no fake, which a reviewer does not get until a made-up one is added under its name', async () => {
    const f = await addTestFile(appId, { name: 'passport.png', bytes: new Uint8Array([1, 2, 3]), issueId, real: true })
    expect(f).toMatchObject({ has: { fake: false, real: true }, use: { prototype: null, smoke: null, review: null } })
    expect(f.note).toContain('no fake can be made of it here')
    expect((await placeTestFiles(appId, issueId, 'review', join(home, 'placed-review'))).missing).toEqual(['passport.png'])
    expect((await editTestFile(appId, f.id, { use: { prototype: 'real' } })).use.prototype).toBe('real')
    const both = await addTestFile(appId, { name: 'passport.png', bytes: new Uint8Array([9, 9]), issueId, stated: true })
    expect(both).toMatchObject({ id: f.id, has: { fake: true, real: true }, use: { prototype: 'real', smoke: 'fake', review: 'fake' } })
    await expect(editTestFile(appId, (await listTestFiles(appId)).find((x) => x.name === 'id-card.png')!.id, { use: { smoke: 'real' } })).rejects.toThrow('has no real version')
    await removeTestFile(appId, f.id)
  })

  it('replaces one of the same name, says again what to do with it, and removes it with its file', async () => {
    const [first] = (await listTestFiles(appId, issueId)).filter((x) => x.scope === 'task')
    const again = await addTestFile(appId, { name: 'one person.csv', bytes: bytes('first_name\nSample\n'), issueId, stated: true })
    expect(again).toMatchObject({ id: first.id, what: 'Import it on the Employees page', bytes: 18 })
    expect(await editTestFile(appId, again.id, { what: 'Import it, then open the person' })).toMatchObject({ what: 'Import it, then open the person' })
    const { path } = await testFilePath(appId, again.id)
    await removeTestFile(appId, again.id)
    expect(existsSync(path)).toBe(false)
    await expect(testFilePath(appId, again.id)).rejects.toThrow('no such test file')
  })
})
