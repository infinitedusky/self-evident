import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Board } from './Board'
import { IdeaPage } from './IdeaPage'
import { Settings } from './Settings'
import { ideas } from '../ideas'
import { bareIdea, sampleIdea } from '../fixtures'

// Page stories use the real idea files where they exist, and labelled samples for other states.
const meta = { title: 'Pages', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
const page = (el: React.ReactNode) => <Shell>{el}</Shell> // the app list and the agent drawer come from the engine; empty in stories

export const BoardToday: Story = { render: () => page(<Board ideas={ideas} />) }
export const BoardEmpty: Story = { render: () => page(<Board ideas={[]} />) }
export const IdeaWithPRs: Story = { render: () => page(<IdeaPage idea={sampleIdea} />) }
export const IdeaJustCaptured: Story = { render: () => page(<IdeaPage idea={bareIdea} />) }
export const SettingsToday: Story = { render: () => page(<Settings />) }
