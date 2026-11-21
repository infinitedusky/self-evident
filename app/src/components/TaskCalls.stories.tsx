import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TaskCalls } from './TaskCalls'
import { withEngine } from '../stories/mock-engine'
import { mocks, sampleApp, taskCalls } from '../stories/sample'

// What a task calls outside the app, at the top of its Data step. Made up: six calls to three invented services.
const meta = { title: 'Components/TaskCalls', component: TaskCalls, args: { appId: sampleApp.id, issueId: 'iss_sample2', mocks },
  render: (a) => <div style={{ maxWidth: 1000 }}><TaskCalls {...a} /></div> } satisfies Meta<typeof TaskCalls>
export default meta
type Story = StoryObj<typeof meta>

/** Every state at once: answered from a real response, answered from the code, a call its mock lacks, a mock not built yet, a service with no mock. */
export const Calls: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('6 calls to 3 services: 1 answered from a real response, 3 from the code, 2 with nothing to answer them')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Create a mock of Payments (sample)' })).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Add it to the mock' })).toBeInTheDocument()
    // A real response is given on the call it answers: every call has the control, answered or not.
    await expect(canvasElement.querySelectorAll('input[type=file]')).toHaveLength(6)
  },
}
/** Nothing listed yet: the agent lists them when the step is started, or the person adds one. */
export const NotListedYet: Story = { beforeEach: withEngine({ taskCalls: [] }) }
/** Adding a call the agent missed: the service, the call, and what the task needs from it. */
export const AddingACall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a call' }))
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByRole('combobox', { name: 'The service' }), 'Email sender (sample)')
    await userEvent.type(c.getByRole('textbox', { name: 'The call' }), '/v3/send')
    await userEvent.type(c.getByRole('textbox', { name: 'What this task needs from it' }), 'An accepted message, and one that bounces')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByText('/v3/send')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Create a mock of Email sender (sample)' })).toBeInTheDocument()
  },
}
/** Everything answered, all from real responses. */
export const AllAnswered: Story = { beforeEach: withEngine({ taskCalls: taskCalls.slice(0, 3).map((c) => ({ ...c, endpoint: { ...c.endpoint!, real: { at: '2026-11-18T15:20:00Z', how: 'recorded' as const }, files: [`${c.endpoint!.key}.json`] } })) }) }
/** A call being edited: the service, the call and what the task needs from it. And the whole list can be cleared, to start again. */
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
