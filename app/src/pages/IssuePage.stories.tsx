import type { Meta, StoryObj } from '@storybook/react-vite'
import { IssuePage } from './IssuePage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { approvedTaskStepsView, issueDetails } from '../stories/sample'

// One task at /tasks/:id, from the sample engine. Each story stands on a different task. A task has its own nav down
// the left: overview, its steps in the workflow's order ("UI change (sample)", in order), then the build.
const meta = { title: 'Pages/TaskPage', component: IssuePage, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><IssuePage /></div> } satisfies Meta<typeof IssuePage>
export default meta
type Story = StoryObj<typeof meta>
const at = (id: string, section?: string) => ({ route: { path: section ? '/tasks/:id/:section' : '/tasks/:id', url: `/tasks/${id}${section ? `/${section}` : ''}` } })
const approved = withEngine({ steps: { ...sampleData.steps, issues: approvedTaskStepsView }, issueDetails: { ...sampleData.issueDetails,
  iss_sample20: { ...issueDetails.iss_sample20, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z' },
  iss_sample1: { ...issueDetails.iss_sample1, briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-10-28T10:00:00Z' } } })

/** A task's home: what it's for, what stops it completing, the next step. The blast radius waits on the brief's approval, and so does the build. */
export const Overview: Story = { parameters: at('iss_sample20') }
/** A step's page: research, done, with its notes. */
export const ResearchStep: Story = { parameters: at('iss_sample20', 'research') }
/** The prototype's page: started, with the agent. */
export const PrototypeStep: Story = { parameters: at('iss_sample20', 'prototype') }
/** The brief's page: written, waiting for approval. */
export const BriefStep: Story = { parameters: at('iss_sample20', 'brief') }
/** A step the workflow puts after one not finished: greyed in the nav, and its page says where to go first. */
export const LockedStep: Story = { parameters: at('iss_sample20', 'risk') }
/** The brief approved: the blast radius and the build open; the build has a Plan button. */
export const BuildReady: Story = { parameters: at('iss_sample20', 'build'), beforeEach: approved }
/** A task planned: its sub-tasks, and what the planner decided. */
export const Planned: Story = { parameters: at('iss_sample1', 'build'), beforeEach: approved }
/** A sub-task being built: the builder's own steps, live, with the plan folded under them. */
export const SubTaskBuilding: Story = { parameters: at('iss_sample5') }
/** A sub-task not built yet: the planner's steps, from its brief. */
export const SubTaskAsPlanned: Story = { parameters: at('iss_sample6') }
/** A task in no project yet. */
export const InNoProject: Story = { parameters: at('iss_sample16') }
/** A failed build, with Retry. */
export const BuildFailed: Story = { parameters: at('iss_sample5'), beforeEach: withEngine({ issueDetails: { ...sampleData.issueDetails,
  iss_sample5: { ...issueDetails.iss_sample5, build: { status: 'failed', attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)' } } } }) }
export const Loading: Story = { parameters: at('iss_sample1'), beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { parameters: at('iss_sample1'), beforeEach: withEngine(engineDown) }
