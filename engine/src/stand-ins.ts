/**
 * Stand-ins: what a prototype runs in place of something outside the system (a vendor's API, another team's service),
 * so the app's own code can be pointed at it by configuration alone (prototype.ts, DEPLOY_TEST).
 *
 * Found on Cloaked (Sandy, 2026-11-19, a task agent's report): the agent wired a vendor stand-in the right way, by a
 * base URL and a key, and kept it in /tmp with a compose file beside it. "If the prototype is restarted or reset, the
 * stand-in and its env are gone." And it held a real person's recorded findings, which cannot go in the repository,
 * so there was nowhere else for it to be.
 *
 * So a stand-in is part of the prototype, kept on its row: a name, a command that serves on $PORT, and the variables
 * that point the app at it. The engine starts each one before the prototype's server, on a port of its own, and gives
 * the server those variables; it stops them with the server. A restart or a data reset brings them back.
 *
 * Each prototype has a folder of its own outside every repository (`homeOf`): its stand-ins run there, one folder
 * each, and what they serve is kept there, recorded responses with real people's data among them. It is on this
 * computer only, and goes when the prototype is discarded.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface StandIn { key: string; name: string; /** What it stands in for, in a line. */ what?: string; /** A shell command that serves on $PORT, run in the stand-in's own folder. */ cmd: string; /** The variables that point the app at it: {url}, {port}, {home}, {dir} and {worktree} are filled in. */ env: Record<string, string> }
export const STAND_INS_MAX = 8
export const standInsHome = () => process.env.STAND_INS_HOME ?? join(homedir(), '.self-evident', 'prototypes')
/** A prototype's own folder, outside every repository. */
export const homeOf = (prototypeId: string) => join(standInsHome(), prototypeId)
export const dirOf = (prototypeId: string, key: string) => join(homeOf(prototypeId), 'stand-ins', key)
export const standInKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

/** What was given, tidied: one needs a name and a command; a variable's name is a shell variable's. */
export function cleanStandIns(given: unknown): StandIn[] {
  if (!Array.isArray(given)) return []
  const out: StandIn[] = []
  for (const g of given as Partial<StandIn>[]) {
    const name = String(g?.name ?? '').trim().slice(0, 80), key = standInKey(String(g?.key || name)), cmd = String(g?.cmd ?? '').trim().slice(0, 2000)
    if (!key || !name || !cmd || out.some((o) => o.key === key)) continue
    const env = Object.fromEntries(Object.entries(g?.env && typeof g.env === 'object' ? g.env : {}).filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).trim().slice(0, 1000)]).slice(0, 30))
    const what = String(g?.what ?? '').trim().slice(0, 200)
    out.push({ key, name, cmd, env, ...(what ? { what } : {}) })
    if (out.length === STAND_INS_MAX) break
  }
  return out
}

/** One added or changed, by its key. Pure; null when it has no name or command. */
export function withStandIn(list: unknown, one: Partial<StandIn>): StandIn[] | null {
  const [clean] = cleanStandIns([one])
  if (!clean) return null
  const was = cleanStandIns(list)
  return was.some((s) => s.key === clean.key) ? was.map((s) => (s.key === clean.key ? clean : s)) : cleanStandIns([...was, clean])
}

export interface Where { port: number; home: string; dir: string; worktree: string }
/** A value with its places filled in: {url} is the stand-in on this computer. */
export const fill = (value: string, w: Where) => value.replace(/\{url\}/g, `http://localhost:${w.port}`).replace(/\{port\}/g, String(w.port)).replace(/\{home\}/g, w.home).replace(/\{dir\}/g, w.dir).replace(/\{worktree\}/g, w.worktree)
/** The variables the prototype's server is given, from every stand-in that has a port. Pure. */
export function envOf(prototypeId: string, list: StandIn[], ports: Record<string, number>, worktree: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of list) { const port = ports[s.key]; if (!port) continue; for (const [k, v] of Object.entries(s.env)) out[k] = fill(v, { port, home: homeOf(prototypeId), dir: dirOf(prototypeId, s.key), worktree }) }
  return out
}

interface Running { proc: ChildProcess; log: string[]; port: number }
const running = new Map<string, Map<string, Running>>() // by prototype, then by the stand-in's key
const lastPort = new Map<string, number>() // `${prototypeId}:${key}`: a restart keeps its address
const aliveP = (r?: Running) => !!r && r.proc.exitCode === null && r.proc.signalCode === null
const freePort = (want = 0): Promise<number> => new Promise((resolveP, reject) => {
  const s = createServer()
  s.once('error', (err) => (want ? freePort(0).then(resolveP, reject) : reject(err)))
  s.listen(want, () => { const { port } = s.address() as AddressInfo; s.close(() => resolveP(port)) })
})

/** Start every stand-in of a prototype that is not running, each in its own folder on a port of its own. Returns each one's port. */
export async function startStandIns(prototypeId: string, list: StandIn[], worktree: string, baseEnv: Record<string, string | undefined> = process.env): Promise<Record<string, number>> {
  const mine = running.get(prototypeId) ?? new Map<string, Running>()
  running.set(prototypeId, mine)
  const ports: Record<string, number> = {}
  for (const s of list) {
    const up = mine.get(s.key)
    if (aliveP(up)) { ports[s.key] = up!.port; continue }
    const dir = dirOf(prototypeId, s.key)
    mkdirSync(dir, { recursive: true })
    const port = await freePort(lastPort.get(`${prototypeId}:${s.key}`) ?? 0)
    lastPort.set(`${prototypeId}:${s.key}`, port)
    // Its own process group, as the prototype's server has: stopping it stops what the command started.
    const proc = spawn('sh', ['-c', s.cmd], { cwd: dir, env: { ...baseEnv, PORT: String(port), PROTOTYPE_HOME: homeOf(prototypeId), WORKTREE: worktree }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const log: string[] = []
    const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 100) log.splice(0, log.length - 100) }
    proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
    proc.on('error', (e) => { log.push(`could not run: ${e.message}`) })
    proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
    mine.set(s.key, { proc, log, port })
    ports[s.key] = port
  }
  return ports
}

/** Stop a prototype's stand-ins (`only`: that one), and what they started. */
export async function stopStandIns(prototypeId: string, only?: string): Promise<void> {
  const mine = running.get(prototypeId)
  if (!mine) return
  await Promise.all([...mine].filter(([key]) => !only || key === only).map(([key, r]) => {
    mine.delete(key)
    if (!aliveP(r) || !r.proc.pid) return Promise.resolve()
    const gone = new Promise<void>((done) => { r.proc.once('exit', () => done()); setTimeout(done, 3000) })
    try { process.kill(-r.proc.pid, 'SIGTERM') } catch { r.proc.kill('SIGTERM') }
    return gone
  }))
  if (!mine.size) running.delete(prototypeId)
}
export function stopAllStandIns() { for (const id of [...running.keys()]) void stopStandIns(id) }

/** Each stand-in as the page and the agent see it. */
export function standInsStatus(prototypeId: string, list: StandIn[]) {
  const mine = running.get(prototypeId)
  return list.map((s) => { const r = mine?.get(s.key); const on = aliveP(r); return { ...s, running: on, port: on ? r!.port : null, url: on ? `http://localhost:${r!.port}` : null, dir: dirOf(prototypeId, s.key), output: (r?.log ?? []).slice(-8) } })
}

/** The prototype is thrown away: its stand-ins stopped and its folder, with what was recorded there, removed. */
export async function forgetStandIns(prototypeId: string) {
  await stopStandIns(prototypeId)
  rmSync(homeOf(prototypeId), { recursive: true, force: true })
}
