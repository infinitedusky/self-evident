import type { Meta, StoryObj } from '@storybook/react-vite'
import { IssuePage } from './IssuePage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { issueDetails } from '../stories/sample'

// One issue at /issues/:id, from the sample engine. Each story stands on a different issue.
const meta = { title: 'Pages/IssuePage', component: IssuePage, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><IssuePage /></div> } satisfies Meta<typeof IssuePage>
export default meta
type Story = StoryObj<typeof meta>
const at = (id: string) => ({ route: { path: '/issues/:id', url: `/issues/${id}` } })

/** A top-level code issue, planned: its sub-issues as a list, and what the planner decided. */
export const Planned: Story = { parameters: at('iss_sample1') }
/** A sub-issue being built: the builder's own steps, live, with the plan folded under them. */
export const SubIssueBuilding: Story = { parameters: at('iss_sample5') }
/** A sub-issue not built yet: the planner's steps, from its brief. */
export const SubIssueAsPlanned: Story = { parameters: at('iss_sample6') }
/** An issue in no project yet. */
export const InNoProject: Story = { parameters: at('iss_sample16') }
/** A failed build, with Retry. */
export const BuildFailed: Story = { parameters: at('iss_sample5'), beforeEach: withEngine({ issueDetails: { ...sampleData.issueDetails,
  iss_sample5: { ...issueDetails.iss_sample5, build: { status: 'failed', attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)' } } } }) }
export const Loading: Story = { parameters: at('iss_sample1'), beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { parameters: at('iss_sample1'), beforeEach: withEngine(engineDown) }
