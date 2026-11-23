import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TestFiles } from './TestFiles'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// What a person needs in their hands to try a change. Made up: an invented company's files.
const meta = { title: 'Components/TestFiles', component: TestFiles, args: { appId: sampleApp.id },
  render: (a) => <div className="lv-root" style={{ maxWidth: 900 }}><TestFiles {...a} /></div> } satisfies Meta<typeof TestFiles>
export default meta
type Story = StoryObj<typeof meta>

/** On a task: the app's files and the task's own, of any kind. Each says what to do with it; a picture is shown small. */
export const OnATask: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('one-person.csv')).toBeInTheDocument()
    await expect(c.getByText('id-card.png')).toBeInTheDocument()
    await expect(c.getByText("The app's")).toBeInTheDocument()
    await expect(c.getAllByText("This task's")).toHaveLength(2)
    await expect(c.getByText(/Import it on the Employees page/)).toBeInTheDocument()
    await expect(c.getByText('No context yet.')).toBeInTheDocument()
    await expect(canvasElement.querySelector('.tf-thumb')).not.toBeNull()
  },
}
/** In the app's settings: the app's own, for every task. */
export const InSettings: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('id-card.png')).toBeInTheDocument()
    await expect(c.queryByText('one-person.csv')).toBeNull()
  },
}
/** None yet: it says what belongs here. */
export const None: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ testFiles: [] }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('None yet.')).toBeInTheDocument() },
}
/** Several files are added at once, of any kind, once they are said to hold nothing real. */
export const AddingFiles: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ testFiles: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add files' }))
    await userEvent.upload(c.getByLabelText('Test files to add'), [new File(['first_name,work_email\nSample,sample.person@northwind.example\n'], 'one-person.csv', { type: 'text/csv' }), new File([new Uint8Array([1, 2, 3])], 'id-card.png', { type: 'image/png' })])
    await userEvent.type(c.getByRole('textbox', { name: /File Context/ }), 'Import the CSV, then upload the card')
    const add = c.getByRole('button', { name: 'Add 2 files' })
    await expect(add).toBeDisabled() // until they are said to be made up, or real
    await userEvent.click(c.getByRole('radio', { name: /Made up/ }))
    await userEvent.click(add)
    await expect(await c.findByText('one-person.csv')).toBeInTheDocument()
    await expect(c.getByText('id-card.png')).toBeInTheDocument()
    await expect(c.getAllByText('Import the CSV, then upload the card')).toHaveLength(2)
  },
}
/** Text with a value of a real response in it is refused, and what was found is said by its kind, never quoted. */
export const Refused: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ testFiles: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add files' }))
    await userEvent.upload(c.getByLabelText('Test files to add'), new File(['work_email\nsomeone@sample.example\n'], 'real.csv', { type: 'text/csv' }))
    await userEvent.click(c.getByRole('radio', { name: /Made up/ }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(await c.findByText(/refused: real\.csv holds 2 values of a real response/)).toBeInTheDocument()
  },
}
/** A file said to be real is faked on the way in: only the fake is kept, and its line says so. */
export const AddingARealFile: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ testFiles: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add files' }))
    await userEvent.upload(c.getByLabelText('Test files to add'), new File(['first_name,work_email\nSample,sample.person@northwind.example\n'], 'import.csv', { type: 'text/csv' }))
    await userEvent.click(c.getByRole('radio', { name: /Real: make a fake version/ }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(await c.findByText(/CSV · .* · faked/)).toBeInTheDocument()
  },
}
/** What to do with a file is said again, and a file is removed. */
export const EditingWhatToDo: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Say what to do with notes.pdf' }))
    await userEvent.type(c.getByRole('textbox', { name: 'What to do with notes.pdf' }), 'Attach it to the person (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByText('Attach it to the person (sample)')).toBeInTheDocument()
  },
}
