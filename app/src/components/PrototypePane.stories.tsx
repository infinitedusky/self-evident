import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PrototypePane } from './PrototypePane'
import { MAIN_OFF, withEngine } from '../stories/mock-engine'
import { apps, prototypes, sampleApp } from '../stories/sample'
import { addressFits, onARowBelow, overlap } from '../stories/fits'

// A prototype, in a tab: the actual thing built fast in its own worktree. All made up. The "running prototype" is one
// of these stories, served by Storybook itself.
const running = { ...prototypes[0], url: window.location.origin }
const at = '/iframe.html?id=pages-now--quiet&viewMode=story'
const meta = { title: 'Components/PrototypePane', component: PrototypePane, parameters: { layout: 'fullscreen', router: false }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof PrototypePane>
export default meta
type Story = StoryObj<typeof meta>

/** No prototype picked: this app's prototypes, newest first. */
export const List: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Sample: one-tap checkout')).toBeInTheDocument()
    await expect(c.getByText('Stopped')).toBeInTheDocument()
  },
}
/** None yet: says how one starts. */
export const NoneYet: Story = { beforeEach: withEngine({ prototypes: [] }) }
/** None yet, and the app has no prototype command: says the agent works it out. */
export const NoCommand: Story = { beforeEach: withEngine({ prototypes: [], apps: apps.map((a) => a.id === sampleApp.id ? { ...a, setup: { ...a.setup, prototype_cmd: undefined } } : a) }) }
/** Running and answering: the app in a frame with an address bar and device widths. */
export const Running: Story = { args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }) }
/** Nothing to open (made up: a collector with no screens): its guide's commands are the page, each with Run and what it last printed. */
export const NoScreenRunIt: Story = {
  args: { id: running.id },
  beforeEach: withEngine({ prototypes: [{ ...running, status: 'stopped', url: null, guide: { intro: 'A collector has no screens: it is tried by running it (sample).', steps: [{ title: 'The collector, end to end', run: 'python collector/test.py', try: 'It should end with OK.' }, { title: 'The config is valid', run: 'collector validate --config=collector/config.yaml' }] } }],
    prototypeRuns: [{ step: 0, command: 'python collector/test.py', status: 'passed', exitCode: 0, startedAt: '2026-11-15T10:00:00Z', endedAt: '2026-11-15T10:00:48Z', lines: ['both write tokens accepted (sample)', 'OK'] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/no screen to open/, {}, { timeout: 5000 })).toBeInTheDocument()
    await expect(await c.findByLabelText('What it printed')).toHaveTextContent('OK')
    await userEvent.click(await c.findByRole('button', { name: 'Run' })) // the second step
    await expect(await c.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  },
}
/** With a guide written (made up): the same "What to try" tab a shared link shows, in the corner of the prototype; open, its steps move this view. */
export const WithAGuide: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, guide: { intro: 'The quiet front page (sample).', steps: [{ title: 'See the quiet page', path: at, try: 'Nothing should need you.' }, { title: 'See a busy one', path: '/iframe.html?id=pages-now--busy&viewMode=story', try: 'What needs you is at the top.' }] } }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /What to try · 0\/2/ }, { timeout: 5000 }))
    await expect(await c.findByText('You are here')).toBeInTheDocument()
    await userEvent.click(await c.findByRole('button', { name: 'Go there →' }))
    await expect(await c.findByLabelText('Address')).toHaveValue('/iframe.html?id=pages-now--busy&viewMode=story')
    // Its own way back, as in a browser.
    await userEvent.click(c.getByRole('button', { name: 'Back' }))
    await expect(c.getByLabelText('Address')).toHaveValue(at)
  },
}
/** In a narrow column: the address and the server's buttons on one row, the device widths and the data on the next. Nothing hides or overlaps. */
export const Narrow: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const stop = await c.findByRole('button', { name: 'Stop its server' })
    const phone = c.getByRole('button', { name: 'Phone' })
    await expect(phone).toBeVisible()
    await expect(phone.getBoundingClientRect().top).toBeGreaterThanOrEqual(stop.getBoundingClientRect().bottom)
    const bar = canvasElement.querySelector('.preview-bar')!
    await expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth)
    const form = c.getByRole('textbox', { name: 'Address' }).closest('form')!
    await expect(addressFits(form)).toBe(true)
    await expect(onARowBelow(stop, form)).toBe(false) // still one row at this width
    await expect(overlap(form, c.getByRole('link', { name: 'Open in a browser tab' }))).toBe(false)
  },
}
/** Narrower still (Sandy, 2026-11-25: "it can accommodate much smaller screens, to go into two rows probably"): the address keeps the first row with back, forward and reload, the server's buttons go to a row below, and the address shows the path alone. */
export const VeryNarrow: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  decorators: [(Story) => <div style={{ width: 300 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const stop = await c.findByRole('button', { name: 'Stop its server' })
    const address = c.getByRole('textbox', { name: 'Address' })
    const form = address.closest('form')!
    await expect(addressFits(form)).toBe(true)
    await expect(form.getBoundingClientRect().width).toBeGreaterThanOrEqual(150)
    await expect(onARowBelow(stop, form)).toBe(true)
    await expect(onARowBelow(form, c.getByRole('button', { name: 'Back' }))).toBe(false)
    await expect(onARowBelow(c.getByRole('button', { name: 'Phone' }), stop)).toBe(true)
    await expect(c.getByText(running.url, { selector: '.preview-address span' })).not.toBeVisible()
    await expect(address).toHaveValue(at)
  },
}
/** Main beside it in a narrow column: the two views stack, and each address stays inside its own bar, clear of Detach. */
export const NarrowCompareWithMain: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [running], main: MAIN_OFF, mainFor: (running as { issueId?: string | null }).issueId ?? running.id }),
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy')
    const theirs = (await c.findByRole('textbox', { name: 'Address (main)' })).closest('form')!
    const mine = c.getByRole('textbox', { name: 'Address (prototype)' }).closest('form')!
    for (const f of [mine, theirs]) { await expect(addressFits(f)).toBe(true); await expect(f.getBoundingClientRect().width).toBeGreaterThanOrEqual(150) }
    await expect(overlap(theirs, c.getByRole('button', { name: '↗ Detach' }))).toBe(false)
    await expect(onARowBelow(c.getByRole('figure', { name: 'main' }), c.getByRole('figure', { name: 'This prototype' }))).toBe(true)
  },
}
/** At a phone's width. */
export const Phone: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Phone' }))
    await expect(canvasElement.querySelector('iframe')?.style.width).toBe('390px')
  },
}
/** Its made-up data: built from a scenario; pick another, rebuild it, or save it as it is now. */
export const ItsData: Story = {
  args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [running] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('combobox', { name: 'Scenario' })).toHaveValue('default')
    await userEvent.click(c.getByRole('button', { name: 'Save the data' }))
    await expect(c.getByRole('textbox', { name: 'Scenario name' })).toBeInTheDocument()
  },
}
/** A prototype that reaches a vendor through a stand-in: named beside its data, with whether each is up. Sample data. */
export const WithStandIns: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, standIns: [
    { key: 'vendor', name: 'Vendor API (sample)', what: 'The scan vendor\'s API, serving recorded responses (sample)', running: true, url: 'http://localhost:6123' },
    { key: 'mail', name: 'Mail (sample)', running: false, url: null },
  ] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const group = within(await c.findByRole('group', { name: 'Stand-ins' }))
    await expect(group.getByText('Vendor API (sample)')).toHaveAttribute('title', expect.stringContaining('Running at http://localhost:6123'))
    await expect(group.getByText('Mail (sample) · not running')).toBeInTheDocument()
  },
}
/** Main beside it: pressed, a main of the task's own (the prototype's, when it has no task) comes up on its own port and is shown at the same place, each with a bar of its own. The app's main is left as it is. Sample data. */
export const CompareWithMain: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [running], main: MAIN_OFF, mainFor: (running as { issueId?: string | null }).issueId ?? running.id }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy')
    await expect(await c.findByTitle('main')).toHaveAttribute('src', expect.stringContaining(at))
    await expect(c.getByTitle(running.title)).toHaveAttribute('src', expect.stringContaining(at))
    await expect(c.getByText('4f2a9c1')).toBeInTheDocument()
    // Each view has a bar of its own: main goes somewhere, and back, without the prototype moving.
    const main = c.getByRole('textbox', { name: 'Address (main)' })
    await userEvent.clear(main); await userEvent.type(main, '/iframe.html?id=pages-now--busy&viewMode=story{Enter}')
    await waitFor(() => expect(c.getByTitle('main')).toHaveAttribute('src', expect.stringContaining('pages-now--busy')))
    await expect(c.getByTitle(running.title)).toHaveAttribute('src', expect.stringContaining(at))
    await expect(c.getByRole('textbox', { name: 'Address (prototype)' })).toHaveValue(at)
    await userEvent.click(c.getByRole('button', { name: 'Back (main)' }))
    await waitFor(() => expect(c.getByTitle('main')).toHaveAttribute('src', expect.stringContaining(at)))
    await expect(c.getByRole('button', { name: 'Forward (main)' })).toBeEnabled()
    await expect(c.getByRole('button', { name: 'Reload (prototype)' })).toBeInTheDocument()
    // Detached, main is in a browser tab of its own and the prototype has the room; put back, it is beside it again.
    const opened: string[] = []; const open = window.open; window.open = ((u: string) => { opened.push(u); return null }) as typeof window.open
    try { await userEvent.click(c.getByRole('button', { name: '↗ Detach' })) } finally { window.open = open }
    await expect(decodeURIComponent(opened[0])).toContain('/view?tab={"kind":"main","path":"/iframe.html?id=pages-now--quiet')
    await expect(c.queryByTitle('main')).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Put main back' }))
    await expect(await c.findByTitle('main')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Stop comparing' }))
    await expect(await c.findByRole('combobox', { name: 'Compare with main' })).toBeInTheDocument()
  },
}
/** Main is still coming up: its side says so, with what its server last printed. Sample data. */
export const MainStarting: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [running], main: { ...MAIN_OFF, running: true, up: false, url: 'http://localhost:6999', sha: '4f2a9c1d0b7e', log: ['installing (sample)', 'building (sample)'] } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy'); await expect(await c.findByText(/Turning main on/)).toBeInTheDocument() },
}
/** An app with no database set: no data control. */
export const NoDatabase: Story = { args: { id: running.id, path: at }, beforeEach: withEngine({ prototypes: [{ ...running, database: null, scenarios: [] }] }) }
/** Its server is starting: the last lines it printed. */
export const Starting: Story = {
  args: { id: running.id },
  beforeEach: withEngine({ prototypes: [{ ...running, up: false, log: ['> sample-shop@0.0.0 dev', '> vite --port 51234', 'Installing dependencies…'] }] }),
}
/** Stopped (the engine restarted, or someone stopped it): a way to start it again. */
export const Stopped: Story = {
  args: { id: prototypes[1].id },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Start it' })).toBeInTheDocument()
  },
}

/** Up, and listening on a port it was not given (a viewer on a fixed port, made up): said above the prototype, so it is fixed before two run side by side. */
export const StrayPort: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, strayPorts: [5174], strayNote: 'It also listens on port 5174, which it chose itself. A second copy running beside it would share or fight over it. Make it follow $PORT_2 or $PORT_3, which are free and handed out with $PORT.' }] }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('note')).toHaveTextContent('port 5174, which it chose itself') },
}

/** Its data was rebuilt and the guide's links name rows that are gone (made up): said above the prototype, with what to do. */
export const GuideGoneStale: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, guideNote: 'The guide has a step that no longer opens since the data was rebuilt: /staff/12. Its ids changed. Write the guide again (set_guide) with the ids the data has now, or rebuild from a saved scenario, which keeps them.' }] }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/no longer opens since the data was rebuilt: \/staff\/12/)).toBeInTheDocument() },
}
/** No scenario loaded, but one was kept: building it again offers that one, not empty. */
export const RebuildOffersAKeptScenario: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, database: 'proto_sample', scenario: null, scenarios: ['three-overdue', 'default'] }] }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Reset the data' })).toHaveAttribute('title', 'Build it again from the scenario "default"') },
}

/** Just made, with an agent about to build it (made up): nothing is started, so nothing fails; it says who starts it. */
export const AgentSettingItUp: Story = {
  args: { id: running.id, path: at },
  beforeEach: withEngine({ prototypes: [{ ...running, status: 'stopped', url: null, up: false, notStarted: true }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Its agent is setting it up, and starts it when there is something to see/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Start it now' })).toBeInTheDocument()
  },
}

