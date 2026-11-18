/** The smoke test's terminal: who may reach it, what it starts with, and a real shell in a folder of its own. */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { EventBus } from './events.js'
import { newId } from './ids.js'
import { buildApp } from './server.js'
import { createProject } from './projects.js'
import { setSmokeSetup, smokeSetups, smokeView, startSmoke } from './smoke.js'
import { closeTerminal, openTerminal, ownPage, scratchKey, shellEnv, terminalOpen, typeInTerminal, watchTerminal } from './smoke-terminal.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('who may reach the terminal', () => {
  const ui = 'https://idea.example.test'
  it('is Self Evident\'s own page: this computer\'s names and the address it is served at, and nothing else', () => {
    expect(ownPage({ method: 'POST', origin: 'https://idea.example.test', contentType: 'application/json' }, ui)).toBe(true)
    expect(ownPage({ method: 'POST', origin: 'http://localhost:5180', contentType: 'application/json; charset=utf-8' }, ui)).toBe(true)
    expect(ownPage({ method: 'GET', site: 'same-origin' }, ui)).toBe(true) // the page's own stream
    expect(ownPage({ method: 'GET' }, ui)).toBe(true) // not a browser
    expect(ownPage({ method: 'POST', origin: 'https://elsewhere.example.test', contentType: 'application/json' }, ui)).toBe(false)
    expect(ownPage({ method: 'POST', origin: 'https://sb-6100.idea.example.test', contentType: 'application/json' }, ui)).toBe(false) // an app's Storybook, framed under our name
    expect(ownPage({ method: 'GET', origin: 'https://elsewhere.example.test' }, ui)).toBe(false)
    expect(ownPage({ method: 'GET', site: 'cross-site' }, ui)).toBe(false)
    expect(ownPage({ method: 'POST', contentType: 'text/plain' }, ui)).toBe(false) // what another site can send without asking
    expect(ownPage({ method: 'POST', origin: 'null', contentType: 'application/json' }, ui)).toBe(false)
  })
  it('does not start with the engine\'s own secrets', () => {
    const env = shellEnv({ PATH: '/usr/bin', HOME: '/home/sample', DATABASE_URL: 'postgres://sample', LINEAR_API_KEY: 'sample', POSTHOG_KEY: 'sample', DOPPLER_TOKEN: 'sample', ANTHROPIC_API_KEY: 'sample', GH_TOKEN: 'kept (sample)' }, { SMOKE_BUILD: '/tmp/sample' })
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/sample', GH_TOKEN: 'kept (sample)', SMOKE_BUILD: '/tmp/sample', TERM: 'xterm-256color' })
  })
})

describe('a set-up that is a terminal', () => {
  it('opens in the build\'s checkout unless it asks for a new folder; only a terminal has a folder', () => {
    expect(smokeSetups({ smoke: { setups: [{ name: 'Install (sample)', where: 'terminal', folder: 'temp', cmd: 'npm init -y' }, { name: 'Look (sample)', where: 'terminal' }, { name: 'Docs (sample)', folder: 'temp' }] } })).toEqual([
      { key: 'install-sample', name: 'Install (sample)', where: 'terminal', folder: 'temp', cmd: 'npm init -y' },
      { key: 'look-sample', name: 'Look (sample)', where: 'terminal', folder: 'build' },
      { key: 'docs-sample', name: 'Docs (sample)', where: 'local' },
    ])
  })
})

describe.skipIf(!reachable)('a real one', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const shell = process.env.SHELL
  beforeAll(async () => {
    process.env.SHELL = '/bin/sh' // not the person's own shell and its start-up files
    await db.insert(workspace).values({ id: wsId, name: 'terminal test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Library (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
  })
  afterAll(async () => { process.env.SHELL = shell; await pool.end() })

  it('is a shell in a new folder: its script is typed in, what is typed runs, and the folder goes when it is closed', async () => {
    expect((await setSmokeSetup(appId, { where: 'terminal', folder: 'temp', script: 'echo made-up-$((20 + 22))' })).setups[0]).toMatchObject({ where: 'terminal', folder: 'temp', script: 'echo made-up-$((20 + 22))', falls_back_to: null })
    const { issues: [t] } = await createProject({ appId, name: 'Install (sample)', issues: [{ title: 'Install it (sample)', brief: 'Build it.' }] })
    expect((await smokeView(t.id)).setups[0]).toMatchObject({ where: 'terminal', up: false, canRun: false, terminal: { folder: 'temp', open: false } })
    expect((await smokeView(t.id)).setups[0].scratch).toBeUndefined() // its own is already a new folder
    await expect(startSmoke(t.id)).rejects.toThrow(/is a terminal: open it/)
    const opened = await openTerminal(t.id)
    expect(opened).toMatchObject({ setup: 'main', folder: 'temp', fresh: true })
    expect(existsSync(opened.cwd)).toBe(true)
    expect(await openTerminal(t.id)).toMatchObject({ cwd: opened.cwd, fresh: false }) // the same one, asked for again
    let said = '', ended: number | null = null
    const stop = watchTerminal(t.id, 'main', (d) => { said += d }, (code) => { ended = code })
    const until = async (re: RegExp) => { for (let i = 0; i < 80 && !re.test(said); i++) await new Promise((r) => setTimeout(r, 50)); expect(said).toMatch(re) }
    await until(/made-up-42/)
    typeInTerminal(t.id, 'main', 'pwd; echo build=${SMOKE_BUILD:-none} db=${DATABASE_URL:-none}\r')
    await until(new RegExp(`${basename(opened.cwd)}[\\s\\S]*build=none db=none`))
    expect((await smokeView(t.id)).setups[0]).toMatchObject({ up: true, terminal: { open: true } })
    // Someone who opens the page later sees what was said before they came.
    let late = ''
    watchTerminal(t.id, 'main', (d) => { late += d }, () => {})()
    expect(late).toContain('made-up-42')
    // Through the engine's own routes: another site is refused, the page reads what is said and types into it.
    const api = buildApp(new EventBus())
    const post = (path: string, body: object, headers: Record<string, string> = {}) => api.request(`/api/issues/${t.id}/smoke/terminal${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    expect((await post('/input', { data: 'echo no\r' }, { origin: 'https://elsewhere.example.test' })).status).toBe(403)
    expect((await api.request(`/api/issues/${t.id}/smoke/terminal/input`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"data":"echo no\\r"}' })).status).toBe(403)
    expect((await api.request(`/api/issues/${t.id}/smoke/terminal/stream`, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect(await (await post('', {})).json()).toMatchObject({ cwd: opened.cwd, fresh: false })
    const res = await api.request(`/api/issues/${t.id}/smoke/terminal/stream?setup=main`)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader(), dec = new TextDecoder()
    let seen = ''
    const read = async (re: RegExp) => { for (let i = 0; i < 200 && !re.test(seen); i++) { const { value, done } = await reader.read(); if (done) break; seen += dec.decode(value) } expect(seen).toMatch(re) }
    await read(/event: data\ndata: ".*made-up-42/)
    expect((await post('/input', { setup: 'main', data: 'echo through-$((1 + 1))\r' })).status).toBe(200)
    await read(/through-2/)
    expect((await post('/resize', { cols: 120, rows: 30 })).status).toBe(200)
    await reader.cancel()
    expect(said).not.toContain('echo no')
    await closeTerminal(t.id, 'main')
    stop()
    expect(ended).not.toBeNull()
    expect(terminalOpen(t.id, 'main')).toBe(false)
    expect(existsSync(opened.cwd)).toBe(false)
    expect(() => typeInTerminal(t.id, 'main', 'ls\r')).toThrow(/not open/)
    await db.update(app).set({ setup: { smoke: { where: 'staging', url: 'https://staging.example.test' } } }).where(eq(app.id, appId))
    await expect(openTerminal(t.id)).rejects.toThrow(/is deployed: there is no folder here/)
    // Every set-up has a throwaway one, in a new empty folder: a deployed one too, and one that is not built yet.
    expect((await smokeView(t.id)).setups[0]).toMatchObject({ where: 'staging', scratch: { open: false } })
    const scratch = await openTerminal(t.id, undefined, {}, true)
    expect(scratch).toMatchObject({ setup: 'main@temp', folder: 'temp', fresh: true })
    expect(existsSync(scratch.cwd)).toBe(true)
    expect((await smokeView(t.id)).setups[0].scratch).toEqual({ open: true })
    const through = await buildApp(new EventBus()).request(`/api/issues/${t.id}/smoke/terminal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scratch: true }) })
    expect(await through.json()).toMatchObject({ cwd: scratch.cwd, fresh: false })
    await closeTerminal(t.id, scratchKey('main'))
    expect(existsSync(scratch.cwd)).toBe(false)
  }, 30_000)
})
