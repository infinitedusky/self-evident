import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plan } from './Plan'
import { engineDown, withEngine } from '../stories/mock-engine'

// Plan's page, live, at /plan: the engine's view drawn by PlanHome. Made-up data from the sample engine.
const meta = { title: 'Pages/Plan', component: Plan, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Plan /></div> } satisfies Meta<typeof Plan>
export default meta
type Story = StoryObj<typeof meta>

export const Live: Story = {}
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
