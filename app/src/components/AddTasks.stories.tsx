import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { AddTasks } from './AddTasks'
import { withEngine } from '../stories/mock-engine'
import { issueRows, sampleApp } from '../stories/sample'

// On a project's page: Add task(s). Write a new one, pick from the app's other open tasks, or choose Linear tickets.
// Made up: the sample shop's tasks and its made-up Linear team SHOP; this stands on a second project, so the checkout
// project's tasks are "elsewhere".
const meta = { title: 'Components/AddTasks', component: AddTasks, args: { appId: sampleApp.id, projectId: 'proj_other', linearTeam: 'SHOP', onAdd: fn(async () => {}), onCreate: fn(async () => {}) },
  render: (a) => <div style={{ maxWidth: 1000 }}><AddTasks {...a} /></div> } satisfies Meta<typeof AddTasks>
export default meta
type Story = StoryObj<typeof meta>
const elsewhere = issueRows.map((t) => (t.project ? { ...t, project: { ...t.project, status: 'draft' } } : t))

/** Closed, as it sits on the page: one line and a button. */
export const Closed: Story = {}
/** Open on New: a title, more if it needs saying, and it says what was added so several can be written in a row. */
export const New: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add task(s)…' }))
    await expect(c.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('Task title'), 'Show the delivery date (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add task' }))
    await expect(args.onCreate).toHaveBeenCalledWith('Show the delivery date (sample)', undefined)
    await expect(await c.findByText(/Added: Show the delivery date/)).toBeVisible()
  },
}
/** Existing: tasks in no project say Add, ones in another project say Move and name where they are. (The other project is a draft here; one that is running offers none.) */
export const Existing: Story = {
  beforeEach: withEngine({ issueRows: elsewhere }),
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add task(s)…' }))
    await userEvent.click(c.getByRole('tab', { name: 'Existing' }))
    await expect((await c.findAllByRole('button', { name: /^Move SS-/ })).length).toBeGreaterThan(0)
    await userEvent.click((await c.findAllByRole('button', { name: /^Add SS-/ }))[0])
    await expect(args.onAdd).toHaveBeenCalled()
  },
}
/** Nothing else open in the app: says so. */
export const NothingToAdd: Story = {
  beforeEach: withEngine({ issueRows: issueRows.map((t) => ({ ...t, project: { id: 'proj_other', name: 'This one (sample)', status: 'draft' } })) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add task(s)…' }))
    await userEvent.click(c.getByRole('tab', { name: 'Existing' }))
    await expect(await c.findByText(/Every open task of this app is already here/)).toBeVisible()
  },
}
/** From Linear: the team's open tickets; the ticked ones become tasks and are put in this project. */
export const FromLinear: Story = {
  beforeEach: withEngine({}),
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add task(s)…' }))
    await userEvent.click(c.getByRole('tab', { name: 'From Linear' }))
    await userEvent.click(c.getByRole('button', { name: "Everyone's" }))
    await userEvent.click((await c.findAllByRole('checkbox'))[0])
    await userEvent.click(c.getByRole('button', { name: 'Add 1' }))
    await waitFor(() => expect(args.onAdd).toHaveBeenCalledWith('iss_sample_made0'))
  },
}
/** An app with no Linear team: New and Existing only. */
export const NoLinear: Story = {
  args: { linearTeam: undefined },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add task(s)…' }))
    await expect(c.queryByRole('tab', { name: 'From Linear' })).toBeNull()
  },
}
