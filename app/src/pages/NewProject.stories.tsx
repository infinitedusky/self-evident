import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { NewProject } from './NewProject'
import { withEngine } from '../stories/mock-engine'

// The composer at /projects/new: a project as tasks in order, each with sub-tasks written by hand if wanted.
const meta = { title: 'Pages/NewProject', component: NewProject, parameters: { layout: 'fullscreen', route: { path: '/projects/new', url: '/projects/new' } }, render: () => <div className="tab-page"><NewProject /></div> } satisfies Meta<typeof NewProject>
export default meta
type Story = StoryObj<typeof meta>

/** Blank: a name is enough. No task is asked for: it would be an empty project. */
export const Blank: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Create an empty project' })).toBeDisabled() // no name yet
    await userEvent.type(c.getByPlaceholderText('What this project changes, in a line'), 'Checkout rework (sample)')
    await expect(c.getByRole('button', { name: 'Create an empty project' })).toBeEnabled()
  },
}
/** Described for the agent: the button says it will draft the tasks. */
export const DraftedByTheAgent: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByPlaceholderText('What this project changes, in a line'), 'Checkout rework (sample)')
    await userEvent.type(c.getByLabelText('What the project should cover'), 'Saved cards, then address autocomplete, then the confirmation email (sample).')
    await expect(c.getByRole('button', { name: 'Create and draft the tasks' })).toBeEnabled()
  },
}
/** Written by hand: a task added and titled. */
export const WrittenByHand: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(await c.findByPlaceholderText('What this project changes, in a line'), 'Checkout rework (sample)')
    await userEvent.click(c.getByRole('button', { name: '+ Add a task' }))
    await userEvent.type(c.getByPlaceholderText('Harden the POC'), 'Saved cards (sample)')
    await expect(c.getByRole('button', { name: 'Create project' })).toBeEnabled()
  },
}
/** "Break it down" from an idea: the idea's title and body fill the name, the why and the first task. */
export const FromAnIdea: Story = { parameters: { route: { path: '/projects/new', url: '/projects/new?idea=idea_sample1' } } }
/** No app yet: nothing to pick, and Create stays off. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
