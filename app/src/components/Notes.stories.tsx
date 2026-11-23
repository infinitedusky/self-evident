import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Notes } from './Notes'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// What was said, found or decided: dated, and about the tasks it names. Made up: an invented team's notes.
const meta = { title: 'Components/Notes', component: Notes, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 820 }}><Notes {...a} /></div> } satisfies Meta<typeof Notes>
export default meta
type Story = StoryObj<typeof meta>

/** The app's notes, newest day first, each with its day and the tasks it is about. A decision is marked, and they can be listed alone. */
export const OfTheApp: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Talked with Em about the import (sample)')).toBeInTheDocument()
    await expect(c.getByText(/Outcome: it gets a ticket of its own/)).toBeInTheDocument()
    await expect(c.getByText('Decision')).toBeInTheDocument()
    await expect(c.getAllByRole('link', { name: 'SS-2' })).toHaveLength(2)
    await userEvent.click(c.getByRole('checkbox', { name: 'Decisions only' }))
    await expect(c.queryByText('Vendor replied about pricing (sample)')).toBeNull()
    await expect(c.getByText('Test on an empty company first (sample)')).toBeInTheDocument()
  },
}
/** On a task: the notes about it. The task itself is not named again; another it is also about is. */
export const OnATask: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Talked with Em about the import (sample)')).toBeInTheDocument()
    await expect(c.queryByText('Vendor replied about pricing (sample)')).toBeNull()
    await expect(c.getByText(/Also about/)).toBeInTheDocument()
    await expect(c.queryByRole('link', { name: 'SS-2' })).toBeNull()
  },
}
/** None yet. */
export const None: Story = { beforeEach: withEngine({ notes: [] }), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('None yet.')).toBeInTheDocument() } }
/** A note is written for today, about the task it is added on, and can be marked a decision. */
export const AddingOne: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ notes: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a note' }))
    const save = c.getByRole('button', { name: 'Save the note' })
    await expect(save).toBeDisabled() // until it says what it is about
    await userEvent.type(c.getByRole('textbox', { name: 'What it is about' }), 'Agreed to scan only new people (sample)')
    await userEvent.click(c.getByRole('checkbox', { name: 'A decision' }))
    await userEvent.click(save)
    await expect(await c.findByText('Agreed to scan only new people (sample)')).toBeInTheDocument()
    await expect(c.getByText('Decision')).toBeInTheDocument()
  },
}
/** A note is changed, or removed, from its Edit. */
export const EditingOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Edit the note Vendor replied about pricing (sample)' }))
    const title = c.getByRole('textbox', { name: 'What it is about' })
    await userEvent.clear(title); await userEvent.type(title, 'Vendor confirmed pricing (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save the note' }))
    await waitFor(() => expect(c.getByText('Vendor confirmed pricing (sample)')).toBeInTheDocument())
  },
}
