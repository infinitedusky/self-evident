import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ProjectPage } from './ProjectPage'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'
import { draftGraph, graph, run, subIssues, todos } from '../stories/sample'
import type { Graph, GraphSubIssue } from '../engine'

// One project at /projects/:id, live from the sample engine. Each story stands on a project in a different state.
const meta = { title: 'Pages/ProjectPage', component: ProjectPage, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page" style={{ height: '100vh' }}><ProjectPage /></div> } satisfies Meta<typeof ProjectPage>
export default meta
type Story = StoryObj<typeof meta>
const at = (id: string, section?: string) => ({ route: { path: section ? '/projects/:id/:section' : '/projects/:id', url: `/projects/${id}${section ? `/${section}` : ''}` } })
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
export const Running: Story = {
  parameters: at('proj_checkout'),
  play: async ({ canvasElement }) => { // the tasks lead the overview: before the graph and the assets; the project's own steps are pages in its nav, and its agent is beside them
    const c = within(canvasElement)
    const tasks = await c.findByRole('heading', { name: /^Tasks/ }, { timeout: 5000 })
    await expect(tasks.compareDocumentPosition(await c.findByRole('heading', { name: /^Assets/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const nav = within(c.getByRole('navigation', { name: 'This project' }))
    await expect(nav.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', expect.stringMatching(/\/projects\/proj_checkout$/))
    await expect(nav.getByRole('link', { name: /Research/ })).toHaveAttribute('href', expect.stringContaining('/projects/proj_checkout/research'))
    await expect(nav.getByRole('link', { name: /Context/ })).toHaveAttribute('href', expect.stringContaining('/projects/proj_checkout/context'))
    await expect(c.queryByText('Steps for the project as a whole')).not.toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Start this project\'s agent' })).toBeInTheDocument() // no agent yet
  },
}
/** A long description written in markdown (made up): shown formatted, its first lines only, with the rest a press away. */
export const LongDescription: Story = {
  parameters: at('proj_long'),
  beforeEach: withGraph({ ...graph, project: { ...graph.project, id: 'proj_long', content: '## Why\nToday checkout takes three pages (sample). **Most people leave on the second.**\n\n## What it must do\n- One page for address and payment.\n- A saved card pays in one tap.\n- A declined card is shown in place.\n\n## After this project\nGift cards resume once the one-page form exists.' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Most people leave on the second.', {}, { timeout: 5000 })).toBeInTheDocument()
    await expect(c.queryByText(/## Why/)).toBeNull()
    await userEvent.click(await c.findByRole('button', { name: 'Show all' }))
    await expect(await c.findByRole('button', { name: 'Show less' })).toBeInTheDocument()
  },
}
/** The same, with a sub-task clicked on the graph: its brief, files, dependencies, steps and last run. */
export const SubTaskSelected: Story = {
  parameters: at('proj_checkout'),
  play: async ({ canvasElement }) => { await userEvent.click(await within(canvasElement).findByText('A declined card is shown in place', {}, { timeout: 5000 })) },
}
/** A draft nobody has planned yet: Plan on the task, an empty graph. */
export const DraftUnplanned: Story = { parameters: at('proj_draft'), beforeEach: withGraph(drafting) }
/** A task planned on its own (made up): the page is its plan and build, back goes to Tasks, no tasks are added here, and the button is "Run it". */
export const TaskOnItsOwn: Story = {
  parameters: at('proj_solo'),
  beforeEach: withGraph({ ...draftPlanned, project: { ...draftPlanned.project, id: 'proj_solo', name: 'Marketing site (sample)', solo: true }, issues: draftPlanned.issues.slice(0, 1), subIssues: draftPlanned.subIssues.filter((x) => x.parentId === draftPlanned.issues[0].id), backlog: [], questions: [], decisions: [] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Build it' })).toBeInTheDocument()
    await expect(c.getByRole('link', { name: '← Tasks' })).toBeInTheDocument()
    await expect(c.queryByText(/Add task/)).not.toBeInTheDocument()
  },
}
/** A draft whose tasks are planned: reorder arrows and Plan again. No button runs a project: each task is built from its own page or from Build. */
export const DraftPlanned: Story = { parameters: at('proj_draftplanned'), beforeEach: withGraph(draftPlanned) }
/** Paused: Resume, and the sub-task that was building waits. */
export const Paused: Story = { parameters: at('proj_paused'), beforeEach: withGraph(paused) }
/** Every sub-task has landed but the backlog still has open items: the project waits on them. */
export const WorkLandedBacklogOpen: Story = { parameters: at('proj_worklanded'), beforeEach: withGraph(workLanded) }
/** Landed: all done, the PR merged, the question answered; the backlog is closed (covered and dropped). */
export const Landed: Story = { parameters: at('proj_landed'), beforeEach: withGraph(landed) }
/** Closed: it landed and its last task was closed by a person. Over, with nothing to press. */
export const Closed: Story = {
  parameters: at('proj_closed'), beforeEach: withGraph({ ...landed, project: { ...landed.project, id: 'proj_closed', status: 'closed' } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('closed')).toBeVisible() },
}
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
/** A project's Context, above its tasks: what each of them sees as "from the project". A task on its own has none here: it has its own. */
export const ItsContext: Story = {
  parameters: at('proj_checkout', 'context'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Checkout design principles (sample)')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Add a decision' })).toBeInTheDocument()
  },
}

const projectTalk = { ...sampleData.talks[0], subject: 'Checkout (sample)', subjectRef: { projectId: 'proj_checkout', app: true } }
const researching = { ...sampleData.steps, projects: { ...sampleData.steps.projects, states: [{ key: 'research' as const, status: 'started' as const, detail: 'Reading the six tickets and the code (sample)' }] } }
/** The project's own agent, in the column on the right, as a task's is: it stays while the pages beside it change. A step handed over before is under way, and the overview says so with a link to its page. */
export const WithItsAgent: Story = {
  parameters: at('proj_checkout'),
  beforeEach: withEngine({ projectTalk, steps: researching }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('This project\'s agent')).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Start this project\'s agent' })).not.toBeInTheDocument()
    const under = await c.findByText(/Under way for the project as a whole/)
    await expect(within(under).getByRole('link', { name: 'Research' })).toHaveAttribute('href', expect.stringContaining('/projects/proj_checkout/research'))
  },
}
/** A step of the project as a whole, on a page of its own: what its agent wrote, as on a task. */
export const AStepsPage: Story = {
  parameters: at('proj_checkout', 'research'),
  beforeEach: withEngine({ projectTalk, steps: { ...sampleData.steps, projects: { ...sampleData.steps.projects, states: [{ key: 'research' as const, status: 'done' as const, detail: '3 comps, one case against' }] } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Who does it best/)).toBeInTheDocument()
    await expect(c.queryByRole('heading', { name: /^Tasks/ })).not.toBeInTheDocument()
  },
}
/** A step not started: one press hands it to the project's agent, which opens beside the page. */
export const StartAStep: Story = {
  parameters: at('proj_checkout', 'research'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Start with the agent' }))
    await userEvent.click(c.getByRole('button', { name: 'Start' })) // nothing to add
    await expect(await c.findByText('Handed to this project\'s agent, on the right.')).toBeInTheDocument()
  },
}
/** What the project is made up of, by ticket: the ones in its Context with no task yet come first (what is still to plan), then the ones being worked, each with its tasks. One is over a task here and not in the Context. */
export const ItsTickets: Story = {
  parameters: at('proj_checkout', 'tickets'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/2 have no task yet/)).toBeInTheDocument()
    const nav = within(c.getByRole('navigation', { name: 'This project' }))
    await expect(nav.getByText('2 with no task yet')).toBeInTheDocument()
    const first = (await c.findAllByRole('region'))[0]
    await expect(first).toHaveAccessibleName('SHOP-331')
    await expect(within(first).getByText(/No task is under it/)).toBeInTheDocument()
    const worked = c.getByRole('region', { name: 'SHOP-323' })
    await expect(within(worked).getByText('1 of 3 tasks done')).toBeInTheDocument()
    const other = c.getByRole('region', { name: 'SHOP-340' })
    await expect(within(other).getByText(/Not in this project's Context/)).toBeInTheDocument()
    await expect(within(other).getByText(/one of its other tickets/)).toBeInTheDocument()
  },
}
/** A project with no tickets in its Context or on its tasks. */
export const NoTickets: Story = { parameters: at('proj_checkout', 'tickets'), beforeEach: withEngine({ projectTickets: [] }), play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/No tickets yet/)).toBeInTheDocument() } }
