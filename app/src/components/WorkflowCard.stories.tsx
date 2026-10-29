import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { WorkflowCard } from './WorkflowCard'
import { quickWorkflow, uiWorkflow } from '../stories/sample'

// One workflow: which steps, how strictly, in what order. Made up.
const meta = { title: 'Components/WorkflowCard', component: WorkflowCard, args: { workflow: uiWorkflow, usedBy: 'The app\'s default · 1 project uses it (sample)', onSave: fn() },
  render: (a) => <div style={{ maxWidth: 560 }}><WorkflowCard {...a} /></div> } satisfies Meta<typeof WorkflowCard>
export default meta
type Story = StoryObj<typeof meta>

/** Reading it: ordered, two steps required. */
export const UiChange: Story = {}
/** Only the brief; the rest switched off; any order. */
export const QuickFix: Story = { args: { workflow: quickWorkflow, usedBy: '1 task uses it (sample)' } }
/** Editing: switch steps on or off, required or optional, move them, enforce the order. */
export const Editing: Story = { args: { editing: true } }
