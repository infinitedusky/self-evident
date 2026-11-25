/**
 * Sample data for stories: one made-up app, Sample Shop, in the states worth seeing. Every value is invented and the
 * names say so; nothing here comes from a real app (the repository is public). Typed against the engine's own types,
 * so a change to the API that the stories no longer match fails the type check.
 */
import type { StepState, Workflow } from '@self-evident/engine/steps'
import type { Plan } from '../pages/PlanHome'
import type {
  Asset,
  Folder,
  LinearTicket,
  App, AppSettings, BacklogIssue, Cycle, Decision, Event, FactorySettings, Graph, GraphIssue, GraphSubIssue, IdeaRow, Initiative, Issue,
  IssueDetail, IssueRow, Now, StepsView, StepWork, WorkflowRow, ProjectSummary, Prototype, Question, Run, Step, SummaryState, TalkMessage, TalkSession, ClaudeSession, Todo, Transcript, Workspace, GitHubRepos,
} from '../engine'

export const T0 = '2026-10-27T09:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

export const workspace: Workspace = { id: 'ws_sample', name: 'Sample workspace' }
export const sampleApp: App = {
  id: 'app_sample', workspaceId: workspace.id, name: 'Sample Shop', key: 'SS', defaultBranch: 'main',
  setup: { pr_mode: 'project', test_cmd: 'pnpm test', prototype_cmd: 'pnpm install && pnpm dev --port $PORT' },
  repos: [{ id: 'repo_sample', appId: 'app_sample', fullName: 'example/sample-shop', localPath: '/code/sample-shop', baseBranch: 'main' }],
}
export const otherApp: App = { id: 'app_sample2', workspaceId: workspace.id, name: 'Sample Blog', key: 'SB', defaultBranch: 'main', setup: {}, repos: [] }
export const apps = [otherApp, sampleApp] // the newest last: the app the UI picks when none is chosen

/** Made-up tickets of a made-up Linear team, SHOP: two of the sample person's, one already a task here, one unassigned. */
/** A ticket kept word for word (made up): what every agent on the work made from it reads. */
export const sampleOrigin: import('../engine').OriginView = {
  id: 'origin_sample1', source: 'linear', sourceName: 'Linear', ref: 'SHOP-41', url: 'https://linear.app/example/issue/SHOP-41', title: 'Saved cards at checkout (sample)',
  body: 'Returning customers should be able to pay with a card they used before.\n\n- Show the last four digits and the expiry\n- Let them remove a saved card\n\n![the checkout today](https://uploads.linear.app/example/checkout.png)',
  comments: [
    { author: 'Sam Sample', at: '2026-11-01T09:00:00Z', body: 'Keep the "use a new card" button where it is.' },
    { author: 'Made-up Teammate', at: '2026-11-02T10:00:00Z', body: 'Support says people also ask for this on mobile.' },
  ],
  links: [{ title: 'Checkout design (made up)', url: 'https://example.com/design' }],
  files: [{ url: 'https://uploads.linear.app/example/checkout.png', kept: true, note: null }], fetchedAt: '2026-11-20T12:00:00Z',
}
const linearTicket = (n: number, title: string, over: Partial<LinearTicket> = {}): LinearTicket => ({
  id: `lin_sample${n}`, identifier: `SHOP-${n}`, title: `${title} (sample)`, url: `https://linear.app/example/issue/SHOP-${n}`, branchName: `sample/shop-${n}`, priority: 2,
  state: { name: 'Todo', type: 'unstarted' }, assignee: 'Sample Owner', mine: true, project: 'Checkout', task: null, ...over,
})
export const linearTickets: LinearTicket[] = [
  linearTicket(41, 'Saved cards at checkout'),
  linearTicket(42, 'Address autocomplete', { state: { name: 'In Progress', type: 'started' }, priority: 1 }),
  linearTicket(38, 'Order confirmation email', { task: { id: 'iss_sample20', identifier: 'SS-20' } }),
  linearTicket(39, 'Wishlist sharing', { idea: { id: 'idea_sample3', number: 3 } }),
  linearTicket(44, 'Gift wrap option', { assignee: null, mine: false, project: null, state: { name: 'Backlog', type: 'backlog' }, priority: 0 }),
  linearTicket(45, 'Faster search results', { assignee: 'Made-up Teammate', mine: false, project: 'Search', priority: 3 }),
]
/** Made-up assets: two the sample app is worked from (a link and a file on this computer), one that is the checkout project's own. */
export const assets: Asset[] = [
  { id: 'asset_sample1', appId: 'app_sample', projectId: null, name: 'Designs (sample)', location: 'https://example.com/design/sample-shop', note: 'every screen, kept by design' },
  { id: 'asset_sample2', appId: 'app_sample', projectId: null, name: 'Architecture (sample)', location: '/code/sample-shop/docs/architecture.md', note: null },
  { id: 'asset_sample3', appId: 'app_sample', projectId: 'proj_checkout', name: 'Checkout requirements (sample)', location: 'https://example.com/docs/checkout', note: 'what it must do, and the order to build it in' },
]
/** A made-up folder holding three checkouts, as the folder chooser reports it: the shop's frontend (already the app's), its backend, and one with no remote. */
export const folder: Folder = { path: '/code', repos: [
  { name: 'old-site', path: '/code/old-site', fullName: null, branch: 'master' },
  { name: 'sample-shop', path: '/code/sample-shop', fullName: 'example/sample-shop', branch: 'main' },
  { name: 'sample-shop-api', path: '/code/sample-shop-api', fullName: 'example/sample-shop-api', branch: 'develop' },
] }
/** What gh would list for the sample person, for picking a repo when an app is made: made up. */
export const githubRepos: GitHubRepos = { repos: [
  { fullName: 'example/sample-shop', defaultBranch: 'main', private: false },
  { fullName: 'example/sample-blog', defaultBranch: 'main', private: true },
  { fullName: 'example/old-site', defaultBranch: 'master', private: true },
], problem: null }
/** What the engine says after a folder is set as a checkout (sample). */
export const repoNote = 'Made it a git repository on main, committed the 12 files as found, wrote a .gitignore for node_modules.'

/** A task (an issue row) with every field filled; pass what differs. */
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
  ...i, project: { id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running' }, parent: null, build: null, questions: [], decisions: [], relations: [], subIssues: [], steps: [], stepsAttempt: null, comments: [], runner: null, madeBy: null, handover: null, ...extra,
})
/** Comments as the tkt skills write them on a ticket they built (sample): one per heading, the latest of each. */
const commentsOnTicket = [
  { id: 'cmt_sample1', issueId: 'iss_sample22', heading: 'Approved implementation plan', author: 'start-ticket', createdAt: '2026-11-07T23:36:00Z', updatedAt: '2026-11-07T23:40:00Z',
    body: '## Approved implementation plan\n\nOne pure `slugify` in `src/strings.js`, beside `capitalize`, with its tests. Strip accents (NFKD, drop marks), lower-case, each run of other characters becomes one hyphen, trim the ends. No new dependency.\n\n**Decisions:** accents are stripped (asked 2026-11-07). **Risk:** low: a new function, nothing changes.' },
  { id: 'cmt_sample2', issueId: 'iss_sample22', heading: 'Implementation handoff', author: 'work-ticket', createdAt: '2026-11-07T23:52:00Z', updatedAt: '2026-11-07T23:52:00Z',
    body: '## Implementation handoff\n\nPull request #1 at head `5f984b9` (sample). `npm test`: 5 pass, 0 fail. No CI configured.\n\nStatus: READY_FOR_REVIEW' },
  { id: 'cmt_sample3', issueId: 'iss_sample22', heading: 'Completion', author: 'finish-ticket', createdAt: '2026-11-08T00:05:00Z', updatedAt: '2026-11-08T00:05:00Z',
    body: '## Completion\n\nMerged as `a462204` (sample), pinned to the reviewed head. Human verification steps 1 to 6 passed. Ticket moved to done.\n\nStatus: DONE' },
]
export const issueDetails: Record<string, IssueDetail> = {
  iss_sample1: detailOf(issues[0], { decisions, subIssues: subIssues.slice(0, 2).map((s) => ({ ...s, build: { status: s.status, attempt: s.attempt, heldReason: s.heldReason } })) }),
  iss_sample5: detailOf(subIssues[1], { parent: { id: 'iss_sample1', identifier: 'SS-1', title: 'Checkout on one page' }, build: { status: 'running', attempt: 1, heldReason: null }, steps, stepsAttempt: 1 }),
  iss_sample6: detailOf(subIssues[2], { parent: { id: 'iss_sample2', identifier: 'SS-2', title: 'Totals and analytics' }, brief: plannedBrief, build: { status: 'queued', attempt: 0, heldReason: 'waiting on SS-5 (web/checkout/submit.ts)' } }),
  iss_sample16: detailOf(issue(16, 'Search results load too slowly', { projectId: null, description: 'Reported twice this week.' }), { project: null }),
  iss_sample22: detailOf(issue(22, 'Add slugify to the string helpers (sample)', { projectId: null, state: 'done', description: 'Page titles need URL slugs and every caller writes its own loop.', briefApprovedBy: 'Sam (sample)', briefApprovedAt: '2026-11-07T23:30:00Z', completedAt: '2026-11-08T00:05:00Z' }), { project: null, comments: commentsOnTicket, runner: 'tkt' }),
  iss_sample20: detailOf(issue(20, 'Address and payment on one page (sample)', { description: 'Fewer steps between the cart and a paid order.', brief: '### What (sample)\nAddress and payment on one page.\n\n### Done when\n- A paid order takes one page.' }), { madeBy: { sessionId: 'sess_sample_plans', title: 'Checkout plans (sample)', open: true }, handover: { sessionId: 'sess_sample_plans', at: '2026-11-14T10:00:00Z', text: '## What was decided\n- One page, not three (sample).\n- Wallet buttons go first.\n\n## Still open\n- Whether tax shows before or after the address.' } }),
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
/** A build as it happens: SS-5's builder at work, for the build log. */
const b = (seq: number, minutes: number, type: string, payload: Record<string, unknown>): Event => ({ seq, ts: at(minutes), type, actor: 'agent:run_sample', issueId: 'iss_sample5', projectId: 'proj_checkout', payload })
export const buildEvents: Event[] = [
  b(101, 31, 'build.status', { identifier: 'SS-5', from: 'ready', to: 'running' }),
  b(102, 31, 'run.started', { model: 'claude-opus-5-5' }),
  b(103, 32, 'run.message', { text: 'Reading the checkout form first, then the card error handling. (Sample.)' }),
  b(104, 32, 'run.tool_call', { tool: 'Read', input: { file: 'web/checkout/form.tsx' } }),
  b(105, 32, 'run.tool_result', { ok: true, preview: 'export function CheckoutForm() { … } // sample' }),
  b(106, 33, 'run.tool_call', { tool: 'Grep', input: { pattern: 'card_declined' } }),
  b(107, 33, 'run.tool_result', { ok: true, preview: 'web/checkout/submit.ts:41' }),
  b(108, 35, 'run.tool_call', { tool: 'Edit', input: { file: 'web/checkout/submit.ts' } }),
  b(109, 36, 'run.tool_call', { tool: 'Bash', input: { command: 'pnpm test web/checkout' } }),
  b(110, 37, 'run.tool_result', { ok: false, preview: '1 failing: shows the decline reason (sample)' }),
  b(111, 38, 'run.message', { text: 'One test fails: the message is shown above the form, not in place. Fixing that. (Sample.)' }),
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

/** Integrations, made up: tkt runs the shop's tickets, PostHog for telemetry, Linear connected, Confluence set but its key missing. */
export const sampleIntegrations: FactorySettings['integrations'] = [
  {
    key: 'tkt', name: 'tkt', role: 'Runner', does: 'Builds this app’s tickets from their approved briefs: a worktree, a herdr tab, the lifecycle skills on the harness and model its preset says; the plan, the handoff, the review and the completion written back on the ticket.',
    fields: [
      { key: 'on', label: 'Runs this app’s tasks', kind: 'switch', required: true, states: { on: 'tkt builds this app’s tickets; Evident hands none to its own planner', off: 'this app’s tasks go to Evident’s own planner and builder' } },
      { key: 'linear', label: 'Tickets live in Linear', kind: 'switch', states: { on: 'tkt runs on its own for this app: it reads and updates the tickets in Linear, in the team under Integrations › Linear, and never asks Evident', off: 'tkt reads this app’s tickets from Evident' } },
    ], calls: true, perApp: true, docs: 'https://gitlab.com/rogs/tkt',
    actions: [
      { key: 'start', name: 'Start', does: '`tkt start <ticket>`: a worktree and a tab; start-ticket reads the ticket here, moves it to in progress and plans from the brief.' },
      { key: 'approve', name: 'Approve the plan', does: '`tkt approve <ticket>`: work-ticket builds, commits, opens the pull request and hands off on the ticket.' },
      { key: 'review', name: 'Review', does: '`tkt run <ticket> review`: review-pr in a fresh session, its verdict on the pull request.' },
      { key: 'merge', name: 'Merge and finish', does: '`tkt merge <ticket> --passed`, then `tkt done`: finish-ticket merges and moves the ticket to done.' },
      { key: 'setup', name: 'Set up what’s missing', does: 'Writes everything tkt and its skills read from the repo (the tracker guide, the forge, the workflow, the domain docs, the pull request template, the Ticket lifecycle block in CLAUDE.md) from the app, the repo and the house profile; installs tkt’s hooks with tkt’s own installer; commits to the base branch and pushes. Only what tkt itself still lacks goes to the agent.', kind: 'ask' },
    ],
  },
  {
    key: 'storybook', name: 'Storybook', role: 'Mockups', does: 'This app’s mockups, as stories: the real ones, after the sketches; Mockups shows them inside Evident, the agent opens one to show what it means, and the screen map draws the app as the user walks it.',
    fields: [
      { key: 'on', label: 'Mockups in Storybook', kind: 'switch', required: true, states: { on: 'this app’s mockups are stories, checked against the standard', off: 'no Storybook for this app' } },
      { key: 'cmd', label: 'Command', placeholder: 'default: the repo’s storybook script, with --no-open' },
      { key: 'url', label: 'URL', placeholder: 'default: http://localhost:6006, or the port the script names' },
      { key: 'outside', label: 'Kept outside the repo', kind: 'switch', states: { on: 'run by the command for each checkout, given $WORKTREE and $PORT; nothing is installed into the repo, and the check only asks it for its stories', off: 'in the repo, checked against the standard' } },
      { key: 'stories', label: 'Where stories go', placeholder: 'told to agents, when the Storybook is kept outside the repo' },
    ],
    calls: true, perApp: true, docs: 'https://github.com/zigbang/storybook-addon-story-flow',
    actions: [
      { key: 'start', name: 'Start', does: 'Starts Storybook from the checkout with the command and keeps it running; Mockups shows it.', kind: 'start' },
      { key: 'map', name: 'Open the map', does: 'The screen map: every page as the user sees it, and the taps between them. Here once the check finds a map and Storybook is up.', kind: 'link' },
      { key: 'setup', name: 'Set up Storybook', does: 'Installs Storybook to the standard when the repo has none (Storybook’s own installer, docs only), then the screen map: the add-on, its stylesheet, the main and preview entries, a first map, a line in the README; commits on the base branch and pushes. Every step is skipped when already done. Only what cannot be done from here goes to the agent.', kind: 'ask' },
    ],
  },
  {
    key: 'posthog', name: 'PostHog', role: 'Telemetry', does: 'Events, errors and experiments.', calls: false, actions: [],
    fields: [{ key: 'host', label: 'Host', placeholder: 'https://us.posthog.com' }, { key: 'project_id', label: 'Project id' }, { key: 'key_env', label: 'Key variable', placeholder: 'POSTHOG_API_KEY', secret: true }],
  },
  {
    key: 'linear', name: 'Linear', role: 'Planning', does: 'Tasks as Linear issues: made from an approved brief, commented on, moved as the build goes.', calls: true, docs: 'https://linear.app/settings/account/security',
    fields: [{ key: 'team', label: 'Team key', placeholder: 'HG', required: true }, { key: 'key_env', label: 'Key variable', placeholder: 'LINEAR_API_KEY', required: true, secret: true }],
    actions: [
      { key: 'issue.create', name: 'Create an issue', does: 'A Linear issue from the task and a step’s content, linked back; run again, it updates that issue.' },
      { key: 'issue.comment', name: 'Comment', does: 'A step’s content as a comment on the task’s issue.' },
      { key: 'issue.move', name: 'Move the issue', does: 'The task’s issue to a state, like In progress or Done.' },
    ],
  },
  {
    key: 'confluence', name: 'Confluence', role: 'Docs', does: 'Pages from steps: an ADR published as an RFC, a brief as a spec.', calls: true, docs: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    fields: [
      { key: 'site', label: 'Site', placeholder: 'https://yourteam.atlassian.net', required: true }, { key: 'email', label: 'Account email', required: true },
      { key: 'space', label: 'Space key', placeholder: 'ENG', required: true }, { key: 'parent', label: 'Parent page id' },
      { key: 'key_env', label: 'Key variable', placeholder: 'CONFLUENCE_API_TOKEN', required: true, secret: true },
    ],
    actions: [{ key: 'page.publish', name: 'Publish a page', does: 'A step’s content as a page in the space, from Markdown; run again, it updates that page.' }],
  },
]

export const factorySettings: FactorySettings = {
  workspace,
  integrations: sampleIntegrations,
  values: {
    posthog: { host: 'https://us.posthog.com' },
    linear: { team: 'SHOP', key_env: 'LINEAR_API_KEY' },
    confluence: { site: 'https://sample-shop.atlassian.net', email: 'owner@example.com', space: 'ENG', key_env: 'CONFLUENCE_API_TOKEN' },
  },
  status: {
    tkt: { state: 'off', missing: [], keyVar: null },
    storybook: { state: 'off', missing: [], keyVar: null },
    posthog: { state: 'ready', missing: [], keyVar: null },
    linear: { state: 'ready', missing: [], keyVar: 'LINEAR_API_KEY' },
    confluence: { state: 'no-key', missing: [], keyVar: 'CONFLUENCE_API_TOKEN' },
  },
  plugins: [{
    id: 'sample-plugin@sample', name: 'sample-plugin', version: '1.0.0', description: 'A made-up plugin with two skills.', source: 'sample', builtIn: false,
    on: true, roles: ['talk', 'planner'], mcpServers: [], note: null, tools: null,
    skills: [{ key: 'sample-plugin/write-tests', name: 'write-tests', description: 'Writes tests for a change.', category: 'testing', on: true }, { key: 'sample-plugin/audit', name: 'audit', description: 'Reads a diff for risks.', category: null, on: true }],
  }],
  catalogue: [{ name: 'Build', categories: [{ key: 'testing', name: 'Testing', for: 'Writing and running tests' }, { key: 'review', name: 'Review', for: 'Reading a change before it lands' }] }],
}
export const appSettings: AppSettings = {
  integrations: {
    tkt: { on: { value: 'true', from: 'app' }, linear: { value: 'true', from: 'app' } },
    storybook: { on: { value: 'true', from: 'app' }, cmd: { value: 'pnpm storybook --no-open', from: 'app' }, url: { value: 'http://localhost:6007', from: 'app' } },
    posthog: { host: { value: 'https://us.posthog.com', from: 'workspace' }, project_id: { value: '12345', from: 'app' }, key_env: { value: null, from: null } },
    linear: { team: { value: 'GIFT', from: 'app' }, key_env: { value: 'LINEAR_API_KEY', from: 'workspace' } },
    confluence: { site: { value: null, from: null }, email: { value: null, from: null }, space: { value: null, from: null }, parent: { value: null, from: null }, key_env: { value: null, from: null } },
  },
  status: { tkt: { state: 'ready', missing: [], keyVar: null }, storybook: { state: 'ready', missing: [], keyVar: null }, posthog: { state: 'ready', missing: [], keyVar: null }, linear: { state: 'ready', missing: [], keyVar: 'LINEAR_API_KEY' }, confluence: { state: 'off', missing: ['Site', 'Account email', 'Space key', 'Key variable'], keyVar: null } },
  plugins: [{ id: 'sample-plugin@sample', name: 'sample-plugin', factoryOn: true, own: null, on: true }],
  jobs: [
    { key: 'testing', name: 'Testing', for: 'Writing and running tests', group: 'Build', builtIn: null, skills: [{ key: 'sample-plugin/write-tests', name: 'write-tests', plugin: 'sample-plugin' }, { key: 'other-plugin/test-first', name: 'test-first', plugin: 'other-plugin' }], factory: 'sample-plugin/write-tests', overridden: false, own: null },
    { key: 'review', name: 'Review', for: 'Reading a change before it lands', group: 'Build', builtIn: null, skills: [{ key: 'sample-plugin/audit', name: 'audit', plugin: 'sample-plugin' }], factory: null, overridden: false, own: null },
    { key: 'planning', name: 'Planning', for: 'Turning decisions into tasks', group: 'Plan', builtIn: 'The planner: sub-tasks with a brief each', skills: [], factory: null, overridden: false, own: null },
  ],
  usable: [
    { name: 'checkout-rules', label: 'checkout-rules', from: 'this repo', description: 'How this shop prices and taxes an order.' },
    { name: 'shop-design', label: 'shop-design', from: 'this repo', description: 'The shop\'s look: spacing, type and the components to reach for (sample).' },
    { name: 'sample-plugin:write-tests', label: 'write-tests', from: 'sample-plugin', description: 'Writes tests for a change.' },
  ],
  skills: [{ key: 'checkout-rules', name: 'checkout-rules', description: 'How this shop prices and taxes an order.' }],
}
/** What the Storybook check says for the shop when all is well (sample). */
export const storybookCheck = { ok: true, detail: 'Storybook 10.6.3 in web with the screen map: 2 flow files; answering at http://localhost:6007.', links: [{ label: 'Open the map', href: 'http://localhost:6007/?path=/docs/shop-map--docs' }] }
/** The repo's docs/agents/issue-tracker.md for the shop, as the engine fills it (sample: shortened). */
export const trackerGuideSample = `<!-- rogs-skills config v1: issue-tracker -->
# Issue tracker

Where this project's tickets live and how the lifecycle skills read and change them. Written from Evident's settings for the app Sample Shop (SS).

## Tracker

- Kind: Evident
- Connection: the engine's HTTP API at \`http://localhost:4000/api\`, with \`curl\`. The UI is at \`http://localhost:5180\`. No token.
- Scope: the app \`Sample Shop\`, id \`app_sample\`, key \`SS\`.
- Ticket ids: \`SS-<number>\`, matched by \`^SS-[1-9][0-9]*$\`.

## Operations

### resolve

\`curl -sf <engine>/issues/<ticket id>\` (sample: the rest of the operations follow)

Capability: Supported
`

/** Claude Code sessions run on Sample Shop in a terminal or an editor (made up): one already brought in. */
export const claudeSessions: ClaudeSession[] = [
  { id: '00000000-sample-a', cwd: '/code/sample-shop', branch: 'main', title: 'Why the cart total rounds wrong (sample)', at: new Date(Date.now() - 4 * 60_000).toISOString(), talkId: null },
  { id: '00000000-sample-b', cwd: '/code/sample-shop-wt/saved-cards', branch: 'saved-cards', title: 'Saved cards on the pay step (sample)', at: new Date(Date.now() - 3 * 3600_000).toISOString(), talkId: 'talk_sample' },
  { id: '00000000-sample-c', cwd: '/code/sample-shop', branch: 'main', title: null, at: new Date(Date.now() - 3 * 86400_000).toISOString(), talkId: null },
]

export const talkSession: TalkSession = {
  id: 'talk_sample', appId: sampleApp.id, cwd: '/code/sample-shop', branch: null, worktreePath: null, subject: 'Why is SS-6 waiting?', subjectRef: { projectId: 'proj_checkout' },
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

/** A prototype's conversation, made up: it works in the prototype's worktree and starts from a brief. */
export const prototypeTalk: TalkSession = { ...talkSession, id: 'talk_sample_proto', cwd: '/code/sample-shop-worktrees/prototype--sample-one-tap-checkout-a1b2', branch: 'prototype/sample-one-tap-checkout-a1b2', subject: 'Prototype: Sample: one-tap checkout', subjectRef: { prototypeId: 'proto_sample1', projectId: 'proj_checkout' }, autoApprove: 'moderate' }
export const prototypeTranscript: Transcript = {
  session: prototypeTalk, pending: [],
  messages: [
    { id: 1, sessionId: prototypeTalk.id, author: 'engine', kind: 'brief', body: '**Sample brief.** A checkout that takes one tap for a returning customer.\n\n- Follow the mockup `pages-checkout--one-tap`.\n- Fake the saved card; no real payments.\n- We want to learn whether people trust paying without a confirm step.', payload: null, sentAt: at(40) },
    { id: 2, sessionId: prototypeTalk.id, author: 'agent', kind: 'text', body: 'First version is up: the cart has a **Pay now** button for a returning customer, with a made-up saved card. Try it in the Prototype tab. What should change?', payload: null, sentAt: at(43) },
    { id: 3, sessionId: prototypeTalk.id, author: 'engine', kind: 'result', body: 'done', payload: { costUsd: 0.31, turns: 14, durationMs: 160000 }, sentAt: at(43) },
  ],
}

/** Prototypes, made up: one running, one stopped. The running one's address is filled in by the story. */
export const prototypes: Prototype[] = [
  { id: 'proto_sample1', appId: sampleApp.id, projectId: 'proj_checkout', title: 'Sample: one-tap checkout', brief: 'Sample brief.', sessionId: 'talk_sample_proto', scenario: 'default', database: 'proto_sample_one_tap_checkout_a1b2', scenarios: ['default', 'returning-customer', 'empty-cart'], branch: 'prototype/sample-one-tap-checkout-a1b2', path: '/code/sample-shop-worktrees/prototype--sample-one-tap-checkout-a1b2', port: 51234, status: 'running', url: 'http://localhost:51234', createdAt: '2026-10-29T10:00:00Z' },
  { id: 'proto_sample2', appId: sampleApp.id, projectId: null, title: 'Sample: gift cards', brief: null, sessionId: null, scenario: null, branch: 'prototype/sample-gift-cards-c3d4', path: '/code/sample-shop-worktrees/prototype--sample-gift-cards-c3d4', port: 51240, status: 'stopped', url: 'http://localhost:51240', createdAt: '2026-10-28T16:00:00Z' },
]

// A task's acceptance criteria (made up): two the prototype showed, one it did not, one nobody has tried, one left to the final build.
export const acceptance: import('../engine').Criterion[] = [
  { id: 'ac_sample1', text: 'A returning customer pays with the saved card in one tap (sample)', check: 'The returning-customer scenario: /checkout shows one Pay button', shown: true, evidence: '/checkout as Ada (sample), scenario returning-customer', built: true, builtEvidence: 'checkout.one-tap.test.ts passes (sample)', by: 'agent', at: '2026-10-28T11:00:00Z' },
  { id: 'ac_sample2', text: 'A customer with no saved card gets the old form (sample)', check: 'The empty-cart scenario, signed in as a new customer', shown: true, evidence: '/checkout as Bo (sample)', by: 'agent', at: '2026-10-28T11:05:00Z' },
  { id: 'ac_sample3', text: 'A failed charge is retried once and never charges twice (sample)', check: 'scripts/charge-twice.sh prints one charge', shown: false, evidence: 'The retry runs, but nothing stops a second charge when the first one was slow, not failed', built: false, builtEvidence: 'scripts/charge-twice.sh prints two charges (sample)', by: 'agent', at: '2026-10-28T11:20:00Z' },
  { id: 'ac_sample4', text: 'A customer sees only their own saved cards (sample)', by: 'Sam (sample)', at: '2026-10-28T11:30:00Z' },
  { id: 'ac_sample5', text: 'The Pay button\'s wording is signed off by support (sample)', check: 'Support\'s sign-off on the pull request', buildOnly: true, why: 'Copy, not behaviour: nothing to prove in a prototype', by: 'agent', at: '2026-10-28T11:40:00Z' },
]

// A prototype's code (made up): three files changed, and two things the agent put there to answer a question.
export const prototypeCode: import('../engine').PrototypeCode = {
  prototypeId: 'proto_sample1', branch: 'prototype/sample-one-tap-checkout-a1b2', base: 'a1b2c3d4e',
  files: [
    { path: 'docs/checkout.md', status: 'added', added: 6, removed: 0 },
    { path: 'web/checkout/legacy-steps.ts', status: 'deleted', added: 0, removed: 41 },
    { path: 'web/checkout/submit.ts', status: 'modified', added: 5, removed: 2 },
  ],
  shown: [
    { id: 'shown_sample1', kind: 'file', path: 'web/checkout/payment.ts', note: 'Sample: the saved card is read here. The prototype did not change this file; it only calls it from submit.ts.', lines: [{ from: 4, to: 6 }], by: 'agent', at: '2026-10-28T15:20:00Z' },
    { id: 'shown_sample2', kind: 'link', url: 'https://example.com/docs/payment-intents', title: 'Payment intents (sample docs)', note: 'Sample: why one call can both save the card and charge it.', by: 'agent', at: '2026-10-28T15:21:00Z' },
  ],
}
export const prototypeFiles: Record<string, import('../engine').PrototypeFile> = {
  'web/checkout/submit.ts': { path: 'web/checkout/submit.ts', missing: false, unreadable: false,
    content: "import { charge } from './payment'\n\nexport async function submit(cart: Cart) {\n  const card = await savedCard(cart.customer) // sample\n  if (!card) return askForCard(cart)\n  return charge(card, cart.total, { retries: 1 })\n}\n",
    patch: "diff --git a/web/checkout/submit.ts b/web/checkout/submit.ts\n--- a/web/checkout/submit.ts\n+++ b/web/checkout/submit.ts\n@@ -1,6 +1,7 @@\n import { charge } from './payment'\n \n export async function submit(cart: Cart) {\n-  const card = await askForCard(cart)\n-  return charge(card, cart.total, { retries: 0 })\n+  const card = await savedCard(cart.customer) // sample\n+  if (!card) return askForCard(cart)\n+  return charge(card, cart.total, { retries: 1 })\n }\n" },
  'web/checkout/payment.ts': { path: 'web/checkout/payment.ts', missing: false, unreadable: false, patch: null,
    content: "// Sample file, made up.\nimport { vault } from './vault'\n\nexport async function savedCard(customer: string) {\n  return vault.find({ customer, kind: 'card' })\n}\n\nexport async function charge(card: Card, total: number, opts: { retries: number }) {\n  return vault.charge(card, total, opts)\n}\n" },
  'docs/checkout.md': { path: 'docs/checkout.md', missing: false, unreadable: false,
    content: "# One-tap checkout (sample)\n\nA returning customer pays with the saved card in one tap.\n\n- No saved card: the old form.\n- A failed charge is retried once.\n",
    patch: "--- /dev/null\n+++ b/docs/checkout.md\n@@ -0,0 +1,6 @@\n+# One-tap checkout (sample)\n+\n+A returning customer pays with the saved card in one tap.\n+\n+- No saved card: the old form.\n+- A failed charge is retried once." },
  'web/checkout/legacy-steps.ts': { path: 'web/checkout/legacy-steps.ts', missing: true, unreadable: false, content: null,
    patch: "--- a/web/checkout/legacy-steps.ts\n+++ /dev/null\n@@ -1,3 +0,0 @@\n-// Sample: the three-step checkout, removed.\n-export const steps = ['address', 'payment', 'review']\n-export const next = (s: string) => steps[steps.indexOf(s) + 1]" },
}

// Workflows and steps (made up). "UI change" requires starting as an idea, a mockup and the brief, in order, then a
// blast-radius check; "Quick fix" has only the brief, with research and the steps either side of it switched off.
export const uiWorkflow: Workflow = { id: 'wf_sample_ui', name: 'UI change (sample)', ordered: true, steps: [
  { key: 'idea', on: true, required: true }, { key: 'research', on: true, required: false },
  { key: 'mockup', on: true, required: true }, { key: 'prototype', on: true, required: false },
  { key: 'risk', on: true, required: true }, { key: 'brief', on: true, required: true },
] }
/** What every app starts with (sample copy of the engine's "Default"). */
export const defaultWorkflow: Workflow = { id: 'wf_sample_default', name: 'Default', ordered: false, steps: [
  { key: 'idea', on: true, required: false }, { key: 'research', on: true, required: false }, { key: 'sketch', on: true, required: false }, { key: 'mockup', on: true, required: false },
  { key: 'prototype', on: true, required: false }, { key: 'brief', on: true, required: true },
] }
export const quickWorkflow: Workflow = { id: 'wf_sample_quick', name: 'Quick fix (sample)', ordered: false, steps: [
  { key: 'idea', on: true, required: false }, { key: 'research', on: false, required: false },
  { key: 'mockup', on: false, required: false }, { key: 'prototype', on: false, required: false }, { key: 'brief', on: true, required: true },
] }
export const ideaSteps: StepState[] = [
  { key: 'research', status: 'done', detail: '3 comps, one case against' },
  { key: 'sketch', status: 'done', detail: '2 screens, third round' },
  { key: 'mockup', status: 'started', detail: '2 variants' },
]
export const taskSteps: StepState[] = [
  { key: 'research', status: 'done', detail: 'carried over from the idea', approved: { by: 'Sam (sample)', at: '2026-10-27' } },
  { key: 'mockup', status: 'done', detail: 'variant B chosen' }, // done by the agent's word: ready for the person to approve
  { key: 'prototype', status: 'started', detail: 'running, scenario "busy store"' },
  { key: 'brief', status: 'done', detail: 'draft, 4 sections' },
]

// Plan's page (made up): one project with three tasks at different points, and a stand-alone fix.
export const plan: Plan = {
  projects: [{
    id: 'proj_checkout', name: 'One-page checkout (sample)', status: 'running', workflow: 'UI change (sample)',
    steps: [{ key: 'research', status: 'done' }, { key: 'prototype', status: 'done', detail: 'the whole flow, made-up orders' }],
    tasks: [
      { id: 'iss_sample1', identifier: 'SS-1', title: 'Address and payment on one page', state: 'in_progress', steps: taskSteps.map((s) => (s.key === 'brief' ? { ...s, approved: { by: 'Sam (sample)', at: '2026-10-28' } } : s)) },
      { id: 'iss_sample2', identifier: 'SS-2', title: 'Remember the last card used', state: 'todo', steps: taskSteps },
      { id: 'iss_sample3', identifier: 'SS-3', title: 'Order summary beside the form', state: 'todo', steps: [{ key: 'mockup', status: 'started', detail: '2 variants' }] },
    ],
  }],
  loose: [{ id: 'iss_sample9', identifier: 'SS-9', title: 'Typo in the receipt email', state: 'todo', workflow: 'Quick fix (sample)', steps: [{ key: 'brief', status: 'done', detail: 'two lines' }] }],
  todosOpen: 3, workflows: [uiWorkflow, quickWorkflow], appWorkflow: 'UI change (sample)',
}


// The engine's view of steps (made up): a task under its project's workflow, an idea, and a project.
export const taskStepsView: StepsView = {
  on: 'task', resolved: { workflow: uiWorkflow, from: 'project' }, fromIdea: { id: 'idea_sample1', number: 4, title: 'Sample: checkout in one go' },
  states: [{ key: 'idea', status: 'done', detail: '#4 Sample: checkout in one go' }, ...taskSteps], rows: [], blocking: ['mockup', 'risk', 'brief'],
}
export const ideaStepsView: StepsView = { on: 'idea', resolved: { workflow: null, from: null }, fromIdea: null, states: ideaSteps, rows: [], blocking: [] }
export const projectStepsView: StepsView = { on: 'project', resolved: { workflow: defaultWorkflow, from: 'app' }, fromIdea: null, states: [{ key: 'prototype', status: 'done', detail: 'the whole flow, made-up orders' }], rows: [], blocking: [] }
/** The same task with its blast radius done and its brief approved: the build opens. */
export const approvedTaskStepsView: StepsView = { ...taskStepsView, states: [...taskStepsView.states.map((x) => (x.key === 'brief' ? { ...x, detail: undefined, approved: { by: 'Sam (sample)', at: '2026-10-28' } } : x)), { key: 'risk', status: 'done', detail: '3 files, one migration' } as StepState, { key: 'sketch', status: 'skipped' } as StepState].map((x) => (x.key === 'mockup' ? { ...x, approved: { by: 'Sam (sample)', at: '2026-10-28' } } : x.key === 'prototype' ? { ...x, status: 'done' as const, detail: 'the whole flow, shown', approved: { by: 'Sam (sample)', at: '2026-10-28' } } : x)), blocking: [] } // every optional step done or skipped (the sketches were skipped), so the brief can be approved
/** The same task with its mockups still under way: in an enforced order, the blast radius waits on them. */
export const waitingTaskStepsView: StepsView = { ...taskStepsView, states: taskStepsView.states.map((x) => (x.key === 'mockup' ? { ...x, status: 'started', detail: '2 variants' } : x)), blocking: ['mockup', 'risk', 'brief'] }
export const researchWork: StepWork = { id: 'step_sample1', key: 'research', status: 'done', detail: '3 comps, one case against', refs: [], updatedBy: 'agent', updatedAt: T0,
  body: '### Who does it best (sample)\n- Shop A: one page, address autocompleted.\n- Shop B: wallet buttons first.\n\n### The case against\nOne page is long on a phone.' }
export const workflowRows: WorkflowRow[] = [{ ...uiWorkflow, appDefault: true, projects: 1, tasks: 0 }, { ...quickWorkflow, appDefault: false, projects: 0, tasks: 1 }]

// A task's save points and task branches (made up): the person saved before the review, the engine saved at the
// prototype's approval, and one earlier try was set aside when they went back.
export const taskBranches: import('../engine').TaskBranches = {
  issueId: 'iss_sample20',
  worktrees: [{ key: 'prototype:proto_sample', label: 'the prototype "One-page checkout"', branch: 'prototype/one-page-checkout-ab12' }, { key: 'talk:sess_sample', label: "the task's own worktree", branch: 'talk/checkout-ab12' }],
  branches: [
    { id: 'tb_main', name: 'Main', current: true, fromSave: null, createdAt: '2026-11-12T15:00:00Z', gitBranches: ['prototype/one-page-checkout-ab12', 'talk/checkout-ab12'], work: null },
    { id: 'tb_wallet', name: 'Wallet first (sample)', current: false, fromSave: 'Before the wallet idea (sample)', createdAt: '2026-11-12T17:20:00Z', gitBranches: ['prototype/one-page-checkout-ab12--wallet-first-sample', 'talk/checkout-ab12--wallet-first-sample'], work: { commits: 3, comments: 1 } },
  ],
  saves: [
    { id: 'save_review', name: 'Proto before review (sample)', auto: null, branchId: 'tb_main', branchName: 'Main', onCurrent: true, changesSince: 4, createdBy: 'user', createdAt: '2026-11-13T10:05:00Z', gitBranches: ['prototype/one-page-checkout-ab12--proto-before-review-sample'] },
    { id: 'save_approved', name: 'Prototype approved', auto: 'prototype_approved', branchId: 'tb_main', branchName: 'Main', onCurrent: true, changesSince: 0, createdBy: 'engine', createdAt: '2026-11-13T14:40:00Z', gitBranches: ['prototype/one-page-checkout-ab12--prototype-approved'] },
  ],
}

// A check's report with its summary (made up): the blast radius of the sample checkout task. The body is long because
// the next agent needs it; the summary is what the person reads.
export const riskWork: StepWork = { id: 'step_sample_risk', key: 'risk', status: 'done', detail: 'One shared query, one migration (sample)', refs: [], updatedBy: 'agent', updatedAt: T0,
  summary: '- **Decide:** the orders query is shared with the dashboard. I would add an index before the build, not after (sample).\n- **Wrong:** the retry job is not covered by any test; one sub-task more (sample).\n- **Risky:** the migration locks the orders table for about a minute; run it off-peak. We would know from the deploy log (sample).\n- Everything else holds: no other app reads these tables (sample).',
  body: '## Files and modules\n\n`checkout/pay.ts`, `checkout/address.ts`, `orders/query.ts` (sample).\n\n## What else uses them\n\nThe dashboard reads `orders/query.ts` for its totals. A slower query there shows as a slow dashboard (sample).\n\n## Data and migrations\n\nOne migration adds `orders.paid_in_one_tap`. It rewrites the table (sample).\n\n## Shared or outward-facing\n\nNone beyond the dashboard (sample).\n\n## How we would know\n\n| Risk | Signal |\n| --- | --- |\n| Slow dashboard | p95 of `/dashboard` over 800 ms |\n| Retry job double-charges | `charge.duplicate` in the payments log |' }
// What a task's pull request will open with (made up).
export const mergeGuideText = '## Merge guide\n\n**1 of 4 acceptance criteria are not met.** 2 of 4 acceptance criteria were checked against the build and met. 1 is left for you.\n\n**What it does:** Address and payment are on one page, so a returning customer pays in one tap (sample).\n\n**For you to check**\n\n- ❌ A declined card says why and keeps what was typed (sample). Missing: the form clears on a decline (sample)\n- ⬜ The page reads well on a phone (sample). For a person: open /checkout at 390px (sample)\n\n**Decisions**\n\n- One form model or two? (sample) → **One, shared by both halves**\n\n**Risk:** The saved-card lookup is shared with the account page: watch its error rate (sample).\n\n**To undo:** revert this pull request.'
export const mergeRecordText = '**What it does**\n\nAddress and payment are on one page, so a returning customer pays in one tap (sample).\n\n**Every acceptance criterion**\n\n- ❌ A declined card says why and keeps what was typed (sample). Missing: the form clears on a decline (sample)\n- ⬜ The page reads well on a phone (sample). For a person: open /checkout at 390px (sample)\n- ✅ A returning customer pays in one tap (sample). Seen: checkout.test.ts (sample)\n- ✅ Address errors show beside the field (sample). Seen: the Address story (sample)\n\n**Decisions made**\n\n- One form model or two? (sample) → **One, shared by both halves**. Two drifted apart in the prototype (sample).\n\n**Risks, and how we would know**\n\n- The saved-card lookup is shared with the account page: watch its error rate (sample).'
// The planner's run on the sample task, as its tab shows it (made up): what it read, what it said, what came of it.
export const plannerLog: import('../engine').RunLog = { runId: 'run_sample_plan', status: 'working', working: true, startedAt: '2026-11-13T15:00:00Z', endedAt: null, costUsd: null, lines: [
  { seq: 1, at: '2026-11-13T15:00:00Z', type: 'issue.planning' },
  { seq: 2, at: '2026-11-13T15:00:05Z', type: 'run.tool_call', tool: 'Read', input: { file: 'src/checkout/pay.ts' } },
  { seq: 3, at: '2026-11-13T15:00:09Z', type: 'run.tool_call', tool: 'Grep', input: { pattern: 'savedCard', path: 'src' } },
  { seq: 4, at: '2026-11-13T15:00:30Z', type: 'run.message', text: 'The address and payment forms share no state today, so the first sub-task is one form model for both (sample).' },
  { seq: 5, at: '2026-11-13T15:00:41Z', type: 'run.tool_call', tool: 'Read', input: { file: 'src/checkout/address.ts' } },
] }
export const plannerLogDone: import('../engine').RunLog = { ...plannerLog, status: 'completed', working: false, endedAt: '2026-11-13T15:04:00Z', costUsd: 0.42, lines: [...plannerLog.lines, { seq: 6, at: '2026-11-13T15:04:00Z', type: 'issue.planned', subIssues: [1, 2, 3] }] }

// Reports on the sample app (made up): today's end-of-day note and last week's status, as the person would send them.
export const reports: import('../engine').Reports = { writing: false, format: { daily: '', weekly: '' }, reports: [
  { id: 'rep_today', appId: 'app_shop', kind: 'daily', fromAt: '2026-11-13T08:00:00Z', toAt: '2026-11-13T23:00:00Z', label: 'Today, Nov 13', notes: 'Met with Em about the checkout copy (sample)', editedAt: null, createdAt: '2026-11-13T23:00:00Z', costUsd: '0.03',
    body: 'Today:\n- SHOP-20, one-page checkout (#412): prototyped address and payment on one page and shared it for a look (sample)\n- Wrote the acceptance criteria for SHOP-20; 5 of 6 shown in the prototype (sample)\n- Merged #409, the saved-card fix (sample)\n- Met with Em about the checkout copy (sample)\n\nTomorrow:\n- Address feedback on the SHOP-20 prototype (sample)\n- Get review on #412 (sample)' },
  { id: 'rep_week', appId: 'app_shop', kind: 'weekly', fromAt: '2026-11-02T08:00:00Z', toAt: '2026-11-09T08:00:00Z', label: 'Week of Nov 2', notes: null, editedAt: '2026-11-09T10:00:00Z', createdAt: '2026-11-09T09:00:00Z', costUsd: '0.05',
    body: 'One-page checkout: weekly status (week of Nov 2)\n\nWhere it stands\nThe saved-card work is merged. The one-page checkout is designed and its prototype starts next week (sample).\n\nDone this week\n- Merged the saved-card stack, #401 to #405 (sample)\n\nNext week\n- Prototype the one-page checkout, SHOP-20 (sample)\n\nOpen decisions and risks\n- Whether the old two-step route stays for a release (sample)' },
] }

// A checklist task after its first check (made up): one criterion and one requirement not done and sent back.
export const checklistSample: import('../engine').Checklist = {
  build: 'one', met: 4, unmet: 2, total: 7,
  flow: [
    { id: 'iss_sample5', sub: 'iss_sample5', title: 'Build it', state: 'done', detail: '', after: null },
    { id: 'flow:check', title: 'Check it against its list', state: 'doing', detail: 'round 1: 2 not done, sent back', after: ['iss_sample5'] },
    { id: 'flow:probe', title: 'Probes', state: 'todo', detail: 'after the check', after: ['flow:check'] },
    { id: 'flow:test', title: 'The whole test run', state: 'todo', detail: 'the whole run, once, last', after: ['flow:probe'] },
  ],
  stages: [
    { key: 'build', label: 'Build', state: 'done', detail: 'built in one go' },
    { key: 'check', label: 'Check', state: 'doing', detail: 'round 1: 2 not done, sent back' },
    { key: 'probe', label: 'Probe', state: 'todo', detail: 'after the check' },
    { key: 'test', label: 'Tests', state: 'todo', detail: 'the whole run, once, last' },
  ],
  items: [
    { id: 'ac_s1', kind: 'criterion', text: 'A returning customer pays in one tap (sample)', mark: 'met', evidence: 'checkout.test.ts (sample)' },
    { id: 'ac_s2', kind: 'criterion', text: 'A declined card says why and keeps what was typed (sample)', mark: 'unmet', evidence: 'the form clears on a decline (sample)' },
    { id: 'ac_s3', kind: 'criterion', text: 'The page reads well on a phone (sample)', mark: 'person', evidence: 'For a person: open /checkout at 390px (sample)' },
    { id: 'req_telemetry', kind: 'requirement', text: 'Telemetry', what: 'Anything new that can fail can be seen (sample).', mark: 'unmet', evidence: 'no span on a declined card (sample)' },
    { id: 'req_tests', kind: 'requirement', text: 'Tests', what: 'New behaviour has a test (sample).', mark: 'met', evidence: 'checkout.test.ts, saved-card.test.ts (sample)' },
    { id: 'req_adr', kind: 'requirement', text: 'Decision record', what: 'Each real design choice is written down (sample).', mark: 'met', evidence: 'docs/decisions/one-form-model.md (sample)' },
    { id: 'req_docs', kind: 'requirement', text: 'Docs', what: 'What changed is documented (sample).', mark: 'na', evidence: 'does not apply: nothing a person reads changes (sample)' },
  ],
}

// A task's smoke test, running here (made up): three checks the agents left to a person on a diagram library's edges.
export const smokeSample: import('../engine').SmokeView = {
  where: 'local', says: 'run here, like its prototypes: the built branch, made-up data', account: null, flag: null,
  branch: 'project/edges--ss-20 (sample)', head: 'abc1234def', running: 'abc1234def', url: 'http://localhost:6500', up: true, canRun: true, log: [], owed: 3, failed: 0,
  checks: [
    { id: 'ac_s1', text: 'The tunnel reads as a tunnel (sample)', where: 'edges-tunnel--default', how: 'Open the story: the edge should dip under the lip, not sit on top of it (sample)', mark: 'todo' },
    { id: 'ac_s2', text: 'A portal shows where its edge comes out (sample)', where: 'edges-portal--pair', how: 'Hover one portal: its twin should light up (sample)', mark: 'todo' },
    { id: 'ac_s3', text: 'Portals keep 40 frames a second (sample)', where: 'edges-portal--many', how: 'Turn portals on and watch the counter in the corner: it should stay above 40 (sample)', mark: 'todo' },
  ],
}

// A task's test trajectory (made up): two slices, four tests, one of them deferred and one a regression guard. Not approved, nothing run.
const trajectoryRows: import('../engine').TestRow[] = [
  { id: 'T1', asserts: 'GET /export returns every order of the customer (sample)', level: 'integration', criteria: ['ac_1'], test: 'tests/export.test.ts', writableAt: 'tests', passesAt: 'file' },
  { id: 'T2', asserts: 'the query returns orders newest first (sample)', level: 'unit', criteria: ['ac_1'], test: 'tests/orders-query.test.ts', writableAt: 'tests', passesAt: 'query' },
  { id: 'T3', asserts: 'a second export adds no rows (sample)', level: 'integration', criteria: ['ac_2'], test: 'tests/export-twice.test.ts', writableAt: 'file', passesAt: 'file', deferred: { why: 'it calls the writer the query slice introduces (sample)', code: 'it("adds no rows", () => { expect(writeTwice()).toBe(0) })' } },
  { id: 'T4', asserts: 'the orders page still lists orders (sample)', level: 'component', criteria: [], test: 'tests/orders-page.test.tsx', writableAt: 'tests', passesAt: 'tests', guard: 'the query it reads is being changed (sample)' },
]
export const trajectorySample: import('../engine').Trajectory = {
  plan: { slices: [{ key: 'query', title: 'The orders query (sample)', what: 'Read every order of a customer, newest first.' }, { key: 'file', title: 'The export file (sample)', what: 'Write the rows as CSV and serve it.' }], rows: trajectoryRows },
  approved: false, changed: false, holds: false, proven: 0, total: 4, canRun: true, stray: [],
  rows: trajectoryRows.map((r) => ({ ...r, state: 'planned' as const, says: 'not run yet', runs: [] })),
}

// A task's pull request as a step (made up): not submitted yet, with what it will open with.
export const prSample: import('../engine').PrView = {
  issueId: 'iss_sample20', pr: null,
  message: { title: 'feat(SS-20): edges that tunnel and portal (sample)', body: '## What it does\n\nEdges can dip under a node (a tunnel) or jump across the diagram (a portal). Made-up text (sample).\n\n## How to check it\n\n- Open the Tunnel story: the edge dips under the lip.\n- Hover a portal: its twin lights up.\n\n**3 of 3 sub-tasks have landed.**', head: 'project/edges--ss-20', base: 'main' },
  behind: false, landed: 3, total: 3, unchecked: 0, byHand: 0, draft: true, auto: false, canSubmit: true, waits: [], canReady: false, comments: [], problem: null,
}
/** The same one as a draft on GitHub (made up), with a review, a comment on a line and a comment. */
export const prDraftSample: import('../engine').PrView = {
  ...prSample, canSubmit: false, canReady: true,
  pr: { number: 412, url: 'https://example.com/pull/412', status: 'draft', title: prSample.message!.title, body: prSample.message!.body, review: 'changes requested', mergeable: 'mergeable', updatedAt: '2026-11-20T10:00:00Z', checks: [{ name: 'tests (sample)', state: 'pass' }, { name: 'lint (sample)', state: 'fail' }, { name: 'preview (sample)', state: 'pending' }] },
  comments: [
    { id: 'r_1', kind: 'review', author: 'reviewer-a', body: 'Please split the portal lookup out of the renderer (sample).', at: '2026-11-20T09:00:00Z', url: null, state: 'changes requested' },
    { id: 'l_7', kind: 'line', author: 'reviewer-a', body: 'This map is rebuilt on every frame (sample).', at: '2026-11-20T09:10:00Z', url: 'https://example.com/pull/412#discussion_r7', path: 'src/edges/portal.ts', line: 41 },
    { id: 'c_2', kind: 'comment', author: 'reviewer-b', body: 'Looks close. The tunnel reads well (sample).', at: '2026-11-20T09:30:00Z', url: 'https://example.com/pull/412#issuecomment-2' },
  ],
}

// A task's screens (made up): three screens of a sample checkout, each with its states, rendered by a Storybook that is up. Its frames are one made-up page (.storybook/static/sample-storybook), labelled.
const sampleScreen = (title: string, states: string[]): import('../engine').Screen => ({ title, file: `./src/screens/${title}.stories.tsx`, states: states.map((name) => ({ id: `screens-${title.toLowerCase()}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name })) })
export const sampleScreens = [sampleScreen('Checkout', ['Filled', 'Empty', 'Card declined', 'A long name']), sampleScreen('Cart', ['Three items', 'Empty']), sampleScreen('Receipt', ['Paid'])]
export const screensView: import('../engine').ScreensView = { url: 'http://localhost:6007', frame: '/sample-storybook', configured: true, startable: true, up: true, startedHere: true, log: [], branch: 'talk/sample', main: false, screens: sampleScreens, earlier: 0, themed: true }

/** An app's mock library: one mined from a recording, one assumed, one that needs a recording. All made up (sample). */
const minedNote = `# Fraud scan vendor (sample): a mock

Stands in for: Fraud scan vendor workflow 0a1b2c, results CSV (sample).

Mined from: a real response recorded 18 Nov 2026, one person, 12 profiles, 9 scams, 2 doxxing posts (sample). Mined 20 Nov 2026.

What is real: the 62 columns of the results CSV, its nesting and formats (Python-style lists in cells, empty lists, a 40 KB cell).

What is invented: every value. Values are sample data: .example domains, invented names, prose marked "Sample data:".

It covers:
- someone with nothing found
- someone with one of each finding
- someone with a lot (40 profiles, 30 scams)

What it cannot show:
- the vendor's queue under load (a scan finishes in two seconds)
- the real service's latency and failures

Kept as recorded, because they are shape: "completed", "running".

Checked 20 Nov 2026: none of the 2,914 values in the recording's 9 files is in this mock.
`
/** Made up: the four calls an app makes to one vendor. Only the last has data: a real response the person gave, and a fake of it. The rest are answered with what the server makes up. */
const none = { app: null, task: null }
const fakedNote = 'Faked from a real response the person gave 18 Nov 2026: its structure is real, and 2610 values were replaced. Kept as they were, because they are structure: "completed", "running", "high", "low". Checked 20 Nov 2026: none of the 2914 values of that response is in it.'
export const resultsItem: import('../engine').EndpointItem = { recorded: { id: 'app_sample/iss_sample1/fraud-scan/given-2026-11-18', at: '2026-11-18T15:20:00Z', how: 'given', files: ['results.csv'] }, safe: { kind: 'faked', set: 'faked', files: ['results.csv'], note: fakedNote, columns: ['tracking_id', 'work_email', 'full_name', 'status', 'risk_level', 'profiles', 'person_summary'] } }
/** Made up: test files. One of the app's (a picture to upload) and two of the sample task's own. */
/** Made up: notes on the sample app. One is a decision; one is about two tasks. */
export const notes: import('../engine').Note[] = [
  { id: 'note_sample1', on: '2026-11-23', kind: 'note', title: 'Talked with Em about the import (sample)', body: 'An import scans everyone, not the people added.\n\nOutcome: it gets a ticket of its own; not changed under this task.', tasks: [{ id: 'iss_sample2', name: 'SS-2', title: 'Checkout totals (sample)' }, { id: 'iss_sample5', name: 'SS-5', title: 'Submit an order (sample)' }], createdBy: 'user', updatedAt: '2026-11-23T15:00:00Z' },
  { id: 'note_sample2', on: '2026-11-21', kind: 'decision', title: 'Test on an empty company first (sample)', body: '', tasks: [{ id: 'iss_sample2', name: 'SS-2', title: 'Checkout totals (sample)' }], createdBy: 'agent', updatedAt: '2026-11-21T10:00:00Z' },
  { id: 'note_sample3', on: '2026-11-20', kind: 'note', title: 'Vendor replied about pricing (sample)', body: 'They charge per person per run.', tasks: [], createdBy: 'user', updatedAt: '2026-11-20T10:00:00Z' },
]
export const testFiles: import('../engine').TestFile[] = [
  { id: 'tfile_sample1', name: 'id-card.png', what: 'Upload it as the ID on the Verify page (sample)', mediaType: 'image/png', bytes: 48_200, scope: 'app', checked: null, has: { fake: true, real: false }, use: { prototype: 'fake', smoke: 'fake', review: 'fake' }, here: true },
  { id: 'tfile_sample2', name: 'one-person.csv', columns: ['first_name', 'last_name', 'work_email'], what: 'Import it on the Employees page: one made-up person, the one the mock has findings for (sample)', mediaType: 'text/csv', bytes: 212, scope: 'task', checked: { at: '2026-11-23T09:00:00Z', against: 2 }, has: { fake: true, real: false }, use: { prototype: 'fake', smoke: 'fake', review: 'fake' }, here: true },
  { id: 'tfile_sample3', name: 'notes.pdf', what: '', mediaType: 'application/pdf', bytes: 1_300_000, scope: 'task', checked: null, has: { fake: true, real: false }, use: { prototype: 'fake', smoke: 'fake', review: 'fake' }, here: true },
  { id: 'tfile_sample4', name: 'export.csv', what: 'The export a customer sends, to bring in on the People page (sample)', mediaType: 'text/csv', bytes: 640, scope: 'task', columns: ['first_name', 'last_name', 'email'], checked: { at: '2026-11-23T09:00:00Z', against: 2, faked: 14 }, has: { fake: true, real: true }, use: { prototype: 'fake', smoke: 'real', review: 'fake' }, here: true },
  { id: 'tfile_sample5', name: 'passport.png', what: '', mediaType: 'image/png', bytes: 91_000, scope: 'task', checked: null, has: { fake: false, real: true }, use: { prototype: null, smoke: null, review: null }, note: 'It is not text, so no fake can be made of it here: add a made-up one under the same name', here: true },
]
/** Made up: the app's fixtures. One company with its employees, and a small one. */
export const fixtures: import('../engine').Fixture[] = [
  { name: 'northwind-company', bytes: 1_480_000, tables: [{ name: 'employees', rows: 250, columns: ['id', 'first_name', 'last_name', 'work_email', 'title', 'department_id'] }, { name: 'departments', rows: 13, columns: ['id', 'name'] }, { name: 'companies', rows: 1, columns: ['id', 'name'] }] },
  { name: 'three-people', bytes: 4_200, tables: [{ name: 'employees', rows: 3, columns: ['id', 'first_name', 'last_name', 'work_email'] }] },
]
export const fixturePeople = ['Avery', 'Blake', 'Casey', 'Devon'].map((n, index) => ({ index, label: `${n} Sample · ${n.toLowerCase()}.sample@northwind.example · 00000000-0000-4000-8000-00000000000${index + 1}`, values: { id: `00000000-0000-4000-8000-00000000000${index + 1}`, work_email: `${n.toLowerCase()}.sample@northwind.example` } }))

export const mockEndpointsSample: import('../engine').MockEndpoint[] = [
  { key: 'start', method: 'POST', path: '/workflows/run', what: 'A job id for the people sent', real: null, files: [], data: none },
  { key: 'status', method: 'GET', path: '/workflows/runs/{id}/status', what: 'Running, then completed', real: null, files: [], data: none },
  { key: 'links', method: 'GET', path: '/workflows/runs/{id}/links', what: 'Where to fetch the results', real: null, files: [], data: none },
  { key: 'results', method: 'GET', path: 'the results file, by the link the service sends', what: 'One row for each person sent, with what was found', follows: 'links', linkField: 'download_url', real: { at: '2026-11-18T15:20:00Z', how: 'given' }, files: ['results.csv'], data: { app: resultsItem, task: null, faked: { app: true, task: null } } },
]
/** Made up: a call marked sensitive. Its real response was faked as it arrived and not kept. */
export const sensitiveEndpoint: import('../engine').MockEndpoint = { key: 'profile', method: 'GET', path: '/people/{id}/profile', what: 'Who the person is: name, home address, family', sensitive: true, real: null, files: ['profile.json'], data: { app: { recorded: null, safe: { kind: 'faked', set: 'faked-profile', files: ['profile.json'], note: 'Faked from a real response that was not kept, because this call is marked sensitive: its structure is real, and 41 values were replaced. Checked 22 Nov 2026: none of the 41 values of that response is in it.' } }, task: null } }
/** Made up: a call with a real response that has no fake yet, so nothing of it is served. */
export const unfakedEndpoint: import('../engine').MockEndpoint = { key: 'cost', method: 'GET', path: '/workflows/runs/{id}/cost', what: 'What the run cost', real: { at: '2026-11-22T09:00:00Z', how: 'given' }, files: [], data: { app: { recorded: { id: 'app_sample/iss_sample1/fraud-scan/given-2026-11-22', at: '2026-11-22T09:00:00Z', how: 'given', files: ['cost.json'] }, safe: null }, task: null } }
/** Made up: the data one mock can answer with, one of each kind. */
export const mockDataSample: import('../engine').MockData[] = [
  { key: 'faked', name: 'Faked from the real response (sample)', kind: 'faked', files: [{ path: 'results.csv', bytes: 84_210 }], provenance: { from: { at: '2026-11-18T15:20:00Z', given: true, files: 1 }, faked: { replaced: 2_610, kept: 304 }, kept: ['completed', 'running', 'high', 'low'], checked: { at: '2026-11-20T10:00:00Z', files: 1, values: 2_914, against: 1 } }, note: 'Faked from a real response the person gave 18 Nov 2026: its structure is real, and 2610 values were replaced. Kept as they were, because they are structure: "completed", "running", "high", "low". Checked 20 Nov 2026: none of the 2914 values of that response is in it.', shareable: true, isDefault: true, issueId: 'iss_sample1', updatedAt: '2026-11-20T10:00:00Z' },
  { key: 'nothing-found', name: 'Someone with nothing found (sample)', kind: 'invented', files: [{ path: 'results.csv', bytes: 1_920 }], provenance: { checked: { at: '2026-11-20T10:30:00Z', files: 1, values: 2_914, against: 1 } }, note: 'Written by hand, invented. Checked 20 Nov 2026: none of the 2914 values of that response is in it.', shareable: true, isDefault: false, issueId: 'iss_sample2', updatedAt: '2026-11-20T10:30:00Z' },
  { key: 'real', name: 'The real response (sample)', kind: 'real', files: [], provenance: { from: { at: '2026-11-18T15:20:00Z', given: true, files: 1 } }, note: 'A real response the person gave 18 Nov 2026, served as it is. On this computer only: never exported, never shared.', shareable: false, isDefault: false, issueId: 'iss_sample1', updatedAt: '2026-11-18T15:20:00Z' },
]
export const mocks: import('../engine').Mock[] = [
  { key: 'fraud-scan', name: 'Fraud scan vendor (sample)', status: 'mined', served: 'written', pointed: true, standsInFor: 'Fraud scan vendor workflow 0a1b2c, results CSV (sample)', upstream: 'https://api.fraud-scan.example', env: { FRAUD_SCAN_BASE_URL: '{container_url}' }, cmd: 'python3 server.py',
    files: [{ path: 'server.py', bytes: 6_120 }],
    provenance: { minedFrom: 'one person, 12 profiles, 9 scams, 2 doxxing posts (sample)', real: 'the 62 columns of the results CSV, its nesting and formats', invented: 'every value', covers: ['someone with nothing found', 'someone with one of each finding', 'someone with a lot (40 profiles, 30 scams)'], cannotShow: ['the vendor\'s queue under load (a scan finishes in two seconds)'], kept: ['completed', 'running'], checked: { at: '2026-11-20T10:00:00Z', files: 9, values: 2914 } },
    note: minedNote, needs: null, issue: { id: 'iss_sample1', identifier: 'SS-1', title: 'Checkout on one page' }, recordedAt: '2026-11-18T15:20:00Z', minedAt: '2026-11-20T10:00:00Z', unmined: null, usedBy: ['Prototype: Findings page (sample)', 'Main'], defaultData: 'faked', data: mockDataSample, endpoints: mockEndpointsSample, unlinked: [], connection: { address: 'https://api.fraud-scan.example', addressSetting: 'FRAUD_SCAN_BASE_URL', keySetting: 'FRAUD_SCAN_API_KEY', others: { FRAUD_SCAN_WORKFLOW: 'wf_sample' } } },
  { key: 'breach-api', name: 'Breach lookup (sample)', status: 'assumed', served: 'written', pointed: true, standsInFor: 'Breach lookup API v2, /search (sample)', upstream: null, env: { BREACH_API_URL: '{url}' }, cmd: 'node server.mjs',
    files: [{ path: 'server.mjs', bytes: 2_400 }],
    provenance: { real: 'nothing: the shape is assumed', invented: 'every value', covers: ['an address with no breaches', 'an address in three breaches'], cannotShow: ['any field the documentation leaves out'] },
    note: '# Breach lookup (sample): a mock\n\nStands in for: Breach lookup API v2, /search (sample).\n\nMined from: nothing. Its shape is assumed, written before any real response was recorded; it shows only that the code handles the guess.\n', needs: null, issue: null, recordedAt: null, minedAt: null, unmined: null, usedBy: [], defaultData: 'two-breaches', data: [{ key: 'two-breaches', name: 'An address in two breaches (sample)', kind: 'invented', files: [{ path: 'search.json', bytes: 1_840 }], provenance: { stated: { by: 'user', at: '2026-11-20T11:00:00Z' } }, note: 'Provided by a person, who states it holds nothing real. Not checked: there is no real response of this service on this computer to check it against.', shareable: true, isDefault: true, issueId: null, updatedAt: '2026-11-20T11:00:00Z' }], endpoints: [{ key: 'search', method: 'GET', path: '/v2/search', what: 'The breaches an address is in', real: null, files: ['search.json'], data: { app: { recorded: null, safe: { kind: 'provided', set: 'two-breaches', files: ['search.json'], note: 'Provided by a person, who states it holds nothing real. Not checked: there is no real response of this service on this computer to check it against.' } }, task: null } }], unlinked: [], connection: { address: null, addressSetting: 'BREACH_API_URL', keySetting: null, others: {} } },
  { key: 'address-lookup', name: 'Address lookup (sample)', status: 'needs_recording', served: 'general', pointed: true, standsInFor: 'Address lookup v1 (sample)', upstream: 'https://api.address-lookup.example', env: { ADDRESS_LOOKUP_URL: '{container_url}' }, cmd: null, files: [], provenance: {},
    note: '# Address lookup (sample): a mock\n\nServed by the general server, straight from its endpoints.\n',
    needs: null, issue: { id: 'iss_sample2', identifier: 'SS-2', title: 'Totals and analytics' }, recordedAt: null, minedAt: null, unmined: null, usedBy: [], defaultData: null, data: [], endpoints: [{ key: 'lookup', method: 'GET', path: '/v1/lookup', what: 'The address a finding points at', real: null, files: [], data: none }], unlinked: [], connection: { address: 'https://api.address-lookup.example', addressSetting: 'ADDRESS_LOOKUP_URL', keySetting: null, others: {} } },
]

/** Made up: what each place is given for each sample service, as the app has it (no task has changed anything). */
const placeOf = (mock: string, name: string, place: import('../engine').MockPlace, p: Partial<import('../engine').MockPlan>): import('../engine').MockPlan => ({ mock, name, place, how: 'data', form: 'faked', real: false, choice: { source: 'default' }, from: 'none', says: 'The mock, with faked data', own: null, app: null, ...p })
const recordedSays = 'The mock, with the real response for 1 of its 4 calls: this computer only'
const three = (mock: string, name: string, p: Partial<import('../engine').MockPlan>, review: Partial<import('../engine').MockPlan> = {}) => ({ prototype: placeOf(mock, name, 'prototype', p), smoke: placeOf(mock, name, 'smoke', p), review: placeOf(mock, name, 'review', { ...p, ...review }) })
export const realSays = recordedSays
export const mockPlaces: import('../engine').MockPlacesRow[] = [
  { mock: 'fraud-scan', name: 'Fraud scan vendor (sample)', status: 'mined', canLive: true, real: '2026-11-18T15:20:00Z',
    places: {
      prototype: placeOf('fraud-scan', 'Fraud scan vendor (sample)', 'prototype', {}),
      smoke: placeOf('fraud-scan', 'Fraud scan vendor (sample)', 'smoke', {}),
      review: placeOf('fraud-scan', 'Fraud scan vendor (sample)', 'review', {}),
    } },
  { mock: 'breach-api', name: 'Breach lookup (sample)', status: 'assumed', canLive: false, real: null, places: three('breach-api', 'Breach lookup (sample)', { says: 'The mock, with provided data' }) },
  { mock: 'address-lookup', name: 'Address lookup (sample)', status: 'needs_recording', canLive: true, real: null, places: three('address-lookup', 'Address lookup (sample)', { how: 'own', says: 'The mock, with no data yet: a call to it fails until its endpoint has data' }) },
]
/** Made up: the same for one task, which calls the real vendor in its smoke test. Its prototype and its reviewer follow the app. */
export const mockPlacesForTask: import('../engine').MockPlacesRow[] = [
  { ...mockPlaces[0], places: {
    prototype: mockPlaces[0].places.prototype,
    smoke: placeOf('fraud-scan', 'Fraud scan vendor (sample)', 'smoke', { how: 'live', record: true, form: undefined, says: 'The real Fraud scan vendor (sample), every run; what it sends is kept', choice: { source: 'live' }, from: 'task', own: { source: 'live' }, app: null }),
    review: mockPlaces[0].places.review,
  } },
  mockPlaces[1], mockPlaces[2],
]
/** Made up: what changed on one mock. */
export const mockChanges: import('../engine').MockChange[] = [
  { at: '2026-11-21T09:10:00Z', by: 'you', issue: null, what: 'The call "results" is answered with its real response, in a person\'s own runs' },
  { at: '2026-11-21T09:08:00Z', by: 'you', issue: null, what: 'For a reviewer: the mock' },
  { at: '2026-11-20T10:30:00Z', by: 'an agent', issue: { id: 'iss_sample2', identifier: 'SS-2' }, what: 'Data "nothing-found" (invented) was saved' },
  { at: '2026-11-20T10:00:00Z', by: 'an agent', issue: { id: 'iss_sample1', identifier: 'SS-1' }, what: 'Data "faked" (faked) was saved' },
  { at: '2026-11-20T09:55:00Z', by: 'an agent', issue: { id: 'iss_sample1', identifier: 'SS-1' }, what: 'Its server was built from a real response' },
  { at: '2026-11-18T15:20:00Z', by: 'the engine', issue: { id: 'iss_sample1', identifier: 'SS-1' }, what: 'A real response came in' },
]

/** Made up: what one task calls outside the app. Three calls to a vendor that has a mock (one answered from a real response, two from the code), one the mock lacks, one to a service whose mock is not built. */
const fraudMock = { key: 'fraud-scan', name: 'Fraud scan vendor (sample)', status: 'mined' as const }
export const taskCalls: import('../engine').TaskCall[] = [
  { id: 'tcall_s1', service: 'fraud-scan', serviceName: 'Fraud scan vendor (sample)', method: 'POST', path: '/workflows/run', what: 'A job id for the employees sent', by: 'agent', state: 'answered', mock: fraudMock, endpoint: mockEndpointsSample[0], linked: false },
  { id: 'tcall_s2', service: 'fraud-scan', serviceName: 'Fraud scan vendor (sample)', method: 'GET', path: '/workflows/runs/{id}/status', what: 'Running, then completed; this task also shows a run that failed', by: 'agent', state: 'answered', mock: fraudMock, endpoint: mockEndpointsSample[1], linked: false },
  { id: 'tcall_s3', service: 'fraud-scan', serviceName: 'Fraud scan vendor (sample)', method: 'GET', path: 'the results file, by the link the service sends', what: 'One row for each employee sent: someone with nothing found, someone with a lot', by: 'agent', state: 'answered', mock: fraudMock, endpoint: { ...mockEndpointsSample[3], data: { app: resultsItem, task: { recorded: null, safe: { kind: 'provided', set: 'provided-results-task', files: ['results.csv'], note: 'Provided by a person, who states it holds nothing real. Checked 21 Nov 2026: none of the 2914 values of that response is in it.' } } } }, linked: false },
  { id: 'tcall_s4', service: 'fraud-scan', serviceName: 'Fraud scan vendor (sample)', method: 'GET', path: '/workflows/runs/{id}/cost', what: 'What the run cost, shown beside the findings', by: 'user', state: 'no_endpoint', mock: fraudMock, endpoint: null, linked: false },
  { id: 'tcall_s5', service: 'address-lookup', serviceName: 'Address lookup (sample)', method: 'GET', path: '/v1/lookup', what: 'The address a finding points at', by: 'agent', state: 'answered', mock: { key: 'address-lookup', name: 'Address lookup (sample)', status: 'needs_recording' }, endpoint: { key: 'lookup', method: 'GET', path: '/v1/lookup', what: 'The address a finding points at', real: null, files: [], data: none }, linked: false },
]

/** Made up: the real responses of one service on this computer. One is this mock's; one was left by a mock that was removed. */
export const mockReal: import('../engine').MockReal[] = [
  { id: 'app_sample/iss_sample1/fraud-scan/given-2026-11-18', at: '2026-11-18T15:20:00Z', given: true, files: [{ name: 'results.csv', bytes: 384_000 }], before: false, issueId: 'iss_sample1' },
  { id: 'app_sample/iss_sample1/fraud-scan/given-2026-11-10', at: '2026-11-10T09:00:00Z', given: true, files: [{ name: 'export.csv', bytes: 120_500 }], before: true, issueId: 'iss_sample1' },
]

/** Made up: the services that task calls, each one of the app's, with its calls. The last has no call listed yet. */
export const taskServices: import('../engine').TaskService[] = [
  { key: 'fraud-scan', name: 'Fraud scan vendor (sample)', standsInFor: 'Fraud scan vendor workflow 0a1b2c, results CSV (sample)', status: 'mined', foundFor: 'SS-1', calls: taskCalls.filter((c) => c.service === 'fraud-scan') },
  { key: 'address-lookup', name: 'Address lookup (sample)', standsInFor: 'Address lookup v1 (sample)', status: 'needs_recording', foundFor: 'SS-2', calls: taskCalls.filter((c) => c.service === 'address-lookup') },
  { key: 'breach-api', name: 'Breach lookup (sample)', standsInFor: 'Breach lookup API v2, /search (sample)', status: 'assumed', foundFor: null, calls: [] },
]


/** A task's review copy, not made yet: everything it would hold is made up, so it can be (sample). */
export const reviewCopySample: import('../engine').ReviewCopyView = {
  branch: 'REVIEW-edges-that-tunnel-SS-20', pr: { branch: 'SS-20-edges-that-tunnel', head: '4f1c2aa9d0b7e6c5a4f3e2d1c0b9a8f7e6d5c4b3', number: 41 },
  made: null, byHand: false, compare: 'https://github.com/sample-org/sample-app/compare/SS-20-edges-that-tunnel...REVIEW-edges-that-tunnel-SS-20',
  kit: { dir: '/sample/tools/review', start: './review/start.sh' }, fixtures: ['Meridian (sample)', 'Two teams (sample)'],
  services: [{ key: 'vendor', name: 'Sample Vendor', says: 'The mock, with faked data', blocked: null }], waits: [],
}
/** The same, made and pushed, on the pull request's head (sample). */
export const reviewCopyMadeSample: import('../engine').ReviewCopyView = {
  ...reviewCopySample,
  made: { from: '4f1c2aa9d0b7e6c5a4f3e2d1c0b9a8f7e6d5c4b3', fixture: null, try: 'Import `review/files/people.csv` (one made-up person) and start a scan.\nOpen that person: the findings card shows each finding (sample).', services: [{ key: 'vendor', name: 'Sample Vendor', files: 3 }], files: ['people.csv'], at: '2026-11-23T15:00:00.000Z', sha: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b', pushed: true, inStep: true },
}

/** A task's data agent, never asked (sample). */
export const dataAgentSample: import('../engine').DataAgentView = { state: 'none', step: 1, proposal: null, approved: [], asked: null, change: null, sessionId: null, busy: false }
const dataAsked = { text: 'The change sends each imported person to Sample Vendor for a scan and reads the results back (sample).', by: 'the task\'s agent', at: '2026-11-23T15:00:00.000Z' }
const dataStep1: import('../engine').DataProposal = { step: 1, services: [], at: '2026-11-23T15:04:00.000Z', summary: '**Sample Vendor** (`vendor`), three calls:\n\n- `POST /runs`: starts a scan for the people sent; must return a run id.\n- `GET /runs/{id}`: the run\'s status; must show running, then done.\n- `GET /runs/{id}/results`: a link to the results file; must cover a person with findings and one with none.\n\nNot sure of: whether a failed run is also read (sample).' }
const dataStep2: import('../engine').DataProposal = { step: 2, services: ['vendor'], at: '2026-11-23T15:20:00.000Z', summary: '**Sample Vendor**\n\n| Call | What answers it | Made from |\n|---|---|---|\n| `POST /runs` | made-up data I write | the client code: nothing real to be had |\n| `GET /runs/{id}` | made-up data I write | the client code |\n| `GET /runs/{id}/results` | a fake of a real response | **a results file you give on that call**; it holds people\'s details, so I mark it sensitive |\n\n**A file for the tester**: `people.csv`, one made-up person to import.\n\n**Database**: starts empty; no fixture needed (sample).' }
const dataStep3: import('../engine').DataProposal = { step: 3, services: [], at: '2026-11-23T15:41:00.000Z', summary: 'Built for **Sample Vendor**: its three endpoints; made-up data for `POST /runs` and `GET /runs/{id}`; `people.csv` (one made-up person).\n\n**Still yours to do**: give the results file on `GET /runs/{id}/results`. Until then that call has nothing to answer with (sample).' }
/** Asked, and working on its first step (sample). */
export const dataAgentWorkingSample: import('../engine').DataAgentView = { state: 'working', step: 1, proposal: null, approved: [], asked: dataAsked, change: null, sessionId: 'session_data_sample', busy: true }
/** Stopped after step 1: the calls it found wait for the person (sample). */
export const dataAgentStep1Sample: import('../engine').DataAgentView = { ...dataAgentWorkingSample, state: 'proposed', proposal: dataStep1, busy: false }
/** Stopped after step 2: where each call's data will come from (sample). */
export const dataAgentStep2Sample: import('../engine').DataAgentView = { ...dataAgentWorkingSample, state: 'proposed', step: 2, proposal: dataStep2, approved: [dataStep1], busy: false }
/** Stopped after step 3: what it built, and what is still the person's to do (sample). */
export const dataAgentStep3Sample: import('../engine').DataAgentView = { ...dataAgentWorkingSample, state: 'proposed', step: 3, proposal: dataStep3, approved: [dataStep1, dataStep2], busy: false }
/** All three approved (sample). */
export const dataAgentDoneSample: import('../engine').DataAgentView = { ...dataAgentWorkingSample, state: 'done', step: 3, proposal: null, approved: [dataStep1, dataStep2, dataStep3], busy: false }

// A pull request's finalizing (made up): run on the head, two breaks no test caught, one check of the gate failing.
const sampleEvidence = '**Tests written by this pull request:** 3 unit, 1 integration. All pass.\n\n**Red before green:** 4 of 4 were run and seen to fail on an assertion before the code that makes them pass was written, then seen to pass.\n\n**Mutation testing:** of 12 meaningful breaks made to the lines this pull request changed, the tests catch 10 (83%).\n\nNot caught:\n- `src/export/rows.ts:41`: `<=` became `<`. No test checks the value exactly at this limit.\n- `src/export/rows.ts:58`: `&&` became `||`. The tests pass when either condition alone is enough.\n\n**Everything else:** Tests, Lint all pass on this branch: nothing else broke.'
export const finalizeSample: import('../engine').FinalizeView = {
  state: 'done', sha: 'abc1234def0', head: 'abc1234def0', stale: false, error: null,
  steps: [
    { key: 'trajectory', name: 'The trajectory holds', state: 'pass', says: 'All 4 planned tests were seen red, then green.' },
    { key: 'mutation', name: 'Mutation testing of the changed lines', state: 'fail', says: 'Of 12 meaningful breaks, the tests catch 10 (83%). 2 not caught. 1 left out as equivalent.' },
    { key: 'review', name: 'The review copy, built on the head', state: 'pass', says: 'Built on abc1234 with nothing real in it (1 service faked), and not sent: REVIEW-export-SS-20 goes to GitHub when you push.' },
    { key: 'gate', name: 'The gate checks', state: 'fail', says: '1 of 6 stand in the way.' },
    { key: 'evidence', name: 'The evidence drafted', state: 'pass', says: 'Drafted from what was measured. It is sent only when you push.' },
  ],
  unproven: [],
  mutation: { tool: 'evident', found: 14, tried: 14, caught: 10, invalid: 1, files: 2, tests: ['src/export/rows.test.ts'], meaningful: 12, percent: 83, survivors: [
    { id: 'sv_1', file: 'src/export/rows.ts', line: 41, op: 'boundary', from: '<=', to: '<', means: 'no test checks the value exactly at this limit: the code behaves the same to them whether `<=` lets it through or not', code: 'if (rows.length <= limit) return rows (sample)', accepted: null, fix: null },
    { id: 'sv_2', file: 'src/export/rows.ts', line: 58, op: 'logic', from: '&&', to: '||', means: 'the tests pass when either condition alone is enough: no test has one true and the other false', code: 'if (order.paid && order.shipped) out.push(order) (sample)', accepted: null, fix: null },
    { id: 'sv_3', file: 'src/export/limits.ts', line: 3, op: 'number', from: '500', to: '501', means: 'the tests pass with 501 here in place of 500: nothing pins the number', code: 'export const PAGE_SIZE = 500 (sample)', equivalent: 'a limit nudged by one: no input sits exactly on it, so nothing a test does can tell', accepted: null, fix: null },
  ] },
  gate: [
    { key: 'github', name: 'GitHub\'s checks are green', state: 'pass', says: '3 pass.', sent: null },
    { key: 'commands', name: 'The app\'s held commands pass on the head', state: 'pass', says: 'Tests, Lint: all pass.', sent: null },
    { key: 'title', name: 'The title fits the app\'s rule and carries the team\'s ticket', state: 'pass', says: '"feat(export)[SHOP-12]: Export orders (sample)" fits {type}{scope}[{ticket}]: {title}', sent: null },
    { key: 'description', name: 'The description follows the app\'s form, every section filled, nothing of ours above the fold', state: 'fail', says: '"Merge Danger" has nothing under it.', sent: null },
    { key: 'rollback', name: 'The rollback agrees with the blast radius', state: 'pass', says: 'The blast radius names no one-way door, and the description claims nothing it does not.', sent: null },
    { key: 'smoke', name: 'Your smoke checks are done', state: 'pass', says: 'Accepted, on this commit.', sent: null },
  ],
  evidence: sampleEvidence, sent: null,
  canStart: true, startWaits: null, press: 'ready', canPush: false,
  pushWaits: ['The description follows the app\'s form, every section filled, nothing of ours above the fold: "Merge Danger" has nothing under it.'],
}
/** The same with the gate passing (made up): the press is there to make. */
export const finalizeReadySample: import('../engine').FinalizeView = { ...finalizeSample, steps: finalizeSample.steps.map((s) => (s.key === 'gate' ? { ...s, state: 'pass' as const, says: 'All 6 pass.' } : s)), gate: finalizeSample.gate.map((c) => (c.key === 'description' ? { ...c, state: 'pass' as const, says: 'Every section of the app\'s form is there, in order, and filled.' } : c)), canPush: true, pushWaits: [] }
/** Never run (made up): the smoke test has not been accepted. */
export const finalizeNoneSample: import('../engine').FinalizeView = { ...finalizeSample, state: 'none', sha: null, steps: finalizeSample.steps.map((s) => ({ ...s, state: 'waiting' as const, says: '' })), mutation: null, evidence: '', canPush: false, gate: finalizeSample.gate.map((c) => (c.key === 'smoke' ? { ...c, state: 'fail' as const, says: 'The smoke test has not been accepted.' } : c)), pushWaits: ['The finalizing has not run: accept the smoke test, or run it here.', 'Your smoke checks are done: The smoke test has not been accepted.'] }

/** An app's workbench folder with one hook written (made up: the folder, the script and its run). */
const hookPoints: Pick<import('../engine').HookView, 'point' | 'when' | 'given' | 'then'>[] = [
  { point: 'before-start', when: 'Before a prototype or a smoke test starts, once its database is built.', given: ['PLACE', 'FIXTURE', 'DATABASE_URL', 'PORT', 'TASK'], then: 'Lines it prints as NAME=value are given to the start script. If it fails, nothing starts.' },
  { point: 'after-stop', when: 'After a prototype or a smoke test is stopped.', given: ['PLACE', 'DATABASE_URL', 'TASK'], then: 'Nothing waits on it. A failure is shown here.' },
  { point: 'task-closed', when: 'When a task is closed.', given: ['TASK', 'BRANCH'], then: 'Nothing waits on it. A failure is shown here.' },
]
export const workbenchSample: import('../engine').WorkbenchView = {
  dir: '/Users/sample/code/sample-workbench', found: true,
  hooks: hookPoints.map((h) => h.point === 'before-start'
    ? { ...h, file: 'hooks/before-start.sh', text: '#!/bin/sh\n# Sign the tester in as the one company in the database (sample).\necho "DEMO_COMPANY_ID=$(psql "$DATABASE_URL" -Atc \'select id from companies limit 1\')"\n', last: { at: '2026-11-24T16:02:00.000Z', ok: true, task: 'SS-20', place: 'smoke', out: [], gave: ['DEMO_COMPANY_ID'] } }
    : { ...h, file: null, text: null, last: null }),
  also: [{ what: 'The review kit', path: 'tools/review' }],
}
export const workbenchNoneSample: import('../engine').WorkbenchView = { dir: null, found: false, hooks: hookPoints.map((h) => ({ ...h, file: null, text: null, last: null })), also: [] }
export const workbenchFailedSample: import('../engine').WorkbenchView = { ...workbenchSample, hooks: workbenchSample.hooks.map((h) => h.point === 'before-start' ? { ...h, last: { at: '2026-11-24T16:05:00.000Z', ok: false, task: 'SS-20', place: 'smoke', out: ['psql: error: relation "companies" does not exist (sample)', 'exited with 1'] } } : h) }
/**
 * Made up: the Context of the sample task, idea and project (docs/context-brief.md). The task is in a project, so it
 * also sees the project's; one decision waits for the person and one was rejected.
 */
const otherTicket: import('../engine').OriginView = {
  id: 'origin_sample2', source: 'linear', sourceName: 'Linear', ref: 'SHOP-37', url: 'https://linear.app/example/issue/SHOP-37', title: 'Remove a saved card (sample)',
  body: 'A customer can remove a card from their account page. It must be gone from the checkout too.', comments: [], links: [], files: [], fetchedAt: '2026-11-22T09:00:00Z',
}
const vaultNotes = '## What the vault returns (made up)\n\n- `last4`, `expiry`, `brand`\n- Never the full number, never the security code\n\nA card is removed with `DELETE /cards/:id`. A removed card cannot be brought back.'
const ctxDoc = (d: Partial<import('../engine').ContextDoc> & { id: string; title: string }): import('../engine').ContextDoc => ({ description: null, from: 'pasted', ticket: null, fileName: null, body: null, chars: (d.body ?? '').length, inFull: false, addedBy: 'user', addedAt: '2026-11-22T10:00:00Z', fromProject: false, ...d })
const ctxNote = (n: Partial<import('../engine').ContextNote> & { id: string; title: string }): import('../engine').ContextNote => ({ kind: 'note', status: 'settled', answer: null, body: '', on: '2026-11-22', addedBy: 'user', fromProject: false, alsoAbout: [], ...n })
export const contextLimits = { doc: 200_000, inFull: 20_000 }
export const taskContext: import('../engine').ContextView = {
  on: 'task', project: { id: 'proj_checkout', name: 'One-page checkout (sample)' }, limits: contextLimits,
  docs: [
    ctxDoc({ id: 'origin_sample1', title: 'Saved cards at checkout (sample)', from: 'ticket', ticket: { originating: true, origin: sampleOrigin }, chars: 900, inFull: true, addedAt: '2026-11-20T12:00:00Z' }),
    ctxDoc({ id: 'cdoc_sample1', title: 'Card vault API notes (sample)', description: 'What the payment provider returns for a saved card, and what it never returns.', body: vaultNotes, addedAt: '2026-11-22T10:00:00Z' }),
    ctxDoc({ id: 'cdoc_sample2', title: 'Support requests about saved cards (sample)', description: 'Forty made-up requests from customers asking to pay with a card they used before.', from: 'file', fileName: 'support-export.md', body: 'Request 1 (made up): "Why do I have to type my card every time?"\n\nRequest 2 (made up): "Please remember my card."', chars: 38_400, addedBy: 'agent', addedAt: '2026-11-23T14:00:00Z' }),
    ctxDoc({ id: 'origin_sample2', title: 'Remove a saved card (sample)', from: 'ticket', ticket: { originating: false, origin: otherTicket }, chars: 120, addedAt: '2026-11-22T09:00:00Z' }),
    ctxDoc({ id: 'cdoc_proj1', title: 'Checkout design principles (sample)', description: 'The four rules the one-page checkout is designed to.', body: '1. One page, no steps.\n2. Nothing asked twice.\n3. The total is always in view.\n4. An error is said beside what caused it.', inFull: true, fromProject: true, addedAt: '2026-11-18T10:00:00Z' }),
  ],
  notes: [
    ctxNote({ id: 'note_ctx1', kind: 'decision', status: 'proposed', title: 'Which saved cards are offered? (sample)', answer: 'Only the ones used in the last 12 months', body: 'Older ones are often expired, and the vault charges to check each.', on: '2026-11-24', addedBy: 'agent' }),
    ctxNote({ id: 'note_ctx2', kind: 'decision', title: 'What is shown of a saved card? (sample)', answer: 'Its last four digits and its expiry, nothing more', background: 'Design first drew the whole number, masked. Made up.', body: 'The vault never returns more, and support asked for no more.', on: '2026-11-21' }),
    ctxNote({ id: 'note_ctx3', kind: 'decision', title: 'What happens to a card when it is removed? (sample)', answer: 'It is deleted at the provider, not hidden here', on: '2026-11-23', addedBy: 'agent' }),
    ctxNote({ id: 'note_ctxp1', kind: 'decision', title: 'Is the checkout one page on a phone too? (sample)', answer: 'Yes', on: '2026-11-18', fromProject: true }),
    ctxNote({ id: 'note_ctx4', kind: 'decision', status: 'rejected', title: 'Is a card saved without asking? (sample)', answer: 'Yes, every card', body: 'One less box to tick.', on: '2026-11-22', addedBy: 'agent' }),
    ctxNote({ id: 'note_ctx7', kind: 'decision', status: 'open', title: 'What is shown when a saved card has expired? (sample)', on: '2026-11-24', dependsOn: [{ id: 'note_ctx8', title: 'Can a card saved in the app be used on the web? (sample)', answer: null, status: 'open' }, { id: 'note_ctx2', title: 'What is shown of a saved card? (sample)', answer: 'Its last four digits and its expiry, nothing more', status: 'settled' }] }),
    ctxNote({ id: 'note_ctx8', kind: 'decision', status: 'open', title: 'Can a card saved in the app be used on the web? (sample)', waitingOn: 'Em', on: '2026-11-20', neededBy: [{ id: 'note_ctx7', title: 'What is shown when a saved card has expired? (sample)' }], background: 'The ticket does not say. Support is asked about it most weeks, and the vault API notes above are silent on it.', options: '(a) Yes: join the two vaults, so a card saved in one is there in the other.\n\n(b) No: the app and the web keep their own cards.\n\nRecommendation: (b) for this task; Em knows whether (a) is possible.' }),
    ctxNote({ id: 'note_ctx5', title: 'Talked with Em about mobile (sample)', body: 'Support hears the same request from people on phones.\n\nOutcome: mobile gets a ticket of its own; not done under this task.', on: '2026-11-23', alsoAbout: [{ id: 'iss_sample5', name: 'SS-5', title: 'Submit an order (sample)' }] }),
    ctxNote({ id: 'note_ctx6', title: 'The vault is slow on its first call (sample)', body: 'About two seconds, then fast. Found while reading its guide.', on: '2026-11-22', addedBy: 'agent' }),
  ],
}
/** An idea that came from a ticket and has had nothing added: the ticket is its one reference doc. */
export const ideaContext: import('../engine').ContextView = { on: 'idea', project: null, limits: contextLimits, docs: [taskContext.docs[0]], notes: [] }
/** A project's own: what its tasks see as "from the project". */
export const projectContext: import('../engine').ContextView = { on: 'project', project: null, limits: contextLimits, docs: taskContext.docs.filter((d) => d.fromProject).map((d) => ({ ...d, fromProject: false })), notes: taskContext.notes.filter((n) => n.fromProject).map((n) => ({ ...n, fromProject: false })) }
/** Made here, from nothing outside, and nothing added yet. */
export const emptyContext: import('../engine').ContextView = { on: 'task', project: null, limits: contextLimits, docs: [], notes: [] }

/** Made-up tickets of the sample team, each with the tasks under it: one bigger than a pull request and part built, one known by its key alone, one finished. */
export const tickets: import('../engine').TicketGroup[] = [
  { key: 'SHOP-323', title: 'Protected people (sample)', url: 'https://linear.app/sample-shop/issue/SHOP-323/protected-people', source: 'linear', read: true, done: 1, total: 3, finished: false, tasks: [
    { id: 'iss_sample40', identifier: 'SS-40', title: 'SHOP-323, first: the group stored (sample)', teamTitle: 'The protected group, stored (sample)', state: 'done', from: 'set', project: { id: 'proj_checkout', name: 'Executive protection (sample)' }, pr: { number: 31, url: 'https://example.com/sample-shop/pull/31', status: 'merged' } },
    { id: 'iss_sample41', identifier: 'SS-41', title: 'Add and remove on the employee record (sample)', teamTitle: null, state: 'in_review', from: 'set', project: { id: 'proj_checkout', name: 'Executive protection (sample)' }, pr: { number: 32, url: 'https://example.com/sample-shop/pull/32', status: 'open' } },
    { id: 'iss_sample42', identifier: 'SS-42', title: 'Badge, filter and row menu on Employees (sample)', teamTitle: null, state: 'todo', from: 'link', project: { id: 'proj_checkout', name: 'Executive protection (sample)' }, pr: null },
    { id: 'iss_sample43', identifier: 'SS-43', title: 'Bulk add from a file (sample)', teamTitle: null, state: 'canceled', from: 'set', project: null, pr: null },
  ] },
  { key: 'SHOP-330', title: null, url: null, source: null, read: false, done: 0, total: 1, finished: false, tasks: [
    { id: 'iss_sample44', identifier: 'SS-44', title: 'Takedown requests (sample)', teamTitle: null, state: 'in_progress', from: 'link', project: null, pr: null },
  ] },
  { key: 'SHOP-301', title: 'Faster product images (sample)', url: 'https://linear.app/sample-shop/issue/SHOP-301/faster-product-images', source: 'linear', read: true, done: 2, total: 2, finished: true, tasks: [
    { id: 'iss_sample45', identifier: 'SS-45', title: 'Image sizes on upload (sample)', teamTitle: null, state: 'done', from: 'import', project: null, pr: { number: 20, url: 'https://example.com/sample-shop/pull/20', status: 'merged' } },
    { id: 'iss_sample46', identifier: 'SS-46', title: 'Product page uses the sizes (sample)', teamTitle: null, state: 'done', from: 'set', project: null, pr: { number: 22, url: 'https://example.com/sample-shop/pull/22', status: 'merged' } },
  ] },
]

// An app's docs site (made up): running, framed at an empty page here since no site runs beside Storybook.
export const docsSiteSample: import('../engine').DocsSite = { dir: '/Users/sample/code/shop-workbench', found: true, has: true, problem: null, url: 'http://localhost:6912', frame: 'about:blank', up: true, startedHere: false, log: [] }
