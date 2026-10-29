/** Prototypes: a worktree of their own, a server on a free port that answers, stop and start again, discard. */
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { and, eq } from 'drizzle-orm'
import { app, event, repo, session, workspace } from './db/schema.js'
import { branchExists, commitAll, git } from './git.js'
import { newId } from './ids.js'
import { discardPrototype, listPrototypes, prototypeStatus, runPrototype, setPrototypeCommand, startPrototype, stopPrototype, stopPrototypes, talkFor } from './prototype.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const SERVER = `node -e "require('http').createServer((q, s) => s.end('hello from ' + process.cwd())).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 50; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe.skipIf(!reachable)('prototypes', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  let repoPath: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-proto-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'proto test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
  })
  afterAll(async () => { stopPrototypes(); await pool.end() })

  it('says what is missing before the app has a prototype command', async () => {
    await expect(startPrototype({ appId, title: 'Checkout' })).rejects.toThrow(/no prototype command/)
  })

  it('starts in a worktree of its own, serves on its port, stops, starts again and is discarded', async () => {
    await setPrototypeCommand(appId, SERVER)
    const p = await startPrototype({ appId, title: 'One-tap checkout!' })
    expect(p.branch).toMatch(/^prototype\/one-tap-checkout-[a-z0-9]{4}$/)
    expect(p.path).toBe(join(`${repoPath}-worktrees`, `prototype--${p.branch.slice('prototype/'.length)}`))
    expect(existsSync(join(p.path, 'a.txt'))).toBe(true)
    expect(p.status).toBe('running')
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)
    expect(await (await fetch(p.url!)).text()).toContain('prototype--one-tap-checkout')
    expect((await listPrototypes(appId)).map((x) => x.id)).toEqual([p.id])

    const stopped = await stopPrototype(p.id)
    expect(stopped.status).toBe('stopped')
    const again = await runPrototype(p.id)
    expect(again.status).toBe('running')
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)

    const port = (await prototypeStatus(p.id)).port
    const restarted = await runPrototype(p.id, 'person', { restart: true })
    expect(restarted.port).toBe(port) // the same address, so an open tab still finds it
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)

    // Its conversation works in its worktree, acts up to moderate, and is shown with the prototype beside it.
    const [s] = await db.select().from(session).where(eq(session.id, p.sessionId))
    expect(s).toMatchObject({ cwd: p.path, branch: p.branch, worktreePath: null, autoApprove: 'moderate', subject: 'Prototype: One-tap checkout!', subjectRef: { prototypeId: p.id } })
    expect((await talkFor(p.id)).id).toBe(p.sessionId)
    const shown = await db.select().from(event).where(and(eq(event.appId, appId)))
    expect(shown.map((e) => e.type)).toEqual(expect.arrayContaining(['ui.talk', 'ui.open', 'prototype.created', 'prototype.started']))
    expect(shown.find((e) => e.type === 'ui.open')?.payload).toMatchObject({ tab: { kind: 'prototype', id: p.id }, split: 'right' })

    await discardPrototype(p.id)
    expect((await db.select().from(session).where(eq(session.id, p.sessionId)))[0].status).toBe('ended')
    expect(existsSync(p.path)).toBe(false)
    expect(await branchExists(repoPath, p.branch)).toBe(false)
    expect(await listPrototypes(appId)).toEqual([])
    await expect(runPrototype(p.id)).rejects.toThrow(/discarded/)
  })
})
