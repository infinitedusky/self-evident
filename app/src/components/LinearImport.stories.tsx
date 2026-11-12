import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { LinearImport } from './LinearImport'
import { withEngine } from '../stories/mock-engine'
import { linearTickets, sampleApp } from '../stories/sample'

// Tasks from Linear tickets, on the Tasks page of an app whose Linear team is set. Made up: the team SHOP and its tickets.
const meta = { title: 'Components/LinearImport', component: LinearImport, args: { appId: sampleApp.id, team: 'SHOP', onImported: fn() },
  render: (a) => <div style={{ maxWidth: 1000 }}><LinearImport {...a} /></div> } satisfies Meta<typeof LinearImport>
export default meta
type Story = StoryObj<typeof meta>

/** Closed, as it sits on the Tasks page: one line and a button. Linear is only asked when it is opened. */
export const Closed: Story = {}

/** Opened on the person's own tickets: two to bring in, one that is already a task here (linked, not offered). */
export const Mine: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Bring in tickets…' }))
    await expect(await c.findByText('Saved cards at checkout (sample)')).toBeVisible()
    await expect(c.getByRole('link', { name: 'SS-20' })).toBeVisible() // SHOP-38 is already a task
    await expect(c.getByRole('button', { name: 'Bring in' })).toBeDisabled() // nothing ticked yet
  },
}

/** Ticked and brought in: the page says which tasks were made, and tells the Tasks page to reload. */
export const BroughtIn: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Bring in tickets…' }))
    await userEvent.click(await c.findByLabelText('SHOP-41: Saved cards at checkout (sample)'))
    await userEvent.click(c.getByLabelText('SHOP-42: Address autocomplete (sample)'))
    await userEvent.click(c.getByRole('button', { name: 'Bring in 2' }))
    await expect(await c.findByText(/Made SS-50 \(SHOP-41\), SS-51 \(SHOP-42\)/)).toBeVisible()
    await expect(args.onImported).toHaveBeenCalled()
  },
}

/** Everyone's: a teammate's ticket and an unassigned one too, with who has each; the search narrows by words in the title, the number or the project. */
export const Everyones: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Bring in tickets…' }))
    await userEvent.click(await c.findByRole('button', { name: "Everyone's" }))
    await expect(await c.findByText('Faster search results (sample)')).toBeVisible()
    await expect(c.getByText('Search · Made-up Teammate · Medium')).toBeVisible()
    await userEvent.type(c.getByLabelText('Filter tickets'), 'search')
    await expect(c.queryByText('Saved cards at checkout (sample)')).toBeNull()
  },
}

/** Nothing assigned to the person: says so, and where to look instead. */
export const NothingMine: Story = {
  beforeEach: withEngine({ linearTickets: linearTickets.filter((t) => !t.mine) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Bring in tickets…' }))
    await expect(await c.findByText(/Nothing open is assigned to you in SHOP/)).toBeVisible()
  },
}

/** The key isn't in the engine's environment: the engine's own sentence, which says what to do. */
export const NoKey: Story = {
  beforeEach: withEngine({ linearProblem: "LINEAR_API_KEY isn't set in the engine's environment. Create a personal API key in Linear (Settings › Account › Security & access), export it as LINEAR_API_KEY where the engine starts, and restart the engine." }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Bring in tickets…' }))
    await expect(await c.findByText(/LINEAR_API_KEY isn't set/)).toBeVisible()
  },
}
