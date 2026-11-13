import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Share } from './Share'
import { withEngine } from '../stories/mock-engine'
import { prototypes, sampleApp } from '../stories/sample'

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
/**
 * ngrok's one free address is held by another tunnel on this computer (here a login service, made up): the panel names
 * it, says what freeing it does, and one press stops it and makes the link.
 */
export const FreeUpNgrok: Story = {
  args: { open: true }, beforeEach: withEngine({ ngrokHolders: [{ pid: 1172, what: 'http 3000', service: 'com.sample.ngrok-tunnel' }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Make the link' }))
    await expect(await c.findByText(/A service is put back when you stop sharing/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Free up ngrok and make the link' }))
    await expect(await c.findByLabelText('The public link')).toHaveValue('https://sample-made-up.ngrok-free.dev')
  },
}
/** The tunnel holding ngrok's address is on another computer: nothing here to free, and it says so. */
export const NgrokHeldElsewhere: Story = {
  args: { open: true }, beforeEach: withEngine({ ngrokHolders: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Make the link' }))
    await expect(await c.findByText(/the tunnel holding its address is on another one/)).toBeInTheDocument()
  },
}
/** A prototype with a guide for whoever opens the link: the panel shows what they will be told. */
export const WithAGuide: Story = {
  args: { open: true },
  beforeEach: withEngine({ prototypes: prototypes.map((p, i) => i === 0 ? { ...p, guide: { intro: 'A one-tap checkout. Tell us if paying felt safe (sample).', steps: [{ title: 'Pay with a saved card', path: '/checkout', try: 'Sign in as Ada (sample) and press Pay.' }, { title: 'Pay with no saved card', path: '/checkout?as=bo' }] } } : p) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Pay with a saved card')).toBeInTheDocument()
    await expect(c.getByText(/It opens with: “A one-tap checkout/)).toBeInTheDocument()
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
