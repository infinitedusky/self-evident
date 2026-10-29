import type { Meta, StoryObj } from '@storybook/react-vite'
import { Observe } from './Observe'
import { withEngine } from '../stories/mock-engine'

// What the app says about itself; metrics and promises are not connected yet.
const meta = { title: 'Pages/Observe', component: Observe, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Observe /></div> } satisfies Meta<typeof Observe>
export default meta
type Story = StoryObj<typeof meta>

/** With the sample app picked. */
export const Today: Story = {}
/** No app added yet: the page still explains itself. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
