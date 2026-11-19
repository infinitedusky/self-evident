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
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
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
/** What its stand-ins and their folder are kept under (stand-ins.ts keys them by any id). */
export const mainKey = (appId: string) => `main-${appId}`

interface Running { proc: ChildProcess; log: string[]; port: number; sha: string; path: string; env: Record<string, string>; usedAt: number; startedAt: string }
const running = new Map<string, Running>()
const lastPort = new Map<string, number>() // turned on again, it keeps its address, so an open tab still finds it
const alive = (appId: string) => { const m = running.get(appId); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }
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
export async function mainStatus(appId: string, touch = false) {
  const { a, repoPath, address, cmd, dbCfg, standIns } = await setupOf(appId)
  const branch = a.defaultBranch ?? 'main'
  if (address) return { appId, branch, how: 'address' as const, url: address, running: true, up: true, canRun: false, sha: null, tip: null, behind: false, log: [] as string[], standIns: [], database: null, idleMinutes: null, stopsAt: null }
  const m = running.get(appId), on = alive(appId)
  if (on && touch) m!.usedAt = Date.now()
  const url = on ? `http://localhost:${m!.port}` : null
  const tip = repoPath ? await tipOf(repoPath, branch) : null
  return {
    appId, branch, how: cmd && repoPath ? 'local' as const : 'none' as const,
    url, running: on, up: url ? await answers(url) : false,
    /** It can be turned on here: the app has a command to start it and a checkout. */ canRun: !!cmd && !!repoPath,
    /** The commit it runs, and the default branch's now: behind when that has moved on. */ sha: on ? m!.sha : null, tip, behind: on && !!tip && tip !== m!.sha,
    log: m?.log.slice(-30) ?? [],
    standIns: standInsStatus(mainKey(appId), standIns).map((s) => ({ key: s.key, name: s.name, what: s.what, running: s.running, url: s.url })),
    database: dbCfg ? databaseName(SLUG) : null,
    /** With nobody looking for this long it turns itself off; stopsAt: when, as things stand. */ idleMinutes: Math.round(MAIN_IDLE_MS() / 60_000), stopsAt: on ? new Date(m!.usedAt + MAIN_IDLE_MS()).toISOString() : null,
  }
}

/** Turn it on, at the default branch's tip. Already on: left as it is, unless update (it has moved on: up again there, its database made again). */
export async function startMain(appId: string, actor = 'person', opts: { update?: boolean } = {}) {
  const { a, repoPath, address, cmd, dbCfg, standIns } = await setupOf(appId)
  if (address) return mainStatus(appId)
  if (alive(appId) && !opts.update) return mainStatus(appId, true)
  if (!cmd) throw new PlanError(`${a.name} has no command to start it yet: set how its prototypes are started in Settings, or give the address its main is deployed at`)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout to run main from`)
  const branch = a.defaultBranch ?? 'main'
  const sha = await tipOf(repoPath, branch)
  if (!sha) throw new PlanError(`${a.name}'s repository has no ${branch} to run`)
  await end(appId)
  const path = join(`${repoPath}-worktrees`, 'main--running')
  // Its own worktree, at the commit and on no branch: the default branch is nobody's to check out twice.
  if (existsSync(path)) await git(path, ['checkout', '--detach', '--force', sha])
  else await git(repoPath, ['worktree', 'add', '--detach', path, sha])
  const log: string[] = []
  if (dbCfg) {
    if (opts.update) await dropDatabase(dbCfg, SLUG).catch(() => {}) // the schema may have moved with it
    if (!(await databaseExists(dbCfg, SLUG))) {
      const scenario = (await listScenarios({ appId }, path)).includes('default') ? 'default' : null
      // A shared scenario may name what main does not have yet (a prototype's new table): it comes up anyway, and its log says so.
      try { await rebuild(dbCfg, SLUG, path, scenario, { appId }) }
      catch (err) {
        log.push(`The made-up data did not all load on ${branch}: ${(err as Error).message}`.slice(0, 300))
        if (!(await databaseExists(dbCfg, SLUG))) await rebuild(dbCfg, SLUG, path, null, { appId })
      }
    }
  }
  const mine: Record<string, string> = { PROTOTYPE_HOME: homeOf(mainKey(appId)), RECORDINGS: recordingsDir(appId), ...(dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, SLUG) } : {}) }
  // Its stand-ins first, each on a port of its own; the server is given the variables that point the app at them.
  const pointed = envOf(mainKey(appId), standIns, await startStandIns(mainKey(appId), standIns, path, { ...process.env, ...mine }), path)
  const envFile = writeEnvFile(mainKey(appId), pointed)
  const port = await freePort(lastPort.get(appId) ?? 0)
  const more = await morePorts()
  const env = { ...mine, ...pointed, STAND_INS_ENV: envFile, PORT: String(port), ...more.env, BROWSER: 'none', CI: '1' }
  // Its own process group, so stopping it also stops what the command started.
  const proc = spawn('sh', ['-c', cmd], { cwd: path, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(appId, { proc, log, port, sha, path, env, usedAt: Date.now(), startedAt: new Date().toISOString() })
  lastPort.set(appId, port)
  watch()
  await emit(a, 'main.started', actor, { port, sha })
  return mainStatus(appId)
}

/** Stop its server and stand-ins, then what the command left up (the app's stop command, in main's worktree). */
async function end(appId: string): Promise<boolean> {
  const m = running.get(appId)
  running.delete(appId)
  const standIns = stopStandIns(mainKey(appId))
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

export async function stopMain(appId: string, actor = 'person', why?: 'idle') {
  const { a } = await setupOf(appId)
  if (await end(appId)) await emit(a, 'main.stopped', actor, why ? { why } : {})
  return mainStatus(appId)
}

/** Turn off each one nobody has looked at for MAIN_IDLE_MS. Returns the apps it turned off. */
export async function stopIdleMains(now = Date.now()): Promise<string[]> {
  const idle = [...running.entries()].filter(([, m]) => now - m.usedAt >= MAIN_IDLE_MS()).map(([id]) => id)
  for (const id of idle) await stopMain(id, 'engine', 'idle').catch(() => {})
  return idle
}
let timer: NodeJS.Timeout | null = null
function watch() { if (!timer) { timer = setInterval(() => { void stopIdleMains(); if (!running.size && timer) { clearInterval(timer); timer = null } }, 60_000); timer.unref() } }

export function stopMains() { if (timer) { clearInterval(timer); timer = null } for (const id of [...running.keys()]) void end(id) }

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
