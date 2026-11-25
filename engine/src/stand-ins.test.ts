/** Stand-ins: a prototype's own, started and stopped with it, in a folder outside the repository. Real processes, sample data. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { discardPrototype, prototypeEnv, prototypeStatus, removeStandIn, runPrototype, setPrototypeCommand, setStandIn, startPrototype, stopPrototype, stopPrototypes } from './prototype.js'
import { cleanStandIns, dirOf, envFileOf, envOf, fill, homeOf, withStandIn } from './stand-ins.js'

process.env.STAND_INS_HOME = mkdtempSync(join(tmpdir(), 'if-stand-ins-'))

describe('a stand-in, as it is kept', () => {
  it('needs a name and a command; its key is its name; a variable is a shell variable', () => {
    expect(cleanStandIns([{ name: 'SixtyFour (sample)', cmd: ' python stub.py ', env: { VENDOR_BASE_URL: '{url}', 'not a name': 'x', EMPTY: ' ' }, what: 'the vendor\'s API' }, { name: 'No command' }, { name: 'sixtyfour sample', cmd: 'again' }]))
      .toEqual([{ key: 'sixtyfour-sample', name: 'SixtyFour (sample)', cmd: 'python stub.py', env: { VENDOR_BASE_URL: '{url}' }, what: 'the vendor\'s API' }])
    expect(cleanStandIns('nothing')).toEqual([])
  })
  it('one set again by the same name replaces it; a new one is added', () => {
    const one = withStandIn([], { name: 'Vendor', cmd: 'a' })!
    expect(withStandIn(one, { name: 'vendor', cmd: 'b' })).toMatchObject([{ key: 'vendor', cmd: 'b' }])
    expect(withStandIn(one, { name: 'Mail', cmd: 'c' })!.map((s) => s.key)).toEqual(['vendor', 'mail'])
    expect(withStandIn(one, { name: 'Nothing to run' })).toBeNull()
  })
  it('its variables are filled in with where it is: the app is pointed at it by configuration alone', () => {
    const where = { port: 6123, home: '/h', dir: '/h/stand-ins/vendor', worktree: '/w' }
    expect(fill('{url}/v1', where)).toBe('http://localhost:6123/v1')
    expect(fill('http://host.docker.internal:{port}', where)).toBe('http://host.docker.internal:6123')
    expect(fill('{container_url}/v1 {url}', where)).toBe('http://host.docker.internal:6123/v1 http://localhost:6123') // as a container reaches it, and as this computer does
    expect(fill('compose.yml:{home}/stub.yml {dir} {worktree}', where)).toBe('compose.yml:/h/stub.yml /h/stand-ins/vendor /w')
    const list = cleanStandIns([{ name: 'Vendor', cmd: 'x', env: { VENDOR_BASE_URL: '{url}', VENDOR_API_KEY: 'stub' } }, { name: 'Mail', cmd: 'y', env: { MAIL_URL: '{url}' } }])
    expect(envOf('proto_sample', list, { vendor: 6123 }, '/w')).toEqual({ VENDOR_BASE_URL: 'http://localhost:6123', VENDOR_API_KEY: 'stub' }) // one that is not up points nowhere
    expect(dirOf('proto_sample', 'vendor')).toBe(join(homeOf('proto_sample'), 'stand-ins', 'vendor'))
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

// The app: answers with whatever the vendor says, found only through VENDOR_BASE_URL. The stand-in: serves the recording in its own folder.
const APP = `node -e "require('http').createServer(async (q, s) => { try { s.end('app got: ' + await (await fetch(process.env.VENDOR_BASE_URL)).text()) } catch (e) { s.end('no vendor: ' + (process.env.VENDOR_BASE_URL || 'not set')) } }).listen(process.env.PORT)"`
const STUB = `node -e "require('http').createServer((q, s) => s.end(require('fs').readFileSync('recording.txt', 'utf8'))).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 300; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }
const says = async (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.text()).catch(() => '')

describe.skipIf(!reachable)('a prototype with a stand-in', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let repoPath: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-standin-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'stand-in test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
    await setPrototypeCommand(appId, APP)
  })
  afterAll(async () => { stopPrototypes(); await pool.end() })

  it('is started with the prototype, which reaches it by a variable; survives a restart; stops with it; and goes when it is discarded', async () => {
    const p = await startPrototype({ appId, title: 'Vendor scan (sample)' })
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)
    expect(await says(p.url!)).toBe('no vendor: not set') // nothing stands in yet
    expect(readFileSync(envFileOf(p.id), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))).toEqual([]) // the file a container is given is there even so: naming it never fails
    expect((await prototypeEnv(p)).PROTOTYPE_HOME).toBe(homeOf(p.id))

    // What it serves is kept in its own folder, outside the repository: here, a recorded response.
    mkdirSync(dirOf(p.id, 'vendor'), { recursive: true })
    writeFileSync(join(dirOf(p.id, 'vendor'), 'recording.txt'), 'recorded findings (sample)')
    const set = await setStandIn(p.id, { name: 'Vendor', what: 'the vendor\'s API (sample)', cmd: STUB, env: { VENDOR_BASE_URL: '{url}', VENDOR_URL_IN_A_CONTAINER: '{container_url}/v1', VENDOR_API_KEY: 'stub' } })
    expect(set.standIns).toMatchObject([{ key: 'vendor', name: 'Vendor', running: true, dir: dirOf(p.id, 'vendor') }])
    expect(dirOf(p.id, 'vendor').startsWith(repoPath)).toBe(false)
    // Setting it restarted the prototype, so its server has the variable: the app's own code now reaches the stand-in.
    expect(await until(async () => (await says(p.url!)) === 'app got: recorded findings (sample)')).toBe(true)
    const stub = set.standIns[0].url!
    // And for a container: every variable in one file, written at this start.
    expect(readFileSync(envFileOf(p.id), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).sort()).toEqual(['VENDOR_API_KEY=stub', `VENDOR_BASE_URL=${stub}`, `VENDOR_URL_IN_A_CONTAINER=http://host.docker.internal:${set.standIns[0].port}/v1`])

    await runPrototype(p.id, 'person', { restart: true }) // the restart that lost the one kept in /tmp
    expect(await until(async () => (await says(p.url!)) === 'app got: recorded findings (sample)')).toBe(true)
    expect((await prototypeStatus(p.id)).standIns[0]).toMatchObject({ running: true, url: stub }) // and at the same address

    await stopPrototype(p.id)
    expect(await until(async () => (await says(stub)) === '')).toBe(true)
    expect((await prototypeStatus(p.id)).standIns[0]).toMatchObject({ running: false, url: null })
    expect(existsSync(join(dirOf(p.id, 'vendor'), 'recording.txt'))).toBe(true) // stopped, not forgotten

    await runPrototype(p.id)
    expect(await until(async () => (await says(p.url!)) === 'app got: recorded findings (sample)')).toBe(true)
    expect((await removeStandIn(p.id, 'Vendor')).standIns).toEqual([])
    expect(await until(async () => (await says(p.url!)) === 'no vendor: not set')).toBe(true)
    await expect(removeStandIn(p.id, 'vendor')).rejects.toThrow(/no stand-in/)
    await expect(setStandIn(p.id, { name: 'Nothing to run' })).rejects.toThrow(/needs a name and a command/)

    await setStandIn(p.id, { name: 'Vendor', cmd: STUB, env: { VENDOR_BASE_URL: '{url}' } })
    await discardPrototype(p.id)
    expect(existsSync(homeOf(p.id))).toBe(false) // its folder, and what was recorded there, goes with it
  })
})
