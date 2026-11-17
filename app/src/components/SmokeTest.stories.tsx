import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { addressOf, goable, SmokeTest } from './SmokeTest'
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

/** An app tried on a preview of each pull request (a library's installable build): this task's pull request, and its address. */
export const OnAPreview: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'preview', says: 'on a preview of its own pull request, at that pull request\'s address', url: 'https://pkg.pr.new/sample@12', up: true, running: null, canRun: false, pr: { number: 12, url: 'https://github.test/sample/pull/12' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'https://pkg.pr.new/sample@12')
    await expect(c.getByText(/The preview of pull request #12/)).toBeInTheDocument()
  },
}
/** The same, before the task has a pull request: it says so, and when one is opened. */
export const NoPullRequestYet: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'preview', says: 'on a preview of its own pull request', url: null, up: false, running: null, canRun: false, pr: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/this task has no pull request yet/)).toBeInTheDocument() },
}

/** A check whose place is said in words, not an address (made up): it is shown as it is, and there is no "Go there" to a broken page. */
export const WhereInWords: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, owed: 1, checks: [{ id: 'ac_s9', text: 'The install line in the pull request works (sample)', where: 'the first pull request on GitHub, once the app is installed (sample)', how: 'Copy the line from the bot\'s comment into a fresh app: it should install and draw a diagram (sample)', mark: 'todo' }] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/the first pull request on GitHub, once the app is installed/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Go there' })).toBeNull()
    await expect([goable('/checkout'), goable('edges-tunnel--default'), goable('https://pkg.pr.new/sample@12'), goable('the first pull request on GitHub'), goable('Diagram/Edges in 3D'), goable(undefined)]).toEqual([true, true, true, false, false, false])
    await expect(addressOf('http://localhost:6500', 'the first pull request')).toBe('http://localhost:6500')
  },
}

const mixed = [
  { ...smokeSample.checks[0], when: 'here' as const },
  { id: 'ac_s8', text: 'The preview comment has an install line that works (sample)', when: 'pr' as const, where: 'the pull request on GitHub (sample)', how: 'Copy the line from the bot\'s comment into a fresh app: it should install and draw a diagram (sample)', mark: 'todo' as const },
  { id: 'ac_s9', text: 'The release notes name it (sample)', when: 'after' as const, how: 'Open the next release on GitHub: this change is in its list (sample)', mark: 'todo' as const },
]
/** Checks that can be done at different times: here now; on the pull request, which is not open yet, so those wait; after the merge, which hold nothing. */
export const AtDifferentTimes: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: mixed, owed: 2, pr: null } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('group', { name: 'Here, on the built code' })).toBeInTheDocument()
    const onPr = within(c.getByRole('group', { name: 'On the pull request' }))
    await expect(onPr.getByText(/this task has none yet/)).toBeInTheDocument()
    await expect(onPr.getByRole('button', { name: 'Pass' })).toBeDisabled() // nothing to look at until there is one
    await expect(within(c.getByRole('group', { name: 'After it is merged' })).getByText(/do not hold the task/)).toBeInTheDocument()
    await expect(within(c.getByRole('group', { name: 'Here, on the built code' })).getByRole('button', { name: 'Pass' })).toBeEnabled()
  },
}
/** The same once the pull request is open: its checks can be done, with a link to it. */
export const PullRequestOpen: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: mixed, owed: 2, pr: { number: 12, url: 'https://github.test/sample/pull/12' } } }),
  play: async ({ canvasElement }) => {
    const onPr = within(await within(canvasElement).findByRole('group', { name: 'On the pull request' }))
    await expect(onPr.getByRole('link', { name: 'Pull request #12' })).toHaveAttribute('href', 'https://github.test/sample/pull/12')
    await expect(onPr.getByRole('button', { name: 'Pass' })).toBeEnabled()
  },
}

/** An app with a set-up of its own (a script, a seed): it can be started from nothing, before it runs and while it does. */
export const StartClean: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, url: null, up: false, running: null, canClean: true } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Start clean' }))
    await expect(await c.findByRole('button', { name: 'Stop' })).toBeInTheDocument() // it is up
    await expect(c.getByRole('button', { name: 'Start clean' })).toBeEnabled() // and can be started from nothing again
  },
}
