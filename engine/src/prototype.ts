/**
 * Prototypes: the actual thing, built fast in a worktree of its own (branch `prototype/<slug>`, beside the builders'
 * worktrees) so it can be used, changed in moments and shown to people. Then it is analysed into the plan and built
 * again from scratch. The engine starts its server with the app's `prototype_cmd`, on a free port it passes as
 * PORT, and keeps it running; the row outlives the process, so after an engine restart a prototype reads as stopped
 * until it is started again. Each has its own conversation, working in its worktree: given a brief, it builds a first
 * version at once, and the person iterates there.
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
import { endTalk, say, showTalk, startPrototypeTalk } from './talk.js'

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

/** A free port: `want` when it is free (a restart keeps its address, so an open tab still finds it), else any. */
const freePort = (want = 0): Promise<number> => new Promise((resolveP, reject) => {
  const s = createServer()
  s.once('error', (err) => (want ? freePort(0).then(resolveP, reject) : reject(err)))
  s.listen(want, () => { const { port } = s.address() as AddressInfo; s.close(() => resolveP(port)) })
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

/** Start a prototype's server (again), on its last port when that is free, passed as PORT. A no-op while it runs, unless restart. */
export async function runPrototype(id: string, actor = 'person', opts: { restart?: boolean } = {}) {
  const p = await rowOf(id)
  if (p.status === 'discarded') throw new PlanError('that prototype was discarded')
  if (opts.restart) await kill(id)
  else if (alive(id)) return prototypeStatus(id)
  const { a, cmd } = await setupOf(p.appId)
  if (!cmd) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  const port = await freePort(p.port ?? 0)
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

/**
 * A new prototype: its branch and worktree off the app's default branch, its server, and its conversation, shown in
 * every open Self Evident with the prototype beside it. With a brief, the conversation starts building at once.
 */
export async function startPrototype(i: { appId: string; title: string; brief?: string; projectId?: string | null; actor?: string }) {
  const { a, repoPath, cmd } = await setupOf(i.appId)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout to prototype in`)
  if (!cmd) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  const id = newId('prototype')
  const slug = `${slugify(i.title)}-${id.slice(-4).toLowerCase()}`
  const branch = `prototype/${slug}`
  const path = join(`${repoPath}-worktrees`, `prototype--${slug}`)
  await addWorktree(repoPath, path, branch, a.defaultBranch)
  const [row] = await db.insert(prototype).values({ id, appId: i.appId, projectId: i.projectId ?? null, title: i.title, brief: i.brief?.trim() || null, branch, path, createdBy: i.actor ?? 'person' }).returning()
  await emit(row, 'prototype.created', i.actor ?? 'person', { branch })
  const status = await runPrototype(id, i.actor)
  const talk = await talkFor(id)
  if (row.brief) await say(talk.id, row.brief, undefined, { author: 'engine', kind: 'brief' })
  await openTab(row)
  return { ...status, sessionId: talk.id }
}

/** The prototype's conversation, shown in the agent's column; made the first time it's asked for. */
export async function talkFor(id: string) {
  const p = await rowOf(id)
  if (p.sessionId) { await showTalk(p.sessionId, p.appId); return { id: p.sessionId } }
  const s = await startPrototypeTalk(p)
  await db.update(prototype).set({ sessionId: s.id }).where(eq(prototype.id, id))
  await showTalk(s.id, p.appId)
  return { id: s.id }
}

async function openTab(p: typeof prototype.$inferSelect) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, p.appId))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a?.workspaceId ?? 'ws_none', appId: p.appId, actor: 'engine', type: 'ui.open', payload: { tab: { kind: 'prototype', id: p.id }, split: 'right' } }))
}

/** Stop its server and what it started; resolves once it has exited (or after a few seconds). */
function kill(id: string): Promise<void> {
  const m = running.get(id)
  running.delete(id)
  if (!m || m.proc.exitCode !== null || m.proc.signalCode !== null || !m.proc.pid) return Promise.resolve()
  const gone = new Promise<void>((r) => { m.proc.once('exit', () => r()); setTimeout(r, 3000) })
  try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
  return gone
}

export async function stopPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  await kill(id)
  if (p.status === 'running') { await db.update(prototype).set({ status: 'stopped', updatedAt: new Date() }).where(eq(prototype.id, id)); await emit(p, 'prototype.stopped', actor) }
  return prototypeStatus(id)
}

/** Done with it: the server stopped, its worktree and branch removed. The row stays, so what it taught can be found. */
export async function discardPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  await kill(id)
  if (p.sessionId) await endTalk(p.sessionId)
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

export function stopPrototypes() { for (const id of [...running.keys()]) void kill(id) }
