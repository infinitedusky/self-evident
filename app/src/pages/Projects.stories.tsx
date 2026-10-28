import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Projects } from './Projects'
import { engineDown, withEngine } from '../stories/mock-engine'
import { projects } from '../stories/sample'
import type { ProjectSummary } from '../engine'

// The project list at /projects (mode "project": every stage, filtered) and /build (mode "build": what runs and what landed).
const meta = { title: 'Pages/Projects', component: Projects, parameters: { layout: 'fullscreen' }, args: { mode: 'project' }, render: (args) => <Shell><Projects {...args} /></Shell> } satisfies Meta<typeof Projects>
export default meta
type Story = StoryObj<typeof meta>

// Made up: one of each stage the filters count, drafting and stopped included.
const every: ProjectSummary[] = [
  ...projects.map((p) => (p.status === 'draft' ? { ...p, status: 'drafting' } : p)),
  { ...projects[0], id: 'proj_paused', name: 'Saved carts (sample)', status: 'paused', builds: { done: 2, queued: 1 } },
  { ...projects[0], id: 'proj_stopped', name: 'Wishlists (sample)', status: 'stopped', backlogOpen: 0, builds: { done: 1, failed: 1, cancelled: 2 } },
]

/** Projects, the Open filter: the sample engine's running project and its draft. */
export const Plan: Story = {}
/** Every stage present, so each filter has something in it. */
export const PlanEveryStage: Story = { beforeEach: withEngine({ projects: every }) }
/** No projects at all. */
export const PlanEmpty: Story = { beforeEach: withEngine({ projects: [] }) }
/** Build: what is running and what landed; drafts are left out. */
export const Build: Story = { args: { mode: 'build' }, beforeEach: withEngine({ projects: every }) }
/** Build, with nothing running or landed yet. */
export const BuildEmpty: Story = { args: { mode: 'build' }, beforeEach: withEngine({ projects: [every[1]] }) }
/** No app yet: the first run, before Settings. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
