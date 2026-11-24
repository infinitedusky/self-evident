import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SmokeAccept } from './SmokeAccept'

// Accepting a task's smoke test: the person's word that the built code is what goes to review. All made up.
const release = [{ id: 'ac_r1', text: 'EXPORT_BUCKET is set in each environment (sample)', how: 'the deploy config has it (sample)' }]
const meta = { title: 'Components/SmokeAccept', component: SmokeAccept, parameters: { layout: 'padded' },
  args: { base: '/tasks/iss_sample20', accepted: null, canAccept: true, waits: null, release: [], onAccept: fn(async () => {}) },
  render: (a) => <div style={{ maxWidth: 760 }}><SmokeAccept {...a} /></div> } satisfies Meta<typeof SmokeAccept>
export default meta
type Story = StoryObj<typeof meta>

/** Every check of the person's is marked: the smoke test can be accepted, and pressing it does. */
export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Accept the smoke test' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}
/** Checks still wait: the button is there, off, and what it waits on is said beside it. */
export const Waiting: Story = {
  args: { canAccept: false, waits: '2 checks of yours still wait: mark each, or skip them' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: 'Accept the smoke test' })).toBeDisabled()
    await expect(c.getByText(/2 checks of yours still wait/)).toBeInTheDocument()
  },
}
/** A release check is owed at deploy (made up): it is said here, does not hold the acceptance, and is marked on the pull request step. */
export const ReleaseOwed: Story = {
  args: { release },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/1 release check is owed at deploy/)).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'the pull request step' })).toHaveAttribute('href', '/tasks/iss_sample20/pr')
    await expect(c.getByRole('button', { name: 'Accept the smoke test' })).toBeEnabled()
  },
}
/** Accepted (made up): by whom and on which commit, and where it goes next. */
export const Accepted: Story = {
  args: { accepted: { by: 'Sam (sample)', at: '2026-11-23T12:00:00.000Z', sha: 'abc1234def' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Accepted by Sam \(sample\)/)).toBeInTheDocument(); await expect(c.getByText('abc1234')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Accept the smoke test' })).toBeNull()
  },
}
/** Accepted on an earlier commit (made up): the branch has moved, so it asks again. */
export const AcceptedBefore: Story = {
  args: { accepted: { by: 'Sam (sample)', at: '2026-11-23T12:00:00.000Z', sha: 'abc1234def', stale: true } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/the branch has moved since/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Accept it again' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}
/** The engine says no (made up): its words are shown. */
export const Refused: Story = {
  args: { onAccept: fn(async () => { throw new Error('the smoke test cannot be accepted yet: 1 criterion is not checked yet: run the check first') }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Accept the smoke test' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('run the check first')
  },
}
