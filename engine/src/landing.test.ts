/** Landing against a throwaway git repo: merge → test → fast-forward, and the ways it refuses. */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addWorktree, commitAll, ensureBranch, git, headSha } from './git.js'
import { failingLines, wholeRun, land } from './landing.js'

async function repoWithPlan() {
  const dir = await mkdtemp(join(tmpdir(), 'if-land-'))
  const repoPath = join(dir, 'repo')
  await git(dir, ['init', '-q', '-b', 'main', 'repo'])
  await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
  await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
  await ensureBranch(repoPath, 'project/p1', 'main')
  const wt = join(dir, 'wt-1')
  await addWorktree(repoPath, wt, 'task/p1/1', 'project/p1')
  await git(wt, ['config', 'user.email', 't@example.com']); await git(wt, ['config', 'user.name', 'test'])
  return { repoPath, wt }
}
const events: string[] = []
const onEvent = async (type: string) => { events.push(type) }

describe('land', () => {
  it('merges, tests and fast-forwards the integration branch to the task', async () => {
    const { repoPath, wt } = await repoWithPlan()
    await writeFile(join(wt, 'b.txt'), 'two\n'); await commitAll(wt, 'task 1')
    const r = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', testCmd: 'test -f b.txt', onEvent })
    expect(r.ok).toBe(true)
    expect(await headSha(repoPath, 'project/p1')).toBe(await headSha(wt))
    expect(events).toContain('land.tested'); expect(events).toContain('land.landed')
  })

  it('commits what the agent left uncommitted, and refuses when the tests fail', async () => {
    const { repoPath, wt } = await repoWithPlan()
    await writeFile(join(wt, 'b.txt'), 'two\n')
    const before = await headSha(repoPath, 'project/p1')
    const r = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', testCmd: 'exit 3', onEvent })
    expect(r).toMatchObject({ ok: false, stage: 'test' })
    expect(await headSha(repoPath, 'project/p1')).toBe(before)
    expect(events).toContain('land.committed')
  })

  it('merges in what landed before it, and reports a conflict instead of guessing', async () => {
    const { repoPath, wt } = await repoWithPlan()
    // another task landed on the integration branch meanwhile, touching a.txt
    const wt2 = join(repoPath, '..', 'wt-2')
    await addWorktree(repoPath, wt2, 'task/p1/2', 'project/p1')
    await git(wt2, ['config', 'user.email', 't@example.com']); await git(wt2, ['config', 'user.name', 'test'])
    await writeFile(join(wt2, 'a.txt'), 'two from task 2\n'); await commitAll(wt2, 'task 2')
    expect((await land({ repoPath, worktreePath: wt2, integrationBranch: 'project/p1', onEvent })).ok).toBe(true)
    // task 1 touched a different file: merges cleanly and lands on top
    await writeFile(join(wt, 'c.txt'), 'three\n'); await commitAll(wt, 'task 1')
    const ok = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', onEvent })
    expect(ok.ok).toBe(true)
    expect((await git(repoPath, ['show', 'project/p1:a.txt'])).stdout).toBe('two from task 2')
    // a third task that edited the same line as task 2 conflicts and is refused
    const wt3 = join(repoPath, '..', 'wt-3')
    await addWorktree(repoPath, wt3, 'task/p1/3', await headSha(repoPath, 'main'))
    await git(wt3, ['config', 'user.email', 't@example.com']); await git(wt3, ['config', 'user.name', 'test'])
    await writeFile(join(wt3, 'a.txt'), 'two from task 3\n'); await commitAll(wt3, 'task 3')
    const bad = await land({ repoPath, worktreePath: wt3, integrationBranch: 'project/p1', onEvent })
    expect(bad).toMatchObject({ ok: false, stage: 'merge' })
    expect((bad as any).detail).toContain('a.txt')
  })
})

describe('the whole test run, once per task', () => {
  const seen: { type: string; payload: Record<string, unknown> }[] = []
  const on = async (type: string, payload: Record<string, unknown>) => { seen.push({ type, payload }) }
  it('passes at once, or on the second go as flaky; fails only when it fails twice, with the failing lines kept', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'whole-'))
    expect(await wholeRun({ testCmd: 'true', cwd: dir, onEvent: on })).toEqual({ ok: true, flaky: false })
    // fails the first time, passes the second: a test that fails now and then
    expect(await wholeRun({ testCmd: 'if [ -f seen ]; then exit 0; else touch seen; echo " FAIL  stories/Cart.stories.tsx > Empty"; exit 1; fi', cwd: dir, onEvent: on })).toEqual({ ok: true, flaky: true })
    expect(seen.map((e) => e.type)).toEqual(['task.tested', 'task.test_again', 'task.tested'])
    const long = Array.from({ length: 400 }, (_, i) => ` ✓ passing test number ${i} with a long enough name to push the failure out of the tail`).join('\\n')
    const bad = await wholeRun({ testCmd: `echo " FAIL  server/test_pay.py::test_refund"; printf "${long}\\n"; exit 2`, cwd: dir, onEvent: on })
    expect(bad).toMatchObject({ ok: false, code: 2 })
    expect((bad as { detail: string }).detail).toContain('FAIL  server/test_pay.py::test_refund') // far above the end of the output, and still kept
  })
  it('picks the lines that say what failed, once each, and not "0 failed"', () => {
    expect(failingLines(['ok 1', ' FAIL  a.test.ts > x', ' FAIL  a.test.ts > x', 'Tests  3 passed, 0 failed', 'AssertionError: expected 1 to be 2', 'error TS2322: nope'].join('\n'))).toEqual([' FAIL  a.test.ts > x', 'AssertionError: expected 1 to be 2', 'error TS2322: nope'])
  })
})
