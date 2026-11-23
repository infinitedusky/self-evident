import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
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
export const NotFakedYet: Story = { args: { endpoint: unfakedEndpoint } }
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
