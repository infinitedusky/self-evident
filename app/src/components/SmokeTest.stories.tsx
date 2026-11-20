import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { addressOf, goable, SmokeTest } from './SmokeTest'
import { MAIN_OFF, withEngine } from '../stories/mock-engine'
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
    await expect(await c.findByTitle('The built code')).toBeInTheDocument() // once the engine has said whether it is shown through its proxy
    await expect(c.getAllByRole('button', { name: 'Pass' })).toHaveLength(3)
    await expect(c.queryByRole('textbox', { name: /What you saw/ })).toBeNull() // no form until one is pressed
  },
}
/** The task's head made small (sample): what this page is is left out, and the checks and the view are what's left. */
export const SmallHead: Story = {
  args: { small: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/3 of 3 for you to check/)).toBeInTheDocument()
    await expect(c.queryByText(/Not the prototype/)).toBeNull()
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
    await userEvent.type(c.getByRole('textbox', { name: /What you saw/ }), 'portal 22 fps, 45 without (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Mark it failed' }))
    await waitFor(() => expect(c.getByText('fail')).toBeInTheDocument())
    await expect(c.getByText(/2 of 3 for you to check/)).toBeInTheDocument()
  },
}
/** Skip: a check the person chooses not to try. No note is needed; it stops waiting for them and reads as skipped, never as passed. */
export const SkippingOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: 'Skip' }))[2])
    await expect(c.getByRole('textbox', { name: /Why it is skipped/ })).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Skip it' }))
    await waitFor(() => expect(c.getByText('skipped')).toBeInTheDocument())
    await expect(c.getByText(/2 of 3 for you to check/)).toBeInTheDocument()
    await expect(c.getByText('Skipped, not tried.')).toBeVisible()
  },
}
/** All marked, one failed: it says it was sent back, and that it comes back here. */
export const SentBack: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, owed: 1, checks: smokeSample.checks.map((x, n) => (n === 0 ? { ...x, mark: 'pass' as const, note: 'trough visible, lip outline faint (sample)' } : n === 1 ? { ...x, mark: 'pass' as const, note: '' } : x)) } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Fail' }))
    await userEvent.type(c.getByRole('textbox', { name: /What you saw/ }), 'portal 22 fps, 45 without (sample)')
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
/** Nothing was left to a person: it says so and points to the checklist, and the built code can still be brought up to look anyway. */
export const NothingForYou: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: [], owed: 0, url: null, up: false, running: null } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: 'the checklist' })).toBeInTheDocument()
    await expect(c.getByText(/You can still bring it up and look for yourself/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Run it' }))
    await expect(await c.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  },
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
/** A criterion the app leaves to its nightly run: listed in a group of its own, and it holds nothing. Sample data. */
export const LeftToTheNightlyRun: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: [mixed[0], { id: 'ac_s10', text: 'The whole docs smoke passes (sample)', when: 'nightly' as const, how: 'The workflow nightly.yml runs it on main every night (sample)', mark: 'todo' as const }], owed: 1 } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const night = within(await c.findByRole('group', { name: 'Left to the nightly run' }))
    await expect(night.getByText('The whole docs smoke passes (sample)')).toBeInTheDocument()
    await expect(night.getByText(/they do not hold the task/)).toBeInTheDocument()
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

/** On a staged task there is no check after the build, so the list is every criterion no agent marked: yours to pass or fail by hand. */
export const OnAStagedTask: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, staged: true } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/Every acceptance criterion no agent has marked/)).toBeInTheDocument() },
}

// A library with two set-ups (made up): its docs site, and a demo app that exercises it. Each check names the one it needs.
const side = { where: 'local' as const, says: 'run here (sample)', account: null, flag: null, running: null, url: null, up: false, canRun: true, canClean: false, log: [] }
const twoSetUps = {
  ...smokeSample, url: null, up: false, running: null, owed: 3,
  setups: [{ ...side, key: 'docs', name: 'Docs site (sample)', what: 'The documentation, to see it is accurate (sample)', owed: 1 }, { ...side, key: 'playground', name: 'Playground (sample)', what: 'The library, exercised with every setting (sample)', owed: 2 }],
  checks: [
    { id: 'ac_d1', text: 'The Edges page names the new tunnel prop (sample)', setup: 'docs', when: 'here' as const, where: '/docs/edges', how: 'Open the Edges page: the prop table lists tunnel with its default (sample)', mark: 'todo' as const },
    { id: 'ac_p1', text: 'The tunnel reads as a tunnel (sample)', setup: 'playground', when: 'here' as const, how: 'Switch Tunnel on and drag a node across it (sample)', mark: 'todo' as const },
    { id: 'ac_p2', text: 'Portals keep 40 frames a second (sample)', setup: 'playground', when: 'here' as const, how: 'Switch Portals on and watch the counter (sample)', mark: 'todo' as const },
  ],
}
/** Two set-ups: one is shown at a time, with only the checks that need it; each is brought up once, and both can be up. */
export const TwoSetUps: Story = {
  beforeEach: withEngine({ smoke: twoSetUps }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const tabs = within(await c.findByRole('tablist', { name: 'Set-ups' }))
    await expect(tabs.getByRole('tab', { name: /Docs site \(sample\) 1 to check/ })).toHaveAttribute('aria-selected', 'true') // the first with something to check
    await expect(c.getByText('The documentation, to see it is accurate (sample)')).toBeInTheDocument()
    await expect(c.getByText('The Edges page names the new tunnel prop (sample)')).toBeInTheDocument()
    await expect(c.queryByText('The tunnel reads as a tunnel (sample)')).toBeNull() // the playground's, not shown here
    await userEvent.click(c.getByRole('button', { name: 'Run it' }))
    await expect(await c.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
    await userEvent.click(tabs.getByRole('tab', { name: /Playground \(sample\) 2 to check/ }))
    await expect(c.getByText('The tunnel reads as a tunnel (sample)')).toBeInTheDocument()
    await expect(c.getByText('Portals keep 40 frames a second (sample)')).toBeInTheDocument()
    await expect(c.queryByText('The Edges page names the new tunnel prop (sample)')).toBeNull()
    await expect(c.getByRole('button', { name: 'Run it' })).toBeEnabled() // its own, not yet up; the docs site still is
    await expect(tabs.getByRole('tab', { name: /Docs site/ })).toHaveTextContent('●')
  },
}

/** A smoke test that is up and listening on a port it was not given (made up): said beside it. */
export const StrayPort: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, setups: [{ key: 'main', name: 'Smoke test', what: null, where: 'local', says: 'run here (sample)', account: null, flag: null, running: smokeSample.head, url: smokeSample.url, up: true, canRun: true, log: [], owed: smokeSample.owed, strayPorts: [5174], strayNote: 'It also listens on port 5174, which it chose itself. A second copy running beside it would share or fight over it. Make it follow $PORT_2 or $PORT_3, which are free and handed out with $PORT.' }] } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/port 5174, which it chose itself/)).toBeInTheDocument() },
}

const pathChecks = [
  { id: 'ac_p1', text: 'An employee can import themselves (sample)', where: '/import', how: 'Press Import and wait for the scan (sample)', mark: 'todo' as const },
  { id: 'ac_p2', text: 'Their row shows once the scan is done (sample)', where: '/employees', how: 'Your row is in the table (sample)', mark: 'todo' as const },
  { id: 'ac_p3', text: 'It feels quick (sample)', how: 'No place for this one: judge it as you go (sample)', mark: 'todo' as const },
]
/** Each check that names a place has a link to it on this run's port (made up), as a prototype's guide does; one with no place has none. */
export const LinksToEachCheck: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, staged: true, url: 'http://localhost:65487', checks: pathChecks.map((c) => (c.where ? { ...c, link: `http://localhost:65487${c.where}` } : c)) } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const link = await c.findByRole('link', { name: '/import ↗' })
    await expect(link).toHaveAttribute('href', 'http://localhost:65487/import'); await expect(link).toHaveAttribute('target', '_blank')
    await expect(c.getByRole('link', { name: '/employees ↗' })).toHaveAttribute('href', 'http://localhost:65487/employees')
    await expect(c.getAllByRole('link', { name: /↗$/ })).toHaveLength(2)
    await userEvent.click(c.getAllByRole('button', { name: 'Go there' })[0])
    await expect(await c.findByText('you are here')).toBeInTheDocument()
  },
}

/** Before it is running there is no port to link to: the path is still shown, as words (made up). */
export const PlacesBeforeItRuns: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, url: null, up: false, running: null, checks: pathChecks } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('/import')).toBeInTheDocument()
    await expect(c.getAllByText('a link once it is running')).toHaveLength(2)
    await expect(c.queryByRole('link', { name: /↗$/ })).toBeNull()
  },
}

/** The view as a small browser: type an address, go back, go forward (made up). Back and forward step through where this page sent it. */
export const AddressBar: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, url: 'http://localhost:65487', checks: pathChecks } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const bar = await c.findByRole('textbox', { name: 'Address' })
    const frame = () => c.getByTitle('The built code') as HTMLIFrameElement
    await expect(bar).toHaveValue('/'); await expect(c.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.clear(bar); await userEvent.type(bar, 'employees{Enter}')
    await waitFor(() => expect(frame().getAttribute('src')).toBe('http://localhost:65487/employees'))
    await userEvent.click(c.getAllByRole('button', { name: 'Go there' })[0])
    await waitFor(() => expect(c.getByRole('textbox', { name: 'Address' })).toHaveValue('/import'))
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(frame().getAttribute('src')).toBe('http://localhost:65487/employees'))
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(frame().getAttribute('src')).toBe('http://localhost:65487'))
    await expect(c.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.click(c.getByRole('button', { name: 'Forward' }))
    await waitFor(() => expect(c.getByRole('textbox', { name: 'Address' })).toHaveValue('/employees'))
    await expect(c.getByRole('button', { name: 'Reload' })).toBeEnabled()
  },
}

/** Main beside the build (made up): pressing Compare with main brings up a main of this task's own, on its own port, beside the build (the app's main is left as it is); a check sends both views to the same place, and each has its own back, forward, reload and address. */
export const ComparedWithMain: Story = {
  beforeEach: withEngine({ smoke: smokeSample, main: MAIN_OFF, mainUrl: 'http://localhost:6600', mainFor: 'iss_sample20' /* the task's own main, on its own port: not the app's */ }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy')
    await waitFor(() => expect(c.getByTitle('main')).toHaveAttribute('src', 'http://localhost:6600'))
    await expect(c.getByText('This build')).toBeInTheDocument()
    await userEvent.click(c.getAllByRole('button', { name: 'Go there' })[0])
    await expect(c.getByTitle('The built code')).toHaveAttribute('src', 'http://localhost:6500/iframe.html?id=edges-tunnel--default&viewMode=story')
    await expect(c.getByTitle('main')).toHaveAttribute('src', 'http://localhost:6600/iframe.html?id=edges-tunnel--default&viewMode=story') // the same place, on main
    // Each view has its own bar: main goes somewhere, back and forward, and the build stays where it is.
    const theirs = c.getByRole('textbox', { name: 'Address (main)' })
    await userEvent.clear(theirs); await userEvent.type(theirs, '/as-it-was{Enter}')
    await expect(c.getByTitle('main')).toHaveAttribute('src', 'http://localhost:6600/as-it-was')
    await expect(c.getByTitle('The built code')).toHaveAttribute('src', expect.stringContaining('edges-tunnel--default'))
    await userEvent.click(c.getByRole('button', { name: 'Back (main)' }))
    await expect(c.getByTitle('main')).toHaveAttribute('src', expect.stringContaining('localhost:6600/iframe.html?id=edges-tunnel--default'))
    await expect(c.getByRole('button', { name: 'Back' })).toBeEnabled(); await expect(c.getByRole('button', { name: 'Reload (main)' })).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Stop comparing' }))
    await waitFor(() => expect(c.queryByTitle('main')).toBeNull())
  },
}
/** Main is still starting (made up): the build stays usable, and main's side says so. */
export const MainStarting: Story = {
  beforeEach: withEngine({ smoke: smokeSample, main: { ...MAIN_OFF, running: true, up: false, url: 'http://localhost:6600', sha: 'fed9876cba', log: ['installing (sample)'] } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy'); await expect(await c.findByText(/Turning main on/)).toBeInTheDocument(); await expect(c.getByTitle('The built code')).toBeInTheDocument() },
}
/** Ask an agent (made up): it says what it saw beside the check, and the check is still yours to mark. */
export const AgentTriesOne: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: 'Ask an agent' }))[0])
    await expect(await c.findByText(/An agent saw it hold/)).toBeInTheDocument()
    await expect(c.getByText(/the edge dips under the lip/)).toBeInTheDocument()
    await expect(c.getByText(/3 of 3 for you to check/)).toBeInTheDocument() // nothing is marked by it
    await expect(c.getAllByRole('button', { name: 'Pass' })).toHaveLength(3)
  },
}
/** What an agent can say (made up): it failed, it could not tell, it is trying now, and one said on an earlier commit. */
export const WhatAnAgentSaw: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, checks: [
    { ...smokeSample.checks[0], tried: { verdict: 'fails', note: 'The edge sits on top of the lip at the default zoom (sample)', sha: 'abc1234def', at: '2026-11-18T12:00:00.000Z' } },
    { ...smokeSample.checks[1], tried: { verdict: 'unsure', note: 'Hover needs a real pointer: look at whether the twin lights up (sample)', sha: '0000000aaa', at: '2026-11-18T11:00:00.000Z', stale: true } },
    { ...smokeSample.checks[2], trying: true },
  ] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/An agent saw it fail/)).toBeInTheDocument()
    await expect(c.getByText(/An agent could not tell/)).toBeInTheDocument()
    await expect(c.getByText(/on an earlier commit/)).toBeInTheDocument()
    await expect(c.getByText(/An agent is trying it/)).toBeInTheDocument()
    await expect(c.getAllByRole('button', { name: 'Ask again' })).toHaveLength(2)
  },
}

const terminalChecks = [
  { id: 'ac_t1', text: 'The docs install the packed package, not the source (sample)', how: 'Run `ls docs/node_modules/bonkei`: dist and package.json only, no src folder (sample)', mark: 'todo' as const },
  { id: 'ac_t2', text: 'It installs in a new app (sample)', how: 'Run `npm ls bonkei`: one copy, no errors (sample)', mark: 'todo' as const },
]
/** A set-up that is a terminal (made up): nothing opens until asked; then a check's command is a button that runs there. */
export const InATerminal: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'terminal', says: 'in a terminal on this computer (sample)', url: null, up: false, running: null, canRun: false, terminal: { folder: 'temp', open: false }, owed: 2, checks: terminalChecks } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/in a new empty folder that is thrown away after/)).toBeInTheDocument()
    await expect(c.queryByRole('group', { name: 'Terminal' })).toBeNull() // not opened by itself
    await expect(c.queryByRole('button', { name: /npm ls bonkei/ })).toBeNull() // a command is words until there is somewhere to run it
    await userEvent.click(c.getByRole('button', { name: 'Open terminal' }))
    const said = () => canvasElement.querySelector('.xterm-rows')?.textContent ?? ''
    await waitFor(() => expect(said()).toContain('added 1 package (sample)'))
    await userEvent.click(c.getByRole('button', { name: /npm ls bonkei/ }))
    await waitFor(() => expect(said()).toContain('npm ls bonkei'))
    await userEvent.click(c.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(c.queryByRole('group', { name: 'Terminal' })).toBeNull())
  },
}
/** A set-up tested here has a terminal too (made up): in the build's checkout, under the view. */
export const TerminalUnderTheBuild: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, terminal: { folder: 'build', open: false }, checks: [terminalChecks[0], ...smokeSample.checks.slice(1)] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Terminal' }))
    await expect(await c.findByText(/The build's checkout/)).toBeInTheDocument()
    await expect(c.getByTitle('The built code')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /ls docs\/node_modules\/bonkei/ })).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Close terminal' })).toBeInTheDocument()
  },
}

/** Before it is started (made up): the terminal in the build's checkout is there already, to try starting it by hand. */
export const TerminalBeforeItRuns: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, url: null, up: false, running: null, terminal: { folder: 'build', open: false }, scratch: { open: false } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/The built code is not running/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Terminal' }))
    await expect(await c.findByText(/The build's checkout/)).toBeInTheDocument()
    await waitFor(() => expect(canvasElement.querySelector('.xterm-rows')?.textContent ?? '').toContain('(sample)'))
    await expect(c.getByRole('button', { name: 'Run it' })).toBeInTheDocument() // still not started
  },
}
/** Every set-up has a throwaway terminal (made up), a deployed one too: a new empty folder, gone when it is closed. */
export const ScratchTerminal: Story = {
  beforeEach: withEngine({ smoke: { ...smokeSample, where: 'staging', says: 'a deployed build at an address, with a test account', url: 'https://staging.example.test', running: null, canRun: false, account: 'the test parent (sample)', scratch: { open: false } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.queryByRole('button', { name: 'Terminal' })).toBeNull() // deployed: no checkout of its own to open
    await userEvent.click(await c.findByRole('button', { name: 'Scratch terminal' }))
    await expect(await c.findByText(/A new empty folder, thrown away when you close this/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Close scratch terminal' }))
    await waitFor(() => expect(c.queryByRole('group', { name: 'Terminal' })).toBeNull())
  },
}

/** The checks put aside for a wider view (made up): one press hides the cards, the count stays on the button, and another brings them back. */
export const ChecksPutAside: Story = {
  beforeEach: () => { try { localStorage.removeItem('se.smoke.checks') } catch { /* fine */ } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Hide checks' }))
    await expect(c.queryByRole('button', { name: 'Pass' })).toBeNull()
    await expect(c.getByTitle('The built code')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Show checks · 3 to check' }))
    await expect(c.getAllByRole('button', { name: 'Pass' })).toHaveLength(3)
  },
}

/** What it is compared with is chosen (made up): the app's main on its standard data, or a new main for this task on a copy of this data as it is now, or on this same database. Main's view says which. */
export const ComparedWithWhat: Story = {
  beforeEach: withEngine({ smoke: smokeSample, main: { ...MAIN_OFF, database: 'proto_main_sample' }, mainUrl: 'http://localhost:6600' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    // Each choice waits for the one before to be turned off, then for its own to come up: more than the usual second when the computer is busy.
    const pick = () => c.findByRole('combobox', { name: 'Compare with main' })
    await expect(within(await pick()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Compare with main…', "The app's main (standard data)", 'A new main, on a copy of this data as it is now', 'A new main, on this same database'])
    await userEvent.selectOptions(await pick(), 'copy')
    await expect(await c.findByText('· on a copy of the data', {}, { timeout: 5000 })).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Stop comparing' }))
    await userEvent.selectOptions(await pick(), 'shared')
    await expect(await c.findByText('· on the same database', {}, { timeout: 5000 })).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Stop comparing' }))
    await userEvent.selectOptions(await pick(), 'app')
    await expect(await c.findByText("· the app's main, standard data", {}, { timeout: 5000 })).toBeInTheDocument()
  },
}

/** Main stops by itself (made up: its script could not migrate a database ahead of its code): the page says so, with its last lines, and does not just drop the comparison. */
export const MainStoppedByItself: Story = {
  beforeEach: withEngine({ smoke: smokeSample, main: { ...MAIN_OFF, database: 'proto_main_sample' }, mainUrl: 'http://localhost:6600', mainDies: ["Can't locate revision identified by 'added_by_the_build_01' (sample)", 'exited with 1'] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'shared')
    const said = await c.findByRole('alert')
    await expect(said).toHaveTextContent('Main stopped by itself (exit 1).')
    await expect(said).toHaveTextContent('a schema that is ahead of it')
    await expect(said).toHaveTextContent("Can't locate revision identified by 'added_by_the_build_01' (sample)")
    await expect(c.getByRole('combobox', { name: 'Compare with main' })).toBeInTheDocument() // and it can be tried again
  },
}
