/** Choosing repositories by folder: what a remote names, and what a picked folder holds (real git repositories, made up). */
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { git } from './git.js'
import { chooseFolder, fullNameOf, reposIn } from './folders.js'

describe('choosing repositories by folder', () => {
  it('reads owner/name from a GitHub remote, whatever the host is called', () => {
    expect(fullNameOf('git@github.com:made-up/shop-web.git')).toBe('made-up/shop-web')
    expect(fullNameOf('git@github-work:made-up/shop-api.git\n')).toBe('made-up/shop-api')
    expect(fullNameOf('https://github.com/made-up/shop-web')).toBe('made-up/shop-web')
    expect(fullNameOf('https://github.com/made-up/shop.web.git')).toBe('made-up/shop.web')
    expect(fullNameOf('ssh://git@github.com/made-up/shop-web.git')).toBe('made-up/shop-web')
    expect(fullNameOf('/code/origin.git')).toBeNull()
    expect(fullNameOf('')).toBeNull()
  })

  let dir = ''
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'se-folders-'))
    await git(dir, ['init', '-q', '-b', 'main', 'shop-web']); await git(join(dir, 'shop-web'), ['remote', 'add', 'origin', 'git@github-work:made-up/shop-web.git'])
    await git(dir, ['init', '-q', '-b', 'develop', 'shop-api']) // no remote yet
    await mkdir(join(dir, 'notes')); await mkdir(join(dir, 'shop-web-worktrees')); await mkdir(join(dir, '.hidden'))
  })

  it('lists the repositories directly inside a folder, by name, each with its remote\'s name and its branch', async () => {
    expect(await reposIn(dir)).toEqual([
      { name: 'shop-api', path: join(dir, 'shop-api'), fullName: null, branch: 'develop' },
      { name: 'shop-web', path: join(dir, 'shop-web'), fullName: 'made-up/shop-web', branch: 'main' },
    ])
  })

  it('takes a folder that is a repository as that one repository', async () => {
    expect((await reposIn(join(dir, 'shop-web'))).map((r) => r.name)).toEqual(['shop-web'])
    expect(await reposIn(join(dir, 'notes'))).toEqual([])
  })

  it('scans the folder picked in the dialog, or the one named; a closed dialog is no folder', async () => {
    expect((await chooseFolder(null, async () => dir)).repos).toHaveLength(2)
    expect(await chooseFolder(null, async () => null)).toEqual({ path: null, repos: [] })
    expect((await chooseFolder(join(dir, 'shop-api'), async () => { throw new Error('not opened') })).path).toBe(join(dir, 'shop-api'))
    await expect(chooseFolder('relative/path')).rejects.toThrow('absolute')
    await expect(chooseFolder(join(dir, 'gone'))).rejects.toThrow("doesn't exist")
  })
})
