/**
 * Moving between Macs, against throwaway folders: a bare repository stands in for GitHub, another for the private
 * state repository, and "the other Mac" is this one with the checkout, the worktree and Claude Code's folder deleted.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { git } from './git.js'
import { arrive, leave, mayArrive, readHolder, WIP, type Options, type Plan } from './handoff.js'
import { sessionDir } from './terminal.js'

const before = process.env.CLAUDE_CONFIG_DIR
beforeAll(() => { Object.assign(process.env, { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com' }) })
afterAll(() => { if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = before })

async function world() {
  const root = await mkdtemp(join(tmpdir(), 'se-handoff-'))
  const github = join(root, 'github.git'); const stateRepo = join(root, 'state.git')
  await git(root, ['init', '-q', '--bare', '-b', 'main', github]); await git(root, ['init', '-q', '--bare', '-b', 'main', stateRepo])
  const repo = join(root, 'golf')
  await git(root, ['clone', '-q', github, repo])
  await git(repo, ['checkout', '-q', '-b', 'main']); await writeFile(join(repo, 'a.txt'), 'a\n')
  await git(repo, ['add', '-A']); await git(repo, ['commit', '-q', '-m', 'first']); await git(repo, ['push', '-q', '-u', 'origin', 'main'])
  const path = `${repo}-worktrees/talk-abc123`
  await git(repo, ['worktree', 'add', '-q', '-b', 'talk/abc123', path, 'main'])
  process.env.CLAUDE_CONFIG_DIR = join(root, 'claude-desk')
  const plan: Plan = {
    checkouts: [{ name: 'Golf', fullName: 'made-up/golf', localPath: repo, defaultBranch: 'main' }],
    places: [{ name: 'RG · Swing', repo, path, branch: 'talk/abc123', cwd: path, agentSessionId: 'sess-1' }],
  }
  const on = (host: string, extra: Partial<Options> = {}): Options => ({ host, stateDir: join(root, `state-${host}`), stateRepo, cloneUrl: () => github, ...extra })
  /** The other Mac: none of this one's folders, its own Claude Code folder. */
  const move = async () => { await rm(repo, { recursive: true }); await rm(`${repo}-worktrees`, { recursive: true }); process.env.CLAUDE_CONFIG_DIR = join(root, 'claude-laptop') }
  return { root, github, repo, path, plan, on, move }
}

describe('leave, then arrive on the other Mac', () => {
  it('carries a conversation\'s uncommitted work, its history and the app\'s memory', async () => {
    const w = await world()
    await writeFile(join(w.path, 'sketch.html'), '<h1>swing</h1>\n')
    await mkdir(sessionDir(w.path), { recursive: true }); await writeFile(join(sessionDir(w.path), 'sess-1.jsonl'), '{"turn":1}\n')
    await writeFile(join(sessionDir(w.path), 'other.jsonl'), '{"not":"ours"}\n')
    await mkdir(join(sessionDir(w.repo), 'memory'), { recursive: true }); await writeFile(join(sessionDir(w.repo), 'memory', 'MEMORY.md'), '- a note\n')

    const left = await leave(w.plan, w.on('desk'))
    expect(left).toEqual([{ name: 'RG · Swing', what: 'talk/abc123 pushed, with its uncommitted work committed', ok: true }, { name: 'histories', what: '2 sent', ok: true }])
    expect((await git(w.github, ['log', '-1', '--format=%s', 'talk/abc123'])).stdout).toBe(WIP('desk'))
    expect(readHolder(w.on('desk').stateDir)?.holder).toBeNull()

    await w.move()
    const came = await arrive(w.plan, w.on('laptop'))
    expect(came).toEqual([
      { name: 'Golf', what: `cloned to ${w.repo}`, ok: true },
      { name: 'RG · Swing', what: 'worktree made from talk/abc123', ok: true },
      { name: 'histories', what: 'brought in', ok: true },
    ])
    expect(await readFile(join(w.path, 'sketch.html'), 'utf8')).toBe('<h1>swing</h1>\n')
    expect((await git(w.path, ['rev-parse', '--abbrev-ref', '@{u}'])).stdout).toBe('origin/talk/abc123')
    expect(await readFile(join(sessionDir(w.path), 'sess-1.jsonl'), 'utf8')).toBe('{"turn":1}\n')
    expect(existsSync(join(sessionDir(w.path), 'other.jsonl'))).toBe(false) // a session that isn't a conversation's stays home
    expect(await readFile(join(sessionDir(w.repo), 'memory', 'MEMORY.md'), 'utf8')).toBe('- a note\n')
    expect(readHolder(w.on('laptop').stateDir)?.holder).toBe('laptop')
  })

  it('comes back: the work done on the other Mac fast-forwards the worktree that stayed here', async () => {
    const w = await world()
    await leave(w.plan, w.on('desk'))
    const laptop = join(w.root, 'laptop-clone') // the other Mac's copy, kept beside this one so this one stays
    await git(w.root, ['clone', '-q', w.github, laptop]); await git(laptop, ['checkout', '-q', 'talk/abc123'])
    await writeFile(join(laptop, 'b.txt'), 'b\n'); await git(laptop, ['add', '-A']); await git(laptop, ['commit', '-q', '-m', 'on the laptop']); await git(laptop, ['push', '-q'])

    const came = await arrive(w.plan, w.on('desk'))
    expect(came).toEqual([{ name: 'Golf', what: 'up to date with GitHub', ok: true }, { name: 'RG · Swing', what: 'talk/abc123 up to date', ok: true }]) // no history was written in this one
    expect(await readFile(join(w.path, 'b.txt'), 'utf8')).toBe('b\n')
  })

  it('refuses to arrive while another Mac holds the engine, unless forced', async () => {
    const w = await world()
    await arrive(w.plan, w.on('desk'))
    await expect(arrive(w.plan, w.on('laptop'))).rejects.toThrow(/desk still holds the engine/)
    await arrive(w.plan, w.on('laptop', { force: true }))
    expect(readHolder(w.on('laptop').stateDir)?.holder).toBe('laptop')
    expect(mayArrive({ holder: null, by: 'desk', at: '' }, 'laptop')).toBe(true)
    expect(mayArrive({ holder: 'laptop', by: 'laptop', at: '' }, 'laptop')).toBe(true)
  })

  it('leaves a branch alone when asked, says so, and reports a main checkout with unpushed work', async () => {
    const w = await world()
    await writeFile(join(w.path, 'model.glb'), 'not ours to publish\n')
    await writeFile(join(w.repo, 'c.txt'), 'c\n'); await git(w.repo, ['add', '-A']); await git(w.repo, ['commit', '-q', '-m', 'local only'])
    const left = await leave(w.plan, w.on('desk', { except: ['talk/abc123'] }))
    expect(left).toEqual([
      { name: 'RG · Swing', what: 'talk/abc123 left alone, as asked: it stays on this Mac', ok: false },
      { name: 'Golf', what: 'the main checkout has 1 unpushed commits: not moved', ok: false },
      { name: 'histories', what: '0 sent', ok: true },
    ])
    expect((await git(w.github, ['branch', '--list', 'talk/abc123'])).stdout).toBe('')
    expect((await git(w.path, ['status', '--porcelain'])).stdout).toBe('?? model.glb')
  })

  it('never pushes or fetches for an app whose GitHub repository Self Evident was not given', async () => {
    const w = await world()
    const plan: Plan = { ...w.plan, checkouts: [{ ...w.plan.checkouts[0], fullName: null }] }
    await writeFile(join(w.path, 'client.txt'), 'theirs\n')
    const left = await leave(plan, w.on('desk'))
    expect(left[0]).toEqual({ name: 'RG · Swing', what: 'its app has no GitHub repository in Self Evident, so talk/abc123 stays on this Mac', ok: false })
    expect((await git(w.github, ['branch', '--list', 'talk/abc123'])).stdout).toBe('')
    const laptop = join(w.root, 'elsewhere'); await git(w.root, ['clone', '-q', w.github, laptop])
    await writeFile(join(laptop, 'new.txt'), 'n\n'); await git(laptop, ['add', '-A']); await git(laptop, ['commit', '-q', '-m', 'upstream moved']); await git(laptop, ['push', '-q'])
    const sha = (await git(w.repo, ['rev-parse', 'origin/main'])).stdout
    await arrive(plan, w.on('desk'))
    expect((await git(w.repo, ['rev-parse', 'origin/main'])).stdout).toBe(sha) // not fetched
  })

  it('does not overwrite this Mac\'s histories when it arrives without having left', async () => {
    const w = await world()
    await mkdir(sessionDir(w.path), { recursive: true }); await writeFile(join(sessionDir(w.path), 'sess-1.jsonl'), '{"turn":1}\n')
    await leave(w.plan, w.on('desk')); await arrive(w.plan, w.on('desk'))
    await writeFile(join(sessionDir(w.path), 'sess-1.jsonl'), '{"turn":1}\n{"turn":2}\n')
    const came = await arrive(w.plan, w.on('desk'))
    expect(came.some((l) => l.name === 'histories')).toBe(false)
    expect(await readFile(join(sessionDir(w.path), 'sess-1.jsonl'), 'utf8')).toBe('{"turn":1}\n{"turn":2}\n')
  })
})
