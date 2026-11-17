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
import { app, build, event, issue, project, repo, run, step, workspace } from './db/schema.js'
import type { Execute } from './executor.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { createProject, projectGraph } from './projects.js'
import { createIssue } from './issues.js'
import { approveStep, setStep } from './work.js'
import { now } from './now.js'
import { FIX_TITLE, Runner } from './runner.js'
import { setAcceptance } from './acceptance.js'
import { CHECK_TITLE, FINISH_TITLE, PROBE_TITLE } from './verify.js'
import { afterOf } from './steps.js'
import { ensureMain, listWorkflows } from './work.js'
import { markSmoke, smokeOwed, smokeView } from './smoke.js'
import { acceptanceOf } from './acceptance.js'
import { addItems, dropItem, promote } from './backlog.js'
import type { Propose } from './planner.js'
import { approveBriefs } from './test-briefs.js'

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
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md', pr_mode: 'project' } }) // these tests are of one branch for the project; a task's own branch is tested below
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
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
    await approveBriefs(appId)
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    const g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('landed')
    expect(g.subIssues.map((x) => [g.issues.find((t) => t.id === x.parentId)!.title, x.status])).toEqual([['First', 'done'], ['Second', 'done']])
    expect(plannedAfter).toEqual(['done']) // the second issue was planned once, after the first had landed
    expect(tasks).toHaveLength(2)
  })

  it('does not plan a task ahead of the checks its plan is made from: after an approved prototype, the analysis and the draft ADR come first', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'checks first (sample)', issues: [
      one('First', [{ key: 'cf', title: 'CF', files: ['cf.txt'] }]),
      { title: 'After a prototype (sample)', brief: 'planned from the analysis and the ADR' },
    ] })
    let proposed = 0
    const propose: Propose = async () => { proposed++; return { status: 'completed', costUsd: 0, proposal: { phases: [{ key: 'x', title: 'X', description: 'x', summary: 'x', depends_on: [], files: ['x.txt'], steps: [], checks: [], done_when: '' }], decisions: [], questions: [], notes: '' } } }
    const runner = new Runner({ execute: commits('cfp'), sessionsMax: 2, propose })
    await approveBriefs(appId)
    await setStep({ issueId: tasks[1].id }, 'prototype', { status: 'done', detail: 'the whole flow (sample)' })
    await approveStep(tasks[1].id, 'prototype', 'Sam (sample)')
    await runner.startProject(p.id)
    await until(async () => (await projectGraph(p.id))!.subIssues.every((x) => x.status === 'done'))
    await runner.dispatch(); await new Promise((r) => setTimeout(r, 300)); await runner.dispatch()
    expect(proposed).toBe(0) // the analysis and the ADR are owed: the checks' line plans it when they are in
    await setStep({ issueId: tasks[1].id }, 'analysis', { status: 'done' })
    await setStep({ issueId: tasks[1].id }, 'adr', { status: 'done' })
    await runner.dispatch()
    await until(async () => proposed === 1)
    await runner.cancelProject(p.id) // its later checks are still owed, so it would wait on them: enough has been seen
  })

  it('a project with issues left in its backlog waits instead of landing; what a builder says it noticed makes no task', async () => {
    const { project: p } = await createProject({ appId, name: 'backlog gate', issues: [one('T', [{ key: 'b', title: 'B', files: ['b.txt'] }])] })
    const [kept] = await addItems(p.id, [{ text: 'Refunds' }])
    const [extra] = await addItems(p.id, [{ text: 'Gift cards' }])
    const runner = new Runner({ execute: async (i) => ({ ...(await commits('bg')(i)), summary: 'did B\n\nLater:\n- The header link 404s' }), sessionsMax: 2 })
    await approveBriefs(appId)
    await runner.startProject(p.id)
    const waiting = async () => (await db.select().from(event).where(eq(event.projectId, p.id))).some((e) => e.type === 'project.backlog_open')
    await until(waiting)
    let g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('running')
    expect(g.backlog.map((b) => [b.title, b.source, b.state])).toEqual([['Refunds', 'person', 'backlog'], ['Gift cards', 'person', 'backlog']]) // the build is quiet: the builder's "Later:" is only words in its summary
    await dropItem(kept.id, 'not in this project')
    await promote(extra.id) // taken on: planned and built before the project lands, once its brief is approved
    await approveBriefs(appId)
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'h', title: 'H', description: 'h', summary: 'h', depends_on: [], files: ['h.txt'], steps: [], checks: [], done_when: '' }], decisions: [], questions: [], notes: '' } })
    const again = new Runner({ execute: commits('bg2'), sessionsMax: 2, propose })
    await again.dispatch()
    await until(cleaned(p.id))
    g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('landed')
    expect(g.issues.map((t) => t.title)).toEqual(['T', 'Gift cards'])
    expect(g.subIssues.map((x) => x.status)).toEqual(['done', 'done'])
  })

  it('stacked PRs (pr_mode issue): each issue lands on its own branch, named for Linear, cut from the issue before it', async () => {
    const stackApp = newId('app')
    await db.insert(app).values({ id: stackApp, workspaceId: wsId, name: 'stacked app', key: stackApp.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md', pr_mode: 'issue' } })
    await db.insert(repo).values({ id: newId('repo'), appId: stackApp, fullName: '', localPath: repoPath })
    const { project: p, issues: tasks } = await createProject({ appId: stackApp, name: 'stacked', issues: [one('One', [{ key: 'x', title: 'X', files: ['x.txt'] }]), one('Two', [{ key: 'y', title: 'Y', files: ['y.txt'] }])] })
    const runner = new Runner({ execute: commits('st'), sessionsMax: 2 })
    await approveBriefs(appId)
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

  it('Main: built in one go with no planner, then checked, what the check found sent back, checked again, probed, and tested once', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'main flow', key: own.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md', requirements: [{ key: 'tests', name: 'Tests', what: 'New behaviour has a test (sample).' }] } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    expect(await db.transaction((tx) => ensureMain({ tx, appId: own }))).toEqual({ made: 1 }) // this app only: the others in this file build the old way
    const [w] = (await listWorkflows(own)).filter((x) => x.appDefault)
    expect(w).toMatchObject({ name: 'Main', build: 'one', style: 'checklist', requirements: { adr: true, risks: true } }); expect(afterOf(w)).toBe('fast')
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'main flow', issues: [{ title: 'Export (sample)', brief: 'People download their orders (sample).' }] })
    const { acceptance: [ac] } = await setAcceptance(t.id, { add: [{ text: 'The file has every order (sample)', check: 'export.test' }] })
    await setStep({ issueId: t.id }, 'prototype', { status: 'done', detail: 'the whole flow (sample)' }); await approveStep(t.id, 'prototype', 'Sam (sample)')
    const seen: { title: string; brief: string }[] = []
    const verdict = (list: object[]) => `Checked.\n\n\`\`\`acceptance\n${JSON.stringify(list)}\n\`\`\``
    const execute: Execute = async (i) => {
      seen.push({ title: i.subIssue.title, brief: i.subIssue.brief ?? '' })
      const r = await commits('main')(i)
      const checks = seen.filter((s) => s.title.startsWith(CHECK_TITLE)).length
      if (i.subIssue.title.startsWith(CHECK_TITLE)) return { ...r, summary: checks === 1 ? verdict([{ id: ac.id, met: true, evidence: 'export.test passes' }, { id: 'req_tests', met: false, evidence: 'no test for an empty export' }]) : verdict([{ id: 'req_tests', met: true, evidence: 'export-empty.test' }]) }
      return r
    }
    const propose: Propose = async () => { throw new Error('the planner was asked, and Main has none') }
    const runner = new Runner({ execute, sessionsMax: 1, propose })
    await approveBriefs(own)
    await runner.buildTask(t.id)
    await until(cleaned(p.id))
    expect(seen.map((s) => s.title)).toEqual(['Build it', CHECK_TITLE, FINISH_TITLE, `${CHECK_TITLE} (2)`, PROBE_TITLE])
    expect(seen[0].brief).toContain('in this one go'); expect(seen[0].brief).toContain(`[${ac.id}] The file has every order (sample)`); expect(seen[0].brief).toContain('- tests (Tests): New behaviour has a test (sample).')
    expect(seen[1].brief).toContain('[req_tests] Tests:'); expect(seen[1].brief).toContain('[req_adr] Decision record:') // Main switches the decision record on, over the app's own list
    expect(seen[0].brief).toContain('- adr (Decision record):') // the same list is in the builder's instructions and in the check
    expect(seen[2].brief).toContain('found this not done'); expect(seen[2].brief).toContain('Missing: no test for an empty export')
    expect(seen[3].brief).toMatch(/^Check 2/); expect(seen[3].brief).not.toContain(ac.id) // only what was not done is looked at again
    expect(seen[4].brief).toContain('You did not build this')
    const [after] = await db.select().from(issue).where(eq(issue.id, t.id))
    expect((after.requirements as { key: string }[]).find((r) => r.key === 'tests')).toEqual({ key: 'tests', name: 'Tests', applies: true, how: 'export-empty.test', built: true })
    expect((after.acceptance as { built?: boolean }[])[0].built).toBe(true)
    const order = (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => ['task.checked', 'task.tested', 'issue.planned'].includes(e.type)).sort((a, b) => a.seq - b.seq).map((e) => e.type)
    expect(order).toEqual(['issue.planned', 'task.checked', 'task.checked', 'task.tested']) // the whole test run once, last
  })

  it('a check left to a person holds the task: it is not landed until they mark it by hand; a fail is sent back, and comes back to them', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'smoke flow', key: own.slice(-6).toUpperCase(), setup: { requirements: [] } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    await db.transaction((tx) => ensureMain({ tx, appId: own }))
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'smoke flow', issues: [{ title: 'Edges (sample)', brief: 'Draw the tunnel (sample).' }] })
    const { acceptance: [look] } = await setAcceptance(t.id, { add: [{ text: 'The tunnel reads as a tunnel (sample)', check: 'look at it' }] })
    await setStep({ issueId: t.id }, 'prototype', { status: 'done', detail: 'the whole flow (sample)' }); await approveStep(t.id, 'prototype', 'Sam (sample)')
    const seen: { title: string; brief: string }[] = []
    const execute: Execute = async (i) => {
      seen.push({ title: i.subIssue.title, brief: i.subIssue.brief ?? '' })
      const r = await commits('smoke')(i)
      // The check cannot judge how it looks: it leaves it to a person, and says where to look.
      return i.subIssue.title.startsWith(CHECK_TITLE) ? { ...r, summary: `\`\`\`acceptance\n${JSON.stringify([{ id: look.id, met: null, where: 'edges-tunnel--default', evidence: 'Open the story: the edge should dip under the lip' }])}\n\`\`\`` } : r
    }
    const runner = new Runner({ execute, sessionsMax: 1 })
    await approveBriefs(own)
    await runner.buildTask(t.id)
    const events = async (type: string) => (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type === type)
    await until(async () => (await events('task.smoke_waiting')).length === 1)
    expect(seen.map((s) => s.title)).toEqual(['Build it', CHECK_TITLE, PROBE_TITLE]) // nothing was "not done", so no finish: it is the person's
    expect((await db.select().from(project).where(eq(project.id, p.id)))[0].status).toBe('running') // built, and not landed
    expect(await cleaned(p.id)()).toBe(false)
    expect((await now(own)).needsYou.filter((a) => a.kind === 'smoke_test')).toEqual([expect.objectContaining({ issueId: t.id, owed: 1 })])
    expect((await smokeView(t.id)).checks).toEqual([{ id: look.id, text: 'The tunnel reads as a tunnel (sample)', where: 'edges-tunnel--default', how: 'Open the story: the edge should dip under the lip', mark: 'todo' }])
    // They try it: it does not hold. Sent back with what they saw, built, and looked at again.
    await markSmoke(t.id, look.id, { pass: false, note: 'the edge sits on top of the lip (sample)' })
    expect(await runner.afterSmoke(t.id)).toEqual({ sentBack: 1 })
    await until(async () => (await events('task.smoke_waiting')).length === 2 || seen.length >= 5)
    await until(async () => seen.length >= 5 && smokeOwed(acceptanceOf((await db.select().from(issue).where(eq(issue.id, t.id)))[0])) === 1)
    expect(seen.slice(3).map((s) => s.title)).toEqual([FINISH_TITLE, `${CHECK_TITLE} (2)`])
    expect(seen[3].brief).toContain('Missing: the edge sits on top of the lip (sample)'); expect(seen[3].brief).toContain('by trying the build by hand')
    expect((await smokeView(t.id)).checks[0]).toMatchObject({ mark: 'todo', before: { pass: false, note: 'the edge sits on top of the lip (sample)' } })
    expect(await cleaned(p.id)()).toBe(false)
    // They try it again: it holds. The task carries on to its end.
    await markSmoke(t.id, look.id, { pass: true, note: 'dips under the lip now (sample)' })
    expect(await runner.afterSmoke(t.id)).toEqual({ sentBack: 0 })
    await until(cleaned(p.id))
    const [after] = await db.select().from(issue).where(eq(issue.id, t.id))
    expect((after.acceptance as { built?: boolean; builtEvidence?: string; byHand?: { pass: boolean } }[])[0]).toMatchObject({ built: true, builtEvidence: 'dips under the lip now (sample)', byHand: { pass: true } })
  })

  it('a built task is checked against its acceptance criteria by one more sub-task, before the whole test run; its verdicts mark them', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'checked once', key: own.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md' } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'checked once', issues: [one('One part', [{ key: 'a', title: 'A', files: ['a2.txt'] }])] })
    const { acceptance } = await setAcceptance(t.id, { add: [{ text: 'The file is there (sample)', check: 'ls' }, { text: 'It looks right (sample)' }, { text: 'It is fast (sample)' }] })
    const [there, looks, fast] = acceptance.map((c) => c.id)
    const briefs: string[] = []
    const execute: Execute = async (i) => {
      briefs.push(i.subIssue.brief ?? '')
      const r = await commits('chk')(i)
      return i.subIssue.title === CHECK_TITLE ? { ...r, summary: `Checked.\n\n\`\`\`acceptance\n${JSON.stringify([{ id: there, met: true, evidence: 'ls shows it' }, { id: looks, met: null, evidence: 'for a person: open the page' }, { id: fast, met: false, evidence: 'took 9 s' }])}\n\`\`\`` } : r
    }
    const runner = new Runner({ execute, sessionsMax: 1 })
    await approveBriefs(own)
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    expect((await projectGraph(p.id))!.subIssues.map((x) => [x.title, x.status])).toEqual([['A', 'done'], [CHECK_TITLE, 'done']]) // one check, and not another after it
    expect(briefs[1]).toContain(`[${there}] The file is there (sample)`)
    const [after] = await db.select().from(issue).where(eq(issue.id, t.id))
    expect((after.acceptance as { built?: boolean; builtEvidence?: string }[]).map((c) => [c.built, c.builtEvidence])).toEqual([[true, 'ls shows it'], [undefined, 'for a person: open the page'], [false, 'took 9 s']])
    expect(after.briefApprovedBy).not.toBeNull() // marking is not a change to what was approved
    const seen = (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type === 'task.checked' || e.type === 'task.tested').sort((a, b) => a.seq - b.seq)
    expect(seen.map((e) => e.type)).toEqual(['task.checked', 'task.tested']) // checked first, then the whole run, once
    expect(seen[0].payload).toMatchObject({ criteria: 3, read: 3, met: 1, notMet: 1, forAPerson: 1 })
  })

  it('the whole test run is once per task, after its sub-tasks are merged; a failure adds a sub-task that fixes it', async () => {
    const own = newId('app')
    // Passes only when three files have landed: the task's two sub-tasks leave two, so the run fails (twice) and a third is asked for.
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'tested once', key: own.slice(-6).toUpperCase(), setup: { test_cmd: 'echo " FAIL  made-up.test > needs three"; test "$(ls | grep -c "^once-")" -ge 3' } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'tested once', issues: [one('Two parts', [{ key: 'a', title: 'A', files: ['a1.txt'] }, { key: 'b', title: 'B', files: ['b1.txt'] }])] })
    const briefs: string[] = []
    const execute: Execute = async (i) => { briefs.push(i.subIssue.brief ?? ''); return commits('once')(i) }
    const runner = new Runner({ execute, sessionsMax: 1 })
    await approveBriefs(own)
    await runner.startProject(p.id)
    await until(cleaned(p.id))
    const g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => [x.title, x.status])).toEqual([['A', 'done'], ['B', 'done'], [FIX_TITLE, 'done']])
    expect(briefs[2]).toContain('FAIL  made-up.test > needs three') // the fix is told what failed
    const tested = (await db.select().from(event).where(eq(event.projectId, p.id))).filter((e) => e.type.startsWith('task.test') || e.type === 'land.tested').sort((a, b) => a.seq - b.seq)
    expect(tested.map((e) => [e.type, (e.payload as { ok?: boolean }).ok])).toEqual([['task.test_again', undefined], ['task.tested', false], ['task.tested', true]]) // not at A's landing, not at each sub-task's
    expect(tested.every((e) => e.issueId === t.id)).toBe(true)
  })

  it('a task builds by itself: planned, started and landed on its own branch, with nobody running its project', async () => {
    const own = newId('app'), key = own.slice(-6)
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'task-level app', key: key.toUpperCase(), setup: { test_cmd: 'test -f README.md' } }) // no pr_mode: the default
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'a group of tasks', issues: [{ title: 'Only a brief', brief: 'build it' }] })
    const lone = await createIssue(own, { title: 'On its own', kind: 'code', brief: 'build it too' })
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'a', title: 'A', description: 'a', summary: 'a', depends_on: [], files: [`${newId('issue')}.txt`], steps: [], checks: [], done_when: '' }],
      decisions: [], questions: [], notes: '' } })
    const runner = new Runner({ execute: commits('own'), sessionsMax: 2, propose })
    await approveBriefs(own)
    expect(await runner.buildTask(t.id)).toEqual({ planning: true, started: false }) // no Plan it, no Run
    expect(await runner.buildTask(t.id)).toEqual({ planning: true, started: false }) // asked twice while it plans: planned once
    await until(cleaned(p.id))
    const g = (await projectGraph(p.id))!
    expect(g.subIssues.map((x) => x.status)).toEqual(['done'])
    expect(g.project.prMode).toBe('issue') // fixed when its build started
    const branch = `${p.integrationBranch}--${key.toLowerCase()}-${t.number}`
    expect((await git(repoPath, ['ls-tree', '--name-only', branch])).stdout).toContain(`own-${g.subIssues[0].identifier}.txt`)
    expect((await git(repoPath, ['ls-tree', '--name-only', p.integrationBranch!])).stdout).not.toContain('own-') // the project's branch carries nothing
    // Build's page lists tasks past their plan: this one landed; one planned and never started is ready, under its project's name.
    const { issues: [waiting] } = await createProject({ appId: own, name: 'planned by hand', issues: [one('Planned, not started', [{ key: 'w', title: 'W', files: ['w.txt'] }])] })
    const listed = (await now(own)).tasks
    expect(listed.find((x) => x.id === t.id)).toMatchObject({ phase: 'landed', done: 1, total: 1, projectName: 'a group of tasks' })
    expect(listed.find((x) => x.id === waiting.id)).toMatchObject({ phase: 'ready', done: 0, total: 1, questions: [], failed: [] })
    await runner.buildTask(lone.id) // in no project: built in a project of its own that nobody sees
    const soloId = async () => (await db.select().from(issue).where(eq(issue.id, lone.id)))[0].projectId
    await until(async () => !!(await soloId()))
    await until(cleaned((await soloId())!))
    expect((await projectGraph((await soloId())!))!.subIssues.map((x) => x.status)).toEqual(['done'])
  })

  it('plans a task and stops there, so the plan can be read before anything is built; the build is a separate word', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'plan-first app', key: own.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md' } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { project: p, issues: [t] } = await createProject({ appId: own, name: 'read before built', issues: [{ title: 'Planned, then read', brief: 'build it' }] })
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'a', title: 'A', description: 'a', summary: 'a', depends_on: [], files: [`${newId('issue')}.txt`], steps: [], checks: [], done_when: '' }],
      decisions: [], questions: [], notes: '' } })
    const runner = new Runner({ execute: commits('pf'), sessionsMax: 2, propose })
    expect(await runner.planTask(t.id)).toBe('waiting') // its brief is not approved: the plan is made from an approved brief
    await approveBriefs(own)
    let told = 0
    expect(await runner.planTask(t.id, () => { told++ })).toBe('planning')
    expect(await runner.planTask(t.id, () => { told++ })).toBe('planning') // asked again meanwhile: planned once
    await until(async () => (await projectGraph(p.id))!.subIssues.length === 1)
    await until(async () => told === 1)
    expect(await runner.planTask(t.id)).toBe('planned')
    await sleep(300)
    const g = (await projectGraph(p.id))!
    expect(g.project.status).toBe('drafting') // nothing started: the plan is there to be read
    expect(g.subIssues.map((x) => x.status)).not.toContain('running')
    expect(await runner.buildTask(t.id)).toEqual({ planning: false, started: true }) // the readers are done: now it is built
    await until(cleaned(p.id))
  })

  it('in a running project, a task planned after its prototype is not built until its plan has been read', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'read-first app', key: own.slice(-6).toUpperCase(), setup: { test_cmd: 'test -f README.md' } })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { project: p, issues: [first, second] } = await createProject({ appId: own, name: 'two tasks', issues: [one('First', [{ key: 'f', title: 'F', files: ['rf-f.txt'] }]), one('Second', [{ key: 's', title: 'S', files: ['rf-s.txt'] }])] })
    await approveBriefs(own)
    // The second task has a prototype in play, so it owes the steps that follow one.
    await setStep({ issueId: second.id }, 'prototype', { status: 'done' })
    await approveStep(second.id, 'prototype', 'sam')
    const runner = new Runner({ execute: commits('rf'), sessionsMax: 2 })
    await runner.startProject(p.id)
    const subOf = async (taskId: string) => (await projectGraph(p.id))!.subIssues.find((x) => x.parentId === taskId)!
    await until(async () => (await subOf(first.id)).status === 'done')
    await sleep(600); await runner.dispatch()
    const held = await subOf(second.id)
    expect(held.status).toBe('queued')
    expect(held.heldReason).toMatch(/its plan is read before it is built; still to come: Prototype analysis, Draft ADR, Blast radius, Audit, Final ADR and plan/)
    const listed = (await now(own)).tasks.find((x) => x.id === second.id)
    expect(listed).toMatchObject({ phase: 'stopped' }) // held, in a running project
    for (const key of ['analysis', 'adr', 'risk', 'audit', 'final'] as const) await setStep({ issueId: second.id }, key, { status: 'done' })
    await runner.dispatch()
    await until(cleaned(p.id))
    expect((await subOf(second.id)).status).toBe('done')
  })

  it('a planned task that is still being read says so, and says when its last step is waiting for the person', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'being-read app', key: own.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId: own, fullName: '', localPath: repoPath })
    const { issues: [t] } = await createProject({ appId: own, name: 'being read', issues: [one('Read first', [{ key: 'r', title: 'R', files: ['br.txt'] }])] })
    const of = async () => (await now(own)).tasks.find((x) => x.id === t.id)!
    expect(await of()).toMatchObject({ phase: 'ready' }) // no prototype in play: planned, and just not started
    await setStep({ issueId: t.id }, 'prototype', { status: 'done' })
    await approveStep(t.id, 'prototype', 'sam')
    for (const key of ['analysis', 'adr'] as const) await setStep({ issueId: t.id }, key, { status: 'done' })
    expect(await of()).toMatchObject({ phase: 'checking', checks: { left: ['Blast radius', 'Audit', 'Final ADR and plan'], needsYou: null } })
    for (const key of ['risk', 'audit'] as const) await setStep({ issueId: t.id }, key, { status: 'done' })
    await setStep({ issueId: t.id }, 'final', { status: 'started', summary: 'NEEDS YOU: the audit found the brief asks for offline use and no sub-task does it. Add it, or drop it? I would drop it.' })
    expect(await of()).toMatchObject({ phase: 'stopped', checks: { left: ['Final ADR and plan'], needsYou: expect.stringMatching(/^the audit found the brief asks for offline use/) } })
    await setStep({ issueId: t.id }, 'final', { status: 'done', summary: '- Open the page' })
    expect(await of()).toMatchObject({ phase: 'ready' }) // read: now it only waits to be started
    expect((await of()).checks).toBeUndefined()
  })

  it('stores the builder\'s todo list as the sub-issue\'s steps, latest list wins', async () => {
    const { project: p, subIssues: phases } = await createProject({ appId, name: 'steps', issues: [one('T', [{ key: 's', title: 'S', files: ['s.txt'] }])] })
    const runner = new Runner({ execute: async (i) => {
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'in_progress' }, { text: 'test it', status: 'pending' }] })
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'completed' }, { text: 'test it', status: 'in_progress' }] })
      return commits('s')(i)
    }, sessionsMax: 2 })
    await approveBriefs(appId)
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
