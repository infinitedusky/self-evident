import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PlanHome } from './PlanHome'
import { plan } from '../stories/sample'

// Plan's page: the rail opens it. Made up: one project with three tasks at different points, and a stand-alone fix.
const meta = { title: 'Pages/PlanHome', component: PlanHome, parameters: { layout: 'fullscreen' }, args: { plan, app: 'Sample Shop', onNewTask: fn(async () => {}) }, render: (a) => <div className="tab-page"><PlanHome {...a} /></div> } satisfies Meta<typeof PlanHome>
export default meta
type Story = StoryObj<typeof meta>

/** A project with tasks at different points, and one task in no project. */
export const Planned: Story = {}
/** Nothing planned yet. */
export const NothingYet: Story = { args: { plan: { projects: [], loose: [], todosOpen: 0, workflows: [] } } }
/** Making a task directly, refused: the app's workflow starts every task as an idea. */
export const NewTaskRefused: Story = {
  args: { onNewTask: fn(async () => { throw new Error('the workflow "UI change (sample)" starts every task as an idea: capture the idea, then convert it') }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New task' }))
    await userEvent.type(canvas.getByPlaceholderText(/What will be built/), 'Sample: a gift note at checkout')
    await userEvent.click(canvas.getByRole('button', { name: 'Make the task' }))
    await canvas.findByText(/starts every task as an idea/)
  },
}
