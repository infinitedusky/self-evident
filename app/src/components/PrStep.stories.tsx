import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PrStep } from './PrStep'
import { withEngine } from '../stories/mock-engine'
import { prDraftSample, prSample } from '../stories/sample'

/** A task's pull request as a step of its own, after the smoke test. Made-up task, people and pull request (sample). */
const meta = { title: 'Components/PrStep', component: PrStep, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', appId: 'app_sample', base: '/tasks/iss_sample20' },
  beforeEach: withEngine({ prView: prSample }), render: (a) => <div style={{ maxWidth: 860 }}><PrStep {...a} /></div> } satisfies Meta<typeof PrStep>
export default meta
type Story = StoryObj<typeof meta>

/** Built and not submitted: what it will open with, and one press (asked once more) opens it as a draft. */
export const NotSubmitted: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Not submitted')).toBeInTheDocument()
    await expect(c.getByText('As it will open')).toBeInTheDocument()
    await expect(c.getByText('feat(SS-20): edges that tunnel and portal (sample)')).toBeInTheDocument()
    await expect(c.getByText('Comments show here once it is submitted.')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Submit pull request' }))
    await userEvent.click(c.getByRole('button', { name: 'Submit it' }))
    await expect(await c.findByText('Draft')).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Ready for review' })).toBeInTheDocument()
  },
}

/** Still building, with checks of the person's own waiting: it says what it waits on and cannot be submitted. */
export const NotReadyYet: Story = {
  beforeEach: withEngine({ prView: { ...prSample, landed: 1, total: 3, byHand: 2, canSubmit: false, waits: ['2 of its 3 sub-tasks have still to land.'] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/2 checks of yours still wait/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Submit pull request' })).toBeDisabled()
  },
}

/** A draft on GitHub: its review and checks, what was said on it oldest first, and the press that takes it out of draft. */
export const Draft: Story = {
  beforeEach: withEngine({ prView: prDraftSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('1 of 3 checks failing')).toBeInTheDocument()
    await expect(c.getByText('Failing: lint (sample).')).toBeInTheDocument()
    await expect(c.getByText('On GitHub now')).toBeInTheDocument()
    const said = within(c.getByRole('list', { name: 'Comments' })).getAllByRole('listitem')
    await expect(said).toHaveLength(3)
    await expect(said[1]).toHaveTextContent('reviewer-a on a line src/edges/portal.ts:41')
    await userEvent.click(c.getByRole('button', { name: 'Ready for review' }))
    await expect(c.getByText(/takes #412 out of draft/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Mark it ready' }))
    await expect(await c.findByText('Open, ready for review')).toBeInTheDocument()
    await waitFor(() => expect(c.queryByRole('button', { name: 'Ready for review' })).toBeNull())
  },
}

/** GitHub's message is an earlier one: it says so, and what will be sent can be looked at. */
export const MessageBehind: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, behind: true, pr: { ...prDraftSample.pr!, body: 'An earlier message, from the first landing (sample).' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('An earlier message, from the first landing (sample).')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Show what will be sent' }))
    await expect(c.getByText('What the next update sends')).toBeInTheDocument()
    await expect(c.getByText(/Edges can dip under a node/)).toBeInTheDocument()
  },
}

/** GitHub cannot be reached: what was last known, and said plainly. */
export const GithubNotReached: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, comments: [], problem: 'GitHub could not be asked just now, so this is what was last known: could not resolve host (sample)', pr: { ...prDraftSample.pr!, title: '', body: '', review: null, checks: [] } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('note')).toHaveTextContent('GitHub could not be asked just now')
    await expect(c.getByText('They could not be read just now.')).toBeInTheDocument()
  },
}

/** Closed by a person: it stays closed until it is submitted again. Merged: nothing more to press. */
export const Closed: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, canReady: false, canSubmit: true, pr: { ...prDraftSample.pr!, status: 'closed' } } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Submit pull request again' })).toBeEnabled() },
}
export const Merged: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, canReady: false, pr: { ...prDraftSample.pr!, status: 'merged', review: 'approved' } } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(await c.findByText('It is merged. Nothing more is sent to it.')).toBeInTheDocument(); await expect(c.queryByRole('button', { name: /Ready|Submit/ })).toBeNull() },
}
