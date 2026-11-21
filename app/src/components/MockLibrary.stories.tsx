import type { Meta, StoryObj } from '@storybook/react-vite'
import { MockLibrary } from './MockLibrary'
import { withEngine } from '../stories/mock-engine'
import { mocks, sampleApp } from '../stories/sample'

// An app's mock library, in its settings. Made up: three invented services, one in each state.
const meta = { title: 'Components/MockLibrary', component: MockLibrary, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><MockLibrary {...a} /></div> } satisfies Meta<typeof MockLibrary>
export default meta
type Story = StoryObj<typeof meta>

/** One mined from a recording and in use, one assumed, one that needs a recording before it can be made. */
export const Library: Story = {}
/** Nothing yet. */
export const Empty: Story = { beforeEach: withEngine({ mocks: [] }) }
/** A live run was recorded; the recording waits to be mined. */
export const RecordedNotMined: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], needs: { ...mocks[2].needs!, recorded: '/sample/recordings' }, unmined: { at: '2026-11-20T14:00:00Z', files: 6 } }] }) }
/** A mined one whose service changed shape: it keeps serving, and needs a new recording. */
export const OutOfDate: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], needs: { person: 'one consenting person', key: 'FRAUD_SCAN_KEY', cost: 'one scan, about $2', why: 'the vendor added a social_accounts column (sample)' } }] }) }
/** Raised with no address for the real service: it cannot be recorded live until it has one, but a response the person already has can be given. */
export const NoAddressYet: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], upstream: null }] }) }
/** Raised with no task: nobody to mine it yet. */
export const NoTask: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], issue: null }] }) }
