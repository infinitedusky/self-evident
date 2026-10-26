/**
 * The GitHub sync, against a stand-in for GitHub (pull requests) and real git repos (a bare "origin" and a
 * teammate's clone): our PR merged and reviewed, a teammate's PR asking for a review and touching our files, main
 * moving into a running project's branch cleanly, and a conflict reported instead of resolved.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, outsidePr, phaseFileClaim, pr, project, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { catchUpApp, checksOf, syncPrs, type GhPr, type GitHubApi } from './github.js'
import { newId } from './ids.js'
import { now } from './now.js'
import { createProject } from './projects.js'

describe('checksOf', () => {
  it('reads the rollup as one word', () => {
    expect(checksOf([])).toEqual({ state: 'none', failing: [] })
    expect(checksOf([{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]).state).toBe('passing')
    expect(checksOf([{ name: 'test', status: 'IN_PROGRESS' }]).state).toBe('pending')
    expect(checksOf([{ name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }, { context: 'lint', state: 'SUCCESS' }])).toEqual({ state: 'failing', failing: ['test'] })
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('github sync', () => {
  const wsId = newId('workspace')
  let appId: string, repoId: string, local: string, teammate: string
  const retargeted: [number, string][] = []
  const fake = (prs: GhPr[]): GitHubApi => ({ me: async () => 'sandy', listPrs: async () => prs, retarget: async (_f, n, base) => { retargeted.push([n, base]) } })
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-github-'))
    await git(dir, ['init', '-q', '--bare', '-b', 'main', 'origin.git'])
    for (const name of ['local', 'teammate']) {
      await git(dir, ['clone', '-q', join(dir, 'origin.git'), name])
      await git(join(dir, name), ['config', 'user.email', `${name}@example.com`]); await git(join(dir, name), ['config', 'user.name', name])
    }
    local = join(dir, 'local'); teammate = join(dir, 'teammate')
    await writeFile(join(local, 'README.md'), 'hi\n'); await commitAll(local, 'init'); await git(local, ['push', '-q', 'origin', 'main'])
    await git(teammate, ['pull', '-q', 'origin', 'main'])
    appId = newId('app'); repoId = newId('repo')
    await db.insert(workspace).values({ id: wsId, name: 'github test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'shop' })
    await db.insert(repo).values({ id: repoId, appId, fullName: 'o/shop', localPath: local })
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  it('records our PR merged and reviewed; keeps a teammate\'s PR, its review request, and where it touches our work', async () => {
    const { project: p, phases } = await createProject({ appId, title: 'cart', tasks: [{ title: 'Cart', phases: [{ key: 'a', title: 'Cart page', files: ['app/cart'] }] }] })
    await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    await db.insert(pr).values({ id: newId('pr'), appId, projectId: p.id, repoId, number: 7, status: 'open', headBranch: p.integrationBranch })
    const ours: GhPr = { number: 7, title: 'cart', url: 'u7', state: 'OPEN', isDraft: false, headRefName: p.integrationBranch!, baseRefName: 'main', reviewDecision: 'CHANGES_REQUESTED', statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }] }
    const theirs: GhPr = { number: 8, title: 'Discount codes', url: 'u8', state: 'OPEN', isDraft: false, author: { login: 'mate' }, headRefName: 'discounts', baseRefName: 'main', reviewRequests: [{ login: 'sandy' }], files: [{ path: 'app/cart/page.tsx' }, { path: 'lib/discounts.ts' }] }
    const first = await syncPrs(appId, fake([ours, theirs]))
    expect(first.changes).toEqual(expect.arrayContaining(['#7 pr.review', '#7 pr.checks']))
    const [row] = await db.select().from(pr).where(eq(pr.projectId, p.id))
    expect(row.signals).toMatchObject({ review: 'CHANGES_REQUESTED', checks: 'failing', failing: ['test'] })
    const [o] = await db.select().from(outsidePr).where(and(eq(outsidePr.repoId, repoId), eq(outsidePr.number, 8)))
    expect(o).toMatchObject({ author: 'mate', reviewRequested: true, state: 'open', files: ['app/cart/page.tsx', 'lib/discounts.ts'] })
    expect((await db.select().from(phaseFileClaim).where(eq(phaseFileClaim.phaseId, phases[0].id))).map((c) => c.path)).toEqual(['app/cart'])

    const needs = (await now(appId)).needsYou
    expect(needs.find((n) => n.kind === 'pr_feedback')).toMatchObject({ prNumber: 7, review: 'CHANGES_REQUESTED', checks: 'failing' })
    expect(needs.find((n) => n.kind === 'review')).toMatchObject({ prNumber: 8, author: 'mate' })
    expect(needs.find((n) => n.kind === 'overlap')).toMatchObject({ prNumber: 8, files: ['app/cart/page.tsx'], projectId: p.id })

    const second = await syncPrs(appId, fake([{ ...ours, state: 'MERGED', reviewDecision: 'APPROVED', statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }, { ...theirs, state: 'MERGED' }]))
    expect(second.changes).toEqual(expect.arrayContaining(['#7 pr.merged', '#7 pr.review', '#7 pr.checks']))
    expect((await db.select().from(pr).where(eq(pr.projectId, p.id)))[0].status).toBe('merged')
    expect((await db.select().from(outsidePr).where(eq(outsidePr.number, 8)))[0].state).toBe('merged')
    expect((await now(appId)).needsYou.some((n) => n.kind === 'review' || n.kind === 'overlap')).toBe(false)
    await db.update(project).set({ status: 'superseded' }).where(eq(project.id, p.id))
  })

  it('stacked PRs: when the bottom one merges, the next retargets to main and its branch catches up from main', async () => {
    const { project: p, tasks } = await createProject({ appId, title: 'stack', tasks: [{ title: 'One' }, { title: 'Two' }] })
    await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    const b1 = `${p.integrationBranch}--t${tasks[0].number}`, b2 = `${p.integrationBranch}--t${tasks[1].number}`
    await git(local, ['fetch', '-q', 'origin']); await git(local, ['branch', b1, 'origin/main']); await git(local, ['branch', b2, b1])
    await db.insert(pr).values([
      { id: newId('pr'), appId, projectId: p.id, taskId: tasks[0].id, repoId, number: 11, status: 'open', headBranch: b1, baseBranch: 'main' },
      { id: newId('pr'), appId, projectId: p.id, taskId: tasks[1].id, repoId, number: 12, status: 'open', headBranch: b2, baseBranch: b1 },
    ])
    const one: GhPr = { number: 11, title: 'One', url: 'u11', state: 'MERGED', isDraft: false, headRefName: b1, baseRefName: 'main' }
    const two: GhPr = { number: 12, title: 'Two', url: 'u12', state: 'OPEN', isDraft: false, headRefName: b2, baseRefName: b1 }
    const out = await syncPrs(appId, fake([one, two]))
    expect(out.changes).toEqual(expect.arrayContaining(['#11 pr.merged', '#12 retargeted']))
    expect(retargeted).toContainEqual([12, 'main'])
    expect((await db.select().from(pr).where(eq(pr.number, 12)))[0].baseBranch).toBe('main')
    expect((await now(appId)).needsYou.some((n) => n.kind === 'review' || n.kind === 'overlap')).toBe(false) // our task branches are not a teammate's

    await writeFile(join(teammate, 'news.md'), 'news\n'); await commitAll(teammate, 'news'); await git(teammate, ['push', '-q', 'origin', 'main'])
    const caught = await catchUpApp(appId)
    expect(caught.find((x) => x.projectId === p.id)).toMatchObject({ state: 'caught_up' })
    expect((await git(local, ['show', `${b2}:news.md`])).stdout).toBe('news')
    await db.update(project).set({ status: 'superseded' }).where(eq(project.id, p.id))
  })

  it('merges main into a running project\'s branch when a teammate merges, and reports a conflict instead of resolving it', async () => {
    const { project: p } = await createProject({ appId, title: 'saved carts', tasks: [{ title: 'Saved carts' }] })
    await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    await git(local, ['branch', p.integrationBranch!, 'origin/main'])

    await writeFile(join(teammate, 'discounts.ts'), 'export const codes = []\n'); await commitAll(teammate, 'discounts'); await git(teammate, ['push', '-q', 'origin', 'main'])
    let out = await catchUpApp(appId)
    expect(out.find((x) => x.projectId === p.id)).toMatchObject({ state: 'caught_up', commits: 1 })
    expect((await git(local, ['show', `${p.integrationBranch}:discounts.ts`])).stdout).toBe('export const codes = []')
    expect((await catchUpApp(appId)).find((x) => x.projectId === p.id)?.state).toBe('current')

    // Our branch and the teammate both change the README: the engine says so and leaves the branch alone.
    await git(local, ['worktree', 'add', '-q', join(local, '..', 'wt'), p.integrationBranch!])
    await writeFile(join(local, '..', 'wt', 'README.md'), 'ours\n'); await commitAll(join(local, '..', 'wt'), 'ours')
    await git(local, ['worktree', 'remove', '--force', join(local, '..', 'wt')])
    const before = (await git(local, ['rev-parse', p.integrationBranch!])).stdout
    await writeFile(join(teammate, 'README.md'), 'theirs\n'); await commitAll(teammate, 'theirs'); await git(teammate, ['push', '-q', 'origin', 'main'])
    out = await catchUpApp(appId)
    expect(out.find((x) => x.projectId === p.id)).toMatchObject({ state: 'conflict' })
    expect((await git(local, ['rev-parse', p.integrationBranch!])).stdout).toBe(before)
    expect((await now(appId)).needsYou.find((n) => n.kind === 'behind_main')).toMatchObject({ projectId: p.id, files: 'README.md' })
    expect((await db.select().from(event).where(and(eq(event.projectId, p.id), eq(event.type, 'project.behind_main')))).length).toBe(1)
  })
})
