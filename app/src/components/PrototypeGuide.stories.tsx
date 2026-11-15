import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PrototypeGuide } from './PrototypeGuide'

// A prototype's guide beside the embedded prototype. All made up: a sample shop's one-page checkout.
const guide = {
  intro: 'A one-page checkout for a returning customer (sample).',
  steps: [
    { title: 'Pay with the saved card', path: '/checkout', try: 'Press Pay. It should finish in one tap.' },
    { title: 'Decline a card', path: '/checkout?card=declined', try: 'The error should show in place, with the form still filled.' },
    { title: 'Look at the receipt', try: 'Check the total matches the cart.' },
  ],
}
const forget = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('se.guide.')).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
const meta = { title: 'Components/PrototypeGuide', component: PrototypeGuide, args: { id: 'proto_sample1', guide, at: '/checkout', onGo: fn() }, beforeEach: forget,
  decorators: [(Story) => <div style={{ position: 'relative', height: 460, background: 'var(--ground)' }}><Story /></div>] } satisfies Meta<typeof PrototypeGuide>
export default meta
type Story = StoryObj<typeof meta>

/** Folded, as it starts: a tab in the corner of the prototype, saying how many steps were tried. */
export const Folded: Story = { play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: /What to try · 0\/3/ })).toBeInTheDocument() } }
/** Open: the steps, the one the prototype is on marked, and a way to each of the others. Going to a step moves the embedded view. */
export const Open: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /What to try/ }))
    await expect(await c.findByText('You are here')).toBeInTheDocument()
    await userEvent.click(await c.findByRole('button', { name: 'Go there →' }))
    await expect(args.onGo).toHaveBeenCalledWith('/checkout?card=declined')
    await userEvent.click(await c.findByLabelText('Tried: Look at the receipt'))
    await userEvent.click(await c.findByRole('button', { name: /What to try/ })) // fold it again
    await expect(await c.findByRole('button', { name: /What to try · 1\/3/ })).toBeInTheDocument()
  },
}
/** No guide written yet: nothing is shown over the prototype. */
export const NoGuide: Story = { args: { guide: null }, play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByText(/What to try/)).toBeNull() } }
