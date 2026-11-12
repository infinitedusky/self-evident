import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AddTasks } from './AddTasks'
import { withEngine } from '../stories/mock-engine'
import { issueRows, sampleApp } from '../stories/sample'

// On a project's page: the app's other open tasks, to add to this project (from no project) or move in (from another).
// Made up: the sample shop's tasks; this stands on a second project, so the checkout project's tasks are "elsewhere".
const meta = { title: 'Components/AddTasks', component: AddTasks, args: { appId: sampleApp.id, projectId: 'proj_other', onAdd: fn(async () => {}) },
  render: (a) => <div style={{ maxWidth: 1000 }}><AddTasks {...a} /></div> } satisfies Meta<typeof AddTasks>
export default meta
type Story = StoryObj<typeof meta>

/** Closed, as it sits on the page: one line and a button. */
export const Closed: Story = {}
/** Open: tasks in no project say Add, ones in another project say Move and name where they are. (The other project is a draft here; one that is running offers none.) */
export const Open: Story = {
  beforeEach: withEngine({ issueRows: issueRows.map((t) => (t.project ? { ...t, project: { ...t.project, status: 'draft' } } : t)) }),
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add existing tasks…' }))
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
    await userEvent.click(c.getByRole('button', { name: 'Add existing tasks…' }))
    await expect(await c.findByText(/Every open task of this app is already here/)).toBeVisible()
  },
}
