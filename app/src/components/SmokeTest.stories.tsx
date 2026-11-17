import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { addressOf, SmokeTest } from './SmokeTest'
import { withEngine } from '../stories/mock-engine'
import { smokeSample } from '../stories/sample'

// A task's smoke test: the built code beside the checks left to a person. All made up: a diagram library's edges.
const meta = { title: 'Components/SmokeTest', component: SmokeTest, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', appId: 'app_sample', base: '/tasks/iss_sample20' },
  beforeEach: withEngine({ smoke: smokeSample }), render: (a) => <div style={{ maxWidth: 1100 }}><SmokeTest {...a} /></div> } satisfies Meta<typeof SmokeTest>
export default meta
type Story = StoryObj<typeof meta>

/** Running here: the built code on the left, three checks on the right, each with where to go and what passing looks like. */
export const ForYouToCheck: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/3 of 3 for you to check/)).toBeInTheDocument()
    await expect(c.getByText(/Not the prototype/)).toBeInTheDocument()
    await expect(c.getByTitle('The built code')).toBeInTheDocument()
    await expect(c.getAllByRole('button', { name: 'Pass' })).toHaveLength(3)
    await expect(c.queryByRole('textbox')).toBeNull() // no form until one is pressed
  },
}
/** Go there sends the view to that check's story; Fail asks what you saw and will not send without it. */
export const FailingOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: 'Go there' }))[0])
    await expect(c.getByTitle('The built code')).toHaveAttribute('src', expect.stringContaining('iframe.html?id=edges-tunnel--default'))
    await userEvent.click(c.getAllByRole('button', { name: 'Fail' })[2])
    await expect(c.getByRole('button', { name: 'Mark it failed' })).toBeDisabled()
    await userEvent.type(c.getByRole('textbox'), 'portal 22 fps, 45 without (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Mark it failed' }))
    await waitFor(() => expect(c.getByText('fail')).toBeInTheDocument())
    await expect(c.getByText(/2 of 3 for you to check/)).toBeInTheDocument()
  },
}
/** All marked, one failed: it says it was sent back, and that it comes back here. */
export const SentBack: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, owed: 1, checks: smokeSample.checks.map((x, n) => (n === 0 ? { ...x, mark: 'pass' as const, note: 'trough visible, lip outline faint (sample)' } : n === 1 ? { ...x, mark: 'pass' as const, note: '' } : x)) } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Fail' }))
    await userEvent.type(c.getByRole('textbox'), 'portal 22 fps, 45 without (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Mark it failed' }))
    await waitFor(() => expect(c.getByRole('status')).toHaveTextContent('Sent back: 1 that failed'))
  },
}
/** Back after a fix: what you said last time is beside it, and it is yours to try again. A mark made before the branch moved says so. */
export const BackAfterAFix: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, owed: 1, running: 'aaa1111aaa', head: 'bbb2222bbb', checks: [
    { ...smokeSample.checks[0], mark: 'pass', note: 'trough visible, lip outline faint (sample)', stale: true },
    { ...smokeSample.checks[2], how: 'Watch the counter again: portals now batch their draws (sample)', before: { pass: false, note: 'portal 22 fps, 45 without (sample)' } },
  ] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Last time you failed it: portal 22 fps/)).toBeInTheDocument()
    await expect(c.getByText('marked on an earlier commit')).toBeInTheDocument()
    await expect(c.getByRole('note')).toHaveTextContent('The branch has moved on')
    await expect(c.getByRole('button', { name: 'Run the new commit' })).toBeInTheDocument()
  },
}
/** Not running yet: one press starts the built code. */
export const NotRunning: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, url: null, up: false, running: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Run it' })).toBeEnabled() },
}
/** An app smoke tested on staging: nothing to start; an address to open, who to sign in as, and the same checks. */
export const OnStaging: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'staging', says: 'a deployed build at an address, with a test account', url: 'https://staging.example.test', up: true, running: null, canRun: false, account: 'the test parent (sample)' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'https://staging.example.test')
    await expect(c.getByText(/Sign in as: the test parent \(sample\)/)).toBeInTheDocument()
    await expect(c.queryByTitle('The built code')).toBeNull(); await expect(c.queryByRole('button', { name: 'Stop' })).toBeNull()
  },
}
/** Nothing was left to a person: it says so, and points to the checklist. */
export const NothingForYou: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: [], owed: 0 } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('link', { name: 'the checklist' })).toBeInTheDocument() },
}
/** Where "Go there" goes: a path, a story's id, or a whole address. */
export const Addresses: Story = {
  render: () => <ul>{[['/checkout', 'http://localhost:6500/checkout'], ['edges-tunnel--default', 'http://localhost:6500/iframe.html?id=edges-tunnel--default&viewMode=story'], ['https://staging.example.test/x', 'https://staging.example.test/x']].map(([w, want]) => <li key={w}>{w} → {addressOf('http://localhost:6500/', w)} {addressOf('http://localhost:6500/', w) === want ? '✓' : '✕'}</li>)}</ul>,
  play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByText(/✕/)).toBeNull(); await expect(addressOf('http://localhost:6500')).toBe('http://localhost:6500') },
}
