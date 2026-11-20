/** The app's main, running: on and off by hand, off by itself when nobody looks, behind when main moves, or an address. Made-up app (sample). */
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { MAIN_IDLE_MS, mainStatus, removeMain, setMainAddress, setMainStandIn, startMain, stopIdleMains, stopMain, stopMains } from './main-running.js'
import { setPrototypeCommand } from './prototype.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const SERVER = `node -e "require('http').createServer((q, s) => s.end(require('fs').readFileSync('a.txt', 'utf8') + (process.env.VENDOR_URL || '') + ' ' + process.cwd())).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 60; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe.skipIf(!reachable)('the app\'s main, running', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let repoPath: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-main-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'main test (sample)' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
  })
  afterAll(async () => { stopMains(); await pool.end() })

  it('cannot be turned on before the app has a command, and says so', async () => {
    expect(await mainStatus(appId)).toMatchObject({ how: 'none', running: false, canRun: false, url: null })
    await expect(startMain(appId)).rejects.toThrow(/no command to start it/)
  })

  it('is turned on in a worktree of its own at main, keeps its address when turned on again, and is turned off', async () => {
    await setPrototypeCommand(appId, SERVER)
    expect(await mainStatus(appId)).toMatchObject({ how: 'local', running: false, canRun: true })
    const on = await startMain(appId)
    const tip = (await git(repoPath, ['rev-parse', 'main'])).stdout.trim()
    expect(on).toMatchObject({ running: true, sha: tip, tip, behind: false, idleMinutes: 30 })
    expect(await until(async () => (await mainStatus(appId)).up)).toBe(true)
    expect(await (await fetch(on.url!)).text()).toMatch(/^one\n.*main--running$/)
    expect((await startMain(appId)).url).toBe(on.url) // asked for again while it is on: the same one

    // Main moves on: it stays where it is and says it is behind; Update brings it up again there.
    await writeFile(join(repoPath, 'a.txt'), 'two\n'); await commitAll(repoPath, 'main moved (sample)')
    expect(await mainStatus(appId)).toMatchObject({ behind: true, sha: tip })
    const updated = await startMain(appId, 'person', { update: true })
    expect(updated).toMatchObject({ behind: false, url: on.url })
    expect(await until(async () => (await mainStatus(appId)).up)).toBe(true)
    expect(await (await fetch(on.url!)).text()).toMatch(/^two\n/)

    const off = await stopMain(appId)
    expect(off).toMatchObject({ running: false, url: null, stopsAt: null })
    expect(await fetch(on.url!).then(() => true, () => false)).toBe(false)
    expect(existsSync(join(`${repoPath}-worktrees`, 'main--running'))).toBe(true) // kept for the next time
    expect((await startMain(appId)).url).toBe(on.url) // the same address, so an open tab finds it
    await stopMain(appId)
  })

  it('a task has a main of its own for comparing: another port and worktree, the app\'s main left alone, removed with the task', async () => {
    const app = await startMain(appId)
    const mine = await startMain(appId, 'person', { for: 'iss_Task1' })
    expect(mine).toMatchObject({ running: true, for: 'iss-task1' })
    expect(mine.url).not.toBe(app.url)
    expect(await until(async () => (await mainStatus(appId, false, 'iss_Task1')).up)).toBe(true)
    expect(await (await fetch(mine.url!)).text()).toMatch(/main--iss-task1$/)
    expect((await startMain(appId, 'person', { for: 'iss_Task1' })).url).toBe(mine.url) // one per task: asked for again, the same one
    expect((await stopMain(appId, 'person', undefined, 'iss_Task1')).running).toBe(false)
    expect((await mainStatus(appId)).running).toBe(true) // the app's own is not the comparison's to turn off
    expect(existsSync(join(`${repoPath}-worktrees`, 'main--iss-task1'))).toBe(true)
    await removeMain(appId, 'iss_Task1')
    expect(existsSync(join(`${repoPath}-worktrees`, 'main--iss-task1'))).toBe(false)
    await stopMain(appId)
  })

  it('turns itself off when nobody has looked for a while; a look keeps it up', async () => {
    await startMain(appId)
    const soon = Date.now() + MAIN_IDLE_MS() - 1000
    expect(await stopIdleMains(soon)).toEqual([])
    expect(await stopIdleMains(Date.now() + MAIN_IDLE_MS() + 1000)).toEqual([appId])
    expect((await mainStatus(appId)).running).toBe(false)
    await startMain(appId)
    const later = Date.now() + MAIN_IDLE_MS() + 1000
    const realNow = Date.now; Date.now = () => later
    try { await mainStatus(appId, true) } finally { Date.now = realNow } // someone looked, just now
    expect(await stopIdleMains(later + 1000)).toEqual([])
    expect((await mainStatus(appId)).running).toBe(true)
    await stopMain(appId)
  })

  it('has stand-ins of its own, started with it and pointed at by the variables they set', async () => {
    const set = await setMainStandIn(appId, { name: 'Vendor (sample)', cmd: `node -e "require('http').createServer((q, s) => s.end('stood in')).listen(process.env.PORT)"`, env: { VENDOR_URL: '{url}' } })
    expect(set.standIns).toMatchObject([{ key: 'vendor-sample', running: false }])
    const on = await startMain(appId)
    expect(on.standIns).toMatchObject([{ key: 'vendor-sample', running: true }])
    expect(await until(async () => (await mainStatus(appId)).up)).toBe(true)
    expect(await (await fetch(on.url!)).text()).toContain(on.standIns[0].url!)
    expect((await stopMain(appId)).standIns).toMatchObject([{ running: false }])
    expect((await setMainStandIn(appId, null, 'Vendor (sample)')).standIns).toEqual([])
  })

  it('is an address, with nothing to run, for an app whose main is deployed', async () => {
    await expect(setMainAddress(appId, 'shop.example')).rejects.toThrow(/http/)
    expect(await setMainAddress(appId, 'https://shop.example (sample)'.split(' ')[0])).toMatchObject({ how: 'address', url: 'https://shop.example', running: true, canRun: false })
    expect((await startMain(appId)).how).toBe('address')
    expect(await setMainAddress(appId, '')).toMatchObject({ how: 'local', running: false })
  })
})
