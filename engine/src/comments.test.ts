/**
 * Self Evident as a tracker: a ticket is found by its identifier, searched for by its words, listed by state, and
 * carries comments one per heading, the way the tkt skills write them (the plan, the handoff, the completion).
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, issueComment, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { commentOnIssue, createIssue, listComments, listIssues, PlanError, resolveIssue } from './issues.js'
import { issueDetail } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('the tracker', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  const key = `T${appId.slice(-5).toUpperCase()}`
  let slug: string, search: string
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'tracker test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'tracker app', key, setup: {} })
    slug = (await createIssue(appId, { title: 'Add slugify to the string helpers', description: 'Page titles need URL slugs.', state: 'triage' })).id
    search = (await createIssue(appId, { title: 'Search results load too slowly', brief: 'Reported twice; the query has no index on the title.', state: 'in_progress' })).id
  })
  afterAll(async () => { await pool.end() })

  it('resolves a ticket by its identifier as well as its id', async () => {
    const byId = await resolveIssue(db, slug)
    expect(byId.id).toBe(slug)
    expect((await resolveIssue(db, `${key}-1`)).id).toBe(slug)
    expect((await resolveIssue(db, `${key.toLowerCase()}-2`)).id).toBe(search)
    await expect(resolveIssue(db, `${key}-99`)).rejects.toThrow(PlanError)
  })

  it('searches titles, descriptions and briefs, open and closed alike', async () => {
    expect((await listIssues(appId, { q: 'slug' })).map((i) => i.id)).toEqual([slug])
    expect((await listIssues(appId, { q: 'no index' })).map((i) => i.id)).toEqual([search])
    expect((await listIssues(appId, { q: 'URL slugs' })).map((i) => i.id)).toEqual([slug])
    expect(await listIssues(appId, { q: 'nothing like this' })).toEqual([])
    expect((await listIssues(appId, { q: '100%' }))).toEqual([]) // a wildcard in the words is just a character
  })

  it('lists by state, as the skills ask for what is in flight or ready', async () => {
    expect((await listIssues(appId, { states: ['in_progress', 'in_review'] })).map((i) => i.id)).toEqual([search])
    expect((await listIssues(appId, { states: ['triage', 'backlog', 'todo'] })).map((i) => i.id)).toEqual([slug])
  })

  it('comments under a heading, the same heading replacing the comment, and logs each write', async () => {
    const plan = await commentOnIssue(slug, { body: '## Implementation plan\n\nOne pure function, with tests.' }, 'start-ticket')
    expect(plan.heading).toBe('Implementation plan')
    expect(plan.author).toBe('start-ticket')
    const again = await commentOnIssue(slug, { body: '## Implementation plan\n\nOne pure function, with tests, accents stripped.' }, 'start-ticket')
    expect(again.id).toBe(plan.id) // replaced, not added
    expect(again.body).toContain('accents stripped')
    const handoff = await commentOnIssue(slug, { heading: 'Implementation handoff', body: 'PR #1 at 5f984b9.\n\nStatus: READY_FOR_REVIEW' }, 'work-ticket')
    expect(handoff.heading).toBe('Implementation handoff')
    const all = await listComments(db, slug)
    expect(all.map((c) => c.heading)).toEqual(['Implementation plan', 'Implementation handoff'])
    expect((await issueDetail(slug)).comments.map((c) => c.id)).toEqual([plan.id, handoff.id])
    const logged = await db.select().from(event).where(eq(event.issueId, slug))
    const commented = logged.filter((e) => e.type === 'issue.commented').map((e) => e.payload as { heading: string; replaced: boolean })
    expect(commented).toEqual([
      { ...commented[0], heading: 'Implementation plan', replaced: false },
      { ...commented[1], heading: 'Implementation plan', replaced: true },
      { ...commented[2], heading: 'Implementation handoff', replaced: false },
    ])
    expect((await db.select().from(issueComment).where(eq(issueComment.issueId, slug))).length).toBe(2)
  })

  it('refuses an empty comment', async () => {
    await expect(commentOnIssue(slug, { body: '   ' })).rejects.toThrow(PlanError)
    await expect(commentOnIssue(slug, { body: '##' })).rejects.toThrow(PlanError)
  })
})
