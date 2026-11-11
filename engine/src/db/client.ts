import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

// `selfevident` since the plan took Linear's shape (2026-10-27); the database before it, `ideafactory`, is kept as it was.
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ideafactory:ideafactory@localhost:5433/selfevident'
export const LEGACY_DATABASE_URL = process.env.LEGACY_DATABASE_URL ?? 'postgres://ideafactory:ideafactory@localhost:5433/ideafactory'

/** The database this checkout starts for itself (docker-compose.yml). Anything else is someone else's to run: Fly's, reached through `fly proxy`. */
export const isLocalDatabase = (connectionString = DATABASE_URL) => { try { const u = new URL(connectionString); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && u.port === '5433' } catch { return false } }

export const pool = new pg.Pool({ connectionString: DATABASE_URL, keepAlive: true })
pool.on('error', (err) => console.warn(`[engine] an idle database connection dropped: ${err.message}`)) // without a listener this ends the process; the pool makes a new one on the next query
export const db = drizzle(pool, { schema })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
