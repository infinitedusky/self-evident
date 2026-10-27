import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

// `selfevident` since the plan took Linear's shape (2026-10-27); the database before it, `ideafactory`, is kept as it was.
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ideafactory:ideafactory@localhost:5433/selfevident'
export const LEGACY_DATABASE_URL = process.env.LEGACY_DATABASE_URL ?? 'postgres://ideafactory:ideafactory@localhost:5433/ideafactory'

export const pool = new pg.Pool({ connectionString: DATABASE_URL })
export const db = drizzle(pool, { schema })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
