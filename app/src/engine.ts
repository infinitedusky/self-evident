/** The engine's API, as the UI sees it. In development Vite proxies /api → the engine; the UI never touches the database. */
import { useEffect, useRef, useState } from 'react'

export const API = '/api'

// idea → project (tasks in order) → task (title + brief) → phase (one agent, one worktree, one commit) → step (the builder's todo list)
export type PhaseStatus = 'queued' | 'ready' | 'running' | 'awaiting_answer' | 'merging' | 'testing' | 'done' | 'failed' | 'cancelled'

export interface Run { id: string; attempt: number; status: string; model: string | null; costUsd: string | null; summary: string | null; error: string | null; startedAt: string; endedAt: string | null }
export interface Step { id: number; position: number; text: string; status: 'pending' | 'in_progress' | 'completed' }
export interface GraphPhase {
  id: string; number: number; title: string; description?: string | null; brief: string | null; status: PhaseStatus; attempt: number; maxAttempts: number
  projectId: string; taskId: string; branch: string | null; heldReason: string | null
  dependsOn: string[]; orderedAfter?: string[] // explicit dependencies; and task order, drawn (finishers of the task before)
  files: string[]; lastRun: Run | null; steps?: Step[]
}
export interface GraphTask { id: string; number: number; position: number; title: string; description?: string | null; brief: string | null; phaseIds: string[] }
// What the planner settled (provisional until a person approves) and what it could not.
export interface Decision { id: string; taskId: string | null; question: string; options: { key: string; text: string; recommended: boolean }[]; chosen: string | null; provisional: boolean; rationale: string | null }
export interface Question { id: string; taskId: string | null; text: string; options: { label: string; description: string; changes: string[]; recommended: boolean }[]; reason: string | null; cost: 'cheap' | 'moderate' | 'expensive' | null; status: string; answer: string | null }
/** A line on a project's backlog: open, covered by a task, or dropped with a reason. */
export interface BacklogItem { id: string; text: string; body: string | null; source: 'person' | 'agent' | 'idea' | 'planner' | 'builder'; ideaId: string | null; state: 'open' | 'covered' | 'dropped'; taskId: string | null; todoId?: string | null; reason: string | null; createdAt: string }
/** Work around the code, with a checklist: on the app, beside its projects. */
export interface ChecklistLine { id: number; todoId: string; position: number; text: string; done: boolean; doneBy: string | null; waitingOn: string | null }
export interface Todo { id: string; appId: string; number: number; title: string; notes: string | null; owner: 'person' | 'agent'; status: 'open' | 'done' | 'dropped'; projectId: string | null; reason: string | null; createdAt: string; closedAt: string | null; checklist: ChecklistLine[]; project?: { id: string; title: string; status: string } | null }
export interface Graph {
  project: { id: string; title: string; status: string; integrationBranch: string | null; spec: string | null; createdAt: string }
  app: { id: string; name: string; defaultBranch: string }
  pr: { number: number; url: string; status: string } | null
  tasks: GraphTask[]
  phases: GraphPhase[]
  backlog: BacklogItem[]
  todos: Todo[] // work outside the code that unblocks this project
  decisions: Decision[]
  questions: Question[]
  conflicts: [string, string][] // open phases that claim the same path: they take turns
  files?: GraphFile[] // the paths more than one open phase claims, as nodes of their own
}
/** A file on the graph: who claims it, and who has it right now (the phase that is running with it). */
export interface GraphFile { path: string; phases: string[]; heldBy: string | null }
export interface ProjectSummary { id: string; title: string; status: string; createdAt: string; ideaId?: string | null; app: { id: string; name: string } | null; taskCount: number; backlogOpen?: number; phases: Record<string, number> }
export interface TaskRow { id: string; number: number; title: string; description: string | null; position: number; project: { id: string; title: string; status: string }; phases: Record<string, number>; planning: string | null }
export interface IdeaRow { id: string; appId: string; number: number; title: string; body: string | null; lane: string }
export interface AppSetup { pr_mode?: 'project' | 'task'; storybook_url?: string; storybook_cmd?: string; test_cmd?: string; preview_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }
export interface Repo { id: string; appId: string; fullName: string; localPath: string | null; baseBranch: string | null }
export interface App { id: string; workspaceId?: string; name: string; defaultBranch: string; setup?: AppSetup; repos?: Repo[] }
export interface Workspace { id: string; name: string }
export interface Event { seq: number; ts: string; type: string; actor: string; taskId: string | null; phaseId: string | null; projectId: string | null; payload: Record<string, unknown> }
export interface NewPhase { key: string; title: string; description?: string; brief?: string; dependsOn?: string[]; files?: string[] }
export interface NewTask { title: string; description?: string; brief?: string; phases?: NewPhase[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status}`)
  return JSON.parse(text) as T
}

// The front door (GET /now): what's running, what needs a person, what just happened.
export type Attention =
  | { kind: 'failed_phase'; projectId: string; planTitle: string; appName: string; phaseId: string; number: number; title: string; error: string | null }
  | { kind: 'question'; projectId: string; planTitle: string; appName: string; questionId: string; taskNumber: number | null; text: string; cost: string | null; askedAt: string }
  | { kind: 'run_project'; projectId: string; planTitle: string; appName: string; phases: number }
  | { kind: 'plan_task'; projectId: string; planTitle: string; appName: string; taskId: string; taskNumber: number; taskTitle: string }
  | { kind: 'backlog'; projectId: string; planTitle: string; appName: string; open: number; items: string[] }
  | { kind: 'todo'; todoId: string; number: number; title: string; owner: string; projectId: string | null; planTitle: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | { kind: 'merge_pr'; projectId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] }
  | { kind: 'pr_feedback'; projectId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] }
  | { kind: 'behind_main'; projectId: string; planTitle: string; appName: string; files: string; commits: number }
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | { kind: 'overlap'; appName: string; prNumber: number; title: string; author: string | null; url: string | null; files: string[]; projectId: string; planTitle: string }
export interface RunningPlan {
  projectId: string; planTitle: string; appName: string; status: string; integrationBranch: string | null
  phases: { total: number; done: number; failed: number }
  live: { id: string; number: number; title: string; status: PhaseStatus; step: string | null }[]
  held: { id: string; number: number; title: string; reason: string | null }[]
  pr: { number: number | null; url: string | null; status: string } | null
}
export interface Hold { until: string; reason: string; level: number }
export interface Now { hold?: Hold | null; running: RunningPlan[]; needsYou: Attention[]; recent: Event[]; counts: { projects: number; running: number; needsYou: number } }

// Talk: a conversation with the factory's agent. Messages are rows; talk.* events say when to refetch.
export type Risk = 'free' | 'cheap' | 'moderate' | 'expensive'
export interface SubjectRef { projectId?: string; ideaId?: string; path?: string }
export interface TalkSession { id: string; appId: string | null; cwd: string | null; branch: string | null; worktreePath: string | null; subject: string | null; subjectRef: SubjectRef | null; title: string | null; status: string; createdAt: string; lastActiveAt: string | null; live: boolean; busy: boolean; messages?: number; autoApprove: Exclude<Risk, 'expensive'> }
export interface TalkMessage { id: number; sessionId: string; author: 'user' | 'agent' | 'tool' | 'engine'; kind: 'text' | 'tool_call' | 'tool_result' | 'permission' | 'auto' | 'result' | 'error'; body: string; payload: Record<string, any> | null; sentAt: string | null }
export interface Transcript { session: TalkSession; messages: TalkMessage[]; pending: string[] }
export interface TalkContext { path: string; label?: string; projectId?: string; appId?: string; ideaId?: string } // where the person is, sent with each message

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
  storybook: (appId: string) => call<{ url: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[] }>('GET', `/apps/${appId}/storybook`),
  startStorybook: (appId: string) => call<unknown>('POST', `/apps/${appId}/storybook/start`),
  now: (appId?: string) => call<Now>('GET', `/now${appId ? `?app=${appId}` : ''}`),
  ideas: (appId?: string) => call<IdeaRow[]>('GET', `/ideas${appId ? `?app=${appId}` : ''}`),
  createIdea: (body: { appId: string; title: string; body?: string }) => call<IdeaRow>('POST', '/ideas', body),
  planIdea: (id: string) => call<{ project: { id: string } }>('POST', `/ideas/${id}/project`, {}),
  apps: () => call<App[]>('GET', '/apps'),
  workspaces: () => call<Workspace[]>('GET', '/workspaces'),
  createWorkspace: (name: string) => call<Workspace>('POST', '/workspaces', { name }),
  createApp: (body: { workspaceId: string; name: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('POST', '/apps', body),
  updateApp: (id: string, body: { name?: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('PATCH', `/apps/${id}`, body),
  createRepo: (body: { appId: string; fullName: string; localPath?: string; baseBranch?: string }) => call<Repo>('POST', '/repos', body),
  updateRepo: (id: string, body: { fullName?: string; localPath?: string | null; baseBranch?: string | null }) => call<Repo>('PATCH', `/repos/${id}`, body),
  tasks: (appId: string) => call<TaskRow[]>('GET', `/tasks?app=${appId}`),
  projects: (appId?: string) => call<ProjectSummary[]>('GET', `/projects${appId ? `?app=${appId}` : ''}`),
  graph: (id: string) => call<Graph>('GET', `/projects/${id}/graph`),
  createProject: (body: { appId: string; title: string; spec?: string; ideaId?: string; tasks: NewTask[] }) => call<{ project: { id: string } }>('POST', '/projects', body),
  addPhases: (taskId: string, phases: NewPhase[]) => call<unknown>('POST', `/tasks/${taskId}/phases`, phases),
  planTask: (taskId: string) => call<{ runId: string }>('POST', `/tasks/${taskId}/plan`), // 202; the outcome arrives as task.planned / task.plan_failed
  clearPhases: (taskId: string) => call<{ cleared: number }>('DELETE', `/tasks/${taskId}/phases`), // a draft task back to its brief
  cancelProject: (projectId: string) => call<{ cancelled: number; landed: number }>('POST', `/projects/${projectId}/cancel`),
  answer: (questionId: string, answer: string) => call<unknown>('POST', `/questions/${questionId}/answer`, { answer }),
  start: (id: string) => call<unknown>('POST', `/projects/${id}/start`),
  tick: (id: string) => call<unknown>('POST', `/projects/${id}/tick`),
  addBacklog: (projectId: string, text: string, body?: string) => call<BacklogItem[]>('POST', `/projects/${projectId}/backlog`, { text, body }),
  addIdeaToBacklog: (projectId: string, ideaId: string) => call<BacklogItem>('POST', `/projects/${projectId}/backlog`, { ideaId }),
  itemToTask: (itemId: string) => call<unknown>('POST', `/backlog/${itemId}/task`, {}),
  coverItem: (itemId: string, taskId: string) => call<unknown>('POST', `/backlog/${itemId}/cover`, { taskId }),
  dropItem: (itemId: string, reason: string) => call<unknown>('POST', `/backlog/${itemId}/drop`, { reason }),
  reopenItem: (itemId: string) => call<unknown>('POST', `/backlog/${itemId}/reopen`, {}),
  todos: (appId: string) => call<Todo[]>('GET', `/todos?app=${appId}`),
  createTodo: (body: { appId: string; title: string; notes?: string; owner?: 'person' | 'agent'; projectId?: string; checklist?: string[] }) => call<Todo>('POST', '/todos', body),
  updateTodo: (id: string, body: { title?: string; notes?: string | null; owner?: 'person' | 'agent'; projectId?: string | null }) => call<Todo>('PATCH', `/todos/${id}`, body),
  addChecklist: (id: string, items: string[]) => call<Todo>('POST', `/todos/${id}/checklist`, { items }),
  setLine: (lineId: number, body: { done?: boolean; waitingOn?: string | null; text?: string }) => call<Todo>('PATCH', `/checklist/${lineId}`, body),
  removeLine: (lineId: number) => call<Todo>('DELETE', `/checklist/${lineId}`),
  draftChecklist: (id: string) => call<Todo>('POST', `/todos/${id}/draft`),
  todoDone: (id: string) => call<Todo>('POST', `/todos/${id}/done`),
  dropTodo: (id: string, reason: string) => call<Todo>('POST', `/todos/${id}/drop`, { reason }),
  reopenTodo: (id: string) => call<Todo>('POST', `/todos/${id}/reopen`),
  itemToTodo: (itemId: string) => call<Todo>('POST', `/backlog/${itemId}/todo`, {}),
  syncGithub: (appId: string) => call<{ prs?: { changes: string[] }; catchUp?: { projectId: string; state: string }[]; error?: string }>('POST', `/apps/${appId}/sync`),
  pause: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/pause`),
  resume: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/resume`),
  releaseHold: () => call<unknown>('POST', '/engine/release'),
  retry: (phaseId: string, fresh = false) => call<{ phase: number; fresh: boolean; resumed: number[] }>('POST', `/phases/${phaseId}/retry`, { fresh }),
  setStatus: (phaseId: string, status: PhaseStatus) => call<unknown>('POST', `/phases/${phaseId}/status`, { status }),
}

export const EVENT_TYPES = [
  'project.created', 'project.started', 'project.landed', 'project.cleaned', 'task.created',
  'task.planning', 'task.planned', 'task.plan_failed', 'task.plan_waiting', 'task.cleared', 'project.cancelled', 'question.asked', 'question.answered',
  'talk.message', 'talk.permission', 'talk.result', 'idea.created', 'project.paused', 'project.resumed', 'engine.hold', 'engine.resumed',
  'pr.merged', 'pr.closed', 'pr.retargeted', 'pr.review', 'pr.checks', 'review.requested', 'project.caught_up', 'project.behind_main',
  'todo.created', 'todo.updated', 'todo.checked', 'todo.done', 'todo.dropped', 'todo.reopened',
  'backlog.added', 'backlog.covered', 'backlog.dropped', 'backlog.reopened', 'backlog.error', 'project.backlog_open',
  'phase.created', 'phase.status', 'phase.held', 'phase.retry', 'phase.failed', 'phase.error', 'phase.interrupted',
  'run.started', 'run.message', 'run.steps', 'run.tool_call', 'run.tool_result', 'run.result', 'run.error', 'run.rate_limit',
  'land.committed', 'land.tested', 'land.landed', 'land.conflict', 'land.retry', 'pr.opened', 'pr.updated', 'pr.error',
]

/** A project's graph, refreshed whenever the engine logs an event for it; plus the recent events themselves. */
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
    const es = new EventSource(`${API}/events?project=${projectId}`)
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
