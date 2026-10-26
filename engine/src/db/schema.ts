/**
 * The engine's schema. Git holds code; this holds all state; the engine is the single writer.
 * From research/parallel-engine.md §5: [LS] Lightsprint-derived, [ID] InDusk run-the-graph, [IF] ours.
 * Beside projects, an app has to-dos (work outside the code, each with a checklist).
 * Hierarchy: idea → project (a backlog, and tasks in order) → task (authored: title + brief) → phase (the atomic unit the engine runs)
 * → step (the builder's own todo list while it builds a phase).
 * IDs are prefixed short strings (ids.ts). State tables are the truth; `event` is the append-only log and live feed.
 *
 * Every row below an app carries `app_id`, required, and a composite foreign key ties it to its parent's app
 * (`(project_id, app_id) → project(id, app_id)`), so a row can never claim a different app than the thing it belongs
 * to. Scoping is then `where app_id = ?` everywhere, with `(app_id, …)` indexes; row-level security per workspace
 * can sit on top when there is more than one person.
 */
import { sql } from 'drizzle-orm'
import {
  bigserial, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const id = () => text('id').primaryKey()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
// Literal values, not parameters: this text ends up in DDL.
const inList = (name: string, col: any, values: readonly string[]) =>
  check(name, sql`${col} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`)

export const IDEA_LANES = ['inbox', 'measuring', 'build', 'testing', 'shipped', 'parked', 'killed'] as const
export const PHASE_STATUSES = ['queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled'] as const
export const RUN_STATUSES = ['starting', 'working', 'ready', 'completed', 'failed', 'stopped', 'interrupted'] as const
export const RUN_KINDS = ['plan', 'build', 'follow_up', 'verify', 'merge', 'setup', 'measure'] as const // plan: the planner on a task; the rest on a phase
export const PR_STATUSES = ['draft', 'open', 'queued', 'merged', 'closed'] as const
export const PROVIDER_ROLES = ['telemetry', 'code_host', 'design_system', 'model', 'sandbox', 'traces'] as const

export type IdeaLane = (typeof IDEA_LANES)[number]
export type PhaseStatus = (typeof PHASE_STATUSES)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]

// Tenancy from day one: everything belongs to a workspace; everything below an app belongs to that app.
export const workspace = pgTable('workspace', {
  id: id(), name: text('name').notNull(), createdAt: createdAt(),
})

export const user = pgTable('user', { // [LS]
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name'), email: text('email'), githubLogin: text('github_login'),
  role: text('role').notNull().default('owner'), createdAt: createdAt(),
}, (t) => [inList('user_role', t.role, ['owner', 'member', 'member_no_merge'])])

export const app = pgTable('app', { // [LS] "stack"
  id: id(), workspaceId: text('workspace_id').notNull().references(() => workspace.id),
  name: text('name').notNull(), defaultBranch: text('default_branch').notNull().default('main'),
  setup: jsonb('setup').notNull().default({}), // setup_cmd, test_cmd, services[], env_ref, sandbox_size
  createdAt: createdAt(),
})

const appId = () => text('app_id').notNull().references(() => app.id)

export const repo = pgTable('repo', { // [LS] member repos
  id: id(), appId: appId(), fullName: text('full_name').notNull(),
  localPath: text('local_path'), writable: boolean('writable').notNull().default(true), baseBranch: text('base_branch'),
}, (t) => [index('repo_app').on(t.appId)])

export const providerConnection = pgTable('provider_connection', { // [IF] modules and providers
  id: id(), appId: appId(),
  role: text('role').notNull(), provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}), secretRef: text('secret_ref'),
  status: text('status'), checkedAt: timestamp('checked_at', { withTimezone: true }),
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
  decision: text('decision'), decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => user.id), createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [uniqueIndex('idea_app_number').on(t.appId, t.number), uniqueIndex('idea_id_app').on(t.id, t.appId),
  inList('idea_source', t.source, ['person', 'agent', 'telemetry']), inList('idea_lane', t.lane, IDEA_LANES),
  check('idea_decision', sql`${t.decision} is null or ${t.decision} in ('yes', 'no', 'not_yet')`)])

export const evidence = pgTable('evidence', { // [IF] append-only telemetry results
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), ideaId: text('idea_id').references(() => idea.id), prId: text('pr_id'),
  kind: text('kind').notNull(), metric: text('metric'), value: numeric('value'), baselineValue: numeric('baseline_value'),
  windowStart: timestamp('window_start', { withTimezone: true }), windowEnd: timestamp('window_end', { withTimezone: true }),
  provider: text('provider'), summary: text('summary'), raw: jsonb('raw'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('evidence_app').on(t.appId), inList('evidence_kind', t.kind, ['baseline', 'finding', 'verdict', 'guard', 'post_ship']),
  foreignKey({ name: 'evidence_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

export const project = pgTable('project', { // a group of tasks in order (an InDusk master plan); the branch and PR unit
  id: id(), appId: appId(), ideaId: text('idea_id').references(() => idea.id),
  title: text('title').notNull(), status: text('status').notNull().default('drafting'),
  integrationBranch: text('integration_branch'), // [ID] the project's branch; tasks land here, only it reaches trunk
  spec: text('spec'), createdAt: createdAt(),
}, (t) => [uniqueIndex('project_id_app').on(t.id, t.appId), index('project_app').on(t.appId),
  inList('project_status', t.status, ['drafting', 'proposed', 'approved', 'running', 'paused', 'landed', 'stopped', 'superseded']),
  foreignKey({ name: 'project_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

export const task = pgTable('task', { // authored: a title and a brief (like an InDusk project); projects are tasks in order
  id: id(), appId: appId(), projectId: text('project_id').notNull().references(() => project.id),
  ideaId: text('idea_id').references(() => idea.id), // an idea can be one task, or a project of several
  number: integer('number').notNull(), position: integer('position').notNull().default(0), // order within the project
  title: text('title').notNull(), brief: text('brief'), // brief: the builder's instructions, Markdown
  description: text('description'), // for a person: one to three plain sentences, what will be different; no file names or code
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [uniqueIndex('task_app_number').on(t.appId, t.number), uniqueIndex('task_id_app').on(t.id, t.appId), index('task_project').on(t.projectId),
  foreignKey({ name: 'task_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] }),
  foreignKey({ name: 'task_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

// To-dos: the work around the code (Sandy, 2026-10-26): accounts, approvals, people, checks. A to-do belongs to the
// app, beside its projects, never inside one; it is owned by the person or the agent, can point at the project it
// unblocks, and has a checklist (one level). It is done when its checklist is, or when a person says so.
export const TODO_OWNERS = ['person', 'agent'] as const
export const TODO_STATUSES = ['open', 'done', 'dropped'] as const
export const todo = pgTable('todo', {
  id: id(), appId: appId(), number: integer('number').notNull(),
  title: text('title').notNull(), notes: text('notes'), // notes: Markdown, anything worth keeping (links, who, what was said)
  owner: text('owner').notNull().default('person'), status: text('status').notNull().default('open'),
  projectId: text('project_id').references(() => project.id), // the project it unblocks, if any
  reason: text('reason'), // dropped: why
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }),
  closedBy: text('closed_by'), closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('todo_app_number').on(t.appId, t.number), uniqueIndex('todo_id_app').on(t.id, t.appId), index('todo_app').on(t.appId),
  inList('todo_owner', t.owner, TODO_OWNERS), inList('todo_status', t.status, TODO_STATUSES),
  check('todo_dropped_reason', sql`${t.status} <> 'dropped' or ${t.reason} is not null`),
  foreignKey({ name: 'todo_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const checklistItem = pgTable('checklist_item', { // one line of a to-do's checklist
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), todoId: text('todo_id').notNull().references(() => todo.id),
  position: integer('position').notNull().default(0), text: text('text').notNull(),
  done: boolean('done').notNull().default(false), doneBy: text('done_by'), doneAt: timestamp('done_at', { withTimezone: true }),
  waitingOn: text('waiting_on'), // someone else has it: "Apple's review"
}, (t) => [index('checklist_item_todo').on(t.todoId),
  foreignKey({ name: 'checklist_item_todo_app_fk', columns: [t.todoId, t.appId], foreignColumns: [todo.id, todo.appId] })])

// A project's backlog: everything it has to cover, so nothing is forgotten (Sandy, 2026-10-23: "this is what I need to
// accomplish and I know it's all here"). An item comes from a person, the agent, an idea, the planner or a builder; it
// ends covered by a task (a new one, or one that already does it) or dropped with a reason. A project lands only when
// nothing in its backlog is open.
export const BACKLOG_SOURCES = ['person', 'agent', 'idea', 'planner', 'builder'] as const
export const BACKLOG_STATES = ['open', 'covered', 'dropped'] as const
export const backlogItem = pgTable('backlog_item', {
  id: id(), appId: appId(), projectId: text('project_id').notNull().references(() => project.id),
  text: text('text').notNull(), body: text('body'), // text: one line to remember; body: anything more
  source: text('source').notNull(), sourceRef: jsonb('source_ref'), // {sessionId} | {taskId, runId} | {phaseId, runId}
  ideaId: text('idea_id').references(() => idea.id), // the idea it came from, if any
  state: text('state').notNull().default('open'),
  taskId: text('task_id').references(() => task.id), // covered: the task that does it
  todoId: text('todo_id').references(() => todo.id), // or the to-do that does it: work outside the code
  reason: text('reason'), // dropped: why; covered: how, when it is not obvious
  createdBy: text('created_by'), createdAt: createdAt(),
  resolvedBy: text('resolved_by'), resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [index('backlog_item_project').on(t.projectId), inList('backlog_item_source', t.source, BACKLOG_SOURCES), inList('backlog_item_state', t.state, BACKLOG_STATES),
  check('backlog_item_resolution', sql`(${t.state} = 'open') or (${t.state} = 'covered' and (${t.taskId} is not null or ${t.todoId} is not null)) or (${t.state} = 'dropped' and ${t.reason} is not null)`),
  foreignKey({ name: 'backlog_item_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] }),
  foreignKey({ name: 'backlog_item_todo_app_fk', columns: [t.todoId, t.appId], foreignColumns: [todo.id, todo.appId] }),
  foreignKey({ name: 'backlog_item_task_app_fk', columns: [t.taskId, t.appId], foreignColumns: [task.id, task.appId] }),
  foreignKey({ name: 'backlog_item_idea_app_fk', columns: [t.ideaId, t.appId], foreignColumns: [idea.id, idea.appId] })])

export const decision = pgTable('decision', { // [LS] decision card; [IF] provisional flag
  id: id(), appId: appId(), ideaId: text('idea_id').references(() => idea.id), projectId: text('project_id').references(() => project.id),
  taskId: text('task_id'), runId: text('run_id'), // the planner's decisions belong to a task and the run that made them
  question: text('question').notNull(), options: jsonb('options').notNull(), // [{key:'A', text, tradeoff, recommended, story}]
  chosen: text('chosen'), provisional: boolean('provisional').notNull().default(false),
  decidedBy: text('decided_by').references(() => user.id), decidedAt: timestamp('decided_at', { withTimezone: true }),
  rationale: text('rationale'),
}, (t) => [index('decision_app').on(t.appId), index('decision_project').on(t.projectId),
  foreignKey({ name: 'decision_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const phase = pgTable('phase', { // the atomic unit: one agent, one worktree, one commit. [ID] graph semantics
  id: id(), appId: appId(), projectId: text('project_id').notNull().references(() => project.id),
  taskId: text('task_id').notNull().references(() => task.id), number: integer('number').notNull(),
  title: text('title').notNull(), brief: text('brief'), // brief: the builder's instructions, Markdown
  description: text('description'), // for a person: one to three plain sentences, what will be different; no file names or code
  status: text('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3), // [ID]
  branch: text('branch'), worktreePath: text('worktree_path'), baseSha: text('base_sha'), // [ID]
  size: text('size'), priority: integer('priority').notNull().default(0), position: integer('position').notNull().default(0),
  requiresSchemaChange: boolean('requires_schema_change').notNull().default(false), // [LS]
  heldReason: text('held_reason'), // [ID] why the scheduler is holding it, for the graph view
  createdBy: text('created_by'), prId: text('pr_id'),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [uniqueIndex('phase_app_number').on(t.appId, t.number), uniqueIndex('phase_id_app').on(t.id, t.appId),
  index('phase_project').on(t.projectId), index('phase_task').on(t.taskId),
  inList('phase_status', t.status, PHASE_STATUSES),
  check('phase_size', sql`${t.size} is null or ${t.size} in ('S', 'M', 'L', 'XL')`),
  foreignKey({ name: 'phase_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] }),
  foreignKey({ name: 'phase_task_app_fk', columns: [t.taskId, t.appId], foreignColumns: [task.id, task.appId] })])

export const phaseDependency = pgTable('phase_dependency', { // [ID] explicit edges; task order adds implicit ones. Same app on both ends.
  appId: appId(), phaseId: text('phase_id').notNull().references(() => phase.id),
  dependsOnPhaseId: text('depends_on_phase_id').notNull().references(() => phase.id),
}, (t) => [primaryKey({ columns: [t.phaseId, t.dependsOnPhaseId] }),
  foreignKey({ name: 'phase_dependency_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] }),
  foreignKey({ name: 'phase_dependency_on_app_fk', columns: [t.dependsOnPhaseId, t.appId], foreignColumns: [phase.id, phase.appId] })])

export const phaseFileClaim = pgTable('phase_file_claim', { // [ID] two phases sharing a file never run together
  appId: appId(), phaseId: text('phase_id').notNull().references(() => phase.id), path: text('path').notNull(),
}, (t) => [primaryKey({ columns: [t.phaseId, t.path] }),
  foreignKey({ name: 'phase_file_claim_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] })])

export const step = pgTable('step', { // how the builder intends to build a phase: its todo list, as it works
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), phaseId: text('phase_id').notNull().references(() => phase.id),
  runId: text('run_id'), position: integer('position').notNull(), text: text('text').notNull(),
  status: text('status').notNull().default('pending'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('step_phase').on(t.phaseId), inList('step_status', t.status, ['pending', 'in_progress', 'completed']),
  foreignKey({ name: 'step_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] })])

export const session = pgTable('session', { // a conversation with an agent: a talk session (a person and the app's agent) or, later, one per phase
  id: id(), appId: appId(), kind: text('kind').notNull().default('talk'), phaseId: text('phase_id').references(() => phase.id),
  cwd: text('cwd'), branch: text('branch'), worktreePath: text('worktree_path'), // where the agent works: its own worktree of the app's repo, on its own branch
  title: text('title'), subject: text('subject'), subjectRef: jsonb('subject_ref'), // what the conversation is about, pinned on first contact: {projectId} | {ideaId} | {path}
  agentSessionId: text('agent_session_id'), // the SDK session, for --resume after a restart
  status: text('status').notNull().default('open'), createdBy: text('created_by'), createdAt: createdAt(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  autoApprove: text('auto_approve').notNull().default('cheap'), // the agent acts without asking up to this risk; expensive always asks
}, (t) => [uniqueIndex('session_id_app').on(t.id, t.appId), index('session_app').on(t.appId, t.status),
  inList('session_status', t.status, ['open', 'ended']), inList('session_kind', t.kind, ['talk', 'phase']), inList('session_auto_approve', t.autoApprove, ['free', 'cheap', 'moderate']),
  foreignKey({ name: 'session_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] })])

export const sessionMessage = pgTable('session_message', { // the transcript: what was said, what the agent did, what it asked
  id: bigserial('id', { mode: 'number' }).primaryKey(), appId: appId(), sessionId: text('session_id').notNull().references(() => session.id),
  author: text('author').notNull(), // user | agent | tool | engine
  kind: text('kind').notNull().default('text'), // text | tool_call | tool_result | permission | result | error
  body: text('body').notNull(), payload: jsonb('payload'), attachments: jsonb('attachments'),
  status: text('status').notNull().default('sent'),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(), sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [index('session_message_session').on(t.sessionId, t.id), inList('session_message_status', t.status, ['queued', 'sent', 'interrupted', 'dropped']),
  foreignKey({ name: 'session_message_session_app_fk', columns: [t.sessionId, t.appId], foreignColumns: [session.id, session.appId] })])

export const run = pgTable('run', { // [LS] agent run; [ID] attempt
  id: id(), appId: appId(), phaseId: text('phase_id').references(() => phase.id), taskId: text('task_id').references(() => task.id), // a build run has a phase; a project run has a task
  sessionId: text('session_id').references(() => session.id),
  attempt: integer('attempt').notNull(), kind: text('kind').notNull(),
  agent: text('agent').notNull(), model: text('model'), status: text('status').notNull().default('starting'),
  agentSessionId: text('agent_session_id'), pid: integer('pid'), // for --resume and liveness
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(), endedAt: timestamp('ended_at', { withTimezone: true }),
  costUsd: numeric('cost_usd'), budgetCapUsd: numeric('budget_cap_usd'), tokens: jsonb('tokens'), summary: text('summary'), error: text('error'),
}, (t) => [index('run_phase').on(t.phaseId), index('run_app').on(t.appId, t.status), inList('run_kind', t.kind, RUN_KINDS), inList('run_status', t.status, RUN_STATUSES),
  foreignKey({ name: 'run_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] }),
  foreignKey({ name: 'run_task_app_fk', columns: [t.taskId, t.appId], foreignColumns: [task.id, task.appId] })])

export const question = pgTable('question', { // [ID] questions with a cost
  id: id(), appId: appId(), ideaId: text('idea_id'), projectId: text('project_id'), taskId: text('task_id'), phaseId: text('phase_id'), runId: text('run_id'),
  text: text('text').notNull(), options: jsonb('options'), reason: text('reason'), // options: [{label, description, changes[], recommended}]; reason: why that one
  cost: text('cost'), // cheap | moderate | expensive — set by the server, never the agent
  status: text('status').notNull().default('open'), answer: text('answer'), answeredBy: text('answered_by'),
  answeredAt: timestamp('answered_at', { withTimezone: true }), askedAt: timestamp('asked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('question_app').on(t.appId, t.status), index('question_project').on(t.projectId), inList('question_status', t.status, ['open', 'answered', 'skipped', 'expired']),
  foreignKey({ name: 'question_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const event = pgTable('event', { // [IF] append-only live stream; the graph view's feed
  seq: bigserial('seq', { mode: 'number' }).primaryKey(), ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  workspaceId: text('workspace_id').notNull(), appId: appId(), ideaId: text('idea_id'), projectId: text('project_id'),
  taskId: text('task_id'), phaseId: text('phase_id'), runId: text('run_id'), sessionId: text('session_id'),
  actor: text('actor').notNull(), // engine | agent:<run_id> | user:<id> | github | posthog
  type: text('type').notNull(), // phase.status, phase.held, run.tool_call, run.message, run.steps, land.landed, pr.opened, question.asked, evidence.captured
  payload: jsonb('payload').notNull().default({}),
}, (t) => [index('event_workspace_seq').on(t.workspaceId, t.seq), index('event_phase_seq').on(t.phaseId, t.seq),
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
  updatedAt: timestamp('updated_at', { withTimezone: true }), syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('outside_pr_repo_number').on(t.repoId, t.number), index('outside_pr_app').on(t.appId, t.state),
  inList('outside_pr_state', t.state, ['open', 'merged', 'closed'])])

export const pr = pgTable('pr', { // [LS] githubPullRequests + review hub; [IF] pitch. One per project, or one per task when stacked.
  id: id(), appId: appId(), projectId: text('project_id').notNull().references(() => project.id), repoId: text('repo_id').references(() => repo.id),
  taskId: text('task_id').references(() => task.id), // a PR per task (stacked, setup.pr_mode = 'task'); null: the project's one PR
  number: integer('number'), url: text('url'), headBranch: text('head_branch'), baseBranch: text('base_branch'),
  headSha: text('head_sha'), mergeSha: text('merge_sha'), status: text('status').notNull(),
  additions: integer('additions'), deletions: integer('deletions'), changedFiles: integer('changed_files'),
  readiness: jsonb('readiness'), signals: jsonb('signals'),
  pitch: jsonb('pitch'), // [IF] {off_switch_flag, guard_metric, schema_impact, revertable_alone, fake_data}
  openedAt: timestamp('opened_at', { withTimezone: true }), mergedAt: timestamp('merged_at', { withTimezone: true }),
}, (t) => [uniqueIndex('pr_repo_number').on(t.repoId, t.number), index('pr_app').on(t.appId, t.status), inList('pr_status', t.status, PR_STATUSES),
  foreignKey({ name: 'pr_project_app_fk', columns: [t.projectId, t.appId], foreignColumns: [project.id, project.appId] })])

export const verification = pgTable('verification', { // [LS] Feature/Entry shots; [IF] demo kinds + fake-data notes
  id: id(), appId: appId(), phaseId: text('phase_id').notNull().references(() => phase.id), prId: text('pr_id').references(() => pr.id),
  runId: text('run_id').references(() => run.id), kind: text('kind').notNull(), label: text('label'),
  name: text('name').notNull(), route: text('route'), blobUrl: text('blob_url'), notes: jsonb('notes'), // notes.fake_data
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('verification_phase_name').on(t.phaseId, t.name), index('verification_app').on(t.appId), // [LS] same name replaces
  inList('verification_kind', t.kind, ['screenshot', 'video', 'flow_diff', 'expectation', 'story', 'numbers']),
  check('verification_label', sql`${t.label} is null or ${t.label} in ('feature', 'entry_point', 'before', 'after', 'failing_now_passing', 'data_effect')`),
  foreignKey({ name: 'verification_phase_app_fk', columns: [t.phaseId, t.appId], foreignColumns: [phase.id, phase.appId] })])
