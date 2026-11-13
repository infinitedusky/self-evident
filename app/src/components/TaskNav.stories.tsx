import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { rows } from '@self-evident/engine/steps'
import { TaskNav } from './TaskNav'
import { approvedTaskStepsView, quickWorkflow, taskStepsView, waitingTaskStepsView } from '../stories/sample'

// A task's nav, from made-up step states under the sample workflows.
const meta = { title: 'Components/TaskNav', component: TaskNav,
  args: { base: '/tasks/iss_sample20', here: 'overview', rows: rows('task', taskStepsView.states, taskStepsView.resolved.workflow), workflow: { name: 'UI change (sample)', from: ', from its project' }, build: { done: 0, total: 0, waitingOn: 'the brief\'s approval' } },
  render: (a) => <div style={{ width: 240 }}><TaskNav {...a} /></div> } satisfies Meta<typeof TaskNav>
export default meta
type Story = StoryObj<typeof meta>

/** The brief first, the steps that feed it under it: it waits on the blast radius, which is required, and the build waits on its approval. */
export const InOrder: Story = {}
/** In an enforced order with the mockups unfinished: the blast radius after them is greyed. */
export const AStepWaits: Story = { args: { rows: rows('task', waitingTaskStepsView.states, waitingTaskStepsView.resolved.workflow) } }
/** Folded to icons, to give the step's page the room; the chevron opens it again. */
export const Folded: Story = { args: { folded: true, here: 'mockup', onToggle: () => {} }, render: (a) => <div style={{ width: 52 }}><TaskNav {...a} /></div> }
/** On a step's page. */
export const OnAStep: Story = { args: { here: 'mockup' } }
/** Every step done and the brief approved: the build is under way. */
export const BriefApproved: Story = { args: { here: 'build', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 1, total: 3, waitingOn: null } } }
/** A workflow with no order and fewer steps: nothing waits but the build. */
export const NoOrder: Story = { args: { rows: rows('task', [{ key: 'brief', status: 'started' }], quickWorkflow) } }

// Made up: the sample task saved twice, with one earlier try set aside.
const saves = { current: 'Main', points: [{ id: 'save_review', name: 'Proto before review (sample)' }, { id: 'save_approved', name: 'Prototype approved' }], aside: [{ id: 'tb_wallet', name: 'Wallet first (sample)' }] }
/** Save points at the bottom: the task branch being worked on first, then each save point and what was set aside. Each goes to the save points page. */
export const SavePoints: Story = {
  args: { saves, onSave: fn() },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Main')).toBeInTheDocument()
    await expect(c.getByText('working on')).toBeInTheDocument()
    await expect(c.getByRole('link', { name: /Proto before review \(sample\)/ })).toHaveAttribute('href', '/tasks/iss_sample20/saves?at=save_review')
    await expect(c.getByRole('link', { name: /Save points/ })).toHaveAttribute('href', '/tasks/iss_sample20/saves')
    for (const a of c.getAllByRole('link')) if (!/Overview/.test(a.textContent ?? '')) await expect(a).not.toHaveClass('active') // on the overview, nothing down here is lit
    await expect(c.getByRole('link', { name: /Wallet first \(sample\)/ })).toBeInTheDocument()
  },
}
/** On the save points page only its own row is lit, not every save point. */
export const OnTheSavePointsPage: Story = { args: { saves, onSave: fn(), here: 'saves' }, play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByRole('link', { name: /Save points/ })).toHaveClass('active'); await expect(c.getByRole('link', { name: /Proto before review/ })).not.toHaveClass('active') } }
/** Nothing saved yet: only the way to save. */
export const NoSavePointsYet: Story = { args: { saves: { current: null, points: [], aside: [] }, onSave: fn() } }
/** Saving from the nav: a name, Enter, and the work carries on. */
export const SaveFromTheNav: Story = {
  args: { saves, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Save here' }))
    await userEvent.type(c.getByLabelText('Name of the save point'), 'Waiting for approval (sample){Enter}')
    await expect(args.onSave).toHaveBeenCalledWith('Waiting for approval (sample)')
  },
}
/** Folded: one icon for the save points, with how many in its tooltip. */
export const FoldedWithSavePoints: Story = { args: { folded: true, saves, onToggle: () => {} }, render: (a) => <div style={{ width: 52 }}><TaskNav {...a} /></div> }
