/**
 * The workbench: which of an app's repositories is home, where a piece of work's worktree in each of the others is,
 * what the agent is told, and (against real git repositories) a conversation starting in both and ending in both.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, session, workspace } from './db/schema.js'
import { branchExists, commitAll, git } from './git.js'
import { newId } from './ids.js'
import { endTalk, startTalk } from './talk.js'
import { homeRepo, inOrder, mateHolding, matePath, matePrompt, matesOf, reposOf, type Mate } from './workbench.js'

const api: Mate = { repoId: 'repo_b', name: 'shop-api', fullName: 'made-up/shop-api', repoPath: '/code/shop-api', path: '/code/shop-api-worktrees/talk-abc123', base: 'develop' }

describe('the workbench', () => {
  it('puts home first: the one the app names, else the first by name', () => {
    const repos = [{ id: 'repo_w', fullName: 'made-up/shop-web' }, { id: 'repo_b', fullName: 'made-up/shop-api' }]
    expect(inOrder(repos, {}).map((r) => r.id)).toEqual(['repo_b', 'repo_w'])
    expect(inOrder(repos, { home_repo: 'repo_w' }).map((r) => r.id)).toEqual(['repo_w', 'repo_b'])
    expect(inOrder(repos, { home_repo: 'repo_gone' }).map((r) => r.id)).toEqual(['repo_b', 'repo_w'])
    expect(inOrder(repos, null).map((r) => r.id)).toEqual(['repo_b', 'repo_w'])
  })

  it('names a mate\'s worktree after the home one', () => {
    expect(matePath('/code/shop-web-worktrees/talk-abc123', '/code/shop-api')).toBe('/code/shop-api-worktrees/talk-abc123')
  })

  it('tells the agent where each other repository is and that each gets its own pull request; says nothing for one repository', () => {
    expect(matePrompt([], 'talk/abc123')).toBe('')
    const said = matePrompt([api], 'talk/abc123')
    expect(said).toContain('- shop-api (made-up/shop-api): /code/shop-api-worktrees/talk-abc123, from develop')
    expect(said).toContain('on the same branch (talk/abc123)')
    expect(said).toContain('a pull request in each')
  })

  it('finds the mate a file is in, and not a folder that only starts the same', () => {
    const cwd = '/code/shop-web-worktrees/talk-abc123'
    expect(mateHolding([api], cwd, '/code/shop-api-worktrees/talk-abc123/src/orders.ts')).toBe(api)
    expect(mateHolding([api], cwd, '../../shop-api-worktrees/talk-abc123/README.md')).toBe(api)
    expect(mateHolding([api], cwd, '/code/shop-api-worktrees/talk-abc1234/src/orders.ts')).toBeNull()
    expect(mateHolding([api], cwd, '/code/shop-api/src/orders.ts')).toBeNull() // the main checkout is not the worktree
    expect(mateHolding([api], cwd, 'src/cart.ts')).toBeNull()
    expect(mateHolding([api], cwd, undefined)).toBeNull()
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a conversation in an app of two repositories', () => {
  const wsId = newId('workspace'), appId = newId('app'), webId = newId('repo'), apiId = newId('repo'), readId = newId('repo')
  let web = '', apiPath = ''
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'se-workbench-'))
    for (const [name, branch] of [['shop-web', 'main'], ['shop-api', 'develop']] as const) {
      const path = join(dir, name)
      await git(dir, ['init', '-q', '-b', branch, name])
      await git(path, ['config', 'user.email', 'made-up@example.com']); await git(path, ['config', 'user.name', 'made up'])
      await writeFile(join(path, 'README.md'), `${name}\n`); await commitAll(path, 'init')
    }
    web = join(dir, 'shop-web'); apiPath = join(dir, 'shop-api')
    await db.insert(workspace).values({ id: wsId, name: 'workbench test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase(), setup: { home_repo: webId } })
    await db.insert(repo).values([
      { id: apiId, appId, fullName: 'made-up/shop-api', localPath: apiPath, baseBranch: 'develop' },
      { id: webId, appId, fullName: 'made-up/shop-web', localPath: web },
      { id: readId, appId, fullName: 'made-up/shop-docs', localPath: join(dir, 'shop-web'), writable: false }, // a member that is only read gets no worktree
    ])
  })
  afterAll(async () => { await pool.end() })

  it('has the named repository as home', async () => {
    expect((await homeRepo(appId))?.id).toBe(webId)
    expect((await reposOf(appId)).repos.map((r) => r.id)).toEqual([webId, apiId, readId])
  })

  it('starts with a worktree in each on one branch, each cut from its own base; ending removes both, keeping the branch only where it has commits', async () => {
    const s = await startTalk({ appId })
    expect(s.cwd).toBe(join(`${web}-worktrees`, `talk-${s.id.slice(-6).toLowerCase()}`))
    const mates = await matesOf(appId, s.worktreePath)
    expect(mates.map((m) => [m.repoId, m.base])).toEqual([[apiId, 'develop']])
    expect(existsSync(join(mates[0].path, 'README.md'))).toBe(true)
    expect((await git(mates[0].path, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout).toBe(s.branch)

    await writeFile(join(mates[0].path, 'orders.ts'), 'export {}\n'); await commitAll(mates[0].path, 'orders') // work in the backend only
    const ended = await endTalk(s.id)
    expect(ended).toMatchObject({ ended: true, branchKept: s.branch, keptIn: ['shop-api'] })
    expect(existsSync(s.cwd!)).toBe(false)
    expect(existsSync(mates[0].path)).toBe(false)
    expect(await branchExists(web, s.branch!)).toBe(false) // nothing committed there
    expect(await branchExists(apiPath, s.branch!)).toBe(true)
    expect(await matesOf(appId, s.worktreePath)).toEqual([])
    await db.delete(session).where(eq(session.id, s.id))
  })
})
