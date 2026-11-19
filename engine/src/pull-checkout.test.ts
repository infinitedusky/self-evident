/** The checkout's own main follows the fetched one, by fast-forward only, and never over a person's work. Real git, sample repos. */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { commitAll, git, headSha } from './git.js'
import { ownCheckout, pullCheckout } from './github.js'

describe('the checkout follows main (sample repos)', () => {
  let local: string, teammate: string
  const teammateLands = async (file: string) => { await git(teammate, ['pull', '-q', 'origin', 'main']); await writeFile(join(teammate, file), 'sample\n'); await commitAll(teammate, `add ${file}`); await git(teammate, ['push', '-q', 'origin', 'main']); await git(local, ['fetch', '-q', 'origin', 'main']) }
  const teammateWrites = async (file: string, text: string) => { await git(teammate, ['pull', '-q', 'origin', 'main']); await writeFile(join(teammate, file), text); await commitAll(teammate, `write ${file}`); await git(teammate, ['push', '-q', 'origin', 'main']); await git(local, ['fetch', '-q', 'origin', 'main']) }
  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-pull-'))
    await git(dir, ['init', '-q', '--bare', '-b', 'main', 'origin.git'])
    for (const name of ['local', 'teammate']) {
      await git(dir, ['clone', '-q', join(dir, 'origin.git'), name])
      await git(join(dir, name), ['config', 'user.email', `${name}@example.com`]); await git(join(dir, name), ['config', 'user.name', name])
    }
    local = join(dir, 'local'); teammate = join(dir, 'teammate')
    await writeFile(join(local, 'README.md'), 'hi\n'); await commitAll(local, 'init'); await git(local, ['push', '-q', 'origin', 'main'])
  })

  it('on main with nothing changed: the files move up, and a second pass has nothing to do', async () => {
    await teammateLands('a.txt'); await teammateLands('b.txt')
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'pulled', commits: 2 })
    expect(existsSync(join(local, 'b.txt'))).toBe(true)
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'current' })
  })

  it('an untracked file of the person\'s is no reason to wait', async () => {
    await writeFile(join(local, 'notes.txt'), 'mine\n')
    await teammateLands('a.txt')
    expect((await pullCheckout(local, 'main')).state).toBe('pulled')
    expect(existsSync(join(local, 'notes.txt'))).toBe(true)
  })

  it('a changed file the new commits do not touch: main moves and the change stays', async () => {
    await teammateLands('a.txt')
    await writeFile(join(local, 'README.md'), 'half an edit\n')
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'pulled', commits: 1 })
    expect(await readFile(join(local, 'README.md'), 'utf8')).toBe('half an edit\n')
  })

  it('a change in a file the new commits also change, in another place: carried over them', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    await teammateWrites('list.txt', lines.join('\n') + '\n'); await git(local, ['merge', '-q', '--ff-only', 'origin/main'])
    await teammateWrites('list.txt', ['theirs', ...lines].join('\n') + '\n')
    await writeFile(join(local, 'list.txt'), [...lines, 'mine'].join('\n') + '\n')
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'pulled', commits: 1 })
    expect(await readFile(join(local, 'list.txt'), 'utf8')).toBe(['theirs', ...lines, 'mine'].join('\n') + '\n')
    expect((await git(local, ['stash', 'list'])).stdout).toBe('')
  })

  it('a change the new commits would collide with: left exactly as it is, and the files are named', async () => {
    await teammateWrites('README.md', 'theirs\n')
    await writeFile(join(local, 'README.md'), 'half an edit\n')
    const before = await headSha(local, 'main')
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'left', why: expect.stringMatching(/not committed/), commits: 1, files: ['README.md'] })
    expect(await headSha(local, 'main')).toBe(before)
    expect(await readFile(join(local, 'README.md'), 'utf8')).toBe('half an edit\n')
    expect((await git(local, ['stash', 'list'])).stdout).toBe('')
  })

  it('a staged change in a file the new commits change: not carried, left', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    await teammateWrites('list.txt', lines.join('\n') + '\n'); await git(local, ['merge', '-q', '--ff-only', 'origin/main'])
    await teammateWrites('list.txt', ['theirs', ...lines].join('\n') + '\n')
    await writeFile(join(local, 'list.txt'), [...lines, 'mine'].join('\n') + '\n'); await git(local, ['add', 'list.txt'])
    expect(await pullCheckout(local, 'main')).toMatchObject({ state: 'left', files: ['list.txt'] })
    expect((await git(local, ['diff', '--cached', '--name-only'])).stdout).toBe('list.txt')
  })

  it('on another branch: main\'s pointer moves, the files in front of the person stay', async () => {
    await git(local, ['checkout', '-q', '-b', 'feature'])
    await teammateLands('a.txt')
    expect(await pullCheckout(local, 'main')).toEqual({ state: 'pulled', commits: 1 })
    expect(await headSha(local, 'main')).toBe(await headSha(local, 'origin/main'))
    expect(existsSync(join(local, 'a.txt'))).toBe(false)
    expect((await git(local, ['symbolic-ref', '--short', 'HEAD'])).stdout).toBe('feature')
  })

  it('main with commits of its own: left as it is, on it or off it', async () => {
    await teammateLands('a.txt')
    await writeFile(join(local, 'mine.txt'), 'mine\n'); await commitAll(local, 'a local commit')
    const before = await headSha(local, 'main')
    expect(await pullCheckout(local, 'main')).toMatchObject({ state: 'left', why: expect.stringMatching(/commits of its own/), commits: 1 })
    await git(local, ['checkout', '-q', '-b', 'feature'])
    expect((await pullCheckout(local, 'main')).state).toBe('left')
    expect(await headSha(local, 'main')).toBe(before)
  })

  it('the checkout the engine runs from is never pulled: new engine code would restart it mid-build', () => {
    expect(ownCheckout('/code/self-evident', '/code/self-evident/engine/src/github.ts')).toBe(true)
    expect(ownCheckout('/code/self-evident', '/code/self-evident-wt/x/engine/src/github.ts')).toBe(false)
    expect(ownCheckout(local)).toBe(false)
  })
})
