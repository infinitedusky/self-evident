import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Finalize } from './Finalize'
import { finalizeNoneSample, finalizeReadySample, finalizeSample } from '../stories/sample'

// A pull request's finalizing, on the task's Pull request step: what ran, what it found, and the one press that sends it. All made up.
const meta = { title: 'Components/Finalize', component: Finalize, parameters: { layout: 'padded' },
  args: { v: finalizeSample, base: '/tasks/iss_sample20', number: 412, onStart: fn(async () => {}), onFix: fn(async () => {}), onAccept: fn(async () => {}), onSend: fn(async () => {}) },
  render: (a) => <div style={{ maxWidth: 860 }}><Finalize {...a} /></div> } satisfies Meta<typeof Finalize>
export default meta
type Story = StoryObj<typeof meta>

/** Run on the head (made up): each step with what it found, the breaks no test caught named with what they mean, one set aside as equivalent, and the gate check that stands in the way. The press is there, off, with why. */
export const Found: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Run on abc1234')).toBeInTheDocument()
    await expect(c.getByText(/Nothing here reaches GitHub until you press/)).toBeInTheDocument()
    const steps = within(c.getByRole('list', { name: 'The steps' }))
    await expect(steps.getAllByRole('listitem')).toHaveLength(5)
    await expect(steps.getByText(/Of 12 meaningful breaks, the tests catch 10 \(83%\)/)).toBeInTheDocument()
    const missed = within(c.getByRole('list', { name: 'Breaks no test caught' }))
    await expect(missed.getAllByRole('listitem')).toHaveLength(2)
    await expect(missed.getByText('src/export/rows.ts:41')).toBeInTheDocument()
    await expect(missed.getByText(/No test checks the value exactly at this limit/)).toBeInTheDocument()
    await expect(within(c.getByRole('list', { name: 'Left out of the score' })).getByText(/A limit nudged by one/)).toBeInTheDocument()
    await userEvent.click(missed.getAllByRole('button', { name: 'Fix this' })[0])
    await expect(args.onFix).toHaveBeenCalledWith('survivor', 'sv_1')
    const gate = within(c.getByRole('list', { name: 'The gate checks' }))
    await expect(gate.getAllByRole('listitem')).toHaveLength(6)
    await expect(gate.getByText('"Merge Danger" has nothing under it.')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Push and mark ready for review' })).toBeDisabled()
    await expect(within(c.getByRole('list', { name: 'What the press waits on' })).getByText(/"Merge Danger" has nothing under it/)).toBeInTheDocument()
  },
}
/** A survivor is left as it is: the reason is asked for, and may say no test could tell, which takes it out of the score. */
export const LeaveOne: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    const missed = within(c.getByRole('list', { name: 'Breaks no test caught' }))
    await userEvent.click(missed.getAllByRole('button', { name: 'Leave it, with a reason' })[1])
    await expect(c.getByRole('button', { name: 'Leave it' })).toBeDisabled()
    await userEvent.type(c.getByLabelText(/Why it is left as it is/), 'Both are always set together by the importer (sample).')
    await userEvent.click(c.getByLabelText(/No test could tell/))
    await userEvent.click(c.getByRole('button', { name: 'Leave it' }))
    await expect(args.onAccept).toHaveBeenCalledWith('sv_2', { reason: 'Both are always set together by the importer (sample).', equivalent: true })
  },
}
/** One was left with a reason, and a fix is on its way for the other (made up). */
export const Decided: Story = {
  args: { v: { ...finalizeSample, mutation: { ...finalizeSample.mutation!, survivors: [{ ...finalizeSample.mutation!.survivors[0], fix: { subTask: 'iss_fix1', title: 'Fix what the finalizing found: a test for rows.ts:41', landed: false } }, { ...finalizeSample.mutation!.survivors[1], accepted: { reason: 'Both are always set together by the importer (sample).', by: 'user' } }, finalizeSample.mutation!.survivors[2]] } } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/A fix is on its way: Fix what the finalizing found: a test for rows.ts:41/)).toBeInTheDocument()
    await expect(c.getByText(/Left as it is: Both are always set together by the importer \(sample\)\./)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Take that back' }))
    await expect(args.onAccept).toHaveBeenCalledWith('sv_2', { undo: true })
  },
}
/** The gate passes (made up): the evidence can be read as it will be sent, and the press asks once more before it acts. */
export const ReadyToSend: Story = {
  args: { v: finalizeReadySample },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('The evidence, as it would be sent'))
    await expect(c.getByText(/of 12 meaningful breaks made to the lines this pull request changed/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Push and mark ready for review' }))
    await expect(args.onSend).not.toHaveBeenCalled()
    await expect(c.getByText(/takes #412 out of draft/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Push it and mark it ready' }))
    await expect(args.onSend).toHaveBeenCalledTimes(1)
  },
}
/** Never run (made up): it says what starts it, and can be run from here. */
export const NotRun: Story = {
  args: { v: finalizeNoneSample },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Not run')).toBeInTheDocument()
    await expect(c.getByText(/Accepting the smoke test starts it/)).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'the smoke test' })).toHaveAttribute('href', '/tasks/iss_sample20/smoke')
    await userEvent.click(c.getByRole('button', { name: 'Run the finalizing' }))
    await expect(args.onStart).toHaveBeenCalledTimes(1)
    await expect(c.getByRole('button', { name: 'Push and mark ready for review' })).toBeDisabled()
  },
}
/** Running (made up): the steps as they go, and nothing to press. */
export const Running: Story = {
  args: { v: { ...finalizeSample, state: 'running', canStart: false, startWaits: 'it is running', canPush: false, pushWaits: ['The finalizing is still running.'], mutation: null, evidence: '', steps: [{ ...finalizeSample.steps[0] }, { ...finalizeSample.steps[1], state: 'running', says: '35 of 120 breaks tried…' }, ...finalizeSample.steps.slice(2).map((s) => ({ ...s, state: 'waiting' as const, says: '' }))] } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Running')).toBeInTheDocument()
    await expect(c.getByText('35 of 120 breaks tried…')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /Run (it again|the finalizing)/ })).toBeNull()
  },
}
/** The branch moved since it ran (made up): the results are of an earlier commit, and it is run again before anything is sent. */
export const Moved: Story = {
  args: { v: { ...finalizeReadySample, stale: true, head: 'fed9876aaa', canPush: false, pushWaits: ['The branch has moved since the finalizing ran (it ran on abc1234): run it again.'] } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Of an earlier commit \(abc1234\)/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Run it again' }))
    await expect(args.onStart).toHaveBeenCalledTimes(1)
  },
}
/** A pull request that is ready already (made up): the same press is "Update pull request", through the same gate. */
export const ReadyAlready: Story = {
  args: { v: { ...finalizeReadySample, press: 'update', sent: { sha: 'aaa0000bbb', at: '2026-11-23T12:00:00Z', same: false } } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/GitHub has the evidence as it was sent on aaa0000/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Update pull request' }))
    await userEvent.click(c.getByRole('button', { name: 'Send it' }))
    await expect(args.onSend).toHaveBeenCalledTimes(1)
  },
}
/** The engine says no (made up): its words are shown. */
export const Refused: Story = {
  args: { v: finalizeReadySample, onSend: fn(async () => { throw new Error(JSON.stringify({ error: 'it cannot be sent yet. GitHub\'s checks are green: 1 of 3 still running. (sample)' })) }) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Push and mark ready for review' }))
    await userEvent.click(c.getByRole('button', { name: 'Push it and mark it ready' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('1 of 3 still running')
  },
}
