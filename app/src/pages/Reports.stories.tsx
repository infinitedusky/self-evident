import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Reports } from './Reports'
import { withEngine } from '../stories/mock-engine'
import { reports } from '../stories/sample'

// Reports on an app's work: the end-of-day note and the weekly status, drafted for the person to edit and send. All made up.
const meta = { title: 'Pages/Reports', component: Reports, parameters: { layout: 'fullscreen' }, beforeEach: withEngine({ reports }), render: () => <div className="tab-page"><Reports /></div> } satisfies Meta<typeof Reports>
export default meta
type Story = StoryObj<typeof meta>

/** The newest draft open, ready to edit and copy; earlier ones listed beside it. */
export const Drafts: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await waitFor(async () => expect(await c.findByLabelText('The report')).toHaveValue(reports.reports[0].body)) // the draft's text is filled in once it is picked
    await expect(c.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /Week of Nov 2/ })).toBeInTheDocument()
  },
}
/** Asking for one: a period, anything to add that the engine cannot know, and it is the draft. */
export const WriteOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByLabelText('Anything to add'), 'Reviewed two of Sam\'s pull requests (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Last week' }))
    await waitFor(() => expect((c.getByLabelText('The report') as HTMLTextAreaElement).value).toContain('Reviewed two of Sam\'s pull requests (sample)'))
    await expect(c.getByLabelText('Anything to add')).toHaveValue('')
  },
}
/** The draft is the person's to reword before it goes anywhere. */
export const EditTheDraft: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const box = await c.findByLabelText('The report')
    await userEvent.type(box, '\n- Paired with Jo on the release (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save changes' }))
    await expect(await c.findByText(/edited/)).toBeInTheDocument()
  },
}
/** Looking back at an earlier one. */
export const AnEarlierOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Week of Nov 2/ }))
    await waitFor(() => expect((c.getByLabelText('The report') as HTMLTextAreaElement).value).toContain('Where it stands'))
  },
}
/** The person's own format, with examples of theirs: what every report is shaped after. */
export const YourFormat: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('Your format'))
    await userEvent.type(c.getByLabelText('End-of-day format and examples'), 'Today:\n- Merged #1 (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save format' }))
    await expect(await c.findByText('Saved.')).toBeInTheDocument()
  },
}
/** None written yet: what it is, and the four periods to ask for. */
export const NoneYet: Story = {
  beforeEach: withEngine({}),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/No reports yet/)).toBeInTheDocument() },
}
/** Being written: a model call of a minute or so. */
export const Writing: Story = { beforeEach: withEngine({ reports: { ...reports, writing: true } }) }
