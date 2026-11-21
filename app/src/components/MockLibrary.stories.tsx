import type { Meta, StoryObj } from '@storybook/react-vite'
import { MockLibrary } from './MockLibrary'
import { expect, userEvent, within } from 'storybook/test'
import { withEngine } from '../stories/mock-engine'
import { mocks, sampleApp } from '../stories/sample'

// An app's mock library, in its settings. Made up: three invented services, one in each state.
const meta = { title: 'Components/MockLibrary', component: MockLibrary, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><MockLibrary {...a} /></div> } satisfies Meta<typeof MockLibrary>
export default meta
type Story = StoryObj<typeof meta>

/** One made from a real response, with three sets of data (a fake that is its default, one written by hand, the real response itself), one assumed with data a person provided, one that needs a real response before it can be made. */
export const Library: Story = {}
/** Nothing yet. */
export const Empty: Story = { beforeEach: withEngine({ mocks: [] }) }
/** A real response is in and the task's agent has been asked to build the mock: it says so once, with a way to ask again, and no second button to do the same thing. */
export const RecordedNotMined: Story = {
  beforeEach: withEngine({ mocks: [{ ...mocks[2], needs: { ...mocks[2].needs!, recorded: '/sample/recordings' }, unmined: { at: '2026-11-20T14:00:00Z', files: 6 } }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/The task's agent is building the mock from it/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Ask again' })).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Mine it' })).toBeNull()
  },
}
/** A mock that is built, with a newer real response nobody has been asked about: it can be asked for. */
export const NewerResponseWaiting: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], unmined: { at: '2026-11-21T09:00:00Z', files: 1 } }] }) }
/** A mined one whose service changed shape: it keeps serving, and needs a new recording. */
export const OutOfDate: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], needs: { person: 'one consenting person', key: 'FRAUD_SCAN_KEY', cost: 'one scan, about $2', why: 'the vendor added a social_accounts column (sample)' } }] }) }
/** Raised with no address for the real service: it cannot be recorded live until it has one, but a response the person already has can be given. */
export const NoAddressYet: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], upstream: null }] }) }
/** Raised with no task: nobody to mine it yet. */
export const NoTask: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], issue: null }] }) }
/** Its default is the real response: it serves that here, and cannot be exported until a fake is the default. */
export const DefaultIsReal: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], defaultData: 'real', data: mocks[0].data.map((d) => ({ ...d, isDefault: d.key === 'real' })) }] }) }
/** A server with no data of its own yet. */
export const NoDataYet: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], defaultData: null, data: [] }] }) }
/** On a task's Data step: the task's own table first, then the app's mocks, where a service can be added for this task. */
export const OnATask: Story = { args: { issueId: 'iss_sample2' } }
/** Adding a service on a task: its name and, in the same form, a real response you already have. The address and variables are only for recording a live run, and are tucked away. */
export const AddingAService: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a service' }))
    await expect(c.getByRole('textbox', { name: 'The service' })).toBeInTheDocument()
    await expect(c.getByLabelText(/A real response you already have/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByRole('textbox', { name: 'The service' }), 'Payments (sample)')
    await expect(c.getByRole('button', { name: 'Add' })).toBeEnabled()
  },
}
/** A service with ten calls: one has a real response behind it, one was recorded in a live run, eight are taken from the code. Each says which, and any of them can be given a real response. */
export const TenEndpoints: Story = {
  args: { issueId: 'iss_sample1' },
  beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: [
    ...mocks[0].endpoints,
    { key: 'cost', method: 'GET', path: '/workflows/runs/{id}/cost', what: 'What the run cost, in credits', real: { at: '2026-11-20T14:00:00Z', how: 'recorded' }, files: ['cost.json'] },
    ...['cancel', 'retry', 'webhooks', 'account', 'limits'].map((k) => ({ key: k, method: k === 'cancel' || k === 'retry' ? 'POST' : 'GET', path: k === 'cancel' || k === 'retry' ? `/workflows/runs/{id}/${k}` : `/${k}`, what: `(sample) ${k}`, real: null, files: [] })),
  ] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('10 calls: 2 with a real response behind them, 8 taken from the code')).toBeInTheDocument()
  },
}
/** A data file that is no endpoint's: said, so it can be put right. */
export const UnlinkedFile: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], unlinked: ['sample-people.csv'] }] }) }
/** A mock built before endpoints were listed: it says so, and the task's agent can be asked to list them. */
export const EndpointsNotListed: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: [], unlinked: [] }] }) }
