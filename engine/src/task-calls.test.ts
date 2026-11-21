/** What a task calls outside the app, and what answers each call. All made up. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { getMock, giveRecording } from './mocks.js'
import { createProject } from './projects.js'
import { addCall, callsPrompt, coverCall, linkCall, listCalls, removeCall, setCalls } from './task-calls.js'

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

  it('is listed by the agent from the brief and the code, and the person can add what it missed', async () => {
    const listed = await setCalls(issueId, [
      { service: 'Scanner', method: 'post', path: '/runs', what: 'A job id for the people sent' },
      { service: 'Scanner', method: 'GET', path: '/runs/{id}/status', what: 'Running, then completed' },
      { service: 'Flags', method: 'GET', path: '/decide', what: 'Whether the new page is on' },
    ])
    expect(listed.map((c) => [c.serviceName, c.method, c.path, c.state, c.by])).toEqual([['Flags', 'GET', '/decide', 'no_mock', 'agent'], ['Scanner', 'POST', '/runs', 'no_mock', 'agent'], ['Scanner', 'GET', '/runs/{id}/status', 'no_mock', 'agent']])
    const mine = await addCall(issueId, { service: 'Scanner', method: 'GET', path: '/runs/{id}/cost', what: 'What the run cost' }, 'user')
    expect(mine.find((c) => c.path === '/runs/{id}/cost')).toMatchObject({ by: 'user', state: 'no_mock' })
    // The agent sets its list again without the flags call: its own row goes, the person's stays.
    const again = await setCalls(issueId, [{ service: 'Scanner', method: 'POST', path: '/runs' }, { service: 'Scanner', method: 'GET', path: '/runs/{id}/status', what: 'Running, then completed, then failed' }])
    expect(again.map((c) => c.path)).toEqual(['/runs', '/runs/{id}/status', '/runs/{id}/cost'])
    expect(again[0].what).toBe('A job id for the people sent') // what it needs is kept when it is not said again
    expect(again[1].what).toBe('Running, then completed, then failed')
    await expect(addCall(issueId, { service: '', method: 'GET', path: '/x' })).rejects.toThrow('needs the service')
  })

  it('makes the service\'s mock for a call that has none, with that call as its first endpoint', async () => {
    const [start] = await listCalls(issueId)
    const { calls, mock } = await coverCall(issueId, start.id)
    expect(mock).toMatchObject({ key: 'scanner', name: 'Scanner', status: 'needs_recording', issue: { id: issueId }, endpoints: [{ key: 'runs', method: 'POST', path: '/runs', real: null }] })
    expect(calls[0]).toMatchObject({ state: 'answered', mock: { key: 'scanner', status: 'needs_recording' }, endpoint: { key: 'runs', real: null }, linked: false })
    expect(calls[1]).toMatchObject({ state: 'no_endpoint', mock: { key: 'scanner' }, endpoint: null }) // the mock is there now, and lacks this call
  })

  it('adds a call to a mock that lacks it, and a real response given for that call is behind it', async () => {
    const status = (await listCalls(issueId))[1]
    const { calls } = await coverCall(issueId, status.id)
    expect(calls[1]).toMatchObject({ state: 'answered', endpoint: { key: 'runs-status', method: 'GET', path: '/runs/{id}/status', what: 'Running, then completed, then failed', real: null } })
    expect((await coverCall(issueId, status.id)).mock.endpoints).toHaveLength(2) // asked twice, added once
    await giveRecording(appId, 'scanner', [{ name: 'a poll.json', bytes: new TextEncoder().encode('{"status":"completed"}') }], 'user', 'runs-status')
    expect((await listCalls(issueId))[1].endpoint).toMatchObject({ key: 'runs-status', real: { how: 'given' } })
    expect((await getMock(appId, 'scanner')).endpoints.map((e) => [e.key, e.real?.how ?? null])).toEqual([['runs', null], ['runs-status', 'given']])
  })

  it('can be tied by hand to an endpoint its path does not find, and taken off the list', async () => {
    const cost = (await listCalls(issueId))[2]
    await expect(linkCall(issueId, cost.id, 'nothing')).rejects.toThrow('has no endpoint "nothing"')
    expect((await linkCall(issueId, cost.id, 'runs-status'))[2]).toMatchObject({ state: 'answered', linked: true, endpoint: { key: 'runs-status' } })
    expect((await linkCall(issueId, cost.id, null))[2]).toMatchObject({ state: 'no_endpoint', linked: false })
    const prompt = callsPrompt(await listCalls(issueId))
    expect(prompt).toContain('Scanner: GET /runs/{id}/status — needs: Running, then completed, then failed [answered by its mock, from a real response (given)]')
    expect(prompt).toContain('Scanner: GET /runs/{id}/cost — needs: What the run cost [its mock lacks this call]')
    expect((await removeCall(issueId, cost.id)).map((c) => c.path)).toEqual(['/runs', '/runs/{id}/status'])
  })
})
