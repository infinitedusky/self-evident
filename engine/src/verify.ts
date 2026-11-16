/**
 * Checking a task against its acceptance criteria once it is built, so the person who approves the pull request
 * does not have to (Sandy, 2026-11-16: the guide "hands the reviewer the checking instead of doing it": one opened
 * with "18 acceptance criteria have not been checked against the build yet"). When a task's sub-tasks are all
 * merged, the engine adds one more: an agent that checks each criterion and reports a verdict for each. The engine
 * reads the verdicts from its summary and marks the criteria; the merge guide then lists only what is not met or
 * is left for a person.
 */
import { acceptanceLines, type AcceptanceChange, type Criterion } from './acceptance.js'

/** The sub-task's title: how the engine knows it, and that a task has had its check. */
export const CHECK_TITLE = 'Check it against its acceptance criteria'

export const checkTaskBrief = (criteria: Criterion[]) => [
  'Every other sub-task of this task is merged. Check the task\'s acceptance criteria against what was built, so the person who approves the pull request does not have to.',
  '',
  'Rules:',
  '- Check, do not build. Change no product code. If a criterion is not met, say so; do not fix it.',
  '- For each criterion do what its "how we will know" says, where you can: run that test, render that story headless, read that file, run that command. Run what a criterion needs, not the whole suite; that runs after you.',
  '- met is true only if you saw it hold, and false if you saw it fail or it is not there.',
  '- met is null when only a person can judge it (how it looks or feels, a real device) or you could not check it. Say which, and what the person should look at.',
  '- evidence is one line, under 160 characters: the test, file or command that shows it.',
  '- Stop any server you start.',
  '',
  'The criteria:',
  acceptanceLines(criteria),
  '',
  'End your summary with this block and nothing after it: one entry for every criterion, valid JSON.',
  '',
  '```acceptance',
  '[{"id":"ac_…","met":true,"evidence":"…"}]',
  '```',
].join('\n')

export interface Verdict { id: string; met: boolean | null; evidence: string }

/** The verdicts in a check's summary, for the criteria the task has; an entry for anything else is dropped. Empty when there is no block to read. */
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
      for (const v of list as { id?: unknown; met?: unknown; evidence?: unknown }[]) {
        if (typeof v?.id !== 'string' || !known.has(v.id) || out.some((o) => o.id === v.id)) continue
        out.push({ id: v.id, met: v.met === true ? true : v.met === false ? false : null, evidence: String(v.evidence ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) })
      }
      if (out.length) return out
    } catch { /* not JSON: try the next */ }
  }
  return []
}

/** The verdicts as a change to the criteria: met or not with its evidence; left for a person, the note alone. */
export const verdictChange = (verdicts: Verdict[]): AcceptanceChange => ({
  update: verdicts.map((v) => (v.met === null
    ? { id: v.id, built: null, builtEvidence: v.evidence || 'Left for a person to judge.' }
    : { id: v.id, built: v.met, builtEvidence: v.evidence || null })),
})

/** Whether a criterion still wants checking: no mark from the build, and no note leaving it to a person. */
export const unchecked = (c: Criterion) => c.built === undefined && !c.builtEvidence
