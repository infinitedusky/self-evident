import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlanGraphView } from './PlanGraphView'
import type { GraphSubIssue } from '../engine'

// Sample sub-issues, made up: the hardening project's shape, in the states worth seeing.
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
export const AllLanded: Story = { args: { subIssues: midRun.map((x) => ({ ...x, status: 'done' as const, heldReason: null, lastRun: run('completed', '0.20'), steps: undefined })) } }
export const WithAFailure: Story = { args: { subIssues: [
  midRun[0], ph(2, 'Cache pip in the CI workflow', 'failed', { attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)', lastRun: run('completed', '0.31') }),
  ph(3, 'Index the tables the parent page reads', 'done', { lastRun: run('completed', '0.22') }),
  ph(5, 'README: settings are validated', 'queued', { heldReason: 'blocked: HG-2 failed' }),
] } }
export const NotStarted: Story = { args: { subIssues: midRun.map((x) => ({ ...x, status: 'queued' as const, attempt: 0, branch: null, heldReason: null, lastRun: null, steps: undefined })) } }
export const TakingTurns: Story = { args: {
  subIssues: midRun.slice(0, 3).map((x) => ({ ...x, status: x.number === 1 ? 'running' as const : 'queued' as const, lastRun: x.number === 1 ? run('working', '0.05') : null, steps: undefined,
    files: x.number === 2 ? ['.github/workflows/ci.yml'] : ['poc/hg/db.py'], heldReason: x.number === 3 ? 'waiting on HG-1 (poc/hg/db.py)' : null })),
  files: [{ path: 'poc/hg/db.py', subIssues: ['ph_sample1', 'ph_sample3'], heldBy: 'ph_sample1' }],
} }
// Three sub-issues want api.py and nobody has it yet: the file hangs between them, undecided.
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
