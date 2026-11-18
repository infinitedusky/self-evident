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
        { key: 'req:telemetry', name: 'Telemetry', kind: 'judged', runs: 'Anything new that can fail can be seen in a trace.', blocks: true, on: true, own: true },
        { key: 'req:adr', name: 'Decision record', kind: 'judged', runs: 'Each real design choice is written down where the repo keeps its decisions.', blocks: true, on: true, own: true, fixed: 'Switched on by the Main workflow.' },
        { key: 'break', name: 'Try to break it', kind: 'built-in', runs: 'used the way a person would, then the cases nobody wrote down', blocks: true, on: true, own: false },
        { key: 'comments', name: 'Comment discipline', kind: 'built-in', runs: 'no debug output, dead code or stray TODOs in the change', blocks: false, on: true, own: false },
        { key: 'security', name: 'Security review', kind: 'skill', runs: 'backend-core:security-review', blocks: true, on: true, own: true },
        { key: 'tests', name: 'Tests', kind: 'command', runs: 'pnpm test', blocks: true, on: true, own: false, fixed: 'The app\'s test command (Landing).' },
        { key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint', blocks: true, on: true, own: true },
        { key: 'licences', name: 'Licence scan', kind: 'command', runs: 'pnpm licences', blocks: true, on: false, own: true },
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
  args: { open: ['build'], usable, onSkills: fn(), onProbe: fn() },
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
    await userEvent.click(c.getByRole('button', { name: 'Lint blocks: make it report only' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'blocks', key: 'lint', blocks: false })
    await userEvent.click(c.getByRole('button', { name: 'Remove the probe Lint' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'remove', key: 'lint' })
    await expect(c.getByRole('checkbox', { name: 'Run Acceptance criteria' })).toBeDisabled(); await expect(c.getByRole('checkbox', { name: 'Run Decision record' })).toBeDisabled()
    // A client's own requirement is added as a probe.
    await userEvent.click(c.getByRole('button', { name: 'Add a probe to Build' }))
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('Probe name'), 'Types (sample)')
    await userEvent.type(c.getByLabelText('What it runs'), 'pnpm typecheck')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(args.onProbe).toHaveBeenLastCalledWith({ op: 'add', name: 'Types (sample)', kind: 'command', runs: 'pnpm typecheck' })
  },
}
