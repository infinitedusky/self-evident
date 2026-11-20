import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sketches } from './Sketches'
import { expect, userEvent, within } from 'storybook/test'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'

// A conversation's sketches beside it, in each state the engine reports. The sketch itself is a made-up page, labelled.
const meta = { title: 'Pages/Sketches', component: Sketches, parameters: { layout: 'fullscreen' }, render: (a) => <div className="tab-page"><Sketches {...a} /></div> } satisfies Meta<typeof Sketches>
export default meta
type Story = StoryObj<typeof meta>
const sk = sampleData.sketches

/** One sketch, from the conversation's branch, at the full width of the pane (the default). */
export const OneSketch: Story = { beforeEach: withEngine({ sketches: { ...sk, sketches: sk.sketches.slice(0, 1) } }) }
/** Several: the one changed last shows; the others are a tap away. */
export const Several: Story = {}
/** Opened at one file (the agent's open_tab). */
export const AtAFile: Story = { args: { file: 'checkout.html' } }
/** Nothing sketched yet on this branch: what to do next. */
export const None: Story = { beforeEach: withEngine({ sketches: { ...sk, sketches: [] } }) }
/** A new task: nothing sketched for it yet. The sketches merged with earlier tasks are not its own, so they are counted, not shown. */
export const NewTask: Story = {
  beforeEach: withEngine({ sketches: { ...sk, sketches: [], earlier: 2, all: sk.sketches } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/No sketches for this task yet/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Show 2 from earlier tasks' }))
    await expect(await c.findByTitle('Sketch home.html')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Hide earlier tasks\' sketches' }))
    await expect(await c.findByText(/No sketches for this task yet/)).toBeInTheDocument()
  },
}
/** The task has one of its own, and there are earlier ones a press away. */
export const OwnAndEarlier: Story = {
  beforeEach: withEngine({ sketches: { ...sk, sketches: sk.sketches.slice(0, 1), earlier: 1, all: sk.sketches } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Show 1 from earlier tasks' })).toBeInTheDocument() },
}
/** No conversation in front: the app's own checkout, on main. */
export const FromMain: Story = { beforeEach: withEngine({ sketches: { ...sk, branch: 'main', main: true } }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
