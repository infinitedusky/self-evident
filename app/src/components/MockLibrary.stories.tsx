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
/** On a task's Data step: what the task calls first (a service comes into being from a call, and a file is given on the call it answers), then the task's own table, then each mock in full, folded. */
export const OnATask: Story = { args: { issueId: 'iss_sample2' } }
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
/** Removing a mock: it says what goes with it, and asks whether its real responses are deleted from this computer too, so nothing is left for the next one to trip over. */
export const RemovingAMock: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Remove the mock' }))
    await expect(await c.findByRole('checkbox', { name: /Also delete its 2 real responses from this computer/ })).toBeChecked()
    await userEvent.click(c.getByRole('button', { name: 'Remove it' }))
    await expect(await c.findByText(/No services yet/)).toBeInTheDocument()
  },
}
/** Its real responses on this computer, each deletable: one of them was left by a mock that was removed, and says it is not used. */
export const RealResponses: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('Real responses on this computer'))
    await expect(await c.findByText(/From before this mock was made: it is not used/)).toBeInTheDocument()
    await expect(c.getAllByRole('button', { name: /Delete the real response of/ })).toHaveLength(2)
  },
}
/** An endpoint being edited: its method, its path and what it answers with; or taken off the mock. */
export const EditingAnEndpoint: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: /^Edit the call/ }))[1])
    const what = c.getByRole('textbox', { name: 'What it answers with' })
    await userEvent.clear(what); await userEvent.type(what, 'Running, then completed, then failed (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save the call' }))
    await expect(await c.findByText('Running, then completed, then failed (sample)')).toBeInTheDocument()
    await expect(c.getAllByRole('button', { name: /^Remove the call/ })).toHaveLength(4)
  },
}
/** A service added in the app's settings: its name and what it is. One already there, written differently, is refused. */
export const AddingAService: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a service' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The service' }), 'breach-LOOKUP (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('that is already one of this app\'s services, as "Breach lookup (sample)"')).toBeInTheDocument()
    await userEvent.clear(c.getByRole('textbox', { name: 'The service' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The service' }), 'Payments (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('Payments (sample)')).toBeInTheDocument()
  },
}
/** A service is described by how the app really connects to it: its real address, and the names of the app's settings that hold the address and the key. Nothing about mocks is asked. */
export const TheRealConnection: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('FRAUD_SCAN_BASE_URL')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Edit' }))
    await expect(c.getByRole('textbox', { name: 'Its real address' })).toHaveValue('https://api.fraud-scan.example')
    await expect(c.getByRole('textbox', { name: "The app's setting that holds that address" })).toHaveValue('FRAUD_SCAN_BASE_URL')
    await expect(c.getByRole('textbox', { name: /The app's setting that holds its key/ })).toHaveValue('FRAUD_SCAN_API_KEY')
    await expect(canvasElement.textContent).not.toContain('container_url')
  },
}
