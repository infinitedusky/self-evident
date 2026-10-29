import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PrototypePane } from './PrototypePane'
import { withEngine } from '../stories/mock-engine'
import { apps, prototypes, sampleApp } from '../stories/sample'

// A prototype, in a tab: the actual thing built fast in its own worktree. All made up. The "running prototype" is one
// of these stories, served by Storybook itself.
const running = { ...prototypes[0], url: window.location.origin }
const at = '/iframe.html?id=pages-now--quiet&viewMode=story'
const meta = { title: 'Components/PrototypePane', component: PrototypePane, parameters: { layout: 'fullscreen', router: false }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof PrototypePane>
export default meta
type Story = StoryObj<typeof meta>

/** No prototype picked: this app's prototypes, newest first. */
export const List: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Sample: one-tap checkout')).toBeInTheDocument()
    await expect(c.getByText('Stopped')).toBeInTheDocument()
  },
}
/** None yet: says how one starts. */
export const NoneYet: Story = { beforeEach: withEngine({ prototypes: [] }) }
/** None yet, and the app has no prototype command: says the agent works it out. */
export const NoCommand: Story = { beforeEach: withEngine({ prototypes: [], apps: apps.map((a) => a.id === sampleApp.id ? { ...a, setup: { ...a.setup, prototype_cmd: undefined } } : a) }) }
/** Running and answering: the app in a frame with an address bar and device widths. */
export const Running: Story = { args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }) }
/** At a phone's width. */
export const Phone: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Phone' }))
    await expect(canvasElement.querySelector('iframe')?.style.width).toBe('390px')
  },
}
/** Its server is starting: the last lines it printed. */
export const Starting: Story = {
  args: { id: running.id },
  beforeEach: withEngine({ prototypes: [{ ...running, up: false, log: ['> sample-shop@0.0.0 dev', '> vite --port 51234', 'Installing dependencies…'] }] }),
}
/** Stopped (the engine restarted, or someone stopped it): a way to start it again. */
export const Stopped: Story = {
  args: { id: prototypes[1].id },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Start it' })).toBeInTheDocument()
  },
}
