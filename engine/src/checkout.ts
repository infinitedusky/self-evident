/**
 * A local checkout, made ready for the agents when it is set (Sandy, 2026-11-09: "if the location is not a repo, create
 * one"). A folder becomes a git repository on the app's default branch; a repository with no commits gets its first
 * one, the files as found; a repository already on another branch gives the app that branch. The engine says what it
 * did in a sentence, and anything it can't fix is a sentence too (a PlanError, so the page shows it), never a 500.
 */
import { readdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { git } from './git.js'
import { PlanError } from './issues.js'

export interface Prepared { branch: string; note: string | null }

const isRepo = async (path: string) => (await git(path, ['rev-parse', '--is-inside-work-tree'], { allowFail: true })).code === 0
const hasCommits = async (path: string) => (await git(path, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true })).code === 0
const hasBranch = async (path: string, name: string) => (await git(path, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { allowFail: true })).code === 0
async function currentBranch(path: string): Promise<string | null> {
  const r = await git(path, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true })
  return r.code === 0 ? r.stdout : null
}
const sentence = (parts: string[]) => (parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : null)

/** The folder at `path`, as a checkout: a sentence about what is wrong, or null when the agents can work there. */
export async function checkoutProblem(path: string): Promise<string | null> {
  const st = await stat(path).catch(() => null)
  if (!st) return `${path} doesn't exist on this machine.`
  if (!st.isDirectory()) return `${path} is a file, not a folder.`
  if (!(await isRepo(path))) return `${path} isn't a git repository.`
  if (!(await hasCommits(path))) return `${path} has no commits yet.`
  return null
}

/**
 * Make `path` a checkout the agents can work from, on `defaultBranch` where that is still open, and say what was done.
 * Idempotent: a checkout already in order returns its default branch and no note.
 */
export async function prepareCheckout(path: string, defaultBranch: string, appName: string): Promise<Prepared> {
  if (!isAbsolute(path)) throw new PlanError(`${path} isn't an absolute path; the local checkout is a folder on this machine, like /Users/you/code/${appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.`)
  const st = await stat(path).catch(() => null)
  if (!st) throw new PlanError(`${path} doesn't exist on this machine.`)
  if (!st.isDirectory()) throw new PlanError(`${path} is a file, not a folder.`)
  const done: string[] = []
  try {
    if (!(await isRepo(path))) {
      await git(path, ['init', '-q', '-b', defaultBranch])
      done.push(`made it a git repository on ${defaultBranch}`)
    }
    if (!(await hasCommits(path))) {
      if ((await currentBranch(path)) !== defaultBranch) { await git(path, ['symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`]); done.push(`its first branch is ${defaultBranch}`) }
      done.push(await firstCommit(path, appName))
      return { branch: defaultBranch, note: sentence(done) }
    }
    const branch = await currentBranch(path)
    if (!branch) throw new PlanError(`${path} is on no branch (a detached HEAD); check out its default branch first.`)
    if (!(await hasBranch(path, defaultBranch))) { done.push(`it is on ${branch}, so that is the app's default branch`); return { branch, note: sentence(done) } }
    return { branch: defaultBranch, note: sentence(done) }
  } catch (err) {
    if (err instanceof PlanError) throw err
    throw new PlanError(String((err as Error).message ?? err)) // git's own words ("git commit (in …): Author identity unknown"), as a sentence on the page
  }
}

/** The files as found, committed; `node_modules` kept out when nothing says what to ignore yet; an empty folder starts with an empty commit. */
async function firstCommit(path: string, appName: string): Promise<string> {
  const names = await readdir(path)
  const extra: string[] = []
  if (!names.includes('.gitignore') && names.includes('node_modules')) { await writeFile(join(path, '.gitignore'), 'node_modules/\n'); extra.push('wrote a .gitignore for node_modules') }
  await git(path, ['add', '-A'])
  const staged = (await git(path, ['diff', '--cached', '--name-only'])).stdout.split('\n').filter(Boolean).length
  if (staged === 0) { await git(path, ['commit', '-q', '--allow-empty', '-m', 'Start']); return 'started it with an empty commit' }
  await git(path, ['commit', '-q', '-m', `The files as found, when ${appName} joined Self Evident`])
  return [`committed the ${staged} file${staged === 1 ? '' : 's'} as found`, ...extra].join(', ')
}
