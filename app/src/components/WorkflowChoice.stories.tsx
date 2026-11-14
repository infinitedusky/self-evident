import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { WorkflowChoice } from './WorkflowChoice'
import { quickWorkflow, uiWorkflow } from '../stories/sample'

// The workflow a task follows, and changing it after the task is made. Made-up workflows: "UI change" starts
// everything as an idea, "Quick fix" does not.
const meta = { title: 'Components/WorkflowChoice', component: WorkflowChoice, args: { workflow: uiWorkflow, from: 'project', workflows: [uiWorkflow, quickWorkflow], fromIdea: true, onChange: fn(async () => {}) } } satisfies Meta<typeof WorkflowChoice>
export default meta
type Story = StoryObj<typeof meta>

/** As it reads on the task's page: the workflow, where it comes from, and "Change". */
export const Reading: Story = {}
/** After "Change": the app's workflows, with following its project or the app on top. Choosing saves at once. */
export const Changing: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await userEvent.selectOptions(await c.findByRole('combobox'), quickWorkflow.id)
    await expect(args.onChange).toHaveBeenCalledWith(quickWorkflow.id)
    await expect(await c.findByRole('button', { name: 'Change' })).toBeInTheDocument()
  },
}
/** The task has a workflow of its own: the top choice puts it back on its project's or the app's. */
export const ItsOwn: Story = {
  args: { workflow: quickWorkflow, from: 'task' },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await userEvent.selectOptions(await c.findByRole('combobox'), '')
    await expect(args.onChange).toHaveBeenCalledWith(null)
  },
}
/** A task made directly: a workflow that starts as an idea is greyed out. */
export const MadeDirectly: Story = {
  args: { workflow: quickWorkflow, from: 'app', fromIdea: false },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await expect(await c.findByRole('option', { name: /UI change.*starts as an idea/ })).toBeDisabled()
  },
}
/** The engine refused: its reason shows beside the list, which stays open. */
export const Refused: Story = {
  args: { onChange: fn(async () => { throw new Error('no workflow wf_gone in this app (sample)') }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await userEvent.selectOptions(await c.findByRole('combobox'), quickWorkflow.id)
    await expect(await c.findByText(/no workflow wf_gone/)).toBeInTheDocument()
  },
}
