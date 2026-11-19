/**
 * Requirements: what every plan in an app must cover, whatever the task (Sandy, 2026-11-14: "there's also the need to
 * say what exactly are the requirements that we're planning for … is OpenTelemetry a requirement … a test plan, all
 * the things that need to get taken care of after the prototype needs to be known"; "configured at a project or at
 * an app level"). They are the sentences among what an app's builds are held to (held.ts: the engine's, as the app
 * has switched and reworded them, and its own), each a name and a sentence saying what it means for this app; a project can switch one off or on for its own tasks (project.requirements: {key: boolean}).
 *
 * The planner must say, for each one in force, how the plan meets it or why it does not apply (the task keeps the
 * answer, issue.requirements); the merge guide reports each on the pull request. A requirement the planner did not
 * speak to is kept as "not addressed", never dropped.
 */
import { heldOf, JUDGED } from './held.js'

export interface Requirement { key: string; name: string; what: string; on: boolean; /** false: an unmet one is reported (the list, the pull request) and the build is not sent back for it. Absent: it blocks. */ blocks?: boolean }
export interface Covered { key: string; name: string; applies: boolean; how: string; /** The check after the build (verify.ts): true, the build meets it; false, it does not. Absent: not checked. */ built?: boolean }

/** What an app starts with (held.ts ships them). An app rewords or switches one; it does not copy the list. */
export const DEFAULT_REQUIREMENTS: Requirement[] = JUDGED.map((d) => ({ key: d.key, name: d.name, what: d.runs, on: d.on }))

/** The app's list, with a workflow's and then a project's switches applied (held.ts). Every one, on or off. */
export function requirementsOf(setup: unknown, project?: unknown, workflow?: unknown): Requirement[] {
  return heldOf(setup, workflow, project).filter((h) => h.kind === 'judged').map((h) => ({ key: h.key, name: h.name, what: h.runs, on: h.on, ...(h.blocks ? {} : { blocks: false }) }))
}
/** The ones in force: what a plan must cover. */
export const inForce = (setup: unknown, project?: unknown, workflow?: unknown) => requirementsOf(setup, project, workflow).filter((r) => r.on)

/** What the planner said, lined up with what was required: each requirement once, in the app's order. */
export function covered(required: Requirement[], said: { key: string; applies: boolean; how: string }[] | undefined): Covered[] {
  return required.map((r) => {
    const s = said?.find((x) => x.key === r.key)
    return { key: r.key, name: r.name, applies: s ? s.applies !== false : true, how: s?.how?.trim() ?? '' }
  })
}

/** For the planner's instructions. */
export const requirementLines = (required: Requirement[]) => required.map((r) => `- ${r.key} (${r.name}): ${r.what}`).join('\n')

/** For the merge guide: met and how, does not apply and why, or not addressed. */
export function coveredLines(list: Covered[]): string {
  return list.map((c) => (c.built === false ? `- ❌ **${c.name}**: not done. ${c.how}`.trimEnd() : !c.how ? `- ⬜ **${c.name}**: ${c.built === undefined ? 'not checked yet.' : 'met.'}` : c.applies ? `- ✅ **${c.name}**: ${c.how}` : `- ➖ **${c.name}** does not apply: ${c.how.replace(/^does not apply:?\s*/i, '')}`)).join('\n')
}
