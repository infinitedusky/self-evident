/**
 * A mock's data apart from its server: a real response, a fake of it and invented data, served by the same server.
 * Everything here is made up, the "real" response included. The first service answers a batch the way a scanning
 * vendor does (each row must carry back the id it was sent); the second is a plain JSON one.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { and, eq } from 'drizzle-orm'
import { app, mockData, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { parseCsv } from './mock-leaks.js'
import { fakeData, removeData, saveData, setDefaultData, useReal } from './mock-data.js'
import { exportMock, getMock, giveRecording, libraryStandIns, needsRecording, rowOf, saveMock } from './mocks.js'
import { startStandIns, stopStandIns } from './stand-ins.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const head = 'tracking_id,work_email,full_name,status,risk_level,profiles,person_summary'
const real = [
  head,
  `7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b,rowan.vale@northgate-holdings.com,Rowan Vale,completed,high,"[{'platform': 'linkedin', 'url': 'https://www.linkedin.com/in/rowan-vale-88', 'followers': 1243}]","Rowan Vale is a regional director at Northgate Holdings in Denver.\nTwo impersonating accounts were found."`,
  `9d2f6a1b-3c4e-4f70-9bac-1d2e3f4a5b6c,kit.marsh@northgate-holdings.com,Kit Marsh,completed,low,[],`,
].join('\n') + '\n'

// The server: remembers what each job was sent, and answers that job with a row of its data for each thing sent,
// the sent id and email written over the data's. It reads its data from $MOCK_DATA and holds none of its own.
const server = `import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const dir = process.env.MOCK_DATA
const parse = (text) => { const rows = []; let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) { const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c; continue }
    if (c === '"' && cell === '') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows }
const cell = (c) => (/[",\\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)
const [head, ...rows] = parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.csv'))), 'utf8'))
const email = head.indexOf('work_email'), id = head.indexOf('tracking_id')
const jobs = new Map()
http.createServer((req, res) => { let body = ''; req.on('data', (c) => { body += c }); req.on('end', () => {
  const send = (code, type, text) => { res.writeHead(code, { 'content-type': type }); res.end(text) }
  const json = (code, x) => send(code, 'application/json', JSON.stringify(x))
  const p = new URL(req.url, 'http://x').pathname
  let m
  if (req.method === 'POST' && p === '/runs') { const job = 'job-' + (jobs.size + 1); jobs.set(job, { sent: JSON.parse(body).items, polls: 0 }); return json(200, { job_id: job }) }
  if ((m = /^\\/runs\\/([^/]+)\\/status$/.exec(p)) && jobs.has(m[1])) { const j = jobs.get(m[1]); j.polls++; return json(200, { status: j.polls < 2 ? 'running' : 'completed' }) }
  if ((m = /^\\/runs\\/([^/]+)\\/links$/.exec(p)) && jobs.has(m[1])) return json(200, [{ download_url: 'http://' + req.headers.host + '/files/' + m[1] + '.csv', row_count: jobs.get(m[1]).sent.length }])
  if ((m = /^\\/files\\/([^/]+)\\.csv$/.exec(p)) && jobs.has(m[1])) {
    const out = jobs.get(m[1]).sent.map((s, i) => { const row = [...(rows.find((r) => r[email] === s.work_email) ?? rows[i % rows.length])]; row[id] = s.tracking_id; row[email] = s.work_email; return row })
    return send(200, 'text/csv', [head, ...out].map((r) => r.map(cell).join(',')).join('\\n') + '\\n') }
  json(404, { error: 'no such call' }) }) }).listen(Number(process.env.PORT), '127.0.0.1')
`
const flags = `import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(fs.readFileSync(path.join(process.env.MOCK_DATA, 'flags.json'))) }).listen(Number(process.env.PORT), '127.0.0.1')
`
const up = async (url: string, init?: RequestInit) => { for (let i = 0; i < 50; i++) { const r = await fetch(url, init).catch(() => null); if (r) return r; await new Promise((x) => setTimeout(x, 100)) } throw new Error(`${url} never answered`) }

describe.skipIf(!reachable)('a mock\'s data, apart from its server', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = '', given = ''
  const provenance = { minedFrom: 'a file the person gave, two people', real: 'the columns', invented: 'nothing: the server holds no data', covers: ['whatever its data holds'], cannotShow: ['the calls around the file, taken from the code'], kept: ['completed'] }
  const sent = [{ tracking_id: 'aaaaaaaa-0000-4000-8000-000000000001', work_email: 'one@meridian.example' }, { tracking_id: 'aaaaaaaa-0000-4000-8000-000000000002', work_email: 'two@meridian.example' }, { tracking_id: 'aaaaaaaa-0000-4000-8000-000000000003', work_email: 'three@meridian.example' }]
  /** The app's side of it: send a batch, wait, fetch the results. */
  const scan = async (port: number) => {
    const base = `http://127.0.0.1:${port}`
    const { job_id } = await (await up(`${base}/runs`, { method: 'POST', body: JSON.stringify({ items: sent }) })).json() as { job_id: string }
    const statuses: string[] = []
    for (let i = 0; i < 5 && statuses.at(-1) !== 'completed'; i++) statuses.push(((await (await fetch(`${base}/runs/${job_id}/status`)).json()) as { status: string }).status)
    const [link] = await (await fetch(`${base}/runs/${job_id}/links`)).json() as { download_url: string; row_count: number }[]
    return { statuses, link, rows: parseCsv(await (await fetch(link.download_url)).text()) }
  }
  const filesOf = async (data: string) => { const m = (await rowOf(appId, 'scanner'))!; return (await db.select().from(mockData).where(and(eq(mockData.mockId, m.id), eq(mockData.key, data))))[0].files }
  const run = async (id: string, pick: Record<string, string>) => {
    const [s] = (await libraryStandIns(appId, [], pick)).filter((x) => x.key === 'scanner')
    const ports = await startStandIns(id, [s], home)
    try { return { s, ...(await scan(ports.scanner)) } } finally { await stopStandIns(id) }
  }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'mock-data-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks'); process.env.STAND_INS_HOME = join(home, 'prototypes')
    await db.insert(workspace).values({ id: wsId, name: 'mock data test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [t] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = t.id
    await needsRecording(appId, { name: 'Scanner', issueId, needs: { file: 'the results CSV' } })
    given = (await giveRecording(appId, 'scanner', [{ name: 'results.csv', bytes: new TextEncoder().encode(real) }])).dir
    await saveMock(appId, { name: 'Scanner', status: 'mined', cmd: 'node server.mjs', env: { SCANNER_BASE_URL: '{url}' }, files: { 'server.mjs': server }, provenance, recording: given, issueId })
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME', 'STAND_INS_HOME']) delete process.env[k]; await pool.end() })

  it('makes a fake of the real response, with the same file names, checked, and the mock\'s default', async () => {
    const { data, report } = await fakeData(appId, 'scanner', { plan: { keep: ['status', 'risk_level', 'platform'], keepHosts: ['linkedin.com'] }, issueId })
    expect(data).toMatchObject({ key: 'faked', kind: 'faked', shareable: true, isDefault: true, files: [{ path: 'results.csv' }], provenance: { from: { given: true, files: 1 }, checked: { against: 1 }, kept: expect.arrayContaining(['completed', 'high']) } })
    expect(data.note).toContain('Faked from a real response the person gave')
    expect(report).toMatchObject({ files: 1, refusedKeep: [] })
    const m = await getMock(appId, 'scanner')
    expect(m).toMatchObject({ defaultData: 'faked', data: [{ key: 'faked' }] })
    // Faked again, it is the same fake: the salt is kept.
    const before = await filesOf('faked')
    await fakeData(appId, 'scanner', { plan: { keep: ['status', 'risk_level', 'platform'], keepHosts: ['linkedin.com'] } })
    expect(await filesOf('faked')).toEqual(before)
  })

  it('answers for exactly what it was sent, from the fake', async () => {
    const r = await run('proto_fake', {})
    expect(r.s.cmd).toContain('MOCK_DATA=')
    expect(r.s.data).toEqual({ key: 'faked', kind: 'faked' })
    expect(r.statuses).toEqual(['running', 'completed'])
    expect(r.link.row_count).toBe(3)
    const [h, ...rows] = r.rows
    expect(h.join(',')).toBe(head)
    expect(rows.map((x) => x[0])).toEqual(sent.map((s) => s.tracking_id)) // each row carries back the id it was sent
    expect(rows.map((x) => x[1])).toEqual(sent.map((s) => s.work_email))
    expect(rows.map((x) => x[3])).toEqual(['completed', 'completed', 'completed'])
    expect(rows[0][6].startsWith('Sample data:')).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/Rowan|Vale|Northgate|Kit Marsh|rowan-vale/)
  })

  it('takes people added to the fake by hand, and refuses a real value among them', async () => {
    const files = await filesOf('faked')
    const more = `${files['results.csv']}00000000-0000-4000-8000-00000000000a,lots@acme.example,Sample Lots,completed,high,"[{'platform': 'linkedin', 'url': 'https://www.linkedin.com/in/sample-lots', 'followers': 9}]",Sample data: a made-up person with a lot found.\n`
    await expect(saveData(appId, 'scanner', { dataKey: 'faked', files: { 'results.csv': `${more}x,kit.marsh@northgate-holdings.com,Kit Marsh,completed,low,[],\n` } })).rejects.toThrow(/refused: \d+ values? of the real response/)
    const d = await saveData(appId, 'scanner', { dataKey: 'faked', files: { 'results.csv': more } })
    expect(d).toMatchObject({ kind: 'faked', isDefault: true })
    expect(parseCsv(more)).toHaveLength(4)
  })

  it('serves the real response as it is with the same server, on this computer only', async () => {
    const d = await useReal(appId, 'scanner')
    expect(d).toMatchObject({ key: 'real', kind: 'real', shareable: false, isDefault: false, files: [] })
    expect(d.note).toContain('On this computer only')
    const r = await run('proto_real', { scanner: 'real' })
    expect(r.s.data).toEqual({ key: 'real', kind: 'real' })
    expect(r.s.name).toContain('a real response')
    const [, ...rows] = r.rows
    expect(rows.map((x) => x[0])).toEqual(sent.map((s) => s.tracking_id)) // still answered for what was sent
    expect(rows[0][2]).toBe('Rowan Vale') // and with what the real response holds
    await expect(saveData(appId, 'scanner', { dataKey: 'real', files: { 'a.csv': 'x' } })).rejects.toThrow('is not written over')
  })

  it('exports the fake beside the server, and never a real response', async () => {
    await expect(exportMock(appId, 'scanner', join(home, 'export-real'), 'real')).rejects.toThrow('never leaves this computer')
    const out = join(home, 'export')
    const r = await exportMock(appId, 'scanner', out)
    expect(r).toMatchObject({ checked: true, data: 'faked', files: ['PROVENANCE.md', 'data/results.csv', 'mock.json', 'server.mjs'] })
    expect(readFileSync(join(out, 'PROVENANCE.md'), 'utf8')).toContain('Its data ("Faked from the real response"): Faked from a real response the person gave')
    expect(JSON.parse(readFileSync(join(out, 'mock.json'), 'utf8'))).toMatchObject({ data: { key: 'faked', kind: 'faked', dir: 'data', variable: 'MOCK_DATA' } })
    expect(r.files.map((f) => readFileSync(join(out, f), 'utf8')).join('\n')).not.toMatch(/Rowan|Northgate/)
  })

  it('keeps invented data for a service with no real response only on a person\'s word, and says so', async () => {
    await saveMock(appId, { name: 'Flags', status: 'assumed', cmd: 'node server.mjs', env: { FLAGS_HOST: '{url}' }, files: { 'server.mjs': flags }, provenance: {} })
    const data = { 'flags.json': JSON.stringify({ featureFlags: { 'new-findings-page': true, 'bulk-import': false } }) }
    await expect(saveData(appId, 'flags', { dataKey: 'all on', files: data })).rejects.toThrow('only when a person states it holds nothing real')
    const d = await saveData(appId, 'flags', { dataKey: 'all on', files: data, stated: true }, 'user')
    expect(d).toMatchObject({ key: 'all-on', kind: 'invented', shareable: true, isDefault: true, provenance: { stated: { by: 'user' } } })
    expect(d.note).toBe('Provided by a person, who states it holds nothing real. Not checked: there is no real response of this service on this computer to check it against.')
    const [s] = (await libraryStandIns(appId)).filter((x) => x.key === 'flags')
    const ports = await startStandIns('proto_flags', [s], home)
    try { expect(await (await up(`http://127.0.0.1:${ports.flags}/decide`)).json()).toEqual({ featureFlags: { 'new-findings-page': true, 'bulk-import': false } }) } finally { await stopStandIns('proto_flags') }
  })

  it('checks invented data against the real responses there are, and lets the default be changed or a set removed', async () => {
    await expect(saveData(appId, 'scanner', { dataKey: 'nothing found', files: { 'results.csv': `${head}\nx,rowan.vale@northgate-holdings.com,Sample,completed,low,[],\n` } })).rejects.toThrow('so it is not invented')
    const d = await saveData(appId, 'scanner', { dataKey: 'nothing found', files: { 'results.csv': `${head}\n00000000-0000-4000-8000-00000000000b,none@acme.example,Sample Nobody,completed,low,[],\n` } })
    expect(d).toMatchObject({ key: 'nothing-found', kind: 'invented', provenance: { checked: { against: 1 } } })
    expect((await setDefaultData(appId, 'scanner', 'nothing found')).find((x) => x.isDefault)?.key).toBe('nothing-found')
    expect(await removeData(appId, 'scanner', 'nothing found')).toEqual({ removed: true })
    expect((await getMock(appId, 'scanner')).defaultData).toBeNull()
    expect(readFileSync(join(given, 'results.csv'), 'utf8')).toBe(real) // the real response is where it was, untouched
  })
})
