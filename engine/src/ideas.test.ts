/** The inbox: an idea is kept, then becomes a project of one task (or several). Runs against the real constraints. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, idea, project, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIdea, listIdeas, projectFromIdea } from './ideas.js'
import { projectGraph } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('ideas', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'ideas test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('keeps an idea, numbers it per app, and turns it into a project of one issue with the body as the brief', async () => {
    const a = await createIdea({ appId, title: '  Spaced repetition  ', body: 'What you missed comes back.' })
    const b = await createIdea({ appId, title: 'Second' })
    expect([a.number, b.number]).toEqual([1, 2])
    expect(a).toMatchObject({ title: 'Spaced repetition', lane: 'inbox', source: 'person' })
    expect((await listIdeas()).filter((i) => i.appId === appId).map((i) => i.title)).toEqual(['Second', 'Spaced repetition'])

    const out = await projectFromIdea(a.id)
    const g = (await projectGraph(out.project.id))!
    expect(g.project).toMatchObject({ name: 'Spaced repetition', content: 'What you missed comes back.', ideaId: a.id })
    expect(g.issues.map((t) => [t.title, t.brief])).toEqual([['Spaced repetition', 'What you missed comes back.']])
    expect((await db.select().from(idea).where(eq(idea.id, a.id)))[0].lane).not.toBe('inbox')

    const many = await projectFromIdea(b.id, [{ title: 'First part' }, { title: 'Second part', brief: 'after the first' }])
    expect((await projectGraph(many.project.id))!.issues.map((t) => t.title)).toEqual(['First part', 'Second part'])
  })

  it('refuses an empty title', async () => {
    await expect(createIdea({ appId, title: '   ' })).rejects.toThrow(/title/)
  })
})
