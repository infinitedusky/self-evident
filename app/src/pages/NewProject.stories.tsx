import type { Meta, StoryObj } from '@storybook/react-vite'
import { NewProject } from './NewProject'
import { withEngine } from '../stories/mock-engine'

// The composer at /projects/new: a project as tasks in order, each with sub-tasks written by hand if wanted.
const meta = { title: 'Pages/NewProject', component: NewProject, parameters: { layout: 'fullscreen', route: { path: '/projects/new', url: '/projects/new' } }, render: () => <div className="tab-page"><NewProject /></div> } satisfies Meta<typeof NewProject>
export default meta
type Story = StoryObj<typeof meta>

/** Blank: one empty task, ready to write. */
export const Blank: Story = {}
/** "Break it down" from an idea: the idea's title and body fill the name, the why and the first task. */
export const FromAnIdea: Story = { parameters: { route: { path: '/projects/new', url: '/projects/new?idea=idea_sample1' } } }
/** No app yet: nothing to pick, and Create stays off. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
