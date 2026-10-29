/**
 * The steps you can do to an idea, a task or a project, and the workflows that shape them (LOG.md, 2026-10-29,
 * "Workflows"). The steps are one list; a workflow switches each on or off, makes it required or optional, and can
 * enforce its order, after Jira's workflows, kept to these few settings. A task uses its own workflow, or else its
 * project's, or else the app's; with none, every step is optional and the order is free.
 */

export type StepKey = 'research' | 'brief' | 'mockup' | 'prototype'
export type On = 'idea' | 'task' | 'project'

export const STEPS: { key: StepKey; label: string; icon: string; what: string }[] = [
  { key: 'research', label: 'Research', icon: '🔎', what: 'Who does this best, what exists already, our numbers, the case against.' },
  { key: 'brief', label: 'Brief', icon: '📝', what: 'What to build, for the builder. A task completes only once it is approved.' },
  { key: 'mockup', label: 'Mockups', icon: '🎨', what: 'How it looks: stories with made-up data, variants side by side.' },
  { key: 'prototype', label: 'Prototype', icon: '🛠️', what: 'The agent\'s quick working attempt, to use and show people.' },
]
export const step = (key: StepKey) => STEPS.find((s) => s.key === key)!

/** Where each step can be done. An idea has a rough draft, not a brief; a project holds tasks and has no brief. */
export const CAN: Record<On, StepKey[]> = {
  idea: ['research', 'brief', 'mockup', 'prototype'],
  task: ['research', 'brief', 'mockup', 'prototype'],
  project: ['research', 'mockup', 'prototype'],
}
export const label = (key: StepKey, on: On) => (key === 'brief' && on === 'idea' ? 'Rough draft' : step(key).label)

export interface WorkflowStep { key: StepKey; on: boolean; required: boolean }
export interface Workflow { id: string; name: string; steps: WorkflowStep[]; ordered: boolean } // steps in its order

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

/**
 * The steps to show on one thing, in order: the workflow's, its switched-off steps left out, or every step that can
 * be done there. With an enforced order, a step waits on the first required step before it that isn't done.
 */
export function rows(on: On, states: StepState[], workflow: Workflow | null): Row[] {
  const can = CAN[on]
  const list: WorkflowStep[] = workflow
    ? workflow.steps.filter((s) => s.on && can.includes(s.key))
    : can.map((key) => ({ key, on: true, required: false }))
  const stateOf = (key: StepKey) => states.find((s) => s.key === key) ?? { key, status: 'none' as const }
  const finished = (s: StepState) => s.status === 'done' && (s.key !== 'brief' || on !== 'task' || !!s.approved)
  return list.map((s, i) => {
    const before = workflow?.ordered ? list.slice(0, i).find((b) => b.required && !finished(stateOf(b.key))) : undefined
    return { key: s.key, required: s.required, position: workflow?.ordered ? i + 1 : null, waitingOn: before?.key ?? null, state: stateOf(s.key) }
  })
}
