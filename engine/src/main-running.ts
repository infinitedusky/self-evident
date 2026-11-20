/**
 * The app's main, running (Sandy, 2026-11-19: "there's always like the current main that we need to host or to see …
 * it shows us the functionality that's currently available. This is really important to have as a comp when we're
 * building … I don't want to have to go to the prototype and trigger it to create a prototype just so I can look at
 * the main"; "you would turn it on and turn it off because we don't want it running all the time … it would shut off
 * if not active for a while"; "compare would always just open the running main to whatever location you want to
 * compare it against").
 *
 * One per app, owned by the app and not by any prototype or task. For an app that is deployed somewhere a person can
 * look (`setup.main_url`), it is that address and there is nothing to run. Otherwise it is the app's prototype
 * command run in a worktree of its own (`<repository>-worktrees/main--running`) at the default branch's tip, on a
 * port and a database of its own built from the app's shared "default" scenario, with the app's own stand-ins
 * (`setup.main_stand_ins`) for what is outside the system.
 *
 * The person turns it on and off. A look at it keeps it up; with no look for MAIN_IDLE_MS it turns itself off. It
 * never moves under the person: when the default branch has moved on it says so, and Update brings it up again there.
 * Kept in memory: after an engine restart it is off.
 *
 * A task has a main of its own for comparing (Sandy, 2026-11-20: "compare with main should be a new port. The
 * app-wide main is just the default scenario that we can look at whenever we want. But if we want to actually do
 * comparisons on the prototypes or the smoke tests, we should be able to spin up a new one. But there should only be
 * one per task"). The same thing run a second time, named for what it is beside (`forId`: the task, or a prototype
 * that has none): a worktree (`main--<id>`), a port and a database of its own, so what is done in it while comparing
 * is not in the app's main, and the app's main is not moved by a comparison. A task's prototype and its smoke test
 * share the one. It is removed, with its worktree and database, when the task is done.
 *
 * What data a task's main runs on is chosen when it is compared (Sandy, 2026-11-20: "the ability to choose the two
 * options, one to literally use the same database and the other one is to mimic the data on its own"):
 * - copy: a database of its own, made again each time it is turned on, from what the work beside it was built from
 *   (the prototype's scenario; the smoke test's scenario and seed). The same rows to start with, and main's own
 *   schema. What is done in one is not in the other.
 * - shared: the very database of the work beside it. Main's code on the build's schema, as during a deploy, so a
 *   change that is not backwards compatible shows as main breaking. Nothing is built or dropped for it.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { PlanError } from './projects.js'
import { morePorts } from './ports.js'
import { databaseExists, databaseName, databaseUrl, dropDatabase, listScenarios, rebuild, type PrototypeDb } from './prototype-data.js'
import { recordingsDir } from './recordings.js'
import { patchSetup } from './setup.js'
import { cleanStandIns, envOf, homeOf, standInKey, standInsStatus, startStandIns, stopStandIns, withStandIn, writeEnvFile, type StandIn } from './stand-ins.js'
import { homeRepo } from './workbench.js'

export const MAIN_IDLE_MS = () => Number(process.env.MAIN_IDLE_MS ?? 30 * 60_000)
const STOP_TIMEOUT_MS = Number(process.env.PROTOTYPE_STOP_TIMEOUT_MS ?? 120_000)
const SLUG = 'main-running'
/** Which main: the app's own, or the one beside a piece of work (its id). */
const tagOf = (forId?: string | null) => (forId ? forId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : '')
const keyOf = (appId: string, forId?: string | null) => (tagOf(forId) ? `${appId}:${tagOf(forId)}` : appId)
const slugOf = (forId?: string | null) => (tagOf(forId) ? `main-${tagOf(forId)}` : SLUG)
const folderOf = (forId?: string | null) => `main--${tagOf(forId) || 'running'}`
const standKey = (appId: string, forId?: string | null) => (tagOf(forId) ? `${mainKey(appId)}-${tagOf(forId)}` : mainKey(appId))
/** What its stand-ins and their folder are kept under (stand-ins.ts keys them by any id). */
export const mainKey = (appId: string) => `main-${appId}`

/** What a task's main runs on (the server resolves the work beside it): its own copy of that work's starting data, or that work's database itself. */
export interface MainData { mode: 'copy' | 'shared'; /** What it is beside, in words, for the page. */ beside: string; /** shared: that work's database. */ slug?: string; /** copy: the scenario that work was built from (null: none). */ scenario?: string | null; /** copy: where that scenario is kept. */ prototypeId?: string | null; /** copy: SQL run after it (a smoke set-up's seed). */ seed?: string | null }
interface Running { data: MainData | null; appId: string; forId: string | null; proc: ChildProcess; log: string[]; port: number; sha: string; path: string; env: Record<string, string>; usedAt: number; startedAt: string }
const running = new Map<string, Running>()
const lastPort = new Map<string, number>() // turned on again, it keeps its address, so an open tab still finds it
const alive = (appId: string, forId?: string | null) => { const m = running.get(keyOf(appId, forId)); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }
const freePort = (want = 0): Promise<number> => new Promise((resolveP, reject) => {
  const s = createServer()
  s.once('error', (err) => (want ? freePort(0).then(resolveP, reject) : reject(err)))
  s.listen(want, () => { const { port } = s.address() as AddressInfo; s.close(() => resolveP(port)) })
})
const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.status < 500).catch(() => false)

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const r = await homeRepo(appId)
  const s = (a.setup ?? {}) as { main_url?: string; main_stand_ins?: unknown; prototype_cmd?: string; prototype_stop_cmd?: string; prototype_db?: PrototypeDb }
  return { a, repoPath: r?.localPath ?? null, address: s.main_url?.trim() || null, cmd: s.prototype_cmd?.trim() || null, stopCmd: s.prototype_stop_cmd?.trim() || null, dbCfg: s.prototype_db?.url ? s.prototype_db : null, standIns: cleanStandIns(s.main_stand_ins) }
}

/** The default branch as it is now: GitHub's when the checkout has it, else the local one. */
async function tipOf(repoPath: string, defaultBranch: string): Promise<string | null> {
  for (const ref of [`origin/${defaultBranch}`, defaultBranch]) {
    const r = await git(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true })
    if (r.code === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
}

async function emit(a: typeof app.$inferSelect, type: string, actor: string, payload: Record<string, unknown> = {}) {
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type, payload }))
}

/** The app's main as the page sees it. touch: someone is looking at it, so it stays up. */
export async function mainStatus(appId: string, touch = false, forId?: string | null) {
  const { a, repoPath, address, cmd, dbCfg, standIns } = await setupOf(appId)
  const branch = a.defaultBranch ?? 'main'
  if (address) return { appId, for: tagOf(forId) || null, branch, how: 'address' as const, url: address, running: true, up: true, canRun: false, sha: null, tip: null, behind: false, log: [] as string[], standIns: [], database: null, idleMinutes: null, stopsAt: null }
  const m = running.get(keyOf(appId, forId)), on = alive(appId, forId)
  if (on && touch) m!.usedAt = Date.now()
  const url = on ? `http://localhost:${m!.port}` : null
  const tip = repoPath ? await tipOf(repoPath, branch) : null
  return {
    appId, /** The piece of work it is beside, when it is not the app's own. */ for: tagOf(forId) || null, branch, how: cmd && repoPath ? 'local' as const : 'none' as const,
    url, running: on, up: url ? await answers(url) : false,
    /** It can be turned on here: the app has a command to start it and a checkout. */ canRun: !!cmd && !!repoPath,
    /** The commit it runs, and the default branch's now: behind when that has moved on. */ sha: on ? m!.sha : null, tip, behind: on && !!tip && tip !== m!.sha,
    log: m?.log.slice(-30) ?? [],
    standIns: standInsStatus(standKey(appId, forId), standIns).map((s) => ({ key: s.key, name: s.name, what: s.what, running: s.running, url: s.url })),
    database: dbCfg ? databaseName(m?.data?.mode === 'shared' && m.data.slug ? m.data.slug : slugOf(forId)) : null,
    /** A task's main: the data it was turned on with. */ data: on && m!.data ? { mode: m!.data.mode, beside: m!.data.beside } : null,
    /** With nobody looking for this long it turns itself off; stopsAt: when, as things stand. */ idleMinutes: Math.round(MAIN_IDLE_MS() / 60_000), stopsAt: on ? new Date(m!.usedAt + MAIN_IDLE_MS()).toISOString() : null,
  }
}

/** Turn it on, at the default branch's tip. Already on: left as it is, unless update (it has moved on: up again there, its database made again). */
export async function startMain(appId: string, actor = 'person', opts: { update?: boolean; /** The task (or prototype) it is beside: a main of its own, not the app's. */ for?: string | null; /** A task's main: what data it runs on. Asked for again with another choice, it is brought up again on that. */ data?: MainData | null } = {}) {
  const forId = opts.for ?? null, SLUG = slugOf(forId)
  const data = tagOf(forId) ? opts.data ?? null : null
  const asIs = !opts.data || JSON.stringify(opts.data) === JSON.stringify(running.get(keyOf(appId, forId))?.data ?? null)
  const { a, repoPath, address, cmd, dbCfg, standIns } = await setupOf(appId)
  if (address) return mainStatus(appId, false, forId)
  if (alive(appId, forId) && !opts.update && asIs) return mainStatus(appId, true, forId)
  if (!cmd) throw new PlanError(`${a.name} has no command to start it yet: set how its prototypes are started in Settings, or give the address its main is deployed at`)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout to run main from`)
  const branch = a.defaultBranch ?? 'main'
  const sha = await tipOf(repoPath, branch)
  if (!sha) throw new PlanError(`${a.name}'s repository has no ${branch} to run`)
  if (dbCfg && data?.mode === 'shared' && (!data.slug || !(await databaseExists(dbCfg, data.slug)))) throw new PlanError(`${data.beside} has no database yet to share: run it first`) // said before anything is stopped
  await end(appId, forId)
  const path = join(`${repoPath}-worktrees`, folderOf(forId))
  // Its own worktree, at the commit and on no branch: the default branch is nobody's to check out twice.
  if (existsSync(path)) await git(path, ['checkout', '--detach', '--force', sha])
  else await git(repoPath, ['worktree', 'add', '--detach', path, sha])
  const log: string[] = []
  if (dbCfg && data?.mode === 'shared') {
    if (!data.slug || !(await databaseExists(dbCfg, data.slug))) throw new PlanError(`${data.beside} has no database yet to share: run it first`)
    log.push(`On the database of ${data.beside}: what is done here is done there.`)
  } else if (dbCfg) {
    if (opts.update || data) await dropDatabase(dbCfg, SLUG).catch(() => {}) // the schema may have moved with it; a copy is made again each time, from what the work beside it starts with
    if (!(await databaseExists(dbCfg, SLUG))) {
      const scope = { appId, ...(data?.prototypeId ? { prototypeId: data.prototypeId } : {}) }
      const scenario = data && data.scenario !== undefined ? data.scenario : (await listScenarios({ appId }, path)).includes('default') ? 'default' : null
      // A shared scenario may name what main does not have yet (a prototype's new table): it comes up anyway, and its log says so.
      try { await rebuild(dbCfg, SLUG, path, scenario, scope) }
      catch (err) {
        log.push(`The made-up data did not all load on ${branch}: ${(err as Error).message}`.slice(0, 300))
        if (!(await databaseExists(dbCfg, SLUG))) await rebuild(dbCfg, SLUG, path, null, { appId })
      }
      if (data?.seed) { // the smoke set-up's own rows, after the scenario; what it names that main lacks is said, and main comes up anyway
        const c = new pg.Client({ connectionString: databaseUrl(dbCfg, SLUG) })
        try { await c.connect(); await c.query(data.seed) } catch (err) { log.push(`The seed did not all load on ${branch}: ${(err as Error).message}`.slice(0, 300)) } finally { await c.end().catch(() => {}) }
      }
    }
  }
  const mine: Record<string, string> = { PROTOTYPE_HOME: homeOf(standKey(appId, forId)), RECORDINGS: recordingsDir(appId), ...(dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, data?.mode === 'shared' ? data.slug! : SLUG) } : {}) }
  // Its stand-ins first, each on a port of its own; the server is given the variables that point the app at them.
  const pointed = envOf(standKey(appId, forId), standIns, await startStandIns(standKey(appId, forId), standIns, path, { ...process.env, ...mine }), path)
  const envFile = writeEnvFile(standKey(appId, forId), pointed)
  const port = await freePort(lastPort.get(keyOf(appId, forId)) ?? 0)
  const more = await morePorts()
  const env = { ...mine, ...pointed, STAND_INS_ENV: envFile, PORT: String(port), ...more.env, BROWSER: 'none', CI: '1' }
  // Its own process group, so stopping it also stops what the command started.
  const proc = spawn('sh', ['-c', cmd], { cwd: path, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(keyOf(appId, forId), { data, appId, forId: tagOf(forId) || null, proc, log, port, sha, path, env, usedAt: Date.now(), startedAt: new Date().toISOString() })
  lastPort.set(keyOf(appId, forId), port)
  watch()
  await emit(a, 'main.started', actor, { port, sha, ...(tagOf(forId) ? { for: tagOf(forId) } : {}) })
  return mainStatus(appId, false, forId)
}

/** Stop its server and stand-ins, then what the command left up (the app's stop command, in main's worktree). */
async function end(appId: string, forId?: string | null): Promise<boolean> {
  const m = running.get(keyOf(appId, forId))
  running.delete(keyOf(appId, forId))
  const standIns = stopStandIns(standKey(appId, forId))
  if (m && m.proc.exitCode === null && m.proc.signalCode === null && m.proc.pid) {
    const gone = new Promise<void>((r) => { m.proc.once('exit', () => r()); setTimeout(r, 3000) })
    try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
    await gone
  }
  await standIns
  if (!m) return false
  const { stopCmd } = await setupOf(appId).catch(() => ({ stopCmd: null }))
  if (stopCmd && existsSync(m.path)) await new Promise<void>((done) => {
    const proc = spawn('sh', ['-c', stopCmd], { cwd: m.path, env: { ...process.env, ...m.env }, stdio: 'ignore' })
    const timer = setTimeout(done, STOP_TIMEOUT_MS)
    proc.on('error', () => { clearTimeout(timer); done() }); proc.on('exit', () => { clearTimeout(timer); done() })
  })
  return true
}

export async function stopMain(appId: string, actor = 'person', why?: 'idle', forId?: string | null) {
  const { a } = await setupOf(appId)
  if (await end(appId, forId)) await emit(a, 'main.stopped', actor, { ...(why ? { why } : {}), ...(tagOf(forId) ? { for: tagOf(forId) } : {}) })
  return mainStatus(appId, false, forId)
}

/** A piece of work's own main, gone for good: stopped, its worktree and its database removed. For when the task is done. */
export async function removeMain(appId: string, forId: string) {
  if (!tagOf(forId)) return
  const { repoPath, dbCfg } = await setupOf(appId)
  await end(appId, forId)
  lastPort.delete(keyOf(appId, forId))
  const path = repoPath ? join(`${repoPath}-worktrees`, folderOf(forId)) : null
  if (path && existsSync(path)) await git(repoPath!, ['worktree', 'remove', '--force', path], { allowFail: true })
  if (dbCfg) await dropDatabase(dbCfg, slugOf(forId)).catch(() => {})
}

/** Turn off each one nobody has looked at for MAIN_IDLE_MS. Returns the apps it turned off. */
export async function stopIdleMains(now = Date.now()): Promise<string[]> {
  const idle = [...running.values()].filter((m) => now - m.usedAt >= MAIN_IDLE_MS())
  for (const m of idle) await stopMain(m.appId, 'engine', 'idle', m.forId).catch(() => {})
  return idle.map((m) => keyOf(m.appId, m.forId))
}
let timer: NodeJS.Timeout | null = null
function watch() { if (!timer) { timer = setInterval(() => { void stopIdleMains(); if (!running.size && timer) { clearInterval(timer); timer = null } }, 60_000); timer.unref() } }

export function stopMains() { if (timer) { clearInterval(timer); timer = null } for (const m of [...running.values()]) void end(m.appId, m.forId) }

/** Where the app's main can be looked at without running it here (a deployed site), or none: it is run here. */
export async function setMainAddress(appId: string, url: string | null) {
  const clean = url?.trim() || null
  if (clean && !/^https?:\/\/\S+$/.test(clean)) throw new PlanError('an address starts with http:// or https://')
  if (clean) await end(appId)
  await patchSetup(appId, { main_url: clean })
  return mainStatus(appId)
}

/** What main runs in place of what is outside the system: the app's own, started and stopped with it. In force the next time it is turned on (at once, when it is on). */
export async function setMainStandIn(appId: string, one: Partial<StandIn> | null, removeKey?: string) {
  const { standIns } = await setupOf(appId)
  const next = one ? withStandIn(standIns, one) : standIns.filter((s) => s.key !== standInKey(removeKey ?? ''))
  if (!next) throw new PlanError('a stand-in needs a name and a command that serves on $PORT')
  await patchSetup(appId, { main_stand_ins: next })
  return alive(appId) ? startMain(appId, 'agent', { update: true }) : mainStatus(appId)
}
