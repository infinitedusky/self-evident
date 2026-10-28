/**
 * Projects, issues, sub-issues and builds, the dispatch pass and the event log, against a real Postgres (the test
 * database the global setup creates). Skipped when the database isn't reachable, so `pnpm test` still runs the pure
 * tests anywhere.
 */
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, build, event, project, workspace } from './db/schema.js'
import { changeState, createIssue, getIssue, listIssues, reorder, updateIssue } from './issues.js'
import { addSubIssues, createProject, issueDetail, listCodeIssues, PlanError, projectGraph, setBuildStatus, tick } from './projects.js'
import { newId } from './ids.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('projects in Postgres', () => {
  const wsId = newId('workspace'), appId = newId('app'), key = 'T' + appId.slice(-4).toUpperCase()
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'test app', key })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('creates a project whose issues, sub-issues, builds, edges and claims are rows, numbered per app, and logs it', async () => {
    const { project: p, issues, subIssues } = await createProject({ appId, name: 'p', issues: [
      { title: 'T1', brief: 'first', subIssues: [{ key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', dependsOn: ['a'], files: ['y'] }] },
      { title: 'T2', subIssues: [{ key: 'c', title: 'C', files: ['z'], dependsOn: ['a'] }] }, // a later issue may name an earlier one's sub-issue
    ] })
    expect(p.integrationBranch).toBe(`project/${p.id}`)
    expect(issues.map((t) => [t.number, t.sortOrder, t.title, t.state, t.delegate])).toEqual([[1, 0, 'T1', 'todo', 'planner'], [2, 1, 'T2', 'todo', 'planner']])
    const g = (await projectGraph(p.id))!
    expect(g.issues.map((t) => [t.identifier, t.subIssueIds.length])).toEqual([[`${key}-1`, 2], [`${key}-2`, 1]])
    expect(g.subIssues.map((x) => [x.identifier, x.status, x.state, x.dependsOn.length, x.files])).toEqual([
      [`${key}-3`, 'queued', 'todo', 0, ['x']], [`${key}-4`, 'queued', 'todo', 1, ['y']], [`${key}-5`, 'queued', 'todo', 1, ['z']],
    ])
    expect(g.subIssues[2].dependsOn).toEqual([subIssues[0].id])
    const log = await db.select().from(event).where(eq(event.projectId, p.id)).orderBy(asc(event.seq))
    expect(log.map((e) => e.type)).toEqual(['project.created', ...Array(5).fill('issue.created')])
    expect(log[0].workspaceId).toBe(wsId)
  })

  it('refuses cycles, unknown dependencies, a dependency on a later issue, and a project of nothing', async () => {
    await expect(createProject({ appId, name: 'bad', issues: [{ title: 'T', subIssues: [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }] }] })).rejects.toThrow(PlanError)
    await expect(createProject({ appId, name: 'bad', issues: [{ title: 'T', subIssues: [{ key: 'a', title: 'A', dependsOn: ['ghost'] }] }] })).rejects.toThrow(/unknown sub-issue ghost/)
    await expect(createProject({ appId, name: 'bad', issues: [
      { title: 'T1', subIssues: [{ key: 'a', title: 'A', dependsOn: ['b'] }] }, { title: 'T2', subIssues: [{ key: 'b', title: 'B' }] },
    ] })).rejects.toThrow(/later issue/)
    await expect(createProject({ appId, name: 'bad', issues: [] })).rejects.toThrow(/at least one issue/)
  })

  it('a dispatch pass starts what it can, holds the rest with reasons, treats issue order as a dependency, and rolls states up', async () => {
    const { project: p, issues, subIssues } = await createProject({ appId, name: 'p', issues: [
      { title: 'T1', subIssues: [{ key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', files: ['x'] }] },
      { title: 'T2', subIssues: [{ key: 'c', title: 'C', files: ['z'] }] },
    ] })
    const [a, b, c] = subIssues.map((x) => x.id)
    const name = (n: number) => `${key}-${n}`
    const first = await tick(p.id, 4)
    expect(first.start).toEqual([a])
    let g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => [x.status, x.heldReason])).toEqual([
      ['ready', null], ['queued', `waiting on ${name(subIssues[0].number)} (x)`], ['queued', `waiting on ${name(subIssues[0].number)} (${name(issues[0].number)}, earlier in the project)`],
    ])
    expect(g.files).toEqual([{ path: 'x', subIssues: [a, b], heldBy: null }]) // nobody has x yet: a is only ready
    await setBuildStatus(a, 'running')
    expect((await getIssue(db, issues[0].id)).state).toBe('in_progress') // a sub-issue started: its issue is in progress
    await setBuildStatus(a, 'done')
    expect((await tick(p.id, 4)).start).toEqual([b]) // c still waits: b (the first issue) hasn't landed
    await setBuildStatus(b, 'done')
    expect((await getIssue(db, issues[0].id)).state).toBe('in_review') // all landed: the PR is what is left
    expect((await tick(p.id, 4)).start).toEqual([c])
    g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => [x.status, x.state])).toEqual([['done', 'done'], ['done', 'done'], ['ready', 'todo']])
    const types = (await db.select().from(event).where(eq(event.issueId, a)).orderBy(asc(event.seq))).filter((e) => e.type.startsWith('build')).map((e) => `${e.type}:${(e.payload as any).to ?? ''}`)
    expect(types).toEqual(['build.status:ready', 'build.status:running', 'build.status:done'])
  })

  it('sub-issues can be added to an issue later, depending on ones already there', async () => {
    const { project: p, issues, subIssues } = await createProject({ appId, name: 'p', issues: [{ title: 'T', subIssues: [{ key: 'a', title: 'A' }] }] })
    const added = await addSubIssues(issues[0].id, [{ key: 'b', title: 'B', dependsOn: [subIssues[0].id], files: ['q'] }, { key: 'c', title: 'C', dependsOn: ['b'] }], 'planner')
    expect(added.map((x) => x.number)).toEqual([subIssues[0].number + 1, subIssues[0].number + 2])
    const g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => x.dependsOn.length)).toEqual([0, 1, 1])
    expect(g.subIssues[1]).toMatchObject({ createdBy: 'planner', delegate: 'builder', source: 'planner' })
    await expect(addSubIssues(issues[0].id, [{ key: 'd', title: 'D', dependsOn: ['nope'] }])).rejects.toThrow(/unknown sub-issue nope/)
    await expect(addSubIssues(added[0].id, [{ key: 'e', title: 'E' }])).rejects.toThrow(/one level/)
  })

  it('an issue can live in no project, join one at the end, and be put in order', async () => {
    const loose = await createIssue(appId, { title: '  Make the shop faster  ', brief: 'measure first' })
    expect(loose).toMatchObject({ title: 'Make the shop faster', projectId: null, state: 'todo', kind: 'code' })
    expect((await listIssues(appId, { projectId: null, topLevel: true })).map((i) => i.id)).toContain(loose.id)
    expect((await listCodeIssues(appId))[0]).toMatchObject({ id: loose.id, project: null }) // issues in no project come first
    const { project: p, issues } = await createProject({ appId, name: 'speed', issues: [{ title: 'First' }, { title: 'Second' }] })
    const moved = await updateIssue(loose.id, { projectId: p.id })
    expect(moved.sortOrder).toBe(2)
    await reorder([loose.id, issues[1].id, issues[0].id])
    expect((await projectGraph(p.id))!.issues.map((t) => t.title)).toEqual(['Make the shop faster', 'Second', 'First'])
    await expect(reorder([loose.id, (await createIssue(appId, { title: 'elsewhere' })).id])).rejects.toThrow(/siblings/)
    const detail = await issueDetail(loose.id)
    expect(detail).toMatchObject({ identifier: `${key}-${loose.number}`, project: { id: p.id, name: 'speed' }, subIssues: [] })
  })

  it('canceling a code issue says why, and cancels its unbuilt sub-issues and their builds', async () => {
    const { issues, subIssues } = await createProject({ appId, name: 'p', issues: [{ title: 'T', subIssues: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] }] })
    await setBuildStatus(subIssues[0].id, 'done')
    await expect(changeState(issues[0].id, 'canceled')).rejects.toThrow(/why/)
    await changeState(issues[0].id, 'canceled', { reason: 'not needed after all' })
    expect((await getIssue(db, issues[0].id))).toMatchObject({ state: 'canceled', reason: 'not needed after all' })
    expect((await getIssue(db, subIssues[1].id)).state).toBe('canceled')
    expect((await getIssue(db, subIssues[0].id)).state).toBe('done') // what landed stays landed
    expect((await db.select().from(build).where(eq(build.issueId, subIssues[1].id)))[0].status).toBe('cancelled')
  })
})
