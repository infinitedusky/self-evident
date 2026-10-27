import pg from 'pg'

/** Create the database a URL names if the server does not have it yet (a fresh checkout, a new test run). */
export async function ensureDatabase(connectionString: string) {
  const url = new URL(connectionString)
  const name = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() })
  await admin.connect()
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [name])
    if (!exists.rowCount) await admin.query(`create database "${name.replace(/"/g, '')}"`)
  } finally { await admin.end() }
}
