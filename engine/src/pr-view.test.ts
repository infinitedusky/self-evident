/** A task's pull request as a step: where it stands, its message, what was said on it, and marking a draft ready. Made-up app and pull request (sample). */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, pr as prTable, project, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { markReady, prView, readPr, type Gh } from './pr-view.js'
import { createProject } from './projects.js'

const onGithub = (over: Record<string, unknown> = {}) => JSON.stringify({
  number: 12, url: 'https://github.com/sample-org/sample-shop/pull/12', state: 'OPEN', isDraft: true, title: 'feat(SS-1): one-page checkout (sample)', body: 'What it does (sample)', reviewDecision: 'CHANGES_REQUESTED', mergeable: 'MERGEABLE', updatedAt: '2026-11-20T10:00:00Z',
  statusCheckRollup: [{ name: 'tests', conclusion: 'SUCCESS' }, { name: 'lint', conclusion: 'FAILURE' }, { context: 'deploy preview', state: 'PENDING' }],
  comments: [{ id: 'IC_2', author: { login: 'reviewer-b' }, body: 'Looks close (sample)', createdAt: '2026-11-20T09:30:00Z', url: 'https://github.com/sample-org/sample-shop/pull/12#issuecomment-2' }],
  reviews: [{ id: 'PRR_1', author: { login: 'reviewer-a' }, body: 'Please split the migration (sample)', submittedAt: '2026-11-20T09:00:00Z', state: 'CHANGES_REQUESTED' }, { id: 'PRR_2', author: { login: 'reviewer-a' }, body: '', submittedAt: '2026-11-20T09:10:00Z', state: 'COMMENTED' }],
  ...over,
})
const lines = JSON.stringify([{ id: 7, user: { login: 'reviewer-a' }, body: 'This index is not used (sample)', created_at: '2026-11-20T09:10:00Z', html_url: 'https://github.com/sample-org/sample-shop/pull/12#discussion_r7', path: 'db/migrate.sql', line: 14 }])
const fake = (over: Record<string, unknown> = {}, calls: string[][] = []): Gh => async (args) => { calls.push(args); return args[0] === 'api' ? lines : args[1] === 'view' ? onGithub(over) : '' }

describe('a pull request as GitHub has it', () => {
  it('is read with its checks and what was said on it, oldest first, an empty review left out', async () => {
    const { pr, comments } = await readPr(fake(), '.', 'sample-org/sample-shop', 12)
    expect(pr).toMatchObject({ number: 12, status: 'draft', review: 'changes requested', mergeable: 'mergeable', checks: [{ name: 'tests', state: 'pass' }, { name: 'lint', state: 'fail' }, { name: 'deploy preview', state: 'pending' }] })
    expect(comments.map((c) => [c.kind, c.author, c.state ?? c.path ?? ''])).toEqual([['review', 'reviewer-a', 'changes requested'], ['line', 'reviewer-a', 'db/migrate.sql'], ['comment', 'reviewer-b', '']])
    expect((await readPr(fake({ state: 'MERGED', isDraft: false }), '.', 'x/y', 12)).pr.status).toBe('merged')
    expect((await readPr(fake({ isDraft: false }), '.', 'x/y', 12)).pr.status).toBe('open')
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
describe.skipIf(!reachable)('a task\'s pull request step', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const preview = async () => ({ title: 'feat(SS-1): one-page checkout (sample)', body: 'What it does, now with the merge guide (sample)', head: 'project/x--ss-1', base: 'main', landed: 0, pending: [] })
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'pr view test (sample)' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'sample-org/sample-shop', localPath: process.cwd() })
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  it('before it is submitted says what it will open with and what it waits on; GitHub is not asked', async () => {
    const { issues: [t] } = await createProject({ appId, name: 'Checkout (sample)', issues: [{ title: 'One-page checkout (sample)', brief: 'Build it.' }] })
    const calls: string[][] = []
    const v = await prView(t.id, { gh: fake({}, calls), preview })
    expect(v).toMatchObject({ pr: null, message: { title: 'feat(SS-1): one-page checkout (sample)' }, canSubmit: false, canReady: false, comments: [], draft: true })
    expect(v.waits.join(' ')).toMatch(/Nothing is built yet|still to land/)
    expect(calls).toEqual([])
    await expect(markReady(t.id, 'user', fake())).rejects.toThrow(/submit it first/)
  })

  it('once it is a draft shows GitHub\'s, says when its message is behind, and is marked ready by the person', async () => {
    const { project: p, issues: [t] } = await createProject({ appId, name: 'Checkout two (sample)', issues: [{ title: 'One-page checkout (sample)', brief: 'Build it.' }] })
    await db.insert(prTable).values({ id: newId('pr'), appId, projectId: p.id, issueId: t.id, number: 12, url: 'https://github.com/sample-org/sample-shop/pull/12', status: 'draft' })
    const v = await prView(t.id, { gh: fake(), preview })
    expect(v).toMatchObject({ pr: { number: 12, status: 'draft', review: 'changes requested' }, behind: true, canReady: true, canSubmit: false, problem: null })
    expect(v.comments).toHaveLength(3)
    // GitHub cannot be reached: what was last known, and said.
    const down = await prView(t.id, { gh: async () => { throw new Error('could not resolve host (sample)') }, preview })
    expect(down).toMatchObject({ pr: { number: 12, status: 'draft' }, comments: [] }); expect(down.problem).toMatch(/could not be asked just now.*could not resolve host/)
    const calls: string[][] = []
    expect(await markReady(t.id, 'user', fake({}, calls))).toMatchObject({ number: 12, status: 'open' })
    expect(calls).toEqual([['pr', 'ready', '12', '-R', 'sample-org/sample-shop']])
    expect((await db.select().from(prTable).where(eq(prTable.issueId, t.id)))[0].status).toBe('open')
    expect((await db.select().from(event).where(eq(event.issueId, t.id))).some((e) => e.type === 'pr.ready')).toBe(true)
    // Merged on GitHub since: the engine's record follows what it reads.
    expect((await prView(t.id, { gh: fake({ state: 'MERGED', isDraft: false }), preview })).pr?.status).toBe('merged')
    expect((await db.select().from(prTable).where(eq(prTable.issueId, t.id)))[0].status).toBe('merged')
    await expect(markReady(t.id, 'user', fake())).rejects.toThrow(/is merged/)
  })
})
