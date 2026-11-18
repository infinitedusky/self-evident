import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { SmokeTerminal } from './SmokeTerminal'
import { withEngine } from '../stories/mock-engine'
import { smokeSample } from '../stories/sample'

// The smoke test's terminal. All made up: the shell here is a few canned lines, and what is typed is said back.
const meta = { title: 'Components/SmokeTerminal', component: SmokeTerminal, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', setup: 'main', tall: true },
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'terminal', url: null, up: false, canRun: false, terminal: { folder: 'temp', open: false } } }),
  render: (a) => <div style={{ maxWidth: 800 }}><SmokeTerminal {...a} /></div> } satisfies Meta<typeof SmokeTerminal>
export default meta
type Story = StoryObj<typeof meta>

const said = (el: HTMLElement) => el.querySelector('.xterm-rows')?.textContent ?? ''

/** Open in a new empty folder: it says where it is, and shows what the shell has said. */
export const InANewFolder: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(said(canvasElement)).toContain('added 1 package (sample)'))
    await expect(canvasElement.textContent).toContain('A new empty folder')
  },
}
/** A check's command, sent with a press: it is typed in and runs. */
export const ACommandSent: Story = {
  args: { send: { n: 1, text: 'npm ls bonkei\r' } },
  play: async ({ canvasElement }) => { await waitFor(() => expect(said(canvasElement)).toContain('npm ls bonkei')) },
}
