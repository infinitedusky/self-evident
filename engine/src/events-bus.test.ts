/**
 * The engine's one LISTEN connection, when the database is reached over a link that can drop (Fly, through a proxy):
 * it comes back by itself and tells the open streams to catch up.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { db, isLocalDatabase, pool } from './db/client.js'
import { EventBus } from './events.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('the event connection', () => {
  afterAll(async () => { await pool.end() })

  it('is made again after the database drops it, and says so with an event', async () => {
    const bus = new EventBus()
    await bus.start()
    const hear = (want: number) => new Promise<number>((resolve) => { const on = (n: number) => { if (n === want) { bus.off('event', on); resolve(n) } }; bus.on('event', on) }) // other tests' events pass by on the same channel
    const back = hear(0)
    await db.execute("select pg_terminate_backend(pid) from pg_stat_activity where query ilike 'listen %' and pid <> pg_backend_pid() and datname = current_database()")
    expect(await back).toBe(0) // the nudge to catch up
    const heard = hear(-42)
    await db.execute("select pg_notify('if_events', '-42')")
    expect(await heard).toBe(-42) // listening again
    await bus.stop()
  }, 15_000)

  it('knows its own container from a database elsewhere', () => {
    expect(isLocalDatabase('postgres://ideafactory:ideafactory@localhost:5433/selfevident')).toBe(true)
    expect(isLocalDatabase('postgres://selfevident:x@localhost:15432/selfevident')).toBe(false)
    expect(isLocalDatabase('postgres://selfevident:x@homework-gate-db.flycast:5432/selfevident')).toBe(false)
  })
})
