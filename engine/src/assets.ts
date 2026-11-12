/**
 * Assets (Sandy, 2026-11-12: "a place to put like project or app level assets"). What an app or a project is worked
 * from and that no one task owns: the design file, the requirements document, the build order, an architecture
 * diagram. Each is a name, where it is (a link, or a path on this computer) and a line on what it is.
 *
 * An app has assets; a project has its own on top. Every conversation in the app is told the app's, and one about a
 * project or a task in a project is told that project's too, so "the designs are here" is said once, not in every
 * conversation. Self Evident keeps where a thing is, never a copy of it.
 */
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, asset, project } from './db/schema.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'

export type Asset = typeof asset.$inferSelect
export interface AssetInput { name?: string; location?: string; note?: string | null }

const clean = (i: AssetInput, whole: boolean) => {
  const name = i.name?.trim().replace(/\s+/g, ' ').slice(0, 200)
  const location = i.location?.trim().slice(0, 2000)
  if (whole && !name) throw new PlanError('an asset needs a name')
  if (whole && !location) throw new PlanError('an asset needs a link or a path: where it is')
  if (i.name !== undefined && !name) throw new PlanError('an asset needs a name')
  if (i.location !== undefined && !location) throw new PlanError('an asset needs a link or a path: where it is')
  return { ...(name ? { name } : {}), ...(location ? { location } : {}), ...(i.note !== undefined ? { note: i.note?.trim().slice(0, 500) || null } : {}) }
}

/** The app's assets, or with `projectId` that project's own; oldest first within each. */
export async function listAssets(appId: string, projectId?: string | null): Promise<Asset[]> {
  return db.select().from(asset).where(and(eq(asset.appId, appId), projectId ? eq(asset.projectId, projectId) : isNull(asset.projectId))).orderBy(asc(asset.sortOrder), asc(asset.createdAt))
}

/** What a conversation is told: the app's, then the project's when it is about one. */
export async function assetsFor(appId: string | null | undefined, projectId?: string | null): Promise<Asset[]> {
  if (!appId) return []
  const rows = await db.select().from(asset).where(and(eq(asset.appId, appId), projectId ? or(isNull(asset.projectId), eq(asset.projectId, projectId)) : isNull(asset.projectId))).orderBy(asc(asset.sortOrder), asc(asset.createdAt))
  return [...rows.filter((r) => !r.projectId), ...rows.filter((r) => r.projectId)]
}

export async function addAsset(input: AssetInput & { appId: string; projectId?: string | null }, actor = 'user'): Promise<Asset> {
  const [a] = await db.select().from(app).where(eq(app.id, input.appId))
  if (!a) throw new PlanError(`no app ${input.appId}`)
  if (input.projectId) {
    const [p] = await db.select().from(project).where(eq(project.id, input.projectId))
    if (!p || p.appId !== a.id) throw new PlanError(`no project ${input.projectId} in ${a.name}`)
  }
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${asset.sortOrder}), 0) + 1` }).from(asset).where(eq(asset.appId, a.id))
  const [row] = await db.insert(asset).values({ id: newId('asset'), appId: a.id, projectId: input.projectId ?? null, ...(clean(input, true) as { name: string; location: string }), sortOrder: Number(next), createdBy: actor }).returning()
  return row
}

export async function updateAsset(id: string, input: AssetInput): Promise<Asset> {
  const [row] = await db.update(asset).set({ ...clean(input, false), updatedAt: new Date() }).where(eq(asset.id, id)).returning()
  if (!row) throw new PlanError(`no asset ${id}`)
  return row
}

export async function removeAsset(id: string): Promise<{ removed: string }> {
  const [row] = await db.delete(asset).where(eq(asset.id, id)).returning()
  if (!row) throw new PlanError(`no asset ${id}`)
  return { removed: row.id }
}

/** What the agent is told about them; nothing when there are none. */
export function assetPrompt(assets: Asset[]): string {
  if (!assets.length) return ''
  const line = (a: Asset) => `- ${a.name}: ${a.location}${a.note ? ` (${a.note})` : ''}`
  const own = assets.filter((a) => !a.projectId), proj = assets.filter((a) => a.projectId)
  return ['', '', 'Assets: what this work is done from, kept by the person so it need not be said again. Read the one a question or a task turns on before answering; a link you cannot open (it needs a sign-in you do not have), say so and ask for what it says.',
    ...(own.length ? ['The app\'s:', ...own.map(line)] : []), ...(proj.length ? ['This project\'s:', ...proj.map(line)] : [])].join('\n')
}
