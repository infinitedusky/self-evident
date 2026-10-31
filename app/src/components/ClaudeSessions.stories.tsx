import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ClaudeSessions } from './ClaudeSessions'
import { withEngine } from '../stories/mock-engine'

// Sessions run on the made-up Sample Shop in a terminal or an editor, newest first; one is already brought in.
const meta = { title: 'Components/ClaudeSessions', component: ClaudeSessions, parameters: { router: false },
  args: { appId: 'app_sample', appName: 'Sample Shop', onPicked: fn(), onClose: fn() },
  render: (a) => <div style={{ width: 345, border: '1px solid var(--line)' }}><ClaudeSessions {...a} /></div> } satisfies Meta<typeof ClaudeSessions>
export default meta
type Story = StoryObj<typeof meta>

export const List: Story = {}
export const None: Story = { beforeEach: withEngine({ claudeSessions: [] }) }
