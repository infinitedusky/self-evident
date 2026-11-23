import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Fixtures } from './Fixtures'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// The app's fixtures: what is in its own database when it is tried. Made up: an invented company.
const meta = { title: 'Components/Fixtures', component: Fixtures, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 900 }}><Fixtures {...a} /></div> } satisfies Meta<typeof Fixtures>
export default meta
type Story = StoryObj<typeof meta>

/** In the app's settings: each fixture opens to its tables, their columns and how many rows they hold. Never the rows. */
export const InSettings: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('northwind-company')) // a fixture opens to its tables
    await expect(c.getAllByText('employees')[0]).toBeVisible()
    await expect(c.getByText('250 rows')).toBeVisible()
  },
}
/** On a task whose data was made for a fixture: its smoke test is built from that one, and it says so. */
export const OnATask: Story = {
  args: { issueId: 'iss_sample2' }, beforeEach: withEngine({ fixtureUsed: 'northwind-company' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText("This task's")).toBeInTheDocument()
    await expect(c.getByText(/the fixture its data was made for/)).toBeInTheDocument()
  },
}
/** On a task with no data made for a fixture yet. */
export const OnATaskNothingYet: Story = { args: { issueId: 'iss_sample2' } }
/** An app with no fixtures: it says how one comes to be. */
export const None: Story = { beforeEach: withEngine({ fixtures: [] }) }
