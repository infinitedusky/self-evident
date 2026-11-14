import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PlanCovers, Requirements, type RequirementRow } from './Requirements'

// What every plan in an app must cover. Made up: a sample shop's list.
const list: RequirementRow[] = [
  { key: 'telemetry', name: 'Telemetry', what: 'Anything new that a person does, or that can fail, can be seen with OpenTelemetry (sample).', on: true },
  { key: 'tests', name: 'Tests', what: 'New behaviour has automated tests that fail without the change.', on: true },
  { key: 'test_plan', name: 'Test plan', what: 'How a person checks it by hand: the pages to open and what to look for.', on: true },
  { key: 'docs', name: 'Docs', what: 'The documentation that describes what changed is updated in the same task.', on: false },
]
const Held = ({ start }: { start: RequirementRow[] }) => { const [v, setV] = useState(start); return <Requirements value={v} onChange={setV} /> }
const meta = { title: 'Components/Requirements', component: Requirements, args: { value: list, onChange: () => {} }, render: (args) => <Held start={args.value} /> } satisfies Meta<typeof Requirements>
export default meta
type Story = StoryObj<typeof meta>

/** As it reads in Settings: the list, one of them switched off. */
export const Reading: Story = {}
/** After "Edit the list": each one can be switched, reworded or taken out, and one can be added. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Edit the list' }))
    await userEvent.click(await c.findByRole('button', { name: 'Add one' }))
    await expect(await c.findAllByPlaceholderText('Name')).toHaveLength(5)
  },
}
/** An app that asks for nothing. */
export const None: Story = { args: { value: [] } }
/** On a task: how its plan answers each one: covered, does not apply, and one the plan did not speak to. */
export const OnATask: Story = {
  render: () => <PlanCovers list={[
    { key: 'telemetry', name: 'Telemetry', applies: true, how: 'SS-5 adds a span around the card submit and an event when a card is declined (sample).' },
    { key: 'tests', name: 'Tests', applies: true, how: 'SS-5 and SS-6 each start with a failing test.' },
    { key: 'test_plan', name: 'Test plan', applies: true, how: '' },
    { key: 'docs', name: 'Docs', applies: false, how: 'Nothing a person reads changes.' },
  ]} />,
}
