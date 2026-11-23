import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TaskCalls } from './TaskCalls'
import { withEngine } from '../stories/mock-engine'
import { mockPlacesForTask, mocks, resultsItem, sampleApp, taskServices } from '../stories/sample'

// The services a task calls, and its calls of each, at the top of its Data step. Made up: three invented services.
const meta = { title: 'Components/TaskCalls', component: TaskCalls, args: { appId: sampleApp.id, issueId: 'iss_sample2', mocks, places: mockPlacesForTask },
  render: (a) => <div style={{ maxWidth: 1000 }}><TaskCalls {...a} /></div> } satisfies Meta<typeof TaskCalls>
export default meta
type Story = StoryObj<typeof meta>

/** Three of the app's services. Each block reads top to bottom: what each place is given (the app's default until the task overrides it), then the calls this task makes, each with its data. One call has this task's own data in place of the app's; one is not on its service yet. */
export const Services: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText("3 services, 5 calls: 1 with data (1 this task's own), 3 with none yet, 1 not on its service yet")).toBeInTheDocument()
    await expect(c.getByText('No calls listed yet: which of its endpoints does this task use?')).toBeInTheDocument()
    await expect(c.getAllByText('What each place is given')).toHaveLength(3)
    await expect(c.getByText("This task's own")).toBeInTheDocument()
    await expect(c.getByRole('button', { name: /^Go back to the app's data of GET the results file/ })).toBeInTheDocument()
  },
}
/** A call answered with the app's data: it says so, and Override puts this task's own in place of it, for this task alone. */
export const OverridingData: Story = {
  beforeEach: withEngine({ taskServices: [{ ...taskServices[0], calls: taskServices[0].calls.map((c) => (c.id === 'tcall_s3' ? { ...c, endpoint: { ...c.endpoint!, data: { app: resultsItem, task: null } } } : c)) }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText("From the app's settings")).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /^Override the data of GET the results file/ }))
    await expect(c.getByText(/For this task alone\. Other tasks keep the app's\./)).toBeInTheDocument()
    await userEvent.click(c.getByRole('checkbox', { name: 'This is real data' })) // unticked: it holds nothing real
    await userEvent.upload(c.getByLabelText(/^A file for GET the results file/), new File(['a,b\n1,2\n'], 'mine.csv', { type: 'text/csv' }))
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(await c.findByText("This task's own")).toBeInTheDocument()
  },
}
/** A call is picked from the service's endpoints. One it does not have is typed, and the form says it is added to the service in Settings. */
export const PickingACall: Story = {
  beforeEach: withEngine({ taskServices: taskServices.slice(0, 1) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a call to Fraud scan vendor (sample)' }))
    const pick = c.getByRole('combobox', { name: "One of Fraud scan vendor (sample)'s endpoints" })
    await expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['GET /workflows/runs/{id}/links (with its next step)', 'A new one…']) // the service's, less the ones already listed; a step is never picked by itself
    await expect(c.queryByRole('textbox', { name: 'The call' })).toBeNull()
    await userEvent.selectOptions(pick, '')
    await expect(c.getByText('This is added to Fraud scan vendor (sample) in Settings, as one of its endpoints.')).toBeInTheDocument()
  },
}
/** Nothing listed yet: the agent names the services when the step is started, or the person adds one. */
export const NotListedYet: Story = { beforeEach: withEngine({ taskServices: [] }) }
/** Adding a service: one of the app's is picked from a list, never typed. */
export const PickingAService: Story = {
  beforeEach: withEngine({ taskServices: taskServices.slice(0, 1) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByRole('button', { name: 'Add a call to Fraud scan vendor (sample)' }) // the task's own are read first
    await userEvent.click(c.getByRole('button', { name: 'Add a service' }))
    const pick = c.getByRole('combobox', { name: "One of the app's services" })
    await expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['Breach lookup (sample)', 'Address lookup (sample)']) // the app's, less the one already on the task
    await userEvent.selectOptions(pick, 'address-lookup')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByRole('button', { name: 'Add a call to Address lookup (sample)' })).toBeInTheDocument()
  },
}
/** A service the app does not have is added to the app's services; one already there, written differently, is refused with the one it is. */
export const ANewServiceWrittenDifferently: Story = {
  beforeEach: withEngine({ taskServices: taskServices.slice(1) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a service' }))
    await userEvent.click(c.getByRole('button', { name: 'It is not in the list' }))
    await userEvent.type(c.getByRole('textbox', { name: 'A service the app does not have yet' }), 'fraud_scan vendor (SAMPLE)')
    await userEvent.click(c.getByRole('button', { name: 'Add to the app and this task' }))
    await expect(await c.findByText('that is already one of this app\'s services, as "Fraud scan vendor (sample)"')).toBeInTheDocument()
  },
}
/** A call with a next step is one thing to add: picking it brings the step with it, shown under it as it is in Settings, with the step's own data. The step is not listed or picked by itself. */
export const ACallWithANextStep: Story = {
  beforeEach: withEngine({ taskServices: [{ ...taskServices[0], calls: taskServices[0].calls.filter((c) => c.id === 'tcall_s1') }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a call to Fraud scan vendor (sample)' }))
    await userEvent.selectOptions(c.getByRole('combobox', { name: "One of Fraud scan vendor (sample)'s endpoints" }), 'links')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('Intermediate')).toBeInTheDocument()
    await expect(c.getByText(/Comes with GET \/workflows\/runs\/\{id\}\/links/)).toBeInTheDocument()
    const rows = [...canvasElement.querySelectorAll('.task-calls-row')].map((r) => r.textContent ?? '')
    await expect(rows.findIndex((t) => t.includes('Next step:'))).toBe(rows.findIndex((t) => t.includes('Intermediate')) + 1) // right under the call it follows
    await expect(c.getByText(/A fake of it: results.csv/)).toBeInTheDocument() // the step's own data, the app's until overridden
  },
}
/** A call is added under its service: one of its endpoints is picked, and only what the task needs from it is written. */
export const AddingACall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a call to Breach lookup (sample)' }))
    await expect(c.getByRole('combobox', { name: "One of Breach lookup (sample)'s endpoints" })).toHaveValue('search')
    await userEvent.type(c.getByRole('textbox', { name: 'What this task needs from it' }), 'An address in no breach, and one in three')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('Needs: An address in no breach, and one in three')).toBeInTheDocument()
  },
}
/** A call being edited, and the whole list can be cleared, to start again. */
export const EditingACall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: /^Edit / }))[0])
    const what = c.getByRole('textbox', { name: 'What this task needs from it' })
    await userEvent.clear(what); await userEvent.type(what, 'A job id, and a refusal when nobody is sent (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByText('Needs: A job id, and a refusal when nobody is sent (sample)')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Clear the list' })).toBeInTheDocument()
  },
}
