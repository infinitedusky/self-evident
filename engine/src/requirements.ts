/**
 * Requirements: what every plan in an app must cover, whatever the task (Sandy, 2026-11-14: "there's also the need to
 * say what exactly are the requirements that we're planning for … is OpenTelemetry a requirement … a test plan, all
 * the things that need to get taken care of after the prototype needs to be known"; "configured at a project or at
 * an app level"). One list per app (setup.requirements), each a name and a sentence saying what it means for this
 * app; a project can switch one off or on for its own tasks (project.requirements: {key: boolean}).
 *
 * The planner must say, for each one in force, how the plan meets it or why it does not apply (the task keeps the
 * answer, issue.requirements); the merge guide reports each on the pull request. A requirement the planner did not
 * speak to is kept as "not addressed", never dropped.
 */
export interface Requirement { key: string; name: string; what: string; on: boolean }
export interface Covered { key: string; name: string; applies: boolean; how: string }

/** What an app starts with. An app's own list replaces these; they are a first draft to edit, not rules. */
export const DEFAULT_REQUIREMENTS: Requirement[] = [
  { key: 'telemetry', name: 'Telemetry', what: 'Anything new that a person does, or that can fail, can be seen with OpenTelemetry: a span or an event where the prototype analysis says one belongs.', on: true },
  { key: 'tests', name: 'Tests', what: 'New behaviour has automated tests that fail without the change, and the app\'s test command passes.', on: true },
  { key: 'test_plan', name: 'Test plan', what: 'How a person checks it by hand: the pages to open and what to look for, in order.', on: true },
  { key: 'docs', name: 'Docs', what: 'The documentation that describes what changed is updated in the same task.', on: true },
]

const clean = (r: Partial<Requirement>): Requirement | null => {
  const name = r.name?.trim()
  if (!name) return null
  const key = (r.key?.trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return key ? { key, name, what: r.what?.trim() ?? '', on: r.on !== false } : null
}

/** The app's list (its own, else the starting one), with a project's switches applied. Every one, on or off. */
export function requirementsOf(setup: unknown, project?: unknown): Requirement[] {
  const own = (setup as { requirements?: unknown } | null)?.requirements
  const list = Array.isArray(own) ? own.map((r) => clean(r as Partial<Requirement>)).filter((r): r is Requirement => r !== null) : DEFAULT_REQUIREMENTS
  const seen = new Set<string>()
  const unique = list.filter((r) => !seen.has(r.key) && (seen.add(r.key), true))
  const sw = project && typeof project === 'object' ? project as Record<string, unknown> : {}
  return unique.map((r) => (typeof sw[r.key] === 'boolean' ? { ...r, on: sw[r.key] as boolean } : r))
}

/** The ones in force: what a plan must cover. */
export const inForce = (setup: unknown, project?: unknown) => requirementsOf(setup, project).filter((r) => r.on)

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
  return list.map((c) => (!c.how ? `- ⬜ **${c.name}**: the plan does not say.` : c.applies ? `- ✅ **${c.name}**: ${c.how}` : `- ➖ **${c.name}** does not apply: ${c.how}`)).join('\n')
}
