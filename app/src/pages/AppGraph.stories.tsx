import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { AppGraph } from './AppGraph'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { graph } from '../stories/sample'

// Every sub-issue of every project in the sample app, on one canvas.
const meta = { title: 'Pages/AppGraph', component: AppGraph, parameters: { layout: 'fullscreen', route: { path: '/graph', url: '/graph' } }, render: () => <Shell><AppGraph /></Shell> } satisfies Meta<typeof AppGraph>
export default meta
type Story = StoryObj<typeof meta>

/** Mid-run, with two sub-issues taking turns on a shared file. */
export const MidRun: Story = {}
/** Only the running project, without the shared file. */
export const NoConflicts: Story = { beforeEach: withEngine({ graphs: { proj_checkout: { ...graph, conflicts: [], files: [] } } }) }
/** Nothing planned in the app yet. */
export const NothingPlanned: Story = { beforeEach: withEngine({ graphs: {} }) }
/** Everything landed. */
export const AllLanded: Story = { beforeEach: withEngine({ graphs: { ...sampleData.graphs, proj_checkout: { ...graph, conflicts: [], files: [], subIssues: graph.subIssues.map((s) => ({ ...s, status: 'done' as const, state: 'done' as const, heldReason: null, steps: undefined })) } } }) }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
