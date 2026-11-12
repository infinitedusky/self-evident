/**
 * Choosing an app's repositories by folder (Sandy, 2026-11-12: "select local folder and make that a chooser … then it
 * will have a list of the repos in that folder"). The engine runs on the person's computer, so it can do what a web
 * page can't: open the system's folder dialog and say what is in the folder that was picked.
 *
 * A folder that is a git repository is one repository; any other folder is the repositories directly inside it (a
 * `~/code/acme` holding `web` and `api`). Each comes back with what Settings would otherwise ask for: its GitHub
 * name, read from the origin remote, and its default branch.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { git } from './git.js'
import { PlanError } from './issues.js'

const execFileP = promisify(execFile)

export interface FoundRepo { name: string; path: string; fullName: string | null; branch: string | null }
export interface Folder { path: string | null; repos: FoundRepo[] } // path null: the dialog was closed without a pick

/** `owner/name` from a GitHub remote, whatever the host is called in ~/.ssh/config (`git@github-work:acme/web.git`). */
export function fullNameOf(remote: string): string | null {
  const m = remote.trim().match(/^(?:[\w.+-]+:\/\/)?(?:[^@/]+@)?[^:/]+[:/](?:.*\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

const isRepo = (path: string) => existsSync(join(path, '.git'))

async function describe(path: string): Promise<FoundRepo> {
  const remote = await git(path, ['remote', 'get-url', 'origin'], { allowFail: true })
  const head = await git(path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }) // origin/main: what the remote calls its default
  const here = await git(path, ['symbolic-ref', '--short', 'HEAD'], { allowFail: true }) // the branch it is on, even before a first commit; fails on a detached HEAD
  const branch = head.code === 0 && head.stdout ? head.stdout.replace(/^origin\//, '') : here.code === 0 && here.stdout ? here.stdout : null
  return { name: basename(path), path, fullName: remote.code === 0 ? fullNameOf(remote.stdout) : null, branch }
}

/** The repositories a folder holds: itself, or the ones directly inside it, by name. */
export async function reposIn(path: string): Promise<FoundRepo[]> {
  if (!isAbsolute(path)) throw new PlanError(`${path} isn't an absolute path.`)
  if (!existsSync(path)) throw new PlanError(`${path} doesn't exist on this machine.`)
  if (isRepo(path)) return [await describe(path)]
  const inside = (await readdir(path, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.') && isRepo(join(path, d.name)))
  return Promise.all(inside.map((d) => d.name).sort((x, y) => x.localeCompare(y)).map((name) => describe(join(path, name))))
}

/** The system's folder dialog, on the computer the engine runs on. Null when it is closed without a pick. */
export type Dialog = () => Promise<string | null>
const macDialog: Dialog = async () => {
  if (process.platform !== 'darwin') throw new PlanError('Choosing a folder opens the Mac folder dialog; on this system, type the path.')
  try {
    const { stdout } = await execFileP('osascript', ['-e', 'POSIX path of (choose folder with prompt "The folder your repositories are in, or one repository")'], { timeout: 10 * 60_000 })
    return stdout.trim().replace(/\/$/, '') || null
  } catch (e) {
    if (/User canceled|-128/.test(String((e as { stderr?: string }).stderr ?? e))) return null
    throw new PlanError(`The folder dialog didn't open: ${String((e as Error).message ?? e).split('\n')[0]}`)
  }
}

/** A folder and what is in it: the one named, or the one picked in the dialog. */
export async function chooseFolder(path?: string | null, dialog: Dialog = macDialog): Promise<Folder> {
  const picked = path?.trim() || await dialog()
  return picked ? { path: picked, repos: await reposIn(picked) } : { path: null, repos: [] }
}
