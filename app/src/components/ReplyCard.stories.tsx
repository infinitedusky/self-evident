import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ReplyCard } from './ReplyCard'

/** Every figure here is made up (sample data). */
const reply = {
  subtype: 'success', turns: 5, durationMs: 22000, model: 'claude-opus-5-5',
  costUsd: 11.96, stepUsd: 2.96, totalUsd: 11.96,
  usage: { 'claude-opus-5-5': { input: 1240, output: 3180, cacheRead: 412000, cacheWrite: 9600 } },
  limits: { five_hour: { status: 'allowed', utilization: 0.62, resetsAt: 1795712400 }, seven_day: { status: 'allowed', utilization: 0.31, resetsAt: 1796144400 } },
}

const meta = {
  title: 'Components/ReplyCard', component: ReplyCard, args: { body: 'done', payload: reply },
  decorators: [(Story) => <div style={{ maxWidth: 520, padding: 16 }}><Story /></div>],
} satisfies Meta<typeof ReplyCard>
export default meta
type Story = StoryObj<typeof meta>

/** Closed, as it sits under a reply: the model, how long it took, what the reply used. */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Worked for 22 seconds · opus-5-5 · 426k tokens')).toBeInTheDocument()
    await expect(c.getByText('this reply')).not.toBeVisible()
  },
}

/** Opened: tokens by kind, the cost estimate, and where the plan's limits stand. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText(/Worked for 22 seconds/))
    await expect(c.getByText('$2.96')).toBeVisible()
    await expect(c.getByText('$11.96')).toBeVisible()
    await expect(c.getByText('62% used')).toBeVisible()
  },
}

/** A helper model ran beside the main one, and the five-hour limit is close. */
export const TwoModelsNearTheLimit: Story = {
  args: { open: true, payload: { ...reply, usage: { ...reply.usage, 'claude-haiku-5-5': { input: 800, output: 210, cacheRead: 0, cacheWrite: 0 } }, limits: { five_hour: { status: 'allowed_warning', utilization: 0.91, resetsAt: 1795712400 }, seven_day: reply.limits.seven_day } } },
}

/** The limit is used up and the plan is into extra usage. */
export const OverTheLimit: Story = {
  args: { open: true, payload: { ...reply, limits: { five_hour: { status: 'rejected', utilization: 1, resetsAt: 1795712400, overage: true } } } },
}

/** A reply recorded before tokens and limits were kept: the cost stands in for what it used. */
export const AnOlderReply: Story = {
  args: { open: true, payload: { subtype: 'success', turns: 3, durationMs: 160000, costUsd: 0.31, stepUsd: 0.04, totalUsd: 0.31 } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText('Worked for 3 minutes · $0.04')).toBeInTheDocument() },
}

/** The reply stopped on an error: the line says how it ended. */
export const Stopped: Story = { args: { body: 'error_max_turns', payload: { ...reply, subtype: 'error_max_turns' } } }
