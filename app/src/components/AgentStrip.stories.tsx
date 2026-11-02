import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentStrip } from './AgentStrip'

// A made-up conversation on the made-up Sample Shop. Colours are two of the six conversation colours.
const meta = { title: 'Components/AgentStrip', component: AgentStrip,
  args: { color: 'var(--talk-1)', name: 'Remember the last address (sample)', stage: 'Mockups', state: 'working' },
  render: (a) => <div style={{ width: 345, border: '1px solid var(--line)', background: 'var(--surface)', paddingBottom: 90 }}><AgentStrip {...a} /></div> } satisfies Meta<typeof AgentStrip>
export default meta
type Story = StoryObj<typeof meta>

export const Working: Story = {}
export const WaitingOnYou: Story = { args: { stage: 'Prototype 2', state: 'waiting' } }
export const Idle: Story = { args: { stage: 'Build', state: 'idle' } }
/** A long name gives way; the stage always shows. */
export const LongName: Story = { args: { name: 'Remember the last address and offer it at checkout for returning customers (sample)', stage: 'Prototype 2' } }
/** Asked something while the first one worked: this one forked off beside it. The fork icon says from where, on hover or focus. */
export const Forked: Story = {
  args: { color: 'var(--talk-4)', name: 'Why the postcode goes missing (sample)', stage: 'Prototype 2', fork: { from: 'Remember the last address (sample)', focus: 'why the address form loses the postcode' } },
  play: async ({ canvas }) => { (await canvas.findByRole('button', { name: /Forked/ })).focus() },
}
