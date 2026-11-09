/** A local checkout made ready: a folder becomes a repository, a repository gets its first commit, the branch follows. Against throwaway folders. */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkoutProblem, prepareCheckout } from './checkout.js'
import { commitAll, git } from './git.js'
import { PlanError } from './issues.js'

beforeAll(() => { // a folder that isn't a repository yet has no place for a git identity; the commit takes it from the environment
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com' })
})
const folder = () => mkdtemp(join(tmpdir(), 'se-checkout-'))
const branchOf = async (p: string) => (await git(p, ['symbolic-ref', '--short', 'HEAD'])).stdout
const commits = async (p: string) => (await git(p, ['rev-list', '--count', 'HEAD'])).stdout

describe('prepareCheckout', () => {
  it('makes a folder with files a repository on the default branch, the files as found committed', async () => {
    const p = await folder()
    await writeFile(join(p, 'index.html'), '<h1>golf</h1>\n'); await mkdir(join(p, 'src')); await writeFile(join(p, 'src', 'main.js'), 'swing()\n')
    const r = await prepareCheckout(p, 'main', 'Ragdoll Golf')
    expect(r).toEqual({ branch: 'main', note: 'Made it a git repository on main, committed the 2 files as found.' })
    expect(await branchOf(p)).toBe('main'); expect(await commits(p)).toBe('1')
    expect((await git(p, ['status', '--porcelain'])).stdout).toBe('')
    expect((await git(p, ['log', '-1', '--format=%s'])).stdout).toBe('The files as found, when Ragdoll Golf joined Self Evident')
  })

  it('keeps node_modules out when nothing says what to ignore yet', async () => {
    const p = await folder()
    await writeFile(join(p, 'package.json'), '{}\n'); await mkdir(join(p, 'node_modules')); await writeFile(join(p, 'node_modules', 'x.js'), '')
    const r = await prepareCheckout(p, 'main', 'Shop')
    expect(r.note).toBe('Made it a git repository on main, committed the 2 files as found, wrote a .gitignore for node_modules.')
    expect(await readFile(join(p, '.gitignore'), 'utf8')).toBe('node_modules/\n')
    expect((await git(p, ['ls-files'])).stdout.split('\n').sort()).toEqual(['.gitignore', 'package.json'])
  })

  it('starts an empty folder with an empty commit', async () => {
    const p = await folder()
    expect(await prepareCheckout(p, 'main', 'Blank')).toEqual({ branch: 'main', note: 'Made it a git repository on main, started it with an empty commit.' })
    expect(await commits(p)).toBe('1')
  })

  it('gives a repository with no commits yet its first, on the default branch even when git started it elsewhere', async () => {
    const p = await folder()
    await git(p, ['init', '-q', '-b', 'master']); await writeFile(join(p, 'a.txt'), 'a\n')
    const r = await prepareCheckout(p, 'main', 'Old')
    expect(r).toEqual({ branch: 'main', note: 'Its first branch is main, committed the 1 file as found.' })
    expect(await branchOf(p)).toBe('main'); expect(await hasBranch(p, 'master')).toBe(false)
  })

  it('follows a repository already on another branch instead of inventing the default one', async () => {
    const p = await folder()
    await git(p, ['init', '-q', '-b', 'trunk']); await writeFile(join(p, 'a.txt'), 'a\n'); await commitAll(p, 'first')
    expect(await prepareCheckout(p, 'main', 'Trunky')).toEqual({ branch: 'trunk', note: "It is on trunk, so that is the app's default branch." })
    expect(await hasBranch(p, 'main')).toBe(false)
  })

  it('leaves a checkout in order alone and says nothing', async () => {
    const p = await folder()
    await git(p, ['init', '-q', '-b', 'main']); await writeFile(join(p, 'a.txt'), 'a\n'); await commitAll(p, 'first')
    expect(await prepareCheckout(p, 'main', 'Fine')).toEqual({ branch: 'main', note: null })
    expect(await commits(p)).toBe('1')
  })

  it('refuses, in a sentence, what it cannot make a checkout of', async () => {
    const p = await folder()
    await writeFile(join(p, 'file.txt'), 'x')
    await expect(prepareCheckout('code/relative', 'main', 'Rel App')).rejects.toThrow(new PlanError("code/relative isn't an absolute path; the local checkout is a folder on this machine, like /Users/you/code/rel-app."))
    await expect(prepareCheckout(join(p, 'missing'), 'main', 'X')).rejects.toThrow(/doesn't exist on this machine\.$/)
    await expect(prepareCheckout(join(p, 'file.txt'), 'main', 'X')).rejects.toThrow(/is a file, not a folder\.$/)
    const detached = await folder()
    await git(detached, ['init', '-q', '-b', 'main']); await writeFile(join(detached, 'a.txt'), 'a\n'); await commitAll(detached, 'first'); await git(detached, ['checkout', '-q', '--detach'])
    await expect(prepareCheckout(detached, 'main', 'X')).rejects.toThrow(/is on no branch \(a detached HEAD\)/)
  })
})

describe('checkoutProblem', () => {
  it('names the first thing wrong, or nothing', async () => {
    const p = await folder()
    expect(await checkoutProblem(join(p, 'nope'))).toMatch(/doesn't exist on this machine\.$/)
    expect(await checkoutProblem(p)).toMatch(/isn't a git repository\.$/)
    await git(p, ['init', '-q', '-b', 'main'])
    expect(await checkoutProblem(p)).toMatch(/has no commits yet\.$/)
    await writeFile(join(p, 'a.txt'), 'a\n'); await commitAll(p, 'first')
    expect(await checkoutProblem(p)).toBeNull()
  })
})

const hasBranch = async (p: string, name: string) => (await git(p, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { allowFail: true })).code === 0
