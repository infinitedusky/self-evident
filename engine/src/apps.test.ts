/** Removing an app: put away (and back), then deleted for good, leaving its neighbour whole. Sample data throughout. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, initiative, initiativeProject, issue, pr, project, repo, session, sessionMessage, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { activeApps, appHolds, bringBack, deleteForGood, putAway, putAwayIds, type PutAwayDeps } from './apps.js'
import { createProject, listProjects } from './projects.js'
import { setBuild } from './projects.js'
import { createDefaultWorkflow } from './work.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('removing an app (sample data)', () => {
  const wsId = newId('workspace'), goes = newId('app'), stays = newId('app')
  const key = goes.slice(-6).toUpperCase()
  let did: string[] = []
  const deps = (busy: string[] = []): PutAwayDeps => ({
    busy: (ids) => ids.filter((id) => busy.includes(id)),
    release: async (ids) => { did.push(`release ${ids.length}`) },
    pauseProject: async (id) => { did.push(`pause ${id}`); await db.update(project).set({ status: 'paused' }).where(eq(project.id, id)) },
    stopPrototype: async () => {}, stopStorybookAt: async (cwd) => { did.push(`storybook ${cwd}`) },
  })
  let projectId: string, subId: string, talkId: string, otherProject: string

  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'remove apps test' })
    await db.insert(app).values([{ id: goes, workspaceId: wsId, name: 'Shop (sample)', key }, { id: stays, workspaceId: wsId, name: 'Blog (sample)', key: stays.slice(-6).toUpperCase() }])
    await db.transaction(async (tx) => { await createDefaultWorkflow(tx, goes) }) // the app points at its workflow, and the workflow at its app
    await db.insert(repo).values({ id: newId('repo'), appId: goes, fullName: 'sample/shop', localPath: '/tmp/sample-shop' })
    const p = await createProject({ appId: goes, name: 'Export (sample)', issues: [{ title: 'Export (sample)', subIssues: [{ key: 'a', title: 'The query (sample)' }, { key: 'b', title: 'The file (sample)', dependsOn: ['a'] }] }] })
    projectId = p.project.id; subId = p.subIssues[0].id
    await db.update(project).set({ status: 'running' }).where(eq(project.id, projectId))
    await db.insert(pr).values({ id: newId('pr'), appId: goes, projectId, issueId: p.issues[0].id, number: 4, status: 'open' })
    talkId = newId('session')
    await db.insert(session).values({ id: talkId, workspaceId: wsId, appId: goes, kind: 'talk', status: 'open', subjectRef: { issueId: p.issues[0].id } } as typeof session.$inferInsert)
    await db.insert(sessionMessage).values({ sessionId: talkId, appId: goes, author: 'user', body: 'hello (sample)' } as typeof sessionMessage.$inferInsert)
    const [init] = await db.insert(initiative).values({ id: newId('initiative'), workspaceId: wsId, name: 'More orders (sample)' } as typeof initiative.$inferInsert).returning()
    await db.insert(initiativeProject).values({ initiativeId: init.id, projectId } as typeof initiativeProject.$inferInsert)
    otherProject = (await createProject({ appId: stays, name: 'Posts (sample)', issues: [{ title: 'Drafts (sample)', subIssues: [{ key: 'a', title: 'Save a draft (sample)' }] }] })).project.id
  })
  afterAll(async () => { await pool.end() })

  it('is not put away while it builds or an agent of it is replying', async () => {
    await db.transaction((tx) => setBuild(tx, subId, { status: 'running' }))
    await expect(putAway(goes, deps())).rejects.toThrow(/is building/)
    await db.transaction((tx) => setBuild(tx, subId, { status: 'queued' }))
    await expect(putAway(goes, deps([talkId]))).rejects.toThrow(/replying/)
    expect((await activeApps()).map((a) => a.id)).toContain(goes)
  })

  it('put away, it leaves the lists, its running project is paused and its abbreviation is free; then it comes back', async () => {
    did = []
    await putAway(goes, deps())
    expect(did).toEqual([`pause ${projectId}`, 'release 1', 'storybook /tmp/sample-shop'])
    expect((await activeApps()).map((a) => a.id)).not.toContain(goes)
    expect(await putAwayIds()).toContain(goes)
    expect((await listProjects()).map((p) => p.id)).not.toContain(projectId)
    expect((await listProjects()).map((p) => p.id)).toContain(otherProject)
    expect(await appHolds(goes)).toMatchObject({ name: 'Shop (sample)', tasks: 1, projects: 1, conversations: 1, kept: ['sample/shop on GitHub', '/tmp/sample-shop', '/tmp/sample-shop-worktrees'] })

    const taker = newId('app')
    await db.insert(app).values({ id: taker, workspaceId: wsId, name: 'Store (sample)', key }) // the abbreviation is free meanwhile
    await expect(bringBack(goes)).rejects.toThrow(/abbreviation/)
    await db.delete(app).where(eq(app.id, taker))
    expect((await bringBack(goes)).removedAt).toBeNull()
    expect((await db.select().from(project).where(eq(project.id, projectId)))[0].status).toBe('paused') // left for the person to resume
  })

  it('is deleted for good only once put away, and only with its name typed', async () => {
    await expect(deleteForGood(goes, 'Shop (sample)')).rejects.toThrow(/remove it first/)
    await putAway(goes, deps())
    await expect(deleteForGood(goes, 'shop')).rejects.toThrow(/type the app's name/)
    expect((await db.select().from(app).where(eq(app.id, goes)))).toHaveLength(1)
  })

  it('deleted for good, no row of it is left anywhere, and its neighbour is whole', async () => {
    const before = await db.select().from(issue).where(eq(issue.appId, stays))
    const r = await deleteForGood(goes, ' Shop (sample) ')
    expect(r.rows.issue).toBe(3)
    const tables = ((await db.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'app_id'`)).rows as { table_name: string }[]).map((x) => x.table_name)
    expect(tables.length).toBeGreaterThan(25)
    for (const t of tables) expect([t, Number((await db.execute(sql`select count(*) as n from ${sql.identifier(t)} where app_id = ${goes}`)).rows[0].n)]).toEqual([t, 0])
    expect(await db.select().from(app).where(eq(app.id, goes))).toHaveLength(0)
    expect(await db.select().from(initiativeProject).where(eq(initiativeProject.projectId, projectId))).toHaveLength(0)
    expect(await db.select().from(issue).where(eq(issue.appId, stays))).toHaveLength(before.length)
    expect((await listProjects()).map((p) => p.id)).toContain(otherProject)
  })
})
