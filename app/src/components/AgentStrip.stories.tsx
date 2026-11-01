import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentStrip, type AgentStripProps } from './AgentStrip'

// A made-up conversation on the made-up Sample Shop, exploring an idea and then building it. Colours are two of the
// six conversation colours.
type Steps = AgentStripProps['steps']
const at = (now: string, off: string[] = []): Steps => {
  const keys = [['idea', 'Idea', 'explore'], ['mockup', 'Mockups', 'explore'], ['prototype', 'Prototype', 'explore'], ['brief', 'Brief', 'build'], ['build', 'Build', 'build']] as const
  const i = keys.findIndex(([k]) => k === now)
  return keys.map(([key, label, group], j) => ({ key, label, group, state: off.includes(key) ? 'off' : j < i ? 'done' : j === i ? 'now' : 'next' }))
}
const path = ['Sample Shop', 'Remember the last address (sample)']

const meta = { title: 'Components/AgentStrip', component: AgentStrip,
  args: { color: 'var(--talk-1)', path: [...path, 'Mockups'], steps: at('mockup'), doing: { state: 'working', text: 'writing the story `Checkout/AddressRemembered`' } },
  render: (a) => <div style={{ width: 345, border: '1px solid var(--line)', background: 'var(--surface)' }}><AgentStrip {...a} /></div> } satisfies Meta<typeof AgentStrip>
export default meta
type Story = StoryObj<typeof meta>

/** Exploring: drawing the mockups. */
export const MockingUp: Story = {}
/** Exploring: building the prototype, mockups done. */
export const Prototyping: Story = { args: { path: [...path, 'Prototype 2'], steps: at('prototype'), doing: { state: 'working', text: 'editing `web/checkout/AddressForm.tsx`' } } }
/** It needs you: a permission it can't take on its own. */
export const WaitingOnYou: Story = { args: { path: [...path, 'Prototype 2'], steps: at('prototype'), doing: { state: 'waiting', text: 'may I commit to `talk/remember-address`?' } } }
/** Past the hinge: the prototype picked, the build ran, nothing left to do. Mockups were skipped. */
export const IdleAfterBuild: Story = { args: { path: ['Sample Shop', 'Remember the last address (sample)'], steps: at('build', ['mockup']), doing: { state: 'idle', text: 'finished: 3 of 3 phases landed, PR #42 is open' } } }
/** Asked something while it worked: this conversation forked off beside it, with its own colour. */
export const Forked: Story = { args: { color: 'var(--talk-4)', path: [...path, 'Prototype 2'], steps: at('prototype'), forkedFrom: 'Remember the last address (sample)', doing: { state: 'working', text: 'looking into why the address form loses the postcode' } } }
