/** A canceled sub-task is out of the plan: its build is cancelled, the graph and the counts leave it out; reopened, it is back. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, build, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { changeState } from './issues.js'
import { addSubTask, createProject, listCodeIssues, projectGraph } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a canceled sub-task (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let projectId: string, a: string, b: string
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'canceled subs test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    const p = await createProject({ appId, name: 'Export (sample)', issues: [{ title: 'Export (sample)', subIssues: [{ key: 'a', title: 'The query (sample)' }, { key: 'b', title: 'The file (sample)', dependsOn: ['a'] }] }] })
    projectId = p.project.id; a = p.subIssues[0].id; b = p.subIssues[1].id
  })
  const statusOf = async (id: string) => (await db.select().from(build).where(eq(build.issueId, id)))[0]?.status

  it('leaves the graph and the counts, its build cancelled, and what waited on it waits no longer', async () => {
    expect((await projectGraph(projectId))!.subIssues).toHaveLength(2)
    await changeState(a, 'canceled', { reason: 'Duplicate plan (sample)' })
    expect(await statusOf(a)).toBe('cancelled')
    const g = (await projectGraph(projectId))!
    expect(g.subIssues.map((s) => s.id)).toEqual([b]); expect(g.subIssues[0].dependsOn).toEqual([])
    expect(g.issues[0].subIssueIds).toEqual([b])
    const row = (await listCodeIssues(appId))[0] as unknown as Record<string, unknown>
    expect(JSON.stringify(row)).not.toContain('cancelled')
  })

  it('is queued again when it is reopened', async () => {
    await changeState(a, 'todo')
    expect(await statusOf(a)).toBe('queued')
    expect((await projectGraph(projectId))!.subIssues).toHaveLength(2)
  })
})

describe.skipIf(!reachable)('a sub-task added to a planned task (sample data)', () => {
  it('is built like the planner\'s: a build, a builder, in the graph, in its place', async () => {
    const wsId = newId('workspace'), appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'added sub-task test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    const p = await createProject({ appId, name: 'Export (sample)', issues: [{ title: 'Export (sample)', subIssues: [{ key: 'a', title: 'The screens (sample)' }, { key: 'z', title: 'Smoke test (sample)', dependsOn: ['a'] }] }] })
    const [screens, smoke] = p.subIssues
    const row = await addSubTask(p.issues[0].id, { title: 'Telemetry (sample)', after: [screens.id], before: [smoke.id] }, 'agent')
    expect(row).toMatchObject({ delegate: 'builder', projectId: p.project.id, parentId: p.issues[0].id })
    const g = (await projectGraph(p.project.id))!
    const added = g.subIssues.find((s) => s.id === row.id)!
    expect(added.status).toBe('queued'); expect(added.dependsOn).toEqual([screens.id])
    expect(g.subIssues.find((s) => s.id === smoke.id)!.dependsOn.sort()).toEqual([screens.id, row.id].sort())
    await expect(addSubTask(p.issues[0].id, { title: 'x', after: ['iss_nope'] })).rejects.toThrow(/not a sub-task of this task/)
  })
})

afterAll(async () => { await pool.end() })
