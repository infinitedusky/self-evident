import type { Meta, StoryObj } from '@storybook/react-vite'
import { rows } from '@self-evident/engine/steps'
import { StepSection } from './StepSection'
import { withEngine } from '../stories/mock-engine'
import { expect, within } from 'storybook/test'
import { prototypes, riskWork, sampleApp, taskStepsView } from '../stories/sample'

// One step of a task as its own page. Made up: the sample task's steps under "UI change (sample)".
const all = rows('task', taskStepsView.states, taskStepsView.resolved.workflow)
const row = (key: string) => all.find((r) => r.key === key)!
const meta = { title: 'Components/StepSection', component: StepSection,
  args: { subject: { kind: 'issues', id: 'iss_sample20' }, appId: sampleApp.id, name: 'Address and payment on one page (sample)', base: '/tasks/iss_sample20', row: row('research'), fromIdea: taskStepsView.fromIdea },
  render: (a) => <div style={{ maxWidth: 900 }}><StepSection {...a} /></div> } satisfies Meta<typeof StepSection>
export default meta
type Story = StoryObj<typeof meta>

/** Done, with what it produced. */
export const Done: Story = {}
/** Not started: hand it to the agent. */
export const NotStarted: Story = { args: { row: { ...row('research'), state: { key: 'research', status: 'none' } } }, beforeEach: withEngine({ stepWork: null }) }
/** The prototype's step: the thing running (View), every file it changed and what the agent shows (Code), and what it wrote for the brief. Here the agent has just shown a file. */
export const PrototypeCodeView: Story = {
  args: { row: { ...row('research'), key: 'prototype', state: { key: 'prototype', status: 'started', detail: 'A first version is up (sample)' }, waitingOn: undefined } as typeof all[number] },
  beforeEach: withEngine({ prototypes: prototypes.map((p, i) => i === 0 ? { ...p, issueId: 'iss_sample20' } : p) }),
  parameters: { route: { path: '/tasks/:id/prototype', url: '/tasks/iss_sample20/prototype?shown=shown_sample1' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true')
    await expect(await c.findByText(/the saved card is read here/)).toBeInTheDocument()
  },
}
/** Waiting on a step before it: says which, and links there. */
export const Waiting: Story = { args: { row: row('risk'), waitingState: row('brief').state }, beforeEach: withEngine({ stepWork: null }) }
/** Started from an idea. */
export const FromAnIdea: Story = { args: { row: row('idea') } }

/** A check's report: what the person needs to know first, in a few bullets; the full report, written for the next agent, folded under it. */
export const ReportWithASummary: Story = {
  args: { row: { ...row('risk'), waitingOn: null, state: { key: 'risk', status: 'done', detail: riskWork.detail ?? undefined } } }, beforeEach: withEngine({ stepWork: riskWork }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: 'What you need to know' })).toBeInTheDocument()
    await expect(c.getByText(/I would add an index before the build/)).toBeVisible()
    await expect(c.getByText(/The full report/)).toBeInTheDocument()
    await expect(c.getByText(/Files and modules/)).not.toBeVisible() // folded until asked for
  },
}
/** A long report from before summaries: shown whole, with how to get one. */
export const LongReportNoSummary: Story = {
  args: { row: { ...row('risk'), waitingOn: null, state: { key: 'risk', status: 'done' } } }, beforeEach: withEngine({ stepWork: { ...riskWork, summary: null, body: `${riskWork.body}\n\n${'More detail for the next agent (sample). '.repeat(90)}` } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/has no summary\. Ask the task's agent/)).toBeInTheDocument() },
}
