/**
 * The engine's schema. Git holds code; this holds all state; the engine is the single writer.
 * From research/parallel-engine.md §5: [LS] Lightsprint-derived, [ID] InDusk run-the-graph, [IF] ours.
 *
 * Shaped like Linear (Sandy, 2026-10-27: "we build ours to match Linear and then we can slip it in"), so a connected
 * Linear workspace can hold the plan instead of these tables:
 * - initiative: a goal, long term; projects serve it.  cycle: a stretch of time, this week or sprint.
 * - project: issues in order, one branch and one PR (or a PR per issue, stacked).
 * - issue: the one unit of work. `kind` says whether it is code (planned into sub-issues the builder runs, landed on a
 *   branch) or a to-do (work outside the code). A sub-issue has a parent: under code, the atomic unit one agent builds
 *   in one worktree; under a to-do, a line of its checklist. An issue in the `backlog` state of a project is something
 *   the project must cover before it lands.
 * - issue_relation: blocks (task order inside a project is implicit), related, duplicate.
 * What Linear has no place for stays ours either way, keyed by issue id: `build` (the engine's execution of a code
 * sub-issue: status, attempts, worktree), file claims, runs and their steps, questions, decisions, PRs, evidence.
 *
 * IDs are prefixed short strings (ids.ts). State tables are the truth; `event` is the append-only log and live feed.
 * Every row below an app carries `app_id`, required, and a composite foreign key ties it to its parent's app, so a row
 * can never claim a different app than the thing it belongs to. Scoping is `where app_id = ?` everywhere.
 */
import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp,
  uniqueIndex, type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const id = () => text('id').primaryKey()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const at = (name: string) => timestamp(name, { withTimezone: true })
// Literal values, not parameters: this text ends up in DDL.
const inList = (name: string, col: any, values: readonly string[]) =>
  check(name, sql`${col} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`)

export const IDEA_LANES = ['inbox', 'measuring', 'build', 'testing', 'shipped', 'parked', 'killed'] as const
export const RUN_STATUSES = ['starting', 'working', 'ready', 'completed', 'failed', 'stopped', 'interrupted'] as const
export const RUN_KINDS = ['plan', 'build', 'follow_up', 'verify', 'merge', 'setup', 'measure'] as const // plan: the planner on an issue; the rest on a sub-issue
export const PR_STATUSES = ['draft', 'open', 'queued', 'merged', 'closed'] as const
export const PROVIDER_ROLES = ['telemetry', 'code_host', 'design_system', 'model', 'sandbox', 'traces'] as const

// Linear's workflow: every state has a type. Ours are Linear's defaults; the type is what a connected Linear maps on.
export const ISSUE_STATES = ['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate'] as const
export type IssueState = (typeof ISSUE_STATES)[number]
export type StateType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'
export const STATE_TYPE: Record<IssueState, StateType> = {
  triage: 'triage', backlog: 'backlog', todo: 'unstarted', in_progress: 'started', in_review: 'started', done: 'completed', canceled: 'canceled', duplicate: 'canceled',
}
export const CLOSED_STATES: IssueState[] = ['done', 'canceled', 'duplicate']
export const ISSUE_KINDS = ['code', 'todo'] as const // code: planned, built, landed; todo: work outside the code
export type IssueKind = (typeof ISSUE_KINDS)[number]
export const DELEGATES = ['builder', 'planner', 'agent'] as const // the agents an issue can be delegated to; a person is the assignee
export const ISSUE_SOURCES = ['person', 'agent', 'idea', 'planner', 'builder'] as const
export const RELATION_TYPES = ['blocks', 'related', 'duplicate'] as const

// The engine's status for building a code sub-issue; the sub-issue's state follows it (BUILD_STATE).
export const BUILD_STATUSES = ['queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled'] as const
export type BuildStatus = (typeof BUILD_STATUSES)[number]
export const BUILD_STATE: Record<BuildStatus, IssueState> = {
  queued: 'todo', ready: 'todo', running: 'in_progress', awaiting_answer: 'in_progress', merging: 'in_review', testing: 'in_review', done: 'done', failed: 'in_progress', cancelled: 'canceled',
}

// Projects keep the engine's statuses; each has Linear's project status type.
export const PROJECT_STATUSES = ['drafting', 'proposed', 'approved', 'running', 'paused', 'landed', 'stopped', 'superseded'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const PROJECT_STATUS_TYPE: Record<ProjectStatus, 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled'> = {
  drafting: 'backlog', proposed: 'planned', approved: 'planned', running: 'started', paused: 'paused', landed: 'completed', stopped: 'canceled', superseded: 'canceled',
}

export type IdeaLane = (typeof IDEA_LANES)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]

// Tenancy from day one: everything belongs to a workspace; everything below an app belongs to that app.
export const workspace = pgTable('workspace', {
  id: id(), name: text('name').notNull(),
  settings: jsonb('settings').notNull().default({}), // integrations: the workspace's values, each app may override (integrations.ts)
  createdAt: createdAt(),
})

export const user = pgTable('user', { // [LS]
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name'), email: text('email'), githubLogin: text('github_login'),
  role: text('role').notNull().default('owner'), createdAt: createdAt(),
}, (t) => [inList('user_role', t.role, ['owner', 'member', 'member_no_merge'])])

export const app = pgTable('app', { // [LS] "stack"; Linear's team
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name').notNull(), key: text('key').notNull(), // key: the issue prefix, HG in HG-12
  defaultBranch: text('default_branch').notNull().default('main'),
  setup: jsonb('setup').notNull().default({}), // setup_cmd, test_cmd, services[], env_ref, sandbox_size
  workflowId: text('workflow_id').references((): AnyPgColumn => workflow.id), // the default for its projects and tasks
  createdAt: createdAt(),
}, (t) => [uniqueIndex('app_workspace_key').on(t.workspaceId, t.key)])

const appId = () => text('app_id').notNull().references(() => app.id)

export const repo = pgTable('repo', { // [LS] member repos
  id: id(), appId: appId(), fullName: text('full_name').notNull(),
  localPath: text('local_path'), writable: boolean('writable').notNull().default(true), baseBranch: text('base_branch'),
}, (t) => [index('repo_app').on(t.appId)])

export const providerConnection = pgTable('provider_connection', { // [IF] modules and providers
  id: id(), appId: appId(),
  role: text('role').notNull(), provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}), secretRef: text('secret_ref'),
  status: text('status'), checkedAt: at('checked_at'),
}, (t) => [uniqueIndex('provider_connection_role_provider').on(t.appId, t.role, t.provider),
  inList('provider_role', t.role, PROVIDER_ROLES)])

export const idea = pgTable('idea', { // [IF] the unit of work that outlives the merge
  id: id(), appId: appId(), number: integer('number').notNull(),
  title: text('title').notNull(), body: text('body'),
  source: text('source').notNull(), sourceRef: jsonb('source_ref'),
  lane: text('lane').notNull().default('inbox'),
  hypothesis: text('hypothesis'), baseline: jsonb('baseline'), // {metric, value, window, captured_at, insight_id}
  measures: jsonb('measures').notNull().default([]), // [{kind: insight|flag|experiment, provider_ref, target}]
  testability: jsonb('testability'), lookBy: date('look_by'),
  decision: text('decision'), decidedAt: at('decided_at'),
  createdBy: text('created_by').references(() => user.id), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('idea_app_number').on(t.appId, t.number), uniqueIndex('idea_id_app').on(t.id, t.appId),
  inList('idea_source', t.source, ['person', 'agent', 'telemetry']), inList('idea_lane', t.lane, IDEA_LANES),
  check('idea_decision', sql`${t.decision} is null or ${t.decision} in ('yes', 'no', 'not_yet')`)])

export const evidence = pgTable('evidence', { // [IF] append-only telemetry results
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), ideaId: text('idea_id').references(() => idea.id), prId: text('pr_id'),
  kind: text('kind').notNull(), metric: text('metric'), value: numeric('value'), baselineValue: numeric('baseline_value'),
  windowStart: at('window_start'), windowEnd: at('window_end'),
  provider: text('provider'), summary: text('summary'), raw: jsonb('raw'),
  capturedAt: at('captured_at').notNull().defaultNow(),
}, (t) => [index('evidence_app').on(t.appId), inList('evidence_kind', t.kind, ['baseline', 'finding', 'verdict', 'guard', 'post_ship']),
  foreignKey({ name: 'evidence_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

// Goals, stated: an initiative is where the work is headed (long term), served by projects. Linear keeps them at the
// workspace; ours may name the app it is about.
export const INITIATIVE_STATUSES = ['planned', 'active', 'completed'] as const
export const initiative = pgTable('initiative', {
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id), appId: text('app_id').references(() => app.id),
  name: text('name').notNull(), description: text('description'), status: text('status').notNull().default('active'),
  targetDate: date('target_date'), owner: text('owner'), sortOrder: integer('sort_order').notNull().default(0),
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('initiative_workspace').on(t.workspaceId), inList('initiative_status', t.status, INITIATIVE_STATUSES)])

// A stretch of time (a week, a sprint): what should be done by its end. Issues are in at most one.
export const cycle = pgTable('cycle', {
  id: id(), appId: appId(), number: integer('number').notNull(), name: text('name'), description: text('description'),
  startsAt: date('starts_at').notNull(), endsAt: date('ends_at').notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('cycle_app_number').on(t.appId, t.number), uniqueIndex('cycle_id_app').on(t.id, t.appId), check('cycle_dates', sql`${t.endsAt} >= ${t.startsAt}`)])

export const project = pgTable('project', { // issues in order (an InDusk master plan); the branch and PR unit
  id: id(), appId: appId(), ideaId: text('idea_id').references(() => idea.id),
  name: text('name').notNull(), description: text('description'), // description: one line, Linear's summary
  content: text('content'), // why it exists and what it must do, Markdown
  status: text('status').notNull().default('drafting'),
  integrationBranch: text('integration_branch'), // [ID] the project's branch; issues land here, only it reaches trunk
  lead: text('lead'), priority: integer('priority').notNull().default(0), startDate: date('start_date'), targetDate: date('target_date'),
  sortOrder: integer('sort_order').notNull().default(0), createdAt: createdAt(), updatedAt: at('updated_at'),
  workflowId: text('workflow_id').references((): AnyPgColumn => workflow.id), // its tasks' unless they have their own
}, (t) => [uniqueIndex('project_id_app').on(t.id, t.appId), index('project_app').on(t.appId),
  inList('project_status', t.status, PROJECT_STATUSES), check('project_priority', sql`${t.priority} between 0 and 4`),
  foreignKey({ name: 'project_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

export const initiativeProject = pgTable('initiative_project', {
  initiativeId: text('initiative_id').notNull().references(() => initiative.id), projectId: text('project_id').notNull().references(() => project.id),
}, (t) => [primaryKey({ columns: [t.initiativeId, t.projectId] })])

export const issue = pgTable('issue', {
  id: id(), appId: appId(), number: integer('number').notNull(), // HG-12: the app's key and this number, one sequence per app
  kind: text('kind').notNull().default('code'),
  parentId: text('parent_id').references((): AnyPgColumn => issue.id), // a sub-issue: a build unit under code, a checklist line under a to-do
  projectId: text('project_id').references(() => project.id), cycleId: text('cycle_id').references(() => cycle.id),
  ideaId: text('idea_id').references(() => idea.id),
  title: text('title').notNull(),
  description: text('description'), // for a person: what will be different, plain words; no file names or code
  brief: text('brief'), // for the builder: its instructions, Markdown
  briefApprovedBy: text('brief_approved_by'), briefApprovedAt: at('brief_approved_at'), // a task completes only once its brief is approved
  workflowId: text('workflow_id').references((): AnyPgColumn => workflow.id), // its own, over its project's and the app's
  state: text('state').notNull().default('todo'),
  priority: integer('priority').notNull().default(0), // Linear's: 0 none, 1 urgent, 2 high, 3 medium, 4 low
  estimate: text('estimate'), // S, M, L, XL
  sortOrder: integer('sort_order').notNull().default(0), // order among its siblings: in the project, under the parent, or the app
  assignee: text('assignee'), delegate: text('delegate'), // a person has it; or an agent was handed it
  waitingOn: text('waiting_on'), // someone outside has it: "Apple's review"
  source: text('source').notNull().default('person'), sourceRef: jsonb('source_ref'), // {sessionId} | {issueId, runId}
  reason: text('reason'), // canceled or duplicate: why
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
  startedAt: at('started_at'), completedAt: at('completed_at'), canceledAt: at('canceled_at'), closedBy: text('closed_by'),
}, (t) => [uniqueIndex('issue_app_number').on(t.appId, t.number), uniqueIndex('issue_id_app').on(t.id, t.appId),
  index('issue_app_state').on(t.appId, t.state), index('issue_project').on(t.projectId), index('issue_parent').on(t.parentId),
  inList('issue_kind', t.kind, ISSUE_KINDS), inList('issue_state', t.state, ISSUE_STATES), inList('issue_source', t.source, ISSUE_SOURCES),
  check('issue_delegate', sql`${t.delegate} is null or ${t.delegate} in (${sql.raw(DELEGATES.map((d) => `'${d}'`).join(', '))})`),
  check('issue_priority', sql`${t.priority} between 0 and 4`),
  check('issue_estimate', sql`${t.estimate} is null or ${t.estimate} in ('S', 'M', 'L', 'XL')`),
  check('issue_canceled_reason', sql`${t.state} <> 'canceled' or ${t.reason} is not null or ${t.parentId} is not null`), // dropping something says why (a sub-issue goes with its parent)
  check('issue_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  foreignKey({ name: 'issue_parent_app_fk', columns: [t.parentId, t.appId], foreignColumns: [t.id, t.appId] }),
  foreignKey({ name: 'issue_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] }),
  foreignKey({ name: 'issue_cycle_app_fk', columns: [t.cycleId, t.appId], foreignColumns: [cycle.id, cycle.appId] }),
  foreignKey({ name: 'issue_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

export const issueRelation = pgTable('issue_relation', { // issue → related: issue blocks related; related is a duplicate of issue; or just related
  appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id), relatedIssueId: text('related_issue_id').notNull().references(() => issue.id),
  type: text('type').notNull(), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.issueId, t.relatedIssueId, t.type] }), index('issue_relation_related').on(t.relatedIssueId),
  inList('issue_relation_type', t.type, RELATION_TYPES), check('issue_relation_self', sql`${t.issueId} <> ${t.relatedIssueId}`),
  foreignKey({ name: 'issue_relation_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] }),
  foreignKey({ name: 'issue_relation_related_app_fk', columns: [t.relatedIssueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

// Ours: the engine building a code sub-issue. [ID] one agent, one worktree, one commit; attempts and retries.
export const build = pgTable('build', {
  issueId: text('issue_id').primaryKey().references(() => issue.id), appId: appId(),
  status: text('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3),
  branch: text('branch'), worktreePath: text('worktree_path'), baseSha: text('base_sha'),
  requiresSchemaChange: boolean('requires_schema_change').notNull().default(false), // [LS]
  heldReason: text('held_reason'), // [ID] why the scheduler is holding it, for the graph view
  updatedAt: at('updated_at'),
}, (t) => [index('build_app_status').on(t.appId, t.status), inList('build_status', t.status, BUILD_STATUSES),
  foreignKey({ name: 'build_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

export const fileClaim = pgTable('file_claim', { // [ID] two builds sharing a file never run together
  appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id), path: text('path').notNull(),
}, (t) => [primaryKey({ columns: [t.issueId, t.path] }),
  foreignKey({ name: 'file_claim_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

export const decision = pgTable('decision', { // [LS] decision card; [IF] provisional flag
  id: id(), appId: appId(), ideaId: text('idea_id').references(() => idea.id), projectId: text('project_id').references(() => project.id),
  issueId: text('issue_id').references(() => issue.id), runId: text('run_id'), // the planner's decisions belong to an issue and the run that made them
  question: text('question').notNull(), options: jsonb('options').notNull(), // [{key:'A', text, tradeoff, recommended, story}]
  chosen: text('chosen'), provisional: boolean('provisional').notNull().default(false),
  decidedBy: text('decided_by').references(() => user.id), decidedAt: at('decided_at'),
  rationale: text('rationale'),
}, (t) => [index('decision_app').on(t.appId), index('decision_project').on(t.projectId), index('decision_issue').on(t.issueId),
  foreignKey({ name: 'decision_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const step = pgTable('step', { // how the builder intends to build a sub-issue: its todo list as it works (Linear: the agent's plan)
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id),
  runId: text('run_id'), position: integer('position').notNull(), text: text('text').notNull(),
  status: text('status').notNull().default('pending'), updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [index('step_issue').on(t.issueId), inList('step_status', t.status, ['pending', 'in_progress', 'completed']),
  foreignKey({ name: 'step_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

export const session = pgTable('session', { // a conversation with an agent: a talk session (a person and the app's agent)
  id: id(), appId: appId(), kind: text('kind').notNull().default('talk'), issueId: text('issue_id').references(() => issue.id),
  cwd: text('cwd'), branch: text('branch'), worktreePath: text('worktree_path'), // where the agent works: its own worktree of the app's repo, on its own branch
  title: text('title'), subject: text('subject'), subjectRef: jsonb('subject_ref'), // what the conversation is about, pinned on first contact: {projectId} | {issueId} | {ideaId} | {path}
  agentSessionId: text('agent_session_id'), // the SDK session, for --resume after a restart
  alwaysAllow: jsonb('always_allow').$type<string[]>().notNull().default([]), // tools the person said Always to, in this conversation
  terminalSince: at('terminal_since'), // handed to the terminal (claude --resume): what's said there is copied in until the UI takes it back
  importedThrough: text('imported_through'), // the session file's last line already in the transcript
  status: text('status').notNull().default('open'), createdBy: text('created_by'), createdAt: createdAt(),
  lastActiveAt: at('last_active_at'),
  autoApprove: text('auto_approve').notNull().default('cheap'), // the agent acts without asking up to this risk; expensive always asks
}, (t) => [uniqueIndex('session_id_app').on(t.id, t.appId), index('session_app').on(t.appId, t.status),
  inList('session_status', t.status, ['open', 'ended']), inList('session_kind', t.kind, ['talk', 'issue']), inList('session_auto_approve', t.autoApprove, ['free', 'cheap', 'moderate']),
  foreignKey({ name: 'session_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

export const sessionMessage = pgTable('session_message', { // the transcript: what was said, what the agent did, what it asked
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), sessionId: text('session_id').notNull().references(() => session.id),
  author: text('author').notNull(), // user | agent | tool | engine
  kind: text('kind').notNull().default('text'), // text | tool_call | tool_result | permission | result | error
  body: text('body').notNull(), payload: jsonb('payload'), attachments: jsonb('attachments'),
  status: text('status').notNull().default('sent'),
  queuedAt: at('queued_at').notNull().defaultNow(), sentAt: at('sent_at'),
}, (t) => [index('session_message_session').on(t.sessionId, t.id), inList('session_message_status', t.status, ['queued', 'sent', 'interrupted', 'dropped']),
  foreignKey({ name: 'session_message_session_app_fk', columns: [t.sessionId, t.appId], foreignColumns: [session.id, session.appId] })])

export const run = pgTable('run', { // [LS] agent run; [ID] attempt. Linear: an agent session on the issue
  id: id(), appId: appId(), issueId: text('issue_id').references(() => issue.id), // a plan run is on the issue; a build run on the sub-issue
  sessionId: text('session_id').references(() => session.id),
  attempt: integer('attempt').notNull(), kind: text('kind').notNull(),
  agent: text('agent').notNull(), model: text('model'), status: text('status').notNull().default('starting'),
  agentSessionId: text('agent_session_id'), pid: integer('pid'), // for --resume and liveness
  startedAt: at('started_at').notNull().defaultNow(), endedAt: at('ended_at'),
  costUsd: numeric('cost_usd'), budgetCapUsd: numeric('budget_cap_usd'), tokens: jsonb('tokens'), summary: text('summary'), error: text('error'),
}, (t) => [index('run_issue').on(t.issueId), index('run_app').on(t.appId, t.status), inList('run_kind', t.kind, RUN_KINDS), inList('run_status', t.status, RUN_STATUSES),
  foreignKey({ name: 'run_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

export const question = pgTable('question', { // [ID] questions with a cost. Linear: the agent asking on its session
  id: id(), appId: appId(), ideaId: text('idea_id'), projectId: text('project_id'), issueId: text('issue_id'), runId: text('run_id'),
  text: text('text').notNull(), options: jsonb('options'), reason: text('reason'), // options: [{label, description, changes[], recommended}]; reason: why that one
  cost: text('cost'), // cheap | moderate | expensive — set by the server, never the agent
  status: text('status').notNull().default('open'), answer: text('answer'), answeredBy: text('answered_by'),
  answeredAt: at('answered_at'), askedAt: at('asked_at').notNull().defaultNow(),
}, (t) => [index('question_app').on(t.appId, t.status), index('question_project').on(t.projectId), inList('question_status', t.status, ['open', 'answered', 'skipped', 'expired']),
  foreignKey({ name: 'question_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const event = pgTable('event', { // [IF] append-only live stream; the graph view's feed
  seq: bigserial('seq', { mode: 'number' }).primaryKey(), ts: at('ts').notNull().defaultNow(),
  workspaceId: text('workspace_id').notNull(), appId: appId(), ideaId: text('idea_id'), projectId: text('project_id'),
  issueId: text('issue_id'), runId: text('run_id'), sessionId: text('session_id'),
  actor: text('actor').notNull(), // engine | agent:<run_id> | user:<id> | github | posthog
  type: text('type').notNull(), // issue.created, issue.state, build.status, run.tool_call, land.landed, pr.opened, question.asked, …
  payload: jsonb('payload').notNull().default({}),
}, (t) => [index('event_workspace_seq').on(t.workspaceId, t.seq), index('event_issue_seq').on(t.issueId, t.seq),
  index('event_project_seq').on(t.projectId, t.seq), index('event_app_seq').on(t.appId, t.seq)])

// Pull requests Self Evident did not open (a teammate's, or the person's own by hand), kept from GitHub by the sync:
// a review requested from the person shows in My Stuff, and one that touches files our open work claims is flagged.
export const outsidePr = pgTable('outside_pr', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), repoId: text('repo_id').notNull().references(() => repo.id),
  number: integer('number').notNull(), title: text('title').notNull(), author: text('author'), url: text('url'),
  state: text('state').notNull(), draft: boolean('draft').notNull().default(false),
  headBranch: text('head_branch'), baseBranch: text('base_branch'),
  reviewRequested: boolean('review_requested').notNull().default(false), // from the person the engine runs as
  reviewDecision: text('review_decision'), files: jsonb('files').notNull().default([]), // changed paths
  updatedAt: at('updated_at'), syncedAt: at('synced_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('outside_pr_repo_number').on(t.repoId, t.number), index('outside_pr_app').on(t.appId, t.state),
  inList('outside_pr_state', t.state, ['open', 'merged', 'closed'])])

// The summary page: sections written by a model from everything the engine knows about an app, rewritten when
// stale (a day, by default) and something has happened since, or when a person asks. Each write is kept: the newest
// is the page; `facts` is what it was written from, so every line can be checked; `through_seq` is the last event seen.
export const SUMMARY_SECTIONS = ['focus'] as const
export const summary = pgTable('summary', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), section: text('section').notNull(),
  body: jsonb('body').notNull(), facts: jsonb('facts').notNull(), throughSeq: bigint('through_seq', { mode: 'number' }).notNull().default(0),
  model: text('model'), costUsd: numeric('cost_usd'), trigger: text('trigger').notNull(), createdAt: createdAt(),
}, (t) => [index('summary_app_section').on(t.appId, t.section, t.id), inList('summary_section', t.section, SUMMARY_SECTIONS),
  inList('summary_trigger', t.trigger, ['person', 'schedule'])])

export const pr = pgTable('pr', { // [LS] githubPullRequests + review hub; [IF] pitch. One per project, or one per issue when stacked.
  id: id(), appId: appId(), projectId: text('project_id').notNull().references(() => project.id), repoId: text('repo_id').references(() => repo.id),
  issueId: text('issue_id').references(() => issue.id), // a PR per issue (stacked, setup.pr_mode = 'issue'); null: the project's one PR
  number: integer('number'), url: text('url'), headBranch: text('head_branch'), baseBranch: text('base_branch'),
  headSha: text('head_sha'), mergeSha: text('merge_sha'), status: text('status').notNull(),
  additions: integer('additions'), deletions: integer('deletions'), changedFiles: integer('changed_files'),
  readiness: jsonb('readiness'), signals: jsonb('signals'),
  pitch: jsonb('pitch'), // [IF] {off_switch_flag, guard_metric, schema_impact, revertable_alone, fake_data}
  openedAt: at('opened_at'), mergedAt: at('merged_at'),
}, (t) => [uniqueIndex('pr_repo_number').on(t.repoId, t.number), index('pr_app').on(t.appId, t.status), inList('pr_status', t.status, PR_STATUSES),
  foreignKey({ name: 'pr_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const verification = pgTable('verification', { // [LS] Feature/Entry shots; [IF] demo kinds + fake-data notes
  id: id(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id), prId: text('pr_id').references(() => pr.id),
  runId: text('run_id').references(() => run.id), kind: text('kind').notNull(), label: text('label'),
  name: text('name').notNull(), route: text('route'), blobUrl: text('blob_url'), notes: jsonb('notes'), // notes.fake_data
  capturedAt: at('captured_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('verification_issue_name').on(t.issueId, t.name), index('verification_app').on(t.appId), // [LS] same name replaces
  inList('verification_kind', t.kind, ['screenshot', 'video', 'flow_diff', 'expectation', 'story', 'numbers']),
  check('verification_label', sql`${t.label} is null or ${t.label} in ('feature', 'entry_point', 'before', 'after', 'failing_now_passing', 'data_effect')`),
  foreignKey({ name: 'verification_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

// The actual thing, built fast in a worktree of its own to demo and learn from, then analysed into the plan and built
// again from scratch; none of its code is kept. Its server is the engine's to start and stop; the row outlives it.
export const PROTOTYPE_STATUSES = ['running', 'stopped', 'discarded'] as const
export const prototype = pgTable('prototype', {
  id: id(), appId: appId(), projectId: text('project_id').references(() => project.id),
  ideaId: text('idea_id').references(() => idea.id), issueId: text('issue_id').references(() => issue.id), // what it's a step of
  title: text('title').notNull(), brief: text('brief'), // what to build and what it should teach us
  sessionId: text('session_id'), // the conversation that builds it, working in its worktree
  scenario: text('scenario'), // the made-up data its database was last built from (.prototype/scenarios/<name>)
  branch: text('branch').notNull(), path: text('path').notNull(), port: integer('port'),
  status: text('status').notNull().default('stopped'), createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('prototype_app').on(t.appId), inList('prototype_status', t.status, PROTOTYPE_STATUSES)])

// Workflows and steps (LOG.md, 2026-10-29). A workflow's steps are [{key, on, required}] in its order, under the fixed
// rules in steps.ts. A step's work on an idea, a task or a project is one row per step: its status, a line about it,
// and what it produced (research notes, an ADR, a rough draft; mockups as story ids). The brief of a task is the
// issue's own brief; its prototype is the prototype table.
export const workflow = pgTable('workflow', {
  id: id(), appId: appId(), name: text('name').notNull(),
  steps: jsonb('steps').notNull().default([]), ordered: boolean('ordered').notNull().default(false),
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('workflow_app').on(t.appId)])

export const STEP_STATUSES = ['none', 'started', 'done'] as const
export const stepWork = pgTable('step_work', {
  id: id(), appId: appId(),
  ideaId: text('idea_id').references(() => idea.id), issueId: text('issue_id').references(() => issue.id), projectId: text('project_id').references(() => project.id),
  key: text('key').notNull(), status: text('status').notNull().default('started'),
  detail: text('detail'), body: text('body'), refs: jsonb('refs').notNull().default([]), // refs: story ids for mockups
  updatedBy: text('updated_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('step_work_app').on(t.appId), inList('step_work_status', t.status, STEP_STATUSES),
  uniqueIndex('step_work_idea_key').on(t.ideaId, t.key), uniqueIndex('step_work_issue_key').on(t.issueId, t.key), uniqueIndex('step_work_project_key').on(t.projectId, t.key),
  check('step_work_one_subject', sql`num_nonnulls(${t.ideaId}, ${t.issueId}, ${t.projectId}) = 1`)])
