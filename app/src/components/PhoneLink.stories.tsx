import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PhoneLinkView } from './PhoneLink'

// The rail's phone: a code to scan so the page opens on a phone, and a dot while another device has it open.
// Everything here is made up: the address and the devices are samples.
const meta = { title: 'Components/PhoneLink', component: PhoneLinkView, parameters: { layout: 'fullscreen', router: false },
  args: { tailscale: 'ready', address: 'https://made-up.tail0000.ts.net', remote: false, devices: [], open: true, onServe: fn(), onStop: fn() },
  decorators: [(Story) => <div style={{ height: 420, display: 'flex' }}><nav className="rail"><div className="rail-end"><Story /></div></nav></div>] } satisfies Meta<typeof PhoneLinkView>
export default meta
type Story = StoryObj<typeof meta>

/** Nothing has it open: the code to scan, and the address to copy. */
export const ScanToOpen: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('img', { name: /made-up\.tail0000/ })).toBeVisible()
    await expect(c.getByRole('button', { name: 'Copy the address' })).toBeVisible()
  },
}
/** A phone has the page open: the dot on the icon, and its name. */
export const APhoneIsHere: Story = {
  args: { devices: [{ ip: '100.101.1.2', name: 'Made-up phone', kind: 'phone', since: '2026-11-18T18:00:00Z' }] },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText('Made-up phone')).toBeVisible() },
}
/** Two devices at once. */
export const TwoDevices: Story = { args: { devices: [{ ip: '100.101.1.2', name: 'Made-up phone', kind: 'phone', since: '2026-11-18T18:00:00Z' }, { ip: '100.101.1.3', name: 'Made-up laptop', kind: 'computer', since: '2026-11-18T18:04:00Z' }] } }
/** As the rail shows it until hovered: only the icon and its dot. */
export const Closed: Story = { args: { open: false, devices: [{ ip: '100.101.1.2', name: 'Made-up phone', kind: 'phone', since: '2026-11-18T18:00:00Z' }] } }
/** On the phone itself: no code to scan, only who else has it open. */
export const OnThePhone: Story = { args: { remote: true, devices: [{ ip: '100.101.1.3', name: 'Made-up laptop', kind: 'computer', since: '2026-11-18T18:04:00Z' }] } }
/** Tailscale is on this computer but the page is not on it yet: one press starts it. */
export const NotStarted: Story = {
  args: { address: null },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(canvasElement.querySelector('.phone-on')!) // the icon carries the same name
    await expect(args.onServe).toHaveBeenCalled()
  },
}
/** While it starts. */
export const Starting: Story = { args: { address: null, busy: true } }
/** The Tailscale account has not allowed it yet: where to allow it, then press again. */
export const AllowItOnce: Story = { args: { address: null, enable: 'https://login.tailscale.com/f/serve?node=madeup' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole('link', { name: 'allow it there' })).toBeVisible() } }
/** Started: Turn off takes it off the network again. */
export const TurnOff: Story = { play: async ({ canvasElement, args }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: 'Turn off' })); await expect(args.onStop).toHaveBeenCalled() } }
/** Tailscale is installed but signed out or stopped. */
export const TailscaleOff: Story = { args: { tailscale: 'off', address: null } }
/** No Tailscale on this computer and nobody here: nothing is shown. */
export const NotSetUp: Story = { args: { tailscale: 'missing', address: null }, play: async ({ canvasElement }) => { await expect(canvasElement.querySelector('[data-component="PhoneLink"]')).toBeNull() } }
