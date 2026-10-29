/**
 * Prototypes: the actual thing, built fast in a worktree of its own (branch `prototype/<slug>`, beside the builders'
 * worktrees) so it can be used, changed in moments and shown to people. Then it is analysed into the plan and built
 * again from scratch. The engine starts its server with the app's `prototype_cmd`, on a free port it passes as
 * PORT, and keeps it running; the row outlives the process, so after an engine restart a prototype reads as stopped
 * until it is started again.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, prototype, repo } from './db/schema.js'
import { appendEvent } from './events.js'
import { addWorktree, git, removeWorktree } from './git.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'

const running = new Map<string, { proc: ChildProcess; log: string[] }>()
const alive = (id: string) => { const m = running.get(id); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const [r] = await db.select().from(repo).where(eq(repo.appId, appId))
  const s = (a.setup ?? {}) as { prototype_cmd?: string }
  return { a, repoPath: r?.localPath ?? null, cmd: s.prototype_cmd?.trim() || null }
}

async function rowOf(id: string) {
  const [p] = await db.select().from(prototype).where(eq(prototype.id, id))
  if (!p) throw new PlanError(`no prototype ${id}`)
  return p
}

const freePort = () => new Promise<number>((resolveP, reject) => {
  const s = createServer()
  s.once('error', reject)
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => resolveP(port)) })
})

const slugify = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'prototype'

const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.status < 500).catch(() => false)

async function emit(p: typeof prototype.$inferSelect, type: string, actor: string, payload: Record<string, unknown> = {}) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, p.appId))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a?.workspaceId ?? 'ws_none', appId: p.appId, projectId: p.projectId, actor, type, payload: { prototypeId: p.id, title: p.title, ...payload } }))
}

/** A prototype as the UI and the agent see it: running means its server is ours and alive, up that it answers. */
export async function prototypeStatus(id: string) {
  const p = await rowOf(id)
  const on = alive(id)
  const url = p.port ? `http://localhost:${p.port}` : null
  return { ...p, status: p.status === 'running' && !on ? 'stopped' : p.status, url, up: on && url ? await answers(url) : false, log: running.get(id)?.log.slice(-40) ?? [] }
}

export async function listPrototypes(appId: string) {
  const rows = await db.select().from(prototype).where(and(eq(prototype.appId, appId), ne(prototype.status, 'discarded'))).orderBy(desc(prototype.createdAt))
  return rows.map((p) => ({ ...p, status: p.status === 'running' && !alive(p.id) ? 'stopped' : p.status, url: p.port ? `http://localhost:${p.port}` : null }))
}

/** Start a prototype's server (again): a fresh free port each time, passed as PORT. A no-op while it runs. */
export async function runPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  if (p.status === 'discarded') throw new PlanError('that prototype was discarded')
  if (alive(id)) return prototypeStatus(id)
  const { a, cmd } = await setupOf(p.appId)
  if (!cmd) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  const port = await freePort()
  // Its own process group, so stopping it also stops what the command started (a package manager's dev server).
  const proc = spawn('sh', ['-c', cmd], { cwd: p.path, env: { ...process.env, PORT: String(port), BROWSER: 'none', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(id, { proc, log })
  await db.update(prototype).set({ port, status: 'running', updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.started', actor, { port })
  return prototypeStatus(id)
}

/** A new prototype: its branch and worktree off the app's default branch, then its server. */
export async function startPrototype(i: { appId: string; title: string; projectId?: string | null; actor?: string }) {
  const { a, repoPath, cmd } = await setupOf(i.appId)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout to prototype in`)
  if (!cmd) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  const id = newId('prototype')
  const slug = `${slugify(i.title)}-${id.slice(-4).toLowerCase()}`
  const branch = `prototype/${slug}`
  const path = join(`${repoPath}-worktrees`, `prototype--${slug}`)
  await addWorktree(repoPath, path, branch, a.defaultBranch)
  const [p] = await db.insert(prototype).values({ id, appId: i.appId, projectId: i.projectId ?? null, title: i.title, branch, path, createdBy: i.actor ?? 'person' }).returning()
  await emit(p, 'prototype.created', i.actor ?? 'person', { branch })
  return runPrototype(id, i.actor)
}

function kill(id: string) {
  const m = running.get(id)
  running.delete(id)
  if (!m || m.proc.exitCode !== null || !m.proc.pid) return
  try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
}

export async function stopPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  kill(id)
  if (p.status === 'running') { await db.update(prototype).set({ status: 'stopped', updatedAt: new Date() }).where(eq(prototype.id, id)); await emit(p, 'prototype.stopped', actor) }
  return prototypeStatus(id)
}

/** Done with it: the server stopped, its worktree and branch removed. The row stays, so what it taught can be found. */
export async function discardPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  kill(id)
  const { repoPath } = await setupOf(p.appId)
  if (repoPath) { await removeWorktree(repoPath, p.path); await git(repoPath, ['branch', '-D', p.branch], { allowFail: true }) }
  await db.update(prototype).set({ status: 'discarded', updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.discarded', actor)
  return prototypeStatus(id)
}

/** How this app's prototype server starts: a shell command run in the prototype's worktree, serving on $PORT. */
export async function setPrototypeCommand(appId: string, cmd: string) {
  const { a } = await setupOf(appId)
  await db.update(app).set({ setup: { ...(a.setup as object), prototype_cmd: cmd.trim() } }).where(eq(app.id, appId))
  return { prototype_cmd: cmd.trim() }
}

export function stopPrototypes() { for (const id of [...running.keys()]) kill(id) }
