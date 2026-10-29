/**
 * The steps you can do to an idea, a task or a project, and the workflows that shape them (LOG.md, 2026-10-29,
 * "Workflows"). The steps are one list; a workflow decides which are required, which optional ones are on, which of
 * the later checks are added, and whether its order is enforced, after Jira's workflows, kept to these few settings.
 * A task uses its own workflow, or else its project's, or else the app's.
 *
 * Fixed in every workflow (Sandy, 2026-10-29):
 * - "starts as an idea" is always there and always first; a workflow makes it required or not;
 * - research comes next: on or off, required or not;
 * - the brief is always there and always required;
 * - mockups and the prototype can go before or after the brief;
 * - the checks (an ADR, the blast radius, a brief audit, and the like) come after the brief, added or removed.
 * The app imports this module too (`@self-evident/engine/steps`), so the rules live in one place.
 */

export type StepKey = 'idea' | 'research' | 'brief' | 'mockup' | 'prototype' | 'adr' | 'risk' | 'audit'
export type On = 'idea' | 'task' | 'project'
/** Where a step may sit: first; before the brief; the brief; either side of it; after it (a check, added or removed). */
export type Place = 'first' | 'before' | 'brief' | 'either' | 'after'

export interface StepDef { key: StepKey; label: string; icon: string; what: string; place: Place }
export const STEPS: StepDef[] = [
  { key: 'idea', label: 'Starts as an idea', icon: '💡', what: 'Explored as an idea first, then converted.', place: 'first' },
  { key: 'research', label: 'Research', icon: '🔎', what: 'Who does this best, what exists already, our numbers, the case against.', place: 'before' },
  { key: 'brief', label: 'Brief', icon: '📝', what: 'What to build, for the builder. A task completes only once it is approved.', place: 'brief' },
  { key: 'mockup', label: 'Mockups', icon: '🎨', what: 'How it looks: stories with made-up data, variants side by side.', place: 'either' },
  { key: 'prototype', label: 'Prototype', icon: '🛠️', what: 'The agent\'s quick working attempt, to use and show people.', place: 'either' },
  { key: 'adr', label: 'ADR', icon: '🏛️', what: 'The architecture decision, written down: the options, the choice, why.', place: 'after' },
  { key: 'risk', label: 'Blast radius', icon: '💥', what: 'What the change touches, what could break, and how we\'d know.', place: 'after' },
  { key: 'audit', label: 'Brief audit', icon: '🧐', what: 'The brief read against the code by a second agent: gaps, wrong guesses.', place: 'after' },
]
export const step = (key: StepKey) => STEPS.find((s) => s.key === key)!
export const CHECKS = STEPS.filter((s) => s.place === 'after').map((s) => s.key)

/** Where each step can be done. An idea has a rough draft, not a brief, and isn't checked; a project has no brief. */
export const CAN: Record<On, StepKey[]> = {
  idea: ['research', 'brief', 'mockup', 'prototype'],
  task: STEPS.map((s) => s.key),
  project: ['idea', 'research', 'mockup', 'prototype'],
}
export const label = (key: StepKey, on: On) => (key === 'brief' && on === 'idea' ? 'Rough draft' : step(key).label)

/** A step in a workflow. A check is in the list only when added; the others are always listed. */
export interface WorkflowStep { key: StepKey; on: boolean; required: boolean }
export interface Workflow { id: string; name: string; steps: WorkflowStep[]; ordered: boolean } // steps in its order

/** What a workflow may switch: research, mockups and the prototype on or off; the idea and the brief are always on. */
export const canTurnOff = (key: StepKey) => key === 'research' || step(key).place === 'either'
export const canMakeOptional = (key: StepKey) => key !== 'brief'
export const canRemove = (key: StepKey) => step(key).place === 'after'

/** Whether steps in this order keep the fixed rules. */
export function validOrder(steps: { key: StepKey }[]): boolean {
  const brief = steps.findIndex((s) => s.key === 'brief')
  return steps.every((s, i) => {
    const place = step(s.key).place
    if (place === 'first') return i === 0
    if (place === 'before') return brief < 0 || i < brief
    if (place === 'after') return brief >= 0 && i > brief
    return true
  })
}

/** The default list: the idea, research, the brief, mockups and the prototype; no checks; nothing but the brief required. */
export const DEFAULT_STEPS: WorkflowStep[] = ['idea', 'research', 'mockup', 'prototype', 'brief'].map((key) => ({ key: key as StepKey, on: true, required: key === 'brief' }))

/**
 * A workflow with the fixed rules applied: the idea and the brief listed and on, the brief required, any missing
 * fixed step put back in its place, and an order that breaks the rules put back in the default order.
 */
export function normalize(w: Workflow): Workflow {
  let steps = w.steps.filter((s, i) => STEPS.some((d) => d.key === s.key) && w.steps.findIndex((x) => x.key === s.key) === i)
  for (const d of DEFAULT_STEPS) if (!steps.some((s) => s.key === d.key)) steps.push({ ...d, on: d.key === 'idea' || d.key === 'brief' })
  steps = steps.map((s) => (s.key === 'brief' ? { ...s, on: true, required: true } : s.key === 'idea' ? { ...s, on: true } : canRemove(s.key) ? { ...s, on: true } : s))
  if (!validOrder(steps)) {
    const rank = (k: StepKey) => ['first', 'before', 'either', 'brief', 'after'].indexOf(step(k).place)
    steps = [...steps].sort((a, b) => rank(a.key) - rank(b.key))
  }
  return { ...w, steps }
}

/** Puts a check right after the last step, or takes it out. */
export const addCheck = (w: Workflow, key: StepKey): Workflow => (w.steps.some((s) => s.key === key) ? w : { ...w, steps: [...w.steps, { key, on: true, required: false }] })
export const removeCheck = (w: Workflow, key: StepKey): Workflow => ({ ...w, steps: w.steps.filter((s) => s.key !== key) })

/** What a step on one thing has so far. */
export interface StepState {
  key: StepKey
  status: 'none' | 'started' | 'done'
  detail?: string // "2 stories", "running", "draft"
  approved?: { by: string; at: string } // a brief only
}

export type Source = 'task' | 'project' | 'app'
export interface Resolved { workflow: Workflow | null; from: Source | null }

/** The workflow in force: the task's own, or else its project's, or else the app's. */
export function resolve(own?: Workflow | null, project?: Workflow | null, app?: Workflow | null): Resolved {
  if (own) return { workflow: own, from: 'task' }
  if (project) return { workflow: project, from: 'project' }
  if (app) return { workflow: app, from: 'app' }
  return { workflow: null, from: null }
}

export interface Row { key: StepKey; required: boolean; position: number | null; waitingOn: StepKey | null; state: StepState }

/** Done, and for a task's brief, approved too. */
export const finished = (s: StepState, on: On) => s.status === 'done' && (s.key !== 'brief' || on !== 'task' || !!s.approved)

/**
 * The steps to show on one thing, in order: the workflow's, its switched-off steps left out, or the default list.
 * With an enforced order, a step waits on the first required step before it that isn't finished.
 */
export function rows(on: On, states: StepState[], workflow: Workflow | null): Row[] {
  const can = CAN[on]
  const list = (workflow ? normalize(workflow).steps : DEFAULT_STEPS).filter((s) => s.on && can.includes(s.key))
  const stateOf = (key: StepKey): StepState => states.find((s) => s.key === key) ?? { key, status: 'none' }
  return list.map((s, i) => {
    const before = workflow?.ordered ? list.slice(0, i).find((b) => b.required && !finished(stateOf(b.key), on)) : undefined
    return { key: s.key, required: s.required && on !== 'idea', position: workflow?.ordered ? i + 1 : null, waitingOn: before?.key ?? null, state: stateOf(s.key) }
  })
}

/** What still stops a task being completed: its required steps that aren't finished, the brief always among them. */
export function blocking(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => r.required && !finished(r.state, 'task')).map((r) => r.key)
}
