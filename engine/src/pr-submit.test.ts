/**
 * A pull request is never opened by the engine on its own: nothing is pushed while the build runs, and the person
 * submits it once every sub-task has landed. Its title follows the app's convention; it opens as a draft.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, pr as prTable, project, repo, workspace } from './db/schema.js'
import type { Execute } from './executor.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { prBody, prDraft, prTitle, setPrRules , prAuto } from './pr.js'
import { createProject, projectGraph } from './projects.js'
import { Runner } from './runner.js'
import { approveBriefs } from './test-briefs.js'

describe('how a pull request is titled and opened', () => {
  it('is a draft unless the app says otherwise', () => { expect(prDraft(null)).toBe(true); expect(prDraft({})).toBe(true); expect(prDraft({ pr_draft: false })).toBe(false) })
  it('takes its title from the app\'s template, by the team\'s ticket id when there is one; a task\'s exact title wins', () => {
    const v = { ticket: 'SHOP-12', id: 'SH-3', title: 'Export orders (sample)', project: 'Orders', n: 1, of: 2 }
    expect(prTitle({ pr_title: 'feat[{ticket}]: {title}' }, v)).toBe('feat[SHOP-12]: Export orders (sample)')
    expect(prTitle({ pr_title: '{id} {title} ({n} of {of}, {project})' }, { ...v, ticket: null })).toBe('SH-3 Export orders (sample) (1 of 2, Orders)')
    expect(prTitle({ pr_title: '[{ticket}] {title}' }, { ...v, ticket: null })).toBe('[SH-3] Export orders (sample)') // no ticket of theirs: ours
    expect(prTitle({ pr_title: 'feat[{ticket}]: {title}' }, v, 'fix(T12)[SHOP-12]: orders export (sample)')).toBe('fix(T12)[SHOP-12]: orders export (sample)')
    expect(prTitle({}, v)).toBeNull() // no template: the engine's own title
  })
  it('says in its text how many sub-tasks have landed, and that it is not ready while some have not', () => {
    const p = { id: 'proj_x', name: 'Orders (sample)' }
    expect(prBody(p, [{ identifier: 'SH-4', title: 'A' }], [{ identifier: 'SH-5', title: 'B' }, { identifier: 'SH-6', title: 'C' }])).toContain('**1 of 3 sub-tasks have landed: this pull request is still being built, and is not ready to review until they all have.**')
    expect(prBody(p, [{ identifier: 'SH-4', title: 'A' }, { identifier: 'SH-5', title: 'B' }], [])).toContain('**2 of 2 sub-tasks have landed.**')
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => Promise<boolean>, timeoutMs = 20_000) { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > timeoutMs) throw new Error('timed out'); await sleep(100) } }

describe.skipIf(!reachable)('a pull request waits for the person (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let repoPath: string, remote: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-pr-submit-'))
    repoPath = join(dir, 'repo'); remote = join(dir, 'remote.git')
    await git(dir, ['init', '-q', '-b', 'main', 'repo']); await git(dir, ['init', '-q', '--bare', 'remote.git'])
    await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
    await writeFile(join(repoPath, 'README.md'), 'hi\n'); await commitAll(repoPath, 'init')
    await git(repoPath, ['remote', 'add', 'origin', remote]); await git(repoPath, ['push', '-q', 'origin', 'main'])
    await db.insert(workspace).values({ id: wsId, name: 'pr submit test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md', pr_mode: 'project', pr_auto: false } }) // the press: an app that has switched the automatic draft off
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'sample-org/sample-shop', localPath: repoPath }) // on GitHub by name: the pull request step is live
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  it('pushes nothing and opens nothing while sub-tasks land, however many; submitting is refused until all have', async () => {
    const { project: p, subIssues } = await createProject({ appId, name: 'Orders (sample)', issues: [{ title: 'Export (sample)', subIssues: [{ key: 'a', title: 'A', files: ['a.txt'] }, { key: 'b', title: 'B', files: ['b.txt'], dependsOn: ['a'] }] }] })
    await approveBriefs(p.id)
    let hold = true
    const execute: Execute = async (i) => {
      if (i.subIssue.id === subIssues[1].id) while (hold) await sleep(50)
      await writeFile(join(i.worktreePath, `${i.subIssue.identifier}.txt`), 'x\n'); await commitAll(i.worktreePath, `build ${i.subIssue.identifier}`)
      return { status: 'completed', summary: 'done', costUsd: 0 }
    }
    const runner = new Runner({ execute, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues[0].status === 'done')
    await sleep(400) // long enough for a pull request step to have run, had there been one
    const types = async () => (await db.select().from(event).where(eq(event.projectId, p.id))).map((e) => e.type)
    expect((await types()).filter((t) => t.startsWith('pr.'))).toEqual([]) // not opened, not tried, no error from trying
    expect(await db.select().from(prTable).where(eq(prTable.projectId, p.id))).toEqual([])
    expect((await git(remote, ['branch', '--list'])).stdout.split('\n').map((l) => l.replace(/^[* ]+/, '')).filter(Boolean)).toEqual(['main']) // the project's branch never left this computer
    await expect(runner.submitPr(p.id)).rejects.toThrow(/1 sub-task has still to land .*the pull request is submitted once they all have/)
    hold = false
    await until(async () => (await projectGraph(p.id))!.subIssues.every((x) => x.status === 'done'))
    await sleep(400)
    expect((await types()).filter((t) => t.startsWith('pr.'))).toEqual([]) // all landed: still the person's to submit
    expect((await git(remote, ['branch', '--list'])).stdout).not.toContain('project/')
  })

  it('by default the engine opens it itself, as a draft, once the task is built and checked; not before, and never one the person closed', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'Auto (sample)', key: own.slice(-6).toUpperCase(), setup: { pr_mode: 'project', pr_draft: false } }) // says "ready for review" for its own submits; an automatic one is a draft all the same
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: 'sample-org/sample-auto', localPath: repoPath })
    expect(prAuto({})).toBe(true); expect(prAuto(null)).toBe(true); expect(prAuto({ pr_auto: false })).toBe(false)
    const { project: p, subIssues } = await createProject({ appId: own, name: 'Auto (sample)', issues: [{ title: 'Export (sample)', subIssues: [{ key: 'a', title: 'A', files: ['a3.txt'] }, { key: 'b', title: 'B', files: ['b3.txt'], dependsOn: ['a'] }] }] })
    await approveBriefs(p.id)
    let hold = true
    const execute: Execute = async (i) => {
      if (i.subIssue.id === subIssues[1].id) while (hold) await sleep(50)
      await writeFile(join(i.worktreePath, `${i.subIssue.identifier}.txt`), 'x\n'); await commitAll(i.worktreePath, `build ${i.subIssue.identifier}`)
      return { status: 'completed', summary: 'done', costUsd: 0 }
    }
    const opened: { draft?: boolean; reopen?: boolean; title: string }[] = []
    const runner = new Runner({ execute, sessionsMax: 2, openPr: async (i) => { opened.push({ draft: i.draft, reopen: i.reopen, title: i.title }); return { number: 41, url: 'https://github.test/sample-org/sample-auto/pull/41', created: opened.length === 1 } } })
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues[0].status === 'done')
    await sleep(300)
    expect(opened).toEqual([]) // one of two has landed: nothing is opened on half a build
    hold = false
    await until(async () => opened.length === 1 && (await db.select().from(prTable).where(eq(prTable.projectId, p.id))).length === 1)
    expect(opened[0]).toMatchObject({ draft: true, reopen: false })
    const [row] = await db.select().from(prTable).where(eq(prTable.projectId, p.id))
    expect(row).toMatchObject({ number: 41, status: 'draft' })
    const said = async () => (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type === 'pr.submitted')
    await until(async () => (await said()).length === 1)
    const submitted = await said()
    expect(submitted.map((e) => [e.actor, (e.payload as { auto?: boolean; draft?: boolean }).auto, (e.payload as { draft?: boolean }).draft])).toEqual([['engine', true, true]])
    // One the person closed stays closed: the engine does not open it again by itself.
    await db.update(prTable).set({ status: 'closed' }).where(eq(prTable.id, row.id))
    await (runner as unknown as { updatePr: (p: string, i: string | undefined, s: 'auto') => Promise<void> }).updatePr(p.id, undefined, 'auto')
    expect(opened).toHaveLength(1)
  })

  it('keeps the app\'s rules for its pull requests', async () => {
    expect(await setPrRules(appId, { titleTemplate: 'feat[{ticket}]: {title}' })).toEqual({ pr_title: 'feat[{ticket}]: {title}', pr_draft: true, branch_name: null, commit_format: null })
    expect(await setPrRules(appId, { titleTemplate: '', draft: false })).toEqual({ pr_title: null, pr_draft: false, branch_name: null, commit_format: null })
    expect(await setPrRules(appId, { branchTemplate: 'feature/{ticket}-{title}', commitFormat: '{type}({ticket}): {subject}' })).toMatchObject({ branch_name: 'feature/{ticket}-{title}', commit_format: '{type}({ticket}): {subject}' })
    expect(await setPrRules(appId, { branchTemplate: '', commitFormat: '' })).toMatchObject({ branch_name: null, commit_format: null })
  })
})
