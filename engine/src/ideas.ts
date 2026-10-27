/**
 * Ideas: the inbox. An idea is a title and a body, captured in a moment; it becomes one issue (a project of one) or a
 * project of several. Nothing is lost: an idea that never becomes a project stays in the inbox with its lane.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, idea } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { createProject, PlanError } from './projects.js'

export const listIdeas = (appId?: string) => (appId ? db.select().from(idea).where(eq(idea.appId, appId)) : db.select().from(idea)).orderBy(desc(idea.number))

export async function createIdea(input: { appId: string; title: string; body?: string; actor?: string }) {
  if (!input.title?.trim()) throw new PlanError('an idea needs a title')
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${idea.number}), 0)` }).from(idea).where(eq(idea.appId, a.id))
    const [row] = await tx.insert(idea).values({
      id: newId('idea'), appId: a.id, number: Number(max) + 1, title: input.title.trim(), body: input.body?.trim() || null, source: 'person', lane: 'inbox',
    }).returning()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, ideaId: row.id, actor: input.actor ?? 'user', type: 'idea.created', payload: { number: row.number, title: row.title } })
    return row
  })
}

/** An idea becomes a project: one issue by default (the idea's title, its body as the brief), or the issues given. */
export async function projectFromIdea(ideaId: string, issues?: { title: string; brief?: string }[]) {
  const [i] = await db.select().from(idea).where(eq(idea.id, ideaId))
  if (!i) throw new PlanError(`no idea ${ideaId}`)
  return createProject({ // createProject moves the idea to the 'build' lane
    appId: i.appId, name: i.title, content: i.body ?? undefined, ideaId: i.id,
    issues: issues?.length ? issues : [{ title: i.title, brief: i.body ?? undefined }],
  })
}
