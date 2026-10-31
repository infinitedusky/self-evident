import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'
import { ProjectPage } from './ProjectPage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { draftGraph, graph, run, subIssues, todos } from '../stories/sample'
import type { Graph, GraphSubIssue } from '../engine'

// One project at /projects/:id, live from the sample engine. Each story stands on a project in a different state.
const meta = { title: 'Pages/ProjectPage', component: ProjectPage, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><ProjectPage /></div> } satisfies Meta<typeof ProjectPage>
export default meta
type Story = StoryObj<typeof meta>
const at = (id: string) => ({ route: { path: '/projects/:id', url: `/projects/${id}` } })
const withGraph = (g: Graph) => withEngine({ graphs: { ...sampleData.graphs, [g.project.id]: g } })

// Made-up variants of the sample project, built from it.
const allDone = (s: GraphSubIssue[]): GraphSubIssue[] => s.map((x) => ({ ...x, status: 'done', state: 'done', heldReason: null, lastRun: run('completed'), steps: undefined }))
const drafting: Graph = { ...draftGraph, project: { ...draftGraph.project, status: 'drafting' } }
const draftPlanned: Graph = {
  ...graph, project: { ...graph.project, id: 'proj_draftplanned', status: 'drafting', integrationBranch: null }, pr: null, prs: [], todos: [],
  issues: graph.issues.map((i) => ({ ...i, state: 'todo' })),
  subIssues: subIssues.map((x) => ({ ...x, status: 'queued', state: 'todo', attempt: 0, branch: null, heldReason: null, lastRun: null, steps: undefined })),
}
const workLanded: Graph = { ...graph, project: { ...graph.project, id: 'proj_worklanded' }, subIssues: allDone(subIssues), questions: [], files: [], conflicts: [] }
const landed: Graph = {
  ...graph, project: { ...graph.project, id: 'proj_landed', name: 'Faster product pages (sample)', status: 'landed' },
  pr: { ...graph.pr!, status: 'merged' }, prs: [{ ...graph.pr!, status: 'merged' }], issues: graph.issues.map((i) => ({ ...i, state: 'done' })),
  subIssues: allDone(subIssues), questions: [{ ...graph.questions[0], status: 'answered', answer: 'Estimate from the postcode' }], todos: [{ ...todos[0], status: 'done', state: 'done' }],
  backlog: graph.backlog.filter((b) => b.state === 'duplicate').concat([{ ...graph.backlog[1], state: 'canceled', reason: 'not this year' }]), files: [], conflicts: [],
}
const stopped: Graph = {
  ...graph, project: { ...graph.project, id: 'proj_stopped', name: 'Wishlists (sample)', status: 'stopped' },
  subIssues: [subIssues[0],
    { ...subIssues[1], status: 'failed', attempt: 3, heldReason: 'landing failed at test: tests failed (exit 1)', steps: undefined, lastRun: run('completed', { error: 'pnpm test exited 1: CheckoutPage.test.tsx › declined card' }) },
    { ...subIssues[2], status: 'cancelled', heldReason: 'the project was cancelled' }, { ...subIssues[3], status: 'cancelled', heldReason: 'the project was cancelled' }],
  files: [], conflicts: [],
}
const paused: Graph = { ...graph, project: { ...graph.project, id: 'proj_paused', status: 'paused' }, subIssues: subIssues.map((x) => (x.status === 'running' ? { ...x, status: 'queued', heldReason: 'the project is paused' } : x)) }
const bare: Graph = { ...graph, project: { ...graph.project, id: 'proj_bare' }, backlog: [], todos: [], questions: [], decisions: [] }

/** Running, mid-run: one sub-task landed, one building, two waiting; an open question, a decision, a to-do and a backlog with a duplicate. */
export const Running: Story = { parameters: at('proj_checkout') }
/** The same, with a sub-task clicked on the graph: its brief, files, dependencies, steps and last run. */
export const SubTaskSelected: Story = {
  parameters: at('proj_checkout'),
  play: async ({ canvasElement }) => { await userEvent.click(await within(canvasElement).findByText('A declined card is shown in place', {}, { timeout: 5000 })) },
}
/** A draft nobody has planned yet: Plan on the task, an empty graph. */
export const DraftUnplanned: Story = { parameters: at('proj_draft'), beforeEach: withGraph(drafting) }
/** A draft whose tasks are planned: reorder arrows, Plan again, and Run this project. */
export const DraftPlanned: Story = { parameters: at('proj_draftplanned'), beforeEach: withGraph(draftPlanned) }
/** Paused: Resume, and the sub-task that was building waits. */
export const Paused: Story = { parameters: at('proj_paused'), beforeEach: withGraph(paused) }
/** Every sub-task has landed but the backlog still has open items: the project waits on them. */
export const WorkLandedBacklogOpen: Story = { parameters: at('proj_worklanded'), beforeEach: withGraph(workLanded) }
/** Landed: all done, the PR merged, the question answered; the backlog is closed (covered and dropped). */
export const Landed: Story = { parameters: at('proj_landed'), beforeEach: withGraph(landed) }
/** Stopped after a sub-task failed three times; the rest cancelled. */
export const StoppedWithAFailure: Story = { parameters: at('proj_stopped'), beforeEach: withGraph(stopped) }
/** Nothing in the backlog, no to-dos, no questions or decisions: the bare project. */
export const NoBacklogNoQuestions: Story = { parameters: at('proj_bare'), beforeEach: withGraph(bare) }
/** No such project. */
export const NotFound: Story = { parameters: at('proj_missing') }
/** Saved among another app's tabs: it names its app and opens there, rather than switching the app itself. */
export const InAnotherApp: Story = { parameters: at('proj_checkout'), beforeEach: withGraph({ ...graph, app: { ...graph.app, id: 'app_elsewhere', name: 'Sample Blog' } }) }
/** Waiting on the engine. */
export const Loading: Story = { parameters: at('proj_checkout'), beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { parameters: at('proj_checkout'), beforeEach: withEngine(engineDown) }
