import type { Meta, StoryObj } from '@storybook/react-vite'
import { Now } from './Now'
import { engineDown, withEngine } from '../stories/mock-engine'
import { now, quietNow, T0 } from '../stories/sample'

// My Stuff, from the sample engine: what needs you, what's running, what just happened.
const meta = { title: 'Pages/Now', component: Now, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Now /></div> } satisfies Meta<typeof Now>
export default meta
type Story = StoryObj<typeof meta>
const where = { projectId: 'proj_checkout', projectName: 'One-page checkout (sample)', appName: 'Sample Shop' }

/** A busy day: a question, a backlog to settle, a to-do, a teammate's review; one project running. */
export const Busy: Story = {}
/** Nothing needs you and nothing runs. */
export const Quiet: Story = { beforeEach: withEngine({ now: quietNow }) }
/** Every kind of thing that can need you, once each. */
export const EveryKindOfAttention: Story = { beforeEach: withEngine({ now: { ...now, counts: { ...now.counts, needsYou: 9 }, needsYou: [
  { kind: 'failed_build', issueId: 'iss_sample5', identifier: 'SS-5', title: 'A declined card is shown in place', error: 'landing failed at test: tests failed (exit 1)', ...where },
  { kind: 'run_project', subIssues: 4, ...where, projectId: 'proj_draft', projectName: 'Gift cards (sample)' },
  { kind: 'plan_issue', issueId: 'iss_sample2', identifier: 'SS-2', issueTitle: 'Totals and analytics', ...where },
  { kind: 'merge_pr', prNumber: 42, url: 'https://github.com/example/sample-shop/pull/42', review: 'APPROVED', checks: 'passing', failing: [], ...where },
  { kind: 'pr_feedback', prNumber: 42, url: 'https://github.com/example/sample-shop/pull/42', review: 'CHANGES_REQUESTED', checks: 'failing', failing: ['test (sample)'], ...where },
  { kind: 'behind_main', files: 'web/checkout/submit.ts\nweb/cart/Cart.tsx', commits: 3, ...where },
  { kind: 'overlap', prNumber: 51, title: 'Sample: fix the footer links', author: 'a-teammate', url: 'https://github.com/example/sample-shop/pull/51', files: ['web/checkout/submit.ts'], ...where },
  ...now.needsYou,
] } }) }
/** The model is rate-limited: everything waits, nothing has failed. */
export const WaitingForTheModel: Story = { beforeEach: withEngine({ now: { ...now, hold: { until: new Date(Date.parse(T0) + 15 * 60_000).toISOString(), reason: 'The model is busy (rate limited).', level: 1 } } }) }
/** No app added yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
