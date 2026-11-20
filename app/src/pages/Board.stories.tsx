import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from './Board'
import { ideas } from '../ideas'
import { sampleIdea } from '../fixtures'
import { expect, within } from 'storybook/test'
import { engineDown, withEngine } from '../stories/mock-engine'
import { ideaRows, sampleApp } from '../stories/sample'

// Ideate: the inbox from the sample engine, then the design-note idea files for the current app (Sample Shop).
const meta = { title: 'Pages/Board', component: Board, parameters: { layout: 'fullscreen' }, args: { ideas }, render: (a) => <div className="tab-page"><Board {...a} /></div> } satisfies Meta<typeof Board>
export default meta
type Story = StoryObj<typeof meta>
const inbox = [
  { id: 'idea_sample3', appId: sampleApp.id, number: 3, title: 'Sample: remember the last address used', body: 'Noticed while building checkout. Saves typing for returning customers.', lane: 'inbox' },
  { id: 'idea_sample4', appId: sampleApp.id, number: 4, title: 'Sample: a size guide on product pages', body: null, lane: 'inbox' },
]

/** As it was: the real idea files (none belong to Sample Shop, so only the inbox shows). */
export const BoardToday: Story = {}
/** An inbox with two ideas, two already planned, and a design note for this app. */
export const WithInbox: Story = { args: { ideas: [sampleIdea] }, beforeEach: withEngine({ ideas: [...inbox, ...ideaRows] }) }
export const BoardEmpty: Story = { args: { ideas: [] }, beforeEach: withEngine({ ideas: [] }) }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
/** An app whose Linear team is set (made up: SHOP): its tickets are brought in here, each as an idea. */
export const WithLinear: Story = {
  beforeEach: withEngine({ ideas: inbox, apps: [{ ...sampleApp, setup: { ...sampleApp.setup, integrations: { linear: { team: 'SHOP', key_env: 'LINEAR_API_KEY' } } } }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/A ticket becomes an idea here/)).toBeVisible()
  },
}
