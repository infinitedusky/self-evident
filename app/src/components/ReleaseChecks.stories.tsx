import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ReleaseChecks } from './ReleaseChecks'

// What a task owes at deploy, and what is watched after it, on its pull request step. All made up.
const release = [
  { id: 'ac_r1', text: 'EXPORT_BUCKET is set in each environment (sample)', how: 'the deploy config has it (sample)' },
  { id: 'ac_r2', text: 'Migration 0042 has been run (sample)' },
]
const watch = [{ id: 'ac_w1', text: 'export.finished appears in production within a day (sample)', how: 'the event count is above zero (sample)' }]
const meta = { title: 'Components/ReleaseChecks', component: ReleaseChecks, parameters: { layout: 'padded' },
  args: { release, watch: [], onMark: fn(async () => {}) },
  render: (a) => <div style={{ maxWidth: 760 }}><ReleaseChecks {...a} /></div> } satisfies Meta<typeof ReleaseChecks>
export default meta
type Story = StoryObj<typeof meta>

/** Two owed, in order: each is a step for whoever deploys, and is said done with a press. */
export const Owed: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/2 owed/)).toBeInTheDocument()
    const rows = c.getAllByRole('listitem')
    await expect(rows[0]).toHaveTextContent('EXPORT_BUCKET'); await expect(rows[0]).toHaveTextContent('the deploy config has it')
    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Done' }))
    await expect(args.onMark).toHaveBeenCalledWith('ac_r1', true, '')
  },
}
/** Not done needs a reason: it is usually why production is wrong. */
export const NotDone: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    const row = c.getAllByRole('listitem')[1]
    await userEvent.click(within(row).getByRole('button', { name: 'Not done' }))
    const save = within(row).getByRole('button', { name: 'Say it is not done' })
    await expect(save).toBeDisabled()
    await userEvent.type(within(row).getByLabelText('What stands in the way'), 'waiting on the database team (sample)')
    await userEvent.click(save)
    await expect(args.onMark).toHaveBeenCalledWith('ac_r2', false, 'waiting on the database team (sample)')
  },
}
/** One done and one said not done (made up): who said so, and why. */
export const Marked: Story = {
  args: { release: [{ ...release[0], done: true, note: 'set in staging and production (sample)', by: 'Sam (sample)', at: '2026-11-23T12:00:00.000Z' }, { ...release[1], done: false, note: 'waiting on the database team (sample)', by: 'user', at: '2026-11-23T12:00:00.000Z' }] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/1 owed/)).toBeInTheDocument()
    await expect(c.getByText(/Done, said Sam \(sample\): set in staging and production/)).toBeInTheDocument()
    await expect(c.getByText(/Not done, said you: waiting on the database team/)).toBeInTheDocument()
  },
}
/** With what is watched after the deploy (made up): listed, and nobody marks it. */
export const WithWatch: Story = {
  args: { watch },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Watched after the deploy')).toBeInTheDocument()
    await expect(c.getByText(/export.finished appears in production/)).toBeInTheDocument()
  },
}
/** Only watched, nothing owed at deploy (made up). */
export const OnlyWatch: Story = {
  args: { release: [], watch },
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.queryByText('At deploy')).toBeNull(); await expect(c.getByText('Watched after the deploy')).toBeInTheDocument() },
}
/** The engine refuses (made up): its words are shown on that row. */
export const Refused: Story = {
  args: { onMark: fn(async () => { throw new Error('that criterion is not a release check') }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(within(c.getAllByRole('listitem')[0]).getByRole('button', { name: 'Done' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('not a release check')
  },
}
