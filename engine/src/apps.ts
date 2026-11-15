/**
 * Removing an app (Sandy, 2026-11-15: "we need to be able to remove apps"). Two steps:
 * - Put away: it leaves every list and nothing of it runs; its rows stay, so it can be brought back. Its abbreviation
 *   is free for another app meanwhile.
 * - Deleted for good: only a put-away app, and only with its name typed. Every row of it goes, in one transaction.
 * Neither touches the code on disk, its worktrees or anything on GitHub.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, idea, issue, project, prototype, repo, session } from './db/schema.js'
import { PlanError } from './projects.js'

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The apps in use: not put away. Everything that lists or walks apps reads this. */
export const activeApps = (d: Db = db) => d.select().from(app).where(isNull(app.removedAt))
export const putAwayApps = () => db.select().from(app).where(sql`${app.removedAt} is not null`).orderBy(sql`${app.removedAt} desc`)
/** The ids of the apps put away: what lists of other things (projects, conversations) leave out. */
export async function putAwayIds() { return new Set((await db.select({ id: app.id }).from(app).where(sql`${app.removedAt} is not null`)).map((a) => a.id)) }

const LIVE_BUILDS = ['running', 'merging', 'testing', 'awaiting_answer'] as const

export interface PutAwayDeps {
  /** The app's conversations with an agent replying now. */
  busy: (sessionIds: string[]) => string[]
  /** Lets go of the agents of its conversations (the conversations themselves are kept). */
  release: (sessionIds: string[]) => Promise<unknown>
  pauseProject: (projectId: string) => Promise<unknown>
  stopPrototype: (prototypeId: string) => Promise<unknown>
  stopStorybookAt: (cwd: string) => Promise<unknown>
}

/** What an app holds, for the person about to delete it, and what deleting leaves where it is. */
export async function appHolds(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const count = async (q: Promise<unknown[]>) => (await q).length
  const repos = await db.select().from(repo).where(eq(repo.appId, appId))
  return {
    id: a.id, name: a.name, key: a.key, removedAt: a.removedAt,
    tasks: await count(db.select({ id: issue.id }).from(issue).where(and(eq(issue.appId, appId), isNull(issue.parentId)))),
    projects: await count(db.select({ id: project.id }).from(project).where(and(eq(project.appId, appId), eq(project.solo, false)))),
    ideas: await count(db.select({ id: idea.id }).from(idea).where(eq(idea.appId, appId))),
    conversations: await count(db.select({ id: session.id }).from(session).where(eq(session.appId, appId))),
    kept: repos.flatMap((r) => [r.fullName ? `${r.fullName} on GitHub` : null, r.localPath, r.localPath ? `${r.localPath}-worktrees` : null]).filter((x): x is string => !!x),
  }
}

/** Puts an app away. Refused while it is building or an agent of it is replying: those are stopped by the person, not by this. */
export async function putAway(appId: string, deps: PutAwayDeps) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  if (a.removedAt) return a
  const building = await db.select({ id: build.issueId }).from(build).where(and(eq(build.appId, appId), inArray(build.status, [...LIVE_BUILDS])))
  if (building.length) throw new PlanError(`${a.name} is building (${building.length} running): pause its project first`)
  const sessions = await db.select().from(session).where(eq(session.appId, appId))
  const busy = deps.busy(sessions.map((s) => s.id))
  if (busy.length) throw new PlanError(`an agent of ${a.name} is replying: wait for it, or stop it, first`)
  for (const p of await db.select().from(project).where(and(eq(project.appId, appId), eq(project.status, 'running')))) await deps.pauseProject(p.id)
  for (const p of await db.select().from(prototype).where(and(eq(prototype.appId, appId), eq(prototype.status, 'running')))) await deps.stopPrototype(p.id).catch(() => {})
  await deps.release(sessions.map((s) => s.id))
  const repos = await db.select().from(repo).where(eq(repo.appId, appId))
  for (const cwd of [...repos.map((r) => r.localPath), ...sessions.map((s) => s.worktreePath)]) if (cwd) await deps.stopStorybookAt(cwd).catch(() => {})
  const [row] = await db.update(app).set({ removedAt: new Date() }).where(eq(app.id, appId)).returning()
  console.log(`[apps] ${a.name} (${a.key}) put away`)
  return row
}

/** Brings a put-away app back, its projects left paused. Refused when another app took its abbreviation meanwhile. */
export async function bringBack(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  if (!a.removedAt) return a
  const [other] = await db.select().from(app).where(and(eq(app.workspaceId, a.workspaceId), eq(app.key, a.key), isNull(app.removedAt)))
  if (other) throw new PlanError(`the abbreviation ${a.key} is ${other.name}'s now: change ${other.name}'s abbreviation, then bring ${a.name} back`)
  const [row] = await db.update(app).set({ removedAt: null }).where(eq(app.id, appId)).returning()
  console.log(`[apps] ${a.name} (${a.key}) brought back`)
  return row
}

interface Fk { child: string; col: string; nullable: boolean; parent: string; pcol: string }
const q = (name: string) => sql.identifier(name)

/**
 * Deletes a put-away app and every row of it. The tables are read from the database, not listed here, so a table
 * added later is covered: every table with an `app_id` is the app's; they are emptied of it children first. What
 * points at its rows from outside (another app's row, or a table with no `app_id`) is cleared when it may be empty,
 * and deleted when it may not. Anything this cannot do in order fails the whole transaction: nothing is half-deleted.
 */
export async function deleteForGood(appId: string, typed: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  if (!a.removedAt) throw new PlanError(`${a.name} is in use: remove it first, then it can be deleted for good`)
  if ((typed ?? '').trim() !== a.name) throw new PlanError(`type the app's name, ${a.name}, to delete it for good`)
  const gone: Record<string, number> = {}
  await db.transaction(async (tx) => {
    const fks = (await tx.execute(sql`
      select c.conrelid::regclass::text as child, ca.attname as col, not ca.attnotnull as nullable, c.confrelid::regclass::text as parent, pa.attname as pcol
      from pg_constraint c
      join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1`)).rows as unknown as Fk[]
    const bare = (t: string) => t.replace(/^"|"$/g, '')
    for (const f of fks) { f.child = bare(f.child); f.parent = bare(f.parent) }
    const own = new Set(((await tx.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'app_id'`)).rows as { table_name: string }[]).map((r) => r.table_name))

    // What points at this app's rows from outside it.
    for (const f of fks.filter((x) => own.has(x.parent))) {
      const mine = sql`${q(f.col)} in (select ${q(f.pcol)} from ${q(f.parent)} where app_id = ${appId})`
      const where = own.has(f.child) ? sql`${mine} and app_id is distinct from ${appId}` : mine
      if (f.nullable) await tx.execute(sql`update ${q(f.child)} set ${q(f.col)} = null where ${where}`)
      else await tx.execute(sql`delete from ${q(f.child)} where ${where}`)
    }

    // Its own rows, children before what they point at. A ring of tables is opened by emptying a link that may be empty.
    let edges = fks.filter((f) => own.has(f.child) && own.has(f.parent) && f.child !== f.parent)
    const left = new Set(own)
    while (left.size) {
      const free = [...left].filter((t) => !edges.some((e) => e.parent === t && left.has(e.child)))
      if (!free.length) {
        const open = edges.find((e) => e.nullable && left.has(e.child) && left.has(e.parent))
        if (!open) throw new PlanError(`cannot delete ${a.name}: its tables refer to each other in a ring (${[...left].join(', ')})`)
        await tx.execute(sql`update ${q(open.child)} set ${q(open.col)} = null where app_id = ${appId}`)
        edges = edges.filter((e) => e !== open)
        continue
      }
      for (const t of free) {
        const r = await tx.execute(sql`delete from ${q(t)} where app_id = ${appId}`)
        if (r.rowCount) gone[t] = r.rowCount
        left.delete(t)
      }
    }
    await tx.delete(app).where(eq(app.id, appId))
  })
  console.log(`[apps] ${a.name} (${a.key}) deleted for good: ${Object.entries(gone).map(([t, n]) => `${n} ${t}`).join(', ') || 'it held nothing'}`)
  return { deleted: a.name, rows: gone }
}
