/**
 * An app's docs site, shown inside Evident (Sandy, 2026-11-24: "the docs would just be in the left nav near my stuff,
 * and … we would just be showing the VitePress page").
 *
 * The docs are files, not rows: a VitePress site in the app's workbench folder (hooks.ts, `setup.workbench.dir`), under
 * `docs/`, made from the docs template. They are versioned there with the rest of what is ours about the app, they
 * have the diagrams, the sidebar and the search, and anyone (or any agent) who edits a file sees the page change. The
 * engine starts the site on request, on a port that is the folder's own, and the Docs page frames it. Like an app's
 * Storybook it runs on its own and not as the engine's child, so it outlives an engine restart and is found again by
 * asking its address.
 *
 * It is run by the folder's own VitePress (`node_modules/.bin/vitepress dev docs --port <port>`), not by a script of
 * the folder's, so no command has to be set. A folder whose dependencies are not installed says so.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, openSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { workbenchDirOf } from './hooks.js'
import { PlanError } from './projects.js'
import { frameUrl } from './storybook.js'

const running = new Map<string, ChildProcess>() // by the workbench folder

/** A folder's own port, the same every time, away from the Storybooks' (6100 to 6899). */
export function docsPort(dir: string): number {
  let h = 0
  for (const c of dir) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return 6900 + (h % 90)
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()
/** What a workbench folder has of a docs site: the site itself (`docs/.vitepress`), and the VitePress that runs it. */
export function siteIn(dir: string | null): { found: boolean; has: boolean; bin: string | null } {
  if (!dir || !isDir(dir)) return { found: false, has: false, bin: null }
  const bin = join(dir, 'node_modules', '.bin', 'vitepress')
  return { found: true, has: isDir(join(dir, 'docs', '.vitepress')), bin: existsSync(bin) ? bin : null }
}

const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok || r.status < 500).catch(() => false)
const logFile = (dir: string) => join(tmpdir(), 'self-evident', `docs-${docsPort(dir)}.log`)
const logTail = async (dir: string) => (await readFile(logFile(dir), 'utf8').catch(() => '')).split('\n').filter((l) => l.trim()).slice(-20).map((l) => l.slice(0, 300))

export interface DocsSite {
  /** The app's workbench folder; null when none is named. */ dir: string | null
  /** The folder is on this computer. */ found: boolean
  /** It holds a docs site. */ has: boolean
  /** Why it cannot be started, when it has a site and cannot. */ problem: string | null
  url: string | null; /** The address a page frames it at (storybook.ts, frameUrl). */ frame: string | null
  up: boolean; startedHere: boolean; log: string[]
}

async function dirOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  return { a, dir: workbenchDirOf(a.setup) }
}

export async function docsSite(appId: string, deps: { answers?: (url: string) => Promise<boolean> } = {}): Promise<DocsSite> {
  const { dir } = await dirOf(appId)
  const s = siteIn(dir)
  if (!dir || !s.has) return { dir, found: s.found, has: false, problem: null, url: null, frame: null, up: false, startedHere: false, log: [] }
  const url = `http://localhost:${docsPort(dir)}`
  const up = await (deps.answers ?? answers)(url)
  const mine = running.get(dir)
  return {
    dir, found: true, has: true, problem: up || s.bin ? null : `VitePress is not installed in ${dir}: run \`pnpm install\` there, then start it here.`,
    url, frame: frameUrl(url), up, startedHere: !!mine && mine.exitCode === null, log: up ? [] : await logTail(dir),
  }
}

/** Start the site, or leave the one that is answering. Its output goes to a file, whose last lines the page shows until it answers. */
export async function startDocsSite(appId: string): Promise<DocsSite> {
  const { a, dir } = await dirOf(appId)
  const s = siteIn(dir)
  if (!dir) throw new PlanError(`${a.name} has no workbench folder: name one under Settings › Workbench.`)
  if (!s.found) throw new PlanError(`there is no folder at ${dir} on this computer`)
  if (!s.has) throw new PlanError(`${dir} has no docs site: a docs/ folder with VitePress in it.`)
  const now = await docsSite(appId)
  if (now.up || now.startedHere) return now
  if (!s.bin) throw new PlanError(now.problem!)
  await mkdir(dirname(logFile(dir)), { recursive: true })
  await writeFile(logFile(dir), `> vitepress dev docs --port ${docsPort(dir)}\n`)
  const out = openSync(logFile(dir), 'a')
  const proc = spawn(s.bin, ['dev', 'docs', '--port', String(docsPort(dir)), '--strictPort'], { cwd: dir, env: { ...process.env, BROWSER: 'none', CI: '1' }, stdio: ['ignore', out, out], detached: true })
  proc.unref()
  closeSync(out)
  running.set(dir, proc)
  return docsSite(appId)
}
