import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PrototypeCode } from './PrototypeCode'
import { withEngine } from '../stories/mock-engine'
import { prototypeCode, sampleApp } from '../stories/sample'

// A prototype's code, beside it running: what it changed, and what the agent put there to answer a question.
// All made up: three changed files of a sample shop, one file and one docs page shown by the agent.
const meta = { title: 'Components/PrototypeCode', component: PrototypeCode, parameters: { layout: 'padded' }, args: { id: 'proto_sample1', appId: sampleApp.id },
  render: (a) => <div style={{ height: 560, display: 'flex', flexDirection: 'column' }}><PrototypeCode {...a} /></div> } satisfies Meta<typeof PrototypeCode>
export default meta
type Story = StoryObj<typeof meta>
const changesOnly = withEngine({ prototypeCode: { ...prototypeCode, shown: [] } })

/** What changed: the first file's diff, with the lines taken out and put in. */
export const Changes: Story = {
  beforeEach: changesOnly,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/3 files/)).toBeInTheDocument()
    await expect(await c.findByText('# One-tap checkout (sample)')).toBeInTheDocument() // a new file is all additions
    await userEvent.click(c.getByRole('button', { name: /submit\.ts/ }))
    await expect(await c.findByText(/retries: 0/)).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('tr.add')).toHaveLength(3)
    await expect(canvasElement.querySelectorAll('tr.del')).toHaveLength(2)
  },
}
/** A changed file, whole, as it is now. */
export const WholeFile: Story = {
  beforeEach: changesOnly,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /submit\.ts/ }))
    await userEvent.click(await c.findByRole('button', { name: 'Whole file' }))
    await expect(c.queryByText(/retries: 0/)).not.toBeInTheDocument()
    await expect(c.getByText(/retries: 1/)).toBeInTheDocument()
  },
}
/** The agent answered a question by showing a file the prototype did not change: its note on top, the lines it means highlighted. */
export const AgentShowsAFile: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/the saved card is read here/)).toBeInTheDocument()
    await expect(c.getByText('not changed by the prototype')).toBeInTheDocument()
    await expect(await c.findByText(/vault\.find/)).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('tr.hl')).toHaveLength(3)
  },
}
/** Asked to look at one thing the agent just showed (the page's ?shown=): that one is selected. Here a docs page, in a frame with the way out. */
export const AgentShowsADocsPage: Story = {
  args: { focus: 'shown_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: /Open in a browser tab/ })).toHaveAttribute('href', 'https://example.com/docs/payment-intents')
    await expect(c.getByText(/why one call can both save the card and charge it/)).toBeInTheDocument()
  },
}
/** Taking something the agent showed out of the list. */
export const RemoveShown: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Remove web/checkout/payment.ts' }))
    await expect(await c.findByRole('link', { name: /Open in a browser tab/ })).toBeInTheDocument() // the next thing shown
    await expect(c.queryByRole('button', { name: 'Remove web/checkout/payment.ts' })).not.toBeInTheDocument()
  },
}
/** A doc the prototype added, read as a page. */
export const DocAsAPage: Story = {
  beforeEach: changesOnly,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'As a page' }))
    await expect(await c.findByRole('heading', { name: 'One-tap checkout (sample)' })).toBeInTheDocument()
  },
}
/** Nothing changed yet, nothing shown. */
export const NothingYet: Story = { beforeEach: withEngine({ prototypeCode: { ...prototypeCode, files: [], shown: [] } }) }
