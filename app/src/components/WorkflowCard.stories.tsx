import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { afterOf, checksOf, withChecks, type Workflow } from '@self-evident/engine/steps'
import { WorkflowCard } from './WorkflowCard'
import { quickWorkflow, uiWorkflow } from '../stories/sample'

// One workflow: which steps, how strictly, in what order. Made up.
const meta = { title: 'Components/WorkflowCard', component: WorkflowCard, args: { workflow: uiWorkflow, usedBy: 'The app\'s default · 1 project uses it (sample)', onSave: fn() },
  render: (a) => <div style={{ maxWidth: 560 }}><WorkflowCard {...a} /></div> } satisfies Meta<typeof WorkflowCard>
export default meta
type Story = StoryObj<typeof meta>

/** Reading it: ordered, two steps required. */
export const UiChange: Story = {}
/** Only the brief; the rest switched off; any order. */
export const QuickFix: Story = { args: { workflow: quickWorkflow, usedBy: '1 task uses it (sample)' } }
/** Editing: switch steps on or off, required or optional, move them, enforce the order. */
export const Editing: Story = { args: { editing: true } }

/** Fast (made up): no checks after the prototype, so it reads plan, then build. */
export const Fast: Story = {
  args: { workflow: withChecks(uiWorkflow, 'fast') },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Fast')).toBeInTheDocument()
    await expect(c.getByText(/No checks: planned and built straight after the prototype/)).toBeInTheDocument()
    await expect(c.queryByText('Audit')).toBeNull()
  },
}
/** Some of the checks (made up): the ones it runs are listed, the ones it does not are named. */
export const PicksItsChecks: Story = {
  args: { workflow: withChecks(uiWorkflow, ['analysis', 'risk']) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Your pick')).toBeInTheDocument()
    await expect(c.getByText(/Blast radius$/)).toBeInTheDocument()
    await expect(c.getByText(/Not run: Draft ADR, Audit, Final ADR and plan\./)).toBeInTheDocument()
  },
}
/** Editing: three choices for what follows the prototype; "Your pick" opens a box for each check, and what is saved is what was chosen. */
export const ChoosingWhatFollows: Story = {
  args: { editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('radio', { name: /Full/ })).toBeChecked()
    await userEvent.click(c.getByRole('radio', { name: /Your pick/ }))
    await expect(c.getByRole('checkbox', { name: /Audit/ })).toBeChecked() // starts from what it had
    await userEvent.click(c.getByRole('checkbox', { name: /Audit/ }))
    await userEvent.click(c.getByRole('checkbox', { name: /Draft ADR/ }))
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    const saved = (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow
    await expect(checksOf(saved)).toEqual(['analysis', 'risk', 'final'])
    await expect(c.getByText(/Not run: Draft ADR, Audit\./)).toBeInTheDocument()
  },
}
/** Editing, Fast chosen: saved with every check off. */
export const ChoosingFast: Story = {
  args: { editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('radio', { name: /Fast/ }))
    await expect(c.queryByRole('checkbox', { name: /Audit/ })).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(afterOf((args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow)).toBe('fast')
  },
}
