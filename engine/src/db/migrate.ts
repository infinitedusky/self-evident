import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { DATABASE_URL, db, pool } from './client.js'
import { ensureDatabase } from './ensure.js'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
await ensureDatabase(DATABASE_URL)
await migrate(db, { migrationsFolder })
await pool.end()
console.log('migrated')
