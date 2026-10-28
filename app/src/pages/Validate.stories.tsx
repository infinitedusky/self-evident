import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Validate } from './Validate'
import { withEngine } from '../stories/mock-engine'

// What validates a build today, and what lands here next.
const meta = { title: 'Pages/Validate', component: Validate, parameters: { layout: 'fullscreen' }, render: () => <Shell><Validate /></Shell> } satisfies Meta<typeof Validate>
export default meta
type Story = StoryObj<typeof meta>

/** With the sample app picked. */
export const Today: Story = {}
/** No app added yet: the page still explains itself. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
