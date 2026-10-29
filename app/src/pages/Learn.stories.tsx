import type { Meta, StoryObj } from '@storybook/react-vite'
import { Learn } from './Learn'
import { withEngine } from '../stories/mock-engine'

// Where learnings will land; nothing reads telemetry back yet.
const meta = { title: 'Pages/Learn', component: Learn, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Learn /></div> } satisfies Meta<typeof Learn>
export default meta
type Story = StoryObj<typeof meta>

/** With the sample app picked. */
export const Today: Story = {}
/** No app added yet: the page still explains itself. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
