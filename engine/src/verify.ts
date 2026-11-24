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
import { acceptanceLines, later, proofOf, type AcceptanceChange, type Criterion } from './acceptance.js'
import { notYet, type Covered, type Requirement } from './requirements.js'

/** The sub-tasks' titles: how the engine knows them, and counts the rounds. */
export const CHECK_TITLE = 'Check it against its acceptance criteria'
export const FINISH_TITLE = 'Finish what the check found'
/**
 * The check again, of only what is not checked yet (Sandy, 2026-11-23: a criterion added after the build's check "sat
 * unmarked and looked like a failure; the Check step stayed done"). Asked for by a person's press or the task's agent
 * (runner.checkAgain). It starts with CHECK_TITLE, so it is run, read and drawn as a check; it is not one of the
 * rounds, which count what was sent back.
 */
export const RECHECK_TITLE = `${CHECK_TITLE}: what is not checked yet`
/** A check that is one of the rounds: not one asked for of what was added since. */
export const isRound = (title: string) => title.startsWith(CHECK_TITLE) && !title.startsWith(RECHECK_TITLE)
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
/**
 * Whose a check is (Sandy, 2026-11-19: "visual checks should be signed off on, not automated I think, we have the
 * automated version we can trigger from the smoke test if we want. this is a probe and ci/cd issue"). Found on BON-204:
 * the step that tries to break a change ran the repository's whole docs smoke, every page in Chrome for fifteen
 * minutes, because a criterion read "the whole docs smoke passes" and it was told to try each criterion start to
 * finish. A person signs off what is judged by eye; the repository's CI runs its own browser and smoke suites on the
 * pull request; an agent's step runs neither, and says which it left to whom.
 */
export const EYES_AND_CI = 'Two kinds of checking are never yours to run, whatever a criterion says. What is judged by eye (how a page looks, moves or reads; a visual pass over pages; a comparison of screenshots) is signed off by the person, in the smoke test, where the repository\'s own automated version can be run if they want it. What the repository\'s CI runs on the pull request (its smoke, end-to-end or browser suite, and anything a criterion says a CI job will show) is CI\'s. Do not run those suites or their scripts here, in whole or in a loop over pages, and do not write one. When this app wants one run on every build it is set as a probe in its settings, and the engine runs it then, once: that is never your call. Say which you left, and to whom.'
export const LEAVE_LONG_RUNS = `${EYES_AND_CI} Leave long runs to the person. After the checks a person tries what is built by hand (the smoke test), and what is slow to show belongs there. If showing that one thing holds would take ${LONG_RUN}, do not run it and do not write a script that does: show it on one or two cases, and say in your summary what you left to the person and where they look. Do not run a command that takes minutes a second time to see a fix: run only the part you changed.`

/** One line per item, each with the id its verdict is reported under. */
const requirementItems = (reqs: Requirement[]) => reqs.map((r) => `- [${reqId(r.key)}] ${r.name}: ${r.what}`).join('\n')

export const checkTaskBrief = (criteria: Criterion[], requirements: Requirement[] = [], again?: { round: number } | { /** Only what is not checked yet: added or changed since the build's check. */ added: true; /** The pull request's description as written so far, for an item judged from it. */ description?: string | null }, /** The app's smoke test set-ups, when it has more than one: what a person can have brought up to check by hand. */ setups: { key: string; name: string; what?: string }[] = [], /** What this app's settings leave to its CI on the pull request, and to its nightly run (probe-list.ts, `leftTo`). */ left: { pr?: { name: string; runs: string }[]; nightly?: { name: string; runs: string }[] } = {}) => [
  again && 'added' in again
    ? 'This task was built and checked. The items below were added or changed after that check, so nothing has been said about them yet. Check each against what is built now, at the head of the branch, by the same rules as the first check.'
    : again
    ? `Check ${again.round}: the last check found these not done, and they were sent back. Check each again against what is built now.`
    : 'Every other sub-task of this task is merged. Check what was built against the list below, so the person who approves the pull request does not have to.',
  '',
  'Rules:',
  '- Check, do not build. Change no product code. If something is not done, say so; do not do it.',
  '- For each item do what it says to look at, where you can: run that test, render that story headless, read that file, run that command. Run what an item needs, not the whole suite; that runs after you.',
  '- met is true only if you saw it hold, and false if you saw it fail or it is not there.',
  `- ${EYES_AND_CI} For one of those, met is null: for the person, "when" is "here" and the evidence is what to look at; for CI, "when" is "pr" and the evidence names the job to see green.`,
  `- met is null when only a person can judge it (how it looks or feels, a real device), when checking it would take you ${LONG_RUN}, or when you could not check it. For a long one look at one or two cases, do not run or write a sweep, and leave it to the person with what you saw. ` + 'The person is then walked through it, so write it for them: add "where", the path of the app or the story\'s id to open; and make the evidence what to do there and what passing looks like, in plain words ("Drag a node across the tunnel: the edge should stay under the lip, not jump above it"). Add "when" too: "here" if it can be tried on the built code on this computer; "pr" if it needs the pull request to exist (a comment a bot posts, a check that runs in CI, a preview of the pull request); "after" if it can only be seen once it is merged (a release, a deploy, a flag switched on).',
  ...(left.pr?.length ? [`- This app's settings leave ${left.pr.length === 1 ? 'this' : 'these'} to CI on the pull request: ${left.pr.map((x) => `${x.name} (the check "${x.runs}")`).join('; ')}. An item ${left.pr.length === 1 ? 'it proves' : 'one of them proves'} is met null with "when" "pr", and its evidence names that check.`] : []),
  ...(left.nightly?.length ? [`- This app's settings leave ${left.nightly.length === 1 ? 'this' : 'these'} to a run every night on the default branch, after the merge: ${left.nightly.map((x) => `${x.name} (the workflow ${x.runs})`).join('; ')}. An item ${left.nightly.length === 1 ? 'it proves' : 'one of them proves'} is met null with "when" "nightly", and its evidence names that workflow. Nobody is asked to try it and the task does not wait for it.`] : []),
  ...(setups.length > 1 ? [`- This app has ${setups.length} set-ups a person can have brought up to check by hand. For each item you leave to a person add "setup": the key of the one they need. Give items that need the same thing the same one, so it is brought up once. They are: ${setups.map((s) => `"${s.key}" (${s.name}${s.what ? `: ${s.what}` : ''})`).join('; ')}.`] : []),
  '- Where the person checks it by running commands, put each command in `backticks` in the evidence, one command each: they get a button that runs it in a terminal beside the check.',
  '- A requirement that does not apply to this change (no new behaviour to trace, nothing a person does differently) is met: true, with "does not apply:" and why as its evidence.',
  '- evidence is one line, under 160 characters: the test, file or command that shows it; for something not done, what is missing.',
  '- Stop any server you start.',
  '- An item marked SMOKE is the person\'s to check on the built code: met is null, "when" is "here" (or "pr" when it is about what the pull request says), with "where" and what passing looks like. Look at one case if it is quick, to write that well; do not mark it met.',
  '- An item that can only be true at deploy (a variable set in each environment, a migration run there, a monitor applied) is not yours and not the smoke test\'s: met is null, "when" is "after", and the evidence is the step for whoever deploys, in a line. It becomes a deploy step on the pull request.',
  ...(criteria.filter((c) => !later(c)).length ? ['', 'The task\'s acceptance criteria:', acceptanceLines(criteria.filter((c) => !later(c)))] : []),
  ...(requirements.length ? ['', 'What this app requires of every change:', requirementItems(requirements)] : []),
  ...(again && 'added' in again && requirements.some(fromDescription) ? ['', again.description?.trim() ? `The pull request's description, as it is written now (an item about what the pull request says is judged from this):\n\n${again.description.trim().slice(0, 12_000)}` : 'No description has been written for the pull request yet. An item about what the pull request says is met null, for the person, with "when" "pr".'] : []),
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

export interface Verdict { id: string; met: boolean | null; evidence: string; /** For one left to a person: where to go. */ where?: string; /** For one left to a person: when it can be done. */ when?: 'here' | 'pr' | 'after' | 'nightly'; /** For one left to a person: which of the app's set-ups they need (its key). */ setup?: string }

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
        out.push({ id: v.id, met: v.met === true ? true : v.met === false ? false : null, evidence: String(v.evidence ?? '').replace(/\s+/g, ' ').trim().slice(0, 300), ...(where && v.met !== true && v.met !== false ? { where } : {}), ...((v.when === 'pr' || v.when === 'after' || v.when === 'here' || v.when === 'nightly') && v.met !== true && v.met !== false ? { when: v.when } : {}), ...(typeof v.setup === 'string' && v.setup.trim() && v.met !== true && v.met !== false ? { setup: v.setup.trim().slice(0, 40) } : {}) })
      }
      if (out.length) return out
    } catch { /* not JSON: try the next */ }
  }
  return []
}

/** The verdicts on criteria as a change to them: met or not with its evidence; left for a person, the note alone. */
export const verdictChange = (verdicts: Verdict[]): AcceptanceChange => ({
  update: verdicts.filter((v) => !v.id.startsWith(REQ)).map((v) => (v.met === null
    ? { id: v.id, built: null, builtEvidence: v.evidence || 'Left for a person to judge.', builtWhere: v.where ?? null, builtWhen: v.when ?? null, builtSetup: v.setup ?? null, ...(v.when === 'after' ? { kind: 'release' as const } : {}) }
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
    // Marked met, with evidence that says it is still to come, is not met: it stays unchecked, with what was said.
    if (v.met === true && notYet(v.evidence)) return { ...base, name: r.name, applies: !na, how: v.evidence || base.how }
    const { built: _b, left: _l, ...kept } = base // this check's word replaces the last one's
    return { ...kept, name: r.name, applies: !na, how: v.evidence || base.how, ...(v.met === null ? { left: true } : { built: v.met }) }
  })
}

/** Whether a criterion still wants checking: no mark from the build, and no note leaving it to a person. */
export const unchecked = (c: Criterion) => c.built === undefined && !c.builtEvidence && !proofOf(c) // one tagged smoke is the person's from the start; release and watch are nobody's before the merge
/** The same for a requirement: no mark, and not left to the person. One the task holds nothing about is not checked yet. */
export const uncheckedReq = (c: Covered | undefined) => !c || (c.built === undefined && !c.left)

/**
 * Whether a requirement is judged from what the pull request says (the engine's own Test plan and Risks, and an app's
 * that speaks of the pull request). Changing the description takes the check's mark off these: it was a mark on other words.
 */
export const fromDescription = (r: { key: string; what?: string }) => r.key === 'test_plan' || r.key === 'risks' || /\b(pull request|PR)\b/.test(r.what ?? '')
/** The task's requirements once its pull request's description has changed: the ones judged from it are not checked yet. The rest, and what nobody had checked, are as they were. */
export function afterDescription(required: Requirement[], held: Covered[] | null | undefined): { held: Covered[]; reopened: string[] } {
  const keys = new Set(required.filter(fromDescription).map((r) => r.key))
  const reopened: string[] = []
  const out = (held ?? []).map((c) => {
    if (!keys.has(c.key) || (c.built === undefined && !c.left)) return c
    reopened.push(c.key)
    const { built: _b, left: _l, ...rest } = c
    return { ...rest, how: '' }
  })
  return { held: out, reopened }
}

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
export function afterBuild(i: { titles: string[]; listed: boolean; unmet: number; /** The sub-task that has just landed, when one has. After a check asked for of what was added, with nothing found not done, nothing else is run again: no code changed. */ last?: string; /** Whether the engine has commands to run last (the test run, the app's own). */ commands: boolean; /** The agents' probes: one to run, what they found to send back, sent back three times already, or nothing more. */ probe?: 'run' | 'fix' | 'stuck' | 'done'; /** false: a Legacy task (planned into sub-tasks): one check of its criteria, as before, and no finish or probe. */ loop?: boolean }): Next {
  const checks = i.titles.filter(isRound).length
  const finishes = i.titles.filter((t) => t.startsWith(FINISH_TITLE)).length
  if (i.last?.startsWith(RECHECK_TITLE) && (i.loop === false || (i.unmet === 0 && checks > 0))) return { do: 'done' }
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
