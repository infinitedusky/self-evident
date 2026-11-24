/**
 * The test trajectory: every test a build commits to, in one table, and the engine's own record of each one failing
 * for the right reason before it passes (Sandy, 2026-11-23: "186 new tests, and nothing proved any of them had ever
 * been red"; docs/proven-work.md, part 3). After InDusk's Test Trajectory (its guide's `Writable at` and `Passes
 * at`, a test phase first, the deferral register, regression guards, real red against fake red), with one
 * difference that is the point: there the state of a row was the builder's word, reviewed by a person; here the
 * engine runs each row's test itself, in the sub-task's checkout, and keeps what it saw.
 *
 * A plan is slices (what the build is cut into, in order) and rows (one test each):
 * - **Writable at**: the test phase, or the slice it can first be written in. Anything not writable in the test
 *   phase says why (the deferral register), and should carry its code so a reader can check the promise.
 * - **Passes at**: the slice it turns green in.
 * - A **regression guard** is green the moment it is written: it pins behaviour that exists. It says why, because a
 *   guard and a rubber stamp look the same.
 * - Every acceptance criterion names its tests, or is proven another way (smoke, release, watch: acceptance.ts).
 *
 * The build is made from it (`trajectoryProposal`): a test phase that writes every test writable now, then each
 * slice. A slice with tests deferred to it is two sub-tasks, its tests and then its code, so the red is seen by the
 * engine between them and never taken on trust. After each sub-task the engine runs the rows due there (`gateAt`):
 * - **real red** (it ran, an assertion failed): required of a test before its code;
 * - **fake red** (it failed to load: an import of something not built yet): refused. It has not been written;
 * - **green on its first run**: refused, unless the plan declares the row a regression guard.
 * What is refused goes back to the builder with what the engine saw, as any failed attempt does.
 *
 * Kept on the task's Test plan step (`step_work.refs`, as `{ plan, approved }`: the draft, and the one a person
 * approved, which is what the build is held to), with the table as Markdown in its body for whoever reads the step.
 * Runs are events (`trajectory.run`), so nothing here needed a new table.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { acceptanceOf, proofOf, type Criterion } from './acceptance.js'
import { db } from './db/client.js'
import { app, event, stepWork } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { getIssue, PlanError } from './issues.js'
import type { Proposal } from './planner.js'

/** The smallest level that can prove it (InDusk's test levels, with this product's words for the middle ones). */
export const LEVELS = ['unit', 'integration', 'component', 'browser', 'contract', 'live'] as const
export type Level = typeof LEVELS[number]
export const LEVEL_SAYS: Record<Level, string> = {
  unit: 'a rule, fed its inputs',
  integration: 'several parts together, against the real database',
  component: 'one piece of the screen, rendered',
  browser: 'the app in a real browser',
  contract: 'that we still fit something we do not own',
  live: 'the whole story against the real system, once',
}
/** The test phase: the first sub-task, where every test that can be written now is written and seen to fail. */
export const TESTS = 'tests'
export const TEST_PHASE_TITLE = 'Write the tests, and see them fail'
/** The first half of a slice that has tests deferred to it: those tests, written and seen to fail, before its code. */
export const redTitle = (slice: string) => `${slice}: its tests first`

export interface Slice { /** Its handle in the rows: short, lower case. */ key: string; /** Its sub-task's title: what it builds, in a few words. */ title: string; /** What it builds, for its builder. */ what: string; /** When no row turns green at it: why (schema only, a deletion, a refactor, set-up). */ none?: string }
export interface Row {
  /** T1, T2, … */ id: string
  /** What it proves, in words a reviewer reads. */ asserts: string
  level: Level
  /** The acceptance criteria it proves (their ids). */ criteria: string[]
  /** Its file, from the repository's root. */ test: string
  /** The test's own name in that file, when the file holds rows that turn green at different slices. */ name?: string
  /** Where it can be written: the test phase, or a slice's key. */ writableAt: string
  /** The slice it turns green in. For a regression guard, where it is written. */ passesAt: string
  /** A regression guard: green when written, because it pins what already exists. Why it is one. */ guard?: string
  /** Not writable in the test phase: why, and its code, so the promise can be checked. */ deferred?: { why: string; code?: string }
}
export interface TestPlan { slices: Slice[]; rows: Row[]; /** For the person: anything the table cannot say (what cannot be tested here, and how we will know instead). */ notes?: string }

const one = (s: unknown, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const keyOf = (s: unknown) => one(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** What was given, tidied: nothing invented, nothing checked (validatePlan says what is wrong with it). */
export function cleanPlan(given: unknown): TestPlan {
  const g = (given ?? {}) as { slices?: unknown; rows?: unknown; notes?: unknown }
  const slices = (Array.isArray(g.slices) ? g.slices : []).map((s: Partial<Slice>): Slice => ({ key: keyOf(s?.key || s?.title), title: one(s?.title, 120), what: String(s?.what ?? '').trim().slice(0, 4000), ...(one(s?.none) ? { none: one(s?.none) } : {}) }))
  const rows = (Array.isArray(g.rows) ? g.rows : []).map((r: Partial<Row> & { criterion?: unknown }, n): Row => {
    const criteria = (Array.isArray(r?.criteria) ? r.criteria : r?.criterion ? [r.criterion] : []).map((c) => one(c, 60)).filter(Boolean)
    const at = (v: unknown) => (keyOf(v) === 'test-phase' || keyOf(v) === TESTS || !one(v) ? TESTS : keyOf(v))
    const d = r?.deferred as { why?: unknown; code?: unknown } | undefined
    return {
      id: one(r?.id, 12).toUpperCase() || `T${n + 1}`, asserts: one(r?.asserts, 300), level: (LEVELS as readonly string[]).includes(String(r?.level)) ? r!.level as Level : 'unit', criteria,
      test: one(r?.test, 300).replace(/^\.\//, ''), ...(one(r?.name, 200) ? { name: one(r?.name, 200) } : {}),
      writableAt: at(r?.writableAt), passesAt: one(r?.passesAt) ? at(r?.passesAt) : at(r?.writableAt),
      ...(one(r?.guard) ? { guard: one(r?.guard) } : {}),
      ...(d && one(d.why) ? { deferred: { why: one(d.why), ...(String(d.code ?? '').trim() ? { code: String(d.code).trim().slice(0, 6000) } : {}) } } : {}),
    }
  })
  return { slices, rows, ...(String(g.notes ?? '').trim() ? { notes: String(g.notes).trim().slice(0, 4000) } : {}) }
}

/** Where a row's phase falls in the build's order: the test phase first, then the slices as listed. -1: no such place. */
export const orderOf = (plan: TestPlan, at: string) => (at === TESTS ? 0 : plan.slices.findIndex((s) => s.key === at) + 1 || -1)

/**
 * What is wrong with a plan, one line each; empty when it can be approved. Pure. The rules are the guide's, plus the
 * ones the engine needs to run a row by itself (a file; a name where a file is shared across slices).
 */
export function validatePlan(plan: TestPlan, criteria: Criterion[] = []): string[] {
  const out: string[] = []
  if (!plan.slices.length) out.push('It has no slices: the build is cut into at least one, each a sub-task.')
  if (!plan.rows.length) out.push('It has no rows: a build that commits to no test proves nothing. A task that truly has nothing to test skips this step, with the reason.')
  const seen = new Set<string>()
  for (const s of plan.slices) {
    if (!s.key || !s.title) out.push('A slice needs a key and a title.')
    if (s.key === TESTS) out.push(`A slice cannot be called "${TESTS}": that is the test phase.`)
    if (seen.has(s.key) || plan.slices.filter((x) => x.title === s.title).length > 1) out.push(`Two slices are called "${s.title}": each is a sub-task, told apart by its title.`)
    seen.add(s.key)
    if (!s.what) out.push(`The slice "${s.title}" does not say what it builds.`)
    if (!plan.rows.some((r) => r.passesAt === s.key) && !s.none) out.push(`No test turns green at the slice "${s.title}". Give it one, or say why it has none (none: schema only, a deletion, a refactor, set-up).`)
  }
  const ids = new Set<string>()
  const known = new Set(criteria.map((c) => c.id))
  for (const r of plan.rows) {
    if (ids.has(r.id)) out.push(`Two rows are called ${r.id}.`)
    ids.add(r.id)
    if (!r.asserts) out.push(`${r.id} does not say what it proves.`)
    if (!r.test) out.push(`${r.id} names no test file: the engine runs each row itself, and needs the file.`)
    const w = orderOf(plan, r.writableAt), p = orderOf(plan, r.passesAt)
    if (w < 0) out.push(`${r.id} is writable at "${r.writableAt}", which is not the test phase or a slice.`)
    if (p < 0) out.push(`${r.id} passes at "${r.passesAt}", which is not a slice.`)
    if (w >= 0 && p >= 0 && w > p) out.push(`${r.id} passes (${r.passesAt}) before it can be written (${r.writableAt}).`)
    if (r.guard) { if (r.writableAt !== r.passesAt) out.push(`${r.id} is a regression guard, so it is green where it is written: its Writable at and Passes at are the same.`) }
    else {
      if (r.passesAt === TESTS) out.push(`${r.id} passes in the test phase, where nothing is built: only a regression guard is green when written. Say why it is one (guard), or give the slice it turns green in.`)
      if (r.writableAt !== TESTS && !r.deferred?.why) out.push(`${r.id} is not written in the test phase and does not say why: a test not written up front gives its reason (deferred.why), and should carry its code.`)
    }
    for (const c of r.criteria) if (known.size && !known.has(c)) out.push(`${r.id} names the criterion ${c}, which this task does not have.`)
    if (!r.criteria.length && !r.guard) out.push(`${r.id} proves no acceptance criterion: name the one it proves. (A regression guard need not.)`)
  }
  // Rows in one file are run together, so they share one fate unless each names its own test.
  const byFile = new Map<string, Row[]>()
  for (const r of plan.rows) if (r.test) byFile.set(r.test, [...(byFile.get(r.test) ?? []), r])
  for (const [file, rows] of byFile) {
    const fates = new Set(rows.map((r) => `${r.writableAt}>${r.passesAt}>${r.guard ? 'guard' : ''}`))
    if (fates.size > 1 && rows.some((r) => !r.name)) out.push(`${rows.map((r) => r.id).join(', ')} share ${file} and are written or turn green at different times: give each its test's name (name), so the engine can run it alone, or put them in files of their own.`)
  }
  // Every criterion names its tests, or is proven another way.
  for (const c of criteria) if (!proofOf(c) && !plan.rows.some((r) => r.criteria.includes(c.id))) out.push(`No row proves the criterion ${c.id} ("${one(c.text, 90)}"). Give it a test, or say on the criterion how else it is proven (smoke, release or watch).`)
  return [...new Set(out)]
}

/** The plan as Markdown, for whoever reads the step: the table, the register, the guards, the slices. */
export function planMarkdown(plan: TestPlan, criteria: Criterion[] = []): string {
  const at = (k: string) => (k === TESTS ? 'Test phase' : plan.slices.find((s) => s.key === k)?.title ?? k)
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const deferred = plan.rows.filter((r) => r.deferred), guards = plan.rows.filter((r) => r.guard)
  const fence = (code: string) => { const n = Math.max(3, ...(code.match(/`+/g) ?? []).map((m) => m.length + 1)); return `${'`'.repeat(n)}\n${code}\n${'`'.repeat(n)}` }
  const other = criteria.filter((c) => proofOf(c))
  return [
    '## Test trajectory',
    '| ID | Asserts | Level | Criterion | Test | Writable at | Passes at |\n|---|---|---|---|---|---|---|',
    ...plan.rows.map((r) => `| ${r.id} | ${cell(r.asserts)} | ${r.level} | ${r.criteria.join(', ') || (r.guard ? 'guard' : '')} | \`${r.test}\`${r.name ? ` › ${cell(r.name)}` : ''} | ${at(r.writableAt)} | ${r.guard ? `${at(r.passesAt)} (guard)` : at(r.passesAt)} |`),
    other.length ? `\n### Proven another way\n\n${other.map((c) => `- ${c.id} ${one(c.text, 140)}: **${proofOf(c)}**`).join('\n')}` : '',
    deferred.length ? `\n### Deferred: not written in the test phase\n\n${deferred.map((r) => `- **${r.id}**, written at ${at(r.writableAt)}: ${r.deferred!.why}${r.deferred!.code ? `\n\n${fence(r.deferred!.code)}` : ''}`).join('\n')}` : '',
    guards.length ? `\n### Regression guards: green when written\n\n${guards.map((r) => `- **${r.id}**: ${r.guard}`).join('\n')}` : '',
    `\n### The build, in order\n\n1. **Test phase**: every test writable now, written and seen to fail (${plan.rows.filter((r) => r.writableAt === TESTS).length} of ${plan.rows.length}).\n${plan.slices.map((s, n) => `${n + 2}. **${s.title}**: ${one(s.what, 300)}${s.none ? ` No test turns green here: ${s.none}.` : ''}`).join('\n')}`,
    plan.notes ? `\n### Notes\n\n${plan.notes}` : '',
  ].filter(Boolean).join('\n')
}

// ---- runs: what the engine saw ----

/** What a run of one row's test was: an assertion failed; it could not load; it passed; no test was found; or it failed and the engine cannot tell how. */
export type Outcome = 'red' | 'fake' | 'green' | 'none' | 'unclear'
export const OUTCOME_SAYS: Record<Outcome, string> = { red: 'failed on an assertion', fake: 'failed to load', green: 'passed', none: 'no test was found', unclear: 'failed, and the output does not say how' }

const LOAD = /Test suite failed to run|Failed to resolve import|Failed to load url|Cannot find module|Cannot find package|does not provide an export named|is not exported (by|from)|ERR_MODULE_NOT_FOUND|ERROR collecting|errors? during collection|Interrupted: \d+ errors?|ImportError|ModuleNotFoundError|\[build failed\]|cannot find package|undefined: \w+|SyntaxError|Transform failed|error TS\d+/i
const NO_TESTS = /No test files found|No tests found|no tests ran|collected 0 items(?! \/)|Tests\s+no tests|no test files\b|0 tests collected/i
/** Tests that ran and failed, as each common runner counts them. */
function failedCount(out: string): number {
  const counts = [
    /Tests\s+(\d+) failed/, // vitest
    /Tests:\s+(\d+) failed/, // jest
    /=+ (?:.*, )?(\d+) failed/, // pytest's last line
    /^FAIL(?:ED)? .*::/m, // pytest's short summary
    /^--- FAIL/m, // go
    /^# fail\s+(\d+)/m, // node:test, tap
  ]
  for (const re of counts) { const m = out.match(re); if (m) { const n = m[1] === undefined ? 1 : Number(m[1]); if (n > 0) return n } }
  return 0
}
/** An assertion's own words, for a runner whose counts are not known: read only when nothing says the file failed to load. */
const ASSERTED = /AssertionError|AssertionFailedError|assertion failed|expected .+ (to |but )|Expected:|^E\s+assert/im

/**
 * What a run was, from its exit code and what it printed. Pure. A test that fails to load has not been written
 * (InDusk's guide, "Real red and fake red"): the exit code is the same as a real failure, which is why this reads the
 * output. Vitest, Jest, pytest, Go and TAP are known; anything else that fails without saying how is `unclear`, and is
 * not taken as red.
 */
export function classifyRun(exit: number | null, output: string): Outcome {
  const out = output.replace(/\x1b\[[0-9;]*m/g, '')
  if (exit === 0) return NO_TESTS.test(out) && !/\b[1-9]\d* passed\b|Tests\s+[1-9]\d* passed|^ok\s/m.test(out) ? 'none' : 'green'
  if (failedCount(out) > 0) return 'red' // a test ran and failed: the runner counted it
  if (LOAD.test(out)) return 'fake'
  if (NO_TESTS.test(out)) return 'none'
  return ASSERTED.test(out) ? 'red' : 'unclear'
}

/**
 * The command that runs one row's test: the app's own (`setup.test_row_cmd`, with {file} and, where it takes one,
 * {name}), else its test command with the file after it, which is how every runner we know takes one. Null when the
 * app has no test command: nothing can be run, and the plan says so.
 */
export function rowCommand(setup: unknown, row: { test: string; name?: string }): string | null {
  const s = (setup ?? {}) as { test_cmd?: string; test_row_cmd?: string }
  const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`
  const own = s.test_row_cmd?.trim()
  if (own) {
    return own.replace(/\{file\}/g, q(row.test)).replace(/\{name\}/g, q(row.name ?? ''))
  }
  const base = s.test_cmd?.trim()
  if (!base) return null
  const python = /\bpytest\b/.test(base), go = /\bgo test\b/.test(base)
  if (go) return `go test ${q(`./${row.test.replace(/\/[^/]*$/, '')}`)}${row.name ? ` -run ${q(row.name)}` : ''}`
  if (python) return `${base} ${q(row.test)}${row.name ? ` -k ${q(row.name)}` : ''}`
  // A package script takes the file after "--" with npm, and as it is with pnpm, yarn and bun; a runner called directly takes it as it is.
  const sep = /^npm (run |test)/.test(base) && !/ -- /.test(base) ? ' --' : ''
  return `${base}${sep} ${q(row.test)}${row.name ? ` -t ${q(row.name)}` : ''}`
}

export interface RowRun { row: string; outcome: Outcome; /** The sub-task it was run after. */ sub?: string | null; /** test phase, a slice's key, or its `key:red` half. */ at: string; sha?: string | null; ts: string; /** The end of what it printed, for one that was refused. */ tail?: string }
export type RowState = 'planned' | 'red' | 'green' | 'never-red' | 'fake' | 'unwritten' | 'unclear' | 'failing'
export const STATE_SAYS: Record<RowState, string> = {
  planned: 'not run yet', red: 'seen red: waiting for its code', green: 'seen red, then green', 'never-red': 'green, and never seen red',
  fake: 'failed to load: not a failing test', unwritten: 'no test found', unclear: 'failed, and the engine cannot tell how', failing: 'was green, and fails now',
}

/** Where one row stands, from its runs in order. Pure. A guard is green when written; anything else must be seen red first. */
export function rowState(row: Row, runs: RowRun[]): RowState {
  const mine = runs.filter((r) => r.row === row.id)
  if (!mine.length) return 'planned'
  const last = mine[mine.length - 1].outcome
  const sawRed = mine.some((r) => r.outcome === 'red'), sawGreen = mine.slice(0, -1).some((r) => r.outcome === 'green')
  if (last === 'green') return row.guard || sawRed ? 'green' : 'never-red'
  if (last === 'red') return row.guard || sawGreen ? 'failing' : 'red'
  return last === 'fake' ? 'fake' : last === 'none' ? 'unwritten' : 'unclear'
}

/** Whether the trajectory holds: every row seen red and then green (a guard: green). What does not, by row. Pure. */
export function holds(plan: TestPlan, runs: RowRun[]): { ok: boolean; open: { id: string; state: RowState }[] } {
  const open = plan.rows.map((r) => ({ id: r.id, state: rowState(r, runs) })).filter((x) => x.state !== 'green')
  return { ok: open.length === 0, open }
}

/** The sub-task a title is, in a plan: the test phase, a slice's tests-first half, or the slice. Null: not one of the plan's. */
export function placeOf(plan: TestPlan, title: string): { at: string; half: 'red' | 'green' } | null {
  if (title === TEST_PHASE_TITLE) return { at: TESTS, half: 'red' }
  for (const s of plan.slices) { if (title === redTitle(s.title)) return { at: s.key, half: 'red' }; if (title === s.title) return { at: s.key, half: 'green' } }
  return null
}

/** The rows the engine runs after a sub-task: the ones written there; and, once a slice's code is in, every row due green by then. */
export function rowsDue(plan: TestPlan, place: { at: string; half: 'red' | 'green' }): { written: Row[]; green: Row[] } {
  const here = plan.rows.filter((r) => r.writableAt === place.at)
  // The test phase writes everything writable now, its guards among them; a slice's tests-first half writes what was deferred to it; its guards are written with its code.
  if (place.half === 'red') { const written = place.at === TESTS ? here : here.filter((r) => !r.guard); return { written, green: written.filter((r) => r.guard) } }
  const n = orderOf(plan, place.at)
  return { written: here.filter((r) => r.guard), green: plan.rows.filter((r) => { const p = orderOf(plan, r.passesAt); return p >= 0 && p <= n }) }
}

/**
 * What the engine holds a sub-task to, from what it just saw; empty when the sub-task may land. Pure.
 * `now` is this run's outcome for each row it ran; `before` is every earlier run.
 */
export function gateAt(plan: TestPlan, place: { at: string; half: 'red' | 'green' }, now: Map<string, { outcome: Outcome; tail?: string }>, before: RowRun[]): string[] {
  const out: string[] = []
  const due = rowsDue(plan, place)
  const saw = (r: Row) => now.get(r.id)
  const said = (r: Row) => { const s = saw(r); return s?.tail ? `\n  What the run printed, at its end:\n  ${s.tail.split('\n').slice(-12).join('\n  ')}` : '' }
  for (const r of due.written) {
    const o = saw(r)?.outcome
    if (r.guard) { if (o !== 'green') out.push(`${r.id} (${r.test}) is a regression guard, green when written, and it ${o ? OUTCOME_SAYS[o] : 'was not run'}.${said(r)}`); continue }
    if (o === 'red') continue
    if (o === 'green') out.push(`${r.id} (${r.test}) passed the first time it ran. A test that has never failed proves nothing: nothing it tests is built yet, so it should fail on its assertion. Make it assert what the plan says ("${r.asserts}"). If it is right that it passes already, it is a regression guard, and the plan must say so: tell the person, do not change the test to fail falsely.`)
    else if (o === 'fake') out.push(`${r.id} (${r.test}) failed to load, which is not a failing test: its assertion never ran. Reach what it tests through a boundary that exists today (an HTTP call, a query, a command), or add the smallest stub of the thing it imports so the file loads, and let the assertion be what fails.${said(r)}`)
    else if (o === 'none' || !o) out.push(`${r.id}: no test was found at ${r.test}${r.name ? ` named "${r.name}"` : ''}. The plan commits to it here.`)
    else out.push(`${r.id} (${r.test}) failed, and the engine cannot tell an assertion from a load error in what it printed. Make the failure an assertion's, plainly.${said(r)}`)
  }
  for (const r of due.green) {
    if (r.guard && due.written.includes(r)) continue // said above
    const o = saw(r)?.outcome
    const sawRed = before.some((x) => x.row === r.id && x.outcome === 'red')
    if (o !== 'green') { out.push(`${r.id} (${r.test}) is due green ${r.passesAt === place.at ? 'here' : `since ${r.passesAt}`}, and it ${o ? OUTCOME_SAYS[o] : 'was not run'}.${said(r)}`); continue }
    if (!r.guard && !sawRed) out.push(`${r.id} (${r.test}) is green and was never seen red: the engine has no run of it failing before its code was written. It is not counted as proven.`)
  }
  return out
}

/**
 * The build an approved plan is: the test phase, then each slice in order, each waiting on the one before. A slice
 * with tests deferred to it is two sub-tasks: its tests, seen red by the engine, then its code.
 */
export function trajectoryProposal(plan: TestPlan, i: { criteria: Criterion[]; held?: string; prototype?: { branch: string; path: string } | null; base: string; rowCmd: (r: Row) => string | null }): Proposal {
  const at = (k: string) => (k === TESTS ? 'the test phase' : `"${plan.slices.find((s) => s.key === k)?.title ?? k}"`)
  const line = (r: Row) => `- **${r.id}** ${r.asserts} — \`${r.test}\`${r.name ? ` › "${r.name}"` : ''} (${r.level}; proves ${r.criteria.join(', ') || 'existing behaviour'}; ${r.guard ? `a regression guard: ${r.guard}` : `turns green at ${at(r.passesAt)}`})${i.rowCmd(r) ? `\n  Run it: \`${i.rowCmd(r)}\`` : ''}${r.deferred?.code ? `\n  As planned:\n\n  \`\`\`\`\n  ${r.deferred.code.split('\n').join('\n  ')}\n  \`\`\`\`` : ''}`
  const rules = [
    'How the engine checks this sub-task, by running each test itself when you finish:',
    '- A test written here must **fail on its own assertion**. A file that cannot load (an import of something not built yet) has not been written: the engine reads that as a fake red and sends the sub-task back.',
    '- A test that **passes the first time** is refused too, unless the plan calls it a regression guard: it has proved nothing.',
    '- Write early tests against a boundary that exists today (an HTTP call, a query, a command), so they fail for the right reason. Where a test must import something new, add the smallest stub that lets the file load, and nothing that makes the assertion pass.',
  ].join('\n')
  const proto = i.prototype ? `\n\nThe approved prototype is on branch \`${i.prototype.branch}\` (${i.prototype.path}): read what it changed (\`git diff ${i.base}...${i.prototype.branch}\`) for what the real thing does. Take its code where it is good; do not merge the branch.` : ''
  const phases: Proposal['phases'] = []
  const early = plan.rows.filter((r) => r.writableAt === TESTS)
  phases.push({
    key: TESTS, title: TEST_PHASE_TITLE, description: 'Every test that can be written now, written and seen to fail before anything is built.', depends_on: [], files: [...new Set(early.map((r) => r.test))], steps: [], checks: [], done_when: 'Each of these tests runs and fails on its own assertion; each regression guard passes.',
    summary: [`Write these ${early.length} tests, and nothing else: no product code, beyond a stub a test needs in order to load. This is the test phase of a build that writes its tests first.`, early.map(line).join('\n'), rules, 'Commit the tests. Do not make any of them pass: that is the work of the sub-tasks after this one.'].join('\n\n'),
  })
  let last = TESTS
  for (const s of plan.slices) {
    const deferred = plan.rows.filter((r) => r.writableAt === s.key && !r.guard), guards = plan.rows.filter((r) => r.writableAt === s.key && r.guard), due = plan.rows.filter((r) => r.passesAt === s.key && !r.guard)
    if (deferred.length) {
      const key = `${s.key}-tests`
      phases.push({
        key, title: redTitle(s.title), description: `The tests that could not be written before "${s.title}", written and seen to fail before its code.`, depends_on: [last], files: [...new Set(deferred.map((r) => r.test))], steps: [], checks: [], done_when: 'Each of these tests runs and fails on its own assertion.',
        summary: [`Write these ${deferred.length} tests, which wait for what the earlier sub-tasks built, and nothing else: no product code beyond a stub a test needs in order to load.`, deferred.map(line).join('\n'), rules, 'Commit the tests. Do not make them pass: the next sub-task does.'].join('\n\n'),
      })
      last = key
    }
    phases.push({
      key: s.key, title: s.title, description: one(s.what, 300), depends_on: [last], files: [], steps: [], checks: [], done_when: due.length ? `${due.map((r) => r.id).join(', ')} pass, and every test that passed before still does.` : `It is built. No test turns green here: ${s.none ?? 'none is planned'}.`,
      summary: [s.what, due.length ? `These tests are written and failing, and this sub-task is what makes them pass. Change the code, not the tests: a test changed to pass is a test that proves nothing, and one that is wrong is said to the person.\n\n${due.map(line).join('\n')}` : `No test turns green here: ${s.none ?? 'none is planned'}.`, guards.length ? `Write these regression guards too; each passes when written:\n\n${guards.map(line).join('\n')}` : '', 'When you finish, the engine runs each of those tests itself, and every test an earlier sub-task made pass. One that is not green sends this sub-task back.', i.held ?? ''].filter(Boolean).join('\n\n') + proto,
    })
    last = s.key
  }
  return { phases, decisions: [], questions: [], notes: `Built from its approved test plan: a test phase, then ${plan.slices.length} slice${plan.slices.length === 1 ? '' : 's'}.` }
}

// ---- stored ----

interface Stored { plan?: TestPlan; approved?: TestPlan }
const storedOf = (refs: unknown): Stored => (refs && !Array.isArray(refs) && typeof refs === 'object' ? refs as Stored : {})

/** A task's test plan: the draft as last written, and the one a person approved, which is what its build is held to. */
export async function testPlanOf(issueId: string): Promise<{ plan: TestPlan | null; approved: TestPlan | null; approvedBy: string | null; status: string }> {
  const [row] = await db.select().from(stepWork).where(and(eq(stepWork.issueId, issueId), eq(stepWork.key, 'testplan')))
  const s = storedOf(row?.refs)
  // The sealed copy outlives a change to the draft: a build under way stays held to what the person approved.
  return { plan: s.plan ?? null, approved: s.approved ?? (row?.approvedBy ? s.plan ?? null : null), approvedBy: row?.approvedBy ?? null, status: row?.status ?? 'none' }
}

/**
 * Write a task's test plan. It is refused, with every reason, while it breaks a rule. Written, it is ready for the
 * person; one that was approved asks for their approval again, and the build stays held to the plan they approved
 * until they give it.
 */
export async function setTestPlan(issueId: string, given: unknown, actor = 'agent') {
  const t = await getIssue(db, issueId)
  if (t.parentId || t.kind !== 'code') throw new PlanError('only a top-level code task has a test plan')
  const plan = cleanPlan(given)
  const criteria = acceptanceOf(t)
  const wrong = validatePlan(plan, criteria)
  if (wrong.length) throw new PlanError(`the test plan cannot be kept as written:\n${wrong.map((w) => `- ${w}`).join('\n')}`)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [old] = await db.select().from(stepWork).where(and(eq(stepWork.issueId, issueId), eq(stepWork.key, 'testplan')))
  const was = storedOf(old?.refs)
  const same = !!old?.approvedBy && JSON.stringify(was.approved ?? was.plan) === JSON.stringify(plan)
  const early = plan.rows.filter((r) => r.writableAt === TESTS).length
  const values = { status: 'done', body: planMarkdown(plan, criteria), detail: `${plan.rows.length} test${plan.rows.length === 1 ? '' : 's'}, ${early} written up front; ${plan.slices.length} slice${plan.slices.length === 1 ? '' : 's'}`, refs: { plan, ...(was.approved ? { approved: was.approved } : old?.approvedBy && was.plan ? { approved: was.plan } : {}) } as never, updatedBy: actor, updatedAt: new Date(), ...(same ? {} : { approvedBy: null, approvedAt: null }) }
  await db.transaction(async (tx) => {
    if (old) await tx.update(stepWork).set(values).where(eq(stepWork.id, old.id)); else await tx.insert(stepWork).values({ id: newId('stepWork'), appId: t.appId, issueId, key: 'testplan', ...values })
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId, actor, type: 'step.updated', payload: { key: 'testplan', status: 'done', rows: plan.rows.length, slices: plan.slices.length, reapprove: !!old?.approvedBy && !same } })
  })
  return { rows: plan.rows.length, slices: plan.slices.length, writtenUpFront: early, ...(old?.approvedBy && !same ? { note: 'It was approved, and it has changed: it asks for the person\'s approval again. The build stays held to the plan they approved until they give it.' } : { note: 'It is ready for the person to approve on the task\'s Test plan step. The build starts from their approval.' }) }
}

/** The person approved the step: the plan as it stands is the one the build is held to. */
export async function sealTestPlan(issueId: string) {
  const [row] = await db.select().from(stepWork).where(and(eq(stepWork.issueId, issueId), eq(stepWork.key, 'testplan')))
  const s = storedOf(row?.refs)
  if (!row || !s.plan) return null
  await db.update(stepWork).set({ refs: { plan: s.plan, approved: s.plan } as never }).where(eq(stepWork.id, row.id))
  return s.plan
}

/** Every run of every row the engine has made on a task, oldest first. */
export async function runsOf(issueId: string): Promise<RowRun[]> {
  const rows = await db.select({ payload: event.payload, ts: event.ts }).from(event).where(and(eq(event.issueId, issueId), eq(event.type, 'trajectory.run'))).orderBy(asc(event.seq))
  return rows.map((e) => ({ ...(e.payload as Omit<RowRun, 'ts'>), ts: new Date(e.ts).toISOString() }))
}

export type RunCommand = (cmd: string, cwd: string) => Promise<{ exit: number | null; output: string }>
/** One command in a checkout, its output kept: five minutes at most, since one row's test is one file. */
export const runCommand: RunCommand = (cmd, cwd) => new Promise((resolveP) => {
  execFile('/bin/sh', ['-c', cmd], { cwd, maxBuffer: 20_000_000, timeout: 300_000, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } }, (err, stdout, stderr) => {
    const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0
    resolveP({ exit: code, output: `${stdout}\n${stderr}` })
  })
})

/**
 * After a sub-task of a test-first build: the engine runs the rows due there, in the sub-task's checkout, keeps what
 * it saw, and says what stands in the way of landing (empty: it lands). A sub-task that is not one of the plan's
 * (a check, a probe, a fix) is not gated. With no way to run a test, nothing can be seen: that is said, once, and
 * nothing is held.
 */
export async function gateSubTask(i: { taskId: string; subId: string; title: string; worktreePath: string; setup: unknown; sha?: string | null; run?: RunCommand; emit: (type: string, payload: Record<string, unknown>) => Promise<unknown> }): Promise<string[]> {
  const { approved: plan } = await testPlanOf(i.taskId)
  if (!plan) return []
  const place = placeOf(plan, i.title)
  if (!place) return []
  const due = rowsDue(plan, place)
  const rows = [...new Map([...due.written, ...due.green].map((r) => [r.id, r])).values()]
  if (!rows.length) return []
  if (!rowCommand(i.setup, rows[0])) { await i.emit('trajectory.cannot_run', { why: 'this app has no test command (Settings › Landing): the engine cannot run a row\'s test, so nothing was seen red or green' }); return [] }
  const before = await runsOf(i.taskId)
  const run = i.run ?? runCommand
  // One run per command: rows that share a file and a name share its outcome.
  const ran = new Map<string, { outcome: Outcome; tail: string }>()
  const now = new Map<string, { outcome: Outcome; tail?: string }>()
  for (const r of rows) {
    const cmd = rowCommand(i.setup, r)!
    if (!ran.has(cmd)) {
      const missing = !existsSync(join(i.worktreePath, r.test))
      const got = missing ? { exit: 1, output: `No test files found: ${r.test} does not exist` } : await run(cmd, i.worktreePath)
      ran.set(cmd, { outcome: missing ? 'none' : classifyRun(got.exit, got.output), tail: got.output.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-1500) })
    }
    const seen = ran.get(cmd)!
    now.set(r.id, seen)
    await i.emit('trajectory.run', { row: r.id, outcome: seen.outcome, sub: i.subId, at: place.half === 'red' && place.at !== TESTS ? `${place.at}:red` : place.at, sha: i.sha ?? null, ...(seen.outcome === 'green' ? {} : { tail: seen.tail.slice(-600) }) })
  }
  return gateAt(plan, place, now, before)
}

/** Test files a branch adds or changes that no row of the plan names: each is added with its row, or explained. Pure, from the changed paths. */
export const TEST_FILE = /(^|\/)(__tests__|tests?)\/.+\.[a-z]+$|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go|rb)$|\.spec\.rb$|Tests?\.(cs|java|kt|swift)$/
export function strayTests(plan: TestPlan, changed: string[]): string[] {
  const named = new Set(plan.rows.map((r) => r.test))
  return changed.filter((f) => TEST_FILE.test(f) && !named.has(f) && !/(^|\/)(fixtures?|__fixtures__|__mocks__|mocks?|helpers?|support|factories|conftest\.py|setup\.[cm]?[jt]s|utils?)(\/|$)|\.snap$|\.(json|ya?ml|csv|txt|md|sql)$/.test(f))
}

export interface TrajectoryView {
  /** The plan the build is held to: the approved one; before any approval, the draft. Null: none written. */ plan: TestPlan | null
  approved: boolean
  /** The draft differs from what was approved: it waits for the person again. */ changed: boolean
  rows: (Row & { state: RowState; says: string; runs: RowRun[] })[]
  holds: boolean
  /** How many rows are proven, of how many. */ proven: number; total: number
  /** Whether the engine can run a row's test at all. */ canRun: boolean
  /** Test files the task's branch adds or changes that no row names: each is added with its row, or explained. */ stray: string[]
}

/** The test files a task's branch changed, from git; empty when there is no branch to read yet. */
async function changedOnBranch(t: { id: string; appId: string; projectId: string | null; number: number; branch: string | null }, a: { key: string; defaultBranch: string; setup: unknown }): Promise<string[]> {
  try {
    if (!t.projectId) return []
    const [{ project }, { landingBranch, modeOf }, { homeRepo }, { git }] = await Promise.all([import('./db/schema.js'), import('./branches.js'), import('./workbench.js'), import('./git.js')])
    const [p] = await db.select().from(project).where(eq(project.id, t.projectId))
    const r = await homeRepo(t.appId)
    if (!p?.integrationBranch || !r?.localPath) return []
    const branch = landingBranch(modeOf(p, a.setup), p.integrationBranch, { identifier: `${a.key}-${t.number}`, branch: t.branch })
    const out = await git(r.localPath, ['diff', '--name-only', `${a.defaultBranch}...${branch}`], { allowFail: true })
    return out.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch { return [] }
}
export async function trajectoryView(issueId: string): Promise<TrajectoryView> {
  const t = await getIssue(db, issueId)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const stored = await testPlanOf(issueId)
  const plan = stored.approved ?? stored.plan
  if (!plan) return { plan: null, approved: false, changed: false, rows: [], holds: false, proven: 0, total: 0, canRun: !!(a?.setup as { test_cmd?: string } | null)?.test_cmd, stray: [] }
  const runs = stored.approved ? await runsOf(issueId) : []
  const rows = plan.rows.map((r) => { const state = rowState(r, runs); return { ...r, state, says: STATE_SAYS[state], runs: runs.filter((x) => x.row === r.id) } })
  return { plan, approved: !!stored.approved, changed: !!stored.approved && JSON.stringify(stored.approved) !== JSON.stringify(stored.plan), rows, holds: !!stored.approved && rows.every((r) => r.state === 'green'), proven: rows.filter((r) => r.state === 'green').length, total: rows.length, canRun: !!rowCommand(a?.setup, plan.rows[0] ?? { test: 'x' }), stray: stored.approved && a ? strayTests(plan, await changedOnBranch(t, a)) : [] }
}

/** For the task's own row of facts elsewhere (the checklist's Check stage): whether a test-first build's trajectory holds, and what does not. Null: the task has no approved plan. */
export async function trajectoryOpen(issueId: string): Promise<{ open: { id: string; state: RowState }[]; total: number } | null> {
  const { approved } = await testPlanOf(issueId)
  if (!approved) return null
  const h = holds(approved, await runsOf(issueId))
  return { open: h.open, total: approved.rows.length }
}
