/**
 * Running a step of a prototype's guide (Sandy, 2026-11-15: "can we add a command line window if that is the
 * prototype access point"; asked which, "Run buttons"). Some prototypes have no screen: a collector, a library, a
 * command. Their guide's steps are commands (`run`), written by the agent as it writes where to go for a screen. The
 * person presses Run on one and reads what it printed.
 *
 * Not a terminal: only a command that is a step of the prototype's guide can run, exactly as written and shown, in
 * the prototype's own worktree, one at a time per prototype. What it printed is kept in memory, the last run of each
 * step, and is gone when the engine restarts.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, prototype } from './db/schema.js'
import { appendEvent } from './events.js'
import { stopsOthers, STOP_ONLY_YOURS } from './guard.js'
import { PlanError } from './projects.js'
import { prototypeEnv } from './prototype.js'
import { guideOf } from './share-guide.js'

export interface StepRun { step: number; command: string; status: 'running' | 'passed' | 'failed' | 'stopped'; exitCode: number | null; startedAt: string; endedAt: string | null; lines: string[] }
interface Live extends StepRun { proc?: ChildProcess; timer?: NodeJS.Timeout }

const KEEP = 2000 // lines of output kept for a run
const LIMIT_MS = 20 * 60_000 // a run that goes on longer is stopped
const runs = new Map<string, Map<number, Live>>()
const view = ({ proc: _p, timer: _t, ...r }: Live): StepRun => ({ ...r, lines: r.lines.slice(-600) })

/** The last run of each step of a prototype's guide, by step. */
export const runsOf = (prototypeId: string): StepRun[] => [...(runs.get(prototypeId)?.values() ?? [])].sort((a, b) => a.step - b.step).map(view)

export async function runStep(prototypeId: string, step: number, actor = 'person', opts: { limitMs?: number } = {}): Promise<StepRun> {
  const [p] = await db.select().from(prototype).where(eq(prototype.id, prototypeId))
  if (!p) throw new PlanError(`no prototype ${prototypeId}`)
  if (p.status === 'discarded') throw new PlanError('that prototype was discarded')
  const command = guideOf(p)?.steps[step]?.run
  if (!command) throw new PlanError('that step of the guide has no command to run')
  if (stopsOthers(command)) throw new PlanError(`this command is not run from here. ${STOP_ONLY_YOURS}`)
  const mine = runs.get(prototypeId) ?? new Map<number, Live>()
  runs.set(prototypeId, mine)
  const busy = [...mine.values()].find((r) => r.status === 'running')
  if (busy) { if (busy.step === step) return view(busy); throw new PlanError('another step of this prototype is running: wait for it, or stop it') }

  const run: Live = { step, command, status: 'running', exitCode: null, startedAt: new Date().toISOString(), endedAt: null, lines: [] }
  // Its own process group, so stopping it also stops what the command started.
  const proc = spawn('sh', ['-c', command], { cwd: p.path, env: { ...process.env, ...(await prototypeEnv(p)), ...(p.port ? { PORT: String(p.port) } : {}), CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  run.proc = proc
  let rest = ''
  const keep = (b: Buffer) => {
    const parts = (rest + b.toString()).split('\n'); rest = parts.pop() ?? ''
    for (const l of parts) run.lines.push(l.slice(0, 500))
    if (run.lines.length > KEEP) run.lines.splice(0, run.lines.length - KEEP)
  }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  const done = (status: StepRun['status'], exitCode: number | null) => {
    if (run.status !== 'running') return
    if (rest) run.lines.push(rest.slice(0, 500))
    clearTimeout(run.timer)
    Object.assign(run, { status, exitCode, endedAt: new Date().toISOString() })
    void record(p, run, actor).catch(() => {})
  }
  proc.on('error', (err) => { run.lines.push(`could not start: ${err.message}`); done('failed', null) })
  proc.on('exit', (code, signal) => done(signal ? 'stopped' : code === 0 ? 'passed' : 'failed', code))
  run.timer = setTimeout(() => { run.lines.push(`stopped: it ran longer than ${Math.round((opts.limitMs ?? LIMIT_MS) / 60_000)} minutes`); end(run) }, opts.limitMs ?? LIMIT_MS)
  mine.set(step, run)
  return view(run)
}

function end(run: Live) { if (run.proc?.pid && run.status === 'running') { try { process.kill(-run.proc.pid, 'SIGTERM') } catch { /* gone already */ } } }

/** Stops a running step: the command and everything it started. */
export function stopStep(prototypeId: string, step: number): StepRun {
  const run = runs.get(prototypeId)?.get(step)
  if (!run) throw new PlanError('that step has not been run')
  end(run)
  return view(run)
}

/** The engine is stopping: nothing it started is left running. */
export function stopStepRuns() { for (const m of runs.values()) for (const r of m.values()) end(r) }

/** What was run and how it ended, in the prototype's history: the agent and the person both see it happened. */
async function record(p: typeof prototype.$inferSelect, run: StepRun, actor: string) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, p.appId))
  if (!a) return
  const title = guideOf(p)?.steps[run.step]?.title ?? `step ${run.step + 1}`
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: p.appId, projectId: p.projectId, ideaId: p.ideaId, issueId: p.issueId, actor, type: 'prototype.step_ran',
    payload: { prototypeId: p.id, step: run.step, title, command: run.command, status: run.status, exitCode: run.exitCode, tail: run.lines.slice(-12) } }))
}
