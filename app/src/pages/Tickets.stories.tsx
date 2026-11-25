import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Tickets } from './Tickets'
import { http, HttpResponse } from 'msw'
import { engineDown, mockEngine, withEngine } from '../stories/mock-engine'

// The app's tickets at /tickets, each with the tasks under it; one ticket at /tickets/:key. Made-up tickets and tasks (sample).
const meta = { title: 'Pages/Tickets', component: Tickets, parameters: { layout: 'fullscreen', route: { path: '/tickets', url: '/tickets' } }, render: () => <div className="tab-page"><Tickets /></div> } satisfies Meta<typeof Tickets>
export default meta
type Story = StoryObj<typeof meta>
const one = (key: string) => ({ route: { path: '/tickets/:key', url: `/tickets/${key}` } })

/** Every ticket with a task under it: the ones still being worked first, each saying how many of its tasks are done. A ticket bigger than one pull request has a task for each. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const big = await c.findByRole('region', { name: 'SHOP-323' })
    await expect(within(big).getByText('1 of 3 tasks done')).toBeInTheDocument()
    await expect(within(big).getByRole('link', { name: /SS-41/ })).toHaveAttribute('href', expect.stringContaining('/tasks/iss_sample41'))
    await expect(within(big).getByRole('link', { name: 'PR #32 · open' })).toBeInTheDocument()
    await expect(within(big).getByText(/dropped, not counted/)).toBeInTheDocument() // a canceled task is listed and not counted
    await expect(within(await c.findByRole('region', { name: 'SHOP-301' })).getAllByText('Done')).toHaveLength(3) // the ticket, and both its tasks
  },
}
/** One ticket, opened from a task: its title and link as its tracker has them, and its tasks in order with their pull requests. */
export const OneTicket: Story = {
  parameters: one('SHOP-323'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: /SHOP-323.*Protected people/ })).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'Open it in Linear' })).toBeInTheDocument()
    await expect(c.getByRole('link', { name: 'All tickets' })).toBeInTheDocument()
    await expect(c.queryByRole('region', { name: 'SHOP-301' })).not.toBeInTheDocument()
  },
}
/** Known by its key alone, read from a link in a task: it says so, and one press reads its title and link from the tracker. */
export const KeyAlone: Story = {
  parameters: one('SHOP-330'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Only its key is known/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Read it from Linear' }))
    await expect(await c.findByRole('heading', { name: /Takedown requests for protected people/ })).toBeInTheDocument()
  },
}
/** Every task under it done: the ticket is done. */
export const Finished: Story = { parameters: one('SHOP-301') }
/** A key no task is under. */
export const NoSuchTicket: Story = { parameters: one('SHOP-999'), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/no ticket SHOP-999 here/)).toBeInTheDocument() } }
/** The tracker can't be read: said, and the ticket stays as it was. */
export const CannotBeRead: Story = {
  parameters: one('SHOP-330'),
  beforeEach: withEngine([http.post('/api/apps/:id/tickets/:key/read', () => HttpResponse.json({ error: 'Linear isn\'t set for Sample shop: give it the team key and the key variable under Settings › Sample shop › Integrations › Linear.' }, { status: 400 })), ...mockEngine()]),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Read it from Linear' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('Linear isn\'t set')
  },
}
/** No task has a ticket yet. */
export const Empty: Story = { beforeEach: withEngine({ tickets: [] }) }
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
