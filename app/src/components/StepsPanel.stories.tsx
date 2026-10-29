import type { Meta, StoryObj } from '@storybook/react-vite'
import { StepsPanel } from './StepsPanel'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// The steps on one idea, task or project, read from the engine. Made up: the sample engine's views.
const meta = { title: 'Components/StepsPanel', component: StepsPanel, args: { subject: { kind: 'issues', id: 'iss_sample1' }, appId: sampleApp.id, name: 'Address and payment on one page (sample)' },
  render: (a) => <div style={{ maxWidth: 1000 }}><StepsPanel {...a} /></div> } satisfies Meta<typeof StepsPanel>
export default meta
type Story = StoryObj<typeof meta>

/** A task converted from an idea, under its project's workflow: the brief waits for approval, and the blast radius is required after it. */
export const OnATask: Story = {}
/** An idea: research done, mockups started; its brief is a rough draft. */
export const OnAnIdea: Story = { args: { subject: { kind: 'ideas', id: 'idea_sample1' }, name: 'Sample: checkout in one go' } }
/** A project: no brief, a prototype done. */
export const OnAProject: Story = { args: { subject: { kind: 'projects', id: 'proj_checkout' }, name: 'One-page checkout (sample)' } }
/** Opening a finished step shows what it produced: here, research notes. */
export const ResearchOpen: Story = {
  args: { subject: { kind: 'ideas', id: 'idea_sample1' }, name: 'Sample: checkout in one go' },
  play: async ({ canvas, userEvent }) => { await userEvent.click((await canvas.findAllByRole('button', { name: 'Open' }))[0]); await canvas.findByText(/The case against/) },
}
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
