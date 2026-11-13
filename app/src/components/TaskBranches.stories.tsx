import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { TaskBranches } from './TaskBranches'
import { withEngine } from '../stories/mock-engine'
import { taskBranches } from '../stories/sample'

// A task's save points and task branches, on its overview. All made up: the sample checkout task, saved twice, with
// one earlier try set aside.
const meta = { title: 'Components/TaskBranches', component: TaskBranches, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20' }, beforeEach: withEngine({ taskBranches }),
  render: (a) => <div style={{ maxWidth: 760 }}><TaskBranches {...a} /></div> } satisfies Meta<typeof TaskBranches>
export default meta
type Story = StoryObj<typeof meta>

/** One list: the save points, then the task branch that was set aside. Which task branch is being worked on is said at the top. */
export const SavedTwice: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Proto before review (sample)')).toBeInTheDocument()
    await expect(c.getByText(/4 changes since/)).toBeInTheDocument()
    await expect(c.getByText(/made by Self Evident/)).toBeInTheDocument()
    await expect(c.getByText(/Set aside · started from “Before the wallet idea \(sample\)” · 3 commits and 1 comment only here/)).toBeInTheDocument()
    await expect(c.getByLabelText('Working on Main')).toBeInTheDocument() // the one you are on is the first row
  },
}
/** Nothing saved yet: what a save point is, and the one thing to do. */
export const NoneYet: Story = {
  beforeEach: withEngine({}),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/No save points yet/)).toBeInTheDocument()
  },
}
/** Saving: a name, and it is in the list. The work carries on. */
export const SaveHere: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByLabelText('Name of the save point'), 'Waiting for approval (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save here' }))
    await expect(await c.findByText('Waiting for approval (sample)')).toBeInTheDocument()
    await expect(c.getByLabelText('Name of the save point')).toHaveValue('')
  },
}
/** Going back asks first, saying what happens: a new task branch starts there, and what was done since is set aside, not lost. */
export const GoBack: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Go back to Proto before review (sample)' }))
    await expect(c.getByText(/The 4 changes since are set aside as “Main”, not lost/)).toBeInTheDocument()
    await expect(c.getByRole('checkbox', { name: /Also rebuild the prototype's data from its sample data/ })).not.toBeChecked()
    await userEvent.click(c.getByRole('button', { name: 'Go back' }))
    await expect(await c.findByText(/Now working on “From Proto before review \(sample\)”/)).toBeInTheDocument()
    await expect(c.getByLabelText('Working on From Proto before review (sample)')).toBeInTheDocument()
  },
}
/** A move the engine refuses says why, and nothing changes. */
export const CannotGoBack: Story = {
  beforeEach: withEngine({ taskBranches, moveError: 'a sub-task is being built right now: stop the build first, then move (sample)' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Go back to Proto before review (sample)' }))
    await userEvent.click(c.getByRole('button', { name: 'Go back' }))
    await expect(await c.findByText(/a sub-task is being built right now/)).toBeInTheDocument()
  },
}
/** A set-aside task branch can be made the one worked on again. */
export const WorkOnAnother: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Work on Wallet first (sample)' }))
    await userEvent.click(c.getByRole('button', { name: 'Work on it' }))
    await expect(await c.findByText(/Now working on “Wallet first \(sample\)”/)).toBeInTheDocument()
  },
}
/** A save point goes at once: only the way back is lost. A task branch holds work, so it asks, saying what goes. */
export const Delete: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Delete save point Prototype approved' }))
    await waitFor(() => expect(c.queryByText('Prototype approved')).not.toBeInTheDocument())
    await userEvent.click(c.getByRole('button', { name: 'Delete task branch Wallet first (sample)' }))
    await expect(c.getByText(/3 commits and 1 comment are only on it and go with it/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(c.queryByText('Wallet first (sample)')).not.toBeInTheDocument())
  },
}
/** Clear all: every save point and set-aside task branch, in one go. */
export const ClearAll: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Clear all' }))
    await userEvent.click(c.getByRole('button', { name: 'Clear them' }))
    await expect(await c.findByText(/No save points yet/)).toBeInTheDocument()
  },
}
