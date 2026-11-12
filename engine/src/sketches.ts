/**
 * Sketches: the first look, fast (SHAPE.md, "Where the brief sits"; Sandy, 2026-11-09: "the simple mockup is about
 * speed … It has to be right there when we're prompting"). A sketch is a plain HTML file under `sketches/` in the
 * worktree the conversation works in, so it exists the moment the agent writes it, long before anything merges. The
 * engine lists them and serves them from that worktree; the Sketches tab frames one beside the conversation and
 * reloads it when the file changes.
 *
 * The scope in the address is the conversation's id (its worktree) or the app's (the main checkout), and sits in
 * the path, not the query, so a sketch's own relative links (a stylesheet, an image, another sketch) resolve.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo, session } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { PlanError } from './projects.js'

export const SKETCH_DIR = 'sketches'

export interface Place { appId: string; root: string | null; branch: string | null; main: boolean }
/**
 * Where a conversation's files are: its own worktree and branch while it has one that is still there; otherwise the
 * app's main checkout. `scope` is a conversation's id or an app's.
 */
export async function placeOf(scope: string): Promise<Place> {
  if (scope.startsWith('sess_')) {
    const [s] = await db.select().from(session).where(eq(session.id, scope))
    if (!s?.appId) throw new PlanError(`no conversation ${scope}`)
    if (s.cwd && (await stat(s.cwd).then((x) => x.isDirectory(), () => false))) return { appId: s.appId, root: s.cwd, branch: s.branch, main: false }
    scope = s.appId
  }
  const [a] = await db.select().from(app).where(eq(app.id, scope))
  if (!a) throw new PlanError(`no app ${scope}`)
  const r = await homeRepo(a.id)
  return { appId: a.id, root: r?.localPath ?? null, branch: a.defaultBranch ?? 'main', main: true }
}

export interface Sketch { file: string; changedAt: number }
/** The HTML files under sketches/, newest first; an absent folder is no sketches, not an error. */
export async function listSketchFiles(root: string): Promise<Sketch[]> {
  const dir = join(root, SKETCH_DIR)
  const out: Sketch[] = []
  const walk = async (rel: string, depth: number) => {
    const entries = await readdir(join(dir, rel), { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory() && depth < 3 && !e.name.startsWith('.') && e.name !== 'node_modules') await walk(p, depth + 1)
      else if (e.isFile() && /\.html?$/i.test(e.name)) out.push({ file: p, changedAt: Math.round((await stat(join(dir, p))).mtimeMs) })
    }
  }
  await walk('', 0)
  return out.sort((a, b) => b.changedAt - a.changedAt)
}

export async function listSketches(scope: string) {
  const place = await placeOf(scope)
  return { scope, branch: place.branch, main: place.main, dir: SKETCH_DIR, sketches: place.root ? await listSketchFiles(place.root) : [] }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
}
/**
 * One file under sketches/, for the frame: only inside that folder, only the kinds a sketch is made of. The page is
 * sandboxed by its own header too (scripts may run, but as no origin: an agent-written page never reaches the
 * engine's API with the person's session).
 */
export async function readSketch(scope: string, file: string): Promise<{ body: Buffer; headers: Record<string, string> } | null> {
  const place = await placeOf(scope)
  if (!place.root) return null
  const dir = resolve(place.root, SKETCH_DIR)
  const path = resolve(dir, file)
  const type = TYPES[extname(path).toLowerCase()]
  if (!type || !(path === dir || path.startsWith(dir + sep))) return null
  const body = await readFile(path).catch(() => null)
  if (!body) return null
  return { body, headers: { 'content-type': type, 'cache-control': 'no-store', ...(type.startsWith('text/html') ? { 'content-security-policy': 'sandbox allow-scripts allow-forms' } : {}) } }
}
