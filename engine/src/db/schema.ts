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
import { homePath } from './home-path.js'

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
export const ISSUE_SOURCES = ['person', 'agent', 'idea', 'planner', 'builder', 'linear'] as const // linear: brought in from a Linear ticket (linear-import.ts)
export const RELATION_TYPES = ['blocks', 'related', 'duplicate'] as const

// The engine's status for building a code sub-issue; the sub-issue's state follows it (BUILD_STATE).
export const BUILD_STATUSES = ['queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled'] as const
export type BuildStatus = (typeof BUILD_STATUSES)[number]
export const BUILD_STATE: Record<BuildStatus, IssueState> = {
  queued: 'todo', ready: 'todo', running: 'in_progress', awaiting_answer: 'in_progress', merging: 'in_review', testing: 'in_review', done: 'done', failed: 'in_progress', cancelled: 'canceled',
}

// Projects keep the engine's statuses; each has Linear's project status type.
export const PROJECT_STATUSES = ['drafting', 'proposed', 'approved', 'running', 'paused', 'landed', 'closed', 'stopped', 'superseded'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const PROJECT_STATUS_TYPE: Record<ProjectStatus, 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled'> = {
  drafting: 'backlog', proposed: 'planned', approved: 'planned', running: 'started', paused: 'paused', landed: 'completed', closed: 'completed', stopped: 'canceled', superseded: 'canceled',
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
  removedAt: at('removed_at'), // put away: out of every list and nothing of it runs; its rows stay until it is deleted for good (apps.ts)
  createdAt: createdAt(),
}, (t) => [uniqueIndex('app_workspace_key').on(t.workspaceId, t.key).where(sql`${t.removedAt} is null`)]) // a put-away app's abbreviation is free to use

const appId = () => text('app_id').notNull().references(() => app.id)

export const repo = pgTable('repo', { // [LS] member repos
  id: id(), appId: appId(), fullName: text('full_name').notNull(),
  localPath: homePath('local_path'), writable: boolean('writable').notNull().default(true), baseBranch: text('base_branch'),
}, (t) => [index('repo_app').on(t.appId)])

export const providerConnection = pgTable('provider_connection', { // [IF] modules and providers
  id: id(), appId: appId(),
  role: text('role').notNull(), provider: text('provider').notNull(),
  config: jsonb('config').notNull().default({}), secretRef: text('secret_ref'),
  status: text('status'), checkedAt: at('checked_at'),
}, (t) => [uniqueIndex('provider_connection_role_provider').on(t.appId, t.role, t.provider),
  inList('provider_role', t.role, PROVIDER_ROLES)])

// Where a piece of work came from, word for word (origins.ts): a ticket in Linear, and whatever tracker comes next. Never
// edited by an agent; brought up to date only from the source. Ideas, projects and tasks point at it, and every agent
// working on one of them is given it whole.
export const origin = pgTable('origin', {
  id: id(), appId: appId(), source: text('source').notNull(), ref: text('ref').notNull(), // 'linear', 'SHOP-12'
  url: text('url'), title: text('title').notNull(), body: text('body'),
  comments: jsonb('comments').$type<{ author: string | null; at: string; body: string }[]>().notNull().default([]),
  links: jsonb('links').$type<{ title: string; url: string }[]>().notNull().default([]), // what the source attaches: pull requests, designs, documents
  files: jsonb('files').$type<{ url: string; path: string | null; note?: string }[]>().notNull().default([]), // images and uploads in its text, kept on this computer when they could be fetched
  fetchedAt: at('fetched_at').notNull().defaultNow(), createdAt: createdAt(),
}, (t) => [uniqueIndex('origin_app_source_ref').on(t.appId, t.source, t.ref)])

export const idea = pgTable('idea', { // [IF] the unit of work that outlives the merge
  id: id(), appId: appId(), number: integer('number').notNull(),
  title: text('title').notNull(), body: text('body'),
  source: text('source').notNull(), sourceRef: jsonb('source_ref'), originId: text('origin_id').references((): AnyPgColumn => origin.id),
  lane: text('lane').notNull().default('inbox'),
  hypothesis: text('hypothesis'), baseline: jsonb('baseline'), // {metric, value, window, captured_at, insight_id}
  measures: jsonb('measures').notNull().default([]), // [{kind: insight|flag|experiment, provider_ref, target}]
  testability: jsonb('testability'), lookBy: date('look_by'),
  decision: text('decision'), decidedAt: at('decided_at'),
  createdBy: text('created_by').references(() => user.id), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('idea_app_number').on(t.appId, t.number), uniqueIndex('idea_id_app').on(t.id, t.appId),
  inList('idea_source', t.source, ['person', 'agent', 'telemetry', 'linear']), inList('idea_lane', t.lane, IDEA_LANES),
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
  id: id(), appId: appId(), ideaId: text('idea_id').references(() => idea.id), originId: text('origin_id').references(() => origin.id),
  name: text('name').notNull(), description: text('description'), // description: one line, Linear's summary
  content: text('content'), // why it exists and what it must do, Markdown
  status: text('status').notNull().default('drafting'),
  integrationBranch: text('integration_branch'), // [ID] the project's branch; issues land here, only it reaches trunk
  prMode: text('pr_mode'), // 'issue' (a branch and a pull request per task) or 'project' (one for the project): fixed when its build starts, so a change of the default never moves work that is under way
  requirements: jsonb('requirements').$type<Record<string, boolean>>(), // the app's requirements this project switches on or off for its own tasks (requirements.ts); null: the app's as they are
  lead: text('lead'), priority: integer('priority').notNull().default(0), startDate: date('start_date'), targetDate: date('target_date'),
  sortOrder: integer('sort_order').notNull().default(0), createdAt: createdAt(), updatedAt: at('updated_at'),
  workflowId: text('workflow_id').references((): AnyPgColumn => workflow.id), // its tasks' unless they have their own
  solo: boolean('solo').notNull().default(false), // one task on its own: made when the task is planned, never listed as a project (solo.ts)
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
  ideaId: text('idea_id').references(() => idea.id), originId: text('origin_id').references(() => origin.id), // its own origin; else its parent's, project's or idea's (origins.ts)
  title: text('title').notNull(),
  description: text('description'), // for a person: what will be different, plain words; no file names or code
  brief: text('brief'), // for the builder: its instructions, Markdown
  briefApprovedBy: text('brief_approved_by'), briefApprovedAt: at('brief_approved_at'), // a task completes only once its brief is approved
  branch: text('branch'), // the branch its work lands on, when the app's template named it (conventions.ts); null: the engine's own name (branches.ts)
  teamTicket: text('team_ticket'), // the team's own ticket for it (ENT-322), when a person or its agent set it; else read from its import or a link (ticket.ts)
  teamTitle: text('team_title'), // its name as the team would say it, for a pull request's title and a branch's name; null: our title
  prBody: text('pr_body'), // its pull request's description, written for the team in their repository's own style; null: the engine's merge guide leads (pr.ts)
  prTitle: text('pr_title'), // its pull request's title, exactly, when the repository's convention needs more than the app's template can say (pr.ts)
  acceptance: jsonb('acceptance').notNull().default([]), // how we will know it is done: [{id, text, check?, shown?, evidence?}], approved with the brief (acceptance.ts)
  workflowId: text('workflow_id').references((): AnyPgColumn => workflow.id), // its own, over its project's and the app's
  state: text('state').notNull().default('todo'),
  priority: integer('priority').notNull().default(0), // Linear's: 0 none, 1 urgent, 2 high, 3 medium, 4 low
  estimate: text('estimate'), // S, M, L, XL
  sortOrder: integer('sort_order').notNull().default(0), // order among its siblings: in the project, under the parent, or the app
  assignee: text('assignee'), delegate: text('delegate'), // a person has it; or an agent was handed it
  waitingOn: text('waiting_on'), // someone outside has it: "Apple's review"
  source: text('source').notNull().default('person'), sourceRef: jsonb('source_ref'), // {sessionId} | {issueId, runId}
  reason: text('reason'), // canceled or duplicate: why
  handover: jsonb('handover').$type<{ text: string | null; sessionId: string; at: string }>(), // what the conversation that made it said about it, written once when its agent starts (handover.ts); text null: it said nothing more
  speed: text('speed'), // careful | fast, when the task says so; null: the app's (steps.ts, Speed)
  probes: jsonb('probes').$type<{ key: string; name: string; kind: 'command' | 'skill' | 'built-in'; pass: boolean | null; evidence: string; findings: string[]; blocks: boolean; fixes: number; at: string }[]>(), // what each probe of its build found, the latest for each (probes.ts)
  requirements: jsonb('requirements').$type<{ key: string; name: string; applies: boolean; how: string; built?: boolean }[]>(), // how its plan covers each requirement in force, as the planner said (requirements.ts)
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

// A comment on an issue, as a tracker has them: the plan, the handoff, the review, the completion, each under a heading
// (its first line) that a later write of the same heading replaces, so a ticket carries one current plan, not six.
export const issueComment = pgTable('issue_comment', {
  id: id(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id),
  heading: text('heading').notNull(), body: text('body').notNull(),
  author: text('author').notNull(), // user | agent | agent:<harness> | the skill's name
  createdAt: createdAt(), updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('issue_comment_heading').on(t.issueId, t.heading), index('issue_comment_issue').on(t.issueId),
  foreignKey({ name: 'issue_comment_issue_app_fk', columns: [t.issueId, t.appId], foreignColumns: [issue.id, issue.appId] })])

// Ours: the engine building a code sub-issue. [ID] one agent, one worktree, one commit; attempts and retries.
export const build = pgTable('build', {
  issueId: text('issue_id').primaryKey().references(() => issue.id), appId: appId(),
  status: text('status').notNull().default('queued'),
  attempt: integer('attempt').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(3),
  branch: text('branch'), worktreePath: homePath('worktree_path'), baseSha: text('base_sha'),
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

// The computers this database is used from. Each registers its name, user and root folder when its engine starts or it
// arrives (machine.ts). Paths are stored from the root (home-path.ts), so the folder layout under the root is what two
// computers must share, not the user name.
export const machine = pgTable('machine', {
  name: text('name').primaryKey(), userName: text('user_name').notNull(), root: text('root').notNull(),
  firstSeenAt: createdAt(), seenAt: at('seen_at').notNull().defaultNow(),
})

export const session = pgTable('session', { // a conversation with an agent: a talk session (a person and the app's agent)
  id: id(), appId: appId(), kind: text('kind').notNull().default('talk'), issueId: text('issue_id').references(() => issue.id),
  cwd: homePath('cwd'), branch: text('branch'), worktreePath: homePath('worktree_path'), // where the agent works: its own worktree of the app's repo, on its own branch
  title: text('title'), subject: text('subject'), subjectRef: jsonb('subject_ref'), // what the conversation is about, pinned on first contact: {projectId} | {issueId} | {ideaId} | {path}
  agentSessionId: text('agent_session_id'), // the SDK session, for --resume after a restart
  alwaysAllow: jsonb('always_allow').$type<string[]>().notNull().default([]), // tools the person said Always to, in this conversation
  terminalSince: at('terminal_since'), // handed to the terminal (claude --resume): what's said there is copied in until the UI takes it back
  closedAt: at('closed_at'), // its tab closed in the agent's column: the conversation, its worktree and its branch stay, and it can be reopened
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

// A change to what an app's builds are held to, tried on past work (trials.ts): one probe as it was at that moment, run
// on the app's last merged tasks, and what it said of each. Kept, so the change it tested can be read beside it.
export const probeTrial = pgTable('probe_trial', {
  id: id(), appId: appId(), key: text('key').notNull(), // the probe's id on the one list (held.ts): lint, req:docs, tests
  probe: jsonb('probe').$type<{ name: string; kind: 'command' | 'skill' | 'judged' | 'built-in'; runs: string }>().notNull(),
  status: text('status').notNull().default('running'), // running | done | failed
  results: jsonb('results').$type<{ issueId: string; identifier: string; title: string; pr: number | null; sha: string; pass: boolean | null; evidence: string; findings: string[]; ms: number }[]>().notNull().default([]),
  tasks: integer('tasks').notNull().default(0), costUsd: text('cost_usd'), error: text('error'),
  createdAt: at('created_at').notNull().defaultNow(), finishedAt: at('finished_at'),
}, (t) => [index('probe_trial_app').on(t.appId, t.createdAt)])

// A nightly check's last word (nightly.ts): a workflow the repository runs on a schedule on its default branch, named
// by the app as something its builds are held to (held.ts, when: nightly). One row for each, kept by the GitHub sync.
export const nightly = pgTable('nightly', {
  id: id(), appId: appId(), key: text('key').notNull(), workflow: text('workflow').notNull(), // the held row's key, and the workflow's file
  status: text('status').notNull().default('none'), // passed | failed | none (no run has said yet)
  runId: text('run_id'), url: text('url'), sha: text('sha'), ranAt: at('ran_at'),
  failing: integer('failing').notNull().default(0), // runs in a row that failed
  greenAt: at('green_at'), greenSha: text('green_sha'), error: text('error'), checkedAt: at('checked_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('nightly_app_key').on(t.appId, t.key)])

// Pull requests Evident did not open (a teammate's, or the person's own by hand), kept from GitHub by the sync:
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

// The thing built the way we would ship it, in a worktree of its own, to show that it works; then analysed into the
// A task's smoke test, when it runs here (smoke.ts): the worktree at the built branch's head, the commit, the port.
// One per task; the row outlives the process, so after an engine restart it reads as stopped until started again.
export const smokeRun = pgTable('smoke_run', {
  id: id(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id),
  path: homePath('path').notNull(), sha: text('sha').notNull(), port: integer('port'),
  /** Which of the app's set-ups it is a run of (smoke.ts). */ setup: text('setup').notNull().default('main'),
  /** The fixture its database was last built from; null: from nothing but the set-up's own seed. */ fixture: text('fixture'),
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('smoke_run_issue').on(t.issueId, t.setup)])

// A scenario: made-up rows for an app's prototypes and smoke tests (prototype-data.ts), one row per name. Kept here
// and never in the app's repository. scope: the prototype it belongs to, or '' for one the whole app shares.
export const scenario = pgTable('scenario', {
  id: id(), appId: appId(), scope: text('scope').notNull().default(''), name: text('name').notNull(),
  tables: jsonb('tables').$type<Record<string, unknown[]>>().notNull(),
  /** Kept from a run that held something real (a real service's answers about a real person): this computer only, never a reviewer's. */ real: boolean('real').notNull().default(false),
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('scenario_name').on(t.appId, t.scope, t.name)])

// A test file: something a person needs in their hands to try a change (test-files.ts): a CSV to import, an image to
// upload, an ID card. Made-up only. The file itself is on this computer, not here: this row says what it is and whose.
export const testFile = pgTable('test_file', {
  id: id(), appId: appId(), /** null: the app's, for every task. */ issueId: text('issue_id').references(() => issue.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), /** What the person does with it, in a line. */ what: text('what').notNull().default(''),
  mediaType: text('media_type').notNull().default('application/octet-stream'), bytes: integer('bytes').notNull().default(0),
  /** Text that was read against the real responses on this computer, and how many of them. Not text: null, and it rests on the person's word. */ checked: jsonb('checked').$type<{ at: string; against: number; faked?: number } | null>(),
  /** The real version, kept on this computer only (in real/ beside the fake): what it is, and why it has no fake when none could be made. */ real: jsonb('real').$type<{ bytes: number; at: string; note?: string } | null>(),
  /** Which version a person's own run uses, place by place: the fake unless it says real. A reviewer is never asked. */ use: jsonb('use').$type<{ prototype?: 'fake' | 'real'; smoke?: 'fake' | 'real' }>().notNull().default({}),
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('test_file_app').on(t.appId, t.issueId)])

// A mock: an app's stand-in for one outside service, kept in the app's library (mocks.ts) and used by its prototypes,
// smoke tests, main and review environments. Its files are invented data and the server that serves them, never a
// recording (those stay in the recordings folder, on this computer). One row per service.
export const MOCK_STATUSES = ['needs_recording', 'assumed', 'mined'] as const
export const mock = pgTable('mock', {
  id: id(), appId: appId(), key: text('key').notNull(), name: text('name').notNull(),
  /** What it stands in for, in a line: "SixtyFour workflow 3d50b61e, results CSV". */ standsInFor: text('stands_in_for').notNull().default(''),
  /** The real service's base URL: a live run is recorded through it. */ upstream: text('upstream'),
  status: text('status').notNull().default('needs_recording'),
  /** Serves on $PORT, run in the folder its files are written to. */ cmd: text('cmd'),
  /** The variables that point the app at it, as a stand-in's ({url}, {container_url}, {port} filled in). */ env: jsonb('env').$type<Record<string, string>>().notNull().default({}),
  /** path → text: the server and its invented data. */ files: jsonb('files').$type<Record<string, string>>().notNull().default({}),
  provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
  /** A new recording is needed (none yet, or the shape changed): what the real call needs. */ needs: jsonb('needs').$type<Record<string, unknown> | null>(),
  /** The task it was raised on or last recorded for. */ issueId: text('issue_id').references(() => issue.id, { onDelete: 'set null' }),
  /** The recording it was mined from, or the newest one not mined yet: a folder under the recordings home. */ recording: text('recording'),
  recordedAt: at('recorded_at'), minedAt: at('mined_at'),
  createdAt: createdAt(), updatedAt: at('updated_at'),
  /** The calls the app makes to the service, each with a key its data files are named by (mock-endpoints.ts): [{ key, method, path, what?, file? }]. */ endpoints: jsonb('endpoints').$type<{ key: string; method: string; path: string; what?: string; file?: string; sensitive?: boolean; follows?: string; linkField?: string; useReal?: boolean }[]>().notNull().default([]),
  /** The data it serves unless a run says otherwise: a mock_data key. None: whatever its own files hold. */ defaultData: text('default_data'),
  /** The app's defaults for where its data comes from in each place a task runs (mock-places.ts): { prototype, smoke, review }, each { source, data? }. A place left out follows defaultData. */ places: jsonb('places').$type<Record<string, { source: string; data?: string }>>().notNull().default({}),
}, (t) => [uniqueIndex('mock_key').on(t.appId, t.key), inList('mock_status', t.status, MOCK_STATUSES)])

// What a mock answers with, kept apart from its server (mock-data.ts): the server reads it from $MOCK_DATA, and it is
// the only thing that differs between a prototype, a smoke test and a reviewer's copy. real: a real response served
// as it is, from its folder under the recordings home, on this computer only (no files here: a real response is never
// in the database). faked: made from one by the faker (fake.ts) and checked against it. invented: written by hand
// or given by a person who states it holds nothing real.
export const MOCK_DATA_KINDS = ['real', 'faked', 'invented'] as const
export const mockData = pgTable('mock_data', {
  id: id(), mockId: text('mock_id').notNull().references(() => mock.id, { onDelete: 'cascade' }), key: text('key').notNull(), name: text('name').notNull(),
  kind: text('kind').notNull(),
  /** path → text, as the server finds them under $MOCK_DATA. Empty for real. */ files: jsonb('files').$type<Record<string, string>>().notNull().default({}),
  /** real: the folder served. faked: the real response it was made from. */ recording: text('recording'),
  /** faked: the plan the faker was given (what is structure), and its salt. */ plan: jsonb('plan').$type<Record<string, unknown>>().notNull().default({}),
  /** What it was made from, what was kept as structure, when it was checked, who stated what. */ provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
  /** The task it was made for. None: the app's. */ issueId: text('issue_id').references(() => issue.id, { onDelete: 'set null' }),
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('mock_data_key').on(t.mockId, t.key), inList('mock_data_kind', t.kind, MOCK_DATA_KINDS)])

// A call a task's change makes to something outside the app (task-calls.ts): what the task needs answered, before
// any mock is thought of. Named by its agent from the brief and the code, or added by the person. `service` is the
// mock's key it is (or will be) answered by; `endpoint` a link made by hand to one of that mock's endpoints, where
// the method and path alone do not find it.
export const taskCall = pgTable('task_call', {
  id: id(), issueId: text('issue_id').notNull().references(() => issue.id, { onDelete: 'cascade' }),
  service: text('service').notNull(), serviceName: text('service_name').notNull(), method: text('method').notNull(), path: text('path').notNull(),
  /** What this task needs from it, in a line: what must come back, and the cases it must show. */ what: text('what').notNull().default(''),
  endpoint: text('endpoint'), /** agent | user */ by: text('by').notNull().default('agent'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('task_call_key').on(t.issueId, t.service, t.method, t.path)])

// A service a task calls (task-calls.ts): the task's link to one of the app's outside services, which is its mock
// row. There from when the service is named for the task, before any call of it is listed.
export const taskService = pgTable('task_service', {
  id: id(), issueId: text('issue_id').notNull().references(() => issue.id, { onDelete: 'cascade' }), mockId: text('mock_id').notNull().references(() => mock.id, { onDelete: 'cascade' }),
  /** This task's own answer, endpoint by endpoint, to whether its own runs get the faked version (mock-serve.ts): { endpointKey: true | false }. An endpoint not named follows the app. */ faked: jsonb('faked').$type<Record<string, boolean>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('task_service_key').on(t.issueId, t.mockId)])

// A task's own choice of where one mock's data comes from in one place (mock-places.ts). No row: the app's default.
export const MOCK_PLACES = ['prototype', 'smoke', 'review'] as const
export const MOCK_SOURCES = ['default', 'live', 'replay', 'fake', 'data'] as const
export const mockChoice = pgTable('mock_choice', {
  id: id(), mockId: text('mock_id').notNull().references(() => mock.id, { onDelete: 'cascade' }), issueId: text('issue_id').notNull().references(() => issue.id, { onDelete: 'cascade' }),
  place: text('place').notNull(), source: text('source').notNull(), /** source data: which set. */ data: text('data'),
  updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('mock_choice_key').on(t.mockId, t.issueId, t.place), inList('mock_choice_place', t.place, MOCK_PLACES), inList('mock_choice_source', t.source, MOCK_SOURCES)])

// What an agent learned by reading an app's code (learn.ts): one row per document per app, replaced when it is
// learned again. summary is for the person and short; body is for agents. sha: the home repository's commit then.
export const learning = pgTable('learning', {
  id: id(), appId: appId(), key: text('key').notNull(),
  summary: text('summary').notNull(), body: text('body').notNull().default(''), sha: text('sha'), sessionId: text('session_id'),
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [uniqueIndex('learning_app_key').on(t.appId, t.key)])

// plan. It is not merged. Its server is the engine's to start and stop; the row outlives it.
export const PROTOTYPE_STATUSES = ['running', 'stopped', 'discarded'] as const
export const prototype = pgTable('prototype', {
  id: id(), appId: appId(), projectId: text('project_id').references(() => project.id),
  ideaId: text('idea_id').references(() => idea.id), issueId: text('issue_id').references(() => issue.id), // what it's a step of
  title: text('title').notNull(), brief: text('brief'), // what to build and what it should teach us
  sessionId: text('session_id'), // the conversation that builds it, working in its worktree
  scenario: text('scenario'), // the made-up data its database was last built from (.prototype/scenarios/<name>)
  depth: text('depth'), // full | rough: how thoroughly it is built (prototype.ts, depthOf); null reads as full
  standIns: jsonb('stand_ins').notNull().default([]), // what it runs in place of what is outside the system: [{key, name, what?, cmd, env}] (stand-ins.ts)
  guide: jsonb('guide'), // what someone opening its shared link is told: {intro?, steps: [{title, path?, try?}]} (share-guide.ts)
  shown: jsonb('shown').notNull().default([]), // what the agent put in its Code view to explain it: files (with lines) and pages (prototype-code.ts)
  branch: text('branch').notNull(), path: homePath('path').notNull(), port: integer('port'),
  status: text('status').notNull().default('stopped'), createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('prototype_app').on(t.appId), inList('prototype_status', t.status, PROTOTYPE_STATUSES)])

// Notes (notes.ts; Sandy, 2026-11-23): what a person wants kept that the engine cannot know. A conversation had and
// what came of it, a finding, a decision made along the way. Dated, so a report on that day includes it; attached to
// the tasks it is about, none or several, and shown on each.
export const note = pgTable('note', {
  id: id(), appId: appId(), /** The day it is about, as the person's calendar has it: YYYY-MM-DD. */ on: text('on').notNull(),
  /** note: something that happened or was found. decision: something settled, to be listed with the others. */ kind: text('kind').notNull().default('note'),
  title: text('title').notNull(), body: text('body').notNull().default(''),
  /** The tasks it is about. A task deleted is simply no longer shown. */ issueIds: jsonb('issue_ids').$type<string[]>().notNull().default([]),
  /** The ideas and projects whose Context it is in (context.ts): an idea's go with it when it becomes a task or a project. */ ideaIds: jsonb('idea_ids').$type<string[]>().notNull().default([]), projectIds: jsonb('project_ids').$type<string[]>().notNull().default([]),
  /** A decision is a question (title) and its answer (Sandy, 2026-11-24). No answer yet: it is open. One made before questions were asked has only its title, a statement. */ answer: text('answer'),
  /** A decision's background (Sandy, 2026-11-24: "some place where we can tell a story about why it's an open question"): what led to the question, what turns on it, what to read. Markdown. Apart from `body`, which is why the answer is the answer. */ background: text('background'),
  /** An open decision the person has asked someone else about (Sandy, 2026-11-24: "I have asked so and so and I'm waiting for an answer"): who. `on` is the day the question was asked. */ waitingOn: text('waiting_on'),
  /** A decision: open (asked, not answered); proposed (an agent's answer, waiting for the person), who accepts it (settled) or turns it down (rejected: kept, so it is not proposed again). */ status: text('status').notNull().default('settled'),
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('note_app').on(t.appId, t.on), inList('note_kind', t.kind, ['note', 'decision']), inList('note_status', t.status, ['settled', 'proposed', 'rejected', 'open'])])

// Reference docs in a Context (context.ts; Sandy, 2026-11-24): what an idea, a project or a task is to be read against.
// Text pasted in, a file brought in, or another ticket kept as an origin. The ticket the work came from is not a row:
// it is the origin the idea, project or task already points at.
export const contextDoc = pgTable('context_doc', {
  id: id(), appId: appId(),
  issueId: text('issue_id').references(() => issue.id, { onDelete: 'cascade' }), ideaId: text('idea_id').references(() => idea.id, { onDelete: 'cascade' }), projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), /** A ticket: the origin it is. */ originId: text('origin_id').references(() => origin.id),
  title: text('title').notNull(), /** One line: what an agent reads in the list before it opens it. */ description: text('description'),
  /** Its text. Null for a ticket, and for a PDF, which is kept as the file it was. */ body: text('body'), fileName: text('file_name'), filePath: text('file_path'),
  /** Given to every agent whole, not listed for it to open. */ inFull: boolean('in_full').notNull().default(false),
  createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('context_doc_app').on(t.appId), inList('context_doc_kind', t.kind, ['pasted', 'file', 'ticket'])])

// Reports on an app's work over a period (reports.ts; Sandy, 2026-11-13): the end-of-day note, the weekly status. Written
// by a model from what happened in the period, in the person's own format, then theirs to edit and send. `facts` is
// what it was written from; `notes` what the person added that the engine could not know (a meeting, a call).
export const report = pgTable('report', {
  id: id(), appId: appId(), kind: text('kind').notNull(), // daily | weekly
  fromAt: at('from_at').notNull(), toAt: at('to_at').notNull(), label: text('label').notNull(), // "Today, Nov 13"; "Week of Nov 9"
  body: text('body').notNull(), notes: text('notes'), facts: jsonb('facts').notNull(),
  model: text('model'), costUsd: numeric('cost_usd'), editedAt: at('edited_at'), createdBy: text('created_by'), createdAt: createdAt(),
}, (t) => [index('report_app').on(t.appId, t.createdAt), inList('report_kind', t.kind, ['daily', 'weekly'])])

// Task branches and save points (task-branches.ts; Sandy, 2026-11-13). A task branch is a version of the task: the git
// branch each of its worktrees is on, and, once set aside, the task as it was left (brief, criteria, approvals, steps,
// comments, sub-tasks). One is current. A save point is a named point on a task branch: a git branch at each
// worktree's commit and the same copy of the task, to start a new task branch from.
export const taskBranch = pgTable('task_branch', {
  id: id(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id),
  name: text('name').notNull(), slug: text('slug').notNull(), // '' for the first one: its git branches keep the names they had
  current: boolean('current').notNull().default(false),
  fromSave: text('from_save'), // the name of the save point it was started from
  refs: jsonb('refs').notNull().default([]), // [{key, branch, from?}]: per worktree, its git branch and the commit it started at
  state: jsonb('state'), // set aside: the task as it was left; null while it is the current one
  createdBy: text('created_by'), createdAt: createdAt(),
}, (t) => [index('task_branch_issue').on(t.issueId)])

export const savePoint = pgTable('save_point', {
  id: id(), appId: appId(), issueId: text('issue_id').notNull().references(() => issue.id),
  branchId: text('branch_id').notNull().references(() => taskBranch.id),
  name: text('name').notNull(), slug: text('slug').notNull(),
  auto: text('auto'), // made by the engine at a transition: prototype_approved | brief_approved; only the latest of each is kept
  refs: jsonb('refs').notNull().default([]), // [{key, branch, sha}]: per worktree, the git branch that marks it and its commit
  state: jsonb('state').notNull(),
  createdBy: text('created_by'), createdAt: createdAt(),
}, (t) => [index('save_point_issue').on(t.issueId)])

// Workflows and steps (LOG.md, 2026-10-29). A workflow's steps are [{key, on, required}] in its order, under the fixed
// rules in steps.ts. A step's work on an idea, a task or a project is one row per step: its status, a line about it,
// and what it produced (research notes, an ADR, a rough draft; mockups as story ids). The brief of a task is the
// issue's own brief; its prototype is the prototype table.
export const workflow = pgTable('workflow', {
  id: id(), appId: appId(), name: text('name').notNull(),
  steps: jsonb('steps').notNull().default([]), ordered: boolean('ordered').notNull().default(false),
  build: text('build').notNull().default('planned'), // one: built in one go, no planner; planned: cut into sub-tasks by the planner (steps.ts, Build)
  style: text('style').notNull().default('staged'), // checklist: a list in the builder's prompt, verified after the build; staged: checks before the build, as it was (steps.ts, Style)
  requirements: jsonb('requirements').$type<Record<string, boolean>>(), // the app's requirements this workflow switches on or off (requirements.ts); null: the app's as they are
  createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('workflow_app').on(t.appId)])

export const STEP_STATUSES = ['none', 'started', 'done', 'skipped'] as const // skipped: an optional step a person is not doing on this task
export const stepWork = pgTable('step_work', {
  id: id(), appId: appId(),
  ideaId: text('idea_id').references(() => idea.id), issueId: text('issue_id').references(() => issue.id), projectId: text('project_id').references(() => project.id),
  key: text('key').notNull(), status: text('status').notNull().default('started'),
  detail: text('detail'), body: text('body'), refs: jsonb('refs').notNull().default([]), // refs: story ids for mockups
  summary: text('summary'), // for the person, who will not read the body: a few bullets on what they need to know (Sandy, 2026-11-13)
  updatedBy: text('updated_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
  approvedBy: text('approved_by'), approvedAt: at('approved_at'), // a person's approval of a step on a task (steps.ts, needsApproval); cleared when the step's work changes
}, (t) => [index('step_work_app').on(t.appId), inList('step_work_status', t.status, STEP_STATUSES),
  uniqueIndex('step_work_idea_key').on(t.ideaId, t.key), uniqueIndex('step_work_issue_key').on(t.issueId, t.key), uniqueIndex('step_work_project_key').on(t.projectId, t.key),
  check('step_work_one_subject', sql`num_nonnulls(${t.ideaId}, ${t.issueId}, ${t.projectId}) = 1`)])

// What an app or one of its projects is worked from: the design file, the requirements document, the build order, a
// diagram. A name, where it is (a link, or a path on this computer), and a line on what it is. A project's assets are
// the app's plus its own (assets.ts).
export const asset = pgTable('asset', {
  id: id(), appId: appId(), projectId: text('project_id').references(() => project.id), // null: the app's
  name: text('name').notNull(), location: text('location').notNull(), note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0), createdBy: text('created_by'), createdAt: createdAt(), updatedAt: at('updated_at'),
}, (t) => [index('asset_app').on(t.appId, t.projectId)])
