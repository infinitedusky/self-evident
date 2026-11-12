/**
 * The workbench (Sandy, 2026-11-12: "a single project that could have multiple repos underneath it … the agent's job
 * was to make edits to the repos and to do PRs for those repos, create work trees"). An app is one or more
 * repositories that are worked on together: a frontend and the backend it talks to. A task belongs to the app; a
 * worktree and a pull request belong to a repository.
 *
 * This file is the one place that says which repositories an app is made of, which of them is home, and where a
 * piece of work's worktree in each of the others is (InDusk's lesson: two places answering that apart disagree, and
 * nothing says so).
 *
 * - Home: the repository an agent starts in (its folder, the app's Storybook, test command and prototypes). The one
 *   named in `setup.home_repo`, else the first by name. An app with one repository is all home.
 * - Mates: the other repositories with a checkout on this computer that may be written to. A piece of work that has
 *   a worktree at `<home>-worktrees/<slug>` has, in each mate, `<mate>-worktrees/<slug>` on the same branch, cut from
 *   that repository's base branch. The path is the record: nothing is stored, so it is the same on every computer.
 */
import { existsSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo } from './db/schema.js'
import { checkoutProblem } from './checkout.js'
import { addWorktree, git, removeWorktree } from './git.js'
import { withLock } from './landing.js'

type Repo = typeof repo.$inferSelect
export interface Mate { repoId: string; name: string; fullName: string; repoPath: string; path: string; base: string }

const shortName = (fullName: string) => fullName.split('/').pop() || fullName

/** An app's repositories in order: home first, then the rest by name. */
export function inOrder<T extends { id: string; fullName: string }>(repos: T[], setup: unknown): T[] {
  const home = (setup as { home_repo?: unknown } | null | undefined)?.home_repo
  return [...repos].sort((x, y) => Number(y.id === home) - Number(x.id === home) || x.fullName.localeCompare(y.fullName))
}

/** The app and its repositories, home first. */
export async function reposOf(appId: string): Promise<{ app: typeof app.$inferSelect | undefined; repos: Repo[] }> {
  const [[a], repos] = await Promise.all([db.select().from(app).where(eq(app.id, appId)), db.select().from(repo).where(eq(repo.appId, appId))])
  return { app: a, repos: inOrder(repos, a?.setup) }
}

/** The repository an app's agents start in. */
export const homeRepo = async (appId: string): Promise<Repo | undefined> => (await reposOf(appId)).repos[0]

/** Where a mate's worktree for the piece of work at `worktreePath` is. */
export const matePath = (worktreePath: string, mateLocalPath: string) => join(`${mateLocalPath}-worktrees`, basename(worktreePath))

/** The other repositories that can be worked in on this computer, with where this piece of work's worktree in each would be. */
async function candidates(appId: string, worktreePath: string): Promise<Mate[]> {
  const { app: a, repos } = await reposOf(appId)
  return repos.slice(1).filter((r) => r.localPath && r.writable).map((r) => ({
    repoId: r.id, name: shortName(r.fullName), fullName: r.fullName, repoPath: r.localPath!, path: matePath(worktreePath, r.localPath!), base: r.baseBranch ?? a?.defaultBranch ?? 'main',
  }))
}

/** The mates of the piece of work at `worktreePath` that are there to work in. */
export async function matesOf(appId: string | null | undefined, worktreePath: string | null | undefined): Promise<Mate[]> {
  if (!appId || !worktreePath) return []
  return (await candidates(appId, worktreePath)).filter((m) => existsSync(m.path))
}

/**
 * A worktree in each mate for the piece of work at `worktreePath`, on `branch`, cut from the mate's base branch as it
 * is on origin. A mate whose checkout can't be worked from is left out, and said in `left`. Idempotent.
 */
export async function addMates(appId: string, worktreePath: string, branch: string): Promise<{ mates: Mate[]; left: string[] }> {
  const mates: Mate[] = []
  const left: string[] = []
  for (const m of await candidates(appId, worktreePath)) {
    const problem = await checkoutProblem(m.repoPath)
    if (problem) { left.push(`${m.name}: ${problem}`); continue }
    try {
      await withLock(`git:${m.repoPath}`, async () => {
        await git(m.repoPath, ['fetch', '-q', 'origin', m.base], { allowFail: true })
        const from = (await git(m.repoPath, ['rev-parse', '--verify', '--quiet', `origin/${m.base}`], { allowFail: true })).code === 0 ? `origin/${m.base}` : m.base
        await addWorktree(m.repoPath, m.path, branch, from)
      })
      mates.push(m)
    } catch (e) { left.push(`${m.name}: ${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200)}`) }
  }
  return { mates, left }
}

/** Remove each mate's worktree; its branch too when nothing was committed on it. Returns the branches kept. */
export async function removeMates(appId: string, worktreePath: string, branch: string | null): Promise<{ name: string; branch: string }[]> {
  const kept: { name: string; branch: string }[] = []
  for (const m of await matesOf(appId, worktreePath)) {
    await withLock(`git:${m.repoPath}`, async () => {
      await removeWorktree(m.repoPath, m.path)
      if (!branch) return
      const from = (await git(m.repoPath, ['rev-parse', '--verify', '--quiet', `origin/${m.base}`], { allowFail: true })).code === 0 ? `origin/${m.base}` : m.base // the same base it was cut from
      const ahead = await git(m.repoPath, ['rev-list', '--count', `${from}..${branch}`], { allowFail: true })
      if (ahead.code === 0 && Number(ahead.stdout) === 0) await git(m.repoPath, ['branch', '-D', branch], { allowFail: true })
      else kept.push({ name: m.name, branch })
    })
  }
  return kept
}

/** What the agent is told about them; nothing when the app is one repository. */
export function matePrompt(mates: Mate[], branch: string | null): string {
  if (!mates.length) return ''
  return ['', '', `This app is more than one repository, worked on together. Besides the folder you are in, you have a worktree of each of the others${branch ? `, on the same branch (${branch})` : ''}, cut from that repository's base branch:`,
    ...mates.map((m) => `- ${m.name} (${m.fullName}): ${m.path}, from ${m.base}`),
    'Edit and commit in whichever the work needs; git and gh commands act on the repository of the folder they run in, so run them from that worktree. Work that changes more than one is a commit and a pull request in each: say in each pull request which one it goes with in the other, and which has to merge first.'].join('\n')
}

/** The mate a file is in, if any. */
export function mateHolding(mates: Mate[], cwd: string, file: unknown): Mate | null {
  if (typeof file !== 'string' || !file) return null
  const at = resolve(cwd, file) + sep
  return mates.find((m) => at.startsWith(resolve(m.path) + sep)) ?? null
}
