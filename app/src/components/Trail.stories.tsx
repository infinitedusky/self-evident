import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Nav, useTrail, onThisHost } from './Trail'

/** One view's bar, alone: where it is, and its way back and forward. Made-up addresses (sample). */
function One({ of }: { of?: string }) {
  const t = useTrail()
  const [home] = useState('http://localhost:6123')
  const src = t.at ?? `${home}/orders`
  return (
    <div className="preview-bar">
      <Nav t={t} home={home} src={src} of={of} /><span className="faint mono" data-testid="at">{src}#{t.reloads}</span>
      {/* What the view would say of itself, through the engine's proxy: pressed here, as there is no view in a story. */}
      <button className="btn quiet small" onClick={() => t.seen(`${home}/login`, true)}>View redirected to /login</button>
      <button className="btn quiet small" onClick={() => t.seen(`${home}/orders/7`, false)}>View went to /orders/7</button>
    </div>
  )
}
const meta = { title: 'Components/Trail', component: One } satisfies Meta<typeof One>
export default meta
type Story = StoryObj<typeof meta>

/** Sent somewhere, then back, forward and reloaded. */
export const BackAndForward: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: 'Back' })).toBeDisabled()
    const address = c.getByRole('textbox', { name: 'Address' })
    await userEvent.clear(address); await userEvent.type(address, 'orders/42 (sample){Enter}')
    await expect(c.getByTestId('at')).toHaveTextContent('http://localhost:6123/orders/42 (sample)#0')
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await expect(c.getByTestId('at')).toHaveTextContent('http://localhost:6123/orders#0')
    await userEvent.click(c.getByRole('button', { name: 'Forward' }))
    await expect(address).toHaveValue('/orders/42 (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Reload' }))
    await expect(c.getByTestId('at')).toHaveTextContent('#1')
  },
}
/** Beside another view, each button says whose it is. */
export const Named: Story = { args: { of: 'main' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole('button', { name: 'Back (main)' })).toBeInTheDocument() } }
/** A link pressed inside the view: the address follows, and back goes where it was. A redirect is not a step. */
export const FollowsTheView: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const address = c.getByRole('textbox', { name: 'Address' })
    await userEvent.click(c.getByRole('button', { name: 'View redirected to /login' }))
    await expect(address).toHaveValue('/login')
    await expect(c.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.click(c.getByRole('button', { name: 'View went to /orders/7' }))
    await expect(address).toHaveValue('/orders/7')
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await expect(c.getByTestId('at')).toHaveTextContent('http://localhost:6123/login#0')
    await expect(c.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.click(c.getByRole('button', { name: 'Forward' }))
    await expect(address).toHaveValue('/orders/7')
  },
}

/** The frame is asked for by the name the page itself is open under: at 127.0.0.1 a frame on "localhost" is another site to the browser, and the app in it loses its cookies. An address that is not this computer is left as it is. */
export const TheFrameIsOnThePagesHost: Story = {
  play: async () => {
    await expect(onThisHost('http://localhost:61575', '127.0.0.1')).toBe('http://127.0.0.1:61575')
    await expect(onThisHost('http://localhost:61575', 'localhost')).toBe('http://localhost:61575')
    await expect(onThisHost('http://127.0.0.1:61575', 'localhost')).toBe('http://localhost:61575')
    await expect(onThisHost('http://localhost:61575', 'my-mac.example')).toBe('http://localhost:61575')
    await expect(onThisHost('https://preview.example', '127.0.0.1')).toBe('https://preview.example')
    await expect(onThisHost(null, '127.0.0.1')).toBeNull()
  },
}
