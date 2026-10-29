import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Rail } from './Rail'

// The loop as icons. `here` is the tab in front; hovering an icon shows its name; nothing sits under it.
const meta = { title: 'Components/Rail', component: Rail, parameters: { layout: 'fullscreen', router: false }, args: { here: '/', onOpen: fn(), agentOpen: true, onToggleAgent: fn() },
  decorators: [(Story) => <div style={{ height: 560, display: 'flex' }}><Story /></div>] } satisfies Meta<typeof Rail>
export default meta
type Story = StoryObj<typeof meta>

export const OnMyStuff: Story = {}
/** Deep in Plan: an issue in front lights Plan. */
export const OnAnIssue: Story = { args: { here: '/issues/iss_sample5' } }
/** A prototype in front lights Plan too: it's a step on a task, inside Plan. */
export const OnAPrototype: Story = { args: { here: 'prototype:proto_sample1' } }
export const AgentFolded: Story = { args: { agentOpen: false } }
