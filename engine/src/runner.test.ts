/**
 * The runner with a fake executor against a throwaway git repo and the test database: parallel under the cap,
 * dependents after their parents land, issue order, two projects at once, retries with the reason, recovery after a
 * restart, steps from the builder, cleanup. The fake executor writes a file and commits, like an agent would.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, build, event, project, repo, run, step, workspace } from './db/schema.js'
import type { Execute } from './executor.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { createProject, projectGraph } from './projects.js'
import { Runner } from './runner.js'
import { addItems, dropItem, promote } from './backlog.js'
import type { Propose } from './planner.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => Promise<boolean>, timeoutMs = 20_000) {
  const t0 = Date.now()
  while (!(await check())) { if (Date.now() - t0 > timeoutMs) throw new Error('timed out'); await sleep(100) }
}
const cleaned = (projectId: string) => async () => (await db.select().from(event).where(eq(event.projectId, projectId))).some((e) => e.type === 'project.cleaned')

describe.skipIf(!reachable)('runner', () => {
  const wsId = newId('workspace')
  let appId: string, repoPath: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-runner-'))
    repoPath = join(dir, 'repo')
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
    await writeFile(join(repoPath, 'README.md'), 'hi\n'); await commitAll(repoPath, 'init')
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'runner test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath }) // no fullName: no PR step
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  const commits = (tag: string): Execute => async (i) => {
    await sleep(150)
    await writeFile(join(i.worktreePath, `${tag}-${i.subIssue.identifier}.txt`), 'x\n')
    await commitAll(i.worktreePath, `build ${i.subIssue.identifier}`)
    return { status: 'completed', summary: `did ${i.subIssue.title}`, costUsd: 0 }
  }
  const one = (title: string, subIssues: { key: string; title: string; files?: string[]; dependsOn?: string[] }[]) => ({ title, subIssues })

  it('runs independent phases in parallel under the cap, dependents only after their parents land, then cleans up', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'parallel', issues: [one('T', [
      { key: 'a', title: 'A', files: ['a.txt'] }, { key: 'b', title: 'B', files: ['b.txt'] }, { key: 'c', title: 'C', files: ['c.txt'] },
      { key: 'd', title: 'D', dependsOn: ['a', 'b', 'c'], files: ['d.txt'] },
    ])] })
    const parents = phases.slice(0, 3).map((x) => x.id)
    let live = 0, maxLive = 0, parentsWhenDStarted: string[] = []
    const execute: Execute = async (i) => {
      live++; maxLive = Math.max(maxLive, live)
      if (i.subIssue.title === 'D') parentsWhenDStarted = (await db.select().from(build).where(inArray(build.issueId, parents))).map((x) => x.status)
      try { return await commits('f')(i) } finally { live-- }
    }
    const runner = new Runner({ execute, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    expect(maxLive).toBe(2)
    expect(parentsWhenDStarted).toEqual(['done', 'done', 'done'])
    const g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => x.status)).toEqual(['done', 'done', 'done', 'done'])
    for (const x of g.subIssues) expect((await git(repoPath, ['show', `${p.integrationBranch}:f-${x.identifier}.txt`])).stdout).toBe('x')
    const held = (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type === 'build.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => r === 'at the session cap')).toBe(true)
    expect(held.some((r) => r.startsWith('waiting on'))).toBe(true)
    expect((await git(repoPath, ['worktree', 'list', '--porcelain'])).stdout.split('\n').filter((l) => l.includes('-worktrees/'))).toEqual([])
    expect(g.subIssues.every((x) => x.worktreePath === null)).toBe(true)
  })

  it('issue order is a dependency: a later issue\'s sub-issues start only after the earlier issue\'s land', async () => {
    const { project: p } = await createProject({ appId, name: 'ordered', issues: [
      one('first', [{ key: 'a', title: 'A', files: ['oa.txt'] }, { key: 'b', title: 'B', files: ['ob.txt'] }]),
      one('second', [{ key: 'c', title: 'C', files: ['oc.txt'] }]),
    ] })
    const order: string[] = []; let firstDoneWhenCStarted = false
    const runner = new Runner({ execute: async (i) => {
      order.push(i.subIssue.title)
      if (i.subIssue.title === 'C') firstDoneWhenCStarted = (await projectGraph(p.id))!.subIssues.filter((x) => x.title !== 'C').every((x) => x.status === 'done')
      return commits('o')(i)
    }, sessionsMax: 4 })
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    expect(order.indexOf('C')).toBe(2)
    expect(firstDoneWhenCStarted).toBe(true)
    const held = (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type === 'build.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => /earlier in the project/.test(r))).toBe(true)
  })

  it('builds sub-issues from different projects at once, but never two that share a file, and lands both projects', async () => {
    const A = await createProject({ appId, name: 'project A', issues: [one('T', [{ key: 'a1', title: 'A1', files: ['shared.txt'] }, { key: 'a2', title: 'A2', files: ['only-a.txt'] }])] })
    const B = await createProject({ appId, name: 'project B', issues: [one('T', [{ key: 'b1', title: 'B1', files: ['shared.txt'] }, { key: 'b2', title: 'B2', files: ['only-b.txt'] }])] })
    const live = new Set<string>(); const overlapsOnShared: string[][] = []; let maxLive = 0
    const execute: Execute = async (i) => {
      live.add(i.subIssue.title); maxLive = Math.max(maxLive, live.size)
      if (i.files.includes('shared.txt')) overlapsOnShared.push([...live].filter((x) => ['A1', 'B1'].includes(x)))
      try { return await commits('x')(i) } finally { live.delete(i.subIssue.title) }
    }
    const runner = new Runner({ execute, sessionsMax: 4 })
    await runner.startProject(A.project.id); await runner.startProject(B.project.id)
    await until(async () => (await cleaned(A.project.id)()) && (await cleaned(B.project.id)()))
    expect(maxLive).toBeGreaterThanOrEqual(2)
    for (const snapshot of overlapsOnShared) expect(snapshot.length).toBe(1)
    const held = (await db.select().from(event).where(inArray(event.projectId, [A.project.id, B.project.id]))).filter((e) => e.type === 'build.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => /waiting on [A-Z0-9]+-\d+ \(.+\) \(another project\)/.test(r))).toBe(true)
  })

  it('retries a failed run with the reason, and gives up after max attempts', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'retries', issues: [one('T', [{ key: 'x', title: 'X', files: ['x.txt'] }])] })
    const reasons: (string | undefined)[] = []
    const runner = new Runner({ execute: async (i) => { reasons.push(i.previousFailure); return { status: 'failed', error: 'boom' } }, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues[0].status === 'failed')
    expect((await projectGraph(p.id))!.subIssues[0].attempt).toBe(3)
    expect(reasons[0]).toBeUndefined(); expect(reasons[1]).toContain('boom'); expect(reasons[2]).toContain('boom')
    const types = (await db.select().from(event).where(eq(event.issueId, phases[0].id))).map((e) => e.type)
    expect(types.filter((x) => x === 'build.retry')).toHaveLength(2)
    expect(types.filter((x) => x === 'build.failed')).toHaveLength(1)
  })

  it('a person retries a failed sub-issue: three more attempts, told why it failed, then it lands', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'retry by hand', issues: [one('T', [{ key: 'r', title: 'R', files: ['r.txt'] }])] })
    let fail = true
    const told: (string | undefined)[] = []
    const runner = new Runner({ execute: async (i) => { told.push(i.previousFailure); return fail ? { status: 'failed', error: 'flaky' } : commits('r')(i) }, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues[0].status === 'failed')
    fail = false
    await expect(runner.retry(phases[0].id)).resolves.toMatchObject({ fresh: false })
    await until(cleaned(p.id))
    const after = (await projectGraph(p.id))!
    expect(after.subIssues[0]).toMatchObject({ status: 'done', attempt: 4, maxAttempts: 6 })
    expect(told.at(-1)).toContain('flaky')
    await expect(runner.retry(phases[0].id)).rejects.toThrow(/only a failed or cancelled/)
  })

  it('losing the model is not a failure: the attempt is given back, the engine holds, and the sub-issue resumes', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'outage', issues: [one('T', [{ key: 'o', title: 'O', files: ['o.txt'] }])] })
    let calls = 0
    const runner = new Runner({ execute: async (i) => (++calls === 1 ? { status: 'failed', error: 'API Error: 529 overloaded_error' } : commits('o')(i)), sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(async () => !!runner.hold)
    const held = (await projectGraph(p.id))!.subIssues[0]
    expect(held).toMatchObject({ status: 'queued', attempt: 0 })
    expect(held.heldReason).toContain('waiting for the model')
    await runner.releaseHold()
    await until(cleaned(p.id))
    expect((await projectGraph(p.id))!.subIssues[0]).toMatchObject({ status: 'done', attempt: 1 })
    const types = (await db.select().from(event).where(eq(event.issueId, phases[0].id))).map((e) => e.type)
    expect(types).toContain('engine.hold'); expect(types).not.toContain('build.retry'); expect(types).not.toContain('build.failed')
  })

  it('pause stops running agents without failing them; resume picks them up from their session', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'pause', issues: [one('T', [{ key: 'q', title: 'Q', files: ['q.txt'] }])] })
    const resumedWith: (string | undefined)[] = []
    let first = true
    const runner = new Runner({ execute: async (i) => {
      resumedWith.push(i.resumeSessionId)
      if (first) { first = false; await new Promise<void>((r) => i.abort?.signal.addEventListener('abort', () => r())); return { status: 'failed', error: 'aborted', agentSessionId: 'sess-pause' } }
      return commits('q')(i)
    }, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues[0].status === 'running')
    await db.update(run).set({ agentSessionId: 'sess-pause' }).where(eq(run.issueId, phases[0].id))
    await runner.pauseProject(p.id)
    await until(async () => (await db.select().from(run).where(eq(run.issueId, phases[0].id)))[0].status === 'interrupted')
    expect((await projectGraph(p.id))!).toMatchObject({ project: { status: 'paused' } })
    expect((await projectGraph(p.id))!.subIssues[0]).toMatchObject({ status: 'queued', attempt: 1 })
    await runner.resumeProject(p.id)
    await until(cleaned(p.id))
    expect((await projectGraph(p.id))!.subIssues[0].status).toBe('done')
    expect(resumedWith).toEqual([undefined, 'sess-pause'])
  })

  it('runs issue by issue: the next issue is planned when the earlier ones land, and the project lands only when every issue has', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'task by task', issues: [
      one('First', [{ key: 'f', title: 'F', files: ['f.txt'] }]),
      { title: 'Second', brief: 'planned after the first lands' },
    ] })
    const plannedAfter: string[] = []
    const propose: Propose = async (i) => {
      plannedAfter.push((await projectGraph(p.id))!.subIssues.map((x) => x.status).join(','))
      return { status: 'completed', costUsd: 0, proposal: {
        phases: [{ key: 's', title: 'S', description: 'second', summary: 's', depends_on: [], files: ['s.txt'], steps: [], checks: [], done_when: '' }],
        decisions: [], questions: [], notes: '' } }
    }
    const runner = new Runner({ execute: commits('tbt'), sessionsMax: 2, propose })
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    const g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('landed')
    expect(g.subIssues.map((x) => [g.issues.find((t) => t.id === x.parentId)!.title, x.status])).toEqual([['First', 'done'], ['Second', 'done']])
    expect(plannedAfter).toEqual(['done']) // the second issue was planned once, after the first had landed
    expect(tasks).toHaveLength(2)
  })

  it('a project with issues left in its backlog waits instead of landing; a builder\'s Later: lines join the backlog', async () => {
    const { project: p } = await createProject({ appId, name: 'backlog gate', issues: [one('T', [{ key: 'b', title: 'B', files: ['b.txt'] }])] })
    const [kept] = await addItems(p.id, [{ text: 'Refunds' }])
    const runner = new Runner({ execute: async (i) => ({ ...(await commits('bg')(i)), summary: 'did B\n\nLater:\n- The header link 404s' }), sessionsMax: 2 })
    await runner.startProject(p.id)
    const waiting = async () => (await db.select().from(event).where(eq(event.projectId, p.id))).some((e) => e.type === 'project.backlog_open')
    await until(waiting)
    let g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('running')
    expect(g.backlog.map((b) => [b.title, b.source, b.state])).toEqual([['Refunds', 'person', 'backlog'], ['The header link 404s', 'builder', 'backlog']])
    await dropItem(kept.id, 'not in this project')
    await promote(g.backlog[1].id) // taken on: planned and built before the project lands
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'h', title: 'H', description: 'h', summary: 'h', depends_on: [], files: ['h.txt'], steps: [], checks: [], done_when: '' }], decisions: [], questions: [], notes: '' } })
    const again = new Runner({ execute: commits('bg2'), sessionsMax: 2, propose })
    await again.dispatch()
    await until(cleaned(p.id))
    g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('landed')
    expect(g.issues.map((t) => t.title)).toEqual(['T', 'The header link 404s'])
    expect(g.subIssues.map((x) => x.status)).toEqual(['done', 'done'])
  })

  it('stacked PRs (pr_mode issue): each issue lands on its own branch, named for Linear, cut from the issue before it', async () => {
    const stackApp = newId('app')
    await db.insert(app).values({ id: stackApp, workspaceId: wsId, name: 'stacked app', key: stackApp.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md', pr_mode: 'issue' } })
    await db.insert(repo).values({ id: newId('repo'), appId: stackApp, fullName: '', localPath: repoPath })
    const { project: p, issues: tasks } = await createProject({ appId: stackApp, name: 'stacked', issues: [one('One', [{ key: 'x', title: 'X', files: ['x.txt'] }]), one('Two', [{ key: 'y', title: 'Y', files: ['y.txt'] }])] })
    const runner = new Runner({ execute: commits('st'), sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    const [b1, b2] = tasks.map((t) => `${p.integrationBranch}--${stackApp.slice(-6).toLowerCase()}-${t.number}`)
    const files = async (b: string) => (await git(repoPath, ['ls-tree', '--name-only', b])).stdout.split('\n').filter((f) => f.startsWith('st-'))
    const [x, y] = (await projectGraph(p.id))!.subIssues.map((q) => `st-${q.identifier}.txt`)
    expect(await files(b1)).toEqual([x])
    expect((await files(b2)).sort()).toEqual([x, y].sort()) // issue two started where issue one ended
    expect(await files(p.integrationBranch!)).toEqual([]) // the project's branch is only the starting point
    await db.update(project).set({ status: 'superseded' }).where(eq(project.id, p.id))
  })

  it('stores the builder\'s todo list as the sub-issue\'s steps, latest list wins', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'steps', issues: [one('T', [{ key: 's', title: 'S', files: ['s.txt'] }])] })
    const runner = new Runner({ execute: async (i) => {
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'in_progress' }, { text: 'test it', status: 'pending' }] })
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'completed' }, { text: 'test it', status: 'in_progress' }] })
      return commits('s')(i)
    }, sessionsMax: 2 })
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    const rows = await db.select().from(step).where(eq(step.issueId, phases[0].id))
    expect(rows.map((r) => [r.position, r.text, r.status])).toEqual([[0, 'read the code', 'completed'], [1, 'write it', 'completed'], [2, 'test it', 'in_progress']])
    expect((await projectGraph(p.id))!.subIssues[0].steps.map((s) => s.text)).toEqual(['read the code', 'write it', 'test it'])
  })

  it('recover() re-queues builds that were running, marks their runs interrupted, and resumes the agent session', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'recovery', issues: [one('T', [{ key: 'r', title: 'R', files: ['r.txt'] }])] })
    await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    await db.update(build).set({ status: 'running', attempt: 1 }).where(eq(build.issueId, phases[0].id))
    await db.insert(run).values({ id: newId('run'), appId, issueId: phases[0].id, attempt: 1, kind: 'build', agent: 'claude-code', status: 'working', agentSessionId: 'sess-123' })
    await git(repoPath, ['branch', p.integrationBranch!, 'main'])
    let resumed: string | undefined
    const runner = new Runner({ execute: async (i) => { resumed = i.resumeSessionId; return commits('r')(i) }, sessionsMax: 2 })
    const r = await runner.recover()
    expect(r.builds).toBeGreaterThanOrEqual(1)
    await until(cleaned(p.id))
    expect(resumed).toBe('sess-123')
    const runs = await db.select().from(run).where(eq(run.issueId, phases[0].id))
    expect(runs.map((x) => x.status).sort()).toEqual(['completed', 'interrupted'])
    const types = (await db.select().from(event).where(eq(event.issueId, phases[0].id))).map((e) => e.type)
    expect(types).toContain('build.interrupted')
  })
})
