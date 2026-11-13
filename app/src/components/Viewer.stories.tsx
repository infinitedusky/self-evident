import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Viewer } from './Viewer'
import { withEngine } from '../stories/mock-engine'
import { prototypes } from '../stories/sample'

// The viewer for sketches, mockups and a prototype, with its way out to a browser tab. Made up: the sample engine's
// sketches (two files) and a Storybook that is not running.
const meta = { title: 'Components/Viewer', component: Viewer, parameters: { layout: 'padded' }, args: { tab: { kind: 'sketch', session: 'sess_sample' } },
  render: (a) => <div style={{ height: 620 }}><Viewer {...a} /></div> } satisfies Meta<typeof Viewer>
export default meta
type Story = StoryObj<typeof meta>

/** Sketches where the work is: Detach opens them in a browser tab of their own. */
export const Sketches: Story = {}
/** On a step's page: no heading of its own, only the controls. */
export const Embedded: Story = { args: { embedded: true } }
/** Detached: the place it left says where it went, and brings it back. */
export const Detached: Story = { args: { detached: true } }
/** Mockups: the task's Storybook, here not running yet. */
export const MockupsNotRunning: Story = { args: { tab: { kind: 'storybook', session: 'sess_sample' } } }
/** A prototype, detached. */
export const PrototypeDetached: Story = { args: { tab: { kind: 'prototype', id: 'proto_sample' }, detached: true } }
/** A running prototype on a step's page (the "prototype" is one of these stories): Detach sits after the server's buttons, over none of them. */
const running = { ...prototypes[0], url: window.location.origin }
export const PrototypeEmbedded: Story = {
  args: { tab: { kind: 'prototype', id: running.id, path: '/iframe.html?id=pages-now--quiet&viewMode=story' }, embedded: true },
  beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const stop = await c.findByRole('button', { name: 'Stop its server' })
    const detach = c.getByRole('button', { name: /Detach/ })
    await expect(detach.getBoundingClientRect().left).toBeGreaterThanOrEqual(stop.getBoundingClientRect().right)
  },
}
