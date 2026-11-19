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
 *
 * then the app's probes (probes.ts): the agents' ones each as a sub-task that only looks, what they find sent back
 * together and the ones that failed run again; then the commands the engine runs itself, the test run among them
 * (runner.ts). `afterBuild` says which comes next, from what has been done. A check and a probe change nothing.
 */
import { acceptanceLines, type AcceptanceChange, type Criterion } from './acceptance.js'
import type { Covered, Requirement } from './requirements.js'

/** The sub-tasks' titles: how the engine knows them, and counts the rounds. */
export const CHECK_TITLE = 'Check it against its acceptance criteria'
export const FINISH_TITLE = 'Finish what the check found'
/** Until 2026-11-18 one agent tried to break it and cleaned up, in a sub-task of this title. A task that has one is not probed again by the engine's own probes. */
export const OLD_PROBE_TITLE = 'Try to break it, and clean up'
/** How many times what the check found is sent back to be done before a person is asked (Sandy: "3 is good"). */
export const MAX_ROUNDS = 3

const REQ = 'req_'
export const reqId = (key: string) => `${REQ}${key}`

/**
 * What takes an agent a long run to show is the person's, in the smoke test (Sandy, 2026-11-18: "Certain smoke tests
 * are asking for things that probably take a long time for an agent to do. If that's the case, we don't have the
 * agent do it, right? That's the whole reason for having the smoke test"). Said to every builder, the check and the
 * probe: a builder had written a sweep of 45 pages in a browser and run it twice, 12 minutes each.
 */
export const LONG_RUN = 'more than about two minutes of running (every page opened in a browser, a whole journey end to end, every size or device)'
export const LEAVE_LONG_RUNS = `Leave long runs to the person. After the checks a person tries what is built by hand (the smoke test), and what is slow to show belongs there. If showing that one thing holds would take ${LONG_RUN}, do not run it and do not write a script that does: show it on one or two cases, and say in your summary what you left to the person and where they look. Do not run a command that takes minutes a second time to see a fix: run only the part you changed.`

/** One line per item, each with the id its verdict is reported under. */
const requirementItems = (reqs: Requirement[]) => reqs.map((r) => `- [${reqId(r.key)}] ${r.name}: ${r.what}`).join('\n')

export const checkTaskBrief = (criteria: Criterion[], requirements: Requirement[] = [], again?: { round: number }, /** The app's smoke test set-ups, when it has more than one: what a person can have brought up to check by hand. */ setups: { key: string; name: string; what?: string }[] = []) => [
  again
    ? `Check ${again.round}: the last check found these not done, and they were sent back. Check each again against what is built now.`
    : 'Every other sub-task of this task is merged. Check what was built against the list below, so the person who approves the pull request does not have to.',
  '',
  'Rules:',
  '- Check, do not build. Change no product code. If something is not done, say so; do not do it.',
  '- For each item do what it says to look at, where you can: run that test, render that story headless, read that file, run that command. Run what an item needs, not the whole suite; that runs after you.',
  '- met is true only if you saw it hold, and false if you saw it fail or it is not there.',
  `- met is null when only a person can judge it (how it looks or feels, a real device), when checking it would take you ${LONG_RUN}, or when you could not check it. For a long one look at one or two cases, do not run or write a sweep, and leave it to the person with what you saw. ` + 'The person is then walked through it, so write it for them: add "where", the path of the app or the story\'s id to open; and make the evidence what to do there and what passing looks like, in plain words ("Drag a node across the tunnel: the edge should stay under the lip, not jump above it"). Add "when" too: "here" if it can be tried on the built code on this computer; "pr" if it needs the pull request to exist (a comment a bot posts, a check that runs in CI, a preview of the pull request); "after" if it can only be seen once it is merged (a release, a deploy, a flag switched on).',
  ...(setups.length > 1 ? [`- This app has ${setups.length} set-ups a person can have brought up to check by hand. For each item you leave to a person add "setup": the key of the one they need. Give items that need the same thing the same one, so it is brought up once. They are: ${setups.map((s) => `"${s.key}" (${s.name}${s.what ? `: ${s.what}` : ''})`).join('; ')}.`] : []),
  '- Where the person checks it by running commands, put each command in `backticks` in the evidence, one command each: they get a button that runs it in a terminal beside the check.',
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

export interface Verdict { id: string; met: boolean | null; evidence: string; /** For one left to a person: where to go. */ where?: string; /** For one left to a person: when it can be done. */ when?: 'here' | 'pr' | 'after'; /** For one left to a person: which of the app's set-ups they need (its key). */ setup?: string }

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
      for (const v of list as { id?: unknown; met?: unknown; evidence?: unknown; where?: unknown; when?: unknown; setup?: unknown }[]) {
        if (typeof v?.id !== 'string' || !known.has(v.id) || out.some((o) => o.id === v.id)) continue
        const where = typeof v.where === 'string' && v.where.trim() ? v.where.trim().slice(0, 300) : undefined
        out.push({ id: v.id, met: v.met === true ? true : v.met === false ? false : null, evidence: String(v.evidence ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), ...(where && v.met !== true && v.met !== false ? { where } : {}), ...((v.when === 'pr' || v.when === 'after' || v.when === 'here') && v.met !== true && v.met !== false ? { when: v.when } : {}), ...(typeof v.setup === 'string' && v.setup.trim() && v.met !== true && v.met !== false ? { setup: v.setup.trim().slice(0, 40) } : {}) })
      }
      if (out.length) return out
    } catch { /* not JSON: try the next */ }
  }
  return []
}

/** The verdicts on criteria as a change to them: met or not with its evidence; left for a person, the note alone. */
export const verdictChange = (verdicts: Verdict[]): AcceptanceChange => ({
  update: verdicts.filter((v) => !v.id.startsWith(REQ)).map((v) => (v.met === null
    ? { id: v.id, built: null, builtEvidence: v.evidence || 'Left for a person to judge.', builtWhere: v.where ?? null, builtWhen: v.when ?? null, builtSetup: v.setup ?? null }
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

/** What a check left not done, for the finish: the criteria and the requirements the build did not meet. A requirement set to report only is not sent back. */
export function unmetOf(criteria: Criterion[], requirements: Covered[] | null | undefined, required: Requirement[]): Unmet[] {
  return [
    ...criteria.filter((c) => c.built === false).map((c) => ({ id: c.id, text: c.text, missing: c.builtEvidence })),
    ...required.filter((r) => r.blocks !== false).flatMap((r) => { const c = requirements?.find((x) => x.key === r.key); return c?.built === false ? [{ id: reqId(r.key), text: `${r.name}: ${r.what}`, missing: c.how || undefined }] : [] }),
  ]
}

export type Next =
  | { do: 'check'; round: number } | { do: 'finish'; round: number } | { do: 'stuck' }
  | { do: 'probe' } | { do: 'probe_fix' } | { do: 'probe_stuck' } | { do: 'test' } | { do: 'done' }

/**
 * What comes next on a task whose sub-tasks are all merged. Pure: from the titles of the sub-tasks it has had (not
 * the canceled ones), whether there is a list to check, how much of it the last check left not done, and where the
 * agents' probes stand (probes.ts, nextProbe).
 */
export function afterBuild(i: { titles: string[]; listed: boolean; unmet: number; /** Whether the engine has commands to run last (the test run, the app's own). */ commands: boolean; /** The agents' probes: one to run, what they found to send back, sent back three times already, or nothing more. */ probe?: 'run' | 'fix' | 'stuck' | 'done'; /** false: a Legacy task (planned into sub-tasks): one check of its criteria, as before, and no finish or probe. */ loop?: boolean }): Next {
  const checks = i.titles.filter((t) => t.startsWith(CHECK_TITLE)).length
  const finishes = i.titles.filter((t) => t.startsWith(FINISH_TITLE)).length
  if (i.loop === false) return i.listed && checks === 0 ? { do: 'check', round: 1 } : i.commands ? { do: 'test' } : { do: 'done' }
  if (i.listed) {
    if (checks === 0) return { do: 'check', round: 1 }
    if (finishes >= checks) return { do: 'check', round: checks + 1 } // a finish landed: look again
    if (i.unmet > 0) return finishes < MAX_ROUNDS ? { do: 'finish', round: finishes + 1 } : { do: 'stuck' }
  }
  if (i.probe === 'run') return { do: 'probe' }
  if (i.probe === 'fix') return { do: 'probe_fix' }
  if (i.probe === 'stuck') return { do: 'probe_stuck' }
  return i.commands ? { do: 'test' } : { do: 'done' }
}

export const numbered = (title: string, n: number) => (n > 1 ? `${title} (${n})` : title)
