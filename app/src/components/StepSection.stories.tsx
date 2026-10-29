import type { Meta, StoryObj } from '@storybook/react-vite'
import { rows } from '@self-evident/engine/steps'
import { StepSection } from './StepSection'
import { withEngine } from '../stories/mock-engine'
import { sampleApp, taskStepsView } from '../stories/sample'

// One step of a task as its own page. Made up: the sample task's steps under "UI change (sample)".
const all = rows('task', taskStepsView.states, taskStepsView.resolved.workflow)
const row = (key: string) => all.find((r) => r.key === key)!
const meta = { title: 'Components/StepSection', component: StepSection,
  args: { subject: { kind: 'issues', id: 'iss_sample20' }, appId: sampleApp.id, name: 'Address and payment on one page (sample)', base: '/tasks/iss_sample20', row: row('research'), fromIdea: taskStepsView.fromIdea },
  render: (a) => <div style={{ maxWidth: 900 }}><StepSection {...a} /></div> } satisfies Meta<typeof StepSection>
export default meta
type Story = StoryObj<typeof meta>

/** Done, with what it produced. */
export const Done: Story = {}
/** Not started: hand it to the agent. */
export const NotStarted: Story = { args: { row: { ...row('research'), state: { key: 'research', status: 'none' } } }, beforeEach: withEngine({ stepWork: null }) }
/** Waiting on a step before it: says which, and links there. */
export const Waiting: Story = { args: { row: row('risk'), waitingState: row('brief').state }, beforeEach: withEngine({ stepWork: null }) }
/** Started from an idea. */
export const FromAnIdea: Story = { args: { row: row('idea') } }
