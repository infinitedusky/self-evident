import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sketches } from './Sketches'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'

// A conversation's sketches beside it, in each state the engine reports. The sketch itself is a made-up page, labelled.
const meta = { title: 'Pages/Sketches', component: Sketches, parameters: { layout: 'fullscreen' }, render: (a) => <div className="tab-page"><Sketches {...a} /></div> } satisfies Meta<typeof Sketches>
export default meta
type Story = StoryObj<typeof meta>
const sk = sampleData.sketches

/** One sketch, from the conversation's branch, at phone width. */
export const OneSketch: Story = { beforeEach: withEngine({ sketches: { ...sk, sketches: sk.sketches.slice(0, 1) } }) }
/** Several: the one changed last shows; the others are a tap away. */
export const Several: Story = {}
/** Opened at one file (the agent's open_tab). */
export const AtAFile: Story = { args: { file: 'checkout.html' } }
/** Nothing sketched yet on this branch: what to do next. */
export const None: Story = { beforeEach: withEngine({ sketches: { ...sk, sketches: [] } }) }
/** No conversation in front: the app's own checkout, on main. */
export const FromMain: Story = { beforeEach: withEngine({ sketches: { ...sk, branch: 'main', main: true } }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
