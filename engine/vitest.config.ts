import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests never touch the database the server uses, and no two test files share one. Each run makes a database of
// its own and migrates it (src/test-setup.ts); each test file then works on its own copy of that (src/test-db.ts).
// So a file never sees another file's rows, an earlier run's, or another checkout's run going at the same time,
// on whatever migrations that checkout has. The runner dispatches every running project in the database: with one
// database between them, one file's runner built another file's projects.
// DATABASE_URL_TEST names the server and the start of the names; the default is this checkout's own Postgres.
const BASE = process.env.DATABASE_URL_TEST ?? 'postgres://ideafactory:ideafactory@localhost:5433/selfevident_test'
/** This run: when it started (seconds, base 36: the global setup drops what an old run left behind) and its process. */
const RUN = `r${Math.floor(Date.now() / 1000).toString(36)}p${process.pid.toString(36)}`
const template = new URL(BASE)
template.pathname = `${template.pathname}_${RUN}`

export default defineConfig({
  test: {
    env: {
      TEST_DATABASE_BASE: BASE,
      TEST_DATABASE_TEMPLATE: template.toString(),
      DATABASE_URL: template.toString(), // until src/test-db.ts gives the file its own; with Postgres down it stays, and the database-backed tests skip
      TEST_HOME: join(tmpdir(), `self-evident-test-${RUN}`), // never the person's own shared skills, their list of stopped services, or their recordings, prototypes' and tickets' folders: src/test-db.ts points each at a folder of the file's own, in here
    },
    globalSetup: ['./src/test-setup.ts'],
    setupFiles: ['./src/test-db.ts'],
    // Several checkouts run their tests at once on this computer, and these tests start git and node many times
    // over: a wait that is generous costs a passing run nothing.
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
})
