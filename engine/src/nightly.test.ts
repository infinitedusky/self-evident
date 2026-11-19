import { describe, expect, it } from 'vitest'
import { applyHeldChange, heldOf } from './held.js'
import { nightOf, readWorkflow, type GhRun } from './nightly.js'
import { inForce, leftTo } from './probe-list.js'
import { ciFailing, taskWaits } from './close.js'
import { checkTaskBrief } from './verify.js'

const run = (day: number, conclusion: string | null, more: Partial<GhRun> = {}): GhRun => ({ databaseId: day, status: 'completed', conclusion, createdAt: `2026-11-${String(day).padStart(2, '0')}T03:00:00Z`, url: `https://example.com/runs/${day}`, headSha: `sha${day}`, event: 'schedule', ...more })

describe('what a workflow\'s runs say', () => {
  it('is the newest run that finished as passed or failed', () => {
    expect(nightOf([])).toMatchObject({ status: 'none', failing: 0 })
    expect(nightOf([run(19, 'success'), run(18, 'failure')])).toMatchObject({ status: 'passed', failing: 0, run: { databaseId: 19 } })
    const red = nightOf([run(17, 'success'), run(19, 'failure'), run(18, 'failure')]) // any order in
    expect(red).toMatchObject({ status: 'failed', failing: 2, run: { databaseId: 19 }, green: { databaseId: 17 } })
    expect(nightOf([run(19, 'timed_out')])).toMatchObject({ status: 'failed', failing: 1, green: null })
  })
  it('passes over a run that says nothing: still running, cancelled, skipped, or on a pull request', () => {
    expect(nightOf([run(19, null, { status: 'in_progress' }), run(18, 'cancelled'), run(17, 'success')])).toMatchObject({ status: 'passed', run: { databaseId: 17 } })
    expect(nightOf([run(19, 'failure', { event: 'pull_request' }), run(18, 'success')])).toMatchObject({ status: 'passed', failing: 0 })
  })
})

describe('a workflow file, read for the picker', () => {
  it('says whether it runs on a schedule and on pull requests, and names its jobs as their checks are named', () => {
    expect(readWorkflow('nightly.yml', 'name: Nightly\non:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:\njobs:\n  docs:\n    name: Docs smoke\n    runs-on: ubuntu-latest\n')).toEqual({ file: 'nightly.yml', name: 'Nightly', scheduled: true, onPr: false, jobs: ['Docs smoke'] })
    expect(readWorkflow('ci.yml', 'on: [pull_request]\njobs:\n  check: {}\n  smoke: {}\n')).toEqual({ file: 'ci.yml', name: 'ci.yml', scheduled: false, onPr: true, jobs: ['check', 'smoke'] })
    expect(readWorkflow('bad.yml', ': : :\n  - [')).toBeNull()
  })
})

describe('when one of the things a build is held to is run', () => {
  const add = (setup: unknown, c: Parameters<typeof applyHeldChange>[1]) => ({ ...(setup as object), ...applyHeldChange(setup, c) })
  let setup: unknown = { test_cmd: 'pnpm test' }
  setup = add(setup, { op: 'add', name: 'Lint', kind: 'command', runs: 'pnpm lint' })
  setup = add(setup, { op: 'add', name: 'Smoke', kind: 'command', runs: 'smoke', when: 'pr' })
  setup = add(setup, { op: 'add', name: 'Docs smoke', kind: 'command', runs: 'nightly.yml', when: 'nightly', blocks: true })

  it('a build runs only what is for every build; the rest is left to CI or to the nightly run', () => {
    expect(inForce(setup).filter((p) => p.kind === 'command').map((p) => p.key)).toEqual(['tests', 'lint'])
    expect(leftTo(setup, 'pr').map((p) => [p.name, p.runs])).toEqual([['Smoke', 'smoke']])
    expect(leftTo(setup, 'nightly').map((p) => [p.name, p.runs])).toEqual([['Docs smoke', 'nightly.yml']])
  })
  it('a nightly one only reports, and cannot be set to block', () => {
    expect(heldOf(setup).find((h) => h.key === 'docs_smoke')).toMatchObject({ when: 'nightly', blocks: false })
    expect(applyHeldChange(setup, { op: 'blocks', key: 'docs_smoke', blocks: true })).toBeNull()
  })
  it('an edit moves one between them; back to every build it is a plain command again', () => {
    const nightly = add(setup, { op: 'edit', key: 'smoke', name: 'Smoke', runs: 'nightly.yml', when: 'nightly' })
    expect(heldOf(nightly).find((h) => h.key === 'smoke')).toMatchObject({ when: 'nightly', runs: 'nightly.yml', blocks: false })
    const build = add(setup, { op: 'edit', key: 'smoke', name: 'Smoke', runs: 'pnpm smoke', when: 'build' })
    expect(heldOf(build).find((h) => h.key === 'smoke')?.when).toBeUndefined()
    expect(inForce(build).map((p) => p.key)).toContain('smoke')
  })
  it('the check is told what is left to CI and to the nightly run', () => {
    const b = checkTaskBrief([], [], undefined, [], { pr: leftTo(setup, 'pr'), nightly: leftTo(setup, 'nightly') })
    expect(b).toContain('Smoke (the check "smoke")')
    expect(b).toContain('Docs smoke (the workflow nightly.yml)')
    expect(b).toContain('"when" "nightly"')
    expect(checkTaskBrief([], [])).not.toContain('nightly')
  })
  it('closing waits on a CI check the app holds builds to while it is failing, and never on one left to the nightly run', () => {
    expect(ciFailing(setup, { failing: ['Smoke', 'size'] })).toEqual(['smoke'])
    expect(ciFailing(setup, { failing: ['size'] })).toEqual([])
    const f = { state: 'in_review', pr: { number: 7, status: 'merged' } }
    expect(taskWaits({ ...f, checks: [], ci: ['smoke'] })).toEqual(['The pull request\'s check "smoke" is failing.'])
    expect(taskWaits({ ...f, checks: [{ mark: 'todo', when: 'nightly' }] })).toEqual([])
    expect(taskWaits({ ...f, checks: [{ mark: 'todo', when: 'after' }] })).toHaveLength(1)
  })
})

// Against the database: one app with a nightly check, a stand-in for GitHub's runs. Sample data.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, pr, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { nightlyView, syncNightly } from './nightly.js'
import { now } from './now.js'
import { createProject } from './projects.js'
import { patchSetup } from './setup.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a nightly check, read with the sync', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let runs: GhRun[] = [], calls = 0
  const api = async () => { calls++; return runs }
  beforeAll(async () => {
    const local = await mkdtemp(join(tmpdir(), 'if-nightly-'))
    await mkdir(join(local, '.github', 'workflows'), { recursive: true })
    await writeFile(join(local, '.github', 'workflows', 'nightly.yml'), 'name: Nightly\non:\n  schedule:\n    - cron: "0 3 * * *"\njobs:\n  docs: {}\n')
    await db.insert(workspace).values({ id: wsId, name: 'nightly test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'o/shop', localPath: local })
    const { project: p, issues } = await createProject({ appId, name: 'cart', issues: [{ title: 'Cart page (sample)' }, { title: 'Checkout (sample)' }] })
    // One merged before the last green night, one after it.
    await db.insert(pr).values({ id: newId('pr'), appId, projectId: p.id, issueId: issues[0].id, number: 10, status: 'merged', mergedAt: new Date('2026-11-17T12:00:00Z') })
    await db.insert(pr).values({ id: newId('pr'), appId, projectId: p.id, issueId: issues[1].id, number: 11, status: 'merged', mergedAt: new Date('2026-11-18T12:00:00Z') })
  })
  afterAll(async () => { await pool.end() })
  const said = async (type: string) => (await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, type)))).length

  it('reads nothing until the app holds its builds to one', async () => {
    expect(await syncNightly(appId, api)).toEqual([])
    expect(calls).toBe(0)
  })
  it('keeps the last run, says a red night once, and lists it with the tasks merged since the last green one', async () => {
    await patchSetup(appId, (s) => applyHeldChange(s, { op: 'add', name: 'Docs smoke', kind: 'command', runs: 'nightly.yml', when: 'nightly' })!)
    runs = [run(18, 'success')]
    expect((await nightlyView(appId, api)).checks).toMatchObject([{ key: 'docs_smoke', workflow: 'nightly.yml', status: 'passed', failing: 0 }])
    expect((await nightlyView(appId, api)).workflows).toMatchObject([{ file: 'nightly.yml', scheduled: true }])
    expect((await now(appId)).needsYou.filter((n) => n.kind === 'nightly_failed')).toEqual([])

    runs = [run(19, 'failure'), run(18, 'success')]
    expect(await syncNightly(appId, api, true)).toMatchObject([{ status: 'failed', failing: 1, runId: '19' }])
    await syncNightly(appId, api, true) // the same run again: not said twice
    expect(await said('nightly.failed')).toBe(1)
    const [red] = (await now(appId)).needsYou.filter((n) => n.kind === 'nightly_failed')
    expect(red).toMatchObject({ name: 'Docs smoke', workflow: 'nightly.yml', nights: 1, url: 'https://example.com/runs/19' })
    expect(red.kind === 'nightly_failed' && red.since.map((t) => t.title)).toEqual(['Checkout (sample)']) // merged after the green night, before the red one
  })
  it('within fifteen minutes it answers from what it kept', async () => {
    const before = calls
    await syncNightly(appId, api)
    expect(calls).toBe(before)
  })
  it('says it is green again, once, and leaves the list; and forgets a check the app drops', async () => {
    runs = [run(20, 'success'), run(19, 'failure')]
    await syncNightly(appId, api, true)
    expect(await said('nightly.passed')).toBe(1)
    expect((await now(appId)).needsYou.filter((n) => n.kind === 'nightly_failed')).toEqual([])
    await patchSetup(appId, (s) => applyHeldChange(s, { op: 'remove', key: 'docs_smoke' })!)
    expect(await syncNightly(appId, api, true)).toEqual([])
  })
})
