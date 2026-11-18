import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlanCovers } from './Requirements'

// How a task's plan answers what the app requires of every change. Made up: a sample shop's list.
const meta = { title: 'Components/Requirements', component: PlanCovers } satisfies Meta<typeof PlanCovers>
export default meta
type Story = StoryObj<typeof meta>

/** On a task: how its plan answers each one: covered, does not apply, and one the plan did not speak to. */
export const OnATask: Story = {
  args: { list: [
    { key: 'telemetry', name: 'Telemetry', applies: true, how: 'SS-5 adds a span around the card submit and an event when a card is declined (sample).' },
    { key: 'tests', name: 'Tests', applies: true, how: 'SS-5 and SS-6 each start with a failing test.' },
    { key: 'test_plan', name: 'Test plan', applies: true, how: '' },
    { key: 'docs', name: 'Docs', applies: false, how: 'Nothing a person reads changes.' },
  ] },
}
