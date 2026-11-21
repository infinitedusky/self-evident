import type { Meta, StoryObj } from '@storybook/react-vite'
import { MockPlaces } from './MockPlaces'
import { withEngine } from '../stories/mock-engine'
import { mockPlaces, mockPlacesForTask, sampleApp } from '../stories/sample'

// Where each mock's data comes from for a prototype, a smoke test and a reviewer. Made up: three invented services.
const meta = { title: 'Components/MockPlaces', component: MockPlaces, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><MockPlaces {...a} /></div> } satisfies Meta<typeof MockPlaces>
export default meta
type Story = StoryObj<typeof meta>

/** The app's defaults, in its settings: smoke tests replay the real response, a reviewer gets a fake of it. */
export const AppDefaults: Story = {}
/** One task's own: its smoke test calls the real vendor, its prototype shows the person with nothing found, and its reviewer follows the app. */
export const ForATask: Story = { args: { issueId: 'iss_sample2' } }
/** The mock's default is a real response and nothing says otherwise for a reviewer: the reviewer's copy cannot be made, and says why. */
export const ReviewerBlocked: Story = { beforeEach: withEngine({ mockPlaces: [{ ...mockPlaces[0], places: { ...mockPlaces[0].places, review: { ...mockPlaces[0].places.review, data: { key: 'real', name: 'The real response (sample)', kind: 'real' }, choice: { source: 'default' }, from: 'none', app: null, says: 'A real response, as it is (18 Nov 2026): this computer only', blocked: 'Fraud scan vendor (sample) would answer a reviewer with a real response, which never leaves this computer: choose a fake, or data that holds nothing real' } } }] }) }
/** A fake was chosen before there is one: it says what serves meanwhile, and what it is waiting for. */
export const WaitingForAFake: Story = { args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ mockPlacesForTask: [{ ...mockPlacesForTask[1], real: '2026-11-21T08:00:00Z', places: { ...mockPlacesForTask[1].places, prototype: { ...mockPlacesForTask[1].places.prototype, choice: { source: 'fake' }, from: 'task', own: { source: 'fake' }, note: 'its fake is not made yet: the task\'s agent makes it from the real response' } } }] }) }
/** An app with no mocks. */
export const NothingToMock: Story = { beforeEach: withEngine({ mockPlaces: [] }) }
