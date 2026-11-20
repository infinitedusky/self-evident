import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { rows } from '@self-evident/engine/steps'
import { TaskNav } from './TaskNav'
import { approvedTaskStepsView, quickWorkflow, taskStepsView, waitingTaskStepsView , checklistSample } from '../stories/sample'

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

/** A checklist task (made up): under Build, a row for the list and a row for each stage it goes through by itself, with where each is. No "Sub-tasks, not planned". */
export const ChecklistTask: Story = {
  args: { here: 'build', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 1, total: 2, waitingOn: null }, checklist: checklistSample, workflow: { name: 'Main (sample)', from: ', the app\'s default' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('link', { name: /Checklist/ })).toHaveTextContent('4/7')
    for (const stage of ['Check', 'Probe', 'Tests']) await expect(c.getByText(stage, { exact: true })).toBeInTheDocument()
    await expect(c.getByText('built in one go')).toBeInTheDocument() // the Build row, under the Build heading
    await expect(c.getByText('round 1: 2 not done, sent back')).toBeInTheDocument()
    await expect(c.queryByText(/Sub-tasks/)).toBeNull()
  },
}
/** A checklist task on its list's page. */
export const OnTheChecklist: Story = { args: { ...ChecklistTask.args, here: 'checklist' }, play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole('link', { name: /Checklist/ }).className).toContain('active') } }

/** A staged task (no checklist): the smoke test sits in Build, after Sub-tasks, with how many criteria are yours to check by hand. */
export const SmokeTestAfterSubTasks: Story = {
  args: { here: 'build', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 4, total: 9, waitingOn: null }, smoke: { owed: 6, total: 8, failed: 0 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const link = c.getByRole('link', { name: /Smoke test/ })
    await expect(link).toHaveAttribute('href', '/tasks/iss_sample20/smoke'); await expect(link).toHaveTextContent('6 for you')
    const names = c.getAllByRole('link').map((a) => a.textContent ?? '')
    await expect(names.findIndex((n) => n.includes('Sub-tasks'))).toBeLessThan(names.findIndex((n) => n.includes('Smoke test')))
  },
}
/** Every one checked by hand, and one you failed: said on the row. */
/** The pull request is a step of its own, after the smoke test: not submitted yet, then a draft by its number. Made-up task (sample). */
export const WithPullRequest: Story = {
  args: { here: 'pr', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 9, total: 9, waitingOn: null }, smoke: { owed: 0, total: 8, failed: 0 }, pr: { status: 'draft', number: 412 } },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: /Pull request/ })
    await expect(link).toHaveTextContent('draft #412'); await expect(link).toHaveAttribute('href', expect.stringContaining('/pr'))
  },
}
export const SmokeTestMarked: Story = { args: { here: 'smoke', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 9, total: 9, waitingOn: null }, smoke: { owed: 0, total: 8, failed: 1 } } }

/** A staged task whose every criterion an agent checked: the smoke test row stays, so it can still be opened and tried. */
export const SmokeTestNothingLeft: Story = {
  args: { here: 'build', rows: rows('task', approvedTaskStepsView.states, approvedTaskStepsView.resolved.workflow), build: { done: 9, total: 9, waitingOn: null }, smoke: { owed: 0, total: 0, failed: 0, built: true } },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: /Smoke test/ })
    await expect(link).toHaveAttribute('href', '/tasks/iss_sample20/smoke'); await expect(link).toHaveTextContent('nothing left to you; look anyway')
  },
}
