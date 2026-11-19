/**
 * Prototypes: the thing built the way we would ship it, in a worktree of its own (branch `prototype/<slug>`, beside
 * the builders' worktrees), to show with evidence that it works (Sandy, 2026-11-13; before that, "built fast"). Only
 * what is outside the system is faked, through seams. Then it is analysed into the plan; it is not merged. The engine starts its server with the app's `prototype_cmd`, on a free port it passes as
 * PORT, and keeps it running; the row outlives the process, so after an engine restart a prototype reads as stopped
 * until it is started again. Each has its own conversation, working in its worktree: given a brief, it builds a first
 * version at once, and the person iterates there.
 */
import { patchSetup } from './setup.js'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, join } from 'node:path'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, prototype, repo } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { appendEvent } from './events.js'
import { addWorktree, git, removeWorktree } from './git.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'
import { guideOf, hasGuide, NO_GUIDE, recheckGuide, staleSays } from './share-guide.js'
import { morePorts, straySays, straysOf } from './ports.js'
import { databaseExists, databaseName, databaseUrl, dropDatabase, dropScenarios, listScenarios, rebuild, save, scenarioTables, writeScenario, type PrototypeDb, type Tables } from './prototype-data.js'
import { endTalk, say, showTalk, startPrototypeTalk } from './talk.js'

const STOP_TIMEOUT_MS = Number(process.env.PROTOTYPE_STOP_TIMEOUT_MS ?? 120_000)
const running = new Map<string, { proc: ChildProcess; log: string[]; given?: number[]; stray?: { at: number; ports: number[] } }>()
const alive = (id: string) => { const m = running.get(id); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const r = await homeRepo(appId)
  const s = (a.setup ?? {}) as { prototype_cmd?: string; prototype_stop_cmd?: string; prototype_discard_cmd?: string; prototype_db?: PrototypeDb }
  return { a, repoPath: r?.localPath ?? null, cmd: s.prototype_cmd?.trim() || null, stopCmd: s.prototype_stop_cmd?.trim() || null, discardCmd: s.prototype_discard_cmd?.trim() || null, dbCfg: s.prototype_db?.url ? s.prototype_db : null }
}

// From its folder, not its git branch: the branch changes when the task moves to another task branch, its database does not.
const slugOf = (p: typeof prototype.$inferSelect) => { const b = basename(p.path); return b.startsWith('prototype--') ? b.slice('prototype--'.length) : p.branch.slice('prototype/'.length) }

/** What the prototype's server and its conversation are given: the app's database variable, at its own database. */
export async function prototypeEnv(p: typeof prototype.$inferSelect): Promise<Record<string, string>> {
  const { dbCfg } = await setupOf(p.appId)
  return dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, slugOf(p)) } : {}
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
  const { dbCfg } = await setupOf(p.appId)
  const { stopCmd, discardCmd, cmd } = await setupOf(p.appId)
  const data = dbCfg ? { database: databaseName(slugOf(p)), scenarios: await listScenarios({ appId: p.appId, prototypeId: p.id }, p.path).catch(() => []) } : { database: null, scenarios: [] }
  const up = on && url ? await answers(url) : false
  // Once it answers: does it listen anywhere it was not told to?
  const stray = up ? await straysOf(running.get(id), (ports) => emit(p, 'prototype.stray_port', 'engine', { ports, note: straySays(ports) })) : []
  const staleGuide = guideOf(p)?.stale ?? []
  return { ...p, ...data, ...(staleGuide.length ? { guideNote: staleSays(staleGuide) } : {}), ...(hasGuide(p) ? {} : { needsGuide: NO_GUIDE }), /** Its server has never been started: its agent starts it once it is set up. */ ...(p.status === 'stopped' && p.port === null && cmd ? { notStarted: true } : {}), cleanup: { stop: !!stopCmd, discard: !!discardCmd }, status: p.status === 'running' && !on ? 'stopped' : p.status, url, up, log: running.get(id)?.log.slice(-40) ?? lastCleanUp.get(id) ?? [], ...(stray.length ? { /** Ports it listens on that it was not given (ports.ts): a second copy would share them. */ strayPorts: stray, strayNote: straySays(stray) } : {}) }
}

export async function listPrototypes(appId: string) {
  const rows = await db.select().from(prototype).where(and(eq(prototype.appId, appId), ne(prototype.status, 'discarded'))).orderBy(desc(prototype.createdAt))
  return rows.map((p) => ({ ...p, status: p.status === 'running' && !alive(p.id) ? 'stopped' : p.status, url: p.port ? `http://localhost:${p.port}` : null }))
}

/** Start a prototype's server (again), on its last port when that is free, passed as PORT. A no-op while it runs, unless restart. */
export async function runPrototype(id: string, actor = 'person', opts: { restart?: boolean } = {}) {
  const p = await rowOf(id)
  if (p.status === 'discarded') throw new PlanError('that prototype was discarded')
  if (opts.restart) { await kill(id); await cleanUp(p) }
  else if (alive(id)) return prototypeStatus(id)
  const { a, cmd, dbCfg } = await setupOf(p.appId)
  if (!cmd) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  if (dbCfg && !(await databaseExists(dbCfg, slugOf(p)))) { // first start: its database, from the scenario it had, else "default" if there is one
    const scenario = p.scenario ?? ((await listScenarios({ appId: p.appId, prototypeId: p.id }, p.path)).includes('default') ? 'default' : null)
    await rebuild(dbCfg, slugOf(p), p.path, scenario, { appId: p.appId, prototypeId: p.id })
    await db.update(prototype).set({ scenario }).where(eq(prototype.id, id))
  }
  const port = await freePort(p.port ?? 0)
  const more = await morePorts()
  // Its own process group, so stopping it also stops what the command started (a package manager's dev server).
  const proc = spawn('sh', ['-c', cmd], { cwd: p.path, env: { ...process.env, ...(await prototypeEnv(p)), PORT: String(port), ...more.env, BROWSER: 'none', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(id, { proc, log, given: [port, ...more.ports] })
  await db.update(prototype).set({ port, status: 'running', updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.started', actor, { port })
  return prototypeStatus(id)
}

/**
 * A new prototype: its branch and worktree off the app's default branch, its server, and its conversation, shown in
 * every open Self Evident with the prototype beside it. With a brief, the conversation starts building at once.
 */
/**
 * The test of a full prototype, in one sentence, said the same to every agent that makes, briefs or judges one
 * (Sandy, 2026-11-19: "I had to really explain to this agent what the goal here was. That we actually want this thing
 * to function exactly like what we're building, and that we should be able to technically deploy it and just point it
 * at different APIs"). "Built the way we would ship it" was said everywhere and left room: this is how to tell.
 */
export const DEPLOY_TEST = 'The test: it could be deployed as it stands and made real by configuration alone, by pointing its addresses and keys at the real services. If going live would need code changed (a stub inside the code, a hard-coded answer, a path that only the prototype takes), that part is not built yet.'
/**
 * Two rules the test implies, found on Cloaked (Sandy, 2026-11-19): a prototype's agent had inserted by hand the rows
 * the feature was there to produce, and started its scan by calling the route, with the button never pressed.
 */
export const THROUGH_THE_PATH = 'Seed only what exists before the feature runs (companies, people, settings). What the feature itself makes (what it imports, computes or stores) is never seeded or inserted by hand: it arrives the way it will in production, in through the integration point from a stand-in. A row you wrote where the feature should have written it is a faked layer.'
export const FROM_THE_SCREEN = 'Try each thing the way the person will, from the screen: press the button, submit the form, open the page. Calling a route or running a job by hand shows that part works, not that the path to it does. Say in your report anything you did not try from the screen.'
/**
 * How thoroughly a prototype is built (Sandy, 2026-11-15: "prototypes can be set as being full or rough").
 * - full: the thing built the way we would ship it, every layer real, so an analysis and an ADR can be read out of it.
 * - rough: built quickly to learn from and to see that it works. The one thing in doubt is real; everything around it
 *   is whatever is quickest. No migration discipline, no full test run, no polish. The build does it properly, once.
 * An app has a usual one (setup.prototype_depth; full when unset) and a prototype can be started as either.
 */
export type Depth = 'full' | 'rough'
export const depthOf = (own: unknown, appSetup: unknown): Depth =>
  own === 'full' || own === 'rough' ? own : (appSetup as { prototype_depth?: string } | null)?.prototype_depth === 'rough' ? 'rough' : 'full'

export async function startPrototype(i: { depth?: Depth | null; appId: string; title: string; brief?: string; projectId?: string | null; ideaId?: string | null; issueId?: string | null; actor?: string; /** false for something with no screen (a collector, a library, a command): no server is started, and it is tried by the commands of its guide. */ server?: boolean; /** Its server is not started with it: its agent starts it once the worktree is set up. Unset: when it has a brief, so an agent builds it at once. */ wait?: boolean }) {
  if ([i.projectId, i.ideaId, i.issueId].filter(Boolean).length > 1) throw new PlanError('a prototype is a step of one thing: an idea, a task or a project')
  const { a, repoPath, cmd } = await setupOf(i.appId)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout to prototype in`)
  if (!cmd && i.server !== false) throw new PlanError(`${a.name} has no prototype command yet: set it in Settings, or work it out from the app and set it with set_prototype_command`)
  const id = newId('prototype')
  const slug = `${slugify(i.title)}-${id.slice(-4).toLowerCase()}`
  const branch = `prototype/${slug}`
  const path = join(`${repoPath}-worktrees`, `prototype--${slug}`)
  await addWorktree(repoPath, path, branch, a.defaultBranch)
  const [row] = await db.insert(prototype).values({ id, appId: i.appId, projectId: i.projectId ?? null, ideaId: i.ideaId ?? null, issueId: i.issueId ?? null, title: i.title, brief: i.brief?.trim() || null, depth: depthOf(i.depth, a.setup), branch, path, createdBy: i.actor ?? 'person' }).returning()
  await emit(row, 'prototype.created', i.actor ?? 'person', { branch })
  // With an agent about to build it, the server waits for the agent (Sandy, 2026-11-18: "it seems to want to open the prototype right
  // away, before the agent has had a chance to actually set up the work tree, and it ends up failing"): the worktree is the default
  // branch as it stands, with nothing installed. The agent starts it (run_prototype) when there is something to run.
  const waits = i.wait ?? !!row.brief
  const status = i.server === false || waits ? await prototypeStatus(id) : await runPrototype(id, i.actor)
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
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a?.workspaceId ?? 'ws_none', appId: p.appId, actor: 'engine', type: 'ui.open', payload: p.issueId ? { tab: { kind: 'page', path: `/tasks/${p.issueId}/prototype` }, issueId: p.issueId } : p.ideaId ? { tab: { kind: 'page', path: `/ideas/${p.ideaId}/prototype` }, ideaId: p.ideaId } : { tab: { kind: 'prototype', id: p.id } } })) // a task's or an idea's prototype shows on that page, in its tab; never split
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

/**
 * What the start command left running that is not its own process (Sandy, 2026-11-13: a command that brings up a whole
 * stack of containers leaves them up when its process is stopped). The app's stop command, run in the prototype's
 * worktree with the port and database variable the start command had. It never stops a stop or a discard: what it
 * printed when it failed is kept with the server's last lines.
 */
const lastCleanUp = new Map<string, string[]>()
async function cleanUp(p: typeof prototype.$inferSelect, why: 'stop' | 'discard' = 'stop'): Promise<void> {
  const s = await setupOf(p.appId)
  const stopCmd = why === 'discard' ? s.discardCmd : s.stopCmd // discarding runs the stop command first, then this
  if (!stopCmd || !p.port || !existsSync(p.path)) return
  const env = { ...process.env, ...(await prototypeEnv(p)), PORT: String(p.port), CI: '1' }
  const out = await new Promise<string[]>((done) => {
    const proc = spawn('sh', ['-c', stopCmd], { cwd: p.path, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const log: string[] = []
    const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)) }
    proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
    const timer = setTimeout(() => { log.push(`${why} command still running after ${STOP_TIMEOUT_MS / 1000}s: left to finish`); done(log) }, STOP_TIMEOUT_MS)
    proc.on('error', (e) => { clearTimeout(timer); done([...log, `${why} command could not run: ${e.message}`]) })
    proc.on('exit', (code) => { clearTimeout(timer); done(code ? [...log, `${why} command exited with ${code}`] : []) })
  })
  if (out.length) lastCleanUp.set(p.id, [...(why === 'discard' ? lastCleanUp.get(p.id) ?? [] : []), ...out].slice(-20)); else if (why === 'stop') lastCleanUp.delete(p.id)
}

const stopped: ((id: string) => void)[] = []
/** Called when a prototype is stopped or thrown away (not on a restart): what hangs on it running, such as a share, ends. */
export const onPrototypeStopped = (fn: (id: string) => void) => { stopped.push(fn) }
const sayStopped = (id: string) => { for (const fn of stopped) { try { fn(id) } catch { /* never blocks the stop */ } } }

export async function stopPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  sayStopped(id)
  await kill(id)
  await cleanUp(p)
  if (p.status === 'running') { await db.update(prototype).set({ status: 'stopped', updatedAt: new Date() }).where(eq(prototype.id, id)); await emit(p, 'prototype.stopped', actor) }
  return prototypeStatus(id)
}

/** Done with it: the server stopped, its worktree and branch removed. The row stays, so what it taught can be found. */
export async function discardPrototype(id: string, actor = 'person') {
  const p = await rowOf(id)
  sayStopped(id)
  await kill(id)
  await cleanUp(p) // while its worktree is still there for the commands to run in
  await cleanUp(p, 'discard') // what is only removed when it is thrown away: its containers, volumes, data
  if (p.sessionId) await endTalk(p.sessionId)
  const { repoPath, dbCfg } = await setupOf(p.appId)
  if (dbCfg) await dropDatabase(dbCfg, slugOf(p)).catch(() => {})
  await dropScenarios(p.appId, p.id) // its own made-up data goes with it; what was shared with the app stays
  if (repoPath) { await removeWorktree(repoPath, p.path); await git(repoPath, ['branch', '-D', p.branch], { allowFail: true }) }
  await db.update(prototype).set({ status: 'discarded', updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.discarded', actor)
  return prototypeStatus(id)
}

/**
 * Its database built again from a scenario (none: empty tables, as the schema makes them). Its server is stopped for
 * it and started again after, so the app reconnects to the new database.
 */
export async function resetPrototypeData(id: string, scenario: string | null, actor = 'person') {
  const p = await rowOf(id)
  const { a, dbCfg } = await setupOf(p.appId)
  if (!dbCfg) throw new PlanError(`${a.name}'s prototypes have no database set: work out the app's development database and schema command and set them with set_prototype_database`)
  const wasRunning = alive(id)
  await kill(id)
  const { loaded } = await rebuild(dbCfg, slugOf(p), p.path, scenario, { appId: p.appId, prototypeId: p.id })
  await db.update(prototype).set({ scenario, updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.data_reset', actor, { scenario, loaded })
  if (wasRunning) await runPrototype(id, actor)
  // Its guide's paths may name rows that are gone: asked for again once the server answers, and said if any no longer open.
  const guided = hasGuide(p) && wasRunning
  if (guided) void guideAfterReset(id).catch(() => {})
  return { scenario, loaded, status: await prototypeStatus(id), ...(guided ? { note: 'Its guide\'s paths are being checked again against the new data: prototype (status) says which no longer open, if any.' } : {}) }
}

/** Once the prototype answers again (a minute at most), its guide's paths are asked for. */
export async function guideAfterReset(id: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const s = await prototypeStatus(id).catch(() => null)
    if (!s || s.status !== 'running') return null
    if (s.up) return recheckGuide(id)
    await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}

/** The data as it is now, kept as a scenario: in Self Evident, for this prototype or shared with the app. Never in its worktree. */
export async function savePrototypeData(id: string, name: string, actor = 'person', shared = false) {
  const p = await rowOf(id)
  const { a, dbCfg } = await setupOf(p.appId)
  if (!dbCfg) throw new PlanError(`${a.name}'s prototypes have no database set`)
  const saved = await save(dbCfg, slugOf(p), { appId: p.appId, prototypeId: p.id }, name, shared)
  await db.update(prototype).set({ scenario: name, updatedAt: new Date() }).where(eq(prototype.id, id))
  await emit(p, 'prototype.data_saved', actor, { scenario: name, saved: saved.saved, shared })
  return saved
}

/** A scenario written out by hand: its tables, each an array of rows. Loaded with a reset. */
export async function writePrototypeScenario(id: string, name: string, tables: Tables, actor = 'person', shared = false) {
  const p = await rowOf(id)
  const saved = await writeScenario({ appId: p.appId, prototypeId: p.id }, name, tables, shared)
  await emit(p, 'prototype.data_saved', actor, { scenario: name, saved: saved.saved, shared, written: true })
  return saved
}

/** A scenario's rows, to read. */
export async function showPrototypeScenario(id: string, name: string) {
  const p = await rowOf(id)
  const tables = await scenarioTables({ appId: p.appId, prototypeId: p.id }, name, p.path)
  if (!tables) throw new PlanError(`no scenario "${name}" for this prototype`)
  return { scenario: name, tables }
}

/** Where this app's prototypes get their databases: its development database server, the variable it reads, its schema command. */
export async function setPrototypeDatabase(appId: string, cfg: PrototypeDb) {
  const { a } = await setupOf(appId)
  new URL(cfg.url) // a URL, or it throws
  const clean: PrototypeDb = { url: cfg.url.trim(), env: cfg.env?.trim() || 'DATABASE_URL', ...(cfg.schema_cmd?.trim() ? { schema_cmd: cfg.schema_cmd.trim() } : {}) }
  await patchSetup(appId, { prototype_db: clean })
  return { prototype_db: clean }
}

/** How this app's prototype server starts: a shell command run in the prototype's worktree, serving on $PORT. */
export async function setPrototypeCommand(appId: string, cmd: string, stop?: string) {
  const { a } = await setupOf(appId)
  await setupOf(appId) // an app there is
  const next = await patchSetup(appId, { prototype_cmd: cmd.trim(), ...(stop === undefined ? {} : { prototype_stop_cmd: stop.trim() || null }) })
  return { prototype_cmd: cmd.trim(), prototype_stop_cmd: (next as { prototype_stop_cmd?: string }).prototype_stop_cmd ?? null }
}

/**
 * How this app cleans up after a prototype whose start command leaves things running that are not its own process
 * (Sandy, 2026-11-13: "how does it cleanup the environment after the prototype"). stop: run when a prototype is
 * stopped or restarted (stop the stack, keep its data). discard: run after it when a prototype is thrown away (remove
 * the containers, volumes and data). Each is given, undefined leaves it as it is, empty clears it.
 */
export async function setPrototypeCleanup(appId: string, i: { stop?: string; discard?: string }) {
  const { a } = await setupOf(appId)
  await setupOf(appId) // an app there is
  const next = await patchSetup(appId, { ...(i.stop === undefined ? {} : { prototype_stop_cmd: i.stop.trim() || null }), ...(i.discard === undefined ? {} : { prototype_discard_cmd: i.discard.trim() || null }) })
  return { prototype_stop_cmd: (next.prototype_stop_cmd as string | undefined) ?? null, prototype_discard_cmd: (next.prototype_discard_cmd as string | undefined) ?? null }
}

export function stopPrototypes() { for (const id of [...running.keys()]) void kill(id) }
