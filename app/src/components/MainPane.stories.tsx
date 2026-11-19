import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { MainPane } from './MainPane'
import { MAIN_OFF, withEngine } from '../stories/mock-engine'

/** The app's main, running: what is there today, beside what is being made. All of it made up (sample). */
const at = '/iframe.html?id=pages-now--quiet&viewMode=story'
const on = { ...MAIN_OFF, running: true, up: true, url: window.location.origin, sha: '4f2a9c1d0b7e', stopsAt: '2026-11-19T18:30:00Z' }
const meta = { title: 'Components/MainPane', component: MainPane, parameters: { layout: 'fullscreen', router: false }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof MainPane>
export default meta
type Story = StoryObj<typeof meta>

/** Off: what it is, one press to turn it on, and that it turns itself off. Turned on, it shows; turned off, it is back here. */
export const Off: Story = {
  args: { path: at },
  beforeEach: withEngine({ main: MAIN_OFF }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/It turns itself off after 30 minutes with nobody looking/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Turn it on' }))
    await expect(await c.findByTitle(/main$/)).toHaveAttribute('src', expect.stringContaining(at))
    await userEvent.click(c.getByRole('button', { name: 'Turn it off' }))
    await expect(await c.findByRole('button', { name: 'Turn it on' })).toBeInTheDocument()
  },
}
/** On: a browser's back, forward, reload and address; the commit it runs; a way out to a browser tab. */
export const On: Story = {
  args: { path: at },
  beforeEach: withEngine({ main: on }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('4f2a9c1')).toBeInTheDocument()
    const address = c.getByRole('textbox', { name: 'Address' })
    await userEvent.clear(address); await userEvent.type(address, '/iframe.html?id=pages-now--busy&viewMode=story{Enter}')
    await expect(c.getByTitle(/main$/)).toHaveAttribute('src', expect.stringContaining('pages-now--busy'))
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await expect(c.getByTitle(/main$/)).toHaveAttribute('src', expect.stringContaining(at))
  },
}
/** Main has moved on since it was turned on: it stays where it is, and says so, with one press to update. */
export const MainHasMoved: Story = {
  args: { path: at },
  beforeEach: withEngine({ main: { ...on, tip: '9be01c77aa10', behind: true } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Update' }))
    await expect(await c.findByText('9be01c7')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Update' })).toBeNull()
  },
}
/** Coming up: what its server last printed, and a way to turn it off again. */
export const TurningOn: Story = { beforeEach: withEngine({ main: { ...on, up: false, log: ['installing (sample)', 'building (sample)'] } }), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/building \(sample\)/)).toBeInTheDocument() } }
/** It did not come on: why, as the engine says it. */
export const WouldNotTurnOn: Story = {
  beforeEach: withEngine({ main: MAIN_OFF, mainError: 'the schema command failed (sample)' }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await userEvent.click(await c.findByRole('button', { name: 'Turn it on' })); await expect(await c.findByRole('alert')).toHaveTextContent('the schema command failed (sample)') },
}
/** With stand-ins of its own for what is outside the app. */
export const WithStandIns: Story = { args: { path: at }, beforeEach: withEngine({ main: { ...on, standIns: [{ key: 'vendor', name: 'Vendor API (sample)', what: 'The scan vendor\'s API, serving recorded responses (sample)', running: true, url: 'http://localhost:6123' }] } }), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('Vendor API (sample)')).toBeInTheDocument() } }
/** An app whose main is deployed: its address, and nothing to turn on or off. */
export const Deployed: Story = {
  args: { path: at },
  beforeEach: withEngine({ main: { ...MAIN_OFF, how: 'address', url: window.location.origin, running: true, up: true, canRun: false, tip: null, idleMinutes: null } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(await c.findByText(/Deployed\./)).toBeInTheDocument(); await expect(c.queryByRole('button', { name: 'Turn it off' })).toBeNull() },
}
/** An app with no command and no address yet: why, and where to go. */
export const CannotBeShownYet: Story = { beforeEach: withEngine({ main: { ...MAIN_OFF, how: 'none', canRun: false } }), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/has no command to start it/)).toBeInTheDocument() } }
