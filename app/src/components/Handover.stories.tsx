import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Handover } from './Handover'

// A task's hand-over from the conversation that made it. All made up: a sample shop's checkout task.
const madeBy = { sessionId: 'sess_sample_plans', title: 'Checkout plans (sample)', open: true }
const handover = { sessionId: madeBy.sessionId, at: '2026-11-14T10:00:00Z', text: '## What it is for\nReturning customers pay in one step (sample).\n\n## What was decided\n- One page, not three. The person: "I never want to see a second page."\n- Wallet buttons go first.\n\n## What was ruled out, and why\n- A guest checkout: it loses the saved address.\n\n## Still open\n- Whether tax shows before or after the address.' }
const meta = { title: 'Components/Handover', component: Handover, args: { madeBy, handover, onWrite: fn(async () => {}) } } satisfies Meta<typeof Handover>
export default meta
type Story = StoryObj<typeof meta>

/** Written: which conversation made the task, and what it said about it. */
export const Written: Story = {}
/** The task's agent has not started yet, so nothing is written; it can be written now. */
export const NotYet: Story = {
  args: { handover: null },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Write it now' }))
    await expect(args.onWrite).toHaveBeenCalledWith(false)
  },
}
/** The conversation said nothing more than the title: that is an answer too. */
export const NothingSaid: Story = { args: { handover: { ...handover, text: null } } }
/** The conversation that made it has since ended; it can still be read. */
export const ConversationEnded: Story = { args: { madeBy: { ...madeBy, open: false } } }
/** Being written: a copy of the conversation is being asked. */
export const Writing: Story = {
  args: { onWrite: fn(() => new Promise(() => {})) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Write it again' }))
    await expect(await c.findByText(/Asking a copy of that conversation/)).toBeInTheDocument()
  },
}
/** It could not be written: the reason shows, and it can be tried again. */
export const Failed: Story = {
  args: { onWrite: fn(async () => { throw new Error('the hand-over could not be written: error_during_execution (sample)') }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Write it again' }))
    await expect(await c.findByText(/could not be written/)).toBeInTheDocument()
  },
}
/** A task a person made: no conversation, so nothing is shown. */
export const MadeByAPerson: Story = { args: { madeBy: null, handover: null } }
