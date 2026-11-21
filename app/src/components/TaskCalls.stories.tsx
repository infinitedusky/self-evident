import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TaskCalls } from './TaskCalls'
import { withEngine } from '../stories/mock-engine'
import { mocks, sampleApp, taskServices } from '../stories/sample'

// The services a task calls, and its calls of each, at the top of its Data step. Made up: three invented services.
const meta = { title: 'Components/TaskCalls', component: TaskCalls, args: { appId: sampleApp.id, issueId: 'iss_sample2', mocks },
  render: (a) => <div style={{ maxWidth: 1000 }}><TaskCalls {...a} /></div> } satisfies Meta<typeof TaskCalls>
export default meta
type Story = StoryObj<typeof meta>

/** Three of the app's services: one with a mock and four calls (a real response behind one, the code behind two, one the mock lacks), one whose mock is not built yet, one with no calls listed yet. */
export const Services: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('3 services, 5 calls: 1 with a real response behind it, 3 taken from the code, 1 not on its mock')).toBeInTheDocument()
    await expect(c.getByText('No calls listed yet: which of its endpoints does this task use?')).toBeInTheDocument()
    // A real response is given on the call it answers: every call has the control.
    await expect(canvasElement.querySelectorAll('input[type=file]')).toHaveLength(5)
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
/** A call is added under its service: only the call and what the task needs from it. */
export const AddingACall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a call to Breach lookup (sample)' }))
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByRole('textbox', { name: 'The call' }), '/v2/search')
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
