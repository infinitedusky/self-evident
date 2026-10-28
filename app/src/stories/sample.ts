/**
 * Sample data for stories: one made-up app, Sample Shop, in the states worth seeing. Every value is invented and the
 * names say so; nothing here comes from a real app (the repository is public). Typed against the engine's own types,
 * so a change to the API that the stories no longer match fails the type check.
 */
import type {
  App, AppSettings, BacklogIssue, Cycle, Decision, Event, FactorySettings, Graph, GraphIssue, GraphSubIssue, IdeaRow, Initiative, Issue,
  IssueDetail, IssueRow, Now, ProjectSummary, Question, Run, Step, SummaryState, TalkMessage, TalkSession, Todo, Transcript, Workspace,
} from '../engine'

export const T0 = '2026-10-27T09:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

export const workspace: Workspace = { id: 'ws_sample', name: 'Sample workspace' }
export const sampleApp: App = {
  id: 'app_sample', workspaceId: workspace.id, name: 'Sample Shop', key: 'SS', defaultBranch: 'main',
  setup: { pr_mode: 'project', test_cmd: 'pnpm test', storybook_url: 'http://localhost:6007', storybook_cmd: 'pnpm storybook --no-open' },
  repos: [{ id: 'repo_sample', appId: 'app_sample', fullName: 'example/sample-shop', localPath: '/code/sample-shop', baseBranch: 'main' }],
}
export const otherApp: App = { id: 'app_sample2', workspaceId: workspace.id, name: 'Sample Blog', key: 'SB', defaultBranch: 'main', setup: {}, repos: [] }
export const apps = [otherApp, sampleApp] // the newest last: the app the UI picks when none is chosen

/** An issue with every field filled; pass what differs. */
export function issue(number: number, title: string, extra: Partial<Issue> = {}): Issue {
  return {
    id: `iss_sample${number}`, appId: sampleApp.id, identifier: `SS-${number}`, number, kind: 'code', parentId: null, projectId: 'proj_checkout', cycleId: null, ideaId: null,
    title, description: null, brief: null, state: 'todo', priority: 0, estimate: null, sortOrder: number, assignee: null, delegate: null, waitingOn: null,
    source: 'person', reason: null, createdBy: 'sandy', createdAt: at(number), startedAt: null, completedAt: null, canceledAt: null, ...extra,
  }
}

export const run = (status: string, extra: Partial<Run> = {}): Run => ({
  id: 'run_sample', attempt: 1, status, model: 'claude-opus-5-5', costUsd: '0.24', summary: null, error: null, startedAt: at(30), endedAt: status === 'working' ? null : at(42), ...extra,
})
export const steps: Step[] = [
  { id: 1, position: 0, text: 'Read the checkout form and its route', status: 'completed' },
  { id: 2, position: 1, text: 'Collapse the address and payment steps into one page', status: 'in_progress' },
  { id: 3, position: 2, text: 'Write a test for a failed card on the single page', status: 'pending' },
]
export const plannedBrief = `Moves the address and payment fields onto one page, keeping the server checks as they are.

### Steps

1. Merge the two step components into \`CheckoutPage\`.
   - \`web/checkout/CheckoutPage.tsx\`: render \`AddressFields\` and \`PaymentFields\` in one form.
2. Submit once and show errors next to their fields.
   - \`web/checkout/submit.ts\`: one POST to \`/api/orders\`; map \`field\` in the error body to the input.
3. Test a declined card.
   - \`web/checkout/CheckoutPage.test.tsx\`: the error shows under the card number and nothing else clears.

### Checks

- A declined card keeps the address filled in — \`pnpm test checkout\` → passes

**Done when:** checkout is one page and a declined card is shown in place.`

const sub = (number: number, title: string, status: GraphSubIssue['status'], parentId: string, extra: Partial<GraphSubIssue> = {}): GraphSubIssue => ({
  ...issue(number, title, { parentId, delegate: 'builder', source: 'planner', state: status === 'done' ? 'done' : status === 'queued' ? 'todo' : 'in_progress' }),
  status, attempt: status === 'queued' ? 0 : 1, maxAttempts: 3, branch: status === 'queued' ? null : `sub/proj_checkout/ss-${number}`, heldReason: null,
  dependsOn: [], files: [], lastRun: status === 'queued' ? null : run(status === 'running' ? 'working' : 'completed'), ...extra,
})

// The project at the heart of the samples: a one-page checkout, mid-run.
export const subIssues: GraphSubIssue[] = [
  sub(4, 'Checkout is one page', 'done', 'iss_sample1', { description: 'Address and payment sit on one page.', brief: plannedBrief, files: ['web/checkout/CheckoutPage.tsx'] }),
  sub(5, 'A declined card is shown in place', 'running', 'iss_sample1', { description: 'The error appears next to the card number.', brief: plannedBrief, dependsOn: ['iss_sample4'], steps, files: ['web/checkout/submit.ts'] }),
  sub(6, 'Order totals update as you type', 'queued', 'iss_sample2', { heldReason: 'waiting on SS-5 (web/checkout/submit.ts)', files: ['web/checkout/submit.ts'] }),
  sub(7, 'Checkout events reach analytics', 'queued', 'iss_sample2', { dependsOn: ['iss_sample5'] }),
]
const top = (number: number, title: string, subIds: string[], extra: Partial<Issue> = {}): GraphIssue => ({ ...issue(number, title, { delegate: 'planner', ...extra }), subIssueIds: subIds })
export const issues: GraphIssue[] = [
  top(1, 'Checkout on one page', ['iss_sample4', 'iss_sample5'], { state: 'in_progress', description: 'Fewer steps between the cart and a paid order.', brief: 'Put address and payment on one page.' }),
  top(2, 'Totals and analytics', ['iss_sample6', 'iss_sample7'], { state: 'todo', description: 'Live totals; checkout events measured.' }),
]
export const backlog: BacklogIssue[] = [
  { ...issue(8, 'Remember the last address used', { state: 'backlog', source: 'builder', description: 'Noticed while building SS-4.' }), duplicateOf: null },
  { ...issue(9, 'Apple Pay on the checkout page', { state: 'backlog', source: 'person' }), duplicateOf: null },
  { ...issue(10, 'Show totals in the cart too', { state: 'duplicate' }), duplicateOf: 'iss_sample6' },
]
export const decisions: Decision[] = [{
  id: 'dec_sample1', issueId: 'iss_sample1', question: 'Where the form state lives',
  options: [{ key: 'A', text: 'One form state in CheckoutPage', recommended: true }, { key: 'B', text: 'A store shared by both field groups', recommended: false }],
  chosen: 'A', provisional: true, rationale: 'One page, one submit: a store adds nothing yet.',
}]
export const questions: Question[] = [{
  id: 'q_sample1', issueId: 'iss_sample2', text: 'Should totals include tax before the address is complete?',
  options: [
    { label: 'Estimate from the postcode', description: 'Shows a total early; may change at the end.', changes: [], recommended: true },
    { label: 'Leave tax out until the address is complete', description: 'Never wrong, but the total jumps.', changes: ['promise'], recommended: false },
  ], reason: 'An early total is what people compare against the cart.', cost: 'moderate', status: 'open', answer: null,
}]
export const todos: Todo[] = [{
  ...issue(11, 'Get a test card from the payment provider', { kind: 'todo', state: 'in_progress', delegate: null }),
  notes: 'Needed before SS-5 can be checked end to end.', owner: 'person', status: 'open', project: { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' },
  checklist: [
    { ...issue(12, 'Ask for sandbox access', { kind: 'todo', parentId: 'iss_sample11', state: 'done' }), text: 'Ask for sandbox access', done: true, position: 0 },
    { ...issue(13, 'Add the test key to the app settings', { kind: 'todo', parentId: 'iss_sample11', waitingOn: 'the provider' }), text: 'Add the test key to the app settings', done: false, position: 1 },
  ],
}, {
  ...issue(14, 'Draft the release note', { kind: 'todo', delegate: 'agent', projectId: null }),
  notes: null, owner: 'agent', status: 'open', project: null, checklist: [],
}]

export const graph: Graph = {
  project: { id: 'proj_checkout', name: 'One-page checkout (sample)', description: 'Fewer steps from cart to paid order.', content: 'A made-up project for Storybook.', status: 'running', integrationBranch: 'project/one-page-checkout', createdAt: T0 },
  app: { id: sampleApp.id, name: sampleApp.name, key: sampleApp.key, defaultBranch: 'main' },
  pr: { id: 'pr_sample', issueId: null, number: 42, url: 'https://github.com/example/sample-shop/pull/42', status: 'open' },
  prs: [{ id: 'pr_sample', issueId: null, number: 42, url: 'https://github.com/example/sample-shop/pull/42', status: 'open' }],
  issues, subIssues, backlog, todos: [todos[0]], decisions, questions, conflicts: [['iss_sample5', 'iss_sample6']],
  files: [{ path: 'web/checkout/submit.ts', subIssues: ['iss_sample5', 'iss_sample6'], heldBy: 'iss_sample5' }],
}
export const draftGraph: Graph = {
  ...graph, project: { ...graph.project, id: 'proj_draft', name: 'Gift cards (sample)', status: 'drafting', integrationBranch: null }, pr: null, prs: [],
  issues: [top(15, 'Sell gift cards', [], { projectId: 'proj_draft', brief: 'A gift card is a product with a code.' })], subIssues: [], backlog: [], todos: [], decisions: [], questions: [], conflicts: [], files: [],
}

export const projects: ProjectSummary[] = [
  { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running', createdAt: T0, app: { id: sampleApp.id, name: sampleApp.name }, issueCount: 2, backlogOpen: 2, builds: { done: 1, running: 1, queued: 2 } },
  { id: 'proj_draft', name: 'Gift cards (sample)', status: 'drafting', createdAt: at(60), app: { id: sampleApp.id, name: sampleApp.name }, issueCount: 1, backlogOpen: 0, builds: {} },
  { id: 'proj_landed', name: 'Faster product pages (sample)', status: 'landed', createdAt: at(-5000), app: { id: sampleApp.id, name: sampleApp.name }, issueCount: 3, backlogOpen: 0, builds: { done: 5 } },
]
export const issueRows: IssueRow[] = [
  { ...pick(issues[0]), project: { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' }, builds: { done: 1, running: 1 }, planning: null },
  { ...pick(issues[1]), project: { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' }, builds: { queued: 2 }, planning: null },
  { ...pick(issue(16, 'Search results load too slowly', { projectId: null, description: 'Reported twice this week.' })), project: null, builds: {}, planning: null },
]
function pick(i: Issue) { return { id: i.id, identifier: i.identifier, number: i.number, title: i.title, description: i.description, state: i.state, sortOrder: i.sortOrder, priority: i.priority } }

const detailOf = (i: Issue, extra: Partial<IssueDetail> = {}): IssueDetail => ({
  ...i, project: { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' }, parent: null, build: null, questions: [], decisions: [], relations: [], subIssues: [], steps: [], stepsAttempt: null, ...extra,
})
export const issueDetails: Record<string, IssueDetail> = {
  iss_sample1: detailOf(issues[0], { decisions, subIssues: subIssues.slice(0, 2).map((s) => ({ ...s, build: { status: s.status, attempt: s.attempt, heldReason: s.heldReason } })) }),
  iss_sample5: detailOf(subIssues[1], { parent: { id: 'iss_sample1', identifier: 'SS-1', title: 'Checkout on one page' }, build: { status: 'running', attempt: 1, heldReason: null }, steps, stepsAttempt: 1 }),
  iss_sample6: detailOf(subIssues[2], { parent: { id: 'iss_sample2', identifier: 'SS-2', title: 'Totals and analytics' }, brief: plannedBrief, build: { status: 'queued', attempt: 0, heldReason: 'waiting on SS-5 (web/checkout/submit.ts)' } }),
  iss_sample16: detailOf(issue(16, 'Search results load too slowly', { projectId: null, description: 'Reported twice this week.' }), { project: null }),
}

export const ideaRows: IdeaRow[] = [
  { id: 'idea_sample1', appId: sampleApp.id, number: 1, title: 'Sample: one-page checkout', body: 'Made up for Storybook.', lane: 'building' },
  { id: 'idea_sample2', appId: sampleApp.id, number: 2, title: 'Sample: gift cards', body: null, lane: 'shaping' },
]
export const initiatives: Initiative[] = [{ id: 'init_sample', name: 'More orders from the same traffic (sample)', description: null, status: 'active', targetDate: '2026-12-31', projects: [{ id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' }] }]
export const cycles: Cycle[] = [{ id: 'cyc_sample', number: 3, name: null, description: null, startsAt: '2026-10-26', endsAt: '2026-11-08', current: true, issues: [{ id: 'iss_sample1', identifier: 'SS-1', title: 'Checkout on one page', state: 'in_progress', kind: 'code' }] }]

export const events: Event[] = [
  { seq: 1, ts: at(30), type: 'build.status', actor: 'engine', issueId: 'iss_sample4', projectId: 'proj_checkout', payload: { identifier: 'SS-4', from: 'merging', to: 'done' } },
  { seq: 2, ts: at(31), type: 'run.started', actor: 'engine', issueId: 'iss_sample5', projectId: 'proj_checkout', payload: { identifier: 'SS-5' } },
  { seq: 3, ts: at(33), type: 'question.asked', actor: 'planner', issueId: 'iss_sample2', projectId: 'proj_checkout', payload: { text: questions[0].text, cost: 'moderate' } },
]
const where = { projectId: 'proj_checkout', projectName: 'One-page checkout (sample)', appName: sampleApp.name }
export const now: Now = {
  hold: null,
  running: [{
    projectId: 'proj_checkout', projectName: where.projectName, appName: sampleApp.name, status: 'running', integrationBranch: 'project/one-page-checkout', backlogOpen: 2,
    builds: { total: 4, done: 1, failed: 0 }, live: [{ id: 'iss_sample5', identifier: 'SS-5', title: 'A declined card is shown in place', status: 'running', step: steps[1].text }],
    held: [{ id: 'iss_sample6', identifier: 'SS-6', title: 'Order totals update as you type', reason: 'waiting on SS-5 (web/checkout/submit.ts)' }],
    pr: { number: 42, url: 'https://github.com/example/sample-shop/pull/42', status: 'open' },
  }],
  needsYou: [
    { kind: 'question', questionId: 'q_sample1', issueIdentifier: 'SS-2', text: questions[0].text, cost: 'moderate', askedAt: at(33), ...where },
    { kind: 'backlog', open: 2, items: ['Remember the last address used', 'Apple Pay on the checkout page'], ...where },
    { kind: 'todo', todoId: 'iss_sample11', identifier: 'SS-11', title: 'Get a test card from the payment provider', owner: 'person', projectId: 'proj_checkout', projectName: where.projectName, appName: sampleApp.name, done: 1, total: 2, next: 'Add the test key to the app settings', waitingOn: ['the provider'] },
    { kind: 'review', appName: sampleApp.name, prNumber: 51, title: 'Sample: fix the footer links', author: 'a-teammate', url: 'https://github.com/example/sample-shop/pull/51' },
  ],
  recent: events, counts: { projects: 3, running: 1, needsYou: 4 },
}
export const quietNow: Now = { hold: null, running: [], needsYou: [], recent: [], counts: { projects: 0, running: 0, needsYou: 0 } }

export const summary: SummaryState = {
  writing: false, stale: false,
  focus: {
    id: 1, createdAt: at(-60), trigger: 'schedule', costUsd: '0.04',
    body: {
      headline: 'Checkout is the week: one page is in, declined cards are being built, and a tax question waits on you.',
      people: [{ who: 'The builder', doing: [{ text: 'Building SS-5, a declined card shown in place.', refs: ['r1'] }] }, { who: 'Sandy', doing: [{ text: 'Owes an answer on tax in early totals.', refs: ['r2'] }] }],
      goals: { near: [{ text: 'Land the one-page checkout.', refs: ['r3'] }], mid: [{ text: 'More orders from the same traffic.', refs: ['r4'] }], long: [{ text: 'A shop that tests its own ideas.', refs: [] }] },
      stated: true,
      links: {
        r1: { kind: 'issue', label: 'SS-5', projectId: 'proj_checkout' }, r2: { kind: 'question', label: 'Tax in early totals', projectId: 'proj_checkout' },
        r3: { kind: 'project', label: 'One-page checkout (sample)', projectId: 'proj_checkout' }, r4: { kind: 'initiative', label: 'More orders from the same traffic (sample)' },
      },
    },
  },
}

export const factorySettings: FactorySettings = {
  workspace,
  integrations: [
    { key: 'github', name: 'GitHub', role: 'Code', does: 'Pull requests, reviews and checks.', fields: [{ key: 'token', label: 'Token', placeholder: 'ghp_…' }] },
    { key: 'posthog', name: 'PostHog', role: 'Telemetry', does: 'Events, errors and experiments.', fields: [{ key: 'project_key', label: 'Project key' }, { key: 'host', label: 'Host', placeholder: 'https://us.posthog.com' }] },
  ],
  values: { posthog: { host: 'https://us.posthog.com' } },
  plugins: [{
    id: 'sample-plugin@sample', name: 'sample-plugin', version: '1.0.0', description: 'A made-up plugin with two skills.', source: 'sample', builtIn: false,
    on: true, roles: ['talk', 'planner'], mcpServers: [], note: null, tools: null,
    skills: [{ key: 'sample-plugin/write-tests', name: 'write-tests', description: 'Writes tests for a change.', category: 'testing', on: true }, { key: 'sample-plugin/audit', name: 'audit', description: 'Reads a diff for risks.', category: null, on: true }],
  }],
  catalogue: [{ name: 'Build', categories: [{ key: 'testing', name: 'Testing', for: 'Writing and running tests' }, { key: 'review', name: 'Review', for: 'Reading a change before it lands' }] }],
}
export const appSettings: AppSettings = {
  integrations: { github: { token: { value: null, from: null } }, posthog: { project_key: { value: 'phc_sample', from: 'app' }, host: { value: 'https://us.posthog.com', from: 'workspace' } } },
  plugins: [{ id: 'sample-plugin@sample', name: 'sample-plugin', factoryOn: true, own: null, on: true }],
  skills: [{ key: 'checkout-rules', name: 'checkout-rules', description: 'How this shop prices and taxes an order.' }],
}

export const talkSession: TalkSession = {
  id: 'talk_sample', appId: sampleApp.id, cwd: '/code/sample-shop', branch: 'talk/sample', worktreePath: null, subject: 'Why is SS-6 waiting?', subjectRef: { projectId: 'proj_checkout' },
  title: null, status: 'open', createdAt: at(40), lastActiveAt: at(41), live: true, busy: false, messages: 3, autoApprove: 'cheap',
}
const msg = (id: number, author: TalkMessage['author'], kind: TalkMessage['kind'], body: string, payload: TalkMessage['payload'] = null): TalkMessage => ({ id, sessionId: talkSession.id, author, kind, body, payload, sentAt: at(40 + id) })
export const transcript: Transcript = {
  session: talkSession, pending: [],
  messages: [
    msg(1, 'user', 'text', 'Why is SS-6 waiting?'),
    msg(2, 'agent', 'tool_call', 'project_graph', { tool: 'mcp__engine__project_graph', input: { projectId: 'proj_checkout' } }),
    msg(3, 'agent', 'text', 'SS-6 and SS-5 both change `web/checkout/submit.ts`, so they take turns. SS-5 is building now; SS-6 starts when it lands.'),
  ],
}
