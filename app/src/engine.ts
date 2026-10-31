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
  project: { id: string; name: string; description: string | null; content: string | null; status: string; integrationBranch: string | null; createdAt: string }
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
export interface IssueRow { id: string; identifier: string; number: number; title: string; description: string | null; state: IssueState; sortOrder: number; priority: number; project: { id: string; name: string; status: string } | null; builds: Record<string, number>; planning: string | null }
export interface IssueDetail extends Issue {
  project: { id: string; name: string; status: string } | null; parent: { id: string; identifier: string; title: string } | null
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
export interface AppSetup { integrations?: IntegrationValues; plugins?: Record<string, { on: boolean }>; pr_mode?: 'project' | 'issue'; storybook_url?: string; storybook_cmd?: string; test_cmd?: string; prototype_cmd?: string; prototype_db?: { url: string; env?: string; schema_cmd?: string }; model?: string; max_budget_usd?: number; max_turns?: number }
export interface Repo { id: string; appId: string; fullName: string; localPath: string | null; baseBranch: string | null }
export interface App { id: string; workspaceId?: string; name: string; key: string; defaultBranch: string; setup?: AppSetup; repos?: Repo[] }
export interface Workspace { id: string; name: string; settings?: { integrations?: IntegrationValues } }

// Settings: integrations set for the workspace and overridden per app field by field; plugins switched for the
// workspace and per app; each plugin skill filed under the job it covers (the catalogue).
export type IntegrationValues = Record<string, Record<string, string>>
export interface Integration {
  key: string; name: string; role: string; does: string
  fields: { key: string; label: string; placeholder?: string; required?: boolean; secret?: boolean }[]
  calls: boolean; actions: { key: string; name: string; does: string }[]; docs?: string
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
  on: boolean; roles: AgentRole[]; mcpServers: string[]; note: string | null; skills: PluginSkill[]; tools: { count: number; ratings: Ratings } | null
}
export interface Category { key: string; name: string; for: string; builtIn?: string }
export interface CategoryGroup { name: string; categories: Category[] }
export interface FactorySettings { workspace: Workspace | null; integrations: Integration[]; values: IntegrationValues; status: Record<string, IntegrationStatus>; plugins: PluginInfo[]; catalogue: CategoryGroup[] }
export interface AppPlugin { id: string; name: string; factoryOn: boolean; own: boolean | null; on: boolean }
export interface AppSettings { integrations: EffectiveValues; status: Record<string, IntegrationStatus>; plugins: AppPlugin[]; skills: SkillInfo[] }
export interface Prototype {
  id: string; appId: string; projectId: string | null; ideaId?: string | null; issueId?: string | null; title: string; brief: string | null; sessionId: string | null; branch: string; path: string; port: number | null
  status: 'running' | 'stopped' | 'discarded'; url: string | null; createdAt: string; updatedAt?: string | null
  scenario: string | null; database?: string | null; scenarios?: string[]; up?: boolean; log?: string[]
}
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
export interface SubjectRef { projectId?: string; issueId?: string; ideaId?: string; prototypeId?: string; path?: string }
export interface TalkSession { id: string; appId: string | null; cwd: string | null; branch: string | null; worktreePath: string | null; subject: string | null; subjectRef: SubjectRef | null; title: string | null; status: string; createdAt: string; lastActiveAt: string | null; live: boolean; busy: boolean; messages?: number; autoApprove: Exclude<Risk, 'expensive'>
  terminalSince?: string | null } // handed to the terminal: what's said there is copied in until a message here takes it back
export interface TalkMessage { id: number; sessionId: string; author: 'user' | 'agent' | 'tool' | 'engine'; kind: 'text' | 'brief' | 'tool_call' | 'tool_result' | 'permission' | 'auto' | 'result' | 'error' | 'handoff'; body: string; payload: Record<string, any> | null; sentAt: string | null }
export interface Transcript { session: TalkSession; messages: TalkMessage[]; pending: string[] }
export interface TalkContext { path: string; label?: string; projectId?: string; issueId?: string; appId?: string; ideaId?: string; tabs?: { title: string; path: string; focused?: boolean }[] } // where the person is, sent with each message

export const engine = {
  talks: (open = true) => call<TalkSession[]>('GET', `/talks${open ? '?open=1' : ''}`),
  startTalk: (body: { appId: string; subjectRef?: SubjectRef }) => call<TalkSession>('POST', '/talks', body),
  renameTalk: (id: string, subject: string) => call<TalkSession>('POST', `/talks/${id}/rename`, { subject }),
  transcript: (id: string) => call<Transcript>('GET', `/talks/${id}`),
  say: (id: string, text: string, context?: TalkContext) => call<{ messageId: number }>('POST', `/talks/${id}/say`, { text, context }),
  permission: (id: string, requestId: string, allow: boolean, always = false) => call<unknown>('POST', `/talks/${id}/permission`, { requestId, allow, always }),
  interrupt: (id: string) => call<unknown>('POST', `/talks/${id}/interrupt`),
  setAuto: (id: string, level: 'free' | 'cheap' | 'moderate') => call<TalkSession>('POST', `/talks/${id}/auto`, { level }),
  endTalk: (id: string) => call<{ ended: boolean; branchKept: string | null }>('POST', `/talks/${id}/end`),
  handOff: (id: string) => call<{ command: string }>('POST', `/talks/${id}/handoff`),
  storybook: (appId: string) => call<{ url: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[] }>('GET', `/apps/${appId}/storybook`),
  startStorybook: (appId: string) => call<unknown>('POST', `/apps/${appId}/storybook/start`),
  prototypes: (appId: string) => call<Prototype[]>('GET', `/apps/${appId}/prototypes`),
  prototype: (id: string) => call<Prototype>('GET', `/prototypes/${id}`),
  runPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start`),
  stopPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/stop`),
  restartPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start?restart=1`),
  resetPrototypeData: (id: string, scenario: string | null) => call<unknown>('POST', `/prototypes/${id}/data/reset`, { scenario }),
  savePrototypeData: (id: string, name: string) => call<unknown>('POST', `/prototypes/${id}/data/save`, { name }),
  prototypeTalk: (id: string) => call<{ id: string }>('POST', `/prototypes/${id}/talk`),
  now: (appId?: string) => call<Now>('GET', `/now${appId ? `?app=${appId}` : ''}`),
  ideas: (appId?: string) => call<IdeaRow[]>('GET', `/ideas${appId ? `?app=${appId}` : ''}`),
  createIdea: (body: { appId: string; title: string; body?: string }) => call<IdeaRow>('POST', '/ideas', body),
  planIdea: (id: string) => call<{ project: { id: string } }>('POST', `/ideas/${id}/project`, {}),
  convertIdea: (id: string, body: { as: 'task' | 'project'; title?: string; projectId?: string; why?: string }) => call<{ as: 'task' | 'project'; issueId?: string; projectId?: string }>('POST', `/ideas/${id}/convert`, body),
  ask: (body: { appId: string; subjectRef?: SubjectRef; text: string }) => call<TalkSession>('POST', '/talks/ask', body),
  plan: (appId: string) => call<Plan>('GET', `/plan?app=${appId}`),
  steps: (s: StepSubject) => call<StepsView>('GET', `/${s.kind}/${s.id}/steps`),
  step: (s: StepSubject, key: StepKey) => call<StepWork | null>('GET', `/${s.kind}/${s.id}/steps/${key}`),
  setStep: (s: StepSubject, key: StepKey, body: { status?: 'started' | 'done'; detail?: string | null; body?: string | null; refs?: string[] }) => call<StepWork>('PUT', `/${s.kind}/${s.id}/steps/${key}`, body),
  approveBrief: (issueId: string, approve = true) => call<Issue>('POST', `/issues/${issueId}/brief/approve`, { approve }),
  workflows: (appId: string) => call<WorkflowRow[]>('GET', `/workflows?app=${appId}`),
  saveWorkflow: (body: { id?: string; appId: string; name: string; steps: WorkflowStep[]; ordered: boolean }) => call<Workflow>(body.id ? 'PUT' : 'POST', body.id ? `/workflows/${body.id}` : '/workflows', body),
  useWorkflow: (target: { kind: 'apps' | 'projects' | 'issues'; id: string }, workflowId: string | null) => call<{ ok: true }>('POST', `/${target.kind}/${target.id}/workflow`, { workflowId }),
  apps: () => call<App[]>('GET', '/apps'),
  workspaces: () => call<Workspace[]>('GET', '/workspaces'),
  settings: () => call<FactorySettings>('GET', '/settings'),
  updateWorkspace: (id: string, body: { name?: string; integrations?: IntegrationValues }) => call<Workspace>('PATCH', `/workspaces/${id}`, body),
  appSettings: (id: string) => call<AppSettings>('GET', `/apps/${id}/settings`),
  checkIntegration: (key: string, appId?: string) => call<{ ok: boolean; detail: string }>('POST', `/integrations/${key}/check`, { appId }),
  installPlugin: (marketplace: string, name: string) => call<{ id: string }>('POST', '/plugins', { marketplace, name }),
  removePlugin: (id: string) => call<{ ok: true }>('DELETE', `/plugins/${encodeURIComponent(id)}`),
  updatePlugin: (id: string, body: { on?: boolean; roles?: AgentRole[] }) => call<{ ok: true }>('PATCH', `/plugins/${encodeURIComponent(id)}`, body),
  fileSkill: (key: string, body: { category?: string | null; on?: boolean }) => call<{ ok: true }>('PATCH', `/skills/${key.split('/').map(encodeURIComponent).join('/')}`, body),
  createWorkspace: (name: string) => call<Workspace>('POST', '/workspaces', { name }),
  createApp: (body: { workspaceId: string; name: string; key?: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('POST', '/apps', body),
  updateApp: (id: string, body: { name?: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('PATCH', `/apps/${id}`, body),
  createRepo: (body: { appId: string; fullName: string; localPath?: string; baseBranch?: string }) => call<Repo>('POST', '/repos', body),
  updateRepo: (id: string, body: { fullName?: string; localPath?: string | null; baseBranch?: string | null }) => call<Repo>('PATCH', `/repos/${id}`, body),
  projects: (appId?: string) => call<ProjectSummary[]>('GET', `/projects${appId ? `?app=${appId}` : ''}`),
  graph: (id: string) => call<Graph>('GET', `/projects/${id}/graph`),
  createProject: (body: { appId: string; name: string; content?: string; description?: string; ideaId?: string; workflowId?: string; issues: NewProjectIssue[] }) => call<{ project: { id: string } }>('POST', '/projects', body),
  cancelProject: (projectId: string) => call<{ cancelled: number; landed: number }>('POST', `/projects/${projectId}/cancel`),
  start: (id: string) => call<unknown>('POST', `/projects/${id}/start`),
  tick: (id: string) => call<unknown>('POST', `/projects/${id}/tick`),
  addIssueToProject: (projectId: string, body: { title: string; brief?: string; description?: string }) => call<Issue>('POST', `/projects/${projectId}/issues`, body),
  // Issues: code or to-do, in a project or not, in order.
  codeIssues: (appId: string) => call<IssueRow[]>('GET', `/issues?app=${appId}&view=code`),
  issues: (appId: string, f: { kind?: 'code' | 'todo'; project?: string; top?: boolean; open?: boolean } = {}) => call<Issue[]>('GET', `/issues?app=${appId}${f.kind ? `&kind=${f.kind}` : ''}${f.project ? `&project=${f.project}` : ''}${f.top ? '&top=1' : ''}${f.open ? '&open=1' : ''}`),
  issue: (id: string) => call<IssueDetail>('GET', `/issues/${id}`),
  createIssue: (body: { appId: string; title: string; kind?: 'code' | 'todo'; brief?: string; description?: string; projectId?: string; parentId?: string; state?: 'todo' | 'backlog'; workflowId?: string }) => call<Issue>('POST', '/issues', body),
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
  'issue.created', 'issue.updated', 'issue.state', 'issue.reordered', 'issue.cleared', 'issue.planning', 'issue.planned', 'issue.plan_failed', 'issue.plan_waiting',
  'question.asked', 'question.answered', 'initiative.created', 'initiative.updated', 'cycle.created',
  'talk.message', 'talk.permission', 'talk.result', 'idea.created', 'idea.converted', 'step.updated', 'brief.approved', 'brief.unapproved', 'workflow.saved', 'workflow.used', 'engine.hold', 'engine.resumed',
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
