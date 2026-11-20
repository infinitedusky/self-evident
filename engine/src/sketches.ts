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
import { git } from './git.js'
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

/**
 * The files this branch made or changed, under `dir` (the whole checkout when none is given): the ones that differ
 * from where it left the app's main branch, and the ones not committed yet, named from the checkout's top. Null when
 * that cannot be told (not a git checkout, no such branch): then nothing is hidden.
 */
export async function ownFiles(root: string, base: string, dir = '.'): Promise<Set<string> | null> {
  let from = ''
  for (const ref of [base, `origin/${base}`]) { const r = await git(root, ['merge-base', 'HEAD', ref], { allowFail: true }).catch(() => null); if (r?.code === 0 && r.stdout.trim()) { from = r.stdout.trim(); break } }
  if (!from) return null
  const [changed, fresh] = await Promise.all([git(root, ['diff', '--name-only', '--relative', from, '--', dir], { allowFail: true }), git(root, ['ls-files', '--others', '--exclude-standard', '--', dir], { allowFail: true })])
  if (changed.code !== 0 || fresh.code !== 0) return null
  return new Set(`${changed.stdout}\n${fresh.stdout}`.split('\n').map((l) => l.trim()).filter(Boolean))
}

/** The sketches this branch made or changed, named from `sketches/`. */
export async function ownSketches(root: string, base: string): Promise<Set<string> | null> {
  const own = await ownFiles(root, base, SKETCH_DIR)
  return own && new Set([...own].filter((l) => l.startsWith(`${SKETCH_DIR}/`)).map((l) => l.slice(SKETCH_DIR.length + 1)))
}

/**
 * A conversation's sketches are the ones it made (Sandy, 2026-11-20: "on a new task it has old sketches … totally
 * unrelated. I think a new task shouldn't show any old sketches"). Sketches merged with earlier tasks stay in the
 * repository, so every new branch carries them: they are counted (`earlier`) and left out, unless `all` asks for
 * them. A conversation with no worktree yet has made none. An app's own scope shows everything on main.
 */
export async function listSketches(scope: string, o: { all?: boolean } = {}) {
  const place = await placeOf(scope)
  const every = place.root ? await listSketchFiles(place.root) : []
  const base = { scope, branch: place.branch, main: place.main, dir: SKETCH_DIR }
  if (!scope.startsWith('sess_') || !place.root) return { ...base, sketches: every, earlier: 0 }
  const [a] = await db.select({ defaultBranch: app.defaultBranch }).from(app).where(eq(app.id, place.appId))
  const own = place.main ? new Set<string>() : await ownSketches(place.root, a?.defaultBranch ?? 'main')
  if (!own) return { ...base, sketches: every, earlier: 0 }
  const earlier = every.filter((s) => !own.has(s.file)).length
  return { ...base, sketches: o.all ? every : every.filter((s) => own.has(s.file)), earlier }
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
