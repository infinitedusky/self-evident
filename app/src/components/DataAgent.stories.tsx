import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { DataAgent } from './DataAgent'
import { withEngine } from '../stories/mock-engine'
import { dataAgentDoneSample, dataAgentSample, dataAgentStep1Sample, dataAgentStep2Sample, dataAgentStep3Sample, dataAgentWorkingSample } from '../stories/sample'

/** A task's data agent, at the top of its Data step: three steps, each approved by the person before the next. Made-up task, service and calls (sample). */
const meta = { title: 'Components/DataAgent', component: DataAgent, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', appId: 'app_sample' },
  beforeEach: withEngine({ dataAgent: dataAgentSample }), render: (a) => <div style={{ maxWidth: 860 }}><DataAgent {...a} /></div> } satisfies Meta<typeof DataAgent>
export default meta
type Story = StoryObj<typeof meta>

/** Never asked: it says what it is for and its three steps, and the person can ask it themselves. */
export const NotAsked: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Not asked yet')).toBeInTheDocument()
    await expect(c.getByText('What the task calls')).toBeInTheDocument()
    await expect(c.getByText('Where the data comes from')).toBeInTheDocument()
    await expect(c.getByText('Build it')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Ask the data agent' })).toBeDisabled()
    await userEvent.type(c.getByLabelText(/What does this task need/), 'It calls Sample Vendor for a scan (sample).')
    await userEvent.click(c.getByRole('button', { name: 'Ask the data agent' }))
    await expect(await c.findByText('Working on step 1 of 3')).toBeInTheDocument()
    await expect(c.getByText(/It calls Sample Vendor for a scan/)).toBeInTheDocument()
  },
}

/** Working: which step it is on and what it was asked. Nothing to press. */
export const Working: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentWorkingSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Working on step 1 of 3')).toBeInTheDocument()
    await expect(c.getByText(/Asked by the task's agent/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /Approve/ })).toBeNull()
  },
}

/** Stopped after step 1: the calls it found. Approving lets it go on to step 2, and nothing is built. */
export const Step1WaitsForYou: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentStep1Sample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Waiting for you: step 1 of 3')).toBeInTheDocument()
    await expect(c.getByText('POST /runs')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Approve, go on to step 2' }))
    await expect(await c.findByText('Working on step 2 of 3')).toBeInTheDocument()
    await userEvent.click(c.getByText(/Step 1, approved/))
    await expect(c.getByText('POST /runs')).toBeInTheDocument()
  },
}

/** Stopped after step 2: what will answer each call and what it is made from. Approving is what lets it build, for the services named. */
export const Step2WaitsForYou: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentStep2Sample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Waiting for you: step 2 of 3')).toBeInTheDocument()
    await expect(c.getByText(/It will build for these services and no others/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Approve, build it' })).toBeInTheDocument()
  },
}

/** The person wants a step done differently: they say what, and it does the step again. */
export const SayWhatToChange: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentStep2Sample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Say what to change' }))
    await expect(c.getByRole('button', { name: 'Send it back' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('What should it change?'), 'The status call also needs a failed run (sample).')
    await userEvent.click(c.getByRole('button', { name: 'Send it back' }))
    await expect(await c.findByText('Working on step 2 of 3')).toBeInTheDocument()
    await expect(c.getByText(/The status call also needs a failed run/)).toBeInTheDocument()
  },
}

/** Stopped after step 3: what it built and what is still the person's to do. Approving ends the round. */
export const Step3WaitsForYou: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentStep3Sample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Waiting for you: step 3 of 3')).toBeInTheDocument()
    await expect(c.getByText(/Still yours to do/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Approve: it is done' }))
    await expect(await c.findByText('Done')).toBeInTheDocument()
  },
}

/** All three approved: each step's summary is kept, folded, and it can be asked again when the task comes to need more. */
export const Done: Story = {
  beforeEach: withEngine({ dataAgent: dataAgentDoneSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Done')).toBeInTheDocument()
    await expect(c.getByText(/Step 3, approved/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Ask it again' }))
    await expect(c.getByLabelText(/What does this task need/)).toBeInTheDocument()
  },
}
