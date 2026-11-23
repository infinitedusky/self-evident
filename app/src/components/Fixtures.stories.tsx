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
/** An app with no fixtures: it says how one comes to be, and one is made from the app's seed in a press. */
export const None: Story = {
  beforeEach: withEngine({ fixtures: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/No fixtures yet/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: "Make one from the app's seed" }))
    await expect(await c.findByText(/Made "seed" from the app's seed: employees 250/)).toBeInTheDocument()
    await expect(c.getByText('seed')).toBeInTheDocument()
  },
}
/** The app has no seed command yet: the button is there and cannot be pressed, and what is missing is said. */
export const NoSeedCommandYet: Story = {
  beforeEach: withEngine({ fixtures: [], fixtureMake: { ok: false, missing: 'the app has no seed command (Settings › the app › Prototype)' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: "Make one from the app's seed" })).toBeDisabled()
    await expect(c.getByText(/cannot be made from the app's seed yet: the app has no seed command/)).toBeInTheDocument()
  },
}
/** A table's rows are shown as they are: a fixture is made-up data. */
export const LookingAtRows: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('three-people'))
    await userEvent.click(c.getAllByRole('button', { name: 'Show the rows of employees' }).at(-1)!)
    const rows = within(await c.findByRole('region', { name: 'The rows of employees' }))
    await expect(rows.getByText('work_email')).toBeInTheDocument()
    await expect(rows.getByText('avery.sample@northwind.example')).toBeInTheDocument()
  },
}
/** Renamed: a name of letters, numbers and dashes; what was made for its people follows. */
export const Renaming: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Rename three-people' })) // on the fixture's own line; it opens to the form
    const box = c.getByRole('textbox', { name: 'A new name for three-people' })
    await userEvent.clear(box); await userEvent.type(box, 'a-small-team')
    await userEvent.click(c.getByRole('button', { name: 'Rename' }))
    await expect(await c.findByText('a-small-team')).toBeInTheDocument()
    await expect(c.queryByText('three-people')).toBeNull()
  },
}
