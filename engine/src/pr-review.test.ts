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
import { lineUrl, listPulls, reviewView, runReview, suggest, type Gh } from './pr-review.js'

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

describe.skipIf(!reachable)('a review of someone else\'s pull request (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app'), full = `sample-org/sample-review-${appId.slice(-5)}`
  let repoPath: string, head: string
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
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: full, localPath: repoPath })
  })
  afterAll(async () => { await pool.end() })

  it('finds what its tests miss and what fails, drafts the comments, and sends nothing', async () => {
    const asked: string[][] = []
    const pull = () => ({ number: 7, title: 'A limit of three (sample)', url: `https://github.test/${full}/pull/7`, isDraft: false, author: { login: 'a-colleague' }, headRefName: 'theirs', baseRefName: 'main', headRefOid: head, updatedAt: '2026-11-25T10:00:00Z', changedFiles: 2, state: 'OPEN' })
    const gh: Gh = async (args) => {
      asked.push(args)
      if (args[0] === 'api') return 'me-myself'
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify([pull(), { ...pull(), number: 8, title: 'Mine (sample)', author: { login: 'me-myself' }, headRefOid: 'f'.repeat(40) }])
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(pull())
      throw new Error(`not asked for in a review: gh ${args.join(' ')}`)
    }
    // Before anything is run: other people's first, none reviewed, and the warning there to be read.
    const before = await listPulls(appId, { gh })
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
    expect(v.commands.map((c) => [c.name, c.pass])).toEqual([['Style (sample)', false], ['Loads (sample)', true]])
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

  it('refuses a repository that is not the app\'s', async () => {
    await expect(runReview(appId, 'someone-else/other', 1, { gh: async () => '{}' })).rejects.toThrow(/not one of this app's repositories/)
  })
})
