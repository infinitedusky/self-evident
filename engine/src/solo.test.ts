/**
 * A task on its own (solo.ts): planned with no project, it gets one of its own that is never listed; it still reads
 * as in no project; moved into a real project before building, its questions go with it and its own project is put
 * away; once building has started it stays.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, project, question, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue, getIssue, listIssues, updateIssue } from './issues.js'
import { planIssue, type Proposal, type Propose } from './planner.js'
import { createProject, issueDetail, listCodeIssues, listProjects, projectGraph } from './projects.js'
import { approveBriefs } from './test-briefs.js'
import { planView } from './work.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const proposal: Proposal = {
  phases: [{ key: 'page', title: 'Build the page', description: 'For a person.', summary: 'One page.', depends_on: [], files: ['site/index.html'], steps: [{ text: 'Write it', technical: '' }], checks: [], done_when: 'The page loads.' }],
  decisions: [],
  questions: [{ question: 'One page or three?', options: [{ label: 'One', description: '', changes: [] }, { label: 'Three', description: '', changes: [] }], recommended: 'One', reason: 'It is small.', cost: 'cheap' }],
  notes: '',
}
const propose: Propose = async () => ({ status: 'completed', proposal, costUsd: 0.1, agentSessionId: 'sess-solo', numTurns: 1 })

describe.skipIf(!reachable)('a task on its own', () => {
  let appId: string
  beforeAll(async () => {
    const wsId = newId('workspace')
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'solo test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'made-up app', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'true', model: 'claude-fake' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: await mkdtemp(join(tmpdir(), 'se-solo-')) })
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  const planned = async (title: string) => {
    const t = await createIssue(appId, { title, state: 'todo' })
    await approveBriefs(appId)
    expect((await planIssue(t.id, { propose })).status).toBe('completed')
    return getIssue(db, t.id)
  }

  it('is planned in a project of its own, which is never listed, and still reads as in no project', async () => {
    const t = await planned('Marketing site')
    const [p] = await db.select().from(project).where(eq(project.id, t.projectId!))
    expect(p).toMatchObject({ solo: true, name: 'Marketing site', status: 'drafting', integrationBranch: `project/${p.id}` })
    expect((await projectGraph(p.id))!.subIssues.map((s) => s.title)).toEqual(['Build the page'])
    expect((await listProjects({ appId, all: true })).map((x) => x.id)).not.toContain(p.id)
    const view = await planView(appId)
    expect(view.projects.map((x) => x.id)).not.toContain(p.id)
    expect(view.loose.map((x) => x.id)).toContain(t.id)
    expect((await listIssues(appId, { projectId: null, topLevel: true })).map((x) => x.id)).toContain(t.id)
    expect((await listCodeIssues(appId)).find((x) => x.id === t.id)!.project).toMatchObject({ id: p.id, solo: true })
    expect((await issueDetail(t.id)).project).toMatchObject({ id: p.id, solo: true })
  })

  it('a task not taken on yet is refused before any project is made', async () => {
    const t = await createIssue(appId, { title: 'Not yet', state: 'backlog' })
    await approveBriefs(appId)
    await expect(planIssue(t.id, { propose })).rejects.toThrow(/backlog; take it on first/)
    expect((await getIssue(db, t.id)).projectId).toBeNull()
  })

  it('moves into a real project before building: its sub-tasks and questions go with it, and its own project is put away', async () => {
    const t = await planned('Pricing page')
    const own = t.projectId!
    const { project: real } = await createProject({ appId, name: 'Website' })
    await updateIssue(t.id, { projectId: real.id })
    const g = (await projectGraph(real.id))!
    expect(g.issues.map((i) => i.id)).toEqual([t.id])
    expect(g.subIssues.map((s) => s.title)).toEqual(['Build the page'])
    expect((await db.select().from(question).where(eq(question.issueId, t.id))).map((q) => q.projectId)).toEqual([real.id])
    expect((await db.select().from(project).where(eq(project.id, own)))[0].status).toBe('superseded')
  })

  it('stays on its own once building has started', async () => {
    const t = await planned('Docs page')
    await db.update(project).set({ status: 'paused' }).where(eq(project.id, t.projectId!))
    const { project: real } = await createProject({ appId, name: 'Docs' })
    await expect(updateIssue(t.id, { projectId: real.id })).rejects.toThrow(/already being built on its own \(paused\)/)
    expect((await getIssue(db, t.id)).projectId).toBe(t.projectId)
  })
})
