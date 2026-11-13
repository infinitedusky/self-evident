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
/** In a narrow column: the address and the server's buttons on one row, the device widths and the data on the next. Nothing hides or overlaps. */
export const Narrow: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const stop = await c.findByRole('button', { name: 'Stop its server' })
    const phone = c.getByRole('button', { name: 'Phone' })
    await expect(phone).toBeVisible()
    await expect(phone.getBoundingClientRect().top).toBeGreaterThanOrEqual(stop.getBoundingClientRect().bottom)
    const bar = canvasElement.querySelector('.preview-bar')!
    await expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth)
  },
}
/** At a phone's width. */
export const Phone: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Phone' }))
    await expect(canvasElement.querySelector('iframe')?.style.width).toBe('390px')
  },
}
/** Its made-up data: built from a scenario; pick another, rebuild it, or save it as it is now. */
export const ItsData: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('combobox', { name: 'Scenario' })).toHaveValue('default')
    await userEvent.click(c.getByRole('button', { name: 'Save the data' }))
    await expect(c.getByRole('textbox', { name: 'Scenario name' })).toBeInTheDocument()
  },
}
/** An app with no database set: no data control. */
export const NoDatabase: Story = { args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [{ ...running, database: null, scenarios: [] }] }) }
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
