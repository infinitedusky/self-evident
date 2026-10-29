import type { Meta, StoryObj } from '@storybook/react-vite'
import { PagePane } from './PagePane'
import { withEngine } from '../stories/mock-engine'

// One page in a tab, with its own history: links stay in the tab, ⌘-click opens a new one (in the workspace).
const meta = { title: 'Components/PagePane', component: PagePane, parameters: { layout: 'fullscreen', router: false }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof PagePane>
export default meta
type Story = StoryObj<typeof meta>

export const MyStuff: Story = { args: { path: '/' }, beforeEach: withEngine() }
export const AnIssue: Story = { args: { path: '/issues/iss_sample5' } }
/** A path no page has. */
export const NoSuchPage: Story = { args: { path: '/nowhere' } }
