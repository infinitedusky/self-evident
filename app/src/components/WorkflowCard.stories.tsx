import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { afterOf, checksOf, withChecks, type Workflow } from '@self-evident/engine/steps'
import { WorkflowCard } from './WorkflowCard'
import { quickWorkflow, uiWorkflow } from '../stories/sample'

// One workflow: which steps, how strictly, in what order. Made up.
const meta = { title: 'Components/WorkflowCard', component: WorkflowCard, args: { workflow: uiWorkflow, usedBy: 'The app\'s default · 1 project uses it (sample)', onSave: fn() },
  render: (a) => <div style={{ maxWidth: 560 }}><WorkflowCard {...a} /></div> } satisfies Meta<typeof WorkflowCard>
export default meta
type Story = StoryObj<typeof meta>

/** Reading it: ordered, two steps required. */
export const UiChange: Story = {}
/** Only the brief; the rest switched off; any order. */
export const QuickFix: Story = { args: { workflow: quickWorkflow, usedBy: '1 task uses it (sample)' } }
/** Editing: switch steps on or off, required or optional, move them, enforce the order. */
export const Editing: Story = { args: { editing: true } }

/** Fast (made up): no checks after the prototype, so it reads plan, then build. */
export const Fast: Story = {
  args: { workflow: withChecks(uiWorkflow, 'fast') },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Fast')).toBeInTheDocument()
    await expect(c.getByText(/No checks: planned and built straight after the prototype/)).toBeInTheDocument()
    await expect(c.queryByText('Audit')).toBeNull()
  },
}
/** Some of the checks (made up): the ones it runs are listed, the ones it does not are named. */
export const PicksItsChecks: Story = {
  args: { workflow: withChecks(uiWorkflow, ['analysis', 'risk']) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Your pick')).toBeInTheDocument()
    await expect(c.getByText(/Blast radius$/)).toBeInTheDocument()
    await expect(c.getByText(/Not run: Draft ADR, Audit, Final ADR and plan\./)).toBeInTheDocument()
  },
}
/** Editing: three choices for what follows the prototype; "Your pick" opens a box for each check, and what is saved is what was chosen. */
export const ChoosingWhatFollows: Story = {
  args: { editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('radio', { name: /Full/ })).toBeChecked()
    await userEvent.click(c.getByRole('radio', { name: /Your pick/ }))
    await expect(c.getByRole('checkbox', { name: /Audit/ })).toBeChecked() // starts from what it had
    await userEvent.click(c.getByRole('checkbox', { name: /Audit/ }))
    await userEvent.click(c.getByRole('checkbox', { name: /Draft ADR/ }))
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    const saved = (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow
    await expect(checksOf(saved)).toEqual(['analysis', 'risk', 'final'])
    await expect(c.getByText(/Not run: Draft ADR, Audit\./)).toBeInTheDocument()
  },
}
/** Editing, Fast chosen: saved with every check off. */
export const ChoosingFast: Story = {
  args: { editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('radio', { name: /Fast/ }))
    await expect(c.queryByRole('checkbox', { name: /Audit/ })).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(afterOf((args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow)).toBe('fast')
  },
}

const main: Workflow = { ...withChecks(uiWorkflow, 'fast'), name: 'Main', build: 'one', style: 'checklist', requirements: { adr: true, risks: true } }

/** Main (made up), a checklist: what a build is held to, then what happens by itself. No stages before the build. */
export const MainChecklist: Story = {
  args: { workflow: main, usedBy: 'The app\'s default (sample)' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Checklist')).toBeInTheDocument()
    await expect(c.getByText('What a build is held to')).toBeInTheDocument()
    for (const name of ['Telemetry', 'Tests', 'Decision record', 'Risks']) await expect(c.getByText(name)).toBeInTheDocument()
    await expect(c.getByText(/Built in one go: one builder, the whole task/)).toBeInTheDocument()
    await expect(c.getByText(/Checked against the list, by an agent that did not build it/)).toBeInTheDocument()
    await expect(c.queryByText('After the prototype is approved')).toBeNull() // that question is a staged workflow's
  },
}
/** Editing a checklist: sub-tasks or not, and a box for each requirement. What is saved is what was ticked. */
export const ChoosingTheChecklist: Story = {
  args: { workflow: main, editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('radio', { name: /Checklist/ })).toBeChecked()
    await expect(c.getByRole('radio', { name: /In one go/ })).toBeChecked()
    await expect(c.getByRole('checkbox', { name: /Decision record/ })).toBeChecked() // Main switches it on
    await expect(c.getByRole('checkbox', { name: /Telemetry/ })).toBeChecked() // the app has it on
    await userEvent.click(c.getByRole('checkbox', { name: /Risks/ }))
    await userEvent.click(c.getByRole('checkbox', { name: /Docs/ }))
    await userEvent.click(c.getByRole('radio', { name: /In sub-tasks/ }))
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    const saved = (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow
    await expect(saved).toMatchObject({ style: 'checklist', build: 'planned', requirements: { adr: true, risks: false, docs: false } })
    await expect(c.getByText(/Not held to: Docs, Risks\./)).toBeInTheDocument()
    await expect(c.getByText(/Planned into sub-tasks, built side by side/)).toBeInTheDocument()
  },
}
/** A staged workflow made into a checklist: its checks before the build go, and the list appears. And back: it is planned again, with every check. */
export const ChangingKind: Story = {
  args: { editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('radio', { name: /Staged/ })).toBeChecked() // a workflow from before: as it was
    await expect(c.getByRole('radio', { name: /Full/ })).toBeInTheDocument()
    await userEvent.click(c.getByRole('radio', { name: /Checklist/ }))
    await expect(c.queryByRole('radio', { name: /Full/ })).toBeNull()
    await expect(c.getByRole('checkbox', { name: /Tests/ })).toBeChecked()
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    const saved = (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow
    await expect(saved.style).toBe('checklist'); await expect(afterOf(saved)).toBe('fast')
  },
}
/** Editing: its name can be changed, so two workflows are never both "Main"; a name left empty cannot be saved. */
export const Renaming: Story = {
  args: { workflow: main, editing: true, onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    const name = c.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue(main.name)
    await userEvent.clear(name)
    await expect(c.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(name, '  Dashboard changes (sample) ')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    const saved = (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as Workflow
    await expect(saved.name).toBe('Dashboard changes (sample)')
    await expect(c.getByText('Dashboard changes (sample)')).toBeInTheDocument()
  },
}
