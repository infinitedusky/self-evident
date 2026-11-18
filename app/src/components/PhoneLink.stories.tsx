import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PhoneLinkView } from './PhoneLink'

// The rail's phone: a code to scan so the page opens on a phone, and a dot while another device has it open.
// Everything here is made up: the address and the devices are samples.
const meta = { title: 'Components/PhoneLink', component: PhoneLinkView, parameters: { layout: 'fullscreen', router: false },
  args: { address: 'https://made-up.tail0000.ts.net', remote: false, devices: [], open: true },
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
/** Not served over Tailscale and nobody here: nothing is shown. */
export const NotSetUp: Story = { args: { address: null }, play: async ({ canvasElement }) => { await expect(canvasElement.querySelector('[data-component="PhoneLink"]')).toBeNull() } }
