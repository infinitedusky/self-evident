/**
 * The steps you can do to an idea, a task or a project, and the workflows that shape them (LOG.md, 2026-10-29,
 * "Workflows"). The steps are one list; a workflow decides which are required, which optional ones are on, which of
 * the later checks are added, and whether its order is enforced, after Jira's workflows, kept to these few settings.
 * A task uses its own workflow, or else its project's, or else the app's.
 *
 * The brief is the parent, not a step in the line (Sandy, 2026-11-10: "the brief sits as a kind of parent document to
 * all the stuff we do up through blast radius … that workflow is all about getting us to a really solid brief").
 * A task has two stages, the brief and the build. Every step here feeds the brief and leaves something the brief
 * points at; the brief is open from the start and approved last, once the required steps are finished.
 *
 * Fixed in every workflow:
 * - "starts as an idea" is always there and always first; a workflow makes it required or not;
 * - research, sketches, mockups and the prototype come next, in the workflow's order, each on or off;
 * - the checks (the prototype analysis, an ADR, the blast radius, a brief audit) come after those, added or removed:
 *   they read what the others produced, and run in that order, each a fresh agent, once the person approves the
 *   prototype (checks.ts; Sandy, 2026-11-11);
 * - the brief is always there and always required. It is kept last in the stored list, and its place there means
 *   nothing: no step waits on it, and it waits on no step to be opened.
 * The three ways of looking (Sandy, 2026-11-09): a sketch is about speed, plain HTML until the screen is liked; a
 * mockup is the story done properly; the prototype finds the best way to build it.
 * The app imports this module too (`@self-evident/engine/steps`), so the rules live in one place.
 */

export type StepKey = 'idea' | 'research' | 'brief' | 'sketch' | 'mockup' | 'prototype' | 'analysis' | 'adr' | 'risk' | 'audit'
export type On = 'idea' | 'task' | 'project'
/** What kind of step it is: the idea, first; research; the brief, the parent of the rest; a way of looking (sketch, mockup, prototype); a check, after those, added or removed. */
export type Place = 'first' | 'before' | 'brief' | 'either' | 'check'

export interface StepDef { key: StepKey; label: string; icon: string; what: string; place: Place }
export const STEPS: StepDef[] = [
  { key: 'idea', label: 'Starts as an idea', icon: '💡', what: 'Explored as an idea first, then converted.', place: 'first' },
  { key: 'research', label: 'Research', icon: '🔎', what: 'Who does this best, what exists already, our numbers, the case against.', place: 'before' },
  { key: 'brief', label: 'Brief', icon: '📝', what: 'What to build, for the builder: the parent of every step here. Approved last; the build starts from it.', place: 'brief' },
  { key: 'sketch', label: 'Sketches', icon: '✏️', what: 'The first look, fast: plain HTML screens to react to and change in moments, before a real story.', place: 'either' },
  { key: 'mockup', label: 'Mockups', icon: '🎨', what: 'How it looks, done properly: stories with made-up data, variants side by side. The brief points at the agreed one.', place: 'either' },
  { key: 'prototype', label: 'Prototype', icon: '🛠️', what: 'The agent\'s quick working attempt, to use, show people and find the best way to build it.', place: 'either' },
  { key: 'analysis', label: 'Prototype analysis', icon: '🔬', what: 'The prototype read by a fresh agent: how it was built, what was faked, what to keep.', place: 'check' },
  { key: 'adr', label: 'ADR', icon: '🏛️', what: 'The architecture decision for the real build, from the analysis and the code: the options, the choice, why.', place: 'check' },
  { key: 'risk', label: 'Blast radius', icon: '💥', what: 'What the change touches, what could break, and how we\'d know.', place: 'check' },
  { key: 'audit', label: 'Brief audit', icon: '🧐', what: 'The brief read against the code and the prototype by a fresh agent: gaps, wrong guesses.', place: 'check' },
]
export const step = (key: StepKey) => STEPS.find((s) => s.key === key)!
/** The checks, in the order they run. */
export const CHECKS = STEPS.filter((s) => s.place === 'check').map((s) => s.key)

/** Where each step can be done. An idea has a rough draft, not a brief, and isn't checked; a project has no brief. */
export const CAN: Record<On, StepKey[]> = {
  idea: ['research', 'brief', 'sketch', 'mockup', 'prototype'],
  task: STEPS.map((s) => s.key),
  project: ['idea', 'research', 'sketch', 'mockup', 'prototype'],
}
export const label = (key: StepKey, on: On) => (key === 'brief' && on === 'idea' ? 'Rough draft' : step(key).label)

/** A step in a workflow. A check is in the list only when added; the others are always listed. */
export interface WorkflowStep { key: StepKey; on: boolean; required: boolean }
export interface Workflow { id: string; name: string; steps: WorkflowStep[]; ordered: boolean } // steps in its order

/** What a workflow may switch: research, sketches, mockups and the prototype on or off; the idea and the brief are always on. */
export const canTurnOff = (key: StepKey) => key === 'research' || step(key).place === 'either'
export const canMakeOptional = (key: StepKey) => key !== 'brief'
export const canRemove = (key: StepKey) => step(key).place === 'check'

/** Whether steps in this order keep the fixed rules: the idea first, every check after the other steps. Where the brief sits means nothing. */
export function validOrder(steps: { key: StepKey }[]): boolean {
  const list = steps.filter((s) => s.key !== 'brief')
  const firstCheck = list.findIndex((s) => step(s.key).place === 'check')
  return list.every((s, i) => {
    const place = step(s.key).place
    if (place === 'first') return i === 0
    if (place !== 'check') return firstCheck < 0 || i < firstCheck
    return true
  })
}

/** The default list: the idea, research, sketches, mockups, the prototype, and the brief they feed; no checks; nothing but the brief required. */
export const DEFAULT_STEPS: WorkflowStep[] = ['idea', 'research', 'sketch', 'mockup', 'prototype', 'brief'].map((key) => ({ key: key as StepKey, on: true, required: key === 'brief' }))

/**
 * The workflow every app starts with, made with the app (Sandy, 2026-10-29: a task's workflow "can't be nothing").
 * An app always has a default; this stands in only for one made before that, until it's migrated.
 */
export const DEFAULT_NAME = 'Default'
export const DEFAULT_WORKFLOW: Workflow = { id: 'default', name: DEFAULT_NAME, steps: DEFAULT_STEPS, ordered: false }

/**
 * A workflow with the fixed rules applied: the idea and the brief listed and on, the brief required and last, any
 * missing fixed step put back, and an order that breaks the rules put back in the default order. A workflow saved
 * before sketches existed gets them on, right before its mockups: it never switched them off.
 */
export function normalize(w: Workflow): Workflow {
  let steps = w.steps.filter((s, i) => STEPS.some((d) => d.key === s.key) && w.steps.findIndex((x) => x.key === s.key) === i)
  const hadSketch = steps.some((s) => s.key === 'sketch')
  for (const d of DEFAULT_STEPS) if (!steps.some((s) => s.key === d.key)) steps.push({ ...d, on: d.key === 'idea' || d.key === 'brief' || d.key === 'sketch' })
  if (!hadSketch && steps.findIndex((s) => s.key === 'mockup') < steps.findIndex((s) => s.key === 'sketch')) { // beside its sibling, wherever that sits
    const sketch = steps.find((s) => s.key === 'sketch')!
    steps = steps.filter((s) => s.key !== 'sketch')
    steps.splice(steps.findIndex((s) => s.key === 'mockup'), 0, sketch)
  }
  steps = steps.map((s) => (s.key === 'brief' ? { ...s, on: true, required: true } : s.key === 'idea' ? { ...s, on: true } : canRemove(s.key) ? { ...s, on: true } : s))
  if (!validOrder(steps)) {
    const rank = (k: StepKey) => ['first', 'before', 'either', 'check', 'brief'].indexOf(step(k).place)
    steps = [...steps].sort((a, b) => rank(a.key) - rank(b.key))
  }
  steps = [...steps.filter((s) => s.key !== 'brief'), ...steps.filter((s) => s.key === 'brief')] // the parent, kept last
  return { ...w, steps }
}

/** Puts a check after the other steps (the brief stays last), or takes it out. */
export const addCheck = (w: Workflow, key: StepKey): Workflow => (w.steps.some((s) => s.key === key) ? w : normalize({ ...w, steps: [...w.steps, { key, on: true, required: false }] }))
export const removeCheck = (w: Workflow, key: StepKey): Workflow => ({ ...w, steps: w.steps.filter((s) => s.key !== key) })

/** What a step on one thing has so far. */
export interface StepState {
  key: StepKey
  status: 'none' | 'started' | 'done'
  detail?: string // "2 stories", "running", "draft"
  approved?: { by: string; at: string } // on a task: the brief, and each step a person approves (needsApproval)
}

export type Source = 'task' | 'project' | 'app'
/** On a task or project, always a workflow; on an idea, none (an idea has no workflow). */
export interface Resolved { workflow: Workflow | null; from: Source | null }

/** The workflow in force: the task's own, or else its project's, or else the app's default; never none. */
export function resolve(own?: Workflow | null, project?: Workflow | null, app?: Workflow | null): Resolved {
  if (own) return { workflow: own, from: 'task' }
  if (project) return { workflow: project, from: 'project' }
  return { workflow: app ?? DEFAULT_WORKFLOW, from: 'app' }
}

export interface Row { key: StepKey; required: boolean; position: number | null; waitingOn: StepKey | null; state: StepState }

/**
 * Whether a person approves this step (Sandy, 2026-11-10: "there should be an approve button for each step … I see the
 * check mark but not sure how that is decided"). On a task: the brief, and the steps the person is part of (research,
 * sketches, mockups, the prototype). The agent can say one is done, which makes it ready for the person; only their
 * approval finishes it. The checks (prototype analysis, ADR, blast radius, brief audit) are reports read with the brief, so they are
 * finished when done and stand approved with the brief. An idea's and a project's steps keep done as finished.
 */
export const needsApproval = (key: StepKey, on: On) => on === 'task' && key !== 'idea' && step(key).place !== 'check'
/** Finished: done, and approved where a person approves it. */
export const finished = (s: StepState, on: On) => s.status === 'done' && (!needsApproval(s.key, on) || !!s.approved)
/** Done by the agent's word and waiting on the person. */
export const ready = (s: StepState, on: On) => s.status === 'done' && needsApproval(s.key, on) && !s.approved

/**
 * The steps to show on one thing, in order: the workflow's, its switched-off steps left out, or the default list.
 * The brief comes last and is outside the order: it has no position, waits on nothing and nothing waits on it.
 * With an enforced order, each other step waits on the first required step before it that isn't finished.
 */
export function rows(on: On, states: StepState[], workflow: Workflow | null): Row[] {
  const can = CAN[on]
  const list = (workflow ? normalize(workflow).steps : DEFAULT_STEPS).filter((s) => s.on && can.includes(s.key))
  const stateOf = (key: StepKey): StepState => states.find((s) => s.key === key) ?? { key, status: 'none' }
  return list.map((s, i) => {
    const parent = s.key === 'brief'
    const before = workflow?.ordered && !parent ? list.slice(0, i).find((b) => b.required && !finished(stateOf(b.key), on)) : undefined
    return { key: s.key, required: s.required && on !== 'idea', position: workflow?.ordered && !parent ? i + 1 : null, waitingOn: before?.key ?? null, state: stateOf(s.key) }
  })
}

/** What a task's brief still waits on before it can be approved: the required steps that feed it and aren't finished. */
export function owed(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => r.key !== 'brief' && r.required && !finished(r.state, 'task')).map((r) => r.key)
}

/** What still stops a task being completed: its required steps that aren't finished, the brief always among them. */
export function blocking(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => r.required && !finished(r.state, 'task')).map((r) => r.key)
}
