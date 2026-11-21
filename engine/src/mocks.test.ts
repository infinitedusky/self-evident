/** The mock library: raised, assumed, mined against its recording, used as a stand-in, and exported. All made-up data. */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { checkLeaks } from './mock-leaks.js'
import { exportMock, getMock, giveRecording, isGiven, libraryStandIns, LeakError, listMocks, mocksPrompt, needsRecording, noteUse, dropUse, provenanceNote, recordingsOfService, saveMock } from './mocks.js'
import { startStandIns, stopStandIns } from './stand-ins.js'
import { endMocks, mocksFor } from './smoke.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('the provenance note', () => {
  it('says what is real, what is invented and what it cannot show, and never more than counts', () => {
    const note = provenanceNote({ name: 'Vendor (sample)', status: 'mined', standsInFor: 'Vendor workflow 1a2b3c, results CSV', recordedAt: new Date('2026-11-18T12:00:00Z'), minedAt: new Date('2026-11-20T12:00:00Z'), provenance: { minedFrom: 'one person, 4 profiles, 2 scams', real: 'the columns and formats', invented: 'every value', covers: ['someone with nothing found'], cannotShow: ['the vendor\'s rate limits'], kept: ['completed'], checked: { at: '2026-11-20T12:00:00Z', files: 3, values: 120 } } })
    expect(note).toContain('Stands in for: Vendor workflow 1a2b3c, results CSV.')
    expect(note).toContain('a real response recorded 18 Nov 2026, one person, 4 profiles, 2 scams')
    expect(note).toContain("- the real service's latency and failures")
    expect(note).toContain('none of the 120 values')
    expect(provenanceNote({ name: 'X', status: 'assumed', standsInFor: '', recordedAt: null, minedAt: null, provenance: {} })).toContain('Its shape is assumed')
  })
  it('tells an agent what the library has', () => {
    expect(mocksPrompt([{ key: 'vendor', name: 'Vendor', status: 'needs_recording', standsInFor: '', needs: {}, recordedAt: null, unmined: null }])).toContain('Vendor (vendor): no mock yet, needs a recording')
  })
})

describe.skipIf(!reachable)('an app\'s library', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = ''
  const recorded = 'work_email,full_name,scams_found,status\nrowan.vale@north-sample.com,Rowan Vale,"[{\'title\': \'Cloned profile selling fake tickets\'}]",completed\n'
  const recording = () => join(home, 'recordings', appId, issueId, 'vendor', '2026-11-18T12-00-00Z')
  const server = 'import http.server, os\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        body = open("data/results.csv", "rb").read()\n        self.send_response(200); self.send_header("content-type", "text/csv"); self.end_headers(); self.wfile.write(body)\n    def log_message(self, *a): pass\nhttp.server.HTTPServer(("127.0.0.1", int(os.environ["PORT"])), H).serve_forever()\n'
  const invented = 'work_email,full_name,scams_found,status\nsam.sample@acme.example,Sample Person,[],completed\nlots.sample@acme.example,Sample Lots,"[{\'title\': \'Sample data: a made-up cloned page\'}]",completed\n'
  const provenance = { minedFrom: 'one person, 1 profile, 1 scam', real: 'the columns', invented: 'every value', covers: ['someone with nothing found', 'someone with one scam'], cannotShow: [], kept: ['completed'] }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'mocks-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks'); process.env.STAND_INS_HOME = join(home, 'prototypes')
    await db.insert(workspace).values({ id: wsId, name: 'mocks test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [t] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = t.id
    mkdirSync(recording(), { recursive: true })
    writeFileSync(join(recording(), '002.response.csv'), recorded)
    writeFileSync(join(recording(), '002-download.meta.json'), JSON.stringify({ method: 'GET', status: 200, request: { headers: { 'content-type': 'text/csv' } } }))
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME', 'STAND_INS_HOME']) delete process.env[k]; await pool.end() })

  it('raises a service with no mock on the task, with what a real call needs', async () => {
    const m = await needsRecording(appId, { name: 'Vendor', standsInFor: 'Vendor workflow 1a2b3c, results CSV', upstream: 'https://api.vendor.example', env: { VENDOR_BASE_URL: '{container_url}' }, issueId, needs: { person: 'one consenting person', key: 'VENDOR_API_KEY', cost: 'one scan, about $2' } })
    expect(m).toMatchObject({ key: 'vendor', status: 'needs_recording', needs: { person: 'one consenting person', cost: 'one scan, about $2' }, issue: { id: issueId } })
    expect(await libraryStandIns(appId)).toEqual([]) // nothing to serve yet
  })

  it('finds the recording waiting to be mined', async () => {
    expect(recordingsOfService(appId, 'vendor')).toMatchObject([{ dir: recording(), issueId }])
    expect((await listMocks(appId))[0].unmined).toMatchObject({ files: 2 })
  })

  it('refuses a mined mock that carries a value from its recording, and says which', async () => {
    const leaky = { ...{ 'server.py': server, 'data/results.csv': invented.replace('Sample Person', 'Rowan Vale') } }
    const err = await saveMock(appId, { name: 'Vendor', status: 'mined', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{container_url}' }, files: leaky, provenance, recording: recording(), issueId }).catch((e) => e)
    expect(err).toBeInstanceOf(LeakError)
    expect(err.leaks).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'data/results.csv', excerpt: 'rowan vale' })]))
    await expect(saveMock(appId, { name: 'Vendor', status: 'mined', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{url}' }, files: { 'server.py': server }, provenance: { ...provenance, kept: ['rowan.vale@north-sample.com'] }, recording: recording() })).rejects.toThrow(/never an email/)
    await expect(saveMock(appId, { name: 'Vendor', status: 'mined', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{url}' }, files: { 'server.py': server }, provenance, recording: '/etc' })).rejects.toThrow(/is not one/)
  })

  it('keeps a clean one, with its check, and serves it as a stand-in wherever the app runs', async () => {
    const m = await saveMock(appId, { name: 'Vendor', status: 'mined', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{url}' }, files: { 'server.py': server, 'data/results.csv': invented }, provenance, recording: recording(), issueId })
    expect(m).toMatchObject({ status: 'mined', needs: null, unmined: null, provenance: { checked: { files: 1 } } })
    expect(m.recordedAt).toBeTruthy()
    const [s] = await libraryStandIns(appId)
    expect(s).toMatchObject({ key: 'vendor', mock: 'mined', env: { VENDOR_BASE_URL: '{url}' } })
    const ports = await startStandIns('proto_sample', [s], home)
    noteUse('proto_sample', appId, 'Prototype: sample', ['vendor'])
    try {
      let body = ''
      for (let i = 0; i < 40 && !body; i++) { body = await fetch(`http://127.0.0.1:${ports.vendor}/`).then((r) => r.text()).catch(() => ''); if (!body) await new Promise((r) => setTimeout(r, 100)) }
      expect(body).toContain('Sample Person')
      expect((await getMock(appId, 'vendor')).usedBy).toEqual(['Prototype: sample'])
    } finally { await stopStandIns('proto_sample'); dropUse('proto_sample') }
    expect(await libraryStandIns(appId, ['vendor'])).toEqual([]) // a prototype with its own stand-in for it keeps its own
  })

  it('is what a smoke run is pointed at, and a live run goes through a recorder instead', async () => {
    const plain = await mocksFor(appId, issueId, 'main', home, [], {})
    try {
      expect(plain.env.VENDOR_BASE_URL).toMatch(/^http:\/\/localhost:\d+$/)
      expect(plain.env.SELF_EVIDENT_RECORDING).toBeUndefined()
      expect(readFileSync(plain.env.STAND_INS_ENV, 'utf8')).toContain(`VENDOR_BASE_URL=${plain.env.VENDOR_BASE_URL}`)
      expect(plain.held.on).toEqual([{ key: 'vendor', name: 'Vendor (mock)', how: 'mock' }])
    } finally { await endMocks(issueId, plain.held, false) }
    const live = await mocksFor(appId, issueId, 'main', home, ['vendor'], {})
    try {
      expect(live.held.on).toEqual([{ key: 'vendor', name: 'Vendor', how: 'recording' }])
      expect(live.env.VENDOR_BASE_URL).toBe(`http://localhost:${live.held.recorders[0].port}`)
      expect(live.env.SELF_EVIDENT_RECORDING).toBe('1')
    } finally { await endMocks(issueId, live.held, false) }
    await expect(mocksFor(appId, issueId, 'main', home, ['nope'], {})).rejects.toThrow(/no mock "nope" to record/)
  })

  it('asks what changed when a new recording replaces the one it was mined from', async () => {
    const again = join(home, 'recordings', appId, issueId, 'vendor', '2026-12-01T12-00-00Z')
    mkdirSync(again, { recursive: true }); writeFileSync(join(again, '002.response.csv'), recorded)
    await expect(saveMock(appId, { name: 'Vendor', status: 'mined', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{url}' }, files: { 'server.py': server, 'data/results.csv': invented }, provenance, recording: again })).rejects.toThrow(/say what changed/)
  })

  it('exports the invented copy with its provenance, and nothing from the recording', async () => {
    const out = join(home, 'export', 'vendor')
    const r = await exportMock(appId, 'vendor', out)
    expect(r).toMatchObject({ checked: true, files: ['PROVENANCE.md', 'data/results.csv', 'mock.json', 'server.py'] })
    const files = r.files.map((f) => ({ path: f, text: readFileSync(join(out, f), 'utf8') }))
    expect(checkLeaks([{ name: 'r', text: recorded }], files, ['completed']).ok).toBe(true)
    expect(readFileSync(join(out, 'PROVENANCE.md'), 'utf8')).toContain('Mined from: a real response recorded')
    expect(readdirSync(out)).not.toContain('002.response.csv')
  })

  it('takes a response the person already has instead of a live run, keeps it with the task, and mines a mock against it', async () => {
    await needsRecording(appId, { name: 'Lookup', issueId, needs: { file: 'the JSON a lookup returns' } })
    const given = '{"matches":[{"email":"kit.marsh@harbor-sample.com","name":"Kit Marsh","phone":"+1 415 555 0188"}]}'
    await expect(giveRecording(appId, 'lookup', [{ name: 'shot.png', bytes: new Uint8Array([137, 80, 0, 1]) }])).rejects.toThrow('not text')
    const r = await giveRecording(appId, 'lookup', [{ name: '../../lookup response.json', bytes: new TextEncoder().encode(given) }])
    expect(r).toMatchObject({ issueId, files: ['lookup response.json'] })
    expect(r.dir.startsWith(join(home, 'recordings', appId, issueId, 'lookup'))).toBe(true)
    expect(isGiven(r.dir)).toBe(true)
    expect(JSON.parse(readFileSync(join(r.dir, 'given.meta.json'), 'utf8'))).toMatchObject({ given: true, files: [{ name: 'lookup response.json' }], what: 'the JSON a lookup returns' })
    expect((await getMock(appId, 'lookup')).needs).toMatchObject({ recorded: r.dir })
    const mine = (data: string) => saveMock(appId, { key: 'lookup', name: 'Lookup', status: 'mined', cmd: 'python3 server.py', env: { LOOKUP_BASE_URL: '{container_url}' }, files: { 'server.py': 'print(1)', 'data.json': data }, provenance: { minedFrom: 'a file the person gave, one match', covers: ['no match', 'one match'], cannotShow: ['the lookup call itself, taken from the code'] }, recording: r.dir })
    await expect(mine(given)).rejects.toBeInstanceOf(LeakError)
    expect(await mine('{"matches":[{"email":"sam@acme.example","name":"Sample Person","phone":"+1 555 000 0000"}]}')).toMatchObject({ status: 'mined', needs: null })
  })
})
