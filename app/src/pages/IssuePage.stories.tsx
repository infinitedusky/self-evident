import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, spyOn, userEvent, within } from 'storybook/test'
import { IssuePage } from './IssuePage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { acceptance, approvedTaskStepsView, issueDetails, waitingTaskStepsView } from '../stories/sample'

// One task at /tasks/:id, from the sample engine. Each story stands on a different task. A task has its own nav down
// the left: overview, then its two stages: the brief, with the steps that feed it under it ("UI change (sample)", in
// order), and the build. On the right, the task's own agent, which stays as the step changes.
const meta = { title: 'Pages/TaskPage', component: IssuePage, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><IssuePage /></div> } satisfies Meta<typeof IssuePage>
export default meta
type Story = StoryObj<typeof meta>
const at = (id: string, section?: string) => ({ route: { path: section ? '/tasks/:id/:section' : '/tasks/:id', url: `/tasks/${id}${section ? `/${section}` : ''}` } })
const approved = withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails,
  iss_sample20: { ...issueDetails.iss_sample20, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z' },
  iss_sample1: { ...issueDetails.iss_sample1, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z' } } })

/** A task's home: what it's for, what stops it completing, the next step. The brief waits on the blast radius, and the build on the brief's approval. */
export const Overview: Story = { parameters: at('iss_sample20') }
/** A step's page: research, approved, with its notes and a way to take the approval back. */
export const ResearchStep: Story = { parameters: at('iss_sample20', 'research') }
/** The mockups' page: the agent says it is done, so it is ready for you, with Approve; the task's Storybook right on it (here not running). */
export const MockupsStep: Story = { parameters: at('iss_sample20', 'mockup') }
/** The prototype's page: started, with the agent. */
export const PrototypeStep: Story = { parameters: at('iss_sample20', 'prototype') }
/** The brief's page: written, what it stands on listed under it; it can be approved once the blast radius is done. */
export const BriefStep: Story = { parameters: at('iss_sample20', 'brief') }
/** The brief ready to approve, with its acceptance criteria: approving it says they are enough, and one the prototype did not show is named. */
export const BriefWithAcceptanceCriteria: Story = {
  parameters: at('iss_sample20', 'brief'),
  beforeEach: withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails, iss_sample20: { ...issueDetails.iss_sample20, acceptance } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Approve the brief and its 5 criteria' })).toBeInTheDocument()
    await expect(c.getByText(/Approving it approves its 5 acceptance criteria as enough; 1 was not shown in the prototype; 1 is left to the final build, unproven/)).toBeInTheDocument()
  },
}
/** A step the workflow puts after one not finished (the mockups): greyed in the nav, and its page says where to go first. */
export const LockedStep: Story = { parameters: at('iss_sample20', 'risk'), beforeEach: withEngine({ steps: { ...sampleData.steps, issues: waitingTaskStepsView } }) }
/** Every required step done and the brief approved: the build opens, with a Plan button. */
export const BuildReady: Story = { parameters: at('iss_sample20', 'build'), beforeEach: approved }
/** A task planned: its sub-tasks, and what the planner decided. */
export const Planned: Story = { parameters: at('iss_sample1', 'build'), beforeEach: approved }
/** Planned, and its project has not been run: "Ready to build" with Build it. */
export const PlannedNotRun: Story = {
  parameters: at('iss_sample1', 'build'),
  beforeEach: withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails,
    iss_sample1: { ...issueDetails.iss_sample1, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z', project: { ...issueDetails.iss_sample1.project!, status: 'drafting' } } } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Build it' })).toBeInTheDocument() },
}
// Made up: the planner ran twice on the sample task, and the first run's two sub-tasks were canceled as duplicates.
const s1 = issueDetails.iss_sample1
const dropped = s1.subIssues.map((s, n) => ({ ...s, id: `iss_dropped${n}`, identifier: `SH-9${n}`, title: `${s.title} (first plan, sample)`, state: 'canceled' as const, reason: 'Duplicate plan: the planner ran twice (sample)', build: { status: 'queued' as const, attempt: 0, heldReason: null } }))
/** Canceled sub-tasks are out of the count and folded away under the list, each as canceled with why, never as queued. */
export const CanceledSubTasks: Story = {
  parameters: at('iss_sample1', 'build'),
  beforeEach: withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails, iss_sample1: { ...s1, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z', subIssues: [...dropped, ...s1.subIssues] } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const fold = await c.findByText(/2 canceled/)
    await expect(c.getByRole('heading', { name: /Sub-tasks/ })).toHaveTextContent(`/${s1.subIssues.length}`) // the two canceled are not counted
    await expect(c.getAllByText(/first plan, sample/, { selector: 'a' })[0]).not.toBeVisible()
    await userEvent.click(fold)
    await expect(c.getAllByText('Canceled')).toHaveLength(2)
    await expect(c.getAllByText(/Duplicate plan: the planner ran twice/)).toHaveLength(2)
  },
}
/** A sub-task being built: the builder's own steps, live, with the plan folded under them. */
export const SubTaskBuilding: Story = { parameters: at('iss_sample5') }
/** A sub-task not built yet: the planner's steps, from its brief. */
export const SubTaskAsPlanned: Story = { parameters: at('iss_sample6') }
/** A prototype started on the task: its agent shows as a second tab in the task's agent column, working. */
export const PrototypeAgentOut: Story = { parameters: at('iss_sample20', 'prototype'), beforeEach: withEngine({ taskAgents: [{ sessionId: 'talk_sample_proto', kind: 'prototype', what: 'Prototype', title: 'Checkout in one page (sample)', busy: true }] }) }
/** The prototype approved, the checks running by themselves: each fresh agent is a tab in the task's column, the one at work pulsing. */
export const ChecksRunning: Story = { parameters: at('iss_sample20', 'prototype'), beforeEach: withEngine({ taskAgents: [
  { sessionId: 'talk_sample_proto', kind: 'prototype', what: 'Prototype', icon: '🛠️', title: 'Checkout in one page (sample)', busy: false },
  { sessionId: 'talk_sample_analysis', kind: 'check', check: 'analysis', what: 'Prototype analysis', icon: '🔬', title: 'Prototype analysis: SS-20 (sample)', busy: false },
  { sessionId: 'talk_sample_adr', kind: 'check', check: 'adr', what: 'Draft ADR', icon: '🏛️', title: 'Draft ADR: SS-20 (sample)', busy: true },
] }) }
/** A task nobody has started an agent on: the column offers one button. */
export const NoAgentYet: Story = { parameters: at('iss_sample20'), beforeEach: withEngine({ taskTalk: null }) }
/** A task in no project yet. */
export const InNoProject: Story = { parameters: at('iss_sample16') }
/** A task in no project, brief approved: it can be planned where it is, on its own. */
export const InNoProjectReadyToPlan: Story = {
  parameters: at('iss_sample16', 'build'),
  beforeEach: withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails, iss_sample16: { ...issueDetails.iss_sample16, state: 'todo', briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z' } } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Plan it' })).toBeInTheDocument() },
}
/** The same task once planned on its own: still "In no project" at the top, with the way to its plan and build. */
export const PlannedOnItsOwn: Story = {
  parameters: at('iss_sample16', 'build'),
  beforeEach: withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails, iss_sample16: { ...issueDetails.iss_sample16, state: 'todo', briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z',
    project: { id: 'proj_solo', name: 'Search results load too slowly', status: 'drafting', solo: true }, subIssues: issueDetails.iss_sample1.subIssues } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: /Its plan and build/ })).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'In no project' })).toBeInTheDocument()
  },
}
/** A ticket tkt built, done: what the skills wrote on it as it moved (the plan, the handoff, the completion), one per heading. */
export const Commented: Story = { parameters: at('iss_sample22') }
/** A failed build, with Retry. */
export const BuildFailed: Story = { parameters: at('iss_sample5'), beforeEach: withEngine({ issueDetails: { ...sampleData.issueDetails,
  iss_sample5: { ...issueDetails.iss_sample5, build: { status: 'failed', attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)' } } } }) }
/** Delete, on a task with work on it: the engine refuses and says what to do instead (made up: two agent runs). */
export const DeleteRefused: Story = {
  parameters: at('iss_sample16'),
  beforeEach: (ctx) => { spyOn(window, 'confirm').mockReturnValue(true); withEngine({ deleteProblem: "SS-16 has work on it (2 agent runs), so it can't be deleted: cancel it instead, and its record stays." })(ctx) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Delete' }))
    await expect(await c.findByText(/has work on it \(2 agent runs\)/)).toBeVisible()
    await expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("This can't be undone."))
  },
}
/** Delete, asked and declined: nothing happens. */
export const DeleteDeclined: Story = {
  parameters: at('iss_sample16'),
  beforeEach: () => { spyOn(window, 'confirm').mockReturnValue(false) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Delete' }))
    await expect(c.getByRole('button', { name: 'Delete' })).toBeEnabled()
  },
}
export const Loading: Story = { parameters: at('iss_sample1'), beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { parameters: at('iss_sample1'), beforeEach: withEngine(engineDown) }
