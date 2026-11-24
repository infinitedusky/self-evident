/**
 * Where a task stands against its checklist, for its own page (Sandy, 2026-11-16, asked whether the task's nav shows
 * the difference between a checklist and the earlier way: it did not). For a task whose workflow is a checklist:
 * the stages after its prototype (build, check, probe, tests) with how far each is, and the list itself, every
 * acceptance criterion and requirement with the build's mark and the evidence. Null for a staged task, which keeps
 * the nav it had.
 *
 * `stagesOf` is pure, from the task's sub-tasks and its test events, so it is tested without a database.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, event, issue, project } from './db/schema.js'
import { acceptanceOf, proofOf, type Criterion } from './acceptance.js'
import { getIssue } from './issues.js'
import { inForce, type Covered } from './requirements.js'
import { buildOf, styleOf, type Build } from './steps.js'
import { CHECK_TITLE, FINISH_TITLE, isRound, MAX_ROUNDS, OLD_PROBE_TITLE, RECHECK_TITLE } from './verify.js'
import { PROBE_FIX_TITLE, PROBE_PREFIX } from './probes.js'
import { smokeChecks } from './smoke.js'
import { trajectoryOpen } from './trajectory.js'
import { workflowFor } from './work.js'

export type StageKey = 'build' | 'check' | 'probe' | 'test' | 'smoke'
export type StageState = 'todo' | 'doing' | 'done' | 'failed'
export interface Stage { key: StageKey; label: string; state: StageState; /** A few words: how far, or what is wrong. */ detail: string }
export interface Item { id: string; kind: 'criterion' | 'requirement'; text: string; /** For a requirement, what it means here. */ what?: string; mark: 'met' | 'unmet' | 'person' | 'na' | 'unchecked' | /** Owed at deploy, by whoever deploys. */ 'release' | /** Watched in production after the deploy. */ 'watch'; evidence?: string }
/**
 * One node of a checklist task's flow, for its graph: a sub-task that exists, or a stage still to come (Sandy,
 * 2026-11-17: "we should always show the workflow in nodes before it starts … the build and then a line that would
 * be going to like check or verify, and then one goes to probing … you could look at a graph or share that with
 * someone, and it would be obvious").
 */
export interface FlowNode {
  id: string
  /** The sub-task it is, when there is one; a stage to come has none. */
  sub?: string
  title: string
  state: StageState
  detail: string
  /** What it follows. Null: a sub-task of the build, which keeps the dependencies its plan gave it. */
  after: string[] | null
}
/**
 * The check, for the press that asks for it again (runner.checkAgain): how many items are not checked yet, whether it
 * can be asked for now and why not, and whether one asked for is under way.
 */
export interface CheckAgain { unchecked: number; canRun: boolean; running: boolean; why?: string }
export interface Checklist { trajectory?: { proven: number; total: number; open: { id: string; state: string }[] }; /** Owed at deploy, and watched after it: on the list, and not checked before the merge. `total` does not count them. */ release: number; watch: number; /** The check of what is not checked yet, asked for again. */ check: CheckAgain; /** Left to the person: theirs to show, in the smoke test. */ person: number; /** Not checked yet: no mark, and not left to anyone. Never a failure. */ unchecked: number; /** The whole test run as it last was; absent when the app has no test command. */ tests?: { ok: boolean | null; at: string | null; flaky: boolean; output?: string; running: boolean; canRun: boolean }; build: Build; stages: Stage[]; items: Item[]; met: number; unmet: number; total: number; flow: FlowNode[] }

const FIX = 'Fix what the whole test run found'
const kindOf = (title: string) => (title.startsWith(CHECK_TITLE) ? 'check' : title.startsWith(FINISH_TITLE) ? 'finish' : [OLD_PROBE_TITLE, PROBE_PREFIX, PROBE_FIX_TITLE].some((t) => title.startsWith(t)) ? 'probe' : title.startsWith(FIX) ? 'fix' : 'build')
const WORKING = ['running', 'merging', 'testing', 'awaiting_answer']

/** One stage's state from the sub-tasks that make it up: failed if any did, done if all are, doing if any has begun. */
function of(subs: { status: string }[]): StageState {
  if (!subs.length) return 'todo'
  if (subs.some((s) => s.status === 'failed')) return 'failed'
  if (subs.every((s) => s.status === 'done')) return 'done'
  return subs.some((s) => WORKING.includes(s.status) || s.status === 'done') ? 'doing' : 'todo'
}

export function stagesOf(i: { /** A test-first build (trajectory.ts): how many rows of its approved plan the engine has not seen red and then green. They keep the check open. */ trajectory?: { open: number; total: number }; subs: { title: string; status: string }[]; build: Build; unmet: number; total: number; met: number; /** Items with no mark that nobody was handed: added or changed since the check, or left out of its answer. They keep the check open. */ unchecked?: number; hasTests: boolean; /** The whole test run, last: true passed, false failed, null not run. */ tested: boolean | null; /** The run is going now. */ testing?: boolean; /** The checks left to a person (smoke.ts): how many wait, how many they failed, of how many. */ byHand?: { todo: number; failed: number; total: number } }): Stage[] {
  const by = (k: string) => i.subs.filter((s) => kindOf(s.title) === k)
  const builders = by('build'), checks = by('check'), finishes = by('finish'), probes = by('probe'), fixes = by('fix')
  const built = of(builders)
  const loop = of([...checks, ...finishes])
  const rounds = checks.filter((s) => isRound(s.title)).length
  const stuck = loop === 'done' && i.unmet > 0 && finishes.length >= MAX_ROUNDS
  // Checked, and something on the list has no mark: the step is open again until it has one (Sandy, 2026-11-23).
  const open = loop === 'done' && rounds > 0 ? i.unchecked ?? 0 : 0
  const rechecking = checks.some((s) => s.title.startsWith(RECHECK_TITLE) && s.status !== 'done' && s.status !== 'failed')
  // A row never seen red, never written, or due green and not: the build has not proven what its plan said it would.
  const unproven = loop === 'done' && rounds > 0 ? i.trajectory?.open ?? 0 : 0
  const notYet = [open ? `${open} not checked yet` : '', unproven ? `${unproven} of ${i.trajectory!.total} planned tests not proven` : ''].filter(Boolean).join('; ')
  const stages: Stage[] = [
    { key: 'build', label: 'Build', state: built, detail: built === 'todo' ? 'not built yet' : i.build === 'one' ? (built === 'done' ? 'built in one go' : built === 'failed' ? 'the build failed' : 'building, in one go') : `${builders.filter((s) => s.status === 'done').length} of ${builders.length} sub-tasks` },
    { key: 'check', label: 'Check', state: stuck ? 'failed' : loop === 'done' && (i.unmet > 0 || open || unproven) ? 'doing' : loop,
      detail: !rounds ? (rechecking ? 'checking what is not checked yet' : i.total ? `${i.total} to check` : 'nothing on the list') : stuck ? `${i.unmet} still not done after ${MAX_ROUNDS} rounds: yours${notYet ? `; ${notYet}` : ''}` : rechecking ? 'checking what is not checked yet' : loop === 'done' && !i.unmet && (open || unproven) ? `open${open ? ' again' : ''}: ${notYet}` : loop === 'done' && !i.unmet ? `${i.met} of ${i.total} met${rounds > 1 ? `, in ${rounds} rounds` : ''}` : `round ${rounds}${i.unmet ? `: ${i.unmet} not done, sent back` : ''}${notYet ? `; ${notYet}` : ''}` },
    { key: 'probe', label: 'Probe', state: of(probes), detail: of(probes) === 'done' ? `probed${probes.some((s) => s.title.startsWith(PROBE_FIX_TITLE)) ? ', and what the probes found was fixed' : ': nothing to send back'}` : of(probes) === 'failed' ? 'a probe could not be run' : of(probes) === 'doing' ? (probes.some((s) => s.title.startsWith(PROBE_FIX_TITLE) && s.status !== 'done') ? 'fixing what the probes found' : 'agents that did not build it are trying it') : 'after the check' },
  ]
  if (i.hasTests) {
    const fixing = of(fixes)
    stages.push({ key: 'test', label: 'Tests', state: i.testing || fixing === 'doing' || fixing === 'todo' && fixes.length ? 'doing' : i.tested === true ? 'done' : i.tested === false ? 'failed' : 'todo',
      detail: i.testing ? 'the whole run is under way' : fixes.length && fixing !== 'done' ? 'fixing what the run found' : i.tested === true ? `the whole run passed${fixes.length ? `, after ${fixes.length} fix${fixes.length === 1 ? '' : 'es'}` : ''}` : i.tested === false ? 'the whole run failed' : 'the whole run, once, last' })
  }
  const h = i.byHand
  // Always a stage, so it does not vanish when the check verifies everything itself (Sandy, 2026-11-17: "I might want
  // to look anyway … let it stay"): with nothing left to the person it is done, and still theirs to open and try.
  if (h && !h.total) stages.push({ key: 'smoke', label: 'Smoke test', state: loop === 'done' && !i.unmet && !open && !unproven && rounds > 0 ? 'done' : 'todo', detail: loop === 'done' && !i.unmet && !open && !unproven && rounds > 0 ? 'nothing left to you; look anyway' : 'yours, after the check' })
  if (h?.total) {
    const ready = of(i.subs) === 'done' // nothing is building: it is the person's turn
    stages.push({ key: 'smoke', label: 'Smoke test', state: h.failed ? 'failed' : !h.todo ? 'done' : ready ? 'doing' : 'todo',
      detail: h.failed ? `${h.failed} failed by hand, sent back` : !h.todo ? `${h.total} checked by hand` : ready ? `${h.todo} for you to check by hand` : `${h.todo} for you, once it is built and checked` })
  }
  return stages
}

const stateOfSub = (status: string): StageState => (status === 'failed' ? 'failed' : status === 'done' ? 'done' : WORKING.includes(status) ? 'doing' : 'todo')

/**
 * The whole flow as nodes, each after what it follows: what is built or being built, and what is still to come, so
 * the graph says how the task will go before any of it has started. Pure.
 */
export function flowOf(i: { subs: { id: string; title: string; status: string; sortOrder: number }[]; stages: Stage[]; build: Build }): FlowNode[] {
  const subs = [...i.subs].sort((a, b) => a.sortOrder - b.sortOrder)
  const stage = (k: StageKey) => i.stages.find((s) => s.key === k)
  const by = (k: string) => subs.filter((s) => kindOf(s.title) === k)
  const real = (s: { id: string; title: string; status: string }, after: string[] | null): FlowNode => ({ id: s.id, sub: s.id, title: s.title, state: stateOfSub(s.status), detail: '', after })
  const ghost = (id: string, title: string, k: StageKey, after: string[]): FlowNode => ({ id, title, state: stage(k)?.state ?? 'todo', detail: stage(k)?.detail ?? '', after })
  const out: FlowNode[] = []
  let last: string[]
  // The build: its sub-tasks as planned, or the one that will be made.
  const builders = by('build')
  if (builders.length) { out.push(...builders.map((s) => real(s, null))); last = builders.map((s) => s.id) }
  else { out.push(ghost('flow:build', i.build === 'one' ? 'Build it' : 'Planned into sub-tasks, and built', 'build', [])); last = ['flow:build'] }
  // The check, and each round of finishing what it found and checking again, one after the other.
  const loop = subs.filter((s) => ['check', 'finish'].includes(kindOf(s.title)))
  if (loop.length) for (const s of loop) { out.push(real(s, last)); last = [s.id] }
  else { out.push(ghost('flow:check', 'Check it against its list', 'check', last)); last = ['flow:check'] }
  const probes = by('probe')
  if (probes.length) for (const s of probes) { out.push(real(s, last)); last = [s.id] }
  else { out.push(ghost('flow:probe', 'Probes', 'probe', last)); last = ['flow:probe'] }
  // The whole test run is not a sub-task; what fixes it is. Each fix leads to the run again.
  for (const s of by('fix')) { out.push(real(s, last)); last = [s.id] }
  if (stage('test')) { out.push(ghost('flow:test', 'The whole test run', 'test', last)); last = ['flow:test'] }
  if (stage('smoke')) out.push(ghost('flow:smoke', 'Smoke test: yours, by hand', 'smoke', last))
  return out
}

/** Why the check cannot be asked for again now; null when it can. Pure, and the runner's own answer (checkAgain). */
export function whyNotCheck(i: { unchecked: number; /** Its sub-tasks, not the canceled ones. */ subs: number; /** One of them has not landed: still to build, building, or failed. */ going: boolean; /** The whole test run is under way. */ testing?: boolean }): string | null {
  if (!i.subs) return 'nothing is built yet: the check comes after the build, by itself'
  if (i.going) return 'a sub-task has not landed yet: the check is of what is built'
  if (i.testing) return 'the whole test run is under way: wait for it'
  if (!i.unchecked) return 'everything on the list is checked, or left to you: there is nothing not checked yet'
  return null
}

const criterionItem = (c: Criterion): Item => ({
  id: c.id, kind: 'criterion', text: c.text,
  mark: proofOf(c) === 'watch' ? 'watch' : proofOf(c) === 'release' ? (c.built === true ? 'met' : 'release') : c.built === true ? 'met' : c.built === false ? 'unmet' : c.builtEvidence || c.kind === 'smoke' ? 'person' : 'unchecked',
  evidence: proofOf(c) === 'release' && c.byHand ? c.byHand.note || 'Done at deploy.' : c.builtEvidence ?? (c.built === undefined ? c.check : undefined),
})

/** Where the task stands; null when its workflow is not a checklist (or it is a sub-task). */
export async function checklistOf(issueId: string): Promise<Checklist | null> {
  const t = await getIssue(db, issueId)
  if (t.parentId || t.kind !== 'code') return null
  const w = (await workflowFor(db, { issueId: t.id })).workflow
  if (styleOf(w) !== 'checklist') return null
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [p] = t.projectId ? await db.select().from(project).where(eq(project.id, t.projectId)) : []
  const required = inForce(a?.setup, p?.requirements, w?.requirements)
  const held = (t.requirements ?? []) as Covered[]
  const items: Item[] = [
    ...acceptanceOf(t).map(criterionItem),
    ...required.map((r): Item => {
      const c = held.find((x) => x.key === r.key)
      return { id: `req_${r.key}`, kind: 'requirement', text: r.name, what: r.what, mark: c?.built === false ? 'unmet' : c?.built === true ? (c.applies ? 'met' : 'na') : c?.left ? 'person' : 'unchecked', evidence: c?.how || undefined }
    }),
  ]
  const subs = await db.select({ id: issue.id, title: issue.title, state: issue.state, sortOrder: issue.sortOrder }).from(issue).where(eq(issue.parentId, t.id))
  const live = subs.filter((s) => s.state !== 'canceled' && s.state !== 'duplicate')
  const builds = live.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, live.map((s) => s.id))) : []
  const [last] = await db.select({ payload: event.payload, ts: event.ts }).from(event).where(and(eq(event.issueId, t.id), eq(event.type, 'task.tested'))).orderBy(desc(event.seq)).limit(1)
  // A run with a start and no end is going now (the runner says both; one a restart cut off is made again at the start).
  const [mark] = await db.select({ type: event.type }).from(event).where(and(eq(event.issueId, t.id), inArray(event.type, ['task.testing', 'task.test_ran', 'task.test_error']))).orderBy(desc(event.seq)).limit(1)
  const testing = mark?.type === 'task.testing'
  const hasTests = !!(a?.setup as { test_cmd?: string } | null)?.test_cmd
  const doneAtDeploy = new Set(acceptanceOf(t).filter((c) => proofOf(c) === 'release').map((c) => c.id)), met = items.filter((x) => (x.mark === 'met' || x.mark === 'na') && !doneAtDeploy.has(x.id)).length, reports = new Set(required.filter((r) => r.blocks === false).map((r) => `req_${r.key}`)), unmet = items.filter((x) => x.mark === 'unmet' && !reports.has(x.id)).length // one set to report only holds nothing
  const traj = await trajectoryOpen(t.id)
  const b = traj ? 'planned' as const : buildOf(w) // a test-first build is sub-tasks, whatever its workflow would otherwise do
  const statusOf = (id: string) => builds.find((x) => x.issueId === id)?.status ?? 'queued'
  const notChecked = items.filter((x) => x.mark === 'unchecked').length, person = items.filter((x) => x.mark === 'person').length
  const release = items.filter((x) => x.mark === 'release').length, watch = items.filter((x) => x.mark === 'watch').length
  const total = items.length - doneAtDeploy.size - watch // what is checked before the merge: the rest is owed later, and never read as missing
  const stages = stagesOf({ subs: live.map((s) => ({ title: s.title, status: builds.find((x) => x.issueId === s.id)?.status ?? 'queued' })), build: b, unmet, met, unchecked: notChecked, total, hasTests, ...(traj ? { trajectory: { open: traj.open.length, total: traj.total } } : {}), testing, tested: last ? (last.payload as { ok?: boolean }).ok === true : null,
      byHand: (() => { const h = smokeChecks(acceptanceOf(t)); return { todo: h.filter((x) => x.mark === 'todo').length, failed: h.filter((x) => x.mark === 'fail').length, total: h.length } })() })
  const ran = last?.payload as { ok?: boolean; flaky?: boolean; tail?: string } | undefined
  /** The whole test run as it last was, and whether it can be asked for again: every sub-task in, none going. The runner says no to the rest (a check or a probe still to come). */
  const tests = hasTests ? { ok: ran ? ran.ok === true : null, at: last?.ts ? new Date(last.ts).toISOString() : null, flaky: ran?.flaky === true, output: ran && ran.ok !== true ? (ran.tail ?? '').slice(-8000) : undefined, running: testing,
    canRun: !testing && live.length > 0 && live.every((s) => statusOf(s.id) === 'done') } : undefined
  // The check again, of what is not checked yet: once everything it has is built and nothing is going.
  const going = live.some((s) => statusOf(s.id) !== 'done')
  const check: CheckAgain = { unchecked: notChecked, running: live.some((s) => s.title.startsWith(RECHECK_TITLE) && !['done', 'failed', 'cancelled'].includes(statusOf(s.id))),
    ...(() => { const why = whyNotCheck({ unchecked: notChecked, subs: live.length, going, testing }); return why ? { canRun: false, why } : { canRun: true } })() }
  return { ...(traj ? { /** A test-first build: how much of its approved test plan is proven, and the rows that are not. */ trajectory: { proven: traj.total - traj.open.length, total: traj.total, open: traj.open } } : {}), release, watch, check, person, unchecked: notChecked, tests, build: b, items, met, unmet, total, stages, flow: flowOf({ subs: live.map((x) => ({ id: x.id, title: x.title, status: statusOf(x.id), sortOrder: x.sortOrder })), stages, build: b }) }
}
