/**
 * A prototype's data: its own database on the app's server, made by the app's schema command, filled from a scenario
 * (a child table's file loads before its parent's), saved back out, built again, given to its server, dropped on discard.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL } from '../vitest.config.js'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { databaseExists, databaseUrl } from './prototype-data.js'
import { discardPrototype, prototypeStatus, resetPrototypeData, savePrototypeData, setPrototypeCommand, setPrototypeDatabase, startPrototype, stopPrototypes } from './prototype.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const nodeModules = fileURLToPath(new URL('../node_modules', import.meta.url))
// The app's schema, made the way an app's migrations would: bookkeeping included.
const SCHEMA = `NODE_PATH=${nodeModules} node -e "const pg=require('pg');const c=new pg.Client({connectionString:process.env.SHOP_DB});c.connect().then(()=>c.query('create table product (id serial primary key, name text not null); create table line_item (id serial primary key, product_id int not null references product(id), qty int not null); create table schema_version (version int primary key); insert into schema_version values (1)')).then(()=>c.end())"`
// Its server says which database it was given.
const SERVER = `node -e "require('http').createServer((q, s) => s.end(process.env.SHOP_DB)).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 50; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe.skipIf(!reachable)('prototype data', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  let repoPath: string
  const cfg = { url: TEST_DATABASE_URL, env: 'SHOP_DB', schema_cmd: SCHEMA }
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-proto-data-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    const scenario = join(repoPath, '.prototype', 'scenarios', 'default')
    await mkdir(scenario, { recursive: true })
    await writeFile(join(scenario, 'line_item.json'), JSON.stringify([{ id: 1, product_id: 2, qty: 3 }]))
    await writeFile(join(scenario, 'product.json'), JSON.stringify([{ id: 1, name: 'Sample mug' }, { id: 2, name: 'Sample tote' }]))
    await commitAll(repoPath, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'proto data test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
    await setPrototypeCommand(appId, SERVER)
    await setPrototypeDatabase(appId, cfg)
  })
  afterAll(async () => { stopPrototypes(); await pool.end() })

  it('builds its own database from the default scenario, gives it to its server, saves, resets and drops it', async () => {
    const p = await startPrototype({ appId, title: 'Data' })
    const slug = p.branch.slice('prototype/'.length)
    const url = databaseUrl(cfg, slug)
    expect(p.database).toMatch(/^proto_data_/)
    expect(p.scenarios).toEqual(['default'])
    expect((await prototypeStatus(p.id)).scenario).toBe('default')
    expect(await until(async () => (await prototypeStatus(p.id)).up)).toBe(true)
    expect(await (await fetch(p.url!)).text()).toBe(url)

    const c = new pg.Client({ connectionString: url })
    await c.connect()
    const count = async () => Number((await c.query('select count(*) from product')).rows[0].count)
    expect(await count()).toBe(2)
    expect((await c.query('select qty from line_item')).rows).toEqual([{ qty: 3 }])
    await c.query("insert into product (name) values ('Sample pen')") // the sequence moved past the loaded rows
    expect(await count()).toBe(3)

    const saved = await savePrototypeData(p.id, 'three-products')
    expect(saved.saved).toEqual({ product: 3, line_item: 1 })
    expect(JSON.parse(await readFile(join(saved.dir, 'product.json'), 'utf8')).map((r: { name: string }) => r.name)).toContain('Sample pen')
    await c.end()

    const back = await resetPrototypeData(p.id, 'default')
    expect(back.loaded).toEqual({ line_item: 1, product: 2 })
    expect(back.status.status).toBe('running') // its server came back, on the new database
    const again = await resetPrototypeData(p.id, 'three-products')
    expect(again.loaded.product).toBe(3)
    const empty = await resetPrototypeData(p.id, null)
    expect(empty.loaded).toEqual({})
    await expect(resetPrototypeData(p.id, 'nope')).rejects.toThrow(/no scenario "nope"/)

    await discardPrototype(p.id)
    expect(await databaseExists(cfg, slug)).toBe(false)
  })
})
