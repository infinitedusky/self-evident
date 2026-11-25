import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Rail } from './Rail'

// The loop as icons. `here` is the tab in front; hovering an icon shows its name; nothing sits under it.
const meta = { title: 'Components/Rail', component: Rail, parameters: { layout: 'fullscreen', router: false }, args: { here: '/', onOpen: fn(), agentOpen: true, onToggleAgent: fn(), appsOpen: true, onToggleApps: fn() },
  decorators: [(Story) => <div style={{ height: 560, display: 'flex' }}><Story /></div>] } satisfies Meta<typeof Rail>
export default meta
type Story = StoryObj<typeof meta>

export const OnMyStuff: Story = {}
/** Deep in Plan: a task in front lights Plan. */
export const OnATask: Story = { args: { here: '/tasks/iss_sample5' } }
/** A task's Build section lights Build, not Plan: after the plan, it is the build phase. */
export const OnATasksBuild: Story = { args: { here: '/tasks/iss_sample5/build' } }
/** A prototype in front lights Plan too: it's a step on a task, inside Plan. */
export const OnAPrototype: Story = { args: { here: 'prototype:proto_sample1' } }
export const AgentFolded: Story = { args: { agentOpen: false } }
/** The chevron at the top shows or hides the apps strip; here the strip is hidden. */
export const AppsHidden: Story = { args: { appsOpen: false, onToggleApps: fn() } }
/** Docs is below the rule, next to My Stuff: the app's docs site, opened as a page. */
export const OnDocs: Story = {
  args: { here: '/docs' },
  play: async ({ canvasElement, args }) => {
    const docs = within(canvasElement).getByRole('button', { name: 'Docs' })
    await expect(docs).toHaveClass('active')
    await userEvent.click(docs)
    await expect(args.onOpen).toHaveBeenCalledWith({ kind: 'page', path: '/docs' })
  },
}
