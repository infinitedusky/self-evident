/**
 * Paths are stored from the computer's root, so two computers with different users share one database
 * (db/home-path.ts), and each computer registers itself (machine.ts). MACHINE_ROOT and MACHINE_NAME stand in for a
 * second computer.
 */
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { fromStored, toStored } from './db/home-path.js'
import { app, machine, repo, session, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { machines, registerMachine } from './machine.js'

describe('a stored path', () => {
  it('is kept from the root when it is under it, and as it is when it is not', () => {
    expect(toStored('/Users/desk/code/golf', '/Users/desk')).toBe('~/code/golf')
    expect(toStored('/Users/desk', '/Users/desk')).toBe('~')
    expect(toStored('/Users/desk-other/code', '/Users/desk')).toBe('/Users/desk-other/code') // a name that only starts the same
    expect(toStored('/tmp/x', '/Users/desk')).toBe('/tmp/x')
  })
  it('gets each computer\'s own root back', () => {
    expect(fromStored('~/code/golf', '/Users/laptop')).toBe('/Users/laptop/code/golf')
    expect(fromStored('~', '/Users/laptop')).toBe('/Users/laptop')
    expect(fromStored('/tmp/x', '/Users/laptop')).toBe('/tmp/x')
    expect(fromStored('~other/x', '/Users/laptop')).toBe('~other/x')
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('two computers, one database', () => {
  const wsId = newId('workspace'), appId = newId('app'), repoId = newId('repo'), sessionId = newId('session')
  const names = [`desk-${appId.slice(-5)}`, `laptop-${appId.slice(-5)}`]
  const env = { root: process.env.MACHINE_ROOT, name: process.env.MACHINE_NAME }
  const be = (name: string, root: string) => { process.env.MACHINE_NAME = name; process.env.MACHINE_ROOT = root }
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'machine test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterEach(() => { for (const [k, v] of [['MACHINE_ROOT', env.root], ['MACHINE_NAME', env.name]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  afterAll(async () => { for (const n of names) await db.delete(machine).where(eq(machine.name, n)); await pool.end() })

  it('reads on one what the other wrote, each under its own root, and finds a row by its path', async () => {
    be(names[0], '/Users/desk')
    await db.insert(repo).values({ id: repoId, appId, fullName: 'made-up/golf', localPath: '/Users/desk/code/golf' })
    await db.insert(session).values({ id: sessionId, appId, kind: 'talk', cwd: '/Users/desk/code/golf-worktrees/talk-a', worktreePath: '/Users/desk/code/golf-worktrees/talk-a', createdBy: 'user' })
    const raw = await db.execute(sql`select local_path from repo where id = ${repoId}`)
    expect(raw.rows[0].local_path).toBe('~/code/golf')

    be(names[1], '/Users/laptop')
    const [r] = await db.select().from(repo).where(eq(repo.id, repoId))
    expect(r.localPath).toBe('/Users/laptop/code/golf')
    const [s] = await db.select().from(session).where(and(eq(session.appId, appId), eq(session.cwd, '/Users/laptop/code/golf-worktrees/talk-a'))) // the tests' database keeps earlier runs' rows
    expect(s).toMatchObject({ id: sessionId, worktreePath: '/Users/laptop/code/golf-worktrees/talk-a' })
  })

  it('registers each computer once, and a changed root replaces the old one', async () => {
    be(names[0], '/Users/desk'); await registerMachine()
    be(names[1], '/Users/laptop'); await registerMachine()
    be(names[1], '/Users/sandy'); const again = await registerMachine()
    expect(again).toMatchObject({ name: names[1], root: '/Users/sandy' })
    expect((await machines()).filter((m) => names.includes(m.name)).map((m) => [m.name, m.root])).toEqual([[names[0], '/Users/desk'], [names[1], '/Users/sandy']])
  })
})
