/**
 * An app's workbench folder and its hooks (Sandy, 2026-11-24: "evident has a bunch of different lifecycle events that
 * we can hook into. But they would be defined, they would be stored … in the workbench … You don't want them in the
 * repo itself").
 *
 * What is particular to one app (who a tester is signed in as, what to tidy when a task closes) is not a setting of
 * Evident's: it is a script of that app's, kept in a folder of ours beside its repositories (`setup.workbench.dir`),
 * versioned there or not as its people choose. Evident knows only the points at which it runs one. A hook is a file in
 * the folder's `hooks/`, named for its point (`before-start`, with any extension). One that can be executed is run as
 * it is; any other is run with sh.
 *
 * - before-start: before a prototype's command or a smoke test's script, once the database is built. Lines it prints
 *   as NAME=value are given to that command, over what it would have had. A failure stops the start.
 * - after-stop, task-closed: nothing waits on them; a failure is recorded.
 *
 * Every run is an event (`hook.ran`): the point, whether it worked, the names of what it gave (never the values), and
 * on a failure its last lines. No table.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, issue } from './db/schema.js'
import { appendEvent } from './events.js'
import { identifier, PlanError } from './issues.js'
import { merged } from './setup.js'

export type Point = 'before-start' | 'after-stop' | 'task-closed'
export const POINTS: { point: Point; when: string; given: string[]; then: string }[] = [
  { point: 'before-start', when: 'Before a prototype or a smoke test starts, once its database is built.', given: ['PLACE', 'FIXTURE', 'DATABASE_URL', 'PORT', 'TASK'], then: 'Lines it prints as NAME=value are given to the start script. If it fails, nothing starts.' },
  { point: 'after-stop', when: 'After a prototype or a smoke test is stopped.', given: ['PLACE', 'DATABASE_URL', 'TASK'], then: 'Nothing waits on it. A failure is shown here.' },
  { point: 'task-closed', when: 'When a task is closed.', given: ['TASK', 'BRANCH'], then: 'Nothing waits on it. A failure is shown here.' },
]
const TEXT_MAX = 20_000, TIMEOUT = 60_000

export const workbenchDirOf = (setup: unknown): string | null => { const d = (setup as { workbench?: { dir?: unknown } } | null)?.workbench?.dir; return typeof d === 'string' && d.trim() ? d.trim() : null }

/** The file hooked at a point: `hooks/<point>` or `hooks/<point>.<anything>`, the first by name. */
export function findHook(dir: string | null, point: Point): string | null {
  const hooks = dir ? join(dir, 'hooks') : null
  if (!hooks || !existsSync(hooks)) return null
  const name = readdirSync(hooks).sort().find((f) => (f === point || f.startsWith(`${point}.`)) && statSync(join(hooks, f)).isFile())
  return name ? join('hooks', name) : null
}

/** What a hook printed that is a setting for what starts next: NAME=value lines, the value as written (one pair of quotes around it taken off). */
export function gaveOf(out: string): Record<string, string> {
  const gave: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) gave[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  return gave
}

const executable = (p: string) => { try { accessSync(p, constants.X_OK); return true } catch { return false } }
function run(file: string, cwd: string, env: Record<string, string>): Promise<{ ok: boolean; out: string; err: string[] }> {
  return new Promise((done) => {
    const proc = executable(file) ? spawn(file, [], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('sh', [file], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; const err: string[] = []
    const timer = setTimeout(() => { err.push(`took longer than ${TIMEOUT / 1000}s: stopped`); proc.kill('SIGKILL') }, TIMEOUT)
    proc.stdout.on('data', (b: Buffer) => { if (out.length < 200_000) out += b.toString() })
    proc.stderr.on('data', (b: Buffer) => { for (const l of b.toString().split('\n')) if (l.trim()) err.push(l.slice(0, 300)); if (err.length > 12) err.splice(0, err.length - 12) })
    proc.on('error', (e) => { clearTimeout(timer); done({ ok: false, out, err: [...err, e.message] }) })
    proc.on('exit', (code) => { clearTimeout(timer); if (code !== 0) err.push(`exited${code === null ? '' : ` with ${code}`}`); done({ ok: code === 0, out, err }) })
  })
}

/**
 * Run the app's hook at a point, if it has one. hooked: false when there is none (and nothing is recorded).
 * `gave` is what a before-start hook printed for the start script; empty for the other points.
 */
export async function runHook(appId: string, point: Point, env: Record<string, string>, i: { issueId?: string | null; place?: string | null } = {}): Promise<{ hooked: boolean; ok: boolean; gave: Record<string, string>; out: string[] }> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const dir = workbenchDirOf(a?.setup), file = findHook(dir, point)
  if (!a || !dir || !file) return { hooked: false, ok: true, gave: {}, out: [] }
  const [t] = i.issueId ? await db.select().from(issue).where(eq(issue.id, i.issueId)) : []
  const task = t ? identifier(a.key, t.number) : null
  const r = await run(join(dir, file), dir, { ...env, HOOK: point, WORKBENCH: dir, ...(task ? { TASK: task } : {}), ...(i.place ? { PLACE: i.place } : {}) })
  const gave = r.ok && point === 'before-start' ? gaveOf(r.out) : {}
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t?.projectId ?? null, issueId: t?.id ?? null, actor: 'engine', type: 'hook.ran', payload: { point, file, ok: r.ok, task, place: i.place ?? null, gave: Object.keys(gave), out: r.ok ? [] : r.err } }))
  return { hooked: true, ok: r.ok, gave, out: r.err }
}

/** before-start, for what is about to start: what the hook gave, to lay over the start script's settings. Throws when the hook failed. */
export async function beforeStart(appId: string, env: Record<string, string>, i: { issueId?: string | null; place: 'prototype' | 'smoke' }): Promise<Record<string, string>> {
  const r = await runHook(appId, 'before-start', env, i)
  if (!r.ok) throw new PlanError(`this app's before-start hook failed, so nothing was started: ${r.out.slice(-3).join(' · ') || 'it said nothing'}`)
  return r.gave
}

/** Run a hook nothing waits on. Never throws. */
export const afterwards = (appId: string, point: Exclude<Point, 'before-start'>, env: Record<string, string>, i: { issueId?: string | null; place?: string | null } = {}) =>
  void runHook(appId, point, env, i).catch((err) => console.error(`[engine] hook ${point}: ${err instanceof Error ? err.message : err}`))

/** The folder, each point with its file and its last run, and what else of the app's the folder holds. */
export async function workbench(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  const dir = workbenchDirOf(a.setup), found = !!dir && existsSync(dir)
  const runs = await db.select({ payload: event.payload, ts: event.ts }).from(event).where(and(eq(event.appId, appId), eq(event.type, 'hook.ran'))).orderBy(desc(event.seq)).limit(200)
  const hooks = POINTS.map((p) => {
    const file = found ? findHook(dir, p.point) : null
    let text: string | null = null
    if (file) { try { text = readFileSync(join(dir!, file), 'utf8').slice(0, TEXT_MAX) } catch { text = null } }
    const last = runs.find((r) => (r.payload as { point?: string }).point === p.point)
    const lp = last?.payload as { ok?: boolean; task?: string | null; place?: string | null; out?: string[]; gave?: string[] } | undefined
    return { ...p, file, text, last: file && last && lp ? { at: new Date(last.ts).toISOString(), ok: !!lp.ok, task: lp.task ?? null, place: lp.place ?? null, out: lp.out ?? [], gave: lp.gave ?? [] } : null }
  })
  const k = (a.setup as { review?: { kit?: unknown } } | null)?.review?.kit, kit = typeof k === 'string' ? k.trim() : ''
  const also = dir && kit && kit.startsWith(`${dir}/`) ? [{ what: 'The review kit', path: kit.slice(dir.length + 1) }] : []
  return { dir, found, hooks, also }
}

/** Name the folder, or with null take it away. It has to be on this computer. */
export async function setWorkbench(appId: string, dir: string | null) {
  const d = dir?.trim() || null
  if (d && !isAbsolute(d)) throw new PlanError('give the folder\'s whole path, from /')
  if (d && !(existsSync(d) && statSync(d).isDirectory())) throw new PlanError(`there is no folder at ${d} on this computer`)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  await db.update(app).set({ setup: merged(a.setup, { workbench: d ? { dir: d.replace(/\/+$/, '') } : null }) }).where(eq(app.id, appId))
  return workbench(appId)
}
