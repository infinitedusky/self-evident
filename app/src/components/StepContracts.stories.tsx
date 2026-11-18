import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { StepContracts, type StepGroup } from './StepContracts'

// Sample data throughout: a made-up app with two repositories (enterprise-dashboard, backend-core), made-up skills and probes.
const groups: StepGroup[] = [
  { title: 'Before the build', steps: [
    { key: 'research', icon: '🔎', label: 'Research', needs: ['The idea or task'], leaves: ['A research note'], done: 'The note says who does this best and the case against.', stages: [
      { key: 'do', by: 'agent', what: 'Reads the code and the web.' },
      { key: 'report', by: 'agent', what: 'A summary for you, the full note for the next agent.' },
    ] },
    { key: 'mockup', icon: '🎨', label: 'Mockups', needs: ['The brief so far'], leaves: ['Stories with made-up data'], done: 'You picked one.', stages: [
      { key: 'do', by: 'agent', what: 'Writes the stories.', skills: [{ name: 'design-system', from: 'enterprise-dashboard (sample)' }] },
      { key: 'report', by: 'agent', what: 'Which stories to open.' },
    ] },
    { key: 'prototype', icon: '🛠️', label: 'Prototype', needs: ['The brief', 'The agreed mockup'], leaves: ['A branch that runs', 'A guide to try it'], done: 'You approved it.', stages: [
      { key: 'prepare', by: 'engine', what: 'A worktree and a port of its own.' },
      { key: 'do', by: 'agent', what: 'Builds it the way we would ship it.', skills: [{ name: 'prototype', from: 'Self Evident' }] },
      { key: 'report', by: 'agent', what: 'One line per requirement, what is not met first.' },
    ] },
  ] },
  { title: 'The build', steps: [
    { key: 'build', icon: '🧱', label: 'Build', needs: ['The approved brief', 'Its acceptance criteria', 'The ticket: CEB-79 (sample)'], leaves: ['Commits on feature/CEB-79-audit-export (sample)', 'A draft pull request'], done: 'Every blocking probe passes, in at most three rounds.', stages: [
      { key: 'prepare', by: 'engine', what: 'Cuts the branch by the app\'s naming, and holds commits to its format.' },
      { key: 'do', by: 'agent', what: 'Writes the code and its tests, and commits.', skills: [{ name: 'ticket-naming-convention', from: 'enterprise-dashboard (sample)' }, { name: 'old-style-guide', from: 'enterprise-dashboard (sample)', missing: true }] },
      { key: 'verify', by: 'engine', what: 'Runs each probe on what was built. Probes change nothing: what one finds goes back to a builder.', probes: [
        { key: 'tests', name: 'Tests', kind: 'command', runs: 'pnpm test', blocks: true },
        { key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint', blocks: true },
        { key: 'criteria', name: 'Acceptance criteria', kind: 'built-in', runs: 'each one checked, with evidence', blocks: true },
        { key: 'telemetry', name: 'Telemetry', kind: 'judged', runs: 'Anything new that can fail can be seen in a trace.', blocks: true },
        { key: 'break', name: 'Try to break it', kind: 'built-in', runs: 'used the way a person would, then the cases nobody wrote down', blocks: true },
        { key: 'comments', name: 'Comment discipline', kind: 'built-in', runs: 'no debug output, dead code or stray TODOs in the change', blocks: false },
        { key: 'security', name: 'Security review', kind: 'skill', runs: 'backend-core:security-review', blocks: true },
      ] },
      { key: 'report', by: 'agent', what: 'What changed, why, and how it was verified.' },
    ] },
    { key: 'smoke', icon: '👀', label: 'Smoke test', needs: ['The built branch', 'A set-up to try it in'], leaves: ['Your mark on each check'], done: 'You marked every check.', stages: [
      { key: 'prepare', by: 'engine', what: 'Brings up the set-up each check needs.' },
      { key: 'do', by: 'person', what: 'You try what only a person can judge.' },
    ] },
  ] },
]

const meta = { title: 'Components/StepContracts', component: StepContracts, args: { groups } } satisfies Meta<typeof StepContracts>
export default meta
type Story = StoryObj<typeof meta>

/** As the page opens: every step one line, with what is attached to it and where. */
export const AtAGlance: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('Do · ticket-naming-convention')).toBeVisible()
    await expect(c.getByText('7 probes')).toBeVisible()
    await expect(c.getAllByText('nothing attached').length).toBe(2) // Research and the smoke test
  },
}

/** The build opened: its contract, its four stages with who runs each, the skills on Do and the probes on Verify. */
export const BuildOpen: Story = {
  args: { open: ['build'] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const verify = within(c.getByRole('listitem', { name: 'Build, Verify' }))
    await expect(verify.getByText('pnpm test')).toBeVisible()
    await expect(verify.getByText('backend-core:security-review')).toBeVisible()
    await expect(verify.getAllByText('blocks').length).toBe(6)
    await expect(verify.getByText('reports')).toBeVisible()
    await expect(within(c.getByRole('listitem', { name: 'Build, Do' })).getByText(/old-style-guide · missing/)).toBeVisible()
    await expect(c.queryByRole('button', { name: /Add a/ })).toBeNull() // a reading view until someone means to change it
  },
}

/** Being changed: skills are added and removed where an agent works, probes where the engine verifies, and nowhere else. */
export const Editing: Story = {
  args: { open: ['build'], onAddSkill: fn(), onRemoveSkill: fn(), onAddProbe: fn(), onRemoveProbe: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Add a skill to Build, Do' }))
    await expect(args.onAddSkill).toHaveBeenCalledWith('build', 'do')
    await userEvent.click(c.getByRole('button', { name: 'Remove the probe Lint' }))
    await expect(args.onRemoveProbe).toHaveBeenCalledWith('build', 'lint')
    await expect(c.queryByRole('button', { name: 'Add a skill to Build, Prepare' })).toBeNull() // the engine's stage takes no skill
    await userEvent.click(c.getByRole('button', { name: 'Add a probe to Build' }))
    await expect(args.onAddProbe).toHaveBeenCalledWith('build')
  },
}
