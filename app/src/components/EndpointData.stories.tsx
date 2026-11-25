import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { EndpointDataCell } from './EndpointData'
import { fixtures as sampleFixtures, mockEndpointsSample, resultsItem, sampleApp, sensitiveEndpoint, unfakedEndpoint } from '../stories/sample'
import { withEngine } from '../stories/mock-engine'

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
    await userEvent.click(c.getByRole('button', { name: /^Map fields of GET the results file.* from a fixture$/ }))
    await waitFor(() => expect(c.getByRole('combobox', { name: 'Fixture' })).toHaveValue('northwind-company')) // once the app's fixtures are read
    await expect(await c.findByRole('combobox', { name: 'Data column 1' })).toHaveValue('work_email') // a column both have, that says who someone is
    await userEvent.click(c.getByRole('button', { name: 'Add a column' }))
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Data column 2' }), 'tracking_id')
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Fixture column 2' }), 'id')
    const many = c.getByRole('spinbutton', { name: 'How many people' })
    await userEvent.clear(many); await userEvent.type(many, '3')
    await waitFor(() => expect(within(c.getByRole('combobox', { name: 'Starting from' })).getAllByRole('option')).toHaveLength(4))
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Starting from' }), '1')
    await userEvent.click(c.getByRole('button', { name: /^Fill the data of GET the results file.* out$/ }))
    await expect(await c.findByText('Filled out for 3 people, from Blake Sample, blake.sample@northwind.example.')).toBeInTheDocument()
  },
}
/** A fixture whose largest table is not its people: the form still starts on the table that says who someone is, with the columns both have. */
export const PeopleAreNotTheLargestTable: Story = {
  beforeEach: withEngine({ fixtures: [{ name: 'northwind-company', bytes: 1_480_000, tables: [{ name: 'score_snapshots', rows: 6525, columns: ['id', 'score', 'node_id', 'snapshot_date'] }, ...sampleFixtures[0].tables] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /from a fixture$/ }))
    await waitFor(() => expect(c.getByRole('combobox', { name: 'Its people are in' })).toHaveValue('employees'))
    await expect(await c.findByRole('combobox', { name: 'Data column 1' })).toHaveValue('work_email')
    // Another table has none of the data's columns: it says so, and what the person then sets is kept.
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Its people are in' }), 'score_snapshots')
    await expect(await c.findByText(/None yet: no column of the data has the same name/)).toBeInTheDocument()
  },
}
/** Data already filled out for fixture people says who, and can be changed. */
export const MadeForFixturePeople: Story = { args: { endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data, app: { ...resultsItem, safe: { ...resultsItem.safe!, madeFor: { fixture: 'northwind-company', table: 'employees', who: '3 people, from Blake Sample, blake.sample@northwind.example', people: 3, map: { tracking_id: 'id', work_email: 'work_email' } } } } } } } }
/** A file is shown under the name it was given and with where it came from, never under the name it is kept under for the mock: one uploaded by the person, one written by an agent, and a real one with the fake made of it. */
export const NamedAsItWasGiven: Story = {
  args: { endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data,
    app: { fixture: null, recorded: { id: 'sample/given-results', at: '2026-11-23T10:00:00Z', how: 'given', files: ['results.csv'], shown: ['sample-run-export.csv'] }, safe: { kind: 'faked', set: 'faked-results', files: ['results.csv'], note: 'Faked from a real response the person gave 23 Nov 2026.' } },
    responses: [
      { fixture: 'northwind-company', app: { fixture: 'northwind-company', recorded: null, safe: { kind: 'provided', by: 'person', shown: ['northwind-250-people.csv'], set: 'provided-results-for-northwind-company', files: ['results.csv'], note: 'Provided by a person, who states it holds nothing real.' } }, task: null },
      { fixture: 'harbor-sample', app: { fixture: 'harbor-sample', recorded: null, safe: { kind: 'provided', by: 'agent', shown: ['harbor-three-people.csv'], set: 'provided-results-for-harbor-sample', files: ['results.csv'], note: 'Written by hand, invented.' } }, task: null },
    ] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/A response you gave: sample-run-export\.csv/)).toBeInTheDocument()
    await expect(c.getByText(/A fake of sample-run-export\.csv/)).toBeInTheDocument()
    await expect(c.queryByText(/results\.csv/)).toBeNull() // the name it is kept under is the mock's business
    await userEvent.click(c.getByRole('tab', { name: 'northwind-company' }))
    await expect(await c.findByText('northwind-250-people.csv')).toBeInTheDocument()
    await expect(c.getByText(/uploaded by you, and stated to hold nothing real/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('tab', { name: 'harbor-sample' }))
    await expect(await c.findByText('harbor-three-people.csv')).toBeInTheDocument()
    await expect(c.getByText(/written by an agent, and checked against the real responses here/)).toBeInTheDocument()
    await expect(c.queryByText(/results\.csv/)).toBeNull()
  },
}
/** A response per fixture: the default, then one for each fixture that has its own. Choosing one shows that response, and everything on the cell is then of it. */
export const AResponsePerFixture: Story = {
  args: { endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data, responses: [{ fixture: 'northwind-company', app: { fixture: 'northwind-company', recorded: null, safe: { kind: 'provided', set: 'provided-results-for-northwind-company', files: ['results.csv'], note: 'Provided by a person, who states it holds nothing real.', columns: ['tracking_id', 'work_email'] } }, task: null }] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const tabs = within(await c.findByRole('tablist', { name: /^Responses of / }))
    await expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Default', 'northwind-company'])
    await expect(tabs.getByRole('tab', { name: 'Default' })).toHaveAttribute('aria-selected', 'true')
    await expect(c.getByText(/A fake of it/)).toBeInTheDocument()
    await userEvent.click(tabs.getByRole('tab', { name: 'northwind-company' }))
    await expect(await c.findByText(/A file stated to hold nothing real: results\.csv/)).toBeInTheDocument()
    await expect(c.queryByText(/A fake of it/)).toBeNull()
    await userEvent.click(tabs.getByRole('tab', { name: 'Default' }))
    await expect(await c.findByText(/A fake of it/)).toBeInTheDocument()
  },
}
/** A response added for a fixture that has none: the fixture is chosen, the cell says a run from it gets the default until it has its own, and a file is given as for any response, real or made up. On a task it is that task's own. */
export const AddAResponseForAFixture: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /^Add a response of .* for a fixture$/ }))
    const which = await c.findByRole('combobox', { name: /^The fixture to add a response of / })
    await waitFor(() => expect(within(which).getAllByRole('option').length).toBeGreaterThan(1))
    await userEvent.selectOptions(which, 'northwind-company')
    await expect(await c.findByText(/yet: a run started from it is served the default/)).toBeInTheDocument()
    await expect(c.getByRole('tab', { name: 'northwind-company' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(c.getByRole('button', { name: /^Add the data of / }))
    await expect(c.getByText(/This is the response for the fixture northwind-company.*For this task alone\./)).toBeInTheDocument()
    await expect(c.getByRole('checkbox', { name: 'This is real data' })).toBeEnabled() // real, to be faked, or made up: as for any response
    await userEvent.click(c.getByRole('checkbox', { name: 'This is real data' }))
    await userEvent.upload(c.getByLabelText(/^A file for /), new File(['tracking_id,work_email\nx,y@sample.example\n'], 'company.csv', { type: 'text/csv' }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(await c.findByText('Added as the response for northwind-company: a run started from that fixture is served it.')).toBeInTheDocument()
  },
}
/** No data: the mock's server makes the answer up. Adding data asks for a file and what it is. */
/** A file a tester brings supplies who the data is for: a column the data lacks is added from the file, and one is left empty. */
export const MapFieldsFromAFile: Story = {
  args: { issueId: 'iss_sample2' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /^Map fields of .* from a fixture$/ }))
    // One action, and the source is chosen in it: a table of the database, or a file.
    await userEvent.selectOptions(c.getByRole('combobox', { name: /^Where the fields of/ }), 'file')
    // Only files with columns are offered: the CSVs, not the pictures.
    const file = await c.findByRole('combobox', { name: 'File' })
    await waitFor(() => expect(within(file).getAllByRole('option').map((o) => o.textContent)).toEqual(['one-person.csv', 'export.csv']))
    await userEvent.selectOptions(file, 'export.csv')
    // Only the columns to override are listed. A line picks one of the response's columns from a list of them all…
    await userEvent.click(c.getByRole('button', { name: 'Add a column' }))
    const col = c.getByRole('combobox', { name: 'Response column 1' })
    await expect(within(col).getAllByRole('option').map((o) => o.textContent)).toEqual(['a column of the response…', 'tracking_id', 'work_email', 'full_name', 'status', 'risk_level', 'profiles', 'person_summary', '＋ a new column…'])
    await userEvent.selectOptions(col, 'work_email')
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'File column 1' }), 'email')
    // …or names one the response lacks.
    await userEvent.click(c.getByRole('button', { name: 'Add a column' }))
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Response column 2' }), '＋ a new column…')
    await userEvent.type(c.getByRole('textbox', { name: 'Name of new column 2' }), 'department')
    await expect(within(c.getByRole('combobox', { name: 'Response column 2' })).queryByRole('option', { name: 'work_email' })).toBeNull() // taken by the first line
    await userEvent.click(c.getByRole('button', { name: /^Save the mapping/ }))
    await expect(await c.findByText('It answers for the people in export.csv.')).toBeInTheDocument()
  },
}
/** Mapped: the cell says whose people it answers for. */
export const MappedFromAFile: Story = { args: { issueId: 'iss_sample2', endpoint: { ...mockEndpointsSample[3], data: { ...mockEndpointsSample[3].data, app: { ...resultsItem, safe: { ...resultsItem.safe!, fromFile: { file: 'export.csv', map: { work_email: 'email', tracking_id: '' } } } } } } },
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect((await c.findAllByText('export.csv')).length).toBeGreaterThan(0); await expect(c.getByText('Change the mapping')).toBeInTheDocument()
    // Under the data: which fields the mapping overrides, and from where.
    const said = canvasElement.querySelector('[data-overridden="file"]')!
    await expect(said.textContent).toBe('Overridden fields, from export.csv: work_email ← email, tracking_id (empty)') } }
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
/** A real response is given and the task's agent is asked for the fake: a banner with a spinner says it is under way, where the data will appear, and the line that reads like a failure is not shown meanwhile. */
export const TheAgentIsMakingTheFake: Story = {
  args: { endpoint: unfakedEndpoint },
  beforeEach: () => { sessionStorage.clear() },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Replace the data of GET /workflows/runs/{id}/cost' }))
    await userEvent.upload(c.getByLabelText('A file for GET /workflows/runs/{id}/cost'), new File(['{"cost": 12}'], 'cost.json', { type: 'application/json' }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    const banner = await c.findByRole('status')
    await expect(banner).toHaveTextContent("The task's agent is making the fake version…")
    await expect(banner).toHaveTextContent('This usually takes a minute or two')
    await expect(banner.querySelector('.working-spin')).not.toBeNull()
    await expect(c.queryByText(/Not faked yet, so nothing of it is served/)).toBeNull()
    await expect(c.queryByRole('button', { name: /^Make the fake version of/ })).toBeNull() // it is being made: not offered twice
    sessionStorage.clear() // the next story starts with nothing under way
  },
}
/** A real response given over one that already has a fake: the banner shows all the same, and the old fake does not pass for the new one. */
export const ReplacingAResponseThatHasAFake: Story = {
  beforeEach: () => { sessionStorage.clear() },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Faked')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /^Replace the data of/ }))
    await userEvent.upload(c.getByLabelText(/^A file for /), new File(['a,b,c\n1,2,3'], 'results.csv', { type: 'text/csv' }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    const banner = await c.findByRole('status')
    await expect(banner).toHaveTextContent("The task's agent is making the fake version…")
    await new Promise((r) => setTimeout(r, 300)) // it stays: the fake on the page is the old one's
    await expect(c.getByRole('status')).toHaveTextContent("The task's agent is making the fake version…")
    sessionStorage.clear()
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
