import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Build } from './Build'
import { engineDown, withEngine } from '../stories/mock-engine'
import { now } from '../stories/sample'
import type { BuildTask } from '../engine'

// Build, at /build: every task past its plan, what needs the person first. All made up: a sample shop's tasks.
const meta = { title: 'Pages/Build', component: Build, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Build /></div> } satisfies Meta<typeof Build>
export default meta
type Story = StoryObj<typeof meta>

const base = { projectId: 'proj_checkout', projectName: 'One-page checkout (sample)', projectStatus: 'running', live: [], held: [], failed: [], questions: [], pr: null }
const asking: BuildTask = { ...base, id: 'iss_sample20', identifier: 'SS-20', title: 'Address and payment on one page (sample)', phase: 'stopped', done: 1, total: 4,
  questions: [{ id: 'q_sample1', text: 'The saved address can be shown **before** or **after** the card form. Which?', cost: 'expensive', reason: 'The prototype shows it first and the mockups were approved that way (sample).',
    options: [{ label: 'Before the card', description: 'As in the prototype.', changes: [], recommended: true }, { label: 'After the card', description: 'Fewer fields on first sight; one more scroll.', changes: ['web/checkout/form.tsx'], recommended: false }] }] }
const failed: BuildTask = { ...base, id: 'iss_sample1', identifier: 'SS-1', title: 'Declined cards (sample)', phase: 'stopped', done: 2, total: 3,
  failed: [{ id: 'iss_sample5', identifier: 'SS-5', title: 'A declined card is shown in place', error: 'the tests failed on the merged commit: 2 of 41 (sample)' }],
  held: [{ id: 'iss_sample6', identifier: 'SS-6', title: 'Order totals update as you type', reason: 'waiting on SS-5 (web/checkout/submit.ts)' }] }
const ready: BuildTask = { ...base, id: 'iss_sample16', identifier: 'SS-16', title: 'Fix the footer link (sample)', projectName: null, projectStatus: 'drafting', phase: 'ready', done: 0, total: 1 }
const building: BuildTask = { ...base, id: 'iss_sample22', identifier: 'SS-22', title: 'Gift cards at checkout (sample)', phase: 'building', done: 1, total: 3,
  live: [{ id: 'iss_sample7', identifier: 'SS-7', title: 'A gift card takes off the total', status: 'running', step: 'Writing the totals test' }], pr: { number: 41, url: 'https://example.com/sample/pull/41', status: 'open' } }
const built: BuildTask = { ...base, id: 'iss_sample3', identifier: 'SS-3', title: 'Wallet buttons first (sample)', phase: 'built', done: 2, total: 2, pr: { number: 38, url: 'https://example.com/sample/pull/38', status: 'open' } }
const merged: BuildTask = { ...base, id: 'iss_sample4', identifier: 'SS-4', title: 'Postcode lookup (sample)', phase: 'built', done: 3, total: 3, pr: { number: 36, url: 'https://example.com/sample/pull/36', status: 'merged' } }
const landed: BuildTask = { ...base, id: 'iss_sample2', identifier: 'SS-2', title: 'Guest checkout (sample)', projectStatus: 'closed', phase: 'landed', done: 2, total: 2, pr: { number: 31, url: 'https://example.com/sample/pull/31', status: 'merged' } }
const reading: BuildTask = { ...base, id: 'iss_sample23', identifier: 'SS-23', title: 'Saved cards (sample)', projectStatus: 'drafting', phase: 'checking', done: 0, total: 3, checks: { left: ['Blast radius', 'Audit', 'Final ADR and plan'], needsYou: null, sessionId: null } }
const heldForYou: BuildTask = { ...base, id: 'iss_sample24', identifier: 'SS-24', title: 'Order history (sample)', projectStatus: 'drafting', phase: 'stopped', done: 0, total: 4,
  checks: { left: ['Final ADR and plan'], needsYou: 'The audit found the brief asks for **export to CSV** and no sub-task does it. Add a sub-task for it, or drop it from this task? I would drop it: nothing in the prototype shows it (sample).', sessionId: 'talk_sample_final' } }
const tasks = [asking, heldForYou, failed, ready, reading, building, built, merged, landed]

/** One of each: a question to answer here, a build that failed, a planned task to start, one building, one built, one merged and one landed. */
export const EveryPhase: Story = {
  beforeEach: withEngine({ now: { ...now, tasks } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Waiting for you')).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Before the card · recommended' })).toBeInTheDocument() // the question is answered here
    await expect(await c.findByRole('button', { name: 'Try it again' })).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Build it' })).toBeInTheDocument()
    await expect(await c.findByRole('link', { name: 'SS-22 Gift cards at checkout (sample)' })).toHaveAttribute('href', '/tasks/iss_sample22/build') // a row leads to the task, not its project
  },
}
/** A planned task whose last step before the build stopped for the person: the question, answered here. */
export const HeldBeforeTheBuild: Story = {
  beforeEach: withEngine({ now: { ...now, tasks: [heldForYou, reading] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('the build is waiting for you')).toBeInTheDocument()
    await expect(await c.findByLabelText('Your answer')).toBeInTheDocument()
    await expect(await c.findByText('Planned, being read before it is built')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Build it' })).toBeNull() // nobody builds around the reading
  },
}
/** Merged is not landed: a task whose pull request merged stays under Built, with the way to close it; only a closed one is Landed. */
export const MergedIsNotLanded: Story = {
  beforeEach: withEngine({ now: { ...now, tasks: [built, merged, landed] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const of = async (name: string) => within((await c.findByRole('heading', { name })).closest('section')!)
    const open = await of('Built, not closed'), over = await of('Landed')
    await expect(open.getByRole('link', { name: 'SS-4 Postcode lookup (sample)' })).toBeInTheDocument()
    await expect(open.getByText('merged', { selector: '.badge' })).toBeInTheDocument()
    await expect(open.getByRole('link', { name: 'Close it →' })).toHaveAttribute('href', '/tasks/iss_sample4/build')
    await expect(open.getByRole('link', { name: 'Pull request #38' })).toBeInTheDocument() // built, its pull request still open
    await expect(over.getAllByRole('listitem')).toHaveLength(1)
    await expect(over.getByRole('link', { name: 'SS-2 Guest checkout (sample)' })).toBeInTheDocument()
  },
}
/** Only work going well: nothing waits for the person. */
export const AllBuilding: Story = { beforeEach: withEngine({ now: { ...now, tasks: [building, landed] } }) }
/** A question is the only thing on the page. */
export const OneQuestion: Story = { beforeEach: withEngine({ now: { ...now, tasks: [asking] } }) }
/** Nothing past its plan yet: where to go instead. */
export const Empty: Story = { beforeEach: withEngine({ now: { ...now, tasks: [] } }) }
/** No app yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
/** The engine cannot be reached. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
