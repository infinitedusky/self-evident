/**
 * Vitest global setup: this run's own database, migrated once. Each test file works on a copy of it
 * (src/test-db.ts), so nothing connects to this one after it is made: Postgres copies a database only while nobody
 * is in it. When the run ends, it and the copies go, and so does the run's folder. Skips quietly if Postgres is down.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { TestProject } from 'vitest/node'

/** A run that was killed leaves its databases behind: one older than this is nobody's any more. */
const STALE_SECONDS = 60 * 60

export default async function setup(project: TestProject) {
  const env = project.config.env as Record<string, string>
  const template = new URL(env.TEST_DATABASE_TEMPLATE), name = template.pathname.slice(1)
  const base = new URL(env.TEST_DATABASE_BASE).pathname.slice(1)
  const admin = () => new pg.Client({ connectionString: new URL('/postgres', template).toString() })
  const named = async (c: pg.Client, prefix: string) => (await c.query('select datname from pg_database where starts_with(datname, $1)', [prefix])).rows.map((r) => r.datname as string)
  const drop = async (c: pg.Client, names: string[]) => { for (const n of names) await c.query(`drop database if exists "${n.replace(/"/g, '')}" with (force)`).catch(() => {}) }

  const c = admin()
  try { await c.connect() } catch { console.warn('test-setup: Postgres not reachable; database-backed tests will be skipped'); return }
  try {
    const now = Math.floor(Date.now() / 1000)
    await drop(c, (await named(c, `${base}_r`)).filter((n) => { const at = /^_r([0-9a-z]+)p[0-9a-z]+(_[0-9a-f]+)?$/.exec(n.slice(base.length)); return at !== null && now - parseInt(at[1], 36) > STALE_SECONDS }))
    await c.query(`create database "${name.replace(/"/g, '')}"`)
  } finally { await c.end() }
  const pool = new pg.Pool({ connectionString: template.toString() })
  try { await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) }) } finally { await pool.end() }

  return async () => {
    const end = admin()
    try { await end.connect(); await drop(end, await named(end, name)) } catch { /* Postgres went away: a later run drops what is old */ } finally { await end.end().catch(() => {}) }
    await rm(env.TEST_HOME, { recursive: true, force: true }).catch(() => {})
  }
}
