/**
 * The scheduler: a pure function over rows. No clock, no I/O. Given the code sub-issues (it calls them tasks internally) it says which to start now
 * and why every other candidate is held. It picks one task at a time, so two tasks freed together never claim
 * the same file. (InDusk run-the-graph ADR D3, never built there.)
 */
import type { BuildStatus as TaskStatus } from './db/schema.js'

export interface SchedTask {
  id: string
  status: TaskStatus
  dependsOn: string[]
  files: string[] // paths or directory prefixes this task will touch; empty = shares with everyone
  priority?: number
  position?: number
}

export interface Held { id: string; reason: string }
export interface Pick { start: string[]; held: Held[] }

const ACTIVE: TaskStatus[] = ['running', 'awaiting_answer', 'merging', 'testing']
const CANDIDATE: TaskStatus[] = ['queued', 'ready']

/** Two claims overlap when equal, or when one is a directory containing the other. */
export function claimsOverlap(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '')
  const x = norm(a), y = norm(b)
  return x === y || x.startsWith(y + '/') || y.startsWith(x + '/')
}

/** The first path two tasks both claim (the narrower of the two when one is a directory); '' when either claims everything. */
export function sharedClaim(a: SchedTask, b: SchedTask): string | null {
  if (a.files.length === 0 || b.files.length === 0) return '' // no claims = claims everything
  for (const p of a.files) for (const q of b.files) if (claimsOverlap(p, q)) return p.length >= q.length ? p : q
  return null
}

export const tasksShareFiles = (a: SchedTask, b: SchedTask): boolean => sharedClaim(a, b) !== null

export function pickTasksToStart(tasks: SchedTask[], room: number): Pick {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const active = tasks.filter((t) => ACTIVE.includes(t.status))
  const candidates = tasks
    .filter((t) => CANDIDATE.includes(t.status))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))

  const start: SchedTask[] = []
  const held: Held[] = []
  for (const t of candidates) {
    const deps = t.dependsOn.map((id) => byId.get(id))
    const missing = t.dependsOn.find((id) => !byId.has(id))
    if (missing) { held.push({ id: t.id, reason: `depends on unknown task ${missing}` }); continue }
    const failed = deps.find((d) => d && (d.status === 'failed' || d.status === 'cancelled'))
    if (failed) { held.push({ id: t.id, reason: `blocked: ${failed.id} ${failed.status}` }); continue }
    const waiting = deps.find((d) => d && d.status !== 'done')
    if (waiting) { held.push({ id: t.id, reason: `waiting on ${waiting.id}` }); continue }
    const clash = [...active, ...start].find((o) => tasksShareFiles(t, o))
    if (clash) { const f = sharedClaim(t, clash); held.push({ id: t.id, reason: f ? `shares ${f} with ${clash.id}` : `shares files with ${clash.id}` }); continue }
    if (room - start.length <= 0) { held.push({ id: t.id, reason: 'at the session cap' }); continue }
    start.push(t)
  }
  return { start: start.map((t) => t.id), held }
}

/** Dependency cycles stop a project before it runs. Returns one cycle as a path, or null. */
export function findCycle(tasks: SchedTask[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []
  const visit = (id: string): string[] | null => {
    const s = state.get(id)
    if (s === 'done') return null
    if (s === 'visiting') return [...path.slice(path.indexOf(id)), id]
    state.set(id, 'visiting'); path.push(id)
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      const found = visit(dep)
      if (found) return found
    }
    path.pop(); state.set(id, 'done')
    return null
  }
  for (const t of tasks) { const c = visit(t.id); if (c) return c }
  return null
}
