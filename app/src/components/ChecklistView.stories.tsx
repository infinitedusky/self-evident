import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ChecklistView } from './ChecklistView'
import { checklistSample } from '../stories/sample'
import type { Checklist } from '../engine'

// A checklist task's list, on its own page. All made up: the sample checkout task, built in one go.
const meta = { title: 'Components/ChecklistView', component: ChecklistView, parameters: { layout: 'padded' }, args: { checklist: checklistSample, base: '/tasks/iss_sample20' },
  render: (a) => <div style={{ maxWidth: 760 }}><ChecklistView {...a} /></div> } satisfies Meta<typeof ChecklistView>
export default meta
type Story = StoryObj<typeof meta>

/** Checked once: one criterion and one requirement not done and sent back. What is not done comes first, with what is missing. */
export const SentBack: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/4 of 7 met, 2 not done/)).toBeInTheDocument()
    await expect(c.getByText(/round 1: 2 not done, sent back/)).toBeInTheDocument()
    await expect(c.getByText(/Missing: the form clears on a decline/)).toBeInTheDocument()
    const items = c.getAllByRole('listitem').filter((li) => li.className.includes('checklist-item'))
    await expect(items[0].className).toContain('unmet') // not done first
  },
}
const before: Checklist = { ...checklistSample, met: 0, unmet: 0, items: checklistSample.items.map(({ evidence: _e, ...x }) => ({ ...x, mark: 'unchecked' as const })),
  stages: [{ key: 'build', label: 'Build', state: 'todo', detail: 'not built yet' }, { key: 'check', label: 'Check', state: 'todo', detail: '7 to check' }, { key: 'probe', label: 'Probe', state: 'todo', detail: 'after the check' }, { key: 'test', label: 'Tests', state: 'todo', detail: 'the whole run, once, last' }] }
/** Before the build: the list the builder will be given, nothing checked yet. */
export const BeforeTheBuild: Story = {
  args: { checklist: before },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/7 to check once it is built/)).toBeInTheDocument() },
}
/** All of it met, probed and tested. */
export const Done: Story = {
  args: { checklist: { ...checklistSample, met: 7, unmet: 0, items: checklistSample.items.map((x) => (x.mark === 'unmet' ? { ...x, mark: 'met' as const, evidence: 'checkout-decline.test (sample)' } : x.mark === 'person' ? { ...x, mark: 'met' as const } : x)),
    stages: [{ key: 'build', label: 'Build', state: 'done', detail: 'built in one go' }, { key: 'check', label: 'Check', state: 'done', detail: '7 of 7 met, in 2 rounds' }, { key: 'probe', label: 'Probe', state: 'done', detail: 'tried to break it, and cleaned up' }, { key: 'test', label: 'Tests', state: 'done', detail: 'the whole run passed' }] } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/7 of 7 met, in 2 rounds/)).toBeInTheDocument() },
}
/** Three rounds and one thing still not done: it says it is yours. */
export const NeedsYou: Story = {
  args: { checklist: { ...checklistSample, stages: checklistSample.stages.map((s) => (s.key === 'check' ? { ...s, state: 'failed' as const, detail: '2 still not done after 3 rounds: yours' } : s)) } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/still not done after 3 rounds: yours/)).toBeInTheDocument() },
}
/** A task with nothing on its list (made up): it says where criteria are written. */
export const NothingOnIt: Story = {
  args: { checklist: { build: 'one', items: [], met: 0, unmet: 0, total: 0, stages: before.stages.map((s) => (s.key === 'check' ? { ...s, detail: 'nothing on the list' } : s)) } },
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByText('nothing on it')).toBeInTheDocument(); await expect(c.getByRole('link', { name: 'the brief' })).toBeInTheDocument() },
}

// A criterion added after the build's check (made up): everything else met, one line with no mark yet.
const openAgain: Checklist = { ...checklistSample, met: 7, unmet: 0, unchecked: 1, person: 0, total: 8, check: { unchecked: 1, canRun: true, running: false },
  items: [...checklistSample.items.map((x) => (x.mark === 'unmet' || x.mark === 'person' ? { ...x, mark: 'met' as const, evidence: 'checkout-decline.test (sample)' } : x)), { id: 'ac_sample_added', kind: 'criterion' as const, text: 'A declined card can be tried again without reloading (sample)', mark: 'unchecked' as const, evidence: 'checkout-retry.test (sample)' }],
  stages: [{ key: 'build', label: 'Build', state: 'done', detail: 'built in one go' }, { key: 'check', label: 'Check', state: 'doing', detail: 'open again: 1 not checked yet' }, { key: 'probe', label: 'Probe', state: 'done', detail: 'probed: nothing to send back' }, { key: 'test', label: 'Tests', state: 'done', detail: 'the whole run passed' }] }
/**
 * A criterion was added after the build's check (made up). It reads "not checked yet", never as not done: the count
 * says so apart from what is met, the Check step is open again, and the check can be run for it alone.
 */
export const OpenAgain: Story = {
  args: { checklist: openAgain, onCheckAgain: fn(async () => ({ started: true })) },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText('7 of 8 met, 1 not checked yet')).toBeInTheDocument()
    await expect(c.getByRole('heading', { name: /Checklist/ })).not.toHaveTextContent('not done') // not checked yet is not a failure
    await expect(c.getByText('open again: 1 not checked yet')).toBeInTheDocument()
    const items = c.getAllByRole('listitem').filter((li) => li.className.includes('checklist-item'))
    await expect(items[0].className).toContain('unchecked'); await expect(within(items[0]).getByLabelText('not checked yet')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Run the check' }))
    await expect(args.onCheckAgain).toHaveBeenCalledTimes(1)
  },
}
/** The check asked for is under way (made up): it says so, and there is nothing to press until it lands. */
export const CheckingAgain: Story = {
  args: { checklist: { ...openAgain, check: { unchecked: 1, canRun: false, running: true, why: 'a sub-task has not landed yet: the check is of what is built' }, stages: openAgain.stages.map((s) => (s.key === 'check' ? { ...s, detail: 'checking what is not checked yet' } : s)) }, onCheckAgain: fn(async () => ({})) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('checking what is not checked yet')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Run the check' })).toBeNull()
  },
}
/** Something is not checked yet and the check cannot be run now (made up): the button is there, off, and says why. */
export const CheckWaits: Story = {
  args: { checklist: { ...openAgain, check: { unchecked: 1, canRun: false, running: false, why: 'the whole test run is under way: wait for it' } }, onCheckAgain: fn(async () => ({})) },
  play: async ({ canvasElement }) => {
    const b = within(canvasElement).getByRole('button', { name: 'Run the check' })
    await expect(b).toBeDisabled(); await expect(b).toHaveAttribute('title', expect.stringContaining('test run is under way'))
  },
}
/** All four marks at once (made up): met, not done, yours and not checked yet are each counted apart. */
export const EveryMark: Story = {
  args: { checklist: { ...checklistSample, unchecked: 1, person: 1, met: 3, unmet: 2, total: 7, check: { unchecked: 1, canRun: false, running: false, why: 'a sub-task has not landed yet: the check is of what is built' }, items: checklistSample.items.map((x, i) => (i === 0 ? { ...x, mark: 'unchecked' as const, evidence: 'checkout.test (sample)' } : x)) } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText('3 of 7 met, 2 not done, 1 yours to judge, 1 not checked yet')).toBeInTheDocument() },
}

/** Some of the list is owed later (made up): a release check and a watched one are on it, counted apart, and never read as missing from what was met. */
export const OwedLater: Story = {
  args: { checklist: { ...openAgain, met: 7, total: 7, unchecked: 0, release: 1, watch: 1, check: { unchecked: 0, canRun: false, running: false },
    items: [...openAgain.items.filter((x) => x.mark !== 'unchecked'), { id: 'ac_sample_r', kind: 'criterion' as const, text: 'CHECKOUT_KEY is set in each environment (sample)', mark: 'release' as const, evidence: 'the deploy config has it (sample)' }, { id: 'ac_sample_w', kind: 'criterion' as const, text: 'checkout.paid appears in production within a day (sample)', mark: 'watch' as const, evidence: 'the event count is above zero (sample)' }],
    stages: openAgain.stages.map((s) => (s.key === 'check' ? { ...s, state: 'done' as const, detail: '7 of 7 met' } : s)) } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('7 of 7 met, 1 at deploy, 1 watched after')).toBeInTheDocument()
    await expect(c.getByLabelText('at deploy')).toBeInTheDocument(); await expect(c.getByLabelText('watched after the deploy')).toBeInTheDocument()
    await expect(c.getByText(/At deploy, by whoever deploys: the deploy config has it/)).toBeInTheDocument()
  },
}

const failedRun: Checklist = { ...checklistSample, met: 7, unmet: 0,
  tests: { ok: false, at: new Date(Date.now() - 5 * 3_600_000).toISOString(), flaky: false, running: false, canRun: true, output: 'What failed:\n FAIL  src/checkout.test.ts [ src/checkout.test.ts ]\n\nThe end of the output:\nError: Cannot find module \'./generated/config.json\' (sample)\n Test Files  12 failed (12)' },
  stages: [{ key: 'build', label: 'Build', state: 'done', detail: 'built in one go' }, { key: 'check', label: 'Check', state: 'done', detail: '7 of 7 met' }, { key: 'probe', label: 'Probe', state: 'done', detail: 'probed: nothing to send back' }, { key: 'test', label: 'Tests', state: 'failed', detail: 'the whole run failed' }] }
/** The whole run failed, hours ago (made up): it says when, shows what the run said, and can be asked for again on the branch as it is now. */
export const TestsFailed: Story = {
  args: { checklist: failedRun, onTestAgain: fn(async () => ({ started: true })) },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/ran 5 h ago/)).toBeInTheDocument()
    await userEvent.click(c.getByText('What the run said'))
    await expect(c.getByText(/Cannot find module/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Run again' }))
    await expect(args.onTestAgain).toHaveBeenCalledTimes(1)
  },
}
/** Asked for and under way (made up): nothing to press until it is over, and the last run's output is not shown as if it were this one's. */
export const TestsRunning: Story = {
  args: { checklist: { ...failedRun, tests: { ...failedRun.tests!, running: true, canRun: false }, stages: failedRun.stages.map((s) => (s.key === 'test' ? { ...s, state: 'doing' as const, detail: 'the whole run is under way' } : s)) }, onTestAgain: fn(async () => ({})) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('the whole run is under way')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Run again' })).toBeNull()
    await expect(c.queryByText('What the run said')).toBeNull()
  },
}
/** It cannot be run yet (made up): the engine says why, and the page shows it. */
export const TestsRefused: Story = {
  args: { checklist: failedRun, onTestAgain: fn(async () => { throw new Error('a sub-task is landing or a test run is already under way: wait for it') }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Run again' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('already under way')
  },
}
