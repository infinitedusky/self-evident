/**
 * Making an app's workbench folder (Sandy, 2026-11-25: "there's no template in place or sort of setup script for a
 * workbench … it should either be created automatically when you create a new app or have you choose a folder at that
 * point, or it should let you create a folder and it would seed it").
 *
 * Until now Settings could only be pointed at a folder someone had already made by hand, from a template that was a
 * private repository of ours. The template is in this repository now (`engine/workbench-template/`), so every copy of
 * Evident has it: the docs site with its two sections, the docs agent's skills, and the folders hooks and mockups go
 * in. Seeding a folder puts in each file of the template the folder does not have, and never writes over one that is
 * there, so it is the same act for a new folder, an empty one somebody chose, and an old workbench missing its docs.
 * A folder that is not in a git repository becomes one, with what was put in committed; the folder's dependencies
 * are installed on their own (`pnpm install`), which is what the docs site waits for.
 *
 * It is offered where the folder is named (Settings › Workbench) and when an app is made (a box, ticked, when the
 * app has code on this computer: the folder goes beside the checkout, named `<the app>-workbench`).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { slug } from './conventions.js'
import { db } from './db/client.js'
import { app, repo } from './db/schema.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { setWorkbench, workbench, workbenchDirOf } from './hooks.js'
import { PlanError } from './issues.js'

export const TEMPLATE = fileURLToPath(new URL('../workbench-template', import.meta.url))
/** Files of the template whose text names the app. */
const NAMED = new Set(['README.md', 'package.json', join('mockups', 'README.md'), join('docs', 'index.md'), join('docs', '.vitepress', 'config.ts')])
/** What each top-level piece of the template is, for saying what a folder lacks. */
const PIECES: Record<string, string> = {
  'docs': 'the docs site', 'package.json': 'the docs site\'s dependencies', 'pnpm-lock.yaml': 'the docs site\'s dependencies', 'vendor': 'the diagram library the docs draw with',
  '.claude': 'the docs agent\'s skills', 'hooks': 'the hooks folder', 'mockups': 'the mockups folder', 'README.md': 'a README', '.gitignore': 'a .gitignore',
}

/** Pieces that are only a folder to put things in. */
const FOLDERS = new Set(['hooks', 'mockups'])

const filesIn = (root: string, at = ''): string[] => readdirSync(join(root, at)).sort().flatMap((f) => statSync(join(root, at, f)).isDirectory() ? filesIn(root, join(at, f)) : [join(at, f)])
/** The template's files, as they are named in a workbench (the template keeps .gitignore as `gitignore`, so it is not this repository's). */
export const templateFiles = (): { from: string; to: string }[] => filesIn(TEMPLATE).map((f) => ({ from: f, to: f === 'gitignore' ? '.gitignore' : f }))

const has = (dir: string, f: string) => existsSync(join(dir, f)) || (FOLDERS.has(dirname(f)) && existsSync(join(dir, dirname(f))))

/** What a folder lacks of the template: its files, and the pieces they belong to in a person's words. No folder: everything. */
export function missingIn(dir: string | null): { files: string[]; pieces: string[] } {
  // A folder that is there is not lacking for want of the template's README in it: hooks/ with a hook and no README is a hooks folder.
  const files = templateFiles().map((f) => f.to).filter((f) => !dir || !has(dir, f))
  return { files, pieces: [...new Set(files.map((f) => PIECES[f.split(sep)[0]] ?? f.split(sep)[0]))] }
}

async function placeOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  const repos = (await db.select().from(repo).where(eq(repo.appId, appId))).filter((r) => r.localPath)
  return { a, repos }
}

/** Where a new workbench would go: beside the app's first checkout on this computer, named for it. Null: the app has no code here. */
export async function suggestedDir(appId: string): Promise<string | null> {
  const { a, repos } = await placeOf(appId)
  const { homeRepo } = await import('./workbench.js')
  const home = (await homeRepo(appId))?.localPath ?? repos[0]?.localPath
  if (!home) return null
  return join(dirname(home), `${slug(a.name) || basename(home)}-workbench`)
}

const installs = new Map<string, { proc: ChildProcess; failed: boolean }>() // by folder: the install running there, or the one that failed
const installLog = (dir: string) => join(tmpdir(), 'self-evident', `workbench-install-${slug(dir, 80)}.log`)
/** Install the folder's dependencies on its own: nothing waits on it, and the view says when it is done. */
export function install(dir: string): void {
  if (installs.get(dir)?.proc.exitCode === null) return
  mkdirSync(dirname(installLog(dir)), { recursive: true })
  writeFileSync(installLog(dir), '> pnpm install\n')
  const out = openSync(installLog(dir), 'a')
  const proc = spawn('pnpm', ['install', '--ignore-workspace'], { cwd: dir, env: { ...process.env, CI: '1' }, stdio: ['ignore', out, out] })
  closeSync(out)
  const entry = { proc, failed: false }
  installs.set(dir, entry)
  proc.on('error', () => { entry.failed = true })
  proc.on('exit', (code) => { entry.failed = code !== 0 })
}

export interface SeedView {
  /** Where Evident would make the folder, when none is named. */ suggested: string | null
  /** What the named folder (or a new one) lacks of what a workbench starts with, in a person's words. */ missing: string[]
  /** Its dependencies are being installed. */ installing: boolean
  /** They are installed: the docs site can be started. */ installed: boolean
  /** The install's last lines, when it failed. */ problem: string | null
}

/** What the folder has of what a workbench starts with. */
export async function seedView(appId: string): Promise<SeedView> {
  const { a } = await placeOf(appId)
  const dir = workbenchDirOf(a.setup), there = !!dir && existsSync(dir)
  const run = dir ? installs.get(dir) : undefined
  const installing = !!run && run.proc.exitCode === null && !run.failed
  const installed = there && existsSync(join(dir!, 'node_modules', '.bin', 'vitepress'))
  let problem: string | null = null
  if (run?.failed && !installed) { try { problem = readFileSync(installLog(dir!), 'utf8').split('\n').filter((l) => l.trim()).slice(-6).join('\n') } catch { problem = 'pnpm install failed' } }
  return { suggested: dir ? null : await suggestedDir(appId), missing: missingIn(there ? dir : null).pieces, installing, installed, problem }
}

/** The app's workbench as Settings shows it: the folder and its hooks (hooks.ts), and what it has of the template. */
export const workbenchView = async (appId: string) => ({ ...(await workbench(appId)), seed: await seedView(appId) })

/**
 * Make the app's workbench folder, or fill in the one it has (or the one named here): each file of the template the
 * folder lacks is put in, none is written over. The folder becomes the app's workbench. Returns what was put in.
 */
export async function seedWorkbench(appId: string, to?: string | null, deps: { install?: (dir: string) => void } = {}) {
  const { a, repos } = await placeOf(appId)
  const dir = (to?.trim() || workbenchDirOf(a.setup) || await suggestedDir(appId))?.replace(/\/+$/, '')
  if (!dir) throw new PlanError(`${a.name} has no code on this computer to put a workbench beside: say where the folder should go`)
  if (!isAbsolute(dir)) throw new PlanError('give the folder\'s whole path, from /')
  const inside = repos.find((r) => resolve(dir) === resolve(r.localPath!) || resolve(dir).startsWith(resolve(r.localPath!) + sep))
  if (inside) throw new PlanError(`${dir} is inside the app's own code (${inside.localPath}): a workbench is a folder outside its repositories, so nothing in it goes into the app`)
  if (existsSync(dir) && !statSync(dir).isDirectory()) throw new PlanError(`${dir} is a file, not a folder`)
  if (!existsSync(dir) && !existsSync(dirname(dir))) throw new PlanError(`there is no folder at ${dirname(dir)} on this computer to make it in`)
  const made = !existsSync(dir)
  mkdirSync(dir, { recursive: true })
  const name = a.name.replace(/["\\`$]/g, '').trim() || 'This app', values: Record<string, string> = { app: name, slug: slug(a.name) || 'app' }
  const added: string[] = []
  for (const f of templateFiles()) {
    const at = join(dir, f.to)
    if (has(dir, f.to)) continue
    mkdirSync(dirname(at), { recursive: true })
    if (NAMED.has(f.from)) writeFileSync(at, readFileSync(join(TEMPLATE, f.from), 'utf8').replace(/\{\{(app|slug)\}\}/g, (_, k: string) => values[k]))
    else copyFileSync(join(TEMPLATE, f.from), at)
    added.push(f.to)
  }
  // A folder that is in no git repository becomes one, with what was put in committed. One that is in a repository
  // already is its people's to commit.
  let repoMade = false
  if ((await git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true })).code !== 0) {
    repoMade = (await git(dir, ['init', '-q', '-b', 'main'], { allowFail: true })).code === 0
    if (repoMade && added.length) { await git(dir, ['add', '-A'], { allowFail: true }); await git(dir, ['commit', '-q', '-m', `A workbench for ${name}, made by Evident`], { allowFail: true }) }
  }
  await setWorkbench(appId, dir)
  if (added.length) await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor: 'user', type: 'workbench.seeded', payload: { dir, made, repoMade, added: added.length } }))
  if (!existsSync(join(dir, 'node_modules', '.bin', 'vitepress')) && existsSync(join(dir, 'package.json'))) (deps.install ?? install)(dir)
  return { ...(await workbenchView(appId)), added, made, repoMade }
}
