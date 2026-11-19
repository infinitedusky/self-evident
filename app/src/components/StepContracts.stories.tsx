import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { StepGroup } from '@self-evident/engine/contracts'
import { StepContracts } from './StepContracts'

// Sample data throughout: a made-up app with two repositories (enterprise-dashboard, backend-core), made-up skills and probes.
const skill = (name: string, from: string, more: object = {}) => ({ name, label: name.split(':').pop()!, from, ...more })
const groups: StepGroup[] = [
  { title: 'Before the build', steps: [
    { key: 'research', icon: '🔎', label: 'Research', needs: ['The idea or task'], leaves: ['A research note'], done: 'The note says who does this best and the case against.', stages: [
      { key: 'do', by: 'agent', what: 'Reads the code and the web.', skills: [] },
      { key: 'report', by: 'agent', what: 'A summary for you, the full note for the next agent.' },
    ] },
    { key: 'mockup', icon: '🎨', label: 'Mockups', needs: ['The brief so far'], leaves: ['Stories with made-up data'], done: 'You picked one.', stages: [
      { key: 'do', by: 'agent', what: 'Writes the stories.', skills: [skill('design-system', 'enterprise-dashboard (sample)')] },
      { key: 'report', by: 'agent', what: 'Which stories to open.' },
    ] },
    { key: 'prototype', icon: '🛠️', label: 'Prototype', needs: ['The brief', 'The agreed mockup'], leaves: ['A branch that runs', 'A guide to try it'], done: 'You approved it.', stages: [
      { key: 'prepare', by: 'engine', what: 'A worktree and a port of its own.' },
      { key: 'do', by: 'agent', what: 'Builds it the way we would ship it.', skills: [skill('self-evident:prototype', 'Self Evident', { fixed: true })] },
      { key: 'report', by: 'agent', what: 'One line per requirement, what is not met first.' },
    ] },
  ] },
  { title: 'The build', steps: [
    { key: 'build', icon: '🧱', label: 'Build', needs: ['The approved brief', 'Its acceptance criteria', 'The ticket: CEB-79 (sample)'], leaves: ['Commits on feature/CEB-79-audit-export (sample)', 'A draft pull request'], done: 'Every blocking probe passes, in at most three rounds.', stages: [
      { key: 'prepare', by: 'engine', what: 'Cuts the branch by the app\'s naming, and holds commits to its format.' },
      { key: 'do', by: 'agent', what: 'Writes the code and its tests, and commits.', skills: [skill('ticket-naming-convention', 'enterprise-dashboard (sample)'), skill('old-style-guide', '', { missing: true })] },
      { key: 'verify', by: 'engine', what: 'Runs each probe on what was built. A probe changes nothing: what one finds goes back to a builder.', probes: [
        { key: 'criteria', name: 'Acceptance criteria', kind: 'built-in', runs: 'each one checked, with evidence', blocks: true, on: true, own: false, fixed: 'Always checked.' },
        { key: 'req:telemetry', name: 'Telemetry', kind: 'judged', runs: 'Anything new that can fail can be seen in a trace.', blocks: true, on: true, own: false, editable: true, changed: true },
        { key: 'req:adr', name: 'Decision record', kind: 'judged', runs: 'Each real design choice is written down where the repo keeps its decisions.', blocks: true, on: true, own: false, editable: true, from: 'Main' },
        { key: 'break', name: 'Try to break it', kind: 'built-in', runs: 'used the way a person would, then the cases nobody wrote down', blocks: true, on: true, own: false },
        { key: 'comments', name: 'Comment discipline', kind: 'built-in', runs: 'no debug output, dead code or stray TODOs in the change', blocks: false, on: true, own: false },
        { key: 'security', name: 'Security review', kind: 'skill', runs: 'backend-core:security-review', blocks: true, on: true, own: true, editable: true },
        { key: 'tests', name: 'Tests', kind: 'command', runs: 'pnpm test', blocks: true, on: true, own: false, editable: true },
        { key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint', blocks: true, on: true, own: true, editable: true },
        { key: 'licences', name: 'Licence scan', kind: 'command', runs: 'pnpm licences', blocks: true, on: false, own: true, editable: true },
      ] },
      { key: 'report', by: 'agent', what: 'What changed, why, and how it was verified.' },
    ] },
    { key: 'smoke', icon: '👀', label: 'Smoke test', needs: ['The built branch', 'A set-up to try it in'], leaves: ['Your mark on each check'], done: 'You marked every check.', stages: [
      { key: 'prepare', by: 'engine', what: 'Brings up the set-up each check needs.' },
      { key: 'do', by: 'person', what: 'You try what only a person can judge.' },
    ] },
  ] },
]
const usable = [{ name: 'ticket-naming-convention', label: 'ticket-naming-convention', from: 'enterprise-dashboard (sample)' }, { name: 'design-system', label: 'design-system', from: 'enterprise-dashboard (sample)' }, { name: 'backend-core:security-review', label: 'security-review', from: 'backend-core (sample)' }]

const meta = { title: 'Components/StepContracts', component: StepContracts, args: { groups } } satisfies Meta<typeof StepContracts>
export default meta
type Story = StoryObj<typeof meta>

/** As the page opens: every step one line, with what is attached to it and where. */
export const AtAGlance: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Do · ticket-naming-convention')).toBeVisible()
    await expect(c.getByText('8 probes')).toBeVisible() // the ones that run; one of the nine is off
    await expect(c.getAllByText('nothing attached').length).toBe(2) // Research and the smoke test
  },
}

/** The build opened: its contract, its four stages with who runs each, the skills on Do and what it is held to on Verify. */
export const BuildOpen: Story = {
  args: { open: ['build'] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const verify = within(c.getByRole('listitem', { name: 'Build, Verify' }))
    await expect(verify.getByText('pnpm test')).toBeVisible()
    await expect(verify.getByText('backend-core:security-review')).toBeVisible()
    await expect(verify.getAllByText('blocks').length).toBe(7)
    await expect(verify.getByText('reports')).toBeVisible(); await expect(verify.getByText('off')).toBeVisible()
    await expect(within(c.getByRole('listitem', { name: 'Build, Do' })).getByText(/old-style-guide · missing/)).toBeVisible()
    await expect(c.queryByRole('button', { name: /Add a|Remove/ })).toBeNull() // a reading view until someone means to change it
    await expect(c.queryByRole('checkbox')).toBeNull()
  },
}

/** Being changed: skills are added and removed where an agent works; probes are switched, set to report only, removed and added where the engine verifies. */
export const Changing: Story = {
  args: { open: ['build'], usable, onSkills: fn(), onProbe: fn(), onWorkflow: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(c.getByLabelText('Add a skill to Build, Do'), 'backend-core:security-review')
    await expect(args.onSkills).toHaveBeenCalledWith('build', ['ticket-naming-convention', 'old-style-guide', 'backend-core:security-review'])
    await userEvent.click(c.getByRole('button', { name: 'Remove old-style-guide from Build, Do' }))
    await expect(args.onSkills).toHaveBeenLastCalledWith('build', ['ticket-naming-convention'])
    await expect(c.queryByRole('button', { name: /Remove prototype from/ })).toBeNull() // every prototype has it
    await expect(c.queryByLabelText('Add a skill to Build, Prepare')).toBeNull() // the engine's stage takes no skill
    await userEvent.click(c.getByRole('checkbox', { name: 'Run Licence scan' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'on', key: 'licences', on: true })
    await userEvent.selectOptions(c.getByLabelText('When Lint fails'), 'reports')
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'blocks', key: 'lint', blocks: false })
    await userEvent.selectOptions(c.getByLabelText('When Telemetry fails'), 'reports') // a judged one too
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'blocks', key: 'req:telemetry', blocks: false })
    await expect(c.queryByLabelText('When Acceptance criteria fails')).toBeNull() // always blocks
    await userEvent.click(c.getByRole('button', { name: 'Remove the probe Lint' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'remove', key: 'lint' })
    // Only the acceptance criteria are fixed. A row the workflow switches is switched for the workflow, or left to the app again.
    await expect(c.getByRole('checkbox', { name: 'Run Acceptance criteria' })).toBeDisabled()
    await expect(c.getByText('· from Main')).toBeVisible()
    await userEvent.click(c.getByRole('checkbox', { name: 'Run Decision record' }))
    await expect(args.onWorkflow).toHaveBeenLastCalledWith('req:adr', false)
    await userEvent.click(c.getByRole('button', { name: 'Leave Decision record to the app, not the Main workflow' }))
    await expect(args.onWorkflow).toHaveBeenLastCalledWith('req:adr', null)
    // One the engine ships that the app has reworded can be put back.
    await userEvent.click(c.getByRole('button', { name: 'Put Telemetry back as the engine ships it' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'reset', key: 'req:telemetry' })
    await expect(c.queryByRole('button', { name: 'Put Lint back as the engine ships it' })).toBeNull(); await expect(c.queryByRole('button', { name: 'Remove the probe Telemetry' })).toBeNull()
    // A client's own requirement is added as a probe.
    await userEvent.click(c.getByRole('button', { name: 'Add a probe to Build' }))
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('Probe name'), 'Types (sample)')
    await userEvent.type(c.getByLabelText('What it runs'), 'pnpm typecheck')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'add', name: 'Types (sample)', kind: 'command', runs: 'pnpm typecheck' })
    // One that only reports is chosen as it is added.
    await userEvent.click(c.getByRole('button', { name: 'Add a probe to Build' }))
    await userEvent.type(c.getByLabelText('Probe name'), 'Bundle size (sample)'); await userEvent.type(c.getByLabelText('What it runs'), 'pnpm size')
    await userEvent.selectOptions(c.getByLabelText('When it fails'), 'reports'); await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'add', name: 'Bundle size (sample)', kind: 'command', runs: 'pnpm size', blocks: false })
  },
}

/** Editing: a row becomes its fields, with what it has now. The engine's sentences and the test command can be reworded like the app's own; the engine's two probes cannot. */
export const EditingAProbe: Story = {
  args: { open: ['build'], usable, onSkills: fn(), onProbe: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.queryByRole('button', { name: 'Edit the probe Try to break it' })).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Edit the test command' })) // the test command: its command, not its name
    const tests = within(c.getByRole('form', { name: 'Edit Tests' }))
    await expect(tests.queryByLabelText('Probe name')).toBeNull()
    await userEvent.type(tests.getByLabelText('What it runs'), ' --run'); await userEvent.click(tests.getByRole('button', { name: 'Save' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'edit', key: 'tests', name: 'Tests', runs: 'pnpm test --run' })
    await userEvent.click(c.getByRole('button', { name: 'Edit the probe Lint' }))
    const form = within(c.getByRole('form', { name: 'Edit Lint' }))
    await expect(form.getByLabelText('What it runs')).toHaveValue('pnpm lint')
    await userEvent.clear(form.getByLabelText('What it runs')); await userEvent.type(form.getByLabelText('What it runs'), 'pnpm lint --max-warnings 0')
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'edit', key: 'lint', name: 'Lint', runs: 'pnpm lint --max-warnings 0' })
    await userEvent.click(c.getByRole('button', { name: 'Edit the probe Telemetry' })) // a judged one: its sentence
    await expect(within(c.getByRole('form', { name: 'Edit Telemetry' })).getByLabelText('What it runs')).toHaveValue('Anything new that can fail can be seen in a trace.')
  },
}

/** No test command yet: the row is there to give it one. Sample data. */
export const NoTestCommand: Story = {
  args: { open: ['build'], onProbe: fn(), groups: groups.map((g) => ({ ...g, steps: g.steps.map((st) => ({ ...st, stages: st.stages.map((t) => (t.probes ? { ...t, probes: t.probes.map((p) => (p.key === 'tests' ? { ...p, runs: '', on: false } : p)) } : t)) })) })) },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText('no test command yet')).toBeVisible(); await expect(c.getByRole('checkbox', { name: 'Run the test command' })).toBeDisabled()
    await userEvent.click(c.getByRole('button', { name: 'Set the test command' }))
    const form = within(c.getByRole('form', { name: 'Edit Tests' }))
    await userEvent.type(form.getByLabelText('What it runs'), 'pnpm test'); await userEvent.click(form.getByRole('button', { name: 'Save' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'edit', key: 'tests', name: 'Tests', runs: 'pnpm test' })
  },
}

const tried = {
  lint: { status: 'done' as const, runs: 'pnpm lint', tasks: 5, when: '2 hours ago', results: [
    { identifier: 'CEB-79', title: 'Audit export (sample)', pr: 412, pass: true, evidence: '', findings: [] }, { identifier: 'CEB-74', title: 'Scan summary (sample)', pr: 409, pass: true, evidence: '', findings: [] },
    { identifier: 'CEB-70', title: 'Work email check (sample)', pr: 401, pass: false, evidence: 'frontend/src/scan/Otp.svelte: 2 problems (sample)', findings: [] },
    { identifier: 'CEB-66', title: 'Finding fields (sample)', pr: 398, pass: true, evidence: '', findings: [] }, { identifier: 'CEB-61', title: 'Reports list (sample)', pr: 390, pass: true, evidence: '', findings: [] },
  ] },
  'req:telemetry': { status: 'done' as const, runs: 'An older wording (sample).', tasks: 5, when: 'yesterday', costUsd: '1.40', results: [
    { identifier: 'CEB-79', title: 'Audit export (sample)', pr: 412, pass: false, evidence: 'sample', findings: ['a failed export logs nothing (sample)'] },
  ] },
  security: { status: 'running' as const, runs: 'backend-core:security-review', tasks: 5, results: [{ identifier: 'CEB-79', title: 'Audit export (sample)', pr: 412, pass: true, evidence: '', findings: [] }] },
}
/** A change tried on past work: under each probe, what it said of the app's last merged tasks. Offered, never required. Sample data. */
export const TriedOnPastWork: Story = {
  args: { open: ['build'], onProbe: fn(), onTry: fn(), tryOn: 5, trials: tried },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Tried on 5 merged tasks: 4 pass, 1 fail')).toBeVisible()
    await expect(c.getByText(/before it was changed/)).toBeVisible() // Telemetry was reworded since its trial
    await expect(c.getByText('Trying it on 5 merged tasks: 1 done…')).toBeVisible()
    await userEvent.click(c.getByText('Tried on 5 merged tasks: 4 pass, 1 fail'))
    await expect(c.getByText('frontend/src/scan/Otp.svelte: 2 problems (sample)')).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Try Lint on past work' }))
    await expect(args.onTry).toHaveBeenCalledWith(expect.objectContaining({ key: 'lint', runs: 'pnpm lint' }))
    await expect(c.getByRole('button', { name: 'Try Telemetry on past work' })).toHaveTextContent('Try (5 agent runs)') // what it costs is on the button
    await expect(c.getByRole('button', { name: 'Try Security review on past work' })).toBeDisabled() // one is running
    await expect(c.queryByRole('button', { name: 'Try Acceptance criteria on past work' })).toBeNull(); await expect(c.queryByRole('button', { name: 'Try Licence scan on past work' })).toBeNull() // off: not tried
  },
}
