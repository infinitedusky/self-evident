/**
 * A review of someone else's pull request, end to end on a made-up repository: its head is fetched and checked out,
 * the breaks its tests miss are found, the app's commands are run, comments are drafted, and nothing is sent anywhere.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { couldNotRun, forgetPulls, lineUrl, listPulls, namedPull, reviewView, runReview, suggest, type Gh } from './pr-review.js'
import { checkRepo, repoRuns, scaffold, scriptsOf } from './repo-run.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('the comments drafted', () => {
  it('one for each break no test caught, on its line, and one for each command that fails', () => {
    const survivor = { id: 'a1', file: 'src/limit.js', line: 4, col: 2, op: 'boundary' as const, from: '>=', to: '>', means: 'no test checks the value exactly at this limit', code: 'if (n >= 3)' }
    const got = suggest({ prUrl: 'https://github.test/sample-org/sample/pull/7', survivors: [survivor, { ...survivor, id: 'b2', equivalent: 'a limit nudged by one' }], commands: [{ key: 'lint', name: 'Lint', runs: 'pnpm lint', pass: false, output: 'x.js: unused' }, { key: 'tests', name: 'Tests', runs: 'pnpm test', pass: true, output: '' }] })
    expect(got.map((s) => s.id)).toEqual(['m:a1', 'c:lint']) // not the one set aside, not the command that passes
    expect(got[0]).toMatchObject({ file: 'src/limit.js', line: 4, text: expect.stringMatching(/^Changing `>=` to `>` on this line doesn't fail any of the tests in this pull request\. No test checks the value exactly at this limit\. /) })
    expect(got[0].url).toBe(lineUrl('https://github.test/sample-org/sample/pull/7', 'src/limit.js', 4))
    expect(got[0].url).toMatch(/\/pull\/7\/files#diff-[0-9a-f]{64}R4$/)
    expect(got[1].text).toMatch(/^Lint fails for me on this branch \(`pnpm lint`\):[\s\S]*x\.js: unused/)
  })
})

describe('a command that could not be run here', () => {
  it('is one the shell could not start: a folder or a program that is not there', () => {
    expect(couldNotRun({ exit: 1, output: '/bin/sh: line 0: cd: backend: No such file or directory\n' })).toBe(true)
    expect(couldNotRun({ exit: 127, output: 'sh: uv: command not found' })).toBe(true)
    expect(couldNotRun({ exit: 126, output: '' })).toBe(true)
  })
  it('and not one that ran and failed, whatever it printed', () => {
    expect(couldNotRun({ exit: 1, output: 'src/a.ts\n  3:1 error (sample)' })).toBe(false)
    expect(couldNotRun({ exit: 1, output: 'FileNotFoundError: [Errno 2] No such file or directory: \'x.json\'\n1 failed' })).toBe(false)
    expect(couldNotRun({ exit: 0, output: '' })).toBe(false)
  })
  it('is never drafted as a comment', () => {
    expect(suggest({ prUrl: 'https://github.test/o/r/pull/1', survivors: [], commands: [{ key: 'tests', name: 'Tests', runs: 'cd backend && pytest', pass: false, output: '/bin/sh: line 0: cd: backend: No such file or directory', ran: false }] })).toEqual([])
  })
})

describe('a pull request named by the person', () => {
  const repos = ['sample-org/shop', 'sample-org/api']
  it('is its number in the home repository, a repository and number, or its address', () => {
    expect(namedPull('412', repos)).toEqual({ repo: 'sample-org/shop', number: 412 })
    expect(namedPull(' #412 ', repos)).toEqual({ repo: 'sample-org/shop', number: 412 })
    expect(namedPull('sample-org/api#9', repos)).toEqual({ repo: 'sample-org/api', number: 9 })
    expect(namedPull('https://github.com/Sample-Org/API/pull/9/files#diff-abc', repos)).toEqual({ repo: 'sample-org/api', number: 9 })
  })
  it('and nothing else: words, or a repository that is not the app\'s', () => {
    expect(namedPull('robin', repos)).toBeNull(); expect(namedPull('fix 412', repos)).toBeNull()
    expect(namedPull('https://github.com/someone/else/pull/3', repos)).toBeNull(); expect(namedPull('12', [])).toBeNull()
  })
})

describe.skipIf(!reachable)('a review of someone else\'s pull request (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app'), full = `sample-org/sample-review-${appId.slice(-5)}`
  const other = `sample-org/sample-other-${appId.slice(-5)}`
  let repoPath: string, head: string, otherPath: string, otherHead: string, bench: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-review-of-'))
    repoPath = join(dir, 'repo')
    await git(dir, ['init', '-q', '-b', 'main', 'repo']); await git(dir, ['init', '-q', '--bare', 'remote.git'])
    await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
    await writeFile(join(repoPath, 'README.md'), 'hi\n'); await commitAll(repoPath, 'init')
    await git(repoPath, ['remote', 'add', 'origin', join(dir, 'remote.git')]); await git(repoPath, ['push', '-q', 'origin', 'main'])
    // A colleague's branch, which GitHub would keep at refs/pull/7/head. Its test never sits on the limit.
    await git(repoPath, ['checkout', '-q', '-b', 'theirs'])
    await writeFile(join(repoPath, 'limit.js'), 'module.exports = (n) => n >= 3\n')
    await writeFile(join(repoPath, 'limit.test.js'), "const f = require('./limit.js'); if (f(5) !== true || f(1) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n")
    await commitAll(repoPath, 'a limit of three (sample)')
    head = (await git(repoPath, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(repoPath, ['push', '-q', 'origin', 'theirs:refs/pull/7/head'])
    await git(repoPath, ['checkout', '-q', 'main']); await git(repoPath, ['branch', '-q', '-D', 'theirs'])
    await db.insert(workspace).values({ id: wsId, name: 'review-of test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Limits (sample)', key: appId.slice(-6).toUpperCase(), setup: { mutation: { test_cmd: 'node {files}' }, held: [{ key: 'style', name: 'Style (sample)', kind: 'command', runs: 'echo "limit.js: no semicolons (sample)" && exit 1' }, { key: 'loads', name: 'Loads (sample)', kind: 'command', runs: 'node -e "require(\'./limit.js\')"' }] } })
    const homeId = newId('repo')
    await db.insert(repo).values({ id: homeId, appId, fullName: full, localPath: repoPath })
    // A second repository of the app's, laid out differently: nothing of the home's commands fits it.
    otherPath = join(dir, 'other')
    await git(dir, ['init', '-q', '-b', 'main', 'other']); await git(dir, ['init', '-q', '--bare', 'other-remote.git'])
    await git(otherPath, ['config', 'user.email', 't@example.com']); await git(otherPath, ['config', 'user.name', 'test'])
    await writeFile(join(otherPath, 'README.md'), 'hi\n'); await commitAll(otherPath, 'init')
    await git(otherPath, ['remote', 'add', 'origin', join(dir, 'other-remote.git')]); await git(otherPath, ['push', '-q', 'origin', 'main'])
    await git(otherPath, ['checkout', '-q', '-b', 'theirs'])
    await writeFile(join(otherPath, 'cap.js'), 'module.exports = (n) => n >= 9\n'); await writeFile(join(otherPath, 'cap.test.js'), "const f = require('./cap.js'); if (f(12) !== true || f(1) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n")
    await commitAll(otherPath, 'a cap of nine (sample)')
    otherHead = (await git(otherPath, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(otherPath, ['push', '-q', 'origin', 'theirs:refs/pull/3/head']); await git(otherPath, ['checkout', '-q', 'main'])
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: other, localPath: otherPath })
    bench = join(dir, 'workbench')
    await db.update(app).set({ setup: { workbench: { dir: bench }, home_repo: homeId, mutation: { test_cmd: 'node {files}' }, held: [{ key: 'style', name: 'Style (sample)', kind: 'command', runs: 'echo "limit.js: no semicolons (sample)" && exit 1' }, { key: 'loads', name: 'Loads (sample)', kind: 'command', runs: 'node -e "require(\'./limit.js\')"' }, { key: 'gone', name: 'Elsewhere (sample)', kind: 'command', runs: 'cd not-a-folder && true' }] } }).where(eq(app.id, appId))
  })
  afterAll(async () => { await pool.end() })

  it('finds what its tests miss and what fails, drafts the comments, and sends nothing', async () => {
    const asked: string[][] = []
    const pull = () => ({ number: 7, title: 'A limit of three (sample)', url: `https://github.test/${full}/pull/7`, isDraft: false, author: { login: 'a-colleague' }, headRefName: 'theirs', baseRefName: 'main', headRefOid: head, updatedAt: '2026-11-25T10:00:00Z', changedFiles: 2, state: 'OPEN' })
    const gh: Gh = async (args) => {
      asked.push(args)
      if (args[0] === 'api') return 'me-myself'
      if (args[0] === 'pr' && args[1] === 'list' && args[3] === other) return '[]'
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify([pull(), { ...pull(), number: 8, title: 'Mine (sample)', author: { login: 'me-myself' }, headRefOid: 'f'.repeat(40) }])
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(pull())
      throw new Error(`not asked for in a review: gh ${args.join(' ')}`)
    }
    forgetPulls()
    // Before anything is run: other people's first, none reviewed, and the warning there to be read.
    const before = await listPulls(appId, { gh })
    // GitHub is read once and kept: a second look asks it nothing, until the person asks for it fresh.
    const lists = () => asked.filter((a) => a[1] === 'list').length
    expect(lists()).toBe(2); expect(before.repos).toEqual([full, other]) // one ask of each repository
    expect((await listPulls(appId, { gh })).readAt).toBe(before.readAt); expect(lists()).toBe(2)
    await listPulls(appId, { gh }, { fresh: true }); expect(lists()).toBe(4)
    expect(before.pulls.map((p) => [p.number, p.author, p.mine, p.review])).toEqual([[7, 'a-colleague', false, null], [8, 'me-myself', true, null]])
    expect(before.warning).toMatch(/Nobody here has reviewed that code yet/)
    expect(await reviewView(appId, full, 7, { gh })).toMatchObject({ state: 'none', suggestions: [], pull: { title: 'A limit of three (sample)' } })

    await runReview(appId, full, 7, { gh })
    const v = await reviewView(appId, full, 7, { gh })
    expect(v).toMatchObject({ state: 'done', sha: head, stale: false })
    expect(Object.fromEntries(v.steps.map((s) => [s.key, s.state]))).toEqual({ checkout: 'pass', mutation: 'fail', commands: 'fail' })
    expect(v.steps[0].says).toMatch(new RegExp(`^At ${head.slice(0, 7)}: 2 files changed against main\\.`))
    expect(v.mutation).toMatchObject({ caught: 0, meaningful: 2, percent: 0 })
    expect(v.mutation!.survivors.map((s) => `${s.file}:${s.line} ${s.from}>${s.to}`)).toEqual(['limit.js:1 >=>>', 'limit.js:1 3>4'])
    // One fails, one passes, and one could not be run here at all: that one is said and is nobody's comment.
    expect(v.commands.map((c) => [c.name, c.pass, c.ran ?? true])).toEqual([['Style (sample)', false, true], ['Loads (sample)', true, true], ['Elsewhere (sample)', false, false]])
    expect(v.steps[2].says).toMatch(/1 of 3 fail: Style \(sample\)\. 1 could not be run here \(Elsewhere \(sample\)\)/)
    expect(v.repoRun).toMatchObject({ home: true, mode: 'app' }) // the home repository with no scripts of its own yet: as the app's settings say
    expect(v.steps[0].says).toMatch(/Run as the app's settings say/)
    expect(v.commands[0].output).toMatch(/no semicolons \(sample\)/)
    expect(v.suggestions.map((s) => [s.from, s.file, s.line])).toEqual([['mutation', 'limit.js', 1], ['mutation', 'limit.js', 1], ['command', null, null]])
    // Nothing was written to GitHub: it was only ever read.
    expect(asked.every((a) => a[0] === 'api' || (a[0] === 'pr' && (a[1] === 'list' || a[1] === 'view')))).toBe(true)
    // And nothing of a break is left in the main checkout or on a branch of it.
    expect((await git(repoPath, ['status', '--porcelain'])).stdout.trim()).toBe('')
    expect((await git(repoPath, ['branch', '--list'])).stdout.trim()).toBe('* main')

    const after = await listPulls(appId, { gh })
    expect(after.pulls[0].review).toMatchObject({ state: 'done', stale: false, suggestions: 3, survivors: 2, failed: 1 })
    // The pull request moves: what was found is of an earlier commit, and the page can say so.
    head = 'e'.repeat(40)
    expect(await reviewView(appId, full, 7, { gh })).toMatchObject({ state: 'done', stale: true })
    const types = (await db.select().from(event).where(eq(event.appId, appId))).map((e) => e.type)
    expect(types).toEqual(expect.arrayContaining(['pr_review.started', 'pr_review.step', 'pr_review.done']))
  }, 120_000)

  it('runs another repository by its own scripts in the workbench, and by nothing until it has some', async () => {
    const gh: Gh = async (args) => { if (args[0] === 'api') return 'me-myself'; return JSON.stringify({ number: 3, title: 'A cap of nine (sample)', url: `https://github.test/${other}/pull/3`, author: { login: 'a-colleague' }, headRefName: 'theirs', baseRefName: 'main', headRefOid: otherHead, state: 'OPEN' }) }
    await runReview(appId, other, 3, { gh })
    const v = await reviewView(appId, other, 3, { gh })
    const dir = join(bench, 'repos', other.split('/')[1])
    expect(v.repoRun).toEqual({ home: false, mode: 'none', dir, setup: false, up: false, test: false, down: false, checks: [] })
    expect(Object.fromEntries(v.steps.map((s) => [s.key, s.state]))).toEqual({ checkout: 'pass', mutation: 'skipped', commands: 'skipped' })
    expect(v.steps[1].says).toMatch(/has not been told how .* is run, so nothing is run on its pull requests\. Its scripts go in /)
    expect(v.commands).toEqual([]); expect(v.suggestions).toEqual([]) // nothing run, so nothing to say of it

    // A folder of stubs to start from: each says it is not written, and none is taken for a result.
    const stubs = await scaffold(appId, other)
    expect(stubs).toMatchObject({ has: true, setup: join(dir, 'setup.sh'), test: join(dir, 'test.sh') }); expect(stubs.checks.map((c) => c.name)).toEqual(['Lint'])
    await checkRepo(appId, other)
    const stubbed = (await repoRuns(appId)).repos.find((r) => r.repo === other)!
    expect(stubbed.check).toMatchObject({ state: 'done', ok: false }); expect(stubbed.check!.steps.find((s) => s.key === 'setup')).toMatchObject({ state: 'unrun', output: expect.stringMatching(/not written yet/) })

    // The repository's own scripts, written once: installed, brought up, its tests and a check run, and brought down.
    const script = (name: string, body: string) => { mkdirSync(join(dir, 'checks'), { recursive: true }); writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`); chmodSync(join(dir, name), 0o755) }
    const log = join(bench, 'ran.log')
    script('setup.sh', `echo "setup in $(basename "$CHECKOUT") pr=$PR" >> ${log}`)
    script('up.sh', `echo up >> ${log}\necho "SAMPLE_DB=postgres://sample"`)
    script('test.sh', `test -n "$SAMPLE_DB" || { echo "no database (sample)" >&2; exit 1; }\nnode "$@"`)
    script('checks/lint.sh', 'echo "cap.js: no semicolons (sample)" >&2; exit 1')
    script('checks/loads.sh', 'node -e "require(\'./cap.js\')"')
    script('down.sh', `echo "down $SAMPLE_DB" >> ${log}`)
    expect(scriptsOf({ workbench: { dir: bench } }, other).checks.map((c) => c.name)).toEqual(['Lint', 'Loads'])
    await runReview(appId, other, 3, { gh })
    const again = await reviewView(appId, other, 3, { gh })
    expect(again.repoRun).toMatchObject({ mode: 'scripts', setup: true, up: true, test: true, down: true, checks: ['Lint', 'Loads'] })
    expect(Object.fromEntries(again.steps.map((s) => [s.key, s.state]))).toEqual({ checkout: 'pass', mutation: 'fail', commands: 'fail' })
    expect(again.steps[0].says).toMatch(/Installed and brought up\./)
    expect(again.mutation!.survivors.map((s) => `${s.from}>${s.to}`)).toEqual(['>=>>', '9>10']) // its test never sits on the cap; and it only ran because up gave it its database
    expect(again.commands.map((c) => [c.name, c.runs, c.pass])).toEqual([['Lint', 'checks/lint.sh', false], ['Loads', 'checks/loads.sh', true]])
    expect(again.suggestions.map((s) => s.from)).toEqual(['mutation', 'mutation', 'command'])
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['setup in review-of--3 pr=3', 'up', 'down postgres://sample']) // brought down, with what up gave

    // Check it: the same scripts on the default branch, before any pull request. Here main has no cap.js, so one check fails, and it says which.
    await checkRepo(appId, other)
    const checked = (await repoRuns(appId)).repos.find((r) => r.repo === other)!
    expect(checked).toMatchObject({ home: false, local: true, scripts: { has: true, checks: ['Lint', 'Loads'] }, check: { state: 'done', branch: 'main', ok: false } })
    expect(Object.fromEntries(checked.check!.steps.map((s) => [s.key, s.state]))).toMatchObject({ setup: 'pass', up: 'pass', 'check:Lint': 'fail', down: 'pass' })
    expect((await repoRuns(appId)).repos.find((r) => r.repo === full)).toMatchObject({ home: true, scripts: { has: false }, check: null })
  }, 120_000)

  it('refuses a repository that is not the app\'s', async () => {
    await expect(runReview(appId, 'someone-else/other', 1, { gh: async () => '{}' })).rejects.toThrow(/not one of this app's repositories/)
  })
})
