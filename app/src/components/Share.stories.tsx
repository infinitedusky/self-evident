import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Share } from './Share'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// Sharing a prototype, mockups or sketches with someone outside. All made up: the address is not a real one and
// nothing is published from a story.
const live = { kind: 'prototype' as const, id: 'proto_sample1', url: 'https://sample-made-up-words.trycloudflare.com', since: '2026-10-28T10:02:00Z', expiresAt: '2026-10-28T18:02:00Z', by: 'user' }
const meta = { title: 'Components/Share', component: Share, parameters: { layout: 'padded' }, args: { kind: 'prototype', id: 'proto_sample1', appId: sampleApp.id },
  render: (a) => <div style={{ height: 300, display: 'flex', justifyContent: 'flex-end' }}><Share {...a} /></div> } satisfies Meta<typeof Share>
export default meta
type Story = StoryObj<typeof meta>

/** Not shared: one quiet button. */
export const NotShared: Story = {}
/** Pressed: it says what sharing does before it does it, then makes the link. */
export const MakeTheLink: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Share…' }))
    await expect(c.getByText(/Anyone who has the link can open it, with the sample data in it; no sign-in/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Make the link' }))
    await expect(await c.findByLabelText('The public link')).toHaveValue('https://sample-made-up-words.trycloudflare.com')
    await expect(c.getByRole('button', { name: '● Shared' })).toBeInTheDocument()
  },
}
/** Shared: the button says so; the panel has the link, when it ends, and the way to stop. */
export const Shared: Story = { args: { open: true }, beforeEach: withEngine({ shares: { 'prototype:proto_sample1': live } }) }
/** Through ngrok, because this network blocks Cloudflare's tunnel: the panel says so, and what that means for the visitor. */
export const ThroughNgrok: Story = {
  args: { open: true }, beforeEach: withEngine({ shares: { 'prototype:proto_sample1': { ...live, url: 'https://sample-made-up.ngrok-free.dev', via: 'ngrok' } } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/Through ngrok, since this network blocks Cloudflare's tunnel/)).toBeInTheDocument() },
}
/** Stopping: the link is dead at once and the button goes quiet. */
export const StopSharing: Story = {
  args: { open: true }, beforeEach: withEngine({ shares: { 'prototype:proto_sample1': live } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Stop sharing' }))
    await expect(await c.findByRole('button', { name: 'Share…' })).toBeInTheDocument()
  },
}
/** Sketches: the same, in their words. */
export const Sketches: Story = { args: { kind: 'sketch', id: 'sess_sample', open: true } }
/** Neither tunnel could be used: Cloudflare's is blocked here and ngrok's one free address is taken. It says what to stop. */
export const BothBlocked: Story = {
  args: { open: true }, beforeEach: withEngine({ shareError: 'this network does not let the Cloudflare tunnel connect: it blocks outbound port 7844, which the tunnel uses. A managed laptop or a work network often does. Another network works, or ask for that port to be allowed. Tried ngrok instead: ngrok\'s address is already in use: another ngrok tunnel is running on this account, and a free account has one address. Stop that tunnel (or what is shared now), or use a paid ngrok plan, then share again.' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Make the link' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('another ngrok tunnel is running on this account')
  },
}
/** It could not be made: the tunnel is not installed on this computer; says what to do. */
export const NotInstalled: Story = {
  args: { open: true }, beforeEach: withEngine({ shareError: 'cloudflared is not installed on this computer: sharing uses a Cloudflare quick tunnel. Install it (brew install cloudflared), then share again. No account is needed.' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Make the link' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('brew install cloudflared')
  },
}
