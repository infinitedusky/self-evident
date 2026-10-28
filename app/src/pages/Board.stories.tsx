import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Board } from './Board'
import { ideas } from '../ideas'
import { sampleIdea } from '../fixtures'
import { engineDown, withEngine } from '../stories/mock-engine'
import { ideaRows, sampleApp } from '../stories/sample'

// Ideate: the inbox from the sample engine, then the design-note idea files for the current app (Sample Shop).
const meta = { title: 'Pages/Board', component: Board, parameters: { layout: 'fullscreen' }, args: { ideas }, render: (a) => <Shell><Board {...a} /></Shell> } satisfies Meta<typeof Board>
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
