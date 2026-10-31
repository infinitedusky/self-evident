/**
 * The event log: append-only, written in the same transaction as the state change, and the live feed.
 * Postgres NOTIFY carries only the sequence number (delivered on commit); readers fetch the rows by seq, which
 * keeps ordering exact and the 8 kB NOTIFY limit irrelevant.
 */
import { EventEmitter } from 'node:events'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import pg from 'pg'
import { DATABASE_URL, db, type Tx } from './db/client.js'
import { event } from './db/schema.js'

export const CHANNEL = 'if_events'

export interface NewEvent {
  workspaceId: string
  appId: string
  ideaId?: string | null
  projectId?: string | null
  issueId?: string | null
  runId?: string | null
  sessionId?: string | null
  actor: string
  type: string
  payload?: Record<string, unknown>
}

export async function appendEvent(tx: Tx, e: NewEvent): Promise<number> {
  const [row] = await tx.insert(event).values({ ...e, payload: e.payload ?? {} }).returning({ seq: event.seq })
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${String(row.seq)})`)
  return row.seq
}

export interface EventFilter { workspaceId?: string; appId?: string; projectId?: string; issueId?: string }

/** How many events one read returns; a reader wanting more reads again from the last. */
export const PAGE = 500

export async function eventsSince(since: number, filter: EventFilter = {}, limit = PAGE) {
  const where = [gt(event.seq, since)]
  if (filter.workspaceId) where.push(eq(event.workspaceId, filter.workspaceId))
  if (filter.appId) where.push(eq(event.appId, filter.appId))
  if (filter.projectId) where.push(eq(event.projectId, filter.projectId))
  if (filter.issueId) where.push(eq(event.issueId, filter.issueId))
  return db.select().from(event).where(and(...where)).orderBy(asc(event.seq)).limit(limit)
}

/** The newest sequence number: where a reader that wants only what comes next starts. */
export async function latestSeq() {
  const [row] = await db.select({ seq: sql<number>`coalesce(max(${event.seq}), 0)::bigint` }).from(event)
  return Number(row?.seq ?? 0)
}

/** One LISTEN connection per process; emits 'event' with the new seq. */
export class EventBus extends EventEmitter {
  private client: pg.Client | null = null

  async start() {
    this.client = new pg.Client({ connectionString: DATABASE_URL })
    await this.client.connect()
    this.client.on('notification', (n) => this.emit('event', Number(n.payload)))
    this.client.on('error', (err) => this.emit('error', err))
    await this.client.query(`listen ${CHANNEL}`)
  }

  async stop() {
    await this.client?.end()
    this.client = null
  }
}
