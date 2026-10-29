import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RulesPicker } from './RulesPicker'
import { quickWorkflow, uiWorkflow } from '../stories/sample'

// Choosing a new task's rules. Made up: "UI change" starts everything as an idea, so it's greyed out.
const meta = { title: 'Components/RulesPicker', component: RulesPicker, args: { workflows: [uiWorkflow, quickWorkflow], defaultId: uiWorkflow.id, value: quickWorkflow.id, onChange: fn() } } satisfies Meta<typeof RulesPicker>
export default meta
type Story = StoryObj<typeof meta>

/** The app's default starts as an idea: greyed out; "Quick fix" is chosen. */
export const DefaultNeedsAnIdea: Story = {}
/** The default allows making it directly: it's the choice. */
export const DefaultAllows: Story = { args: { defaultId: quickWorkflow.id, value: '' } }
/** No rules at all yet. */
export const NoRules: Story = { args: { workflows: [], defaultId: null, value: '' } }
