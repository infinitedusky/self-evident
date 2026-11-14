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
const landed: BuildTask = { ...base, id: 'iss_sample3', identifier: 'SS-3', title: 'Wallet buttons first (sample)', phase: 'landed', done: 2, total: 2, pr: { number: 38, url: 'https://example.com/sample/pull/38', status: 'open' } }
const tasks = [asking, failed, ready, building, landed]

/** One of each: a question to answer here, a build that failed, a planned task to start, one building, one landed. */
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
