/** A clean slate, and every piece changed or taken away: a mock, its real responses, its endpoints, a data set's name, a task's calls. All made up. */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { fake } from './fake.js'
import { newId } from './ids.js'
import { renameData, saveData } from './mock-data.js'
import { checkLeaks } from './mock-leaks.js'
import { placesTable } from './mock-places.js'
import { editEndpoint, getMock, giveRecording, listReal, mockHistory, removeMock, removeReal } from './mocks.js'
import { createProject } from './projects.js'
import { addCall, clearCalls, coverCall, editCall, listCalls } from './task-calls.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const bytes = (s: string) => new TextEncoder().encode(s)

describe('the leak check on a response with data inside data', () => {
  // A provider's raw answer kept as a string inside a JSON cell, four deep; and a cell that is "(1)".
  const deep = JSON.stringify({ provider: { raw: JSON.stringify({ input: { first_name: 'Rowan', attempts: 1, verified: true, result: JSON.stringify({ status: 'valid', tracking: { attempts: 2, waterfall: true, result: false } }) } }) } })
  const real = `tracking_id,note,raw\n7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b,(1).,"${deep.replace(/"/g, '""')}"\n`
  it('does not take its keys for a phrase, or "(1)." for a handle, and still finds the name', () => {
    const { files, report } = fake([{ name: 'r.csv', text: real }], { keep: ['status'], salt: 'test' })
    expect(files['r.csv']).not.toContain('Rowan')
    expect(checkLeaks([{ name: 'r.csv', text: real }], [{ path: 'r.csv', text: files['r.csv'] }], report.keptValues)).toMatchObject({ ok: true, leaks: [] })
    expect(checkLeaks([{ name: 'r.csv', text: real }], [{ path: 'r.csv', text: files['r.csv'].replace('tracking_id', 'tracking_id') + 'x,y,"about Rowan"\n' }], report.keptValues).ok).toBe(false)
    expect(report.maybeStructure).not.toContain('raw.provider.raw.input.first_name') // a first name is one plain word too: never offered as structure
  })
})

describe.skipIf(!reachable)('starting again, and changing or removing each piece', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = ''
  const call = async () => (await listCalls(issueId))[0]
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'mock-clean-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks')
    await db.insert(workspace).values({ id: wsId, name: 'mock clean test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [t] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = t.id
    await addCall(issueId, { service: 'Scanner', method: 'GET', path: '/runs/{id}/results', what: 'One row per person' }, 'user')
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME']) delete process.env[k]; await pool.end() })

  it('a mock removed without its files leaves them on this computer, and the next mock does not take them up', async () => {
    await coverCall(issueId, (await call()).id)
    const given = await giveRecording(appId, 'scanner', [{ name: 'out.csv', bytes: bytes('a,b\n1,2\n') }], 'user', 'runs-results')
    expect((await call()).endpoint?.real).toMatchObject({ how: 'given' })
    expect(await removeMock(appId, 'scanner')).toEqual({ removed: true, files: 0 })
    expect(existsSync(given.dir)).toBe(true)
    expect((await call()).state).toBe('no_mock') // the task still lists the call; nothing answers it
    await new Promise((r) => setTimeout(r, 1200))
    await coverCall(issueId, (await call()).id)
    const m = await getMock(appId, 'scanner')
    expect(m).toMatchObject({ status: 'needs_recording', unmined: null, recordedAt: null })
    expect(m.endpoints[0].real).toBeNull() // no real response behind it: the old one is not this mock's
    expect((await placesTable(appId, issueId))[0].real).toBeNull()
    expect(await listReal(appId, 'scanner')).toMatchObject([{ before: true, given: true, files: [{ name: 'runs-results.csv' }] }]) // still there to be seen, and deleted
  })

  it('a real response is deleted from this computer by itself, and a mock removed with its files leaves nothing', async () => {
    const [old] = await listReal(appId, 'scanner')
    await expect(removeReal(appId, 'scanner', '../../somewhere')).rejects.toThrow()
    expect(await removeReal(appId, 'scanner', old.id)).toEqual([])
    const again = await giveRecording(appId, 'scanner', [{ name: 'out.csv', bytes: bytes('a,b\n1,2\n') }], 'user', 'runs-results')
    expect(await listReal(appId, 'scanner')).toMatchObject([{ before: false }])
    expect(await removeMock(appId, 'scanner', 'user', { files: true })).toEqual({ removed: true, files: 1 })
    expect(existsSync(again.dir)).toBe(false)
  })

  it('an endpoint, a data set\'s name and a call can each be changed, and taken away', async () => {
    await coverCall(issueId, (await call()).id)
    expect((await editEndpoint(appId, 'scanner', 'runs-results', { what: 'One row for each person sent' })).endpoints[0]).toMatchObject({ key: 'runs-results', method: 'GET', what: 'One row for each person sent' })
    await expect(editEndpoint(appId, 'scanner', 'nothing', { what: 'x' })).rejects.toThrow('has no endpoint')
    await saveData(appId, 'scanner', { dataKey: 'nobody', files: { 'runs-results.csv': 'a,b\n' }, stated: true }, 'user')
    expect((await renameData(appId, 'scanner', 'nobody', 'Someone with nothing found'))[0]).toMatchObject({ key: 'nobody', name: 'Someone with nothing found' })
    // The call changed: what it needs, then the call itself, which is then not the mock's endpoint any more.
    const c = await call()
    expect((await editCall(issueId, c.id, { what: 'One row per person, and nobody at all' }))[0]).toMatchObject({ what: 'One row per person, and nobody at all', state: 'answered' })
    expect((await editCall(issueId, c.id, { path: '/runs/{id}/files' }))[0]).toMatchObject({ path: '/runs/{id}/files', state: 'no_endpoint' })
    expect((await editEndpoint(appId, 'scanner', 'runs-results', null)).endpoints).toEqual([])
    expect((await mockHistory(appId, 'scanner')).map((h) => h.what)).toEqual(expect.arrayContaining(['The call "runs-results" was taken off', 'The call "runs-results" was changed', 'Data "nobody" was renamed']))
    expect(await clearCalls(issueId)).toEqual([])
  })
})
