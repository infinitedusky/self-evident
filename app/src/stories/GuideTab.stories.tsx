import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'
import { WIDGET } from '@self-evident/engine/guide-widget'
import { withEngine } from './mock-engine'

// The tab a visitor sees at the bottom right of a shared prototype: what this is, where to go, what to try, and a box
// for what they think. It is not part of Self Evident's own screens: the engine adds it to the prototype's pages on
// the way out (engine/src/share-guide.ts). Here it runs over a made-up page, with a made-up guide; nothing is sent.
const KEY = 'self-evident-guide'
const tab = () => document.querySelector('[data-self-evident-guide]')?.shadowRoot as ShadowRoot | undefined

function Page() {
  useEffect(() => {
    const w = window as unknown as { __selfEvidentGuide?: boolean; __selfEvidentGuideFramed?: boolean }
    w.__selfEvidentGuide = false; w.__selfEvidentGuideFramed = true // a story runs in a frame, where the tab would otherwise stay away
    new Function(WIDGET)()
    return () => { document.querySelector('[data-self-evident-guide]')?.remove(); w.__selfEvidentGuide = false }
  }, [])
  return <div style={{ height: 640, padding: 32, background: '#101216', color: '#fff', font: '16px system-ui' }}><h1 style={{ fontSize: 28 }}>Sample Shop checkout (a made-up prototype)</h1><p>The page being looked at. The tab sits over it, at the bottom right.</p></div>
}

const guide = { intro: 'A one-tap checkout for returning customers. Tell us if paying felt safe (sample).', steps: [
  { title: 'Pay with a saved card', path: '/checkout', try: 'Sign in as Ada (sample) and press Pay. It should take one tap.' },
  { title: 'Pay with no saved card', path: '/checkout?as=bo', try: 'You should get the old form, card number and all.' },
  { title: 'Look at your order', try: 'Is it clear what you paid and when it arrives?' },
] }
const meta = { title: 'Shared/GuideTab', component: Page, parameters: { layout: 'fullscreen' },
  beforeEach: (ctx) => { try { localStorage.removeItem(KEY) } catch { /* fine */ } withEngine({ visitorGuide: { title: 'Sample: one-tap checkout', guide } })(ctx as never) } } satisfies Meta<typeof Page>
export default meta
type Story = StoryObj<typeof meta>

/** Opening the link cold: the tab is open, says what this is, and lists where to go and what to try. */
export const Guide: Story = {
  play: async () => {
    await waitFor(() => expect(tab()?.textContent).toContain('Pay with a saved card'))
    await expect(tab()!.textContent).toContain('This is a prototype with sample data')
    await expect(tab()!.querySelectorAll('a.go')).toHaveLength(2) // the steps with somewhere to go
  },
}
/** A step tried is ticked off, and stays ticked on the next page. */
export const TickedOff: Story = {
  play: async () => {
    await waitFor(() => expect(tab()?.querySelector('input[type=checkbox]')).toBeTruthy())
    await userEvent.click(tab()!.querySelector('input[type=checkbox]') as HTMLElement)
    await waitFor(() => expect(tab()!.querySelector('li.done')).toBeTruthy())
    await expect(JSON.parse(localStorage.getItem(KEY)!).done['0:Pay with a saved card']).toBe(true)
  },
}
/** Saying what they think: sent, thanked, and the box is ready for more. */
export const SendFeedback: Story = {
  play: async () => {
    await waitFor(() => expect(tab()?.querySelector('textarea')).toBeTruthy())
    const send = tab()!.querySelector('button.send') as HTMLButtonElement
    await expect(send).toBeDisabled()
    await userEvent.type(tab()!.querySelector('textarea') as HTMLElement, 'The Pay button is easy to miss (sample).')
    await userEvent.click(tab()!.querySelector('button.send') as HTMLElement)
    await waitFor(() => expect(tab()!.textContent).toContain('Sent. Thank you.'))
  },
}
/** Hidden: a small tab in the corner, out of the way. */
export const Folded: Story = {
  play: async () => {
    await waitFor(() => expect(tab()?.querySelector('button.x')).toBeTruthy())
    await userEvent.click(tab()!.querySelector('button.x') as HTMLElement)
    await waitFor(() => expect(tab()!.querySelector('button.tab')?.textContent).toBe('What to try'))
  },
}
/** No guide written yet: it still says what this is and asks what they think. */
export const NoGuideYet: Story = {
  beforeEach: (ctx) => { try { localStorage.removeItem(KEY) } catch { /* fine */ } withEngine({ visitorGuide: { title: 'Sample: one-tap checkout', guide: null } })(ctx as never) },
  play: async () => { await waitFor(() => expect(tab()?.textContent).toContain('Have a look around, and say what you think below.')) },
}
