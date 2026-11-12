/** Deleting a task: one with nothing done goes with its sub-tasks and what was written on it; one with work on it is refused. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, issue, issueComment, run, session, workspace } from './db/schema.js'
import { deleteIssue } from './delete-issue.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { createProject } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('deleting a task', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const key = `D${appId.slice(-5).toUpperCase()}` // a key starts with a letter, or a task can't be named by it
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'delete test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key })
  })
  afterAll(async () => { await pool.end() })

  it('removes a task with nothing done, by id or by name, ends its open conversation, and logs that it went', async () => {
    const t = await createIssue(appId, { title: 'Made by mistake' })
    await db.insert(issueComment).values({ id: newId('issue'), appId, issueId: t.id, heading: 'Plan', body: 'made up', author: 'user' })
    const talk = newId('session')
    await db.insert(session).values({ id: talk, appId, kind: 'talk', status: 'open', subjectRef: { issueId: t.id } })
    const ended: string[] = []
    const name = `${key}-${t.number}`
    expect(await deleteIssue(name, 'user', async (id) => { ended.push(id) })).toEqual({ deleted: name, title: 'Made by mistake', subIssues: 0, talksEnded: 1 })
    expect(ended).toEqual([talk])
    expect(await db.select().from(issue).where(eq(issue.id, t.id))).toEqual([])
    expect(await db.select().from(issueComment).where(eq(issueComment.issueId, t.id))).toEqual([])
    const log = await db.select().from(event).where(eq(event.appId, appId))
    expect(log.find((e) => e.type === 'issue.deleted')?.payload).toMatchObject({ identifier: name, title: 'Made by mistake' })
    await expect(deleteIssue(t.id)).rejects.toThrow()
  })

  it('takes a planned task\'s sub-tasks, their builds and file claims with it', async () => {
    const { issues, subIssues } = await createProject({ appId, name: 'cart', issues: [{ title: 'Cart', subIssues: [{ key: 'a', title: 'Cart page', files: ['app/cart'] }, { key: 'b', title: 'Cart total', dependsOn: ['a'] }] }] })
    expect((await deleteIssue(issues[0].id)).subIssues).toBe(2)
    expect(await db.select().from(issue).where(eq(issue.id, subIssues[0].id))).toEqual([])
  })

  it('refuses a task an agent has run on, and says to cancel it instead', async () => {
    const t = await createIssue(appId, { title: 'Has history' })
    await db.insert(run).values({ id: newId('run'), appId, issueId: t.id, kind: 'plan', agent: 'planner', status: 'completed', attempt: 1 })
    await expect(deleteIssue(t.id)).rejects.toThrow(/has work on it \(1 agent run\).*cancel it instead/)
    expect(await db.select().from(issue).where(eq(issue.id, t.id))).toHaveLength(1)
  })
})
