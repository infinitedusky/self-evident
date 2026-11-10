import type { Meta, StoryObj } from '@storybook/react-vite'
import { rows } from '@self-evident/engine/steps'
import { TaskNav } from './TaskNav'
import { approvedTaskStepsView, quickWorkflow, taskStepsView, waitingTaskStepsView } from '../stories/sample'

// A task's nav, from made-up step states under the sample workflows.
const meta = { title: 'Components/TaskNav', component: TaskNav,
  args: { base: '/tasks/iss_sample20', here: 'overview', rows: rows('task', taskStepsView.states, taskStepsView.resolved.workflow), workflow: { name: 'UI change (sample)', from: ', from its project' }, build: { done: 0, total: 0, waitingOn: 'the brief\'s approval' } },
  render: (a) => <div style={{ width: 240 }}><TaskNav {...a} /></div> } satisfies Meta<typeof TaskNav>
export default meta
type Story = StoryObj<typeof meta>

/** The brief first, the steps that feed it under it: it waits on the blast radius, which is required, and the build waits on its approval. */
export const InOrder: Story = {}
/** In an enforced order with the mockups unfinished: the blast radius after them is greyed. */
export const AStepWaits: Story = { args: { rows: rows('task', waitingTaskStepsView.states, waitingTaskStepsView.resolved.workflow) } }
/** On a step's page. */
export const OnAStep: Story = { args: { here: 'mockup' } }
/** Every step done and the brief approved: the build is under way. */
export const BriefApproved: Story = { args: { here: 'build', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 1, total: 3, waitingOn: null } } }
/** A workflow with no order and fewer steps: nothing waits but the build. */
export const NoOrder: Story = { args: { rows: rows('task', [{ key: 'brief', status: 'started' }], quickWorkflow) } }
