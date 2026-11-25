import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Learn } from './Learn'
import { withEngine } from '../stories/mock-engine'
import type { AppDoc, Learning } from '../engine'

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
    await expect(c.queryByRole('complementary', { name: 'Learn\'s agent' })).toBeNull() // no agent until it is started
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
    const agent = within(c.getByRole('complementary', { name: 'Learn\'s agent' })) // its own agent, beside what it wrote, to ask
    await expect(await agent.findByRole('textbox')).toBeInTheDocument()
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
// The person's own pages about the app (made up, the sample shop): what they understand, in their words.
const pages: AppDoc[] = [
  { id: 'adoc_sample_1', title: 'How an order gets to the tablet', by: 'user', createdAt: at, updatedAt: '2026-11-20T10:00:00Z', body: 'My understanding (sample):\n\n1. The storefront posts the order to the server.\n2. The server takes the payment, then saves the order.\n3. The tablet asks for new orders every five seconds.\n\nNot sure: what the tablet shows if the payment is still pending.' },
  { id: 'adoc_sample_2', title: 'Refunds', by: 'agent', createdAt: at, updatedAt: '2026-11-22T10:00:00Z', body: 'The refund button is on the order page, and it calls nothing yet (sample). Written down from what I said to Learn\'s agent.' },
]

/** No pages yet: the section says what they are for and the two ways one gets written. */
export const NoDocsYet: Story = {
  beforeEach: withEngine({ learning: learned }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await expect(await docs.findByText(/how you understand this app, in your own words/)).toBeInTheDocument()
    await expect(docs.getByRole('button', { name: 'New page' })).toBeEnabled()
  },
}
/** Pages kept: each is a title to open, with who wrote it last and when; the first is open. */
export const YourDocs: Story = {
  beforeEach: withEngine({ learning: learned, appDocs: pages }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await expect(await docs.findByText('How an order gets to the tablet')).toBeInTheDocument()
    await expect(docs.getByText(/The tablet asks for new orders every five seconds/)).toBeVisible() // the first is open
    await expect(docs.getByText(/it calls nothing yet/)).not.toBeVisible() // the others are folded
    await expect(docs.getByText(/an agent, at your word/)).toBeInTheDocument() // who wrote it last
    await userEvent.click(docs.getByText('Refunds'))
    await expect(docs.getByText(/it calls nothing yet/)).toBeVisible()
  },
}
/** Writing one: a title and the page in Markdown; saved, it is in the list and open. */
export const WriteAPage: Story = {
  beforeEach: withEngine({ learning: learned, appDocs: [pages[0]] }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await userEvent.click(await docs.findByRole('button', { name: 'New page' }))
    await expect(docs.getByRole('button', { name: 'Save' })).toBeDisabled() // a page needs a title
    await userEvent.type(docs.getByRole('textbox', { name: 'Title' }), 'Who can sign in')
    await userEvent.type(docs.getByRole('textbox', { name: 'Page' }), 'Only the shopkeeper, with a **code** sent by text (sample).')
    await userEvent.click(docs.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(docs.getByText('Who can sign in')).toBeInTheDocument())
    await expect(docs.getByText(/Only the shopkeeper/)).toBeVisible()
    await expect(docs.queryByRole('textbox', { name: 'Title' })).toBeNull()
  },
}
/** Changing one in place, and backing out of a change. */
export const EditAPage: Story = {
  beforeEach: withEngine({ learning: learned, appDocs: pages }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await userEvent.click((await docs.findAllByRole('button', { name: 'Edit' }))[0])
    const page = docs.getByRole('textbox', { name: 'Page' })
    await expect(page).toHaveValue(pages[0].body)
    await userEvent.clear(page); await userEvent.type(page, 'The server pushes each order to the tablet (sample).')
    await userEvent.click(docs.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(docs.getByText(/The server pushes each order/)).toBeVisible())
    await userEvent.click(docs.getAllByRole('button', { name: 'Edit' })[0])
    await userEvent.click(docs.getByRole('button', { name: 'Cancel' }))
    await expect(docs.queryByRole('textbox', { name: 'Page' })).toBeNull()
  },
}
/** Deleting one asks once more, in place. */
export const DeleteAPage: Story = {
  beforeEach: withEngine({ learning: learned, appDocs: pages }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await userEvent.click((await docs.findAllByRole('button', { name: 'Delete' }))[0])
    await userEvent.click(docs.getByRole('button', { name: 'Keep it' })) // backed out: still there
    await expect(docs.getByText('How an order gets to the tablet')).toBeInTheDocument()
    await userEvent.click(docs.getAllByRole('button', { name: 'Delete' })[0])
    await userEvent.click(docs.getByRole('button', { name: 'Delete this page' }))
    await waitFor(() => expect(docs.queryByText('How an order gets to the tablet')).toBeNull())
    await expect(docs.getByText('Refunds')).toBeInTheDocument()
  },
}
/** A page the engine refuses (a title the app already has): its reason shows, and what was typed is kept. */
export const PageRefused: Story = {
  beforeEach: withEngine({ learning: learned, appDocs: pages, appDocError: 'this app already has a page called "Refunds" (sample)' }),
  play: async ({ canvasElement }) => {
    const docs = within(await within(canvasElement).findByRole('region', { name: 'Your docs' }))
    await userEvent.click(await docs.findByRole('button', { name: 'New page' }))
    await userEvent.type(docs.getByRole('textbox', { name: 'Title' }), 'Refunds')
    await userEvent.click(docs.getByRole('button', { name: 'Save' }))
    await expect(await docs.findByText(/already has a page called "Refunds"/)).toBeInTheDocument()
    await expect(docs.getByRole('textbox', { name: 'Title' })).toHaveValue('Refunds')
  },
}
/** No app added yet: the page still explains itself. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
