import type { Meta, StoryObj } from '@storybook/react-vite'
import { IdeaDetail } from './IdeaDetail'
import { withEngine } from '../stories/mock-engine'
import { expect, within } from 'storybook/test'
import { ideaRows, sampleOrigin, talkSession } from '../stories/sample'

// One idea from the inbox, worked through like a task: its steps down the side, its own agent beside it, and
// converting it. Made up: the sample engine's first idea and a made-up conversation.
const meta = { title: 'Pages/IdeaDetail', component: IdeaDetail, parameters: { layout: 'fullscreen' }, args: { id: ideaRows[0].id }, render: (a) => <div className="tab-page" style={{ height: '100vh' }}><IdeaDetail {...a} /></div> } satisfies Meta<typeof IdeaDetail>
export default meta
type Story = StoryObj<typeof meta>

const inbox = ideaRows.map((i) => ({ ...i, lane: 'inbox' }))
const itsAgent = { ...talkSession, subject: 'Sample: one-page checkout', subjectRef: { ideaId: ideaRows[0].id }, branch: 'talk/sample', worktreePath: '/code/sample-shop-worktrees/talk-sample', ideaId: ideaRows[0].id }

/** In the inbox, not worked on yet: the column offers to start its agent, which is when its worktree is cut. */
export const InTheInbox: Story = { beforeEach: withEngine({ ideas: inbox, ideaTalk: null }),
  play: async ({ canvas }) => { await canvas.findByRole('button', { name: 'Work on this idea' }); await canvas.findByRole('button', { name: 'As a task' }) } }
/** Being worked on: its own agent in the column, as on a task. */
export const WithItsAgent: Story = { beforeEach: withEngine({ ideas: inbox, ideaTalk: itsAgent }),
  play: async ({ canvas }) => { await canvas.findAllByText("This idea's agent"); if (canvas.queryByRole('button', { name: 'Work on this idea' })) throw new Error('it offers to start an agent it already has') } }
/** One step's page (the sketches), the agent still beside it. */
export const OnAStep: Story = { args: { section: 'sketch' }, beforeEach: withEngine({ ideas: inbox, ideaTalk: itsAgent }),
  play: async ({ canvas }) => { await canvas.findAllByText("This idea's agent"); await canvas.findByRole('link', { name: /Overview/ }) } }
/** Already converted: its steps went with it, and so did its agent. */
export const Converted: Story = { beforeEach: withEngine({ ideas: ideaRows.map((i) => ({ ...i, lane: 'build' })), ideaTalk: null }),
  play: async ({ canvas }) => { await canvas.findByText('converted'); if (canvas.queryByRole('button', { name: 'Work on this idea' })) throw new Error('a converted idea offers an agent') } }
/** No such idea. */
export const Missing: Story = { args: { id: 'idea_nothing' } }
/** Brought in from a Linear ticket (made up): the overview says which, and its Context holds the ticket word for word. */
export const FromATicket: Story = { beforeEach: withEngine({ ideas: inbox.map((i, n) => (n === 0 ? { ...i, origin: sampleOrigin } : i)) as never, ideaTalk: null }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/It came from Linear SHOP-41/)).toBeInTheDocument() } }
/** An idea's Context: the same section as a task's, and what is in it goes with the idea when it is converted. */
export const ItsContext: Story = { args: { section: 'context' }, beforeEach: withEngine({ ideas: inbox, ideaTalk: null }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(await c.findByText(/it goes with the idea when it becomes a task or a project/)).toBeVisible(); await expect((await c.findByRole('link', { name: /Context/ })).className).toContain('active') } }
