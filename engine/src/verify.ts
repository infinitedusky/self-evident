/**
 * After the build: a checklist, verified (Sandy, 2026-11-16: "have a list of things to do and just include them in
 * the 'build it' prompt, and then when it is done, do a check to make sure it did each thing, anything it doesn't it
 * then needs to do. That could happen over and over until it is done. So the workflow becomes a verification
 * checklist"; then "it writes the PR, and then … our falsification / cleanup step that is another agent coming in
 * and testing it out and making sure it works and probing it").
 *
 * The list is the task's acceptance criteria and the app's requirements in force (telemetry, tests, docs …). When a
 * task's sub-tasks are all merged, the engine adds one more, each built by a fresh agent like any other sub-task:
 *
 *   check   reads the build against the list and reports a verdict for each item; it builds nothing
 *   finish  does what the check found not done; then it is checked again. Three rounds at most, then a person
 *   probe   someone who did not build it tries to break it and cleans up after the build, once
 *
 * and then the app's whole test run (runner.ts). `afterBuild` says which comes next, from what has been done.
 */
import { acceptanceLines, type AcceptanceChange, type Criterion } from './acceptance.js'
import type { Covered, Requirement } from './requirements.js'

/** The sub-tasks' titles: how the engine knows them, and counts the rounds. */
export const CHECK_TITLE = 'Check it against its acceptance criteria'
export const FINISH_TITLE = 'Finish what the check found'
export const PROBE_TITLE = 'Try to break it, and clean up'
/** How many times what the check found is sent back to be done before a person is asked (Sandy: "3 is good"). */
export const MAX_ROUNDS = 3

const REQ = 'req_'
export const reqId = (key: string) => `${REQ}${key}`

/** One line per item, each with the id its verdict is reported under. */
const requirementItems = (reqs: Requirement[]) => reqs.map((r) => `- [${reqId(r.key)}] ${r.name}: ${r.what}`).join('\n')

export const checkTaskBrief = (criteria: Criterion[], requirements: Requirement[] = [], again?: { round: number }) => [
  again
    ? `Check ${again.round}: the last check found these not done, and they were sent back. Check each again against what is built now.`
    : 'Every other sub-task of this task is merged. Check what was built against the list below, so the person who approves the pull request does not have to.',
  '',
  'Rules:',
  '- Check, do not build. Change no product code. If something is not done, say so; do not do it.',
  '- For each item do what it says to look at, where you can: run that test, render that story headless, read that file, run that command. Run what an item needs, not the whole suite; that runs after you.',
  '- met is true only if you saw it hold, and false if you saw it fail or it is not there.',
  '- met is null when only a person can judge it (how it looks or feels, a real device) or you could not check it. The person is then walked through it, so write it for them: add "where", the path of the app or the story\'s id to open; and make the evidence what to do there and what passing looks like, in plain words ("Drag a node across the tunnel: the edge should stay under the lip, not jump above it"). Add "when" too: "here" if it can be tried on the built code on this computer; "pr" if it needs the pull request to exist (a comment a bot posts, a check that runs in CI, a preview of the pull request); "after" if it can only be seen once it is merged (a release, a deploy, a flag switched on).',
  '- A requirement that does not apply to this change (no new behaviour to trace, nothing a person does differently) is met: true, with "does not apply:" and why as its evidence.',
  '- evidence is one line, under 160 characters: the test, file or command that shows it; for something not done, what is missing.',
  '- Stop any server you start.',
  ...(criteria.length ? ['', 'The task\'s acceptance criteria:', acceptanceLines(criteria)] : []),
  ...(requirements.length ? ['', 'What this app requires of every change:', requirementItems(requirements)] : []),
  '',
  'End your summary with this block and nothing after it: one entry for every item above, valid JSON.',
  '',
  '```acceptance',
  '[{"id":"ac_…","met":true,"evidence":"…"},{"id":"ac_…","met":null,"where":"/checkout","when":"here","evidence":"…"}]',
  '```',
].join('\n')

export interface Unmet { id: string; text: string; missing?: string }

/** What a check found not done, sent back to be done. */
export const finishBrief = (unmet: Unmet[], round: number) => [
  `A check of what was built found ${unmet.length === 1 ? 'this' : `these ${unmet.length}`} not done${round > 1 ? ` (round ${round} of ${MAX_ROUNDS})` : ''}. Do ${unmet.length === 1 ? 'it' : 'each one'}, and nothing else: what is done stays as it is.`,
  '',
  ...unmet.map((u) => `- [${u.id}] ${u.text}${u.missing ? `\n  Missing: ${u.missing}` : ''}`),
  '',
  'It is checked again when you finish, by an agent that only looks at what is there. So make each one true in the code, with the test or the file that shows it, and say in your summary where to look for each.',
  'If one cannot be done as written, do not work around it: say exactly what stands in the way.',
].join('\n')

/** The probe: someone who did not build it tries to break it, and cleans up. */
export const probeBrief = (criteria: Criterion[], base: string) => [
  'You did not build this. It is built, merged on this branch and checked against its list. Your job is to find out whether it really works, and to clean up after the build.',
  '',
  '1. Try to break it. Run it and use it the way a person would.',
  '   - Each acceptance criterion as a scenario, start to finish.',
  '   - Then what nobody wrote down: nothing entered, far too much, the same thing twice, steps out of order, the wrong kind of input, a failure halfway (a service down, a slow answer).',
  '   - What it sits next to: the pages and calls that share code with it still do what they did.',
  `2. Read the change (git diff ${base}...HEAD) for what a build leaves behind: debug output, dead code, commented-out code, TODOs, files that do not belong, a test that asserts nothing, a name that says the wrong thing.`,
  '3. Fix what is small and plainly wrong, with a test where it is behaviour. Leave anything that changes what the task does: report it.',
  '4. Stop any server you start. Commit what you changed.',
  ...(criteria.length ? ['', 'The acceptance criteria:', acceptanceLines(criteria)] : []),
  '',
  'Summary, for the person who approves the pull request, in this order and short:',
  '- **Tried**: what you did, in a line or two.',
  '- **Broke and fixed**: each, with the commit or test.',
  '- **Broke and left**: each, with exactly how to see it. Say "nothing" if nothing.',
  '- **Cleaned up**: what you removed or tidied.',
].join('\n')

export interface Verdict { id: string; met: boolean | null; evidence: string; /** For one left to a person: where to go. */ where?: string; /** For one left to a person: when it can be done. */ when?: 'here' | 'pr' | 'after' }

/** The verdicts in a check's summary, for the ids given; an entry for anything else is dropped. Empty when there is no block to read. */
export function readVerdicts(summary: string | null | undefined, ids: string[]): Verdict[] {
  const text = summary ?? ''
  const fenced = [...text.matchAll(/```acceptance\s*([\s\S]*?)```/g)].pop()?.[1]
  const loose = text.slice(text.lastIndexOf('[{'), text.lastIndexOf(']') + 1)
  for (const raw of [fenced, loose]) {
    if (!raw?.trim()) continue
    try {
      const list = JSON.parse(raw) as unknown
      if (!Array.isArray(list)) continue
      const known = new Set(ids)
      const out: Verdict[] = []
      for (const v of list as { id?: unknown; met?: unknown; evidence?: unknown; where?: unknown; when?: unknown }[]) {
        if (typeof v?.id !== 'string' || !known.has(v.id) || out.some((o) => o.id === v.id)) continue
        const where = typeof v.where === 'string' && v.where.trim() ? v.where.trim().slice(0, 300) : undefined
        out.push({ id: v.id, met: v.met === true ? true : v.met === false ? false : null, evidence: String(v.evidence ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), ...(where && v.met !== true && v.met !== false ? { where } : {}), ...((v.when === 'pr' || v.when === 'after' || v.when === 'here') && v.met !== true && v.met !== false ? { when: v.when } : {}) })
      }
      if (out.length) return out
    } catch { /* not JSON: try the next */ }
  }
  return []
}

/** The verdicts on criteria as a change to them: met or not with its evidence; left for a person, the note alone. */
export const verdictChange = (verdicts: Verdict[]): AcceptanceChange => ({
  update: verdicts.filter((v) => !v.id.startsWith(REQ)).map((v) => (v.met === null
    ? { id: v.id, built: null, builtEvidence: v.evidence || 'Left for a person to judge.', builtWhere: v.where ?? null, builtWhen: v.when ?? null }
    : { id: v.id, built: v.met, builtEvidence: v.evidence || null })),
})

/** The verdicts on requirements, laid over what the task already held about each (the planner's word on how, when there was a plan). */
export function requirementsChecked(required: Requirement[], held: Covered[] | null | undefined, verdicts: Verdict[]): Covered[] {
  return required.map((r) => {
    const was = held?.find((c) => c.key === r.key)
    const v = verdicts.find((x) => x.id === reqId(r.key))
    const base: Covered = was ?? { key: r.key, name: r.name, applies: true, how: '' }
    if (!v) return base
    const na = v.met === true && /^does not apply\b/i.test(v.evidence)
    return { ...base, name: r.name, applies: !na, how: v.evidence || base.how, ...(v.met === null ? {} : { built: v.met }) }
  })
}

/** Whether a criterion still wants checking: no mark from the build, and no note leaving it to a person. */
export const unchecked = (c: Criterion) => c.built === undefined && !c.builtEvidence

/** What a check left not done, for the finish: the criteria and the requirements the build did not meet. */
export function unmetOf(criteria: Criterion[], requirements: Covered[] | null | undefined, required: Requirement[]): Unmet[] {
  return [
    ...criteria.filter((c) => c.built === false).map((c) => ({ id: c.id, text: c.text, missing: c.builtEvidence })),
    ...required.flatMap((r) => { const c = requirements?.find((x) => x.key === r.key); return c?.built === false ? [{ id: reqId(r.key), text: `${r.name}: ${r.what}`, missing: c.how || undefined }] : [] }),
  ]
}

export type Next =
  | { do: 'check'; round: number } | { do: 'finish'; round: number } | { do: 'stuck' }
  | { do: 'probe' } | { do: 'test' } | { do: 'done' }

/**
 * What comes next on a task whose sub-tasks are all merged. Pure: from the titles of the sub-tasks it has had (not
 * the canceled ones), whether there is a list to check, and how much of it the last check left not done.
 */
export function afterBuild(i: { titles: string[]; listed: boolean; unmet: number; testCmd: boolean; /** false: a Legacy task (planned into sub-tasks): one check of its criteria, as before, and no finish or probe. */ loop?: boolean }): Next {
  const checks = i.titles.filter((t) => t.startsWith(CHECK_TITLE)).length
  const finishes = i.titles.filter((t) => t.startsWith(FINISH_TITLE)).length
  if (i.loop === false) return i.listed && checks === 0 ? { do: 'check', round: 1 } : i.testCmd ? { do: 'test' } : { do: 'done' }
  if (i.listed) {
    if (checks === 0) return { do: 'check', round: 1 }
    if (finishes >= checks) return { do: 'check', round: checks + 1 } // a finish landed: look again
    if (i.unmet > 0) return finishes < MAX_ROUNDS ? { do: 'finish', round: finishes + 1 } : { do: 'stuck' }
  }
  if (!i.titles.some((t) => t.startsWith(PROBE_TITLE))) return { do: 'probe' }
  return i.testCmd ? { do: 'test' } : { do: 'done' }
}

export const numbered = (title: string, n: number) => (n > 1 ? `${title} (${n})` : title)
