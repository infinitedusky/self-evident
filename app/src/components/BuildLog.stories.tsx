import type { Meta, StoryObj } from '@storybook/react-vite'
import { BuildLog } from './BuildLog'
import { engineDown, eventStream, withEngine } from '../stories/mock-engine'
import { buildEvents } from '../stories/sample'

// A sub-task's build as it happens: steps, then one line per action. The events are a sample builder at work.
const meta = { title: 'Components/BuildLog', component: BuildLog, parameters: { layout: 'fullscreen', router: false }, args: { issueId: 'iss_sample5' }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof BuildLog>
export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = { beforeEach: withEngine([eventStream(buildEvents)]) }
/** Queued behind another build: held, nothing done yet. */
export const Held: Story = { args: { issueId: 'iss_sample6' } }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
