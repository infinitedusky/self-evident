import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Issues } from './Issues'
import { engineDown, withEngine } from '../stories/mock-engine'
import { issueRows } from '../stories/sample'
import type { IssueRow } from '../engine'

// Every code issue of the app at /issues: the ones in no project first, then by project.
const meta = { title: 'Pages/Issues', component: Issues, parameters: { layout: 'fullscreen' }, render: () => <Shell><Issues /></Shell> } satisfies Meta<typeof Issues>
export default meta
type Story = StoryObj<typeof meta>

const placed = issueRows[0]
// Made up: each standing the list can show, one row each.
const standings: IssueRow[] = [
  ...issueRows,
  { ...placed, id: 'iss_sample20', identifier: 'SS-20', number: 20, title: 'Gift card codes (sample)', state: 'todo', builds: {}, planning: null, description: 'Not planned yet: has a Plan button.' },
  { ...placed, id: 'iss_sample21', identifier: 'SS-21', number: 21, title: 'Gift card balance (sample)', state: 'todo', builds: {}, planning: 'issue.planning', description: null },
  { ...placed, id: 'iss_sample22', identifier: 'SS-22', number: 22, title: 'Gift card emails (sample)', state: 'todo', builds: {}, planning: 'issue.plan_waiting', description: null },
  { ...placed, id: 'iss_sample23', identifier: 'SS-23', number: 23, title: 'Refunds to a gift card (sample)', state: 'todo', builds: {}, planning: 'issue.plan_failed', description: null },
  { ...placed, id: 'iss_sample24', identifier: 'SS-24', number: 24, title: 'Faster product images (sample)', state: 'in_progress', builds: { done: 1, failed: 1 }, planning: null, description: null },
  { ...placed, id: 'iss_sample25', identifier: 'SS-25', number: 25, title: 'Product page cache (sample)', state: 'in_review', builds: { done: 3 }, planning: null, description: null },
  { ...placed, id: 'iss_sample26', identifier: 'SS-26', number: 26, title: 'Old banner removed (sample)', state: 'done', builds: { done: 1 }, planning: null, description: null },
]

/** The sample app: one issue in no project (with "Add to a project…"), two in the checkout project. */
export const Typical: Story = {}
/** Every standing an issue can show: not planned, planning, waiting for the model, planning failed, a failed build, in review, done. */
export const EveryStanding: Story = { beforeEach: withEngine({ issueRows: standings }) }
/** Only issues in no project, and no open project to send them to. */
export const NothingToAddTo: Story = { beforeEach: withEngine({ issueRows: [issueRows[2]], projects: [] }) }
/** No issues yet. */
export const Empty: Story = { beforeEach: withEngine({ issueRows: [] }) }
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
