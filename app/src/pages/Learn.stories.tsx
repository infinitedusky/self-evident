import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Learn } from './Learn'
import { withEngine } from '../stories/mock-engine'
import type { Learning } from '../engine'

// Learn has two halves: the codebase (an agent reads the code and writes four short documents) and the running app
// (nothing reads the telemetry back yet). Everything here is made up: the sample shop.
const meta = { title: 'Pages/Learn', component: Learn, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Learn /></div> } satisfies Meta<typeof Learn>
export default meta
type Story = StoryObj<typeof meta>

const at = '2026-11-16T10:00:00Z'
const learned: Learning = {
  working: null, sessionId: 'talk_sample_learn', stale: 0, missing: [],
  docs: [
    { key: 'what', title: 'What it is', sha: 'abc1234', updatedAt: at, summary: 'A shop for one street (sample): customers order from the web, the shopkeeper sees orders on a tablet. Checkout and orders work. Refunds are half built: the button exists, nothing happens.', body: 'web/ is the storefront (Next.js). server/ takes orders and payments. tablet/ is the shopkeeper\'s view (sample).' },
    { key: 'parts', title: 'The parts', sha: 'abc1234', updatedAt: at, summary: '- **web/**: the storefront\n- **server/**: orders and payments, one Postgres\n- **tablet/**: reads orders from the server every five seconds; it has no tests (sample)', body: 'web calls server over /api/orders. tablet polls GET /orders?since= (sample).' },
    { key: 'run', title: 'Running and testing it', sha: 'abc1234', updatedAt: at, summary: '`pnpm dev` runs all three. `pnpm test` takes nine minutes, eight of them drawing every story in four themes: far more than a small change needs (sample).', body: 'web/package.json "test" runs vitest once per theme. Run one theme locally: THEME=light pnpm vitest run (sample).' },
    { key: 'fragile', title: 'What is fragile', sha: 'abc1234', updatedAt: at, summary: 'The payment callback has no test and no retry: a dropped call loses the order. You would notice only from a customer (sample).', body: 'server/pay/callback.ts: no idempotency key, no span on failure (sample).' },
  ],
}

/** Before anything is learned: what the press does, and one press. */
export const NothingLearnedYet: Story = {
  beforeEach: withEngine({ learning: { docs: [], missing: ['What it is', 'The parts', 'Running and testing it', 'What is fragile'], working: null, sessionId: null, stale: 0 } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Learn this codebase' })).toBeEnabled()
    await expect(c.getByText(/reads the code and writes four short documents/)).toBeInTheDocument()
  },
}
/** The agent is reading the code: the page says so and offers nothing to press twice. */
export const Learning_: Story = {
  name: 'Learning',
  beforeEach: withEngine({ learning: { docs: [learned.docs[0]], missing: ['The parts', 'Running and testing it', 'What is fragile'], working: { sessionId: 'talk_sample_learn' }, sessionId: 'talk_sample_learn', stale: 0 } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/An agent is reading the code/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: /Learn/ })).toBeNull()
    await expect(c.getByText('What it is')).toBeInTheDocument() // what it has written so far already shows
  },
}
/** Learned: four short documents, the part for a person showing, the part for agents folded under each. */
export const Learned: Story = {
  beforeEach: withEngine({ learning: learned }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/nine minutes, eight of them drawing every story/)).toBeInTheDocument()
    await expect(c.getAllByText('For agents')).toHaveLength(4)
    await expect(c.getByText(/no idempotency key/)).not.toBeVisible()
    await expect(c.getByRole('button', { name: 'Learn it again' })).toBeInTheDocument()
    await expect(c.getByRole('link', { name: /ideas/i })).toBeInTheDocument() // the way on: what it thought should change is in Ideas
  },
}
/** The code has moved on since: it says so, and learning it again is the press. */
export const CodeHasMoved: Story = {
  beforeEach: withEngine({ learning: { ...learned, stale: 4 } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/The code has changed since these were written/)).toBeInTheDocument() },
}
/** Pressing it starts the agent; the page then says it is reading. */
export const PressToLearn: Story = {
  beforeEach: withEngine({ learning: { docs: [], missing: ['What it is', 'The parts', 'Running and testing it', 'What is fragile'], working: null, sessionId: null, stale: 0 } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Learn this codebase' }))
    await waitFor(() => expect(c.getByText(/An agent is reading the code/)).toBeInTheDocument())
  },
}
/** No app added yet: the page still explains itself. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
