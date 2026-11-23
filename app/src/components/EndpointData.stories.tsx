import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { EndpointDataCell } from './EndpointData'
import { mockEndpointsSample, resultsItem, sampleApp, sensitiveEndpoint, unfakedEndpoint } from '../stories/sample'

// One endpoint's data, as it is shown wherever the endpoint is. Made up: an invented vendor's calls.
const meta = { title: 'Components/EndpointData', component: EndpointDataCell, args: { appId: sampleApp.id, mockKey: 'fraud-scan', serviceName: 'Fraud scan vendor (sample)', endpoint: mockEndpointsSample[3], canAsk: true, onChanged: () => {} },
  render: (a) => <div style={{ maxWidth: 520 }}><EndpointDataCell {...a} /></div> } satisfies Meta<typeof EndpointDataCell>
export default meta
type Story = StoryObj<typeof meta>

/** In the app's settings: a real response the person gave, and a fake of it. It can be replaced or removed. */
export const RecordedAndFaked: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Real · this computer only')).toBeInTheDocument()
    await expect(c.getByText('Faked')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /^Replace the data of/ })).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /^Remove the data of/ })).toBeInTheDocument()
  },
}
/** Which version a person's own runs get is the endpoint's own switch, ticked to begin with: the faked version. Unticked, their prototype and smoke test get the real response. A reviewer always gets the faked one. */
export const UseFakedVersion: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const box = await c.findByRole('checkbox', { name: /^Use the faked version of GET the results file/ })
    await expect(box).toBeChecked()
    await expect(c.getByText(/Your prototype and smoke test get the faked version\. A reviewer always gets the faked one\./)).toBeInTheDocument()
  },
}
/** On a task the switch starts as the app has it and can be set for the task alone, then put back. */
export const UseFakedVersionOnATask: Story = { args: { issueId: 'iss_sample2', endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data, faked: { app: true, task: false } } } } }
/** The data is a template, and a fixture supplies who it is for: pick the fixture, how many people, who to start from, and which columns of the data are theirs. The app then sends the people this mock has answers for. */
export const FillOutForFixturePeople: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Not made for a fixture's people/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /^Fill the data of GET the results file.* out for fixture people/ }))
    await waitFor(() => expect(c.getByRole('combobox', { name: 'Fixture' })).toHaveValue('northwind-company')) // once the app's fixtures are read
    await expect(await c.findByRole('combobox', { name: 'Data column 1' })).toHaveValue('work_email') // a column both have, that says who someone is
    await userEvent.click(c.getByRole('button', { name: 'Add a column' }))
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Data column 2' }), 'tracking_id')
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Fixture column 2' }), 'id')
    const many = c.getByRole('spinbutton', { name: 'How many people' })
    await userEvent.clear(many); await userEvent.type(many, '3')
    await waitFor(() => expect(within(c.getByRole('combobox', { name: 'Starting from' })).getAllByRole('option')).toHaveLength(4))
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Starting from' }), '1')
    await userEvent.click(c.getByRole('button', { name: /^Fill the data of GET the results file.* out$/ }))
    await expect(await c.findByText('Filled out for 3 people, from Blake Sample, blake.sample@northwind.example.')).toBeInTheDocument()
  },
}
/** Data already filled out for fixture people says who, and can be changed. */
export const MadeForFixturePeople: Story = { args: { endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data, app: { ...resultsItem, safe: { ...resultsItem.safe!, madeFor: { fixture: 'northwind-company', table: 'employees', who: '3 people, from Blake Sample, blake.sample@northwind.example', people: 3, map: { tracking_id: 'id', work_email: 'work_email' } } } } } } } }
/** No data: the mock's server makes the answer up. Adding data asks for a file and what it is. */
export const NoData: Story = {
  args: { endpoint: mockEndpointsSample[0] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add the data of POST /workflows/run' }))
    await expect(c.getByRole('button', { name: 'Add it' })).toBeDisabled() // until a file is chosen
    await expect(c.getByRole('checkbox', { name: 'This is real data' })).toBeChecked()
  },
}
/** A real response with no fake yet: nothing of it is served until the task's agent makes the fake. */
export const NotFakedYet: Story = {
  args: { endpoint: unfakedEndpoint },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Not faked yet, so nothing of it is served/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Make the fake version of GET /workflows/runs/{id}/cost' }))
    await expect(await c.findByText(/Faked: 41 values replaced, 12 kept as structure/)).toBeInTheDocument()
  },
}
/** The fake still carried something real, so it was refused and nothing was made: what was found is said, and the task's agent can be asked. */
export const FakeRefused: Story = {
  args: { endpoint: { ...unfakedEndpoint, key: 'refused' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /^Make the fake version of/ }))
    await expect(await c.findByText(/the fake still carries 2 values of the real response/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /^Ask the task's agent to make the fake/ })).toBeInTheDocument()
  },
}
/** A sensitive endpoint: only a fake is kept, and the original was never stored. */
export const Sensitive: Story = { args: { endpoint: sensitiveEndpoint } }
/** On a task, answered with the app's data: it says so, and can be overridden for this task alone. */
export const OnATaskFromTheApp: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText("From the app's settings")).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /^Override the data of/ })).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /^Remove the data of/ })).toBeNull() // the app's is changed in its settings
  },
}
/** On a task with its own data in place of the app's: it can be replaced, or dropped to go back to the app's. */
export const OnATaskItsOwn: Story = { args: { issueId: 'iss_sample2', endpoint: { ...mockEndpointsSample[3], data: { app: resultsItem, task: { recorded: null, safe: { kind: 'provided', set: 'provided-results-task', files: ['results.csv'], note: 'Provided by a person, who states it holds nothing real.' } } } } } }
/** On a task, an endpoint the app has no data for: data added here becomes the service's, in Settings, and the form says so. */
export const OnATaskNothingInSettings: Story = {
  args: { issueId: 'iss_sample2', endpoint: mockEndpointsSample[0] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add the data of POST /workflows/run' }))
    await expect(c.getByText(/This becomes Fraud scan vendor \(sample\)'s data in Settings/)).toBeInTheDocument()
  },
}
