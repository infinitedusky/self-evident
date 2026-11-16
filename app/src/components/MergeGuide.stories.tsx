import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { MergeGuide } from './MergeGuide'
import { withEngine } from '../stories/mock-engine'
import { mergeGuideText, mergeRecordText } from '../stories/sample'

// A task's merge guide, on its build page: what its pull request will open with. All made up: the sample checkout task.
const meta = { title: 'Components/MergeGuide', component: MergeGuide, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20' }, beforeEach: withEngine({ mergeGuide: mergeGuideText, mergeRecord: mergeRecordText }),
  render: (a) => <div style={{ maxWidth: 760 }}><MergeGuide {...a} /></div> } satisfies Meta<typeof MergeGuide>
export default meta
type Story = StoryObj<typeof meta>

/** A screen, not a document: what to act on, only the criteria that are not met or left for the person, one decision, one risk. The rest is folded away. */
export const ForTheApprover: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/1 of 4 acceptance criteria are not met/)).toBeInTheDocument()
    await expect(c.getByText('For you to check')).toBeInTheDocument()
    await expect(c.getByText(/revert this pull request/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    const fold = c.getByText('The full record: every criterion and decision').closest('details')!
    await expect(fold.open).toBe(false) // what the build met is in the record, not in the way
    await expect(c.getByText('Every acceptance criterion')).not.toBeVisible()
  },
}
/** Nothing to put in it yet: says what it is made from. */
export const NothingYet: Story = {
  beforeEach: withEngine({}),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/It is put together from the task/)).toBeInTheDocument() },
}
