/** What a task calls outside the app, and what answers each call. All made up. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { addService, getMock, giveRecording, listMocks } from './mocks.js'
import { createProject } from './projects.js'
import { addCall, addTaskService, callsPrompt, coverCall, linkCall, listCalls, listTaskServices, removeCall, removeTaskService, setCalls } from './task-calls.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('what a task calls', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let home = '', issueId = ''
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'task-calls-'))
    process.env.RECORDINGS_HOME = join(home, 'recordings'); process.env.MOCKS_HOME = join(home, 'mocks')
    await db.insert(workspace).values({ id: wsId, name: 'task calls test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const { issues: [t] } = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }] })
    issueId = t.id
  })
  afterAll(async () => { rmSync(home, { recursive: true, force: true }); for (const k of ['RECORDINGS_HOME', 'MOCKS_HOME']) delete process.env[k]; await pool.end() })

  it('is made to one of the app\'s services, set up in its settings; one written differently is the same one, and one the app lacks is refused', async () => {
    await addService(appId, { name: 'Scanner', standsInFor: 'A scanning vendor (sample)' })
    await expect(addService(appId, { name: 'scan_ner' })).rejects.toThrow('already one of this app\'s services, as "Scanner"')
    await expect(addCall(issueId, { service: 'Flags', method: 'GET', path: '/decide' }, 'user')).rejects.toThrow('"Flags" is not one of this app\'s services')
    await expect(addTaskService(issueId, 'Flags')).rejects.toThrow('add it in Settings')
    // An agent that finds one in the code sets it up in the app's settings, and says it was for this task.
    const found = await addTaskService(issueId, 'Flags', 'agent', { create: true, what: 'Feature flags (sample)' })
    expect(found).toMatchObject([{ key: 'flags', name: 'Flags', standsInFor: 'Feature flags (sample)', status: 'needs_recording', calls: [] }])
    expect((await listMocks(appId)).map((m) => m.name)).toEqual(['Flags', 'Scanner'])
    expect((await removeTaskService(issueId, 'flags')).map((s) => s.key)).toEqual([]) // off the task; still one of the app's
    expect((await listMocks(appId)).map((m) => m.name)).toEqual(['Flags', 'Scanner'])
  })

  it('lists its calls under their service, however the service is written, and each is on the mock from then on', async () => {
    const listed = await setCalls(issueId, [
      { service: 'scanner', method: 'post', path: '/runs', what: 'A job id for the people sent' },
      { service: 'SCANNER', method: 'GET', path: '/runs/{id}/status', what: 'Running, then completed' },
    ])
    expect(listed.map((c) => [c.serviceName, c.service, c.method, c.path, c.state, c.by])).toEqual([['Scanner', 'scanner', 'POST', '/runs', 'answered', 'agent'], ['Scanner', 'scanner', 'GET', '/runs/{id}/status', 'answered', 'agent']])
    expect((await getMock(appId, 'scanner')).endpoints.map((e) => [e.key, e.method, e.path, e.real])).toEqual([['runs', 'POST', '/runs', null], ['runs-status', 'GET', '/runs/{id}/status', null]])
    const mine = await addCall(issueId, { service: 'Scanner', method: 'GET', path: '/runs/{id}/cost', what: 'What the run cost' }, 'user')
    expect(mine.find((c) => c.path === '/runs/{id}/cost')).toMatchObject({ by: 'user', state: 'answered', endpoint: { key: 'runs-cost' } })
    // The agent sets its list again without the cost call: its own rows are as they were, the person's stays.
    const again = await setCalls(issueId, [{ service: 'Scanner', method: 'POST', path: '/runs' }, { service: 'Scanner', method: 'GET', path: '/runs/{id}/status', what: 'Running, then completed, then failed' }])
    expect(again.map((c) => c.path)).toEqual(['/runs', '/runs/{id}/status', '/runs/{id}/cost'])
    expect(again[0].what).toBe('A job id for the people sent')
    expect(again[1].what).toBe('Running, then completed, then failed')
    expect(await listTaskServices(issueId)).toMatchObject([{ key: 'scanner', calls: [{ path: '/runs' }, { path: '/runs/{id}/status' }, { path: '/runs/{id}/cost' }] }])
  })

  it('has a real response given for one call behind that call', async () => {
    await giveRecording(appId, 'scanner', [{ name: 'a poll.json', bytes: new TextEncoder().encode('{"status":"completed"}') }], 'user', 'runs-status')
    expect((await listCalls(issueId))[1].endpoint).toMatchObject({ key: 'runs-status', real: { how: 'given' } })
    expect((await coverCall(issueId, (await listCalls(issueId))[1].id)).mock.endpoints).toHaveLength(3) // already on the mock: nothing is added twice
  })

  it('can be tied by hand to another of the mock\'s endpoints, and taken off the list', async () => {
    const cost = (await listCalls(issueId))[2]
    await expect(linkCall(issueId, cost.id, 'nothing')).rejects.toThrow('has no endpoint "nothing"')
    expect((await linkCall(issueId, cost.id, 'runs-status'))[2]).toMatchObject({ state: 'answered', linked: true, endpoint: { key: 'runs-status' } })
    expect((await linkCall(issueId, cost.id, null))[2]).toMatchObject({ state: 'answered', linked: false, endpoint: { key: 'runs-cost' } })
    const prompt = callsPrompt(await listTaskServices(issueId), [{ key: 'scanner', name: 'Scanner' }, { key: 'flags', name: 'Flags' }])
    expect(prompt).toContain("The app's services, set up in its settings: Scanner (scanner), Flags (flags)")
    expect(prompt).toContain('  - GET /runs/{id}/status — needs: Running, then completed, then failed [a real response behind it (given)]')
    expect(prompt).toContain('  - GET /runs/{id}/cost — needs: What the run cost [from the code, no real response]')
    expect((await removeCall(issueId, cost.id)).map((c) => c.path)).toEqual(['/runs', '/runs/{id}/status'])
  })
})
