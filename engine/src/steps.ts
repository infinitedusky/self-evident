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
 * - the checks (the prototype analysis, a draft ADR, the blast radius, an audit) come after those, fixed, with a prototype:
 *   they read what the others produced, and run in that order, each a fresh agent, once the person approves the
 *   prototype (checks.ts; Sandy, 2026-11-11);
 * - the brief is always there and always required. It is kept last in the stored list, and its place there means
 *   nothing: no step waits on it, and it waits on no step to be opened.
 * The ADR here is a draft (Sandy, 2026-11-13: "draft ADR is what the step should be"): it proposes the architecture
 * so the blast radius and the brief have something to read; the planner settles it as a decision against the real
 * plan, and the final record is a file the build writes, in the form the repository keeps (planner.ts).
 * The ways of looking (Sandy, 2026-11-09; screens, 2026-11-20): a sketch is about speed, plain HTML until the layout
 * is liked; the screens are every screen and state, still and exact; a mockup is those made clickable; the prototype shows, built the way we would ship it, that it works.
 * The app imports this module too (`@self-evident/engine/steps`), so the rules live in one place.
 */

export type StepKey = 'idea' | 'research' | 'brief' | 'sketch' | 'screen' | 'mockup' | 'data' | 'prototype' | 'analysis' | 'adr' | 'risk' | 'audit' | 'final'
export type On = 'idea' | 'task' | 'project'
/** What kind of step it is: the idea, first; research; the brief, the parent of the rest; a way of looking (sketch, mockup, prototype); a check, after those, added or removed. */
export type Place = 'first' | 'before' | 'brief' | 'either' | 'check'

export interface StepDef { key: StepKey; label: string; icon: string; what: string; place: Place }
export const STEPS: StepDef[] = [
  { key: 'idea', label: 'Starts as an idea', icon: '💡', what: 'Explored as an idea first, then converted.', place: 'first' },
  { key: 'research', label: 'Research', icon: '🔎', what: 'Who does this best, what exists already, our numbers, the case against.', place: 'before' },
  { key: 'brief', label: 'Brief', icon: '📝', what: 'What to build and why, in at most 200 words, for the person who approves it. How it is built is the ADR\'s and the plan\'s, which are made from it.', place: 'brief' },
  { key: 'sketch', label: 'Sketches', icon: '✏️', what: 'The first look, fast: plain HTML screens to react to and change in moments, before a real story.', place: 'either' },
  { key: 'screen', label: 'Screens', icon: '🖼️', what: 'Every screen and every state, still, exactly as it will look: stories under Screens/, made from the app\'s own components. What can be seen is settled here.', place: 'either' },
  { key: 'mockup', label: 'Mockups', icon: '🎨', what: 'The agreed screens, clickable: stories with made-up data you can move through. The brief points at the agreed one.', place: 'either' },
  { key: 'data', label: 'Data', icon: '🧪', what: 'Every call the change makes outside the app, what answers each (a mock, from a real response or from the code), and where its data comes from for the prototype, the smoke test and the reviewer. Skipped, the app\'s defaults are used.', place: 'either' },
  { key: 'prototype', label: 'Prototype', icon: '🛠️', what: 'The thing built the way we would ship it, with only what is outside the system faked, to show with evidence that it works.', place: 'either' },
  { key: 'analysis', label: 'Prototype analysis', icon: '🔬', what: 'The prototype read by a fresh agent: how it was built, what was faked, what to keep, and how the real build should be cleaner: what repeats, what to refactor, the simpler way.', place: 'check' },
  { key: 'adr', label: 'Draft ADR', icon: '🏛️', what: 'A first pass at the architecture decision, from the analysis and the code: the options, a proposed choice, why. A draft: the planner settles it, and the record is written with the build.', place: 'check' },
  { key: 'risk', label: 'Blast radius', icon: '💥', what: 'What the plan touches, what could break, and how we\'d know. It is the risks on the pull request\'s merge guide.', place: 'check' },
  { key: 'audit', label: 'Audit', icon: '🧐', what: 'The plan read against the brief, the ADR, the code and the prototype by a fresh agent, last before the build: gaps, wrong guesses, what could go wrong.', place: 'check' },
  { key: 'final', label: 'Final ADR and plan', icon: '📌', what: 'The ADR and the plan put right from what the blast radius and the audit found, and the merge checklist for the pull request. The only step after the prototype that changes anything, and the last before the build.', place: 'check' },
]
export const step = (key: StepKey) => STEPS.find((s) => s.key === key)!
/** The checks, in the order they run. */
export const CHECKS = STEPS.filter((s) => s.place === 'check').map((s) => s.key)

/** Where each step can be done. An idea has a rough draft, not a brief, and isn't checked; a project has no brief. */
export const CAN: Record<On, StepKey[]> = {
  idea: ['research', 'brief', 'sketch', 'screen', 'mockup', 'prototype'],
  task: STEPS.map((s) => s.key),
  project: ['idea', 'research', 'sketch', 'screen', 'mockup', 'prototype'],
}
export const label = (key: StepKey, on: On) => (key === 'brief' && on === 'idea' ? 'Rough draft' : step(key).label)

/** A step in a workflow. A check is in the list only when added; the others are always listed. */
export interface WorkflowStep { key: StepKey; on: boolean; required: boolean }
/**
 * How much stands between an approved prototype and the build, as a workflow's own choice (Sandy, 2026-11-16: "Fast
 * mode presumably is just changing that. So shouldn't we add fast mode to a workflow" … "three options, full, fast,
 * fine-grain control"). Until then it was a separate switch on the app and the task, which a workflow knew nothing of.
 * - full: every check (the analysis, the draft ADR, the blast radius, the audit, the final ADR and plan), then the
 *   build. For shared code, client work and risky changes: the documents are what let other people trust it.
 * - fast: the plan, then the build. The scrutiny is on the pull request. For one person building their own thing.
 * - custom: the checks the workflow picks.
 * It is not stored by name: it is which of the workflow's check steps are on.
 */
export type After = 'full' | 'fast' | 'custom'
export const AFTERS: After[] = ['full', 'fast', 'custom']
export const AFTER_SAYS: Record<After, string> = {
  full: 'every check, then the plan and the build',
  fast: 'planned and built straight after the prototype; the scrutiny is on the pull request',
  custom: 'the checks you pick',
}
/** The checks a workflow runs after its prototype, in their order; none when it has no prototype. */
export const checksOf = (w: Workflow): StepKey[] => normalize(w).steps.filter((s) => step(s.key).place === 'check' && s.on).map((s) => s.key)
export const afterOf = (w: Workflow): After => { const n = checksOf(w).length; return n === CHECKS.length ? 'full' : n === 0 ? 'fast' : 'custom' }
/** The workflow with these checks on and the rest off: all of them for full, none for fast. */
export function withChecks(w: Workflow, keys: StepKey[] | 'full' | 'fast'): Workflow {
  const on = keys === 'full' ? CHECKS : keys === 'fast' ? [] : keys
  return normalize({ ...w, steps: [...w.steps.filter((s) => step(s.key)?.place !== 'check'), ...CHECKS.map((key) => ({ key, on: on.includes(key), required: true }))] })
}

/**
 * How a task is built (Sandy, 2026-11-16: "In main we go through prototype and then we just build it in on one step";
 * "add planner and a yolo option to the workflow settings").
 * - one: a single builder builds the whole task, from its brief, its acceptance criteria, the app's requirements and
 *   its prototype. No planner, no sub-tasks to merge one by one. What it missed is found by the check after the
 *   build and sent back (verify.ts). A task too big for one builder is two tasks.
 * - planned: the planner cuts the task into sub-tasks, built side by side and merged one at a time. As it was.
 */
export type Build = 'one' | 'planned'
export const BUILDS: Build[] = ['one', 'planned']
export const BUILD_SAYS: Record<Build, string> = {
  one: 'one builder builds the whole task; a check then finds what it missed',
  planned: 'a planner cuts it into sub-tasks, built side by side and merged one at a time',
}
export const buildOf = (w: { build?: string | null } | null | undefined): Build => (w?.build === 'one' ? 'one' : 'planned')
/** The two workflows every app has: how we build now, and how we built before it. */
export const MAIN_NAME = 'Main'
export const LEGACY_NAME = 'Legacy'

/**
 * The two kinds of workflow (Sandy, 2026-11-16: "what we should have for our different workflows are not full, fast,
 * or whatever. It's just a thing where you … set the requirements. It needs to create an ADR … telemetry coverage,
 * test suite"; "These are both what's put into the instructions and what is checked at the end").
 * - checklist: two choices. Sub-tasks or not (Build), and the requirements a build is held to. The list is in the
 *   builder's instructions and is what the check after the build reads (verify.ts). Nothing runs before the build.
 * - staged: what there was. Checks before the build (After: full, fast, or a pick), a plan, sub-tasks.
 */
export type Style = 'checklist' | 'staged'
export const STYLES: Style[] = ['checklist', 'staged']
export const STYLE_SAYS: Record<Style, string> = {
  checklist: 'a list of requirements: in the builder\'s instructions, and checked when it is built',
  staged: 'the earlier way: checks before the build, then a plan and sub-tasks',
}
export const styleOf = (w: { style?: string | null } | null | undefined): Style => (w?.style === 'checklist' ? 'checklist' : 'staged')

export interface Workflow { id: string; name: string; steps: WorkflowStep[]; ordered: boolean; build?: Build; style?: Style; /** The app's requirements it switches on or off; the rest are as the app has them. */ requirements?: Record<string, boolean> | null } // steps in its order; its check steps say what follows the prototype (After)

/** What a workflow may switch: research, sketches, mockups and the prototype on or off; the idea and the brief are always on. */
export const canTurnOff = (key: StepKey) => key === 'research' || step(key).place === 'either'
export const canMakeOptional = (key: StepKey) => key !== 'brief'
/** Nothing is removed from a workflow: a check it does not run is switched off (withChecks), not taken out. */
export const canRemove = (_key: StepKey) => false
/** The steps on the way to an approved prototype: every one but the checks, which follow it. */
export const chosen = (key: StepKey) => step(key).place !== 'check'

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

/** The default list: the idea, research, sketches, screens, mockups, the prototype, and the brief they feed; no checks; nothing but the brief required. */
export const DEFAULT_STEPS: WorkflowStep[] = ['idea', 'research', 'sketch', 'screen', 'mockup', 'data', 'prototype', 'brief'].map((key) => ({ key: key as StepKey, on: true, required: key === 'brief' }))

/**
 * The workflow every app starts with, made with the app (Sandy, 2026-10-29: a task's workflow "can't be nothing").
 * An app always has a default; this stands in only for one made before that, until it's migrated.
 */
export const DEFAULT_NAME = 'Default'
export const DEFAULT_WORKFLOW: Workflow = { id: 'default', name: DEFAULT_NAME, steps: DEFAULT_STEPS, ordered: false }

/**
 * A workflow with the fixed rules applied: the idea and the brief listed and on, the brief required and last, any
 * missing fixed step put back, and an order that breaks the rules put back in the default order. A workflow saved
 * before sketches existed gets them on, right before its mockups: it never switched them off. One saved before
 * screens existed (2026-11-20) gets them off, in the same place: an optional step that is on must be done or skipped
 * on every task before its brief is approved, and tasks under way were not asked.
 */
export function normalize(w: Workflow): Workflow {
  let steps = w.steps.filter((s, i) => STEPS.some((d) => d.key === s.key) && w.steps.findIndex((x) => x.key === s.key) === i)
  const hadSketch = steps.some((s) => s.key === 'sketch'), hadScreen = steps.some((s) => s.key === 'screen'), hadData = steps.some((s) => s.key === 'data')
  for (const d of DEFAULT_STEPS) if (!steps.some((s) => s.key === d.key)) steps.push({ ...d, on: d.key === 'idea' || d.key === 'brief' || d.key === 'sketch' })
  if (!hadSketch && steps.findIndex((s) => s.key === 'mockup') < steps.findIndex((s) => s.key === 'sketch')) { // beside its sibling, wherever that sits
    const sketch = steps.find((s) => s.key === 'sketch')!
    steps = steps.filter((s) => s.key !== 'sketch')
    steps.splice(steps.findIndex((s) => s.key === 'mockup'), 0, sketch)
  }
  if (!hadScreen && steps.findIndex((s) => s.key === 'mockup') < steps.findIndex((s) => s.key === 'screen')) {
    const screen = steps.find((s) => s.key === 'screen')!
    steps = steps.filter((s) => s.key !== 'screen')
    steps.splice(steps.findIndex((s) => s.key === 'mockup'), 0, screen)
  }
  if (!hadData && steps.findIndex((s) => s.key === 'prototype') < steps.findIndex((s) => s.key === 'data')) { // one saved before the Data step (2026-11-21): off, as screens were, right before its prototype
    const data = steps.find((s) => s.key === 'data')!
    steps = steps.filter((s) => s.key !== 'data')
    steps.splice(steps.findIndex((s) => s.key === 'prototype'), 0, data)
  }
  steps = steps.map((s) => (s.key === 'brief' ? { ...s, on: true, required: true } : s.key === 'idea' ? { ...s, on: true } : s))
  // What follows the prototype is the workflow's to choose, check by check (After). A workflow with a prototype lists
  // every check in their order, each on or off; one never set runs them all, as before. A check that runs is required
  // (it is a report, not something to skip). A workflow without a prototype has none.
  const savedOn = new Map(steps.filter((s) => !chosen(s.key)).map((s) => [s.key, s.on !== false]))
  steps = steps.filter((s) => chosen(s.key))
  if (steps.some((s) => s.key === 'prototype' && s.on)) steps.push(...CHECKS.map((key) => ({ key, on: savedOn.get(key) ?? true, required: true })))
  if (!validOrder(steps)) {
    const rank = (k: StepKey) => ['first', 'before', 'either', 'check', 'brief'].indexOf(step(k).place)
    steps = [...steps].sort((a, b) => rank(a.key) - rank(b.key))
  }
  steps = [...steps.filter((s) => s.key !== 'brief'), ...steps.filter((s) => s.key === 'brief')] // the parent, kept last
  return { ...w, steps }
}

/** Once put a check in a workflow or took it out. The checks follow the prototype now; both only tidy the workflow. */
export const addCheck = (w: Workflow, _key: StepKey): Workflow => normalize(w) // the checks are fixed: nothing to add
export const removeCheck = (w: Workflow, _key: StepKey): Workflow => normalize(w) // nor to remove

/** What a step on one thing has so far. */
export interface StepState {
  key: StepKey
  status: 'none' | 'started' | 'done' | 'skipped' // skipped: a person said this optional step is not being done here
  detail?: string // "2 stories", "running", "draft"
  approved?: { by: string; at: string } // on a task: the brief, and each step a person approves (needsApproval)
  /** What it still needs before it can be said done or approved, in a line for the person (a prototype with no guide). */
  needs?: string
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
 * approval finishes it. The checks (prototype analysis, ADR, blast radius, audit) are reports, so they are
 * finished when done and stand approved with the brief. An idea's and a project's steps keep done as finished.
 */
export const needsApproval = (key: StepKey, on: On) => on === 'task' && key !== 'idea' && step(key).place !== 'check'
/** Finished: done, and approved where a person approves it. */
export const finished = (s: StepState, on: On) => s.status === 'done' && (!needsApproval(s.key, on) || !!s.approved)
/**
 * Skipped: an optional step a person has said they are not doing on this task (Sandy, 2026-11-14: "if you aren't going
 * to use it, you have to mark it as being skipped"). A required step cannot be skipped, nor the idea or the brief.
 */
export const skipped = (s: StepState) => s.status === 'skipped'
export const canSkip = (r: { key: StepKey; required: boolean }) => !r.required && r.key !== 'brief' && r.key !== 'idea'
/** Settled: finished, or skipped. An optional step left untouched is neither. */
export const settled = (s: StepState, on: On) => finished(s, on) || skipped(s)
/** Done by the agent's word and waiting on the person. */
export const ready = (s: StepState, on: On) => s.status === 'done' && needsApproval(s.key, on) && !s.approved

/**
 * The steps to show on one thing, in order: the workflow's, its switched-off steps left out, or the default list.
 * The brief comes last and is outside the order: it has no position, waits on nothing and nothing waits on it.
 * With an enforced order, each other step waits on the first required step before it that isn't finished.
 */
export function rows(on: On, states: StepState[], workflow: Workflow | null): Row[] {
  const can = CAN[on]
  const all = (workflow ? normalize(workflow).steps : DEFAULT_STEPS).filter((s) => s.on && can.includes(s.key))
  const stateOf = (key: StepKey): StepState => states.find((s) => s.key === key) ?? { key, status: 'none' }
  // The checks belong to a prototype. They are on a task only while it has one in play: required by its workflow, or
  // begun; never when it is skipped, and not for an optional one nobody has touched (so a task that never prototypes
  // owes them nothing).
  const proto = all.find((s) => s.key === 'prototype')
  const inPlay = !!proto && stateOf('prototype').status !== 'skipped' && (proto.required || stateOf('prototype').status !== 'none') // a fast workflow has every check off, so none is listed
  const list = all.filter((s) => step(s.key).place !== 'check' || inPlay)
  return list.map((s, i) => {
    const parent = s.key === 'brief'
    const before = workflow?.ordered && !parent ? list.slice(0, i).find((b) => b.required && !finished(stateOf(b.key), on)) : undefined
    return { key: s.key, required: s.required && on !== 'idea', position: workflow?.ordered && !parent ? i + 1 : null, waitingOn: before?.key ?? null, state: stateOf(s.key) }
  })
}

/** What a task's brief still waits on before it can be approved: the required steps that feed it and aren't finished. */
export function owed(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => r.key !== 'brief' && step(r.key).place !== 'check' && r.required && !finished(r.state, 'task')).map((r) => r.key) // not the checks: they come after the prototype, and the build waits for them, not the brief
}

/** The checks a task still has to get through before it is built: the ones in play and not done. */
/** The checks the plan is made from; the others (the blast radius, the audit, the final ADR and plan) read the plan. */
export const BEFORE_PLAN: StepKey[] = ['analysis', 'adr']

export function checksOwed(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => step(r.key).place === 'check' && r.state.status !== 'done').map((r) => r.key)
}

/**
 * The optional steps a task has neither finished nor skipped. The brief waits on these too: an optional step is
 * done or it is skipped by a person, never just left. (Starting as an idea is a fact about the task, not work.)
 */
export function undecided(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => canSkip(r) && !settled(r.state, 'task')).map((r) => r.key)
}

/** What still stops a task being completed: its required steps that aren't finished, the brief always among them. */
export function blocking(states: StepState[], workflow: Workflow | null): StepKey[] {
  return rows('task', states, workflow).filter((r) => r.required && !finished(r.state, 'task')).map((r) => r.key)
}
