import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Acceptance } from './Acceptance'
import { sampleData, withEngine } from '../stories/mock-engine'
import { acceptance, issueDetails } from '../stories/sample'

// A task's acceptance criteria, on its brief's page. All made up: five criteria of the sample checkout task.
const withCriteria = withEngine({ issueDetails: { ...sampleData.issueDetails, iss_sample20: { ...issueDetails.iss_sample20, acceptance } } })
const meta = { title: 'Components/Acceptance', component: Acceptance, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', items: acceptance }, beforeEach: withCriteria,
  render: (a) => <div style={{ maxWidth: 760 }}><Acceptance {...a} /></div> } satisfies Meta<typeof Acceptance>
export default meta
type Story = StoryObj<typeof meta>

/** Built as the task went: two the prototype showed, one it did not (with what is missing), one nobody tried and with no way to check it yet. */
export const Criteria: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('1 not shown in the prototype')).toBeInTheDocument()
    await expect(c.getByText('No way to check it yet')).toBeInTheDocument()
    await expect(c.getByText(/Prototype, missing: The retry runs/)).toBeInTheDocument()
    await expect(c.getByText(/Build, missing: scripts\/charge-twice\.sh prints two charges/)).toBeInTheDocument()
  },
}
/** Two marks on each: the prototype's and the final build's. The person sets the build's with a click: not checked, met, not met. */
export const BuildMark: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByLabelText(/^Prototype: The prototype showed it/, { selector: 'li:first-child *' })).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /Final build: Not checked against the final build yet \(A customer with no saved card/ }))
    await expect(await c.findByRole('button', { name: /Final build: The final build meets it \(A customer with no saved card/ })).toBeInTheDocument()
  },
}
/** None yet: says what approving the brief would then mean. */
export const NoneYet: Story = { args: { items: [] } }
/** The person adds one of their own. */
export const AddOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(c.getByLabelText('New criterion'), 'Works on a phone (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('Works on a phone (sample)')).toBeInTheDocument()
    await expect(c.getByLabelText('New criterion')).toHaveValue('')
  },
}
/** Rewording one, and saying how it will be checked. */
export const EditOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: /Edit: A customer sees only their own/ }))
    await userEvent.type(c.getByLabelText('How we will know'), 'Signed in as two customers (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByText('How we will know: Signed in as two customers (sample)')).toBeInTheDocument()
    await expect(c.queryByText('No way to check it yet')).not.toBeInTheDocument()
  },
}
/** One left to the final build: marked, with why, and not counted against the prototype. The person can mark one too. */
export const FinalBuildOnly: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('1 for the final build only')).toBeInTheDocument()
    await expect(c.getByText(/Final build only: the prototype skips it\. Copy, not behaviour/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /Edit: A customer sees only their own/ }))
    await userEvent.click(c.getByRole('checkbox', { name: /For the final build only/ }))
    await userEvent.type(c.getByLabelText('Why the prototype skips it'), 'Needs the real identity service (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByText('2 for the final build only')).toBeInTheDocument()
    await expect(c.getByText(/Needs the real identity service \(sample\)/)).toBeInTheDocument()
  },
}
/** The brief is already approved: a change here asks for the approval again, and says so. */
export const AfterApproval: Story = { args: { approved: true } }
