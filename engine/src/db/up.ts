/**
 * `pnpm dev` and `pnpm start` run this first. With the default database it starts the Postgres container this
 * checkout owns and waits for it; with DATABASE_URL pointing anywhere else (Fly, through `fly proxy`) there is
 * nothing here to start, and the engine waits for that database itself (server.ts).
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isLocalDatabase, pool } from './client.js'

await pool.end()
if (isLocalDatabase()) execFileSync('docker', ['compose', 'up', '-d', '--wait'], { cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'inherit' })
else console.log('db:up: DATABASE_URL names a database that is not this checkout\'s container; nothing to start')
