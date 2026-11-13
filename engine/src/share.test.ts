/**
 * Sharing: a public address for a prototype, mockups or sketches. The tunnel here is a stand-in (a script that prints
 * an address the way cloudflared does and stays up), so nothing is published; what it is asked to reach is real.
 */
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { desc, eq } from 'drizzle-orm'
import { app, event, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { setPrototypeCommand, startPrototype, stopPrototype, stopPrototypes, prototypeStatus } from './prototype.js'
import { share, shared, sharesOf, sketchServer, stopShares, unshare } from './share.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const SERVER = `node -e "require('http').createServer((q, s) => s.end('host ' + q.headers.host)).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 50; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe.skipIf(!reachable)('sharing', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  let dir: string
  let repoPath: string
  const was = { bin: process.env.CLOUDFLARED_BIN, hours: process.env.SHARE_HOURS }
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'if-share-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    await mkdir(join(repoPath, 'sketches'))
    await writeFile(join(repoPath, 'sketches', 'home.html'), '<h1>Home (sample)</h1>'); await writeFile(join(repoPath, 'secret.txt'), 'not a sketch')
    await commitAll(repoPath, 'init')
    // What cloudflared does, as far as the engine reads it: says what it was asked, prints the address on stderr, stays up.
    const fake = join(dir, 'cloudflared')
    await writeFile(fake, `#!/bin/sh\necho "$@" > "${dir}/asked.txt"\necho "INF |  https://sample-made-up-words.trycloudflare.com  |" >&2\necho "INF Registered tunnel connection connIndex=0" >&2\nexec sleep 600\n`); await chmod(fake, 0o755)
    process.env.CLOUDFLARED_BIN = fake
    await db.insert(workspace).values({ id: wsId, name: 'share test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
    await setPrototypeCommand(appId, SERVER)
  })
  afterAll(async () => { stopShares(); stopPrototypes(); process.env.CLOUDFLARED_BIN = was.bin; process.env.SHARE_HOURS = was.hours; await pool.end() })

  it('gives a running prototype a public address, reached as itself; the same again while it lasts; gone when the prototype stops', async () => {
    const p = await startPrototype({ appId, title: 'Shared (sample)' })
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)
    const port = (await prototypeStatus(p.id)).port
    const s = await share('prototype', p.id, 'user')
    expect(s).toMatchObject({ kind: 'prototype', id: p.id, url: 'https://sample-made-up-words.trycloudflare.com', by: 'user' })
    expect(Date.parse(s.expiresAt) - Date.parse(s.since)).toBe(8 * 3_600_000)
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'asked.txt'), 'utf8').trim()).toBe(`tunnel --no-autoupdate --url http://localhost:${port} --http-host-header localhost:${port}`)
    expect(await share('prototype', p.id)).toEqual(s) // not a second tunnel
    expect(sharesOf(appId)).toEqual([{ ...s, what: 'The prototype' }])
    const [started] = await db.select().from(event).where(eq(event.appId, appId)).orderBy(desc(event.seq)).limit(1)
    expect(started).toMatchObject({ type: 'share.started', payload: { kind: 'prototype', id: p.id, url: s.url } })

    await stopPrototype(p.id)
    expect(await until(async () => shared('prototype', p.id) === null)).toBe(true)
    await expect(share('prototype', p.id)).rejects.toThrow(/not running: start it, then share it/)
  })

  it('shares sketches through a server that reads only the sketches folder, and ends when asked or when its time is up', async () => {
    const { server, port } = await sketchServer(appId)
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('<a href="/home.html">home.html</a>')
      expect(await (await fetch(`http://127.0.0.1:${port}/home.html`)).text()).toBe('<h1>Home (sample)</h1>')
      expect((await fetch(`http://127.0.0.1:${port}/..%2Fsecret.txt`)).status).toBe(404)
      expect((await fetch(`http://127.0.0.1:${port}/home.html`, { method: 'POST' })).status).toBe(405)
    } finally { server.close() }

    const s = await share('sketch', appId, 'user')
    expect(s.url).toMatch(/trycloudflare\.com$/)
    expect(await unshare('sketch', appId)).toEqual({ stopped: true })
    expect(shared('sketch', appId)).toBeNull()
    expect(await unshare('sketch', appId)).toEqual({ stopped: false })

    process.env.SHARE_HOURS = String(0.3 / 3600) // a third of a second
    await share('sketch', appId, 'user')
    expect(await until(async () => shared('sketch', appId) === null)).toBe(true)
    const last = async () => (await db.select().from(event).where(eq(event.appId, appId)).orderBy(desc(event.seq)).limit(1))[0]
    expect(await until(async () => (await last()).type === 'share.stopped')).toBe(true) // the address goes first, then the notice
    expect(await last()).toMatchObject({ payload: { why: 'its time was up' } })
    process.env.SHARE_HOURS = was.hours
  })

  it('says how to get the tunnel when it is not installed, and what is missing when there is nothing to show', async () => {
    process.env.CLOUDFLARED_BIN = join(dir, 'no-such-binary')
    await expect(share('sketch', appId)).rejects.toThrow(/cloudflared is not installed[\s\S]*brew install cloudflared/)
    const deaf = join(dir, 'cloudflared-no-connection') // an address, but it never connects: a network that blocks the tunnel
    await writeFile(deaf, '#!/bin/sh\necho "https://sample-never-connects.trycloudflare.com" >&2\nexec sleep 600\n'); await chmod(deaf, 0o755)
    process.env.CLOUDFLARED_BIN = deaf; process.env.SHARE_START_TIMEOUT_MS = '400'
    await expect(share('sketch', appId)).rejects.toThrow(/got an address but did not connect to Cloudflare/)
    expect(shared('sketch', appId)).toBeNull()
    delete process.env.SHARE_START_TIMEOUT_MS
    process.env.CLOUDFLARED_BIN = join(dir, 'cloudflared')
    await expect(share('storybook', appId)).rejects.toThrow(/mockups are not running/)
    const empty = newId('app')
    await db.insert(app).values({ id: empty, workspaceId: wsId, name: 'Empty', key: empty.slice(-6).toUpperCase() })
    await expect(share('sketch', empty)).rejects.toThrow(/no sketches to share/)
  })
})
