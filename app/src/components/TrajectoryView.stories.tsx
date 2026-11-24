import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TrajectoryView } from './TrajectoryView'
import { trajectorySample } from '../stories/sample'
import type { RowRun, Trajectory } from '../engine'

// A task's test trajectory, on its Test plan step. All made up: the sample export task, two slices and four tests.
const meta = { title: 'Components/TrajectoryView', component: TrajectoryView, parameters: { layout: 'padded' }, args: { view: trajectorySample },
  render: (a) => <div style={{ maxWidth: 900 }}><TrajectoryView {...a} /></div> } satisfies Meta<typeof TrajectoryView>
export default meta
type Story = StoryObj<typeof meta>

const run = (row: string, outcome: RowRun['outcome'], at = 'tests', tail?: string): RowRun => ({ row, outcome, at, ts: '2026-11-23T12:00:00.000Z', ...(tail ? { tail } : {}) })
const withRuns = (runs: Record<string, RowRun[]>, states: Record<string, Trajectory['rows'][number]['state']>, says: Record<string, string>): Trajectory => {
  const rows = trajectorySample.rows.map((r) => ({ ...r, runs: runs[r.id] ?? [], state: states[r.id] ?? 'planned', says: says[r.id] ?? 'not run yet' }))
  return { ...trajectorySample, approved: true, rows, proven: rows.filter((r) => r.state === 'green').length, holds: rows.every((r) => r.state === 'green') }
}

/** Written by its agent and waiting for you: the table, what is not written up front and why, the guards, and the build it will make. Nothing has run. */
export const WaitingForApproval: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('4 tests, 3 written up front. Not approved yet: the build is made from it once you approve.')).toBeInTheDocument()
    await expect(c.getByText('GET /export returns every order of the customer (sample)')).toBeInTheDocument()
    await expect(c.getByText(/it calls the writer the query slice introduces/)).toBeInTheDocument()
    await expect(c.getByText(/the query it reads is being changed/)).toBeInTheDocument()
    await expect(c.getAllByText('not run yet')).toHaveLength(4)
    await userEvent.click(c.getByText('Its code, as planned'))
    await expect(c.getByText(/expect\(writeTwice\(\)\)\.toBe\(0\)/)).toBeInTheDocument()
    const order = within(c.getByRole('list', { name: 'The build, in order' })).getAllByRole('listitem')
    await expect(order[0]).toHaveTextContent('Test phase'); await expect(order).toHaveLength(3)
  },
}
const building = withRuns(
  { T1: [run('T1', 'red')], T2: [run('T2', 'red'), run('T2', 'green', 'query')], T4: [run('T4', 'green'), run('T4', 'green', 'query')] },
  { T1: 'red', T2: 'green', T4: 'green' }, { T1: 'seen red: waiting for its code', T2: 'seen red, then green', T4: 'seen red, then green' })
/** Under way (made up): each row shows what the engine saw, in order. One is red and waiting for its code, one was red and is green, the guard is green, one is not written yet. */
export const Building: Story = {
  args: { view: building },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('2 of 4 proven: seen to fail before their code, and to pass after.')).toBeInTheDocument()
    const t2 = within(c.getByRole('row', { name: /T2/ }))
    await expect(t2.getByLabelText('Test phase: failed on an assertion')).toBeInTheDocument(); await expect(t2.getByLabelText('The orders query (sample): passed')).toBeInTheDocument()
    await expect(within(c.getByRole('row', { name: /T1/ })).getByText('seen red: waiting for its code')).toBeInTheDocument()
  },
}
/** Refused (made up): a test that failed to load is not a failing test, and one that passed on its first run proves nothing. Each says so, with what the run printed. */
export const Refused: Story = {
  args: { view: withRuns(
    { T1: [run('T1', 'fake', 'tests', 'Error: Failed to resolve import "../src/export" (sample)')], T2: [run('T2', 'green')] },
    { T1: 'fake', T2: 'never-red' }, { T1: 'failed to load: not a failing test', T2: 'green, and never seen red' }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('failed to load: not a failing test')).toBeInTheDocument()
    await expect(c.getByText('green, and never seen red')).toBeInTheDocument()
    await userEvent.click(c.getByText('What the run printed'))
    await expect(c.getByText(/Failed to resolve import/)).toBeInTheDocument()
  },
}
/** Every row seen red and then green (made up): the trajectory holds. */
export const Proven: Story = {
  args: { view: withRuns(
    Object.fromEntries(trajectorySample.rows.map((r) => [r.id, r.guard ? [run(r.id, 'green')] : [run(r.id, 'red'), run(r.id, 'green', r.passesAt)]])),
    Object.fromEntries(trajectorySample.rows.map((r) => [r.id, 'green' as const])), Object.fromEntries(trajectorySample.rows.map((r) => [r.id, 'seen red, then green']))) },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText('4 of 4 proven: seen to fail before their code, and to pass after.')).toBeInTheDocument() },
}
/** Changed after you approved it (made up): the build stays held to what you approved, and the new one waits for you. */
export const ChangedSinceApproval: Story = {
  args: { view: { ...building, changed: true } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole('note')).toHaveTextContent('It has changed since you approved it') },
}
/** The app has no test command (made up): the plan can be read and approved, and it says nothing can be run. */
export const CannotRun: Story = {
  args: { view: { ...trajectorySample, canRun: false } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole('note')).toHaveTextContent('This app has no test command') },
}
/** A test file on the branch that no row names (made up): flagged, to be added with its row or explained. */
export const TestOutsideThePlan: Story = {
  args: { view: { ...building, stray: ['tests/export-extra.test.ts (sample)'] } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/1 test file on the branch is in no row/)).toBeInTheDocument(); await expect(c.getByText('tests/export-extra.test.ts (sample)')).toBeInTheDocument()
  },
}
/** None written yet. */
export const NoneYet: Story = {
  args: { view: { plan: null, approved: false, changed: false, rows: [], holds: false, proven: 0, total: 0, canRun: true, stray: [] } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/No test plan is written yet/)).toBeInTheDocument() },
}
