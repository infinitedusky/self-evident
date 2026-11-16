import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PlanGraphView, stepProgress } from './PlanGraphView'
import type { GraphSubIssue } from '../engine'

// Sample sub-tasks, made up: the hardening project's shape, in the states worth seeing.
const ph = (number: number, title: string, status: GraphSubIssue['status'], extra: Partial<GraphSubIssue> = {}): GraphSubIssue => ({
  id: `ph_sample${number}`, appId: 'app_sample', identifier: `HG-${number}`, number, kind: 'code', title, description: null, brief: null, status, state: status === 'done' ? 'done' : status === 'queued' ? 'todo' : 'in_progress',
  attempt: status === 'queued' ? 0 : 1, maxAttempts: 3, projectId: 'plan_sample', parentId: number <= 4 ? 'task_a' : 'task_b', cycleId: null, ideaId: null,
  priority: 0, estimate: null, sortOrder: number, assignee: null, delegate: 'builder', waitingOn: null, source: 'planner', reason: null, createdBy: 'planner', createdAt: '', startedAt: null, completedAt: null, canceledAt: null,
  branch: status === 'queued' ? null : `sub/plan_sample/hg-${number}`, heldReason: null, dependsOn: [], files: [], lastRun: null, ...extra,
})
const run = (status: string, cost: string) => ({ id: 'run_sample', attempt: 1, status, model: 'claude-opus-5-5', costUsd: cost, summary: null, error: null, startedAt: '', endedAt: null })
const steps = [{ id: 1, position: 0, text: 'Read config.py', status: 'completed' as const }, { id: 2, position: 1, text: 'Add the checks', status: 'in_progress' as const }, { id: 3, position: 2, text: 'Write the test', status: 'pending' as const }]

const midRun: GraphSubIssue[] = [
  ph(1, 'Validate numeric settings at startup', 'done', { lastRun: run('completed', '0.25') }),
  ph(2, 'Cache pip in the CI workflow', 'running', { lastRun: run('working', '0.05'), steps }),
  ph(3, 'Index the tables the parent page reads', 'merging', { lastRun: run('completed', '0.22') }),
  ph(4, 'Storybook stories for the parent page', 'queued', { heldReason: 'at the session cap' }),
  ph(5, 'README: settings are validated', 'queued', { heldReason: 'waiting on HG-2 (HG-1, earlier in the project)' }),
]
const labels = { ph_sample1: 'Harden the POC', ph_sample2: 'Harden the POC', ph_sample3: 'Harden the POC', ph_sample4: 'Harden the POC', ph_sample5: 'Document it' }

const meta = { title: 'Components/PlanGraphView', component: PlanGraphView, parameters: { layout: 'padded' }, args: { labels } } satisfies Meta<typeof PlanGraphView>
export default meta
type Story = StoryObj<typeof meta>

export const MidRun: Story = { args: { subIssues: midRun } }
// Made up: a sub-task's brief as the planner writes it, with its numbered steps.
const briefWith = (n: number) => `Summary (sample).\n\n### Steps\n\n${Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1} of the plan (sample)\n   - a technical note`).join('\n')}\n\n### Checks\n\n- It works`
/** Every node shows its steps: the planned count before it starts, a bar and the step it is on while it builds, all done once it lands. */
export const StepProgress: Story = {
  args: { subIssues: [
    ph(1, 'Validate numeric settings at startup', 'done', { lastRun: run('completed', '0.25'), brief: briefWith(4) }),
    ph(2, 'Cache pip in the CI workflow', 'running', { lastRun: run('working', '0.05'), steps }),
    ph(3, 'Storybook stories for the parent page', 'queued', { heldReason: 'at the session cap', brief: briefWith(6) }),
  ] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('4/4')).toBeInTheDocument() // landed: all of its planned steps
    await expect(await c.findByText('6 planned')).toBeInTheDocument() // not started: how many there will be, and not a count of progress
    await expect(await c.findByText('Step 2 of 3: Add the checks')).toBeInTheDocument() // building: where it is
    await expect(stepProgress({ status: 'queued', brief: briefWith(3) })).toMatchObject({ total: 3, done: 0, planned: true, current: null })
    await expect(stepProgress({ status: 'running', steps: [{ text: 'a', status: 'completed' }, { text: 'b', status: 'in_progress' }, { text: 'c', status: 'pending' }] })).toMatchObject({ total: 3, done: 1, marks: ['done', 'now', 'todo'], current: { n: 2, text: 'b' }, planned: false })
    await expect(stepProgress({ status: 'queued' })).toMatchObject({ total: 0 })
    // No steps reported by its agent: said in words what it is doing, and never an empty bar that reads as stuck on step one.
    await expect(stepProgress({ status: 'running', brief: briefWith(3) })).toMatchObject({ total: 3, done: 0, planned: true, doing: 'Building. Its agent has not said which step it is on.' })
    await expect(stepProgress({ status: 'merging', brief: briefWith(3) })).toMatchObject({ total: 3, done: 3, planned: false, marks: ['done', 'done', 'done'], doing: 'Built. Merging it in now.' })
    await expect(stepProgress({ status: 'running', steps: [{ text: 'a', status: 'in_progress' }] }).doing).toBeNull()
  },
}
export const AllLanded: Story = { args: { subIssues: midRun.map((x) => ({ ...x, status: 'done' as const, heldReason: null, lastRun: run('completed', '0.20'), steps: undefined })) } }
export const WithAFailure: Story = { args: { subIssues: [
  midRun[0], ph(2, 'Cache pip in the CI workflow', 'failed', { attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)', lastRun: run('completed', '0.31') }),
  ph(3, 'Index the tables the parent page reads', 'done', { lastRun: run('completed', '0.22') }),
  ph(5, 'README: settings are validated', 'queued', { heldReason: 'blocked: HG-2 failed' }),
] } }
export const NotStarted: Story = { args: { subIssues: midRun.map((x) => ({ ...x, status: 'queued' as const, attempt: 0, branch: null, heldReason: null, lastRun: null, steps: undefined })) } }
/** An unanswered question stands over the sub-tasks of the task that asked it: its own node, with a "?" (made up). */
export const WithAQuestion: Story = {
  args: { subIssues: midRun, questions: [{ id: 'q_sample1', text: 'The saved address can be shown before or after the card form. Which? (sample)', cost: 'expensive', subIssues: [midRun[1].id, midRun[2].id] }] },
  play: async ({ canvasElement }) => {
    const node = await within(canvasElement).findByTitle(/The saved address can be shown before or after the card form/)
    await expect(node).toHaveAttribute('href', '/build') // it is answered on Build
  },
}
export const TakingTurns: Story = { args: {
  subIssues: midRun.slice(0, 3).map((x) => ({ ...x, status: x.number === 1 ? 'running' as const : 'queued' as const, lastRun: x.number === 1 ? run('working', '0.05') : null, steps: undefined,
    files: x.number === 2 ? ['.github/workflows/ci.yml'] : ['poc/hg/db.py'], heldReason: x.number === 3 ? 'waiting on HG-1 (poc/hg/db.py)' : null })),
  files: [{ path: 'poc/hg/db.py', subIssues: ['ph_sample1', 'ph_sample3'], heldBy: 'ph_sample1' }],
} }
// Three sub-tasks want api.py and nobody has it yet: the file hangs between them, undecided.
export const SharedFileUndecided: Story = { args: {
  subIssues: [
    ph(1, 'Tables and functions for the schedule', 'done', { files: ['poc/hg/schedule.py', 'poc/hg/db.py'], lastRun: run('completed', '0.30') }),
    ph(2, '/api/schedule routes', 'queued', { dependsOn: ['ph_sample1'], files: ['poc/hg/api.py', 'poc/tests/test_api.py'] }),
    ph(3, 'The tutor points at the text', 'queued', { files: ['poc/hg/tutor.py', 'poc/hg/api.py'] }),
    ph(4, 'The shutdown is the unlock', 'queued', { dependsOn: ['ph_sample1'], files: ['poc/hg/night.py', 'poc/hg/api.py'] }),
  ],
  files: [{ path: 'poc/hg/api.py', subIssues: ['ph_sample2', 'ph_sample3', 'ph_sample4'], heldBy: null }],
  labels: { ph_sample1: 'Data and API', ph_sample2: 'Data and API', ph_sample3: 'Data and API', ph_sample4: 'Data and API' },
} }
// The same, once #2 has the file: it points at api.py, api.py points at the two waiting.
export const SharedFileHeld: Story = { args: {
  subIssues: [
    ph(1, 'Tables and functions for the schedule', 'done', { files: ['poc/hg/schedule.py', 'poc/hg/db.py'], lastRun: run('completed', '0.30') }),
    ph(2, '/api/schedule routes', 'running', { dependsOn: ['ph_sample1'], files: ['poc/hg/api.py', 'poc/tests/test_api.py'], lastRun: run('working', '0.08'), steps }),
    ph(3, 'The tutor points at the text', 'queued', { files: ['poc/hg/tutor.py', 'poc/hg/api.py'], heldReason: 'waiting on HG-2 (poc/hg/api.py)' }),
    ph(4, 'The shutdown is the unlock', 'queued', { dependsOn: ['ph_sample1'], files: ['poc/hg/night.py', 'poc/hg/api.py'], heldReason: 'waiting on HG-2 (poc/hg/api.py)' }),
  ],
  files: [{ path: 'poc/hg/api.py', subIssues: ['ph_sample2', 'ph_sample3', 'ph_sample4'], heldBy: 'ph_sample2' }],
  labels: { ph_sample1: 'Data and API', ph_sample2: 'Data and API', ph_sample3: 'Data and API', ph_sample4: 'Data and API' },
} }
export const SinglePhase: Story = { args: { subIssues: [ph(1, 'Add a GET /health endpoint to the POC', 'done', { lastRun: run('completed', '0.40') })], labels: { ph_sample1: 'A health endpoint' } } }
