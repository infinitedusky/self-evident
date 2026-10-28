import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Summary } from './Summary'
import { engineDown, withEngine } from '../stories/mock-engine'
import { summary } from '../stories/sample'

// The summary page, written by the agent: who is on what, and goals near, mid and long.
const meta = { title: 'Pages/Summary', component: Summary, parameters: { layout: 'fullscreen' }, render: () => <Shell><Summary /></Shell> } satisfies Meta<typeof Summary>
export default meta
type Story = StoryObj<typeof meta>

/** Written on schedule, from goals that were stated. */
export const Written: Story = {}
/** Goals inferred from the work: no initiatives or cycle stated. */
export const GoalsInferred: Story = { beforeEach: withEngine({ summary: { ...summary, focus: { ...summary.focus!, body: { ...summary.focus!.body, stated: false } } } }) }
/** Things moved since it was written. */
export const Stale: Story = { beforeEach: withEngine({ summary: { ...summary, stale: true } }) }
/** Being rewritten. */
export const Rewriting: Story = { beforeEach: withEngine({ summary: { ...summary, writing: true } }) }
/** Never written. */
export const NotWrittenYet: Story = { beforeEach: withEngine({ summary: { focus: null, writing: false, stale: false } }) }
/** Being written for the first time. */
export const WritingTheFirst: Story = { beforeEach: withEngine({ summary: { focus: null, writing: true, stale: false } }) }
/** No app added yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
