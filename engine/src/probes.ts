/**
 * Probes: what the engine runs on a build to find out whether it holds (LOG.md, 2026-11-18, "Steps, stages and
 * probes"). One shape for every kind: a name, what it runs, whether a failure holds the pull request, and a result
 * of pass or fail with evidence. They are the Verify stage of the build, for a task on the Main workflow.
 *
 *   command   a shell command the engine runs itself in the task's worktree: the exit code is the verdict, the end
 *             of the output the evidence. The app's test command is one (key `tests`).
 *   skill     a fresh agent that invokes one skill and reviews the change by it (a security review, say).
 *   built-in  one the engine brings: "Try to break it", "Comment discipline".
 *
 * A probe changes nothing (Sandy, 2026-11-18: "Probes and checks don't change code. They can create additional
 * subtasks"). What the agents' probes find is sent back to a builder as one sub-task for the round, and only the
 * probes that failed are run again; three rounds at most, then a person. A client's own requirement is a probe added
 * to the app (held.ts, the set_held tool), never a new step.
 *
 * Results are kept on the task (issue.probes), the latest for each probe.
 */
import { acceptanceLines, type Criterion } from './acceptance.js'
import { LONG_RUN, MAX_ROUNDS } from './verify.js'

import { probesOf, type Probe, type ProbeResult } from './probe-list.js'
import { applyHeldChange, applyHeldChanges, heldOf, type HeldChange } from './held.js'
export * from './probe-list.js'

/** The sub-tasks' titles: how the engine knows them (as verify.ts does for the check). */
export const PROBE_PREFIX = 'Probe: '
export const PROBE_FIX_TITLE = 'Fix what the probes found'
export const probeTitle = (p: { name: string }, run = 1) => `${PROBE_PREFIX}${p.name}${run > 1 ? ` (${run})` : ''}`
/** The probe a sub-task ran, from its title. */
export const probeOfTitle = (title: string, probes: Probe[]) => (title.startsWith(PROBE_PREFIX) ? probes.find((p) => title === probeTitle(p) || title.startsWith(`${PROBE_PREFIX}${p.name} (`)) ?? null : null)

export type NextProbe = { do: 'run'; probe: Probe; run: number } | { do: 'fix'; round: number; failing: ProbeResult[] } | { do: 'stuck'; failing: ProbeResult[] } | { do: 'done' }

/**
 * What the agents' probes do next. Pure. Each is run once; when all have a result, what the blocking ones found is
 * sent back together; then the ones that failed are run again. `fixes` is how many of those rounds have landed.
 */
export function nextProbe(probes: Probe[], results: ProbeResult[], fixes: number): NextProbe {
  const of = (p: Probe) => results.find((r) => r.key === p.key)
  const stale = (p: Probe) => { const r = of(p); return !r || (r.pass === false && r.blocks && r.fixes < fixes) }
  const first = probes.find(stale)
  if (first) return { do: 'run', probe: first, run: of(first) ? fixes + 1 : 1 }
  const failing = probes.map(of).filter((r): r is ProbeResult => !!r && r.pass === false && r.blocks)
  if (!failing.length) return { do: 'done' }
  return fixes < MAX_ROUNDS ? { do: 'fix', round: fixes + 1, failing } : { do: 'stuck', failing }
}

const VERDICT = [
  'You change nothing: no file, no commit. What you find is sent to a builder, so say exactly where and how to see each thing.',
  '',
  'End your summary with this block and nothing after it, valid JSON. pass is false if you found anything a builder must fix; evidence is one line, under 160 characters, on what you did and saw; findings is one entry for each thing to fix, each with where it is and how to see it (empty when pass is true).',
  '',
  '```probe',
  '{"pass":false,"evidence":"…","findings":["…"]}',
  '```',
]

/** A probe's instructions for its agent: the engine's own two, or a skill run as a reviewer. */
export function probeBrief(p: Probe, criteria: Criterion[], base: string): string {
  const head = 'You did not build this. It is built, merged on this branch and checked against its list.'
  if (p.key === 'break') return [
    `${head} Find out whether it really works.`,
    '',
    `Run it and use it the way a person would. Keep each try short: a scenario of a minute or two, never a sweep of every page or every case; what would take ${LONG_RUN} is a person's, after you.`,
    '- Each acceptance criterion as a scenario, start to finish.',
    '- Then what nobody wrote down: nothing entered, far too much, the same thing twice, steps out of order, the wrong kind of input, a failure halfway (a service down, a slow answer).',
    '- What it sits next to: the pages and calls that share code with it still do what they did.',
    '- Stop any server you start.',
    ...(criteria.length ? ['', 'The acceptance criteria:', acceptanceLines(criteria)] : []),
    '', ...VERDICT,
  ].join('\n')
  if (p.key === 'comments') return [
    `${head} Read the change for what a build leaves behind.`,
    '',
    `Read it (git diff ${base}...HEAD): debug output, dead code, commented-out code, TODOs with nobody to do them, files that do not belong, a test that asserts nothing, a comment that says what the code says or that is no longer true, a name that says the wrong thing.`,
    '', ...VERDICT,
  ].join('\n')
  return [
    `${head} Review it by this app's skill \`${p.runs}\`.`,
    '',
    `Invoke \`${p.runs}\` with the Skill tool before anything else, and review the change (git diff ${base}...HEAD) the way it says. Where the skill says how to report, its findings still go in the block below.`,
    '', ...VERDICT,
  ].join('\n')
}

/** For a trial (trials.ts): one sentence judged on its own against a change that is already merged. In a build, the check's agent judges the sentences with the rest of the list (verify.ts). */
export const judgedBrief = (name: string, what: string, base: string) => [
  'You did not build this. It is built and merged. Judge one thing about it.',
  '',
  `Read the change (git diff ${base}...HEAD) and what it touches, and say whether it meets this: ${name}: ${what}`,
  'When it does not apply to this change at all, it passes: say so in the evidence.',
  '', ...VERDICT,
].join('\n')

/** The verdict at the end of a probe's summary; null when there is none to read. */
export function readProbe(summary: string | null | undefined): { pass: boolean; evidence: string; findings: string[] } | null {
  const raw = [...(summary ?? '').matchAll(/```probe\s*([\s\S]*?)```/g)].pop()?.[1]
  if (!raw?.trim()) return null
  try {
    const v = JSON.parse(raw) as { pass?: unknown; evidence?: unknown; findings?: unknown }
    if (typeof v?.pass !== 'boolean') return null
    const findings = Array.isArray(v.findings) ? v.findings.filter((f): f is string => typeof f === 'string' && !!f.trim()).map((f) => f.trim().slice(0, 600)).slice(0, 30) : []
    return { pass: v.pass && !findings.length, evidence: String(v.evidence ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), findings }
  } catch { return null }
}

/** A result for the task, from what a probe's agent said (or did not). */
export function resultOf(p: Probe, summary: string | null | undefined, fixes: number, at = new Date().toISOString()): ProbeResult {
  const v = readProbe(summary)
  return { key: p.key, name: p.name, kind: p.kind, pass: v?.pass ?? null, evidence: v?.evidence || (v ? '' : 'Its agent gave no verdict.'), findings: v?.findings ?? [], blocks: p.blocks, fixes, at }
}

/** The latest result for each probe: `r` over what was held. */
export const withResult = (held: ProbeResult[] | null | undefined, r: ProbeResult): ProbeResult[] => [...(held ?? []).filter((x) => x.key !== r.key), r]

/** What the probes found, sent back to a builder: every finding of the round in one sub-task. */
export const probeFixBrief = (failing: ProbeResult[], round: number) => [
  `Probes of what was built found ${failing.reduce((n, r) => n + Math.max(1, r.findings.length), 0) === 1 ? 'this' : 'these'}${round > 1 ? ` (round ${round} of ${MAX_ROUNDS})` : ''}. Fix each one, with a test where it is behaviour, and nothing else: what works stays as it is.`,
  '',
  ...failing.flatMap((r) => [`${r.name}:`, ...(r.findings.length ? r.findings : [r.evidence || 'it failed, and did not say what']).map((f) => `- ${f}`), '']),
  'Each probe that failed is run again when you finish, by an agent that only looks. Say in your summary where to look for each fix.',
  'If one cannot be fixed as written, do not work around it: say exactly what stands in the way.',
].join('\n')

/** What a command probe that failed is sent back with. */
export const commandFixBrief = (failed: { name: string; runs: string; detail: string }[]) => [
  `Every sub-task of this task is merged, and ${failed.length === 1 ? 'this command then failed' : 'these commands then failed'} on the merged work. Nothing has been blamed yet.`,
  '',
  '1. Find the cause first: what fails, and which merged change broke it (git log on this branch)? Run the failing part alone.',
  '2. Fix the cause. If it also fails on the default branch, or passes alone and fails only in the whole run, it is unreliable: make it reliable, and say so in your summary.',
  `3. Run ${failed.length === 1 ? 'it' : 'each'} before you finish; this sub-task is the one that does: ${failed.map((f) => `\`${f.runs}\``).join(', ')}`,
  ...failed.flatMap((f) => ['', `What \`${f.runs}\` said (${f.name}):`, '```', f.detail, '```']),
].join('\n')

/**
 * Changes to what an app's builds are held to (the set_held tool, and a page's save): each as held.ts takes it,
 * applied in order to the settings as they are at that moment. Returns the list as it is afterwards, and the changes
 * that could not be made.
 */
export async function setHeld(appId: string, changes: HeldChange[]) {
  const { patchSetup } = await import('./setup.js')
  const refused: HeldChange[] = []
  const setup = await patchSetup(appId, (now) => {
    let cur = now
    for (const c of changes) { const patch = applyHeldChange(cur, c); if (!patch) refused.push(c); else cur = Object.fromEntries(Object.entries({ ...cur, ...patch }).filter(([, v]) => v !== null && v !== undefined)) }
    return applyHeldChanges(now, changes)
  })
  return { held: heldOf(setup).map(({ id, name, kind, runs, blocks, on, own, changed }) => ({ key: id, name, kind, runs, blocks, on, own, changed })), ...(refused.length ? { refused } : {}) }
}
