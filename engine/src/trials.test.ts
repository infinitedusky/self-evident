/** A probe tried on past work: real git (a sample repo with two merged tasks), a stand-in for the agent. Sample data. */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, pr, repo, workspace } from './db/schema.js'
import { commitAll, git, headSha, worktreeExists } from './git.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { pastTasks, startTrial, trialsOf } from './trials.js'
import type { RunInput } from './executor.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('trying a probe on past work', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let local: string
  beforeAll(async () => {
    local = join(await mkdtemp(join(tmpdir(), 'if-trial-')), 'shop')
    await git(join(local, '..'), ['init', '-q', '-b', 'main', 'shop'])
    await git(local, ['config', 'user.email', 'sample@example.com']); await git(local, ['config', 'user.name', 'sample'])
    await writeFile(join(local, 'README.md'), 'hi\n'); await commitAll(local, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'trial test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'o/shop', localPath: local })
    const { project: p, issues } = await createProject({ appId, name: 'cart', issues: [{ title: 'Cart page (sample)' }, { title: 'Checkout (sample)' }] })
    // Two tasks merged, one after the other: the first adds a lint config, the second a file that fails it.
    for (const [n, file, text] of [[0, 'lint.ok', 'clean\n'], [1, 'debug.log', 'left behind\n']] as const) {
      await writeFile(join(local, file), text)
      const sha = await commitAll(local, `task ${n}`)
      await db.insert(pr).values({ id: newId('pr'), appId, projectId: p.id, issueId: issues[n].id, number: 10 + n, status: 'merged', mergeSha: sha, mergedAt: new Date(Date.now() - (2 - n) * 60_000) })
    }
  })
  afterAll(async () => { await pool.end() })

  it('runs on the merged tasks, the latest first', async () => {
    expect((await pastTasks(appId)).map((t) => [t.title, t.pr])).toEqual([['Checkout (sample)', 11], ['Cart page (sample)', 10]])
  })
  it('a command is run at each task\'s merged commit, in a scratch worktree that is gone afterwards, and what it said is kept with the probe as it was', async () => {
    const { trial, done } = await startTrial(appId, { key: 'no_logs', probe: { name: 'No logs (sample)', kind: 'command', runs: 'test ! -f debug.log' } })
    expect(trial).toMatchObject({ status: 'running', tasks: 2 })
    await expect(startTrial(appId, { key: 'x', probe: { name: 'x', kind: 'command', runs: 'true' } })).rejects.toThrow('already running')
    const t = await done
    expect(t.status).toBe('done'); expect(t.probe).toEqual({ name: 'No logs (sample)', kind: 'command', runs: 'test ! -f debug.log' })
    expect(t.results.map((r) => [r.title, r.pass])).toEqual([['Checkout (sample)', false], ['Cart page (sample)', true]]) // the first task had no log yet
    expect(await worktreeExists(local, join(`${local}-worktrees`, `trial-${t.id}`))).toBe(false)
    expect(await headSha(local)).toBe(t.results[0].sha) // the checkout itself was not moved
    expect((await trialsOf(appId, true)).map((x) => x.key)).toEqual(['no_logs'])
  })
  it('a sentence is judged by an agent that only reads, once per task, against what main was before the merge', async () => {
    const seen: RunInput[] = []
    const execute = async (i: RunInput) => { seen.push(i); return { status: 'completed' as const, costUsd: 0.25, summary: `It reads fine.\n\`\`\`probe\n{"pass": ${seen.length === 1 ? 'false' : 'true'}, "evidence": "sample", "findings": ${seen.length === 1 ? '["a log file is left behind (sample)"]' : '[]'}}\n\`\`\`` } }
    const t = await (await startTrial(appId, { key: 'req:tidy', probe: { name: 'Tidy (sample)', kind: 'judged', runs: 'Nothing is left behind.' }, limit: 2 }, execute)).done
    expect(seen).toHaveLength(2); expect(seen.every((i) => i.readOnly)).toBe(true); expect(seen[0].subIssue.brief).toContain(`git diff ${t.results[0].sha}^1...HEAD`); expect(seen[0].subIssue.brief).toContain('Tidy (sample): Nothing is left behind.')
    expect(t.results.map((r) => [r.pass, r.findings.length])).toEqual([[false, 1], [true, 0]]); expect(t.costUsd).toBe('0.50')
    expect((await trialsOf(appId, true)).map((x) => x.key)).toEqual(['req:tidy', 'no_logs'])
  })
  it('says why it cannot start: nothing to run, or no merged task', async () => {
    await expect(startTrial(appId, { key: 'x', probe: { name: 'x', kind: 'command', runs: ' ' } })).rejects.toThrow('needs a probe')
    await db.update(pr).set({ status: 'open' }).where(eq(pr.appId, appId))
    await expect(startTrial(appId, { key: 'x', probe: { name: 'x', kind: 'command', runs: 'true' } })).rejects.toThrow('no merged task')
  })
})
