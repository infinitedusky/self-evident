import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from './Shell'
import { engineDown, withEngine } from '../stories/mock-engine'

// The frame every page sits in: the loop as nav, the app picker, the agent's button.
const meta = { title: 'Components/Shell', component: Shell, parameters: { layout: 'fullscreen' }, args: { children: <p className="muted">Sample page content.</p> } } satisfies Meta<typeof Shell>
export default meta
type Story = StoryObj<typeof meta>

export const MyStuff: Story = {}
/** Deep in Plan: the stage and its sub-link both lit. */
export const OnAnIssue: Story = { parameters: { route: { path: '/issues/:id', url: '/issues/iss_sample1' } } }
export const OnTheGraph: Story = { parameters: { route: { path: '/graph', url: '/graph' } } }
/** No apps yet: the picker says where to add one. */
export const NoApps: Story = { beforeEach: withEngine({ apps: [] }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
