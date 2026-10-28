import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { IdeaPage } from './IdeaPage'
import { bareIdea, sampleIdea } from '../fixtures'

// One idea file: the bet, its PRs, and where evidence will go. Reads no engine data of its own.
const meta = { title: 'Pages/IdeaPage', component: IdeaPage, parameters: { layout: 'fullscreen' }, args: { idea: sampleIdea }, render: (a) => <Shell><IdeaPage {...a} /></Shell> } satisfies Meta<typeof IdeaPage>
export default meta
type Story = StoryObj<typeof meta>

export const IdeaWithPRs: Story = {}
export const IdeaJustCaptured: Story = { args: { idea: bareIdea } }
/** Being tested, with notes. */
export const Testing: Story = { args: { idea: { ...sampleIdea, lane: 'testing', notes: 'Sample: halfway through the look-by window; nothing conclusive yet.' } } }
