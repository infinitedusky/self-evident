import type { Meta, StoryObj } from '@storybook/react-vite'
import { IssuePage } from './IssuePage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { approvedTaskStepsView, issueDetails, waitingTaskStepsView } from '../stories/sample'

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
/** A step the workflow puts after one not finished (the mockups): greyed in the nav, and its page says where to go first. */
export const LockedStep: Story = { parameters: at('iss_sample20', 'risk'), beforeEach: withEngine({ steps: { ...sampleData.steps, issues: waitingTaskStepsView } }) }
/** Every required step done and the brief approved: the build opens, with a Plan button. */
export const BuildReady: Story = { parameters: at('iss_sample20', 'build'), beforeEach: approved }
/** A task planned: its sub-tasks, and what the planner decided. */
export const Planned: Story = { parameters: at('iss_sample1', 'build'), beforeEach: approved }
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
  { sessionId: 'talk_sample_adr', kind: 'check', check: 'adr', what: 'ADR', icon: '🏛️', title: 'ADR: SS-20 (sample)', busy: true },
] }) }
/** A task nobody has started an agent on: the column offers one button. */
export const NoAgentYet: Story = { parameters: at('iss_sample20'), beforeEach: withEngine({ taskTalk: null }) }
/** A task in no project yet. */
export const InNoProject: Story = { parameters: at('iss_sample16') }
/** A ticket tkt built, done: what the skills wrote on it as it moved (the plan, the handoff, the completion), one per heading. */
export const Commented: Story = { parameters: at('iss_sample22') }
/** A failed build, with Retry. */
export const BuildFailed: Story = { parameters: at('iss_sample5'), beforeEach: withEngine({ issueDetails: { ...sampleData.issueDetails,
  iss_sample5: { ...issueDetails.iss_sample5, build: { status: 'failed', attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)' } } } }) }
export const Loading: Story = { parameters: at('iss_sample1'), beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { parameters: at('iss_sample1'), beforeEach: withEngine(engineDown) }
