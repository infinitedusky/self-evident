import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { InstanceSwitchView } from './InstanceSwitch'

/** The way from one Evident on this computer to the other, in the rail. Made-up addresses (sample). */
const here = { name: 'This computer', kind: 'local' as const, url: 'http://localhost:5181', database: 'aaaa1111bbbb', beside: true }
const meta = { title: 'Components/InstanceSwitch', component: InstanceSwitchView, parameters: { layout: 'padded', router: false },
  args: { here, other: { up: true, name: 'Shared', kind: 'shared', url: 'http://localhost:5180', same: false }, open: true, known: false },
  decorators: [(Story) => <div className="rail" style={{ height: 260, width: 52, position: 'relative' }}><div className="rail-end"><Story /></div></div>] } satisfies Meta<typeof InstanceSwitchView>
export default meta
type Story = StoryObj<typeof meta>

/** Both are up: this one is named, and the other is one press away, at its own address. */
export const BothUp: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: 'This Evident: This computer. Switch to Shared' })).toBeInTheDocument()
    await expect(c.getByText(/its own database, on this computer/)).toBeInTheDocument()
    const go = c.getByRole('link', { name: 'Switch to Shared' })
    await expect(go).toHaveAttribute('href', 'http://localhost:5180')
    await expect(go).not.toHaveAttribute('target') // the same window: it is a switch, not a second tab
  },
}

/** In the shared one, the way back to this computer's own. */
export const FromShared: Story = {
  args: { here: { name: 'Shared', kind: 'shared', url: 'http://localhost:5180', database: 'cccc2222dddd', beside: false }, other: { up: true, name: 'This computer', kind: 'local', url: 'http://localhost:5181', same: false } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/a database shared with your other computers/)).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'Switch to This computer' })).toHaveAttribute('href', 'http://localhost:5181')
  },
}

/** The other one is not running: no link, and what starts it. Shown because this one was started beside another. */
export const OtherNotRunning: Story = {
  args: { other: { up: false, name: 'Shared', kind: 'shared', start: 'pnpm arrive' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Shared is not running/)).toBeInTheDocument()
    await expect(c.getByText('pnpm arrive')).toBeInTheDocument()
    await expect(c.queryByRole('link')).toBeNull()
  },
}

/** Both engines turn out to be on one database: said plainly, since both would schedule and build. */
export const OneDatabaseTwice: Story = {
  args: { other: { up: true, name: 'Shared', kind: 'shared', url: 'http://localhost:5180', same: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(/Both are on the same database. Stop one of them/)
  },
}

/** One Evident, and no other ever seen: nothing is shown, so a computer with one database has no button about a second. */
export const OnlyOne: Story = {
  args: { here: { ...here, beside: false }, other: { up: false, name: 'Shared', kind: 'shared', start: 'pnpm arrive' } },
  play: async ({ canvasElement }) => { await expect(canvasElement.querySelector('[data-component="InstanceSwitch"]')).toBeNull() },
}

/** The other was up before and is not now (this browser remembers): the button stays, saying how to bring it back. */
export const OtherWentAway: Story = {
  args: { here: { ...here, beside: false }, other: { up: false, name: 'This computer', kind: 'local', start: 'pnpm local' }, known: true },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText('pnpm local')).toBeInTheDocument() },
}
