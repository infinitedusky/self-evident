import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SubmitPr } from './SubmitPr'
import { withEngine } from '../stories/mock-engine'

// A task's pull request, on its Sub-tasks page: never opened by itself, submitted by the person. All made up.
const meta = { title: 'Components/SubmitPr', component: SubmitPr, parameters: { layout: 'padded' }, beforeEach: withEngine({}),
  args: { issueId: 'iss_sample1', pr: null, landed: 9, total: 9, unchecked: 0, draft: true, onChanged: fn() },
  render: (a) => <div style={{ maxWidth: 760 }}><SubmitPr {...a} /></div> } satisfies Meta<typeof SubmitPr>
export default meta
type Story = StoryObj<typeof meta>

/** Still building: nothing has been pushed, and it cannot be submitted yet. */
export const StillBuilding: Story = {
  args: { landed: 4, total: 9 },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/4 of 9 sub-tasks have landed/)).toBeInTheDocument()
    await expect(c.getByText(/Nothing has been pushed/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Submit pull request' })).toBeDisabled()
  },
}
/** Everything has landed: run your own checks, then submit. It opens as a draft. */
export const ReadyToSubmit: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Run your own checks first/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Submit pull request' }))
    await expect(c.getByText(/pushes the branch and opens the pull request as a draft/)).toBeInTheDocument() // asks once: it leaves this computer
    await userEvent.click(c.getByRole('button', { name: 'Submit it' }))
    await expect(await c.findByRole('link', { name: /Pull request #412/ })).toBeInTheDocument()
    await expect(args.onChanged).toHaveBeenCalled()
  },
}
/** Acceptance criteria nobody has checked against the build: said before it is submitted. */
export const CriteriaNotChecked: Story = {
  args: { unchecked: 3 },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/3 acceptance criteria are not marked as met by the build/)).toBeInTheDocument() },
}
/** Submitted: where it is, and that later landings update it. */
export const Submitted: Story = {
  args: { pr: { number: 412, url: 'https://example.com/pull/412', status: 'draft' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('link', { name: /Pull request #412/ })).toHaveAttribute('href', 'https://example.com/pull/412')
    await expect(c.queryByRole('button', { name: 'Submit pull request' })).not.toBeInTheDocument()
  },
}
/** You closed it: it stays closed, and nothing more is pushed, until you submit it again. */
export const ClosedByYou: Story = {
  args: { pr: { number: 412, url: 'https://example.com/pull/412', status: 'closed' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/#412 is closed/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Submit pull request again' })).toBeEnabled()
  },
}
/** GitHub or the engine refuses: the reason, and nothing changes. */
export const Refused: Story = {
  beforeEach: withEngine({ submitPrError: '2 sub-tasks have still to land (SH-8, SH-9): the pull request is submitted once they all have (sample)' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Submit pull request' }))
    await userEvent.click(c.getByRole('button', { name: 'Submit it' }))
    await expect(await c.findByText(/2 sub-tasks have still to land/)).toBeInTheDocument()
  },
}
