/**
 * The pull request's finalizing, end to end on a made-up app: accepting the smoke test is what it follows; it finds
 * the breaks no test catches and drafts the evidence; nothing reaches GitHub until the person's press; "Fix this"
 * sends a sub-task and the results update when it lands; and a description edited on GitHub is read back.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, issue, pr as prTable, project, repo, workspace } from './db/schema.js'
import type { Execute } from './executor.js'
import { acceptSurvivor, finalizeView, FINALIZE_FIX_TITLE, fixThis, pushReady, runFinalize, type Deps } from './finalize.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { setPrMessage } from './pr-view.js'
import { createProject } from './projects.js'
import { Runner } from './runner.js'
import { acceptSmoke } from './smoke.js'
import { approveBriefs } from './test-briefs.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => Promise<boolean>, timeoutMs = 60_000) { const t0 = Date.now(); while (!(await check())) { if (Date.now() - t0 > timeoutMs) throw new Error('timed out'); await sleep(150) } }

const OFF_THE_LIMIT = "const f = require('./limit.js'); if (f(5) !== true || f(1) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n"
const ON_THE_LIMIT = "const f = require('./limit.js'); if (f(3) !== true || f(2) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n"

describe.skipIf(!reachable)('the pull request finalizes, and the person decides (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let repoPath: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-finalize-'))
    repoPath = join(dir, 'repo')
    await git(dir, ['init', '-q', '-b', 'main', 'repo']); await git(dir, ['init', '-q', '--bare', 'remote.git'])
    await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
    await writeFile(join(repoPath, 'README.md'), 'hi\n'); await commitAll(repoPath, 'init')
    await git(repoPath, ['remote', 'add', 'origin', join(dir, 'remote.git')]); await git(repoPath, ['push', '-q', 'origin', 'main'])
    await db.insert(workspace).values({ id: wsId, name: 'finalize test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Limits (sample)', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'node limit.test.js', mutation: { test_cmd: 'node {files}' } } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'sample-org/sample-limits', localPath: repoPath })
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  it('finds what no test catches, sends nothing until the press, and updates when a fix lands', async () => {
    const { project: p, issues } = await createProject({ appId, name: 'Limits (sample)', issues: [{ title: 'A limit of three (sample)', subIssues: [{ key: 'a', title: 'The limit', files: ['limit.js'] }] }] })
    const taskId = issues[0].id
    await approveBriefs(p.id)
    const execute: Execute = async (i) => {
      if (i.subIssue.title.startsWith(FINALIZE_FIX_TITLE)) await writeFile(join(i.worktreePath, 'limit.test.js'), ON_THE_LIMIT)
      else if (i.subIssue.title === 'The limit') { await writeFile(join(i.worktreePath, 'limit.js'), 'module.exports = (n) => n >= 3\n'); await writeFile(join(i.worktreePath, 'limit.test.js'), OFF_THE_LIMIT) }
      else return { status: 'completed', summary: 'Nothing to change.', costUsd: 0 } // a check or a probe: it only looks
      await commitAll(i.worktreePath, `build ${i.subIssue.identifier}`)
      return { status: 'completed', summary: 'done', costUsd: 0 }
    }
    // GitHub, stood in for: what was last sent is what it has, until a test edits it there.
    const github = { title: '', body: '', draft: true, sends: 0 }
    const runner = new Runner({ execute, sessionsMax: 2, openPr: async (i) => { github.title = i.title; github.body = i.body; github.sends++; return { number: 7, url: 'https://github.test/sample-org/sample-limits/pull/7', created: github.sends === 1 } }, readThere: async () => github.body })
    const gh: Deps['gh'] = async (args) => {
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ number: 7, url: 'https://github.test/sample-org/sample-limits/pull/7', state: 'OPEN', isDraft: github.draft, title: github.title, body: github.body, statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS' }], comments: [], reviews: [] })
      if (args[0] === 'pr' && args[1] === 'ready') { github.draft = false; return '' }
      return '[]'
    }
    const deps: Deps = { ...runner.finalizeDeps(), gh }
    await runner.startProject(p.id)
    // Built, checked and tested: the engine opens its draft, as it did before any of this.
    await until(async () => (await db.select().from(prTable).where(eq(prTable.projectId, p.id))).length === 1)
    const draftSends = github.sends
    expect(github.body).not.toMatch(/Evidence/)

    // Nothing has run: the press is not there to make.
    const before = await finalizeView(taskId, deps)
    expect(before).toMatchObject({ state: 'none', canPush: false, press: 'ready' })
    expect(before.pushWaits.join(' ')).toMatch(/has not run/)
    await expect(pushReady(taskId, deps)).rejects.toThrow(/cannot be sent yet/)

    await setPrMessage(taskId, '## What changed and why\nA limit of three.\n\n## Test plan\nRun the test.')
    await acceptSmoke(taskId, 'user')
    await runFinalize(taskId, deps)
    const v = await finalizeView(taskId, deps)
    expect(v.state).toBe('done')
    expect(v.stale).toBe(false)
    expect(Object.fromEntries(v.steps.map((s) => [s.key, s.state]))).toEqual({ trajectory: 'skipped', mutation: 'fail', review: 'skipped', gate: 'pass', evidence: 'pass' })
    // Both breaks around the limit get past a test that never sits on it.
    expect(v.mutation).toMatchObject({ caught: 0, meaningful: 2, percent: 0 })
    expect(v.mutation!.survivors.map((s) => `${s.file}:${s.line} ${s.from}>${s.to}`)).toEqual(['limit.js:1 >=>>', 'limit.js:1 3>4'])
    expect(v.evidence).toMatch(/of 2 meaningful breaks made to the lines this pull request changed, the tests catch 0 \(0%\)/)
    expect(v.gate.map((c) => [c.key, c.state])).toEqual([['github', 'pass'], ['commands', 'pass'], ['title', 'pass'], ['description', 'pass'], ['rollback', 'none'], ['smoke', 'pass']])
    // Nothing reached GitHub by any of it.
    expect(github.sends).toBe(draftSends)
    expect(github.body).not.toMatch(/Evidence/)
    expect(v).toMatchObject({ canPush: true, sent: null })

    // The person leaves one as it is, with why: it goes into the evidence.
    const number = v.mutation!.survivors[1]
    await expect(acceptSurvivor(taskId, number.id, {}, deps)).rejects.toThrow(/say why/)
    const left = await acceptSurvivor(taskId, number.id, { reason: 'Four is checked by the importer (sample).' }, deps)
    expect(left.evidence).toMatch(/Left as it is: Four is checked by the importer \(sample\)\./)
    await acceptSurvivor(taskId, number.id, { undo: true }, deps)

    // "Fix this": a sub-task goes after the other, and when it lands the finalizing runs again by itself.
    const fixing = await fixThis(taskId, { kind: 'survivor', id: v.mutation!.survivors[0].id }, deps)
    expect(fixing.mutation!.survivors[0].fix).toMatchObject({ title: `${FINALIZE_FIX_TITLE}: a test for limit.js:1`, landed: false })
    await expect(fixThis(taskId, { kind: 'survivor', id: v.mutation!.survivors[0].id }, deps)).rejects.toThrow(/already on its way/)
    const [sub] = await db.select().from(issue).where(and(eq(issue.parentId, taskId), eq(issue.title, `${FINALIZE_FIX_TITLE}: a test for limit.js:1`)))
    expect(sub.brief ?? '').toMatch(/`>=` became `>`[\s\S]*fails with the break in and passes without it/)
    await until(async () => { const now = await finalizeView(taskId, deps); return now.state === 'done' && now.sha !== v.sha && !now.stale })
    const after = await finalizeView(taskId, deps)
    expect(after.mutation).toMatchObject({ caught: 2, survivors: [], percent: 100 })
    expect(after.steps.find((s) => s.key === 'mutation')).toMatchObject({ state: 'pass' })
    expect(github.body).not.toMatch(/Evidence/) // the fix was pushed with its branch, and still no evidence went with it

    // The press: the evidence goes with the description, and the draft is marked ready.
    const sent = await pushReady(taskId, deps)
    expect(sent).toMatchObject({ number: 7, ready: true, status: 'open' })
    expect(github.draft).toBe(false)
    expect(github.body).toMatch(/## Test plan\nRun the test\.\n\n## Evidence\n\n<!-- evident:evidence -->[\s\S]*the tests catch 2 \(100%\)[\s\S]*<!-- \/evident:evidence -->[\s\S]*## Fine print/)
    const ready = await finalizeView(taskId, deps)
    expect(ready).toMatchObject({ press: 'update', sent: { same: true } })
    const types = (await db.select().from(event).where(eq(event.issueId, taskId))).map((e) => e.type)
    expect(types).toEqual(expect.arrayContaining(['finalize.started', 'finalize.step', 'finalize.done', 'finalize.fix', 'finalize.sent', 'pr.sent', 'pr.ready']))

    // Edited on GitHub only: read back before the next update, and sent as they have it.
    github.body = github.body.replace('A limit of three.', 'A limit of three, as agreed with the team.')
    await runner.refreshPr(p.id, taskId)
    expect((await db.select().from(issue).where(eq(issue.id, taskId)))[0].prBody).toBe('## What changed and why\nA limit of three, as agreed with the team.\n\n## Test plan\nRun the test.')
    expect(github.body).toMatch(/as agreed with the team/)
    // Edited there and here: the press must say which stands; an update nobody pressed for leaves GitHub's words alone.
    github.body = github.body.replace('Run the test.', 'Run the test twice.')
    await setPrMessage(taskId, '## What changed and why\nA limit of three, rewritten here.\n\n## Test plan\nRun the test.')
    await expect(runner.refreshPr(p.id, taskId)).rejects.toThrow(/edited on GitHub since it was last sent from here, and it was edited here too/)
    await (runner as unknown as { updatePr: (p: string, i: string) => Promise<void> }).updatePr(p.id, taskId)
    expect(github.body).toMatch(/Run the test twice\./)
    await runner.refreshPr(p.id, taskId, { theirs: 'replace' })
    expect(github.body).toMatch(/rewritten here/)
    expect(github.body).not.toMatch(/twice/)
  }, 120_000)
})
