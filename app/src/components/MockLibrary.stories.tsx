import type { Meta, StoryObj } from '@storybook/react-vite'
import { MockLibrary } from './MockLibrary'
import { expect, userEvent, within } from 'storybook/test'
import { withEngine } from '../stories/mock-engine'
import { mocks, sampleApp, sensitiveEndpoint, unfakedEndpoint } from '../stories/sample'

// An app's services, in its settings. Made up: three invented services, one in each state.
const meta = { title: 'Components/MockLibrary', component: MockLibrary, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><MockLibrary {...a} /></div> } satisfies Meta<typeof MockLibrary>
export default meta
type Story = StoryObj<typeof meta>

/** Made up: a service a task's agent has raised as needing a real response before the change can be tried. */
const raised = { ...mocks[2], status: 'needs_recording' as const, needs: { person: 'one consenting person, who agrees to their address being looked up', key: 'ADDRESS_LOOKUP_KEY', cost: 'one lookup, about $0.40', why: 'SS-2 shows the matched address', file: 'the JSON a lookup returns (sample)', at: '2026-11-20T09:00:00Z' } }

/** Each service reads top to bottom: what it is and how the app reaches it, what each place is given, then its endpoints, each with its own data. One has a real response and a fake of it on one endpoint, one has a file a person provided, one is not built yet. */
export const Library: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect((await c.findAllByText('What each place is given')).length).toBe(3)
    await expect(c.getByText('4 calls: 1 with data, 3 answered with what the server makes up')).toBeInTheDocument()
    await expect(c.getByText(/A fake of it: results.csv/)).toBeInTheDocument()
    await expect(c.getByText(/A file stated to hold nothing real: search.json/)).toBeInTheDocument()
    await expect(canvasElement.textContent).not.toMatch(/Make default|Record and/) // no named sets, and recording is not a source
  },
}
/** A service just added, with no endpoints: nothing is waiting to be built. It says to add an endpoint, and that is all it needs. */
export const JustAdded: Story = {
  beforeEach: withEngine({ mocks: [{ ...mocks[2], served: 'none', endpoints: [] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('No endpoints yet')).toBeInTheDocument()
    await expect(c.getByText(/Add an endpoint below and it can be served\. Nothing has to be built\./)).toBeInTheDocument()
    await expect(canvasElement.textContent).not.toMatch(/Not built yet|Not in use right now/)
    await expect(c.queryByRole('link', { name: 'Export' })).toBeNull()
  },
}
/** A service with an endpoint and no server written for it: it is served straight from its endpoints, and says how many have data. */
export const ServedFromItsEndpoints: Story = {
  beforeEach: withEngine({ mocks: [mocks[2]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Served from its endpoints')).toBeInTheDocument()
    await expect(c.getByText(/Served straight from its endpoints: each call is answered with that endpoint's data\. 0 of 1 has data\./)).toBeInTheDocument()
    await expect(c.getByText('No data yet: a call to it fails until some is added.')).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'Export' })).toBeInTheDocument()
  },
}
/** Its variable to override is not set, so the app cannot be pointed at it: said in its profile, where it is set. */
export const CannotBePointedAt: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[2], pointed: false, env: {}, connection: { ...mocks[2].connection, addressSetting: null } }] }) }
/** Nothing yet. */
export const Empty: Story = { beforeEach: withEngine({ mocks: [] }) }
/** A real response is in and the task's agent has been asked to build the mock: it says so once, with a way to ask again, and no second button to do the same thing. */
export const RecordedNotMined: Story = {
  beforeEach: withEngine({ mocks: [{ ...raised, needs: { ...raised.needs, recorded: '/sample/recordings' }, unmined: { at: '2026-11-20T14:00:00Z', files: 6 } }] }),
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
export const NoAddressYet: Story = { beforeEach: withEngine({ mocks: [{ ...raised, upstream: null }] }) }
/** Raised with no task: nobody to mine it yet. */
export const NoTask: Story = { beforeEach: withEngine({ mocks: [{ ...raised, issue: null }] }) }
/** No endpoint has data yet: each is answered with what the server makes up, and data can be added to any of them. */
export const NoDataYet: Story = {
  beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: mocks[0].endpoints.map((e) => ({ ...e, real: null, files: [], data: { app: null, task: null } })) }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('4 calls: 0 with data, 4 answered with what the server makes up')).toBeInTheDocument()
    await expect(c.getAllByRole('button', { name: /^Add the data of/ })).toHaveLength(4)
  },
}
/** Data is added on the endpoint it answers: a file, and whether the service really sent it or it holds nothing real. Here one a person made up: it is used as it is. It can then be replaced or removed. */
export const AddingData: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add the data of POST /workflows/run' }))
    await expect(c.getByRole('checkbox', { name: 'This is real data' })).toBeChecked()
    await expect(c.getByText(/kept on this computer only, and a faked version is made of it/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('checkbox', { name: 'This is real data' })) // unticked: it holds nothing real
    await userEvent.upload(c.getByLabelText('A file for POST /workflows/run'), new File(['{"job_id":"sample"}'], 'start.json', { type: 'application/json' }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(await c.findByText(/A file stated to hold nothing real: start.json/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Remove the data of POST /workflows/run' })).toBeInTheDocument()
  },
}
/** A sensitive endpoint: a real response of it is never stored. One given is faked at once and the original is not kept; the form says so before the file is chosen. */
export const SensitiveEndpoint: Story = {
  beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: [...mocks[0].endpoints, sensitiveEndpoint] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Sensitive')).toBeInTheDocument()
    await expect(c.getByText(/A fake; the original was not kept: profile.json/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Replace the data of GET /people/{id}/profile' }))
    await expect(c.getByText(/This call is sensitive, so the file is faked at once and the original is not kept/)).toBeInTheDocument()
  },
}
/** An endpoint is added in the service's settings, and can be marked sensitive as it is. */
export const AddingAnEndpoint: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add an endpoint to Fraud scan vendor (sample)' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The call' }), '/people/{id}/profile')
    await userEvent.click(c.getByRole('checkbox', { name: 'Sensitive: never store a real response of it' }))
    await expect(c.getByText(/it cannot be faked again differently later/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Add the endpoint' }))
    await expect(await c.findByText('5 calls: 1 with data, 4 answered with what the server makes up')).toBeInTheDocument()
    await expect(c.getByText('Sensitive')).toBeInTheDocument()
  },
}
/** A call made in two steps: one endpoint answers with a link, and the next step is called on that link. The first is marked intermediate and the step sits under it. A step is added by picking the endpoint it follows and the field that holds the link. */
export const TwoSteps: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Intermediate')).toBeInTheDocument()
    await expect(c.getByText('Called on the link that GET /workflows/runs/{id}/links answers with.')).toBeInTheDocument()
    const rows = [...canvasElement.querySelectorAll('[data-component="MockEndpoints"] .mock-endpoints-row')].map((r) => r.textContent ?? '')
    await expect(rows.findIndex((t) => t.includes('Next step:'))).toBe(rows.findIndex((t) => t.includes('Intermediate')) + 1) // right under the endpoint it follows
    await userEvent.click(c.getByRole('button', { name: 'Add an endpoint to Fraud scan vendor (sample)' }))
    await userEvent.click(c.getByRole('checkbox', { name: /A next step: it is called on a link another endpoint's answer gives/ }))
    await expect(c.queryByRole('textbox', { name: 'The call' })).toBeNull() // a step has no path of its own
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'The endpoint whose answer gives the link' }), 'start')
    await expect(c.getByRole('button', { name: 'Add the endpoint' })).toBeDisabled() // until the field is named
    await userEvent.type(c.getByRole('textbox', { name: 'The field of that answer that holds the link' }), 'receipt_url')
    await userEvent.click(c.getByRole('button', { name: 'Add the endpoint' }))
    await expect(await c.findByText('Called on the link that POST /workflows/run answers with.')).toBeInTheDocument()
    await expect(c.getAllByText('Intermediate')).toHaveLength(2)
  },
}
/** A real response with no fake of it yet: it says nothing of it is served until the fake is made. */
export const NotFakedYet: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: [...mocks[0].endpoints, unfakedEndpoint] }] }) }
/** On a task's Data step: the services the task calls, each with what every place is given and the calls it makes with their data, all as the app has it until the task overrides it; then the app's services as its settings have them, folded. */
export const OnATask: Story = { args: { issueId: 'iss_sample2' } }
/** A service with ten calls: two have data, eight are answered with what the server makes up. Any of them can be given data. */
export const TenEndpoints: Story = {
  beforeEach: withEngine({ mocks: [{ ...mocks[0], endpoints: [
    ...mocks[0].endpoints,
    { ...unfakedEndpoint, data: { app: { ...unfakedEndpoint.data.app!, safe: { kind: 'faked', set: 'faked-cost', files: ['cost.json'], note: 'Faked (sample).' } }, task: null } },
    ...['cancel', 'retry', 'webhooks', 'account', 'limits'].map((k) => ({ key: k, method: k === 'cancel' || k === 'retry' ? 'POST' : 'GET', path: k === 'cancel' || k === 'retry' ? `/workflows/runs/{id}/${k}` : `/${k}`, what: `(sample) ${k}`, real: null, files: [], data: { app: null, task: null } })),
  ] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('10 calls: 2 with data, 8 answered with what the server makes up')).toBeInTheDocument()
  },
}
/** A data file that is no endpoint's: said, so it can be put right. */
export const UnlinkedFile: Story = { beforeEach: withEngine({ mocks: [{ ...mocks[0], unlinked: ['sample-people.csv'] }] }) }
/** A mock built before endpoints were listed: none are shown, one can be added, and the named sets of data it had are still there below. */
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
/** A service's base settings are at the top of its card, shown like a profile with its name first. It is described by how the app really connects to it: its real address, and the environment variable the app reads that address from, which a mock overrides (and the key's variable, if any). No placeholder is asked for. */
export const TheRealConnection: Story = {
  beforeEach: withEngine({ mocks: [mocks[0]] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('FRAUD_SCAN_BASE_URL')).toBeInTheDocument()
    // Its base settings sit at the top like a profile: the name, then each setting on a line of its own.
    const profile = canvasElement.querySelector('[data-component="ServiceProfile"]') as HTMLElement
    await expect(profile.querySelector('h3')).toHaveTextContent('Fraud scan vendor (sample)')
    await expect([...profile.querySelectorAll('dt')].map((x) => x.textContent)).toEqual(['What it is', 'Real address', 'Variable to override', 'Variable for its key', 'Its mock'])
    await userEvent.click(c.getByRole('button', { name: 'Edit' }))
    await expect(c.getByRole('textbox', { name: 'Name' })).toHaveValue('Fraud scan vendor (sample)')
    await expect(c.getByRole('textbox', { name: 'Its real address' })).toHaveValue('https://api.fraud-scan.example')
    await expect(c.getByRole('textbox', { name: 'The environment variable to override' })).toHaveValue('FRAUD_SCAN_BASE_URL')
    await expect(c.getByRole('textbox', { name: /The environment variable for its key/ })).toHaveValue('FRAUD_SCAN_API_KEY')
    await expect(canvasElement.textContent).not.toContain('container_url')
  },
}
