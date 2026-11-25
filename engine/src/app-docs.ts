/**
 * An app's own docs (Sandy, 2026-11-24: "documentation that represents my personal understanding of the project so
 * that I can probe and build up … we should host this inside of Evident … and it is in Learn").
 *
 * Learn's four documents (learn.ts) are an agent's account of the code, a fixed set, replaced whole when the code is
 * learned again. These are the person's: any number of pages, each a title and Markdown, saying how they understand
 * the app. They are kept here in the database and read on the Learn page, not in a docs site in a folder beside the
 * app. A page is written by the person on that page, or by an agent at their word (`write_app_doc`: "write down what
 * you just told me"), and never replaced by learning the code again. Agents read them (`app_docs`), so one can be
 * asked to check a page against the code, and what the person has understood reaches the agents that work here.
 */
import { asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, appDoc } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'

export const TITLE_MAX = 120
export const PAGE_MAX = 40_000

export interface AppDoc { id: string; title: string; body: string; /** Who wrote it last: `user`, or an agent. */ by: string; createdAt: string; updatedAt: string }
type Row = typeof appDoc.$inferSelect
const view = (r: Row): AppDoc => ({ id: r.id, title: r.title, body: r.body, by: r.updatedBy, createdAt: r.createdAt.toISOString(), updatedAt: (r.updatedAt ?? r.createdAt).toISOString() })

/** An app's pages, in the order they were first written. */
export async function listAppDocs(appId: string): Promise<AppDoc[]> {
  return (await db.select().from(appDoc).where(eq(appDoc.appId, appId)).orderBy(asc(appDoc.createdAt), asc(appDoc.id))).map(view)
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
function checked(input: { title?: string; body?: string }) {
  const title = (input.title ?? '').trim().replace(/\s+/g, ' '), body = (input.body ?? '').trim()
  if (!title) throw new PlanError('a page needs a title')
  if (title.length > TITLE_MAX) throw new PlanError(`the title is ${title.length} characters; ${TITLE_MAX} at most`)
  if (body.length > PAGE_MAX) throw new PlanError(`the page is ${body.length} characters; ${PAGE_MAX} at most. Make it two pages.`)
  return { title, body }
}

/**
 * Write a page. With `id`, that page is replaced (its title too). Without, a new one is made; a title the app already
 * has is refused, so a second "How sign-in works" is not written beside the first by an agent that did not look.
 */
export async function writeAppDoc(appId: string, input: { id?: string; title: string; body: string }, actor = 'user', sessionId: string | null = null): Promise<AppDoc> {
  const { title, body } = checked(input)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const rows = await db.select().from(appDoc).where(eq(appDoc.appId, appId))
  const old = input.id ? rows.find((r) => r.id === input.id) : undefined
  if (input.id && !old) throw new PlanError(`no page ${input.id} in this app`)
  const twin = rows.find((r) => r.id !== old?.id && same(r.title, title))
  if (twin) throw new PlanError(`this app already has a page called "${twin.title}" (${twin.id}): write to that one by its id, or give this one another title`)
  return db.transaction(async (tx) => {
    const [row] = old
      ? await tx.update(appDoc).set({ title, body, updatedBy: actor, updatedAt: new Date() }).where(eq(appDoc.id, old.id)).returning()
      : await tx.insert(appDoc).values({ id: newId('appDoc'), appId, title, body, createdBy: actor, updatedBy: actor }).returning()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId, sessionId, actor, type: 'doc.written', payload: { id: row.id, title, new: !old } })
    return view(row)
  })
}

/** Change a page by its id alone (the page's own address): the app is the page's. */
export async function editAppDoc(id: string, input: { title?: string; body?: string }, actor = 'user'): Promise<AppDoc> {
  const [old] = await db.select().from(appDoc).where(eq(appDoc.id, id))
  if (!old) throw new PlanError(`no page ${id}`)
  return writeAppDoc(old.appId, { id, title: input.title ?? old.title, body: input.body ?? old.body }, actor)
}

/** Remove a page. A person's press only: no agent has a tool for it. */
export async function removeAppDoc(id: string, actor = 'user') {
  const [old] = await db.select().from(appDoc).where(eq(appDoc.id, id))
  if (!old) throw new PlanError(`no page ${id}`)
  const [a] = await db.select().from(app).where(eq(app.id, old.appId))
  await db.transaction(async (tx) => {
    await tx.delete(appDoc).where(eq(appDoc.id, id))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: old.appId, actor, type: 'doc.removed', payload: { id, title: old.title } })
  })
  return { removed: id }
}
