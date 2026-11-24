/**
 * The Pull request step finalizes, and the person decides (docs/proven-work.md, part 4; Sandy, 2026-11-23: "The PR
 * went out with a description written by hand three times, the review instructions lost once, and no way to see the
 * evidence before it was public").
 *
 * Accepting the smoke test starts it. Five steps, each said as it goes, on this computer and never in the team's CI:
 * 1. the trajectory holds (trajectory.ts): every planned test seen really red, then green;
 * 2. mutation testing of the lines the pull request changed (mutation.ts);
 * 3. the review copy built on the head (review-copy.ts);
 * 4. the gate checks (pr-gate.ts);
 * 5. the Evidence section drafted from what was measured (evidence.ts).
 *
 * NOTHING HERE REACHES GITHUB. The results wait on the task's Pull request page for the person, who can send a
 * sub-task after any survivor, failing check or unproven test ("Fix this": when it lands the finalizing runs again),
 * leave a survivor as it is with a reason (which goes into the evidence), or, once the gate passes, press "Push and
 * mark ready": the one act that sends the title, the description with the evidence, and the review branch, and takes
 * the pull request out of draft. On one already ready, the same press is "Update pull request", through the same
 * gate.
 *
 * Kept as events, so there is no table of its own: `finalize.started`, `finalize.step`, `finalize.done` (the facts
 * the evidence is drafted from), `finalize.failed`, `finalize.survivor` (the person's word on one), `finalize.fix`
 * (a sub-task sent after something) and `finalize.sent` (the evidence the person sent, which is the only evidence a
 * later update of the pull request carries).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { acceptanceOf, later, type Criterion } from './acceptance.js'
import { db } from './db/client.js'
import { app, build, event, issue, pr as prTable, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { evidenceText, type Accepted, type EvidenceFacts } from './evidence.js'
import { git } from './git.js'
import { getIssue, identifier, PlanError } from './issues.js'
import { guideTasks } from './merge-guide.js'
import { changedLines, fromReport, mutable, mutantsOf, mutationSetup, runMutants, sample, scoreOf, sh, type Mutant, type MutationResult, type Sh } from './mutation.js'
import { commandsCheck, descriptionCheck, gateWaits, githubCheck, rollbackCheck, smokeCheck, titleCheck, type GateCheck } from './pr-gate.js'
import { prDescription } from './pr.js'
import { leftTo, type ProbeResult } from './probe-list.js'
import { addSubTask } from './projects.js'
import { makeReviewCopy, reviewCopy } from './review-copy.js'
import { built, smokeOwed } from './smoke.js'
import { teamTicket, ticketRequired } from './ticket.js'
import { FINALIZE_STEPS } from './contracts.js'
import { finalizePrepare } from './mutation-setup.js'
import { rowCommand, rowState, runsOf, STATE_SAYS, testPlanOf, TEST_FILE, type RowRun, type TestPlan } from './trajectory.js'
import { markReady, prView } from './pr-view.js'

export const FINALIZE_FIX_TITLE = 'Fix what the finalizing found'
export type StepKey = 'trajectory' | 'mutation' | 'review' | 'gate' | 'evidence'
export interface Step { key: StepKey; name: string; state: 'waiting' | 'running' | 'pass' | 'fail' | 'skipped'; says: string }
const STEPS: readonly { key: StepKey; name: string }[] = FINALIZE_STEPS

/** What the runner does for it: nothing here knows of the runner, which calls this in its turn. */
export interface Deps {
  preview: (projectId: string, issueId?: string) => Promise<{ title: string; body: string; head: string; base: string; landed: number; pending: string[] } | null>
  submit: (projectId: string, issueId?: string) => Promise<unknown>
  refresh: (projectId: string, issueId?: string, opts?: { theirs?: 'keep' | 'replace' }) => Promise<unknown>
  dispatch: () => void
  /** Stood in for by a test. */ sh?: Sh; gh?: import('./pr-view.js').Gh
}

/** What a run found: the facts, kept so the evidence can be drafted again when the person says something of a survivor. */
interface Found extends Omit<EvidenceFacts, 'accepted'> { steps: Step[]; /** Held commands as they last ran, for the gate. */ ran: { name: string; runs: string; pass: boolean; sha?: string | null; detail?: string }[]; review: { branch: string | null; made: boolean; pushed: boolean; inStep: boolean } | null }

const going = new Map<string, { run: string; sha: string; steps: Step[]; abort: AbortController }>()
const ev = (issueId: string, types: string[], limit = 50) => db.select().from(event).where(and(eq(event.issueId, issueId), inArray(event.type, types))).orderBy(desc(event.seq)).limit(limit)

async function facts(issueId: string) {
  const b = await built(issueId)
  const mine = b.p ? (await db.select().from(prTable).where(eq(prTable.projectId, b.p.id))).some((q) => q.issueId === b.t.id) || (b.p.prMode ?? 'issue') === 'issue' : true
  return { ...b, prIssue: mine ? b.t.id : undefined }
}

/** The test files a branch added or changed, and its merge base with what it will merge into. */
async function branchFacts(repo: string, base: string, head: string) {
  const mb = (await git(repo, ['merge-base', base, head], { allowFail: true })).stdout.trim() || base
  const files = (await git(repo, ['diff', '--name-only', '--diff-filter=AM', `${mb}..${head}`], { allowFail: true })).stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  return { mergeBase: mb, files, testFiles: files.filter((f) => TEST_FILE.test(f) && !/\.(snap|json|ya?ml|csv|txt|md|sql)$/.test(f)) }
}

/** The app's held commands as they last ran: the build's own (the task's test run, with the commit it was on), and those left to the pull request's checks. */
async function commandsRan(t: { id: string; probes: unknown }, setup: unknown, checks: { name: string; state: string }[] | null) {
  const [testing] = await ev(t.id, ['task.testing'], 1)
  const [ran] = await ev(t.id, ['task.test_ran'], 1)
  const sha = testing && ran && ran.seq > testing.seq ? String((testing.payload as { head?: string }).head ?? '') || null : null
  const out: Found['ran'] = ((t.probes ?? []) as ProbeResult[]).filter((p) => p.kind === 'command' && p.blocks !== false && p.pass !== null).map((p) => ({ name: p.name, runs: /`([^`]+)`/.exec(p.evidence)?.[1] ?? p.name, pass: p.pass === true, sha, detail: p.pass ? '' : p.evidence }))
  // A workflow that keeps no results on the task (the staged one) still says how its test run ended.
  if (!out.length && sha && ran) { const failed = ((ran.payload as { failed?: string[] }).failed ?? []); const cmd = ((setup ?? {}) as { test_cmd?: string }).test_cmd ?? 'the app\'s commands'; out.push(...(failed.length ? failed.map((name) => ({ name, runs: cmd, pass: false, sha })) : [{ name: 'The test run', runs: cmd, pass: true, sha }])) }
  // One left to the pull request is a check GitHub runs, by name: it is read there, not run here.
  if (checks) for (const p of leftTo(setup, 'pr').filter((x) => x.blocks !== false)) { const c = checks.find((x) => x.name.toLowerCase() === p.runs.toLowerCase() || x.name.toLowerCase().includes(p.runs.toLowerCase())); if (c && c.state !== 'pending' && c.state !== 'skipped') out.push({ name: p.name, runs: `${p.runs} (on GitHub)`, pass: c.state === 'pass' }) }
  return out
}

/** The gate, from what is true now. The cheap checks are read afresh each time: the description may have been written since the finalizing ran. */
async function gateNow(issueId: string, deps: Deps, ran: Found['ran'] | null): Promise<{ checks: GateCheck[]; view: Awaited<ReturnType<typeof prView>> }> {
  const f = await facts(issueId)
  const view = await prView(issueId, { preview: deps.preview, gh: deps.gh })
  const ticket = (await teamTicket(f.t))?.ticket ?? null
  const subs = await db.select({ number: issue.number }).from(issue).where(eq(issue.parentId, f.t.id))
  const ours = [f.name, ...subs.map((s) => identifier(f.a.key, s.number))]
  const [guided] = await guideTasks([{ id: f.t.id, identifier: f.name, title: f.t.title }]).catch(() => [])
  const risk = guided ? [guided.riskAll, guided.risk, guided.checklist, ...guided.decisions.map((d) => `${d.question} ${d.chosen}${d.why ? `. ${d.why}` : ''}`)].filter(Boolean).join('\n') : ''
  const [accepted] = await ev(issueId, ['smoke.accepted'], 1)
  const criteria = acceptanceOf(f.t)
  const live = view.pr && view.pr.status !== 'closed' && view.pr.status !== 'merged' ? view.pr : null
  const checks: GateCheck[] = [
    githubCheck(live && view.problem ? null : live, live ? view.problem : null),
    commandsCheck({ head: f.head, ran: ran ?? await commandsRan(f.t, f.a.setup, live?.checks ?? null) }),
    titleCheck({ template: ((f.a.setup ?? {}) as { pr_title?: string }).pr_title?.trim() || null, title: view.message?.title ?? '', ticket, ticketRequired: ticketRequired(f.a.setup), ours: f.name }),
    descriptionCheck({ template: prDescription(f.a.setup).template, written: view.written, ours, ticket }),
    rollbackCheck({ written: view.written, risk }),
    smokeCheck({ owed: smokeOwed(criteria), failed: criteria.filter((c) => c.byHand && c.byHand.pass === false && !c.byHand.skipped && !later(c)).length, accepted: accepted ? { sha: (accepted.payload as { sha?: string | null }).sha ?? null } : null, head: f.head }),
  ]
  return { checks, view }
}

/** Step 2: the breaks, made and run in a checkout of the head that is the engine's own. */
async function mutate(f: Awaited<ReturnType<typeof facts>>, base: string, plan: TestPlan | null, testFiles: string[], run: Sh, onProgress: (says: string) => void, signal: AbortSignal): Promise<{ result: MutationResult | null; says: string; state: Step['state'] }> {
  const set = mutationSetup(f.a.setup)
  if (set.off) return { result: null, state: 'skipped', says: 'This app has mutation testing switched off (its settings, mutation.off).' }
  const repo = f.repoPath!, head = f.head!
  const changed = new Map([...(await changedLines(repo, base, head))].filter(([file]) => mutable(file)))
  if (!changed.size) return { result: null, state: 'skipped', says: 'The pull request changes no lines of source the engine can break (Python, TypeScript or JavaScript, outside tests).' }
  const tests = [...new Set([...(plan?.rows.map((r) => r.test) ?? []), ...testFiles])]
  if (!tests.length) return { result: null, state: 'fail', says: 'The pull request has no tests of its own to run a break against: no test plan, and no test file added or changed.' }
  // Its own checkout, at the commit and on no branch, kept from one finalizing to the next so what it installs stays.
  const path = join(`${repo}-worktrees`, `finalize--${f.name.toLowerCase()}`)
  if (existsSync(path)) { await git(path, ['checkout', '--detach', '--force', head]); await git(path, ['clean', '-fdq', '--exclude=node_modules', '--exclude=.venv'], { allowFail: true }) } else await git(repo, ['worktree', 'add', '--detach', path, head])
  const prepare = finalizePrepare(f.a.setup)
  if (prepare) { onProgress('Preparing its checkout…'); const p = await run(prepare, path, 15 * 60_000); if (p.exit !== 0) return { result: null, state: 'fail', says: `Its checkout could not be prepared (\`${prepare.slice(0, 120)}\`): ${p.output.trim().split('\n').slice(-4).join(' ').slice(-400)}` } }
  if (set.tool) {
    onProgress('Running the app\'s own mutation tool…')
    const ran = await run(set.tool.cmd, path, 60 * 60_000)
    const at = join(path, set.tool.report)
    if (!existsSync(at)) return { result: null, state: 'fail', says: `The app's mutation tool wrote no report at ${set.tool.report} (\`${set.tool.cmd.slice(0, 120)}\` ended ${ran.exit}): ${ran.output.trim().split('\n').slice(-4).join(' ').slice(-400)}` }
    try { const result = fromReport(JSON.parse(readFileSync(at, 'utf8')), changed, tests); return { result, ...saysOf(result) } } catch (err) { return { result: null, state: 'fail', says: `The app's mutation tool's report could not be read: ${(err as Error).message}` } }
  }
  const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`
  const each = tests.map((t) => rowCommand(f.a.setup, { test: t }))
  const testCmd = set.testCmd ? set.testCmd.replace(/\{files\}/g, tests.map(q).join(' ')) : each.every(Boolean) ? each.join(' && ') : null
  if (!testCmd) return { result: null, state: 'skipped', says: 'This app has no test command, so a break cannot be run against its tests.' }
  const all: Mutant[] = []
  for (const [file, lines] of changed) { const at = join(path, file); if (existsSync(at)) all.push(...mutantsOf(file, readFileSync(at, 'utf8'), lines)) }
  if (!all.length) return { result: null, state: 'skipped', says: `The ${[...changed.values()].reduce((n, l) => n + l.length, 0)} changed lines hold nothing the engine breaks (no comparison, condition, number or returned value).` }
  const mutants = sample(all, set.max)
  onProgress(`Running the tests with nothing changed, then ${mutants.length} break${mutants.length === 1 ? '' : 's'} one at a time…`)
  const result = await runMutants({ cwd: path, mutants, found: all.length, testCmd, tests, run, signal, onProgress: (done, of) => { if (done % 5 === 0 || done === of) onProgress(`${done} of ${of} breaks tried…`) } })
  await git(path, ['checkout', '--force', '--', '.'], { allowFail: true }) // nothing of a break is left behind
  if ('problem' in result) return { result: null, state: 'fail', says: `${result.problem[0].toUpperCase()}${result.problem.slice(1)}. If this checkout needs something installed first, say how in the app's settings (finalize.prepare).` }
  return { result, ...saysOf(result) }
}
function saysOf(r: MutationResult): { says: string; state: Step['state'] } {
  const s = scoreOf(r)
  if (!s.meaningful) return { state: 'pass', says: `No meaningful break could be made${r.invalid ? ` (${r.invalid} would not load)` : ''}.` }
  return { state: s.open.length ? 'fail' : 'pass', says: `Of ${s.meaningful} meaningful breaks, the tests catch ${s.caught} (${s.percent}%).${s.open.length ? ` ${s.open.length} not caught.` : ''}${s.equivalent.length ? ` ${s.equivalent.length} left out as equivalent.` : ''}${r.partial ? ` Stopped early: ${r.partial}.` : ''}` }
}

/** One finalizing, start to end. Awaited by a test; started and left to run by everything else (startFinalize). */
export async function runFinalize(issueId: string, deps: Deps, actor = 'user'): Promise<void> {
  const f = await facts(issueId)
  if (!f.head || !f.repoPath || !f.p) throw new PlanError('nothing is built yet: there is nothing to finalize')
  if (going.has(issueId)) throw new PlanError('the finalizing is already running')
  const base: Parameters<typeof appendEvent>[1] = { workspaceId: f.a.workspaceId, appId: f.a.id, projectId: f.t.projectId, issueId: f.t.id, actor: 'engine', type: '' }
  const emit = (type: string, payload: Record<string, unknown>, by = 'engine') => db.transaction((tx) => appendEvent(tx, { ...base, actor: by, type, payload }))
  const run = `${Date.now().toString(36)}`
  const steps: Step[] = STEPS.map((s) => ({ ...s, state: 'waiting', says: '' }))
  const abort = new AbortController()
  going.set(issueId, { run, sha: f.head, steps, abort })
  const set = async (key: StepKey, state: Step['state'], says: string) => { const s = steps.find((x) => x.key === key)!; s.state = state; s.says = says; await emit('finalize.step', { run, key, state, says: says.slice(0, 600) }) }
  try {
    await emit('finalize.started', { run, sha: f.head }, actor)
    // 1. The trajectory.
    await set('trajectory', 'running', '')
    const stored = await testPlanOf(issueId)
    const plan = stored.approved, runs: RowRun[] = plan ? await runsOf(issueId) : []
    if (!plan) await set('trajectory', 'skipped', 'This task was built without a test plan, so there is no record of its tests failing before its code was written.')
    else { const open = plan.rows.map((r) => ({ r, state: rowState(r, runs) })).filter((x) => x.state !== 'green'); await set('trajectory', open.length ? 'fail' : 'pass', open.length ? `${open.length} of ${plan.rows.length} planned tests not proven: ${open.slice(0, 6).map((x) => `${x.r.id} (${STATE_SAYS[x.state]})`).join(', ')}${open.length > 6 ? '…' : ''}.` : `All ${plan.rows.length} planned tests were seen red, then green.`) }
    // 2. Mutation testing.
    await set('mutation', 'running', '')
    const preview = await deps.preview(f.p.id, f.prIssue).catch(() => null)
    const bf = await branchFacts(f.repoPath, preview?.base ?? f.a.defaultBranch, f.head)
    let mutation: MutationResult | null = null, mutationSays = ''
    try { const m = await mutate(f, bf.mergeBase, plan, bf.testFiles, deps.sh ?? sh, (says) => { void set('mutation', 'running', says) }, abort.signal); mutation = m.result; mutationSays = m.says; await set('mutation', m.state, m.says) } catch (err) { mutationSays = `It could not be run: ${String((err as Error).message).split('\n')[0].slice(0, 300)}`; await set('mutation', 'fail', mutationSays) }
    // 3. The review copy. Built, never sent: one already on GitHub is left there until the person pushes.
    await set('review', 'running', '')
    let review: Found['review'] = null
    try {
      let rc = await reviewCopy(issueId, { fresh: true })
      if (!rc.kit) await set('review', 'skipped', 'This app has no review kit, so there is no review copy to build (its settings, review.kit).')
      else if (!rc.pr) await set('review', 'skipped', 'A review copy goes with a pull request, and this task has none yet: it is made when you push.')
      else if (rc.waits.length) await set('review', 'fail', rc.waits.join(' '))
      else if (rc.made?.pushed) await set('review', 'pass', rc.made.inStep ? `On GitHub and in step: ${rc.branch} holds the pull request's head.` : `On GitHub at ${rc.made.from.slice(0, 7)}, behind the pull request's head: it is made again and sent when you push.`)
      else { rc = await makeReviewCopy(issueId, { push: false }, 'engine'); await set('review', 'pass', `Built on ${rc.made?.from.slice(0, 7) ?? 'the head'} with nothing real in it (${rc.made?.services.length ?? 0} service${rc.made?.services.length === 1 ? '' : 's'} faked), and not sent: ${rc.branch} goes to GitHub when you push.`) }
      review = { branch: rc.branch, made: !!rc.made, pushed: !!rc.made?.pushed, inStep: !!rc.made?.inStep }
    } catch (err) { await set('review', 'fail', String((err as Error).message).split('\n')[0].slice(0, 400)) }
    // 4. The gate.
    await set('gate', 'running', '')
    const [fresh] = await db.select().from(issue).where(eq(issue.id, f.t.id))
    const gate = await gateNow(issueId, deps, null)
    const waits = gateWaits(gate.checks)
    await set('gate', waits.length ? 'fail' : 'pass', waits.length ? `${waits.length} of ${gate.checks.length} stand in the way.` : `All ${gate.checks.filter((c) => c.state === 'pass').length} pass.`)
    // 5. The evidence.
    await set('evidence', 'running', '')
    const live = gate.view.pr && gate.view.pr.status !== 'closed' && gate.view.pr.status !== 'merged' ? gate.view.pr : null
    const ran = await commandsRan(fresh, f.a.setup, live?.checks ?? null)
    const found: Found = { steps, plan, runs, criteria: acceptanceOf(fresh) as Criterion[], testFiles: bf.testFiles, mutation, ...(mutation ? {} : { mutationSays }), commands: ran.map((r) => ({ name: r.name, pass: r.pass })), ran, review }
    const text = evidenceText({ ...found, accepted: {} })
    await set('evidence', text ? 'pass' : 'skipped', text ? 'Drafted from what was measured. It is sent only when you push.' : 'Nothing was measured to draft it from.')
    await emit('finalize.done', { run, sha: f.head, found })
  } catch (err) {
    await emit('finalize.failed', { run, sha: f.head, error: String((err as Error).message).split('\n')[0].slice(0, 400) }).catch(() => null)
    throw err
  } finally { going.delete(issueId) }
}

/** Why the finalizing cannot be started now; null when it can. */
async function whyNotStart(issueId: string): Promise<string | null> {
  if (going.has(issueId)) return 'it is running'
  const f = await facts(issueId).catch((err) => err as Error)
  if (f instanceof Error) return f.message
  if (!f.head || !f.repoPath) return 'nothing is built yet'
  const subs = (await db.select({ id: issue.id, state: issue.state }).from(issue).where(eq(issue.parentId, issueId))).filter((s) => s.state !== 'canceled' && s.state !== 'duplicate')
  const builds = subs.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, subs.map((s) => s.id))) : []
  const open = subs.filter((s) => builds.find((b) => b.issueId === s.id)?.status !== 'done').length
  if (open) return `${open} of its sub-tasks ${open === 1 ? 'has' : 'have'} still to land: it runs when ${open === 1 ? 'it has' : 'they have'}`
  return null
}

/** Started and left to run: the page follows it by its events. */
export async function startFinalize(issueId: string, deps: Deps, actor = 'user') {
  const why = await whyNotStart(issueId)
  if (why) throw new PlanError(`the finalizing cannot be started: ${why}`)
  void runFinalize(issueId, deps, actor).catch((err) => console.error(`[engine] the finalizing of ${issueId} failed: ${String((err as Error)?.message ?? err).slice(0, 300)}`))
  return { started: true as const }
}

/**
 * A task is built and tested again (the runner says so): one that has been finalized before, or whose smoke test is
 * accepted, is finalized again on its new head, so the results on the page are of what would be sent.
 */
export async function afterBuilt(issueId: string, deps: Deps) {
  const [last] = await ev(issueId, ['finalize.started', 'smoke.accepted'], 1)
  if (!last) return
  const f = await facts(issueId).catch(() => null)
  const [done] = await ev(issueId, ['finalize.done'], 1)
  if (!f?.head || (done && (done.payload as { sha?: string }).sha === f.head)) return
  if (await whyNotStart(issueId)) return
  void runFinalize(issueId, deps, 'engine').catch(() => null)
}

export interface FinalizeView {
  /** none: never run. cut: it was running when the engine stopped. */ state: 'none' | 'running' | 'done' | 'failed' | 'cut'
  /** The commit the results are of, and the branch's head now. */ sha: string | null; head: string | null
  /** The branch has moved since: the results are of an earlier commit. */ stale: boolean
  error: string | null
  steps: Step[]
  /** Planned tests not proven, each with what a fix would be sent after. */ unproven: { id: string; test: string; says: string; fix: Fix | null }[]
  mutation: (Omit<MutationResult, 'survivors'> & { meaningful: number; percent: number | null; survivors: (MutationResult['survivors'][number] & { accepted: Accepted | null; fix: Fix | null })[] }) | null
  gate: (GateCheck & { sent: Fix | null })[]
  /** The Evidence section as it would be sent now. */ evidence: string
  /** What the pull request carries now: the evidence last sent, and the commit it was of. */ sent: { sha: string | null; at: string; same: boolean } | null
  canStart: boolean; startWaits: string | null
  /** The press: "Push and mark ready" on none or a draft, "Update pull request" on one that is ready. */ press: 'ready' | 'update' | null
  canPush: boolean; pushWaits: string[]
}
export interface Fix { subTask: string; title: string; /** Its sub-task has landed. */ landed: boolean }

export async function finalizeView(issueId: string, deps: Deps): Promise<FinalizeView> {
  const f = await facts(issueId)
  const now = going.get(issueId)
  const [started] = await ev(issueId, ['finalize.started'], 1)
  const [ended] = await ev(issueId, ['finalize.done', 'finalize.failed'], 1)
  const [doneRow] = await ev(issueId, ['finalize.done'], 1)
  const done = doneRow ? (doneRow.payload as { sha: string; found: Found }) : null
  const state: FinalizeView['state'] = now ? 'running' : !started ? 'none' : !ended || ended.seq < started.seq ? 'cut' : ended.type === 'finalize.failed' ? 'failed' : 'done'
  const accepted: Record<string, Accepted> = {}
  for (const e of (await ev(issueId, ['finalize.survivor'], 500)).reverse()) { const p = e.payload as { id: string; reason?: string; equivalent?: boolean; undo?: boolean }; if (p.undo) delete accepted[p.id]; else accepted[p.id] = { reason: p.reason ?? '', ...(p.equivalent ? { equivalent: true } : {}), by: e.actor, at: e.ts.toISOString() } }
  const fixes = new Map<string, Fix>()
  const fixRows = (await ev(issueId, ['finalize.fix'], 200)).reverse()
  if (fixRows.length) {
    const ids = fixRows.map((e) => String((e.payload as { subTask: string }).subTask))
    const subs = await db.select({ id: issue.id, title: issue.title, state: issue.state }).from(issue).where(inArray(issue.id, ids))
    const builds = await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, ids))
    for (const e of fixRows) { const p = e.payload as { kind: string; id: string; subTask: string }; const s = subs.find((x) => x.id === p.subTask); if (s && s.state !== 'canceled') fixes.set(`${p.kind}:${p.id}`, { subTask: s.id, title: s.title, landed: builds.find((b) => b.issueId === s.id)?.status === 'done' }) }
  }
  // A fix that landed before these results says nothing of them: what it was sent after is either gone or still there.
  const fixOf = (kind: string, id: string) => { const x = fixes.get(`${kind}:${id}`); return x && !x.landed ? x : null }
  const found = done?.found ?? null
  const gate = await gateNow(issueId, deps, found && done!.sha === f.head ? found.ran : null).catch(() => null)
  const live = gate?.view.pr && gate.view.pr.status !== 'closed' && gate.view.pr.status !== 'merged' ? gate.view.pr : null
  const setAside = new Set(Object.entries(accepted).filter(([, a]) => a.equivalent).map(([id]) => id))
  const score = found?.mutation ? scoreOf(found.mutation, setAside) : null
  const evidence = found ? evidenceText({ ...found, accepted }) : ''
  const [sentRow] = await ev(issueId, ['finalize.sent'], 1)
  const stale = !!done && done.sha !== f.head
  const startWaits = await whyNotStart(issueId)
  const pushWaits: string[] = []
  if (state === 'running') pushWaits.push('The finalizing is still running.')
  else if (!done) pushWaits.push('The finalizing has not run: accept the smoke test, or run it here.')
  else if (stale) pushWaits.push(`The branch has moved since the finalizing ran (it ran on ${done.sha.slice(0, 7)}): run it again.`)
  if (gate) pushWaits.push(...gateWaits(gate.checks)); else pushWaits.push('The gate checks could not be read just now.')
  const press: FinalizeView['press'] = gate?.view.pr?.status === 'merged' ? null : live?.status === 'open' ? 'update' : 'ready'
  return {
    state, sha: done?.sha ?? null, head: f.head, stale, error: state === 'failed' ? String((ended!.payload as { error?: string }).error ?? '') : null,
    steps: now ? now.steps : state === 'done' && found ? found.steps : STEPS.map((s) => ({ ...s, state: 'waiting' as const, says: '' })),
    unproven: found?.plan ? found.plan.rows.map((r) => ({ r, s: rowState(r, found.runs) })).filter((x) => x.s !== 'green').map((x) => ({ id: x.r.id, test: x.r.test, says: STATE_SAYS[x.s], fix: fixOf('row', x.r.id) })) : [],
    mutation: found?.mutation && score ? { ...found.mutation, meaningful: score.meaningful, percent: score.percent, survivors: found.mutation.survivors.map((s) => ({ ...s, accepted: accepted[s.id] ?? null, fix: fixOf('survivor', s.id) })) } : null,
    gate: (gate?.checks ?? []).map((c) => ({ ...c, sent: fixOf('gate', c.key) })),
    evidence,
    sent: sentRow ? { sha: (sentRow.payload as { sha?: string }).sha ?? null, at: sentRow.ts.toISOString(), same: String((sentRow.payload as { evidence?: string }).evidence ?? '') === evidence } : null,
    canStart: !startWaits, startWaits,
    press, canPush: !!press && pushWaits.length === 0, pushWaits,
  }
}

/** The evidence the person last sent: all of it that an update of the pull request carries. Empty: none was sent. */
export async function sentEvidence(issueId: string): Promise<string> {
  const [row] = await ev(issueId, ['finalize.sent'], 1)
  return row ? String((row.payload as { evidence?: string }).evidence ?? '') : ''
}

/** The person's word on a survivor: left as it is, with why; or that no test could see it, which takes it out of the score. Their reason goes into the evidence. */
export async function acceptSurvivor(issueId: string, id: string, i: { reason?: string; equivalent?: boolean; undo?: boolean }, deps: Deps, actor = 'user') {
  const v = await finalizeView(issueId, deps)
  if (!v.mutation?.survivors.some((s) => s.id === id)) throw new PlanError('that is not one of the breaks the tests did not catch')
  const reason = (i.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!i.undo && !reason) throw new PlanError('say why it is left as it is: the reason goes into the evidence, for the reviewer')
  const f = await facts(issueId)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: f.a.workspaceId, appId: f.a.id, projectId: f.t.projectId, issueId, actor, type: 'finalize.survivor', payload: i.undo ? { id, undo: true } : { id, reason, ...(i.equivalent ? { equivalent: true } : {}) } }))
  return finalizeView(issueId, deps)
}

const SURVIVOR_BRIEF = (s: { file: string; line: number; from: string; to: string; means: string; code: string }, tests: string[]) => [
  `Mutation testing made one small break to the code this task changed, and no test failed.`,
  `The break: in \`${s.file}\`, line ${s.line}, \`${s.from}\` became \`${s.to || 'nothing'}\`. The line as written:\n\n    ${s.code}`,
  `What that means: ${s.means}.`,
  `Write the test that fails with the break in and passes without it. Check it yourself both ways: make the change by hand, see your test fail on its assertion (not on loading), put the line back, see it pass. Put it beside the tests that cover this code (${tests.slice(0, 4).map((t) => `\`${t}\``).join(', ') || 'this task\'s tests'}), at the smallest level that can show it.`,
  `Change the code only if writing the test shows it is wrong; then say so in your summary. If no test could ever tell the two apart, write none and say exactly why in your summary: the person will set it aside.`,
].join('\n\n')

/**
 * "Fix this": a sub-task sent after one thing the finalizing found (a break no test caught, a planned test not
 * proven, a failing command or check). When it lands the task is tested again, and the runner starts the finalizing
 * again (afterBuilt), so the results update.
 */
export async function fixThis(issueId: string, what: { kind: 'survivor' | 'row' | 'gate'; id: string }, deps: Deps, actor = 'user') {
  const v = await finalizeView(issueId, deps)
  const f = await facts(issueId)
  if (!f.p) throw new PlanError('this task has not been built')
  if (['closed', 'stopped', 'superseded'].includes(f.p.status)) throw new PlanError(`its project is ${f.p.status}: nothing more is run on it`)
  let title: string, brief: string
  if (what.kind === 'survivor') {
    const s = v.mutation?.survivors.find((x) => x.id === what.id)
    if (!s) throw new PlanError('that is not one of the breaks the tests did not catch')
    if (s.fix) throw new PlanError(`a fix is already on its way: ${s.fix.title}`)
    title = `${FINALIZE_FIX_TITLE}: a test for ${s.file.split('/').pop()}:${s.line}`; brief = SURVIVOR_BRIEF(s, v.mutation!.tests)
  } else if (what.kind === 'row') {
    const r = v.unproven.find((x) => x.id === what.id)
    if (!r) throw new PlanError('that planned test is proven, or is not in the plan')
    if (r.fix) throw new PlanError(`a fix is already on its way: ${r.fix.title}`)
    title = `${FINALIZE_FIX_TITLE}: ${r.id} is not proven`
    brief = `The test plan's ${r.id} (\`${r.test}\`) is not proven: ${r.says}. The plan says what it asserts (the test_plan tool's table is in this task's Test plan step; the file is on the branch). Make it a real test of that: one that fails on its assertion without the code it tests and passes with it. Show both in your summary: the command you ran, and what it printed each way. Do not weaken what it asserts to make it pass.`
  } else {
    const c = v.gate.find((x) => x.key === what.id)
    if (!c?.fix || (c.state !== 'fail')) throw new PlanError('there is nothing there a sub-task could fix: it is yours, or the task\'s agent\'s, to put right')
    if (c.sent) throw new PlanError(`a fix is already on its way: ${c.sent.title}`)
    title = `${FINALIZE_FIX_TITLE}: ${c.key === 'github' ? 'GitHub\'s checks' : 'its held commands'}`; brief = c.fix
  }
  const subs = (await db.select({ id: issue.id, state: issue.state, sortOrder: issue.sortOrder }).from(issue).where(eq(issue.parentId, issueId))).filter((s) => s.state !== 'canceled' && s.state !== 'duplicate').sort((x, y) => x.sortOrder - y.sortOrder)
  const row = await addSubTask(issueId, { title, brief, after: subs.slice(-1).map((s) => s.id) }, actor)
  // A project whose work had all landed has work again, and lands again by the pass that landed it before.
  if (f.p.status === 'landed') await db.update(project).set({ status: 'running', updatedAt: new Date() }).where(eq(project.id, f.p.id))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: f.a.workspaceId, appId: f.a.id, projectId: f.t.projectId, issueId, actor, type: 'finalize.fix', payload: { kind: what.kind, id: what.id, subTask: row.id, title } }))
  deps.dispatch()
  return finalizeView(issueId, deps)
}

/**
 * "Push and mark ready", and on a pull request that is ready, "Update pull request": the only way the results reach
 * GitHub. Refused unless the finalizing is of the head and every gate check passes. It marks the drafted evidence as
 * sent, pushes the branch and sends the title and the description (submitting it if there is none), sends the review
 * branch made again from that head, and takes a draft out of draft.
 */
export async function pushReady(issueId: string, deps: Deps, actor = 'user', opts: { /** The description was edited on GitHub and here: keep theirs, or send ours over it. */ theirs?: 'keep' | 'replace' } = {}) {
  const v = await finalizeView(issueId, deps)
  if (!v.press) throw new PlanError('it is merged: nothing more is sent to it')
  if (!v.canPush) throw new PlanError(`it cannot be sent yet. ${v.pushWaits.join(' ')}`)
  const f = await facts(issueId)
  const emit = (type: string, payload: Record<string, unknown>) => db.transaction((tx) => appendEvent(tx, { workspaceId: f.a.workspaceId, appId: f.a.id, projectId: f.t.projectId, issueId, actor, type, payload }))
  await emit('finalize.sent', { sha: v.sha, evidence: v.evidence })
  const rowNow = async () => { const rows = await db.select().from(prTable).where(eq(prTable.projectId, f.p!.id)); return rows.find((q) => q.issueId === f.t.id) ?? rows.find((q) => !q.issueId) ?? null }
  const had = await rowNow()
  if (!had?.number || had.status === 'closed') await deps.submit(f.p!.id, f.prIssue); else await deps.refresh(f.p!.id, f.prIssue, opts)
  // The branch a reviewer runs: made again from the head just pushed, sent, and the description sent once more to name it.
  const rc = await reviewCopy(issueId, { fresh: true }).catch(() => null)
  let review: string | null = null
  if (rc?.kit && !rc.waits.length && rc.pr && !(rc.made?.pushed && rc.made.inStep)) { const made = await makeReviewCopy(issueId, {}, actor); review = made.branch; await deps.refresh(f.p!.id, f.prIssue) }
  const row = await rowNow()
  let ready = false
  if (row?.status === 'draft') { await markReady(issueId, actor, deps.gh); ready = true }
  await emit('pr.sent', { number: row?.number ?? null, url: row?.url ?? null, sha: v.sha, ready, ...(review ? { review } : {}) })
  return { number: row?.number ?? null, url: row?.url ?? null, status: ready ? 'open' as const : row?.status ?? null, ready, review }
}
