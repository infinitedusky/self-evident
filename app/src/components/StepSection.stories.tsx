import type { Meta, StoryObj } from '@storybook/react-vite'
import { rows } from '@self-evident/engine/steps'
import { StepSection } from './StepSection'
import { withEngine } from '../stories/mock-engine'
import { expect, userEvent, within } from 'storybook/test'
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
/** An optional step, not started: do it or skip it; the brief waits until one is said. */
export const OptionalToDoOrSkip: Story = {
  args: { row: { ...row('research'), required: false, state: { key: 'research', status: 'none' } } }, beforeEach: withEngine({ stepWork: null }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Skip this step' })).toBeInTheDocument() },
}
/** Skipped by a person: it says so, and can be taken back. */
export const Skipped: Story = {
  args: { row: { ...row('research'), required: false, state: { key: 'research', status: 'skipped' } } }, beforeEach: withEngine({ stepWork: null }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Skipped: not being done on this task/)).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Do it after all' })).toBeInTheDocument()
  },
}
/** A required step has no way to skip it. */
export const RequiredCannotBeSkipped: Story = {
  args: { row: { ...row('research'), required: true, state: { key: 'research', status: 'none' } } }, beforeEach: withEngine({ stepWork: null }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await c.findByRole('button', { name: /Start with the agent/ }); await expect(c.queryByRole('button', { name: 'Skip this step' })).toBeNull() },
}
/** The prototype's step: the thing running (View), every file it changed and what the agent shows (Code), and what it wrote for the brief. Here the agent has just shown a file. */
export const PrototypeCodeView: Story = {
  args: { row: { ...row('research'), key: 'prototype', state: { key: 'prototype', status: 'started', detail: 'A first version is up (sample)' }, waitingOn: null } as typeof all[number] },
  beforeEach: withEngine({ prototypes: prototypes.map((p, i) => i === 0 ? { ...p, issueId: 'iss_sample20' } : p) }),
  parameters: { route: { path: '/tasks/:id/prototype', url: '/tasks/iss_sample20/prototype?shown=shown_sample1' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true')
    await expect(await c.findByText(/the saved card is read here/)).toBeInTheDocument()
  },
}
const protoRow = { ...row('research'), key: 'prototype', state: { key: 'prototype', status: 'started', detail: 'A first version is up (sample)' }, waitingOn: null } as typeof all[number]
const withProto = { prototypes: prototypes.map((p, i) => i === 0 ? { ...p, issueId: 'iss_sample20' } : p) }
/** A prototype that is built, on "For the brief": what it wrote for the brief shows, and there is no button asking the agent to carry on. */
export const PrototypeForTheBrief: Story = {
  args: { row: protoRow },
  beforeEach: withEngine({ ...withProto, stepWork: { ...riskWork, key: 'prototype', summary: null, body: 'The one-page form works with a saved card (sample). A declined card is shown in place.' } }),
  parameters: { route: { path: '/tasks/:id/prototype', url: '/tasks/iss_sample20/prototype' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('tab', { name: 'For the brief' }))
    await expect(await c.findByText(/works with a saved card \(sample\)/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Ask the agent to carry on' })).toBeNull()
  },
}
/** The same with nothing written yet: it says so and points at the prototype, still with no carry-on button. */
export const PrototypeNothingWritten: Story = {
  args: { row: protoRow },
  beforeEach: withEngine({ ...withProto, stepWork: null }),
  parameters: { route: { path: '/tasks/:id/prototype', url: '/tasks/iss_sample20/prototype' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('tab', { name: 'For the brief' }))
    await expect(await c.findByText(/Nothing is written for the brief yet/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Ask the agent to carry on' })).toBeNull()
  },
}
/** An idea's prototype (made up): found by the idea, so the idea's step has View and Code like a task's. */
export const IdeaPrototype: Story = {
  args: { subject: { kind: 'ideas', id: 'idea_sample1' }, on: 'idea', base: '/ideas/idea_sample1', row: protoRow },
  beforeEach: withEngine({ prototypes: prototypes.map((p, i) => i === 0 ? { ...p, issueId: null, ideaId: 'idea_sample1' } : p), stepWork: null }),
  parameters: { route: { path: '/ideas/:id/prototype', url: '/ideas/idea_sample1/prototype' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'View' })).toHaveAttribute('aria-selected', 'true') // the prototype itself, in front
    await expect(await c.findByRole('tab', { name: 'Code' })).toBeInTheDocument()
    await userEvent.click(await c.findByRole('tab', { name: 'For the brief' }))
    await expect(c.queryByRole('button', { name: 'Ask the agent to carry on' })).toBeNull()
  },
}
const draftRow = { ...row('research'), key: 'brief', required: false, state: { key: 'brief', status: 'done', detail: 'Rough draft: one page for address and payment; likely a task (sample)' }, waitingOn: null } as typeof all[number]
/** An idea's rough draft (made up): what the agent wrote shows, under its one-line status, and nothing asks to start it or carry it on. */
export const IdeaRoughDraft: Story = {
  args: { subject: { kind: 'ideas', id: 'idea_sample1' }, on: 'idea', base: '/ideas/idea_sample1', row: draftRow },
  beforeEach: withEngine({ stepWork: { ...riskWork, key: 'brief', summary: null, body: '### What (sample)\nAddress and payment on one page.\n\n### Why\nMost people leave on the second page.' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Most people leave on the second page.')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /carry on/ })).toBeNull()
    await expect(c.queryByRole('button', { name: /Start with the agent/ })).toBeNull()
  },
}
/** Under way with nothing written yet: it says so, and still asks for nothing to be pressed. */
export const StartedNothingWritten: Story = {
  args: { row: { ...row('research'), state: { key: 'research', status: 'started', detail: 'Reading the competitors (sample)' } } },
  beforeEach: withEngine({ stepWork: { ...riskWork, key: 'research', status: 'started', summary: null, body: null, refs: [] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/nothing is written here yet/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /carry on/ })).toBeNull()
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

/** A prototype with no guide yet: it cannot be approved, and the step says why and who writes it (made-up sample). */
export const PrototypeNeedsAGuide: Story = {
  args: { row: { ...protoRow, state: { ...protoRow.state, needs: 'The prototype has no guide yet: what to try, in what order, and what you should see. Its agent writes one (set_guide) once its data is in place; then it can be approved.' } } as typeof all[number] },
  beforeEach: withEngine(withProto),
  parameters: { route: { path: '/tasks/:id/prototype', url: '/tasks/iss_sample20/prototype' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('note')).toHaveTextContent('has no guide yet')
    await expect(c.getByRole('button', { name: 'Approve the prototype' })).toBeDisabled()
  },
}
/** The Data step, not started: the task's own table of where each mock's data comes from, and the app's mocks, there before any agent is asked. It is optional: skipped, the app's defaults are used. */
export const Data: Story = {
  args: { row: { ...row('research'), key: 'data', required: false, state: { key: 'data', status: 'none' }, waitingOn: null } as typeof all[number] },
  beforeEach: withEngine({ stepWork: null }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Where its data comes from, for this task')).toBeInTheDocument()
    await expect(await c.findByRole('combobox', { name: 'Fraud scan vendor (sample), Reviewer' })).toBeInTheDocument()
  },
}
