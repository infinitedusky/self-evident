/**
 * A prototype's data: the app's real database engine, with made-up data. Each prototype gets a throwaway Postgres
 * database of its own on the app's development server (`proto_<slug>`), built by the app's own schema command and
 * filled from a scenario: tables of made-up rows, by name.
 *
 * Scenarios are Evident's own, kept in its database and never in the app's repository (Sandy, 2026-11-17:
 * "we don't want that to be part of the repo … The prototype then is essentially getting thrown away, and then
 * we're building the actual thing that's going to be in the PR"). A scenario belongs to one prototype, or to the
 * whole app (shared: every prototype and the smoke test can load it). Before this they were JSON files committed
 * with the prototype, `.prototype/scenarios/<name>/<table>.json`: one still there is read, none is written.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import pg from 'pg'
import { db } from './db/client.js'
import { scenario as scenarioTable } from './db/schema.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'

/** How an app's prototypes get a database: its development server (any database on it), the variable the app reads, and how its schema is made. */
export interface PrototypeDb { url: string; env?: string; schema_cmd?: string; /** Fills a database the schema command made with the app's own made-up data: what a fixture is made from. */ seed_cmd?: string }

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

function runSchema(cmd: string, cwd: string, env: Record<string, string>, what = 'schema') {
  return new Promise<void>((resolveP, reject) => {
    const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: string[] = []
    const keep = (b: Buffer) => { out.push(b.toString()); if (out.length > 200) out.shift() }
    proc.stdout.on('data', keep); proc.stderr.on('data', keep)
    proc.on('error', reject)
    proc.on('exit', (code) => code === 0 ? resolveP() : reject(new PlanError(`the ${what} command failed (exit ${code}): ${out.join('').trim().split('\n').slice(-12).join('\n')}`)))
  })
}

/** Whose scenarios: an app's shared ones, and one prototype's own when it is given. */
export interface Scope { appId: string; prototypeId?: string | null }
export type Tables = Record<string, unknown[]>
/** A scenario is for trying an app by hand, not a copy of its data. */
export const SCENARIO_MAX = 2_000_000
const NAME = /^[a-z0-9][a-z0-9-]*$/i

async function filed(worktree?: string | null) {
  const dir = worktree ? scenariosDir(worktree) : null
  if (!dir || !existsSync(dir)) return []
  return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
}
const scopes = (scope: Scope) => (scope.prototypeId ? [scope.prototypeId, ''] : [''])

/** The names it can load: its own, the app's shared ones, and any still filed in its worktree from before. */
export async function listScenarios(scope: Scope, worktree?: string | null) {
  const rows = await db.select({ name: scenarioTable.name }).from(scenarioTable).where(and(eq(scenarioTable.appId, scope.appId), inArray(scenarioTable.scope, scopes(scope))))
  return [...new Set([...rows.map((r) => r.name), ...await filed(worktree)])].sort()
}

/** One scenario's tables: the prototype's own first, then the app's, then one filed in the worktree. */
export async function scenarioTables(scope: Scope, name: string, worktree?: string | null): Promise<Tables | null> {
  const rows = await db.select().from(scenarioTable).where(and(eq(scenarioTable.appId, scope.appId), eq(scenarioTable.name, name), inArray(scenarioTable.scope, scopes(scope))))
  const row = rows.find((r) => r.scope !== '') ?? rows[0]
  if (row) return row.tables
  if (!(await filed(worktree)).includes(name)) return null
  const dir = join(scenariosDir(worktree!), name)
  const out: Tables = {}
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
    const rowsOf = JSON.parse(await readFile(join(dir, f), 'utf8'))
    if (!Array.isArray(rowsOf)) throw new PlanError(`${f} is not an array of rows`)
    out[f.slice(0, -'.json'.length)] = rowsOf
  }
  return out
}

/** Keep a scenario: for the prototype, or shared with the whole app. Kept again under the same name, it is replaced. */
export async function writeScenario(scope: Scope, name: string, tables: Tables, shared = false) {
  if (!NAME.test(name)) throw new PlanError('a scenario name is letters, numbers and dashes, like "teacher-three-overdue"')
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw new PlanError('a scenario is its tables by name, each an array of rows')
  for (const [t, rows] of Object.entries(tables)) if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) throw new PlanError(`${t} is not an array of rows`)
  if (JSON.stringify(tables).length > SCENARIO_MAX) throw new PlanError(`a scenario is ${SCENARIO_MAX / 1_000_000} MB at most: keep it to the rows a person needs to try the app`)
  if (!shared && !scope.prototypeId) throw new PlanError('a scenario is kept for a prototype, or shared with the app')
  const where = shared ? '' : scope.prototypeId!
  await db.insert(scenarioTable).values({ id: newId('scenario'), appId: scope.appId, scope: where, name, tables })
    .onConflictDoUpdate({ target: [scenarioTable.appId, scenarioTable.scope, scenarioTable.name], set: { tables, updatedAt: new Date() } })
  return { scenario: name, shared, saved: Object.fromEntries(Object.entries(tables).filter(([, r]) => r.length).map(([t, r]) => [t, r.length])) }
}

/** A prototype thrown away takes its own scenarios with it; the app's shared ones stay. */
export async function dropScenarios(appId: string, prototypeId: string) {
  await db.delete(scenarioTable).where(and(eq(scenarioTable.appId, appId), eq(scenarioTable.scope, prototypeId)))
}

async function tablesOf(c: pg.Client) {
  const r = await c.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name")
  return r.rows.map((x) => x.table_name)
}

/** Each table's rows into the database; foreign keys are not checked while loading, and serial columns move past the rows. */
async function load(c: pg.Client, scenario: Tables) {
  const tables = new Set(await tablesOf(c))
  const loaded: Record<string, number> = {}
  await c.query('begin')
  try {
    await c.query("set local session_replication_role = 'replica'").catch(() => {}) // needs a superuser, as development servers are; else files load in name order
    for (const table of Object.keys(scenario).sort()) {
      if (!tables.has(table)) throw new PlanError(`the scenario has rows for ${table}, but the database has no table ${table}`)
      const rows = scenario[table]
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
export async function rebuild(cfg: PrototypeDb, slug: string, worktree: string, scenario: string | null | undefined, scope: Scope) {
  const url = databaseUrl(cfg, slug)
  const tables = scenario ? await scenarioTables(scope, scenario, worktree) : null
  if (scenario && !tables) throw new PlanError(`no scenario "${scenario}" for this prototype (${(await listScenarios(scope, worktree)).join(', ') || 'none yet'})`)
  await createDatabase(cfg, slug)
  if (cfg.schema_cmd) await runSchema(cfg.schema_cmd, worktree, { [cfg.env ?? 'DATABASE_URL']: url })
  if (!tables) return { url, loaded: {} }
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try { return { url, loaded: await load(c, tables) } } finally { await c.end() }
}

/**
 * A database made from nothing by the app's own commands: its schema, then its seed, both run in `worktree`. What a
 * fixture is made from (fixtures.ts). The caller saves it and drops it.
 */
export async function buildSeeded(cfg: PrototypeDb, slug: string, worktree: string) {
  if (!cfg.seed_cmd) throw new PlanError('the app has no seed command')
  const env = { [cfg.env ?? 'DATABASE_URL']: databaseUrl(cfg, slug) }
  await createDatabase(cfg, slug)
  if (cfg.schema_cmd) await runSchema(cfg.schema_cmd, worktree, env)
  await runSchema(cfg.seed_cmd, worktree, env, 'seed')
}

/**
 * One database's rows as they are now, in another made with a different checkout's schema (Sandy, 2026-11-20: "the
 * two options are copy it as it is now or share a database"; "is it that hard to see the database that has seed data
 * that includes fields that are not there? Will it just ignore them?"). For main beside a build: `to` is made again,
 * its schema by the app's command run in `worktree` (main's), then every table of `from` is loaded into it. A field
 * the older schema does not have is ignored; a table it does not have is skipped; a table whose rows it will not
 * take (a column it requires that the build dropped) is left empty. Each is said, and the rest still loads.
 */
export async function copyData(cfg: PrototypeDb, from: string, to: string, worktree: string) {
  await createDatabase(cfg, to)
  if (cfg.schema_cmd) await runSchema(cfg.schema_cmd, worktree, { [cfg.env ?? 'DATABASE_URL']: databaseUrl(cfg, to) })
  const src = new pg.Client({ connectionString: databaseUrl(cfg, from) }), dst = new pg.Client({ connectionString: databaseUrl(cfg, to) })
  await src.connect(); await dst.connect()
  const copied: Record<string, number> = {}, skipped: string[] = [], failed: { table: string; why: string }[] = []
  try {
    const have = new Set(await tablesOf(dst))
    await dst.query('begin')
    await dst.query("set local session_replication_role = 'replica'").catch(() => {})
    for (const t of await tablesOf(src)) {
      if (BOOKKEEPING.has(t)) continue
      const rows = (await src.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${ident(t)} x`)).rows[0].rows as unknown[]
      if (!rows.length) continue
      if (!have.has(t)) { skipped.push(t); continue }
      await dst.query('savepoint one_table')
      try {
        await dst.query(`insert into ${ident(t)} select * from jsonb_populate_recordset(null::${ident(t)}, $1::jsonb) on conflict do nothing`, [JSON.stringify(rows)])
        copied[t] = rows.length
      } catch (err) { await dst.query('rollback to savepoint one_table'); failed.push({ table: t, why: (err as Error).message.slice(0, 200) }) }
    }
    await dst.query('commit')
    const seqs = await dst.query<{ t: string; col: string; seq: string }>(`select c.table_name as t, c.column_name as col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) as seq
      from information_schema.columns c where c.table_schema = 'public' and pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) is not null`)
    for (const s of seqs.rows) if (copied[s.t]) await dst.query(`select setval($1, coalesce((select max(${ident(s.col)}) from ${ident(s.t)}), 1))`, [s.seq])
  } finally { await src.end().catch(() => {}); await dst.end().catch(() => {}) }
  return { copied, skipped, failed }
}

/** The database as it is now, kept as a scenario: each table that has rows (bookkeeping left out). Nothing is written into the worktree. */
export async function save(cfg: PrototypeDb, slug: string, scope: Scope, name: string, shared = false) {
  if (!NAME.test(name)) throw new PlanError('a scenario name is letters, numbers and dashes, like "teacher-three-overdue"')
  const c = new pg.Client({ connectionString: databaseUrl(cfg, slug) })
  await c.connect()
  const tables: Tables = {}
  try {
    for (const t of await tablesOf(c)) {
      if (BOOKKEEPING.has(t)) continue
      const rows = (await c.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${ident(t)} x`)).rows[0].rows as unknown[]
      if (rows.length) tables[t] = rows
    }
  } finally { await c.end() }
  return writeScenario(scope, name, tables, shared)
}
