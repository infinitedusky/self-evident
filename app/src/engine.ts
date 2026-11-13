/** The engine's API, as the UI sees it. In development Vite proxies /api → the engine; the UI never touches the database. */
import { useEffect, useRef, useState } from 'react'
import type { On, Resolved, Row, StepKey, StepState, Workflow, WorkflowStep } from '@self-evident/engine/steps'
import type { Plan } from './pages/PlanHome'

export const API = '/api'

/** What a view holds of the event stream: its own listeners on a shared connection. */
export interface Events { addEventListener(type: string, fn: EventListener): void; onerror: EventListener | null; onopen: EventListener | null; close(): void }
const streams = new Map<string, { es: EventSource; n: number }>()
/**
 * The engine's events at one address, one connection per address however many views listen: Chrome allows six
 * connections per host over HTTP/1.1, and a workspace of tabs, each opening its own streams, ran out, leaving the next
 * page stuck on Loading. Each view adds its own listeners and takes them off on close; the last to close ends it.
 */
export function openEvents(url: string): Events {
  let s = streams.get(url)
  if (!s) { s = { es: new EventSource(url), n: 0 }; streams.set(url, s) }
  const shared = s
  shared.n++
  const mine: [string, EventListener][] = []
  const add = (type: string, fn: EventListener) => { mine.push([type, fn]); shared.es.addEventListener(type, fn) }
  let closed = false
  return {
    addEventListener: add,
    set onerror(fn: EventListener | null) { if (fn) add('error', fn) },
    set onopen(fn: EventListener | null) { if (fn) add('open', fn) },
    get onerror() { return null }, get onopen() { return null },
    close() {
      if (closed) return
      closed = true
      for (const [type, fn] of mine) shared.es.removeEventListener(type, fn)
      if (--shared.n === 0) { shared.es.close(); streams.delete(url) }
    },
  }
}

// Shaped like Linear: initiative (a goal) → project (issues in order) → issue (code or a to-do; HG-12) → sub-issue
// (under code: one agent, one worktree, one commit, and its build; under a to-do: a checklist line) → step.
export type BuildStatus = 'queued' | 'ready' | 'running' | 'awaiting_answer' | 'merging' | 'testing' | 'done' | 'failed' | 'cancelled'
export type IssueState = 'triage' | 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled' | 'duplicate'
export const STATE_LABEL: Record<IssueState, string> = { triage: 'Triage', backlog: 'Backlog', todo: 'Todo', in_progress: 'In progress', in_review: 'In review', done: 'Done', canceled: 'Canceled', duplicate: 'Duplicate' }

export interface Run { id: string; attempt: number; status: string; model: string | null; costUsd: string | null; summary: string | null; error: string | null; startedAt: string; endedAt: string | null }
export interface Step { id: number; position: number; text: string; status: 'pending' | 'in_progress' | 'completed' }
export interface Issue {
  id: string; appId: string; identifier: string; number: number; kind: 'code' | 'todo'; parentId: string | null; projectId: string | null; cycleId: string | null; ideaId: string | null
  title: string; description: string | null; brief: string | null; state: IssueState; priority: number; estimate: string | null; sortOrder: number
  assignee: string | null; delegate: 'builder' | 'planner' | 'agent' | null; waitingOn: string | null; source: 'person' | 'agent' | 'idea' | 'planner' | 'builder'; reason: string | null
  createdBy: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; canceledAt: string | null
  briefApprovedBy?: string | null; briefApprovedAt?: string | null; workflowId?: string | null
  /** How we will know it is done: approved with the brief. */
  acceptance?: Criterion[]
}
/** A code sub-issue on the graph, with its build: the engine's status, attempts, why it waits. */
export interface GraphSubIssue extends Issue {
  status: BuildStatus; attempt: number; maxAttempts: number; branch: string | null; heldReason: string | null
  dependsOn: string[]; orderedAfter?: string[] // explicit dependencies; and issue order, drawn (finishers of the issue before)
  files: string[]; lastRun: Run | null; steps?: Step[]
}
export interface GraphIssue extends Issue { subIssueIds: string[] }
/** What a project has to cover: in its Backlog, or left without being built (a duplicate of what covers it, or canceled with why). */
export interface BacklogIssue extends Issue { duplicateOf: string | null }
// What the planner settled (provisional until a person approves) and what it could not.
export interface Decision { id: string; issueId: string | null; question: string; options: { key: string; text: string; recommended: boolean }[]; chosen: string | null; provisional: boolean; rationale: string | null }
export interface Question { id: string; issueId: string | null; text: string; options: { label: string; description: string; changes: string[]; recommended: boolean }[]; reason: string | null; cost: 'cheap' | 'moderate' | 'expensive' | null; status: string; answer: string | null }
/** Work around the code: an issue of kind todo, its checklist lines its sub-issues. */
export interface ChecklistLine extends Issue { text: string; done: boolean; position: number }
export interface Todo extends Issue { notes: string | null; owner: 'person' | 'agent'; status: 'open' | 'done' | 'dropped'; checklist: ChecklistLine[]; project?: { id: string; name: string; status: string } | null }
export interface Pr { id: string; issueId: string | null; number: number | null; url: string | null; status: string }
export interface Graph {
  project: { id: string; name: string; description: string | null; content: string | null; status: string; integrationBranch: string | null; createdAt: string; solo?: boolean } // solo: one task on its own, never listed as a project
  app: { id: string; name: string; key: string; defaultBranch: string }
  pr: Pr | null; prs: Pr[]
  issues: GraphIssue[] // in order: the order they are built in
  subIssues: GraphSubIssue[]
  backlog: BacklogIssue[]
  todos: Todo[] // work outside the code that unblocks this project
  decisions: Decision[]
  questions: Question[]
  conflicts: [string, string][] // open sub-issues that claim the same path: they take turns
  files?: GraphFile[] // the paths more than one open sub-issue claims, as nodes of their own
}
/** A file on the graph: who claims it, and who has it right now (the sub-issue being built with it). */
export interface GraphFile { path: string; subIssues: string[]; heldBy: string | null }
export interface ProjectSummary { id: string; name: string; status: string; createdAt: string; ideaId?: string | null; app: { id: string; name: string } | null; issueCount: number; backlogOpen?: number; builds: Record<string, number> }
export interface IssueRow { id: string; identifier: string; number: number; title: string; description: string | null; state: IssueState; sortOrder: number; priority: number; project: { id: string; name: string; status: string; solo?: boolean } | null; builds: Record<string, number>; planning: string | null }
/** What was written on a ticket as it moved: one comment per heading (the plan, the handoff, the review), the latest write of each. */
export interface IssueComment { id: string; issueId: string; heading: string; body: string; author: string; createdAt: string; updatedAt: string }
export interface IssueDetail extends Issue {
  comments: IssueComment[]
  runner: 'tkt' | null // who builds it once the brief is approved: tkt, or Self Evident's own agents
  project: { id: string; name: string; status: string; solo?: boolean } | null; parent: { id: string; identifier: string; title: string } | null
  build: { status: BuildStatus; attempt: number; heldReason: string | null } | null; questions: Question[]; decisions: Decision[]
  relations: { issueId: string; relatedIssueId: string; type: 'blocks' | 'related' | 'duplicate' }[]
  subIssues: (Issue & { build: { status: BuildStatus; attempt: number; heldReason: string | null } | null })[]
  steps: { id: number; text: string; status: 'pending' | 'in_progress' | 'completed' }[]; stepsAttempt: number | null
}
export interface Initiative { id: string; name: string; description: string | null; status: 'planned' | 'active' | 'completed'; targetDate: string | null; projects: { id: string; name: string; status: string }[] }
export interface Cycle { id: string; number: number; name: string | null; description: string | null; startsAt: string; endsAt: string; current: boolean; issues: { id: string; identifier: string; title: string; state: IssueState; kind: string }[] }
/** Steps on an idea, a task (an issue) or a project; the rules are the engine's own module (LOG.md, 2026-10-29). */
export type StepSubject = { kind: 'ideas' | 'issues' | 'projects'; id: string }
export interface StepsView { on: On; resolved: Resolved; states: StepState[]; rows: Row[]; blocking: StepKey[]; fromIdea: { id: string; number: number; title: string } | null }
export interface StepWork { id: string; key: StepKey; status: 'none' | 'started' | 'done'; detail: string | null; body: string | null; refs: string[]; updatedBy: string | null; updatedAt: string | null }
export interface WorkflowRow extends Workflow { appDefault: boolean; projects: number; tasks: number }
export interface IdeaRow { id: string; appId: string; number: number; title: string; body: string | null; lane: string }
export interface AppSetup { /** The repository an agent starts in, when the app has several (a repo id). */ home_repo?: string; integrations?: IntegrationValues; plugins?: Record<string, { on: boolean }>; pr_mode?: 'project' | 'issue'; test_cmd?: string; prototype_cmd?: string; /** Run when a prototype is stopped, restarted or discarded: for what the start command leaves running. */ prototype_stop_cmd?: string; prototype_db?: { url: string; env?: string; schema_cmd?: string }; model?: string; max_budget_usd?: number; max_turns?: number; references?: AppReference[]; /** The app's skills for steps of its workflow: a step's key to the skills (as a session names them) to use when doing it. */ step_skills?: Record<string, string[]>; /** The app's own skill per job (a category key): a skill's key, or null for none. A job left out follows All apps. */ skills_by_job?: Record<string, string | null>; /** The app's own Claude account: the name of a variable holding an API key, or a config folder with its own login. Neither: the engine's default. */ account?: { key_env?: string; config_dir?: string } }
/** Which Claude account an app's agents run on, as the engine finds it. */
export interface AccountStatus { kind: 'default' | 'key' | 'login'; ok: boolean; note: string }
/** Another app whose checkout this app's agents may read and never change (the engine's references.ts). */
export interface AppReference { appId: string; note?: string }
export interface Repo { id: string; appId: string; fullName: string; localPath: string | null; baseBranch: string | null }
/** One of the person's repositories on GitHub, as gh lists them; `problem` is why there is no list (gh missing, signed out). */
export interface GitHubRepo { fullName: string; defaultBranch: string; private: boolean }
export interface GitHubRepos { repos: GitHubRepo[]; problem: string | null }
/** Something an app or a project is worked from: a name, where it is (a link, or a path on this computer) and a line on what it is. */
export interface Asset { id: string; appId: string; projectId: string | null; name: string; location: string; note: string | null }
/** A ticket of the app's Linear team, as the engine lists it for bringing in; `task` is the task it already is here. */
export interface LinearTicket {
  id: string; identifier: string; title: string; url: string; branchName: string | null; priority: number
  state: { name: string; type: string }; assignee: string | null; mine: boolean; project: string | null; task: { id: string; identifier: string } | null
}
export type LinearScope = 'mine' | 'unassigned' | 'all'
export interface LinearImported { made: { id: string; identifier: string; title: string; linear: string }[]; updated: { id: string; identifier: string; title: string; linear: string }[]; missing: string[] }
/** A folder on the engine's computer and the git repositories in it (itself, or the ones directly inside); `path` null: the folder dialog was closed. */
export interface FoundRepo { name: string; path: string; fullName: string | null; branch: string | null }
export interface Folder { path: string | null; repos: FoundRepo[] }
export interface App { id: string; workspaceId?: string; name: string; key: string; defaultBranch: string; setup?: AppSetup; repos?: Repo[] }
export interface Workspace { id: string; name: string; settings?: { integrations?: IntegrationValues } }

// Settings: integrations set for the workspace and overridden per app field by field; plugins switched for the
// workspace and per app; each plugin skill filed under the job it covers (the catalogue).
export type IntegrationValues = Record<string, Record<string, string>>
export interface Integration {
  key: string; name: string; role: string; does: string
  fields: { key: string; label: string; placeholder?: string; required?: boolean; secret?: boolean; kind?: 'switch'; states?: { on: string; off: string } }[] // a switch holds "true" or "false"; states say what each means
  calls: boolean; actions: { key: string; name: string; does: string; kind?: 'start' | 'link' | 'ask'; ask?: string }[]; docs?: string // an action with a kind is a button on the page: start the tool, open what the check found, hand the agent a job
  perApp?: boolean // switched on under each app (a runner like tkt), nothing to set for all apps
}
/** Where an integration stands: nothing set, missing fields, its key not in the engine's environment, or ready. */
export interface IntegrationStatus { state: 'off' | 'incomplete' | 'no-key' | 'ready'; missing: string[]; keyVar: string | null }
export type EffectiveValues = Record<string, Record<string, { value: string | null; from: 'app' | 'workspace' | null }>>
export type AgentRole = 'talk' | 'planner'
export interface SkillInfo { key: string; name: string; description: string }
export interface PluginSkill extends SkillInfo { category: string | null; on: boolean }
export type Ratings = Record<'free' | 'moderate' | 'expensive', number>
export interface PluginInfo {
  id: string; name: string; version: string | null; description: string; source: string | null; builtIn: boolean
  /** Where a built-in plugin's skills are kept on this computer: a folder per skill. */ skillsDir?: string | null
  on: boolean; roles: AgentRole[]; mcpServers: string[]; note: string | null; skills: PluginSkill[]; tools: { count: number; ratings: Ratings } | null
}
export interface SkillSource { url: string; commit: string; pulledAt: string; skills: string[] }
/** What a pull did; `skipped` are names a skill from somewhere else already holds here, left alone. */
export interface PulledSkills { source: SkillSource; added: string[]; updated: string[]; unchanged: string[]; removed: string[]; skipped: string[] }
export interface Category { key: string; name: string; for: string; builtIn?: string }
export interface CategoryGroup { name: string; categories: Category[] }
export interface FactorySettings { workspace: Workspace | null; integrations: Integration[]; values: IntegrationValues; status: Record<string, IntegrationStatus>; plugins: PluginInfo[]; catalogue: CategoryGroup[] }
export interface AppPlugin { id: string; name: string; factoryOn: boolean; own: boolean | null; on: boolean }
/** A job, for an app: the skills filed under it (often none), the one All apps uses (`factory`), and this app's own choice when it made one (`own`: a skill, or null for none). */
export interface AppJob { key: string; name: string; for: string; /** Where it sits in the loop. */ group?: string; /** What the engine does there itself, when it does. */ builtIn?: string | null; skills: { key: string; name: string; plugin: string }[]; factory: string | null; overridden: boolean; own: string | null }
export interface AppSettings { integrations: EffectiveValues; status: Record<string, IntegrationStatus>; plugins: AppPlugin[]; /** Absent from an older engine. */ jobs?: AppJob[]; /** The skills this app's conversations get, to choose from for a step: `name` is how a session names it. */ usable?: UsableSkill[]; skills: SkillInfo[] }
export interface UsableSkill { name: string; label: string; from: string; description: string }
export interface Prototype {
  id: string; appId: string; projectId: string | null; ideaId?: string | null; issueId?: string | null; title: string; brief: string | null; sessionId: string | null; branch: string; path: string; port: number | null
  status: 'running' | 'stopped' | 'discarded'; url: string | null; createdAt: string; updatedAt?: string | null
  scenario: string | null; database?: string | null; scenarios?: string[]; up?: boolean; log?: string[]
}
/** A prototype's code: what changed since its branch left the default branch, and what the agent is showing there. */
export interface ChangedFile { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; added: number | null; removed: number | null; from?: string }
export interface ShownRef { id: string; kind: 'file' | 'link'; path?: string; url?: string; title?: string; note?: string; lines?: { from: number; to: number }[]; by: string; at: string }
export interface PrototypeCode { prototypeId: string; branch: string; base: string; files: ChangedFile[]; shown: ShownRef[] }
export interface PrototypeFile { path: string; patch: string | null; content: string | null; missing: boolean; unreadable: boolean }
/** One acceptance criterion of a task: a statement a person can check, how we will know, and what the prototype showed. */
export interface Criterion { id: string; text: string; check?: string; shown?: boolean; evidence?: string; /** For the final build only: the prototype skips it. */ buildOnly?: boolean; why?: string; by: string; at: string }
export interface AcceptanceChange { add?: { text: string; check?: string }[]; update?: { id: string; text?: string; check?: string | null; shown?: boolean | null; evidence?: string | null; buildOnly?: boolean; why?: string | null }[]; remove?: string[] }
export interface Event { seq: number; ts: string; type: string; actor: string; issueId: string | null; projectId: string | null; payload: Record<string, unknown> }
export interface NewSubIssue { key: string; title: string; description?: string; brief?: string; dependsOn?: string[]; files?: string[] }
export interface NewProjectIssue { title: string; description?: string; brief?: string; subIssues?: NewSubIssue[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status}`)
  return JSON.parse(text) as T
}

// The front door (GET /now): what's running, what needs a person, what just happened.
type Where = { projectId: string; projectName: string; appName: string }
export type Attention =
  | ({ kind: 'failed_build'; issueId: string; identifier: string; title: string; error: string | null } & Where)
  | ({ kind: 'question'; questionId: string; issueIdentifier: string | null; text: string; cost: string | null; askedAt: string } & Where)
  | ({ kind: 'run_project'; subIssues: number } & Where)
  | ({ kind: 'plan_issue'; issueId: string; identifier: string; issueTitle: string } & Where)
  | ({ kind: 'backlog'; open: number; items: string[] } & Where)
  | { kind: 'todo'; todoId: string; identifier: string; title: string; owner: string; projectId: string | null; projectName: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | ({ kind: 'merge_pr'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'pr_feedback'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'behind_main'; files: string; commits: number } & Where)
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | ({ kind: 'overlap'; prNumber: number; title: string; author: string | null; url: string | null; files: string[] } & Where)
export interface RunningProject {
  projectId: string; projectName: string; appName: string; status: string; integrationBranch: string | null; backlogOpen: number
  builds: { total: number; done: number; failed: number }
  live: { id: string; identifier: string; title: string; status: BuildStatus; step: string | null }[]
  held: { id: string; identifier: string; title: string; reason: string | null }[]
  pr: { number: number | null; url: string | null; status: string } | null
}
export interface FocusRef { kind: 'project' | 'issue' | 'task' | 'todo' | 'idea' | 'question' | 'pr' | 'teammate_pr' | 'initiative' | 'cycle'; label: string; projectId?: string; url?: string | null }
export interface FocusLine { text: string; refs: string[] }
export interface FocusBody { headline: string; people: { who: string; doing: FocusLine[] }[]; goals: { near: FocusLine[]; mid: FocusLine[]; long: FocusLine[] }; stated?: boolean; links: Record<string, FocusRef> }
export interface SummaryState { focus: { id: number; body: FocusBody; createdAt: string; trigger: 'person' | 'schedule'; costUsd: string | null } | null; writing: boolean; stale: boolean }
export interface Hold { until: string; reason: string; level: number }
export interface Now { hold?: Hold | null; running: RunningProject[]; needsYou: Attention[]; recent: Event[]; counts: { projects: number; running: number; needsYou: number } }

// Talk: a conversation with the factory's agent. Messages are rows; talk.* events say when to refetch.
export type Risk = 'free' | 'cheap' | 'moderate' | 'expensive'
export interface SubjectRef { projectId?: string; issueId?: string; ideaId?: string; prototypeId?: string; path?: string; /** About the app as a whole: no worktree. */ app?: boolean }
export interface TalkSession { id: string; appId: string | null; cwd: string | null; branch: string | null; worktreePath: string | null; subject: string | null; subjectRef: SubjectRef | null; title: string | null; status: string; createdAt: string; lastActiveAt: string | null; live: boolean; busy: boolean; messages?: number; autoApprove: Exclude<Risk, 'expensive'>
  terminalSince?: string | null; /** Its tab was closed in the agent's column: the conversation is still there. */ closedAt?: string | null; /** The task it belongs to: its own agent, or a prototype's started on it. */ taskId?: string | null; /** The idea it belongs to: its own agent, or a prototype's started on it. */ ideaId?: string | null } // handed to the terminal: what's said there is copied in until a message here takes it back
/** An agent a task's conductor has out, with its conversation. */
/** An agent a task's conductor has out: a prototype's builder, or a fresh agent on one check (`check`: its step). */
export interface TaskAgentOut { sessionId: string; kind: 'prototype' | 'check'; what: string; icon?: string; title: string; prototypeId?: string; check?: string; busy: boolean; /** Stopped on the person: what it asked to be allowed and has no answer to. */ asking?: { requestId: string; tool: string; what: string; risk: string; since: string } | null }
export interface TalkMessage { id: number; sessionId: string; author: 'user' | 'agent' | 'tool' | 'engine'; kind: 'text' | 'brief' | 'tool_call' | 'tool_result' | 'permission' | 'auto' | 'result' | 'error' | 'handoff'; body: string; payload: Record<string, any> | null; sentAt: string | null }
/** A Claude Code session run on an app in a terminal or an editor; `talkId` when it's already a conversation here. */
export interface ClaudeSession { id: string; cwd: string; branch: string | null; title: string | null; at: string; talkId: string | null }
export interface Transcript { session: TalkSession; messages: TalkMessage[]; pending: string[] }
export interface TalkContext { path: string; label?: string; projectId?: string; issueId?: string; appId?: string; ideaId?: string; tabs?: { title: string; path: string; focused?: boolean }[] } // where the person is, sent with each message

export const engine = {
  talks: (open = true) => call<TalkSession[]>('GET', `/talks${open ? '?open=1' : ''}`),
  startTalk: (body: { appId: string; subjectRef?: SubjectRef }) => call<TalkSession>('POST', '/talks', body),
  /** A task's own agent: its one conversation, or null; `startTaskTalk` starts it if the task has none. */
  taskTalk: (issueId: string) => call<TalkSession | null>('GET', `/issues/${issueId}/talk`),
  startTaskTalk: (issueId: string) => call<TalkSession>('POST', `/issues/${issueId}/talk`),
  /** An idea's own agent, as a task's: started (with its worktree) when the person first works on the idea. */
  ideaTalk: (ideaId: string) => call<TalkSession | null>('GET', `/ideas/${ideaId}/talk`),
  startIdeaTalk: (ideaId: string) => call<TalkSession>('POST', `/ideas/${ideaId}/talk`),
  ideaAgents: (ideaId: string) => call<TaskAgentOut[]>('GET', `/ideas/${ideaId}/agents`),
  /** The agents the task's conductor has out: today, each prototype's own conversation. */
  taskAgents: (issueId: string) => call<TaskAgentOut[]>('GET', `/issues/${issueId}/agents`),
  renameTalk: (id: string, subject: string) => call<TalkSession>('POST', `/talks/${id}/rename`, { subject }),
  transcript: (id: string) => call<Transcript>('GET', `/talks/${id}`),
  say: (id: string, text: string, context?: TalkContext) => call<{ messageId: number }>('POST', `/talks/${id}/say`, { text, context }),
  permission: (id: string, requestId: string, allow: boolean, always = false) => call<unknown>('POST', `/talks/${id}/permission`, { requestId, allow, always }),
  interrupt: (id: string) => call<unknown>('POST', `/talks/${id}/interrupt`),
  setAuto: (id: string, level: 'free' | 'cheap' | 'moderate') => call<TalkSession>('POST', `/talks/${id}/auto`, { level }),
  endTalk: (id: string) => call<{ ended: boolean; branchKept: string | null }>('POST', `/talks/${id}/end`),
  closeTalk: (id: string) => call<TalkSession>('POST', `/talks/${id}/close`),
  reopenTalk: (id: string) => call<TalkSession>('POST', `/talks/${id}/reopen`),
  handOff: (id: string) => call<{ command: string }>('POST', `/talks/${id}/handoff`),
  claudeSessions: (appId: string) => call<ClaudeSession[]>('GET', `/apps/${appId}/claude-sessions`),
  adopt: (body: { appId: string; cwd: string; agentSessionId: string }) => call<TalkSession>('POST', '/talks/adopt', body),
  // session: the conversation in front; its worktree's Storybook when it has one (branch says which), else the app's.
  // story: one to show; the answer says which this Storybook can show for it (itself, another of the same component, or none).
  storybook: (appId: string, session?: string | null, story?: string | null) => call<{ url: string | null; frame?: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[]; branch?: string | null; main?: boolean; story?: { asked: string; show: string | null; missing: boolean } }>('GET', `/apps/${appId}/storybook?${new URLSearchParams({ ...(session ? { session } : {}), ...(story ? { story } : {}) })}`),
  startStorybook: (appId: string, session?: string | null) => call<unknown>('POST', `/apps/${appId}/storybook/start${session ? `?session=${session}` : ''}`),
  // scope: a conversation's id (its worktree) or an app's (the main checkout).
  sketches: (scope: string) => call<{ scope: string; branch: string | null; main: boolean; dir: string; sketches: { file: string; changedAt: number }[] }>('GET', `/sketches/${scope}`),
  prototypes: (appId: string) => call<Prototype[]>('GET', `/apps/${appId}/prototypes`),
  prototype: (id: string) => call<Prototype>('GET', `/prototypes/${id}`),
  runPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start`),
  stopPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/stop`),
  restartPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start?restart=1`),
  resetPrototypeData: (id: string, scenario: string | null) => call<unknown>('POST', `/prototypes/${id}/data/reset`, { scenario }),
  savePrototypeData: (id: string, name: string) => call<unknown>('POST', `/prototypes/${id}/data/save`, { name }),
  prototypeCode: (id: string) => call<PrototypeCode>('GET', `/prototypes/${id}/code`),
  prototypeFile: (id: string, path: string) => call<PrototypeFile>('GET', `/prototypes/${id}/file?path=${encodeURIComponent(path)}`),
  unshowInPrototype: (id: string, shownId: string) => call<unknown>('DELETE', `/prototypes/${id}/shown/${encodeURIComponent(shownId)}`),
  prototypeTalk: (id: string) => call<{ id: string }>('POST', `/prototypes/${id}/talk`),
  now: (appId?: string) => call<Now>('GET', `/now${appId ? `?app=${appId}` : ''}`),
  ideas: (appId?: string) => call<IdeaRow[]>('GET', `/ideas${appId ? `?app=${appId}` : ''}`),
  createIdea: (body: { appId: string; title: string; body?: string }) => call<IdeaRow>('POST', '/ideas', body),
  planIdea: (id: string) => call<{ project: { id: string } }>('POST', `/ideas/${id}/project`, {}),
  convertIdea: (id: string, body: { as: 'task' | 'project'; title?: string; projectId?: string; why?: string }) => call<{ as: 'task' | 'project'; issueId?: string; projectId?: string }>('POST', `/ideas/${id}/convert`, body),
  ask: (body: { appId: string; subjectRef?: SubjectRef; text: string; /** For an idea: start its own agent if it has none. */ own?: boolean }) => call<TalkSession>('POST', '/talks/ask', body),
  plan: (appId: string) => call<Plan>('GET', `/plan?app=${appId}`),
  steps: (s: StepSubject) => call<StepsView>('GET', `/${s.kind}/${s.id}/steps`),
  step: (s: StepSubject, key: StepKey) => call<StepWork | null>('GET', `/${s.kind}/${s.id}/steps/${key}`),
  setStep: (s: StepSubject, key: StepKey, body: { status?: 'started' | 'done'; detail?: string | null; body?: string | null; refs?: string[] }) => call<StepWork>('PUT', `/${s.kind}/${s.id}/steps/${key}`, body),
  /** A person approves a step of a task (research, sketches, mockups, the prototype), or takes it back. */
  approveStep: (issueId: string, key: StepKey, approve = true) => call<StepWork>('POST', `/issues/${issueId}/steps/${key}/approve`, { approve }),
  setAcceptance: (issueId: string, change: AcceptanceChange) => call<{ acceptance: Criterion[]; note?: string }>('PUT', `/issues/${issueId}/acceptance`, change),
  approveBrief: (issueId: string, approve = true) => call<Issue>('POST', `/issues/${issueId}/brief/approve`, { approve }),
  workflows: (appId: string) => call<WorkflowRow[]>('GET', `/workflows?app=${appId}`),
  saveWorkflow: (body: { id?: string; appId: string; name: string; steps: WorkflowStep[]; ordered: boolean }) => call<Workflow>(body.id ? 'PUT' : 'POST', body.id ? `/workflows/${body.id}` : '/workflows', body),
  useWorkflow: (target: { kind: 'apps' | 'projects' | 'issues'; id: string }, workflowId: string | null) => call<{ ok: true }>('POST', `/${target.kind}/${target.id}/workflow`, { workflowId }),
  apps: () => call<App[]>('GET', '/apps'),
  workspaces: () => call<Workspace[]>('GET', '/workspaces'),
  settings: () => call<FactorySettings>('GET', '/settings'),
  updateWorkspace: (id: string, body: { name?: string; integrations?: IntegrationValues }) => call<Workspace>('PATCH', `/workspaces/${id}`, body),
  appSettings: (id: string) => call<AppSettings>('GET', `/apps/${id}/settings`),
  appAccount: (id: string) => call<AccountStatus>('GET', `/apps/${id}/account`),
  checkIntegration: (key: string, appId?: string) => call<{ ok: boolean; detail: string; links?: { label: string; href: string }[] }>('POST', `/integrations/${key}/check`, { appId }),
  // Set up what's missing: what the engine did itself (did), whether the rest went to the agent (ask), or what waits on the person (detail).
  setupIntegration: (key: string, appId: string) => call<{ done: boolean; did: string[]; ask: string | null; detail: string; talkId: string | null }>('POST', `/integrations/${key}/setup`, { appId }),
  trackerGuide: async (appId: string) => { // the repo's docs/agents/issue-tracker.md for this app, filled in (Markdown, not JSON)
    const res = await fetch(`${API}/apps/${appId}/tracker-guide`)
    const text = await res.text()
    if (!res.ok) throw new Error(text || `${res.status}`)
    return text
  },
  installPlugin: (marketplace: string, name: string) => call<{ id: string }>('POST', '/plugins', { marketplace, name }),
  /** One of your own skills, for every app: written as a SKILL.md outside every repo. */
  addSharedSkill: (body: { name: string; description: string; body: string }) => call<{ key: string; name: string; file: string }>('POST', '/skills/shared', body),
  /** Repositories skills were pulled from, into the shared skills. */
  skillSources: () => call<SkillSource[]>('GET', '/skills/sources'),
  /** Pull a repository's skills, or bring the ones already pulled from it up to date. */
  pullSkills: (url: string) => call<PulledSkills>('POST', '/skills/sources', { url }),
  removeSkillSource: (url: string) => call<{ removed: string[] }>('DELETE', `/skills/sources?url=${encodeURIComponent(url)}`),
  removePlugin: (id: string) => call<{ ok: true }>('DELETE', `/plugins/${encodeURIComponent(id)}`),
  updatePlugin: (id: string, body: { on?: boolean; roles?: AgentRole[] }) => call<{ ok: true }>('PATCH', `/plugins/${encodeURIComponent(id)}`, body),
  fileSkill: (key: string, body: { category?: string | null; on?: boolean }) => call<{ ok: true }>('PATCH', `/skills/${key.split('/').map(encodeURIComponent).join('/')}`, body),
  createWorkspace: (name: string) => call<Workspace>('POST', '/workspaces', { name }),
  // The code may come with the app; a local checkout is made ready as it is set, and `note` says what the engine did.
  createApp: (body: { workspaceId: string; name: string; key?: string; defaultBranch?: string; setup?: AppSetup; repo?: { fullName?: string; localPath?: string } }) => call<App & { note: string | null }>('POST', '/apps', body),
  githubRepos: () => call<GitHubRepos>('GET', '/github/repos'),
  updateApp: (id: string, body: { name?: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('PATCH', `/apps/${id}`, body),
  createRepo: (body: { appId: string; fullName: string; localPath?: string; baseBranch?: string }) => call<Repo & { note: string | null }>('POST', '/repos', body),
  /** The open tickets of the app's Linear team (Integrations › Linear). Reads Linear; nothing is written there. */
  linearTickets: (appId: string, scope: LinearScope) => call<{ team: string; tickets: LinearTicket[] }>('GET', `/apps/${appId}/linear/tickets?scope=${scope}`),
  importLinear: (appId: string, identifiers: string[]) => call<LinearImported>('POST', `/apps/${appId}/linear/import`, { identifiers }),
  /** The app's assets, or with a project that project's own. Every conversation there is told them. */
  assets: (appId: string, projectId?: string) => call<Asset[]>('GET', `/apps/${appId}/assets${projectId ? `?project=${projectId}` : ''}`),
  addAsset: (body: { appId: string; projectId?: string; name: string; location: string; note?: string }) => call<Asset>('POST', '/assets', body),
  removeAsset: (id: string) => call<{ removed: string }>('DELETE', `/assets/${id}`),
  deleteRepo: (id: string) => call<{ removed: string }>('DELETE', `/repos/${id}`),
  /** Opens the folder dialog on the engine's computer (or scans `path`) and says which repositories are there. */
  chooseFolder: (path?: string) => call<Folder>('POST', '/folders/choose', path ? { path } : {}),
  updateRepo: (id: string, body: { fullName?: string; localPath?: string | null; baseBranch?: string | null }) => call<Repo & { note: string | null }>('PATCH', `/repos/${id}`, body),
  projects: (appId?: string) => call<ProjectSummary[]>('GET', `/projects${appId ? `?app=${appId}` : ''}`),
  graph: (id: string) => call<Graph>('GET', `/projects/${id}/graph`),
  createProject: (body: { appId: string; name: string; content?: string; description?: string; ideaId?: string; workflowId?: string; issues?: NewProjectIssue[] }) => call<{ project: { id: string } }>('POST', '/projects', body),
  cancelProject: (projectId: string) => call<{ cancelled: number; landed: number }>('POST', `/projects/${projectId}/cancel`),
  start: (id: string) => call<unknown>('POST', `/projects/${id}/start`),
  tick: (id: string) => call<unknown>('POST', `/projects/${id}/tick`),
  addIssueToProject: (projectId: string, body: { title: string; brief?: string; description?: string }) => call<Issue>('POST', `/projects/${projectId}/issues`, body),
  // Issues: code or to-do, in a project or not, in order.
  codeIssues: (appId: string) => call<IssueRow[]>('GET', `/issues?app=${appId}&view=code`),
  issues: (appId: string, f: { kind?: 'code' | 'todo'; project?: string; top?: boolean; open?: boolean } = {}) => call<Issue[]>('GET', `/issues?app=${appId}${f.kind ? `&kind=${f.kind}` : ''}${f.project ? `&project=${f.project}` : ''}${f.top ? '&top=1' : ''}${f.open ? '&open=1' : ''}`),
  issue: (id: string) => call<IssueDetail>('GET', `/issues/${id}`),
  createIssue: (body: { appId: string; title: string; kind?: 'code' | 'todo'; brief?: string; description?: string; projectId?: string; parentId?: string; state?: 'todo' | 'backlog'; workflowId?: string }) => call<Issue>('POST', '/issues', body),
  /** A task with no work on it, gone with its sub-tasks; the engine refuses one with work on it and says to cancel it. */
  deleteIssue: (id: string) => call<{ deleted: string; title: string; subIssues: number; talksEnded: number }>('DELETE', `/issues/${id}`),
  updateIssue: (id: string, body: { title?: string; description?: string | null; brief?: string | null; priority?: number; projectId?: string | null; cycleId?: string | null }) => call<Issue>('PATCH', `/issues/${id}`, body),
  setState: (id: string, state: IssueState, reason?: string) => call<Issue>('POST', `/issues/${id}/state`, { state, reason }),
  reorder: (ids: string[]) => call<string[]>('POST', '/issues/reorder', { ids }),
  addSubIssues: (issueId: string, subs: NewSubIssue[]) => call<unknown>('POST', `/issues/${issueId}/sub-issues`, subs),
  planIssue: (issueId: string) => call<{ runId: string }>('POST', `/issues/${issueId}/plan`), // 202; the outcome arrives as issue.planned / issue.plan_failed
  clearSubIssues: (issueId: string) => call<{ cleared: number }>('DELETE', `/issues/${issueId}/sub-issues`), // a draft issue back to its brief
  answer: (questionId: string, answer: string) => call<unknown>('POST', `/questions/${questionId}/answer`, { answer }),
  // A project's backlog: issues in its Backlog state.
  addBacklog: (projectId: string, text: string, body?: string) => call<Issue[]>('POST', `/projects/${projectId}/backlog`, { text, body }),
  addIdeaToBacklog: (projectId: string, ideaId: string) => call<Issue>('POST', `/projects/${projectId}/backlog`, { ideaId }),
  takeOn: (issueId: string) => call<Issue>('POST', `/backlog/${issueId}/take`, {}),
  markDuplicate: (issueId: string, of: string) => call<Issue>('POST', `/backlog/${issueId}/duplicate`, { of }),
  dropItem: (issueId: string, reason: string) => call<Issue>('POST', `/backlog/${issueId}/drop`, { reason }),
  reopenItem: (issueId: string) => call<Issue>('POST', `/backlog/${issueId}/reopen`, {}),
  initiatives: (appId: string) => call<Initiative[]>('GET', `/initiatives?app=${appId}`),
  cycles: (appId: string) => call<Cycle[]>('GET', `/cycles?app=${appId}`),
  todos: (appId: string) => call<Todo[]>('GET', `/todos?app=${appId}`),
  createTodo: (body: { appId: string; title: string; notes?: string; owner?: 'person' | 'agent'; projectId?: string; checklist?: string[] }) => call<Todo>('POST', '/todos', body),
  updateTodo: (id: string, body: { title?: string; notes?: string | null; owner?: 'person' | 'agent'; projectId?: string | null }) => call<Todo>('PATCH', `/todos/${id}`, body),
  addChecklist: (id: string, items: string[]) => call<Todo>('POST', `/todos/${id}/checklist`, { items }),
  setLine: (lineId: string, body: { done?: boolean; waitingOn?: string | null; text?: string }) => call<Todo>('PATCH', `/checklist/${lineId}`, body),
  removeLine: (lineId: string) => call<Todo>('DELETE', `/checklist/${lineId}`),
  draftChecklist: (id: string) => call<Todo>('POST', `/todos/${id}/draft`),
  todoDone: (id: string) => call<Todo>('POST', `/todos/${id}/done`),
  dropTodo: (id: string, reason: string) => call<Todo>('POST', `/todos/${id}/drop`, { reason }),
  reopenTodo: (id: string) => call<Todo>('POST', `/todos/${id}/reopen`),
  itemToTodo: (issueId: string) => call<Todo>('POST', `/backlog/${issueId}/todo`, {}),
  summary: (appId: string) => call<SummaryState>('GET', `/apps/${appId}/summary`),
  writeSummary: (appId: string) => call<{ started: boolean }>('POST', `/apps/${appId}/summary`),
  syncGithub: (appId: string) => call<{ prs?: { changes: string[] }; catchUp?: { projectId: string; state: string }[]; error?: string }>('POST', `/apps/${appId}/sync`),
  pause: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/pause`),
  resume: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/resume`),
  releaseHold: () => call<unknown>('POST', '/engine/release'),
  retry: (issueId: string, fresh = false) => call<{ identifier: string; fresh: boolean; resumed: number[] }>('POST', `/issues/${issueId}/retry`, { fresh }),
  setBuild: (issueId: string, status: BuildStatus) => call<unknown>('POST', `/issues/${issueId}/build`, { status }),
}

export const EVENT_TYPES = [
  'project.created', 'project.started', 'project.landed', 'project.cleaned', 'project.cancelled', 'project.paused', 'project.resumed', 'project.described',
  'issue.created', 'issue.deleted', 'issue.updated', 'issue.state', 'issue.reordered', 'issue.cleared', 'issue.planning', 'issue.planned', 'issue.plan_failed', 'issue.plan_waiting', 'issue.commented',
  'question.asked', 'question.answered', 'initiative.created', 'initiative.updated', 'cycle.created',
  'talk.message', 'talk.permission', 'talk.result', 'prototype.shown', 'idea.created', 'idea.converted', 'step.updated', 'brief.approved', 'brief.unapproved', 'workflow.saved', 'workflow.used', 'engine.hold', 'engine.resumed',
  'pr.merged', 'pr.closed', 'pr.retargeted', 'pr.review', 'pr.checks', 'review.requested', 'project.caught_up', 'project.behind_main',
  'backlog.error', 'project.backlog_open',
  'build.status', 'build.held', 'build.retry', 'build.failed', 'build.error', 'build.interrupted',
  'run.started', 'run.message', 'run.steps', 'run.tool_call', 'run.tool_result', 'run.result', 'run.error', 'run.rate_limit',
  'land.committed', 'land.tested', 'land.landed', 'land.conflict', 'land.retry', 'pr.opened', 'pr.updated', 'pr.error',
]

/** A project's graph, refreshed whenever the engine logs an event for it; plus the recent events themselves. */
/** The app's workflow rules, with its default, for choosing a new task's or project's. */
export function useWorkflows(appId: string | undefined) {
  const [list, setList] = useState<WorkflowRow[]>([])
  useEffect(() => { setList([]); if (appId) engine.workflows(appId).then(setList).catch(() => {}) }, [appId])
  return { workflows: list, defaultId: list.find((w) => w.appDefault)?.id ?? null }
}

/** The default's name when every choice of rules starts things as an idea: then nothing is made directly. */
export function useIdeaFirst(appId: string | undefined) {
  const { workflows, defaultId } = useWorkflows(appId)
  const needs = (w?: WorkflowRow) => !!w?.steps.find((x) => x.key === 'idea')?.required
  const def = workflows.find((w) => w.id === defaultId)
  return needs(def) && workflows.every((w) => needs(w)) ? def!.name : null
}

export function useLiveProject(projectId: string | undefined) {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!projectId) return
    let closed = false
    const refresh = () => engine.graph(projectId).then((g) => { if (!closed) setGraph(g) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = openEvents(`${API}/events?project=${projectId}`)
    const onAny = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as Event
      setEvents((prev) => [...prev.slice(-199), e])
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(refresh, 150) // one refetch per burst of events
    }
    for (const type of EVENT_TYPES) es.addEventListener(type, onAny as EventListener)
    es.onerror = () => setError('event stream disconnected; retrying')
    es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [projectId])
  return { graph, events, error }
}
