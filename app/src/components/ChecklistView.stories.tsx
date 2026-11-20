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
