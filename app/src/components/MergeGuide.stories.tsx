import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { MergeGuide } from './MergeGuide'
import { withEngine } from '../stories/mock-engine'
import { mergeGuideText } from '../stories/sample'

// A task's merge guide, on its build page: what its pull request will open with. All made up: the sample checkout task.
const meta = { title: 'Components/MergeGuide', component: MergeGuide, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20' }, beforeEach: withEngine({ mergeGuide: mergeGuideText }),
  render: (a) => <div style={{ maxWidth: 760 }}><MergeGuide {...a} /></div> } satisfies Meta<typeof MergeGuide>
export default meta
type Story = StoryObj<typeof meta>

/** What to act on first, then what it does, each criterion with the build's mark, the decisions, the risks, how to undo it. */
export const ForTheApprover: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/1 acceptance criterion is not met/)).toBeInTheDocument()
    await expect(c.getByText('What it does')).toBeInTheDocument()
    await expect(c.getByText('Risks, and how we would know')).toBeInTheDocument()
    await expect(c.getByText(/revert this pull request/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  },
}
/** Nothing to put in it yet: says what it is made from. */
export const NothingYet: Story = {
  beforeEach: withEngine({}),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/It is put together from the task/)).toBeInTheDocument() },
}
