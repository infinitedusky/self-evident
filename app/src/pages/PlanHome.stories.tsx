import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlanHome, type Plan } from './PlanHome'
import { quickWorkflow, taskSteps, uiWorkflow } from '../stories/sample'

// Plan's page: the rail opens it. Made up: one project with three tasks at different points, and a stand-alone fix.
const plan: Plan = {
  projects: [{
    id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running', workflow: 'UI change (sample)',
    steps: [{ key: 'research', status: 'done' }, { key: 'prototype', status: 'done', detail: 'the whole flow, made-up orders' }],
    tasks: [
      { id: 'iss_sample1', identifier: 'SS-1', title: 'Address and payment on one page', state: 'in_progress', steps: taskSteps.map((s) => (s.key === 'brief' ? { ...s, approved: { by: 'Sam (sample)', at: '2026-10-28' } } : s)) },
      { id: 'iss_sample2', identifier: 'SS-2', title: 'Remember the last card used', state: 'todo', steps: taskSteps },
      { id: 'iss_sample3', identifier: 'SS-3', title: 'Order summary beside the form', state: 'todo', steps: [{ key: 'mockup', status: 'started', detail: '2 variants' }] },
    ],
  }],
  loose: [{ id: 'iss_sample9', identifier: 'SS-9', title: 'Typo in the receipt email', state: 'todo', workflow: 'Quick fix (sample)', steps: [{ key: 'brief', status: 'done', detail: 'two lines' }] }],
  todosOpen: 3, workflows: [uiWorkflow, quickWorkflow], appWorkflow: 'UI change (sample)',
}

const meta = { title: 'Pages/PlanHome', component: PlanHome, parameters: { layout: 'fullscreen' }, args: { plan, app: 'Sample Shop' }, render: (a) => <div className="tab-page"><PlanHome {...a} /></div> } satisfies Meta<typeof PlanHome>
export default meta
type Story = StoryObj<typeof meta>

/** A project with tasks at different points, and one task in no project. */
export const Planned: Story = {}
/** Nothing planned yet. */
export const NothingYet: Story = { args: { plan: { projects: [], loose: [], todosOpen: 0, workflows: [] } } }
