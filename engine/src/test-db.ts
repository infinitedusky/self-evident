/**
 * Runs before each test file: a file that uses the database gets one of its own, a copy of the one the run migrated
 * (src/test-setup.ts), and every file gets folders of its own in place of the person's. It is set before the file
 * imports the database client, which reads DATABASE_URL once. The copies are dropped when the run ends, all at
 * once: dropping one makes Postgres write everything out, and a drop after each file slowed every test going.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { expect } from 'vitest'

const template = new URL(process.env.TEST_DATABASE_TEMPLATE!)
const name = `${template.pathname.slice(1)}_${randomBytes(4).toString('hex')}`

const home = join(process.env.TEST_HOME!, name)
mkdirSync(home, { recursive: true })
Object.assign(process.env, {
  SHARED_SKILLS_HOME: join(home, 'shared-skills'), NGROK_PAUSED_FILE: join(home, 'ngrok-paused.json'), RECORDINGS_HOME: join(home, 'recordings'),
  STAND_INS_HOME: join(home, 'prototypes'), REPO_SKILLS_HOME: join(home, 'repo-skills'), ORIGINS_HOME: join(home, 'origins'),
})

/** Whether the file is one that reads or writes the database: it imports the client, or names the address. One that cannot be read is taken to. */
const usesDatabase = (() => { const path = expect.getState().testPath; try { return !path || /db\/client|DATABASE_URL/.test(readFileSync(path, 'utf8')) } catch { return true } })()
// A file that does not is pointed at a database that is not there: were it to ask after all, it fails and says so,
// where connecting to the run's own would stop every other file's copy being made.
process.env.DATABASE_URL = new URL(`/${name}`, template).toString()
if (usesDatabase) {
  const c = new pg.Client({ connectionString: new URL('/postgres', template).toString() })
  let up = true
  try { await c.connect() } catch { up = false } // Postgres is down: the global setup has said so, and the database-backed tests skip
  if (up) try { await c.query(`create database "${name}" template "${template.pathname.slice(1).replace(/"/g, '')}"`) } finally { await c.end() }
}
