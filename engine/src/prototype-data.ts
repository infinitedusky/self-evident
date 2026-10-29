/**
 * A prototype's data: the app's real database engine, with made-up data. Each prototype gets a throwaway Postgres
 * database of its own on the app's development server (`proto_<slug>`), built by the app's own schema command and
 * filled from a scenario: JSON files in the prototype's worktree, `.prototype/scenarios/<name>/<table>.json`, each an
 * array of rows. Reset builds it again from a scenario; save writes the current rows back out as one. The scenarios
 * are committed with the prototype, so they are part of what the analysis reads.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { PlanError } from './projects.js'

/** How an app's prototypes get a database: its development server (any database on it), the variable the app reads, and how its schema is made. */
export interface PrototypeDb { url: string; env?: string; schema_cmd?: string }

// Migration bookkeeping the schema command writes itself: never saved into a scenario.
const BOOKKEEPING = new Set(['schema_version', 'schema_migrations', 'alembic_version', '__drizzle_migrations', '_prisma_migrations', 'knex_migrations', 'knex_migrations_lock', 'flyway_schema_history'])

export const scenariosDir = (worktree: string) => join(worktree, '.prototype', 'scenarios')

/** The prototype's own database: the app's development URL with the database name swapped. */
export function databaseUrl(cfg: PrototypeDb, slug: string) {
  const u = new URL(cfg.url)
  u.pathname = `/${databaseName(slug)}`
  return u.toString()
}
export const databaseName = (slug: string) => `proto_${slug.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`.slice(0, 63)

async function admin<T>(cfg: PrototypeDb, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const u = new URL(cfg.url)
  u.pathname = '/postgres'
  const c = new pg.Client({ connectionString: u.toString() })
  await c.connect().catch((err) => { throw new PlanError(`can't reach the app's database server at ${u.host}: ${err.message}`) })
  try { return await fn(c) } finally { await c.end() }
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`

export async function dropDatabase(cfg: PrototypeDb, slug: string) {
  const name = databaseName(slug)
  await admin(cfg, async (c) => {
    await c.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [name])
    await c.query(`drop database if exists ${ident(name)}`)
  })
}

async function createDatabase(cfg: PrototypeDb, slug: string) {
  await dropDatabase(cfg, slug)
  await admin(cfg, (c) => c.query(`create database ${ident(databaseName(slug))}`))
}

export async function databaseExists(cfg: PrototypeDb, slug: string) {
  return admin(cfg, async (c) => (await c.query('select 1 from pg_database where datname = $1', [databaseName(slug)])).rowCount === 1)
}

function runSchema(cmd: string, cwd: string, env: Record<string, string>) {
  return new Promise<void>((resolveP, reject) => {
    const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: string[] = []
    const keep = (b: Buffer) => { out.push(b.toString()); if (out.length > 200) out.shift() }
    proc.stdout.on('data', keep); proc.stderr.on('data', keep)
    proc.on('error', reject)
    proc.on('exit', (code) => code === 0 ? resolveP() : reject(new PlanError(`the schema command failed (exit ${code}): ${out.join('').trim().split('\n').slice(-12).join('\n')}`)))
  })
}

export async function listScenarios(worktree: string) {
  const dir = scenariosDir(worktree)
  if (!existsSync(dir)) return []
  return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
}

async function tablesOf(c: pg.Client) {
  const r = await c.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name")
  return r.rows.map((x) => x.table_name)
}

/** Each table's file into the database; foreign keys are not checked while loading, and serial columns move past the rows. */
async function load(c: pg.Client, dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
  const tables = new Set(await tablesOf(c))
  const loaded: Record<string, number> = {}
  await c.query('begin')
  try {
    await c.query("set local session_replication_role = 'replica'").catch(() => {}) // needs a superuser, as development servers are; else files load in name order
    for (const f of files) {
      const table = f.slice(0, -'.json'.length)
      if (!tables.has(table)) throw new PlanError(`the scenario has ${f}, but the database has no table ${table}`)
      const rows = JSON.parse(await readFile(join(dir, f), 'utf8'))
      if (!Array.isArray(rows)) throw new PlanError(`${f} is not an array of rows`)
      if (!rows.length) continue
      await c.query(`insert into ${ident(table)} select * from jsonb_populate_recordset(null::${ident(table)}, $1::jsonb) on conflict do nothing`, [JSON.stringify(rows)])
      loaded[table] = rows.length
    }
    await c.query('commit')
  } catch (err) { await c.query('rollback'); throw err }
  // Serial and identity columns: the next new row must not collide with a loaded one.
  const seqs = await c.query<{ t: string; col: string; seq: string }>(`select c.table_name as t, c.column_name as col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) as seq
    from information_schema.columns c where c.table_schema = 'public' and pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) is not null`)
  for (const s of seqs.rows) if (loaded[s.t]) await c.query(`select setval($1, coalesce((select max(${ident(s.col)}) from ${ident(s.t)}), 1))`, [s.seq])
  return loaded
}

/**
 * The prototype's database, made again: dropped, created, its schema made by the app's command (run in the
 * worktree, so the prototype's own schema changes count), then the scenario's rows. No scenario: empty tables.
 */
export async function rebuild(cfg: PrototypeDb, slug: string, worktree: string, scenario?: string | null) {
  const url = databaseUrl(cfg, slug)
  const dir = scenario ? join(scenariosDir(worktree), scenario) : null
  if (dir && !existsSync(dir)) throw new PlanError(`no scenario "${scenario}" in this prototype (${(await listScenarios(worktree)).join(', ') || 'none yet'})`)
  await createDatabase(cfg, slug)
  if (cfg.schema_cmd) await runSchema(cfg.schema_cmd, worktree, { [cfg.env ?? 'DATABASE_URL']: url })
  if (!dir) return { url, loaded: {} }
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try { return { url, loaded: await load(c, dir) } } finally { await c.end() }
}

/** The database as it is now, as a scenario: one JSON file per table that has rows (bookkeeping left out). */
export async function save(cfg: PrototypeDb, slug: string, worktree: string, name: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new PlanError('a scenario name is letters, numbers and dashes, like "teacher-three-overdue"')
  const dir = join(scenariosDir(worktree), name)
  await mkdir(dir, { recursive: true })
  for (const f of await readdir(dir)) if (f.endsWith('.json')) await rm(join(dir, f)) // a table emptied since is gone from it too
  const c = new pg.Client({ connectionString: databaseUrl(cfg, slug) })
  await c.connect()
  const saved: Record<string, number> = {}
  try {
    for (const t of await tablesOf(c)) {
      if (BOOKKEEPING.has(t)) continue
      const rows = (await c.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${ident(t)} x`)).rows[0].rows as unknown[]
      if (!rows.length) continue
      await writeFile(join(dir, `${t}.json`), JSON.stringify(rows, null, 2) + '\n')
      saved[t] = rows.length
    }
  } finally { await c.end() }
  return { scenario: name, dir, saved }
}
