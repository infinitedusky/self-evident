/** The engine's API, as the UI sees it. In development Vite proxies /api → the engine; the UI never touches the database. */
import { useEffect, useRef, useState } from 'react'
import type { On, Resolved, Row, StepKey, StepState, Workflow, WorkflowStep } from '@self-evident/engine/steps'
import type { Plan } from './pages/PlanHome'

export const API = '/api'
/** What a task's main runs on when it is compared: a copy of the data of the work beside it, or that work's own database. */
export type MainDataChoice = { mode: 'copy' | 'shared'; /** prototype:<id>, or smoke:<task id>:<set-up>. */ beside: string }
const mainQuery = (o: { touch?: boolean; update?: boolean; forId?: string; data?: MainDataChoice }) => { const q = [o.touch ? 'touch=1' : '', o.update ? 'update=1' : '', o.forId ? `for=${encodeURIComponent(o.forId)}` : '', o.data ? `data=${o.data.mode}&beside=${encodeURIComponent(o.data.beside)}` : ''].filter(Boolean).join('&'); return q ? `?${q}` : '' }

/** What a view holds of the event stream: its own listeners on a shared connection. */
export interface Events { addEventListener(type: string, fn: EventListener): void; onerror: EventListener | null; onopen: EventListener | null; close(): void }
interface Stream { es: EventSource; n: number; listeners: Set<readonly [string, EventListener]>; last: string | null; retry: number | undefined; down: boolean; heard: number; watch: number | undefined }
/** The engine pings every stream each 15 s. One that has said nothing for this long is dead, whatever the browser thinks. */
const QUIET_MS = 35_000
const streams = new Map<string, Stream>()

/**
 * Whether the pages can hear the engine. A page that cannot looks exactly like an agent that is not answering, so it
 * is said out loud (EngineLink): 'down' from the moment any stream fails until every one is open again.
 */
const linkListeners = new Set<(down: boolean) => void>()
export const engineDown = () => [...streams.values()].some((s) => s.down)
export function onEngineLink(fn: (down: boolean) => void) { linkListeners.add(fn); return () => { linkListeners.delete(fn) } }
const tellLink = () => { const d = engineDown(); for (const fn of linkListeners) fn(d) }

/** Where to pick the stream up again: after the last event this page saw, so nothing said in the gap is lost. */
export const resumeUrl = (url: string, last: string | null) => (last ? url.replace(/([?&])since=[^&]*/, `$1since=${last}`) : url)

/**
 * One connection, re-made when it dies, with every listener carried over. It dies two ways. The browser gives up on
 * it (refused with an error page): an error event, and the stream is closed. Or nobody says so: the engine restarts
 * behind the dev proxy, which keeps the browser's side open, so no error ever fires and the page just stops hearing.
 * The second is caught by listening for the engine's ping: silence for QUIET_MS means dead.
 */
function connect(url: string, s: Stream) {
  const es = new EventSource(resumeUrl(url, s.last))
  s.es = es
  s.heard = Date.now()
  for (const [type, fn] of s.listeners) es.addEventListener(type, fn)
  const alive = () => { s.heard = Date.now(); if (s.down) { s.down = false; tellLink() } }
  es.addEventListener('open', alive)
  es.addEventListener('ping', (e) => { const id = (e as MessageEvent).lastEventId; if (id && id !== '0' && !s.last) s.last = id; alive() }) // the first ping says where the stream started
  const again = (after: number) => {
    if (streams.get(url) !== s || s.retry !== undefined) return
    es.close()
    s.retry = window.setTimeout(() => { s.retry = undefined; if (streams.get(url) === s) connect(url, s) }, after)
  }
  es.addEventListener('error', () => {
    if (!s.down) { s.down = true; tellLink() }
    if (es.readyState === EventSource.CLOSED) again(1500) // the browser retries a dropped connection by itself, but not one refused with an error page
  })
  window.clearInterval(s.watch)
  s.watch = window.setInterval(() => {
    if (streams.get(url) !== s) { window.clearInterval(s.watch); return }
    if (s.es === es && Date.now() - s.heard > QUIET_MS) { if (!s.down) { s.down = true; tellLink() } again(0) }
  }, 5000)
}

/**
 * The engine's events at one address, one connection per address however many views listen: Chrome allows six
 * connections per host over HTTP/1.1, and a workspace of tabs, each opening its own streams, ran out, leaving the next
 * page stuck on Loading. Each view adds its own listeners and takes them off on close; the last to close ends it.
 * The connection survives the engine restarting: it is made again, from the last event seen (Sandy, 2026-11-14:
 * "none of the agents are responding to prompts … there's no error or anything telling me what's going on"; they
 * were answering, and the page had stopped listening).
 */
export function openEvents(url: string): Events {
  let s = streams.get(url)
  if (!s) { s = { es: null as never, n: 0, listeners: new Set(), last: null, retry: undefined, down: false, heard: Date.now(), watch: undefined }; streams.set(url, s); connect(url, s) }
  const shared = s
  shared.n++
  const mine: (readonly [string, EventListener])[] = []
  const add = (type: string, fn: EventListener) => {
    const seen: EventListener = (e) => { const id = (e as MessageEvent).lastEventId; if (id) shared.last = id; shared.heard = Date.now(); fn(e) }
    const entry = [type, type === 'error' || type === 'open' ? fn : seen] as const
    mine.push(entry); shared.listeners.add(entry); shared.es.addEventListener(entry[0], entry[1])
  }
  let closed = false
  return {
    addEventListener: add,
    set onerror(fn: EventListener | null) { if (fn) add('error', fn) },
    set onopen(fn: EventListener | null) { if (fn) add('open', fn) },
    get onerror() { return null }, get onopen() { return null },
    close() {
      if (closed) return
      closed = true
      for (const entry of mine) { shared.listeners.delete(entry); shared.es.removeEventListener(entry[0], entry[1]) }
      if (--shared.n === 0) { window.clearTimeout(shared.retry); window.clearInterval(shared.watch); shared.es.close(); streams.delete(url); tellLink() }
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
  createdBy: string | null; createdAt: string; updatedAt?: string | null; startedAt: string | null; completedAt: string | null; canceledAt: string | null
  briefApprovedBy?: string | null; briefApprovedAt?: string | null; workflowId?: string | null
  /** How we will know it is done: approved with the brief. */
  acceptance?: Criterion[]
}
/** A code sub-issue on the graph, with its build: the engine's status, attempts, why it waits. */
export interface GraphSubIssue extends Issue {
  status: BuildStatus; attempt: number; maxAttempts: number; branch: string | null; heldReason: string | null
  dependsOn: string[]; orderedAfter?: string[] // explicit dependencies; and issue order, drawn (finishers of the issue before)
  files: string[]; lastRun: Run | null; steps?: Step[]
  /** A stage of a checklist task's flow that is still to come: drawn so the graph is whole before it starts; there is no sub-task behind it. */
  ghost?: boolean
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
export interface ProjectSummary { id: string; name: string; status: string; createdAt: string; ideaId?: string | null; app: { id: string; name: string } | null; issueCount: number; backlogOpen?: number; builds: Record<string, number>; solo?: boolean; plannedTasks?: { id: string; identifier: string; title: string; subTasks: number }[] } // solo: a task's own project (only listed when asked for); plannedTasks: its tasks that have sub-tasks
/** The pull request a task's work is in. */
/** What was said on a pull request: a comment, a review (with its verdict), or a comment on a line. */
export interface PrComment { id: string; kind: 'comment' | 'review' | 'line'; author: string; body: string; at: string; url: string | null; state?: string; path?: string; line?: number | null }
/** A task's pull request as a step (the engine's pr-view.ts). */
/** A task's review copy (engine review-copy.ts): a branch a reviewer checks out and starts with one command, on made-up data. */
export interface ReviewCopyView {
  /** The branch a reviewer checks out. Null: the task has no pull request yet. */ branch: string | null
  pr: { branch: string; head: string | null; number: number | null } | null
  /** As last made. pushed: GitHub has it. inStep: it holds the pull request's head. */
  made: { from: string; fixture: string | null; try: string; services: { key: string; name: string; files: number }[]; files: string[]; at: string; sha: string; pushed: boolean; inStep: boolean } | null
  /** A branch of that name exists that Evident did not make: making it replaces it. */ byHand: boolean
  compare: string | null
  /** The app's own part of a review copy. Null: it has none. */ kit: { dir: string; start: string } | null
  /** The fixtures it may start from: none that holds something real. */ fixtures: string[]
  services: { key: string; name: string; says: string; blocked: string | null }[]
  /** Why it cannot be made as things stand. Empty: it can. */ waits: string[]
}
export interface PrView {
  issueId: string
  /** As GitHub has it now, or as last known when `problem` is set. Null: not submitted. */
  pr: { number: number; url: string; status: 'draft' | 'open' | 'closed' | 'merged'; title: string; body: string; review: string | null; mergeable: string | null; checks: { name: string; state: 'pass' | 'fail' | 'pending' | 'skipped' }[]; updatedAt: string | null } | null
  /** What it would open with, or what the next update sends. */
  message: { title: string; body: string; head: string; base: string } | null
  behind: boolean
  /** Its description as written for the team, when it has one: it leads the pull request, and our record is folded under it. Null: the merge guide leads. */
  written?: string | null
  /** The app's own form for a description (Settings › Landing), to start writing from. */
  template?: string | null
  landed: number; total: number; /** Criteria the build does not meet. */ failed?: number; /** Criteria with no mark yet: the check has not looked at them. Not a failure. */ unchecked: number; byHand: number
  /** What is owed at deploy, in order; and what is watched after. */ release?: ReleaseCheck[]; watch?: WatchCheck[]
  draft: boolean; auto: boolean
  canSubmit: boolean; waits: string[]; canReady: boolean
  comments: PrComment[]; problem: string | null
}
export interface TaskPr { number: number | null; url: string | null; status: string }
export interface IssueRow { id: string; identifier: string; number: number; title: string; description: string | null; state: IssueState; sortOrder: number; priority: number; project: { id: string; name: string; status: string; solo?: boolean } | null; builds: Record<string, number>; planning: string | null; pr?: TaskPr | null }
/** What was written on a ticket as it moved: one comment per heading (the plan, the handoff, the review), the latest write of each. */
export interface IssueComment { id: string; issueId: string; heading: string; body: string; author: string; createdAt: string; updatedAt: string }
/** Where a piece of work came from, word for word (the engine's origins.ts): what every agent on it is given. */
export interface OriginView {
  id: string; source: string; sourceName: string; ref: string; url: string | null; title: string; body: string | null
  comments: { author: string | null; at: string; body: string }[]; links: { title: string; url: string }[]
  /** Images and uploads in its text: kept on this computer for the agents, or not, with why. */
  files: { url: string; kept: boolean; note: string | null }[]; fetchedAt: string
}
export interface IssueDetail extends Issue {
  /** The team's ticket in force (ENT-322) and where it was read from: set on the task, its import, a link in its text, or the idea it came from. */ ticket?: string | null; ticketFrom?: 'set' | 'import' | 'link' | 'idea' | null
  /** The app requires a team ticket and this task has none: its branch and its pull request wait for one. */ ticketMissing?: boolean
  /** What was set by hand: the ticket, and the task's name as the team would say it (the {title} of its pull request and branch). */ teamTicket?: string | null; teamTitle?: string | null
  /** Where it came from, word for word, when it came from outside (its own, its project's or its idea's). */
  origin?: OriginView | null
  /** A built task not yet closed: whether a person can close it now, and if not, what it waits on, in their words. */
  close?: { can: boolean; waits: string[] }
  pr?: TaskPr | null // the pull request its work is in (a sub-task shows its task's)
  requirements?: { key: string; name: string; applies: boolean; how: string }[] | null // how its plan covers what the app requires of every plan
  madeBy: { sessionId: string; title: string; open: boolean } | null // the conversation that created it, when an agent did
  handover: { text: string | null; sessionId: string; at: string } | null // what that conversation said about it, written when the task's agent starts
  comments: IssueComment[]
  runner: 'tkt' | null // who builds it once the brief is approved: tkt, or Evident's own agents
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
export interface StepWork { id: string; key: StepKey; status: 'none' | 'started' | 'done'; detail: string | null; body: string | null; /** For the person, who will not read the body: a few bullets on what they need to know. */ summary?: string | null; refs: string[]; updatedBy: string | null; updatedAt: string | null }
export interface WorkflowRow extends Workflow { appDefault: boolean; projects: number; tasks: number }
export interface IdeaRow { id: string; appId: string; number: number; title: string; body: string | null; lane: string }
/** One smoke test set-up of an app, as it is kept in its settings. */
export interface SmokeSetupSetting { key: string; name: string; /** What a person checks there, in a line. */ what?: string; where?: 'local' | 'preview' | 'staging' | 'flag' | 'terminal'; url?: string; account?: string; flag?: string; cmd?: string; stop?: string; seed?: string; /** terminal: the build's checkout, or a new empty folder. */ folder?: 'build' | 'temp' }
export interface AppSetup { /** A task needs the team's own ticket before its branch is cut or its pull request opened; our id is never used in its place. */ ticket_required?: boolean; /** The app's differences from what the engine holds every build to, and its own (the engine's held.ts). Changed a change at a time (`held` on updateApp), never saved whole. */ held?: { key: string; name?: string; kind?: 'command' | 'skill' | 'judged' | 'built-in'; runs?: string; blocks?: boolean; on?: boolean }[]; /** A new task's branch, in the repository's convention ({ticket} {id} {title} {project}). */ branch_name?: string; /** A commit's first line, in the repository's convention; builders are told it and held to it. */ commit_format?: string; /** false: a pull request is opened only when the person presses Submit; else the engine opens a draft once a task is built and checked. */ pr_auto?: boolean; /** Where the app is smoke tested (the engine's smoke module); local when unset. */ smoke?: { /** The app's set-ups, each with a name; left out, it has one, from the fields beside this. */ setups?: SmokeSetupSetting[]; /** With one set-up: what is checked there, in a line. */ what?: string; name?: string; where?: 'local' | 'preview' | 'staging' | 'flag' | 'terminal'; url?: string; account?: string; flag?: string; /** A script of its own, any number of lines. */ cmd?: string; /** Run when it is stopped or started again. */ stop?: string; /** SQL that fills its database with made-up rows. */ seed?: string }; /** The repository an agent starts in, when the app has several (a repo id). */ home_repo?: string; integrations?: IntegrationValues; plugins?: Record<string, { on: boolean }>; pr_mode?: 'project' | 'issue'; /** A pull request's title, in the repository's convention: {ticket} {id} {title} {project} {n} {of}. */ pr_title?: string; /** The app's own form for a pull request's description: its sections, as text, and how to write them. They come before the repository's template. */ pr_description?: string; pr_description_how?: string; /** Opened as a draft unless false. */ pr_draft?: boolean; /** How thoroughly a prototype is built unless one is started otherwise: full (the way we would ship it) or rough (quick, to learn). Full when unset. */ prototype_depth?: 'full' | 'rough'; /** After an approved prototype: careful reads the plan before it is built; fast plans and builds. Careful when unset. */ speed?: 'careful' | 'fast'; /** What every plan must cover (the engine's own starting list when unset). */ requirements?: { key: string; name: string; what: string; on: boolean }[]; /** false: a task waits for Plan it and Run after its brief is approved; otherwise it builds by itself. */ auto_build?: boolean; test_cmd?: string; prototype_cmd?: string; /** Run when a prototype is stopped, restarted or discarded: for what the start command leaves running. */ prototype_stop_cmd?: string; /** Run after it when a prototype is discarded: removes what it made. */ prototype_discard_cmd?: string; prototype_db?: { url: string; env?: string; schema_cmd?: string; seed_cmd?: string }; model?: string; max_budget_usd?: number; max_turns?: number; references?: AppReference[]; /** The app's skills for steps of its workflow: a step's key to the skills (as a session names them) to use when doing it. */ step_skills?: Record<string, string[]>; /** The app's own skill per job (a category key): a skill's key, or null for none. A job left out follows All apps. */ skills_by_job?: Record<string, string | null>; /** The app's own Claude account: the name of a variable holding an API key, or a config folder with its own login. Neither: the engine's default. */ account?: { key_env?: string; config_dir?: string } }
/** One probe, as it was then, run on the app's last merged tasks, and what it said of each (the engine's trials.ts). */
export interface Trial { id: string; key: string; probe: { name: string; kind: 'command' | 'skill' | 'judged' | 'built-in'; runs: string }; status: 'running' | 'done' | 'failed'; tasks: number; costUsd: string | null; error: string | null; createdAt: string; results: { issueId: string; identifier: string; title: string; pr: number | null; pass: boolean | null; evidence: string; findings: string[] }[] }
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
  /** The idea it was brought in as, when it has not become a task. */
  idea?: { id: string; number: number } | null
}
export type LinearScope = 'mine' | 'unassigned' | 'all'
/** What a ticket was brought in as: an idea (`#12`) or, from a project's Add tasks, a task (`SS-50`). */
export interface LinearBrought { kind: 'idea' | 'task'; id: string; identifier: string; title: string; linear: string }
export interface LinearImported { made: LinearBrought[]; updated: LinearBrought[]; missing: string[] }
/** A folder on the engine's computer and the git repositories in it (itself, or the ones directly inside); `path` null: the folder dialog was closed. */
export interface FoundRepo { name: string; path: string; fullName: string | null; branch: string | null }
export interface Folder { path: string | null; repos: FoundRepo[] }
/** A put-away app and what it holds (Settings › Removed apps). */
export interface AppHolds { id: string; name: string; key: string; removedAt: string | null; tasks: number; projects: number; ideas: number; conversations: number; kept: string[] }
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
/** Whether an integration's key is set and where from, never the key: its last four characters, to tell two apart. */
export interface KeptKey { name: string; set: boolean; from: 'app' | 'shared' | 'environment' | null; last4: string | null }
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
export interface FactorySettings { workspace: Workspace | null; integrations: Integration[]; values: IntegrationValues; status: Record<string, IntegrationStatus>; /** Absent from an older engine. */ keys?: Record<string, KeptKey>; plugins: PluginInfo[]; catalogue: CategoryGroup[] }
export interface AppPlugin { id: string; name: string; factoryOn: boolean; own: boolean | null; on: boolean }
/** A job, for an app: the skills filed under it (often none), the one All apps uses (`factory`), and this app's own choice when it made one (`own`: a skill, or null for none). */
export interface AppJob { key: string; name: string; for: string; /** Where it sits in the loop. */ group?: string; /** What the engine does there itself, when it does. */ builtIn?: string | null; skills: { key: string; name: string; plugin: string }[]; factory: string | null; overridden: boolean; own: string | null }
export interface AppSettings { integrations: EffectiveValues; status: Record<string, IntegrationStatus>; /** Absent from an older engine. */ keys?: Record<string, KeptKey>; plugins: AppPlugin[]; /** Absent from an older engine. */ jobs?: AppJob[]; /** The skills this app's conversations get, to choose from for a step: `name` is how a session names it. */ usable?: UsableSkill[]; skills: SkillInfo[] }
export interface UsableSkill { name: string; label: string; from: string; description: string }
export interface Prototype {
  /** Its server has never been started: its agent starts it once the worktree is set up. */
  notStarted?: boolean
  /** Its guide has steps that no longer open since its data was rebuilt: what to do about it. */
  guideNote?: string
  /** It has no guide yet, so it cannot be approved: why, in a line. */
  needsGuide?: string
  /** Ports it listens on that it was not given: a second copy would share them. With what to do about it. */
  strayPorts?: number[]; strayNote?: string
  /** Addresses fixed to this computer that its page names (the engine's addresses.ts): it will not load through any other address. */
  fixedAddresses?: string[]; fixedNote?: string
  id: string; appId: string; projectId: string | null; ideaId?: string | null; issueId?: string | null; title: string; brief: string | null; sessionId: string | null; branch: string; path: string; port: number | null
  status: 'running' | 'stopped' | 'discarded'; url: string | null; createdAt: string; updatedAt?: string | null
  /** How thoroughly it was built: full, or rough (quick, to learn; not a base for the build). */
  depth?: 'full' | 'rough' | null
  scenario: string | null; database?: string | null; scenarios?: string[]; up?: boolean; log?: string[]
  /** What it runs in place of what is outside the system (the engine's stand-ins.ts): started and stopped with it. */
  standIns?: { key: string; name: string; what?: string; running: boolean; url: string | null }[]
  /** What someone opening its shared link is told, in the tab at the bottom right. */
  guide?: Guide | null
}
/**
 * The app's main, running (the engine's main-running.ts): what is there today, to look at beside what is being made.
 * how: run here ("local"), a deployed address, or "none" (the app has no command to start it yet).
 */
export interface MainRunning {
  /** The task (or prototype) it is beside, when it is that one's own and not the app's. */ for?: string | null
  /** A task's main: the data it was turned on with. */ data?: { mode: 'copy' | 'shared'; beside: string } | null
  /** It stopped by itself: when, with what, and its last lines. */ exited?: { at: string; code: number | null; log: string[] } | null
  appId: string; branch: string; how: 'local' | 'address' | 'none'; url: string | null; running: boolean; up: boolean; canRun: boolean
  /** The commit it runs and the branch's now; behind: the branch has moved on since it was turned on. */ sha: string | null; tip: string | null; behind: boolean
  log: string[]; standIns: { key: string; name: string; what?: string; running: boolean; url: string | null }[]; database: string | null
  /** With nobody looking for this long it turns itself off. */ idleMinutes: number | null; stopsAt: string | null
}
export interface Guide { intro?: string; steps: { title: string; path?: string; /** For something with no screen: a command, run in the prototype's worktree on a press. */ run?: string; try?: string }[]; by?: string; at?: string }
/** The last run of a guide step that is a command: how it ended and what it printed. */
export interface StepRun { step: number; command: string; status: 'running' | 'passed' | 'failed' | 'stopped'; exitCode: number | null; startedAt: string; endedAt: string | null; lines: string[] }
/** Another ngrok tunnel on this computer, holding the account's one address. */
export interface NgrokHolder { pid: number; what: string; service?: string }
/** A prototype's code: what changed since its branch left the default branch, and what the agent is showing there. */
export interface ChangedFile { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; added: number | null; removed: number | null; from?: string }
export interface ShownRef { id: string; kind: 'file' | 'link'; path?: string; url?: string; title?: string; note?: string; lines?: { from: number; to: number }[]; by: string; at: string }
export interface PrototypeCode { prototypeId: string; branch: string; base: string; files: ChangedFile[]; shown: ShownRef[] }
export interface PrototypeFile { path: string; patch: string | null; content: string | null; missing: boolean; unreadable: boolean }
/** One acceptance criterion of a task: a statement a person can check, how we will know, and what the prototype showed. */
/** How a criterion is proven when not by a test: by the person before the merge, at deploy, or by watching production after it. */
export type Proof = 'smoke' | 'release' | 'watch'
/** What is owed at deploy, by whoever deploys; and what is watched after it. Neither is on the Smoke page. */
export interface ReleaseCheck { id: string; text: string; how?: string; done?: boolean; note?: string; by?: string; at?: string }
export interface WatchCheck { id: string; text: string; how?: string }
/** The smoke test, accepted by the person: by whom, when, on which commit. stale: the branch has moved since. */
export interface SmokeAccepted { by: string; at: string; sha: string | null; stale?: boolean }
export interface Criterion { kind?: Proof; id: string; text: string; check?: string; shown?: boolean; evidence?: string; /** For the final build only: the prototype skips it. */ buildOnly?: boolean; why?: string; /** The final build's mark: met, not met, or not checked yet. */ built?: boolean; builtEvidence?: string; by: string; at: string }
export interface AcceptanceChange { add?: { text: string; check?: string; kind?: Proof }[]; update?: { kind?: Proof | null; id: string; text?: string; check?: string | null; shown?: boolean | null; evidence?: string | null; buildOnly?: boolean; why?: string | null; built?: boolean | null; builtEvidence?: string | null }[]; remove?: string[] }
/** A report on an app's work over a period: the end-of-day note or the weekly status, a draft the person edits and sends. */
export type ReportPeriod = 'today' | 'yesterday' | 'this_week' | 'last_week'
export interface Report { id: string; appId: string; kind: 'daily' | 'weekly'; fromAt: string; toAt: string; label: string; body: string; notes: string | null; editedAt: string | null; createdAt: string; costUsd: string | null }
/** Where a checklist task stands (the engine's checklist module): the stages after its prototype, and every item it is held to with the check's mark. */
export interface ChecklistStage { key: 'build' | 'check' | 'probe' | 'test' | 'smoke'; label: string; state: 'todo' | 'doing' | 'done' | 'failed'; detail: string }
export interface ChecklistItem { id: string; kind: 'criterion' | 'requirement'; text: string; what?: string; mark: 'met' | 'unmet' | 'person' | 'na' | 'unchecked' | 'release' | 'watch'; evidence?: string }
/** One node of a checklist task's flow: a sub-task that exists (`sub`), or a stage still to come. `after`: what it follows; null keeps the sub-task's own dependencies. */
export interface FlowNode { id: string; sub?: string; title: string; state: ChecklistStage['state']; detail: string; after: string[] | null }
/** The check asked for again, of what is not checked yet: how many items, whether it can be asked for now (and why not), whether one is under way. */
export interface CheckAgain { unchecked: number; canRun: boolean; running: boolean; why?: string }
export interface Checklist { /** Owed at deploy, and watched after it: on the list, and outside `total`. */ release?: number; watch?: number; check?: CheckAgain; /** Left to the person, in the smoke test. */ person?: number; /** Not checked yet: no mark, left to nobody. Never a failure. */ unchecked?: number; /** The whole test run as it last was, and whether it can be asked for again; absent when the app has no test command. */ tests?: { ok: boolean | null; at: string | null; flaky: boolean; output?: string; running: boolean; canRun: boolean }; build: 'one' | 'planned'; stages: ChecklistStage[]; items: ChecklistItem[]; met: number; unmet: number; total: number; flow?: FlowNode[] }
/** A task's smoke test (the engine's smoke module): where the built code runs, and the checks left to a person with their marks. */
export interface SmokeCheck { /** Which of the app's set-ups it needs up (its key). */ setup?: string; /** When it can be done: here on the built code, on the pull request, or after the merge. */ when?: 'here' | 'pr' | 'after' | 'nightly'; id: string; text: string; where?: string; /** That place as an address to open, while its set-up is up or deployed. */ link?: string; how?: string; mark: 'todo' | 'pass' | 'fail' | 'skip'; note?: string; stale?: boolean; before?: { pass: boolean; note: string }; /** What an agent saw when asked to try it: its word, not a mark. stale: said on an earlier commit. */ tried?: { verdict: 'holds' | 'fails' | 'unsure'; note: string; sha: string | null; at: string; stale?: boolean }; /** An agent is trying it now. */ trying?: boolean }
/** One of an app's smoke test set-ups on a task: where it is and whether it is up. */
export interface SmokeSetupView { /** The fixtures' files it was given when it last started, and the folder they are in on this computer. */ files?: { dir: string; files: { name: string; what: string; version: 'fake' | 'real' }[] }; /** It has a database of its own: it can be started from a fixture, and kept as one. builtFrom: the fixture it was last built from (null: the set-up's own seed alone). ran: it has been run. */ data?: { builtFrom: string | null; ran: boolean }; /** Addresses fixed to this computer that its page names (the engine's addresses.ts): it will not load through any other address. */ fixedAddresses?: string[]; fixedNote?: string; /** Ports it listens on that it was not given: a second copy would share them. */ strayPorts?: number[]; strayNote?: string; key: string; name: string; what: string | null; where: 'local' | 'preview' | 'staging' | 'flag' | 'terminal'; says: string; account: string | null; flag: string | null; running: string | null; url: string | null; up: boolean; canRun: boolean; /** A terminal can be opened on it: where it opens, and whether one is open. */ terminal?: { folder: 'build' | 'temp'; open: boolean }; /** The throwaway terminal every set-up has, in a new empty folder; left out where its own is already that. */ scratch?: { open: boolean }; canClean?: boolean; log: string[]; owed: number }
/** In place of a fixture's name: start a smoke test from no fixture. No fixture can be named this. */
export const EMPTY = '(empty)'
export interface SmokeView { /** The one set-up's files, as on SmokeSetupView. */ files?: SmokeSetupView['files']; /** The one set-up's database, as on SmokeSetupView. */ data?: { builtFrom: string | null; ran: boolean }; /** Every set-up of the app; left out, the app has the one the fields below describe. */ setups?: SmokeSetupView[]; /** A staged task: the checks are every criterion no agent marked, not what a check after the build left. */ staged?: boolean; /** Its pull request, when there is one: a preview is of it. */ pr?: { number: number; url: string | null } | null; where: 'local' | 'preview' | 'staging' | 'flag' | 'terminal'; says: string; account: string | null; flag: string | null; branch: string | null; head: string | null; running: string | null; url: string | null; up: boolean; canRun: boolean; /** There is something to start from nothing: a database, a seed, or a script of its own. */ canClean?: boolean; terminal?: { folder: 'build' | 'temp'; open: boolean }; scratch?: { open: boolean }; log: string[]; checks: SmokeCheck[]; owed: number; failed: number; /** After a mark: how many that failed were sent back. */ sentBack?: number; /** Accepted by the person, or null. */ accepted?: SmokeAccepted | null; /** It can be accepted now; else what it waits on. */ canAccept?: boolean; acceptWaits?: string | null; release?: ReleaseCheck[]; watch?: WatchCheck[] }
/** What an agent learned from an app's code: a short document each, the part for a person and the part for agents. */
export interface Learned { key: string; title: string; summary: string; body: string; sha: string | null; updatedAt: string }
export interface Learning { docs: Learned[]; missing: string[]; working: { sessionId: string } | null; sessionId: string | null; stale: number }
/** A note (engine/src/notes.ts): something said, found or decided, on a day, about the tasks it names. */
export interface Note { id: string; on: string; kind: 'note' | 'decision'; title: string; body: string; tasks: { id: string; name: string; title: string }[]; createdBy: string | null; updatedAt: string | null }
export interface Reports { writing: boolean; format: { daily: string; weekly: string }; reports: Report[] }
/** A version of a task: the git branch each of its worktrees is on, and (set aside) the task as it was left. */
export interface TaskBranch { id: string; name: string; current: boolean; fromSave: string | null; createdAt: string; gitBranches: string[]; /** Set aside: what is only on it. */ work: { commits: number; comments: number } | null }
/** A named point on a task branch that the whole task can be taken back to. */
export interface SavePoint { id: string; name: string; /** Made by the engine at a transition. */ auto: string | null; branchId: string; branchName: string | null; onCurrent: boolean; /** Commits (and uncommitted work) since, when it is on the task branch being worked on. */ changesSince: number | null; createdBy: string | null; createdAt: string; gitBranches: string[] }
export interface TaskBranches { issueId: string; worktrees: { key: string; label: string; branch: string }[]; branches: TaskBranch[]; saves: SavePoint[] }
export interface TaskMoved { now: { id: string; name: string }; setAside: { id: string; name: string; commits: number }; switched: { worktree: string; branch: string }[]; leftAlone: string[]; restarted: number; problems: string[] }
/** A screen: one title under Screens/ in the app's Storybook, and its states, each a story. */
export interface Screen { title: string; file: string | null; states: { id: string; name: string }[] }
/** One mock in an app's library (engine/src/mocks.ts): a stand-in for one outside service, with where it came from. */
export interface MockProvenance { standsInFor?: string; minedFrom?: string; real?: string; invented?: string; cannotShow?: string[]; covers?: string[]; changed?: string; kept?: string[]; checked?: { at: string; files: number; values: number } }
export interface Mock {
  key: string; name: string; status: 'needs_recording' | 'assumed' | 'mined'; standsInFor: string; upstream: string | null
  /** How it is served: by the general server straight from its endpoints, by a server written for it, or not at all (no endpoints yet). pointed: its variable to override is set, so the app can be pointed at it. */ served: 'general' | 'written' | 'none'; pointed: boolean
  env: Record<string, string>; cmd: string | null; files: { path: string; bytes: number }[]
  provenance: MockProvenance; /** Its provenance as a note, as it is exported. */ note: string
  /** A new recording is needed: what a real call needs. */ needs: { person?: string; key?: string; cost?: string; why?: string; /** Which real responses would do instead of a live run, as the person would recognise them. */ file?: string; at?: string; recorded?: string } | null
  issue: { id: string; identifier: string; title: string } | null
  recordedAt: string | null; minedAt: string | null
  /** A newer recording waits to be mined. */ unmined: { at: string; files: number } | null
  /** Where it is in use now: a prototype, main, a smoke test. */ usedBy: string[]
  /** How the app connects to the real service: its address, and the names of the app's settings that hold the address and the key. others: further settings a mock is given (a workflow id). */ connection: { address: string | null; addressSetting: string | null; keySetting: string | null; others: Record<string, string> }
  /** What it can answer with, kept apart from its server, and which of them it serves unless a run says otherwise. */ data: MockData[]; defaultData: string | null
  /** The calls it answers, and the data files that are no endpoint's (engine/src/mock-endpoints.ts). */ endpoints: MockEndpoint[]; unlinked: string[]
}
/** One real response of a service on this computer (never its contents). before: from before this mock was made, so not used by it. */
export interface MockReal { id: string; at: string; given: boolean; files: { name: string; bytes: number }[]; before: boolean; issueId: string | null }
/** One call the app makes to the service. A response belongs to exactly one endpoint, by its file's name. */
export interface MockEndpoint {
  key: string; method: string; path: string; what?: string; file?: string
  /** A real response of it is never stored: one that comes in is faked at once and the original deleted. */ sensitive?: boolean
  /** A second step: this call is made to a link that another endpoint's answer gives. follows: that endpoint's key (it is thereby intermediate); linkField: the field of its answer holding the link. */ follows?: string; linkField?: string
  /** Its data (engine/src/mock-serve.ts): the app's, set in its settings, and a task's own in place of it, where a task was asked about. */ data: { app: EndpointItem | null; task: EndpointItem | null; /** Do a person's own runs get its faked version? The app's answer, and this task's own where it has one. A reviewer always gets the faked one. */ faked?: { app: boolean; task: boolean | null } }
  /** The real response behind it on this computer. None: its shape is taken from the code that calls it. */ real: { at: string; how: 'given' | 'recorded' } | null
  /** Its files in the data the mock serves by default. */ files: string[]
}
/** One endpoint's data at one level. recorded: a real response as it came, on this computer only. safe: a fake of it, or a file provided as holding nothing real; what a reviewer gets. */
export interface EndpointItem {
  recorded: { id: string; at: string; how: 'given' | 'recorded'; files: string[] } | null
  safe: { kind: 'faked' | 'provided'; set: string; files: string[]; note: string; stale?: boolean; /** The column names of its data: what can be set from a fixture. */ columns?: string[]; /** Fields mapped from a file of the fixtures, worked out when it is served: data column ← the file's column ('' leaves it empty). */ fromFile?: { file: string; map: Record<string, string> }; /** The fixture people it was filled out for. */ madeFor?: { fixture: string; table: string; who: string; people: number; map: Record<string, string> } } | null
}
/** A test file (engine/src/test-files.ts): something a person needs in their hands to try a change, and what to do with it. Made-up only. */
export interface TestFile { id: string; name: string; what: string; mediaType: string; bytes: number; /** The app's, for every task, or one task's own. */ scope: 'app' | 'task'; /** The version a reviewer gets, read against the real responses on this computer when it is text. faked: made from the real version, values replaced. */ checked: { at: string; against: number; faked?: number } | null; /** Which versions are on this computer. real: this computer only. */ has: { fake: boolean; real: boolean }; /** Which version each place uses. A reviewer: the fake, or nothing while there is none. */ use: { prototype: 'fake' | 'real' | null; smoke: 'fake' | 'real' | null; review: 'fake' | null }; /** Why the real version has no fake. */ note?: string; /** A CSV: its column names, which an endpoint's data can be mapped from. */ columns?: string[]; here: boolean }
/** One of the app's fixtures (engine/src/fixtures.ts): made-up rows for its own database, by table. Never the rows. */
export interface Fixture { name: string; /** Kept from a run that held something real: this computer only. */ real?: boolean; bytes: number; tables: { name: string; rows: number; columns: string[] }[]; /** How many endpoints' data is filled out for its people. */ madeFor?: number }
/** One set of data a mock can answer with (engine/src/mock-data.ts). real: a real response as it is, on this computer only. faked: made from one by the faker. invented: written by hand, or provided by a person who states it holds nothing real. */
export interface MockData {
  key: string; name: string; kind: 'real' | 'faked' | 'invented'; files: { path: string; bytes: number }[]
  provenance: { from?: { at: string; given: boolean; files: number }; faked?: { replaced: number; kept: number }; kept?: string[]; checked?: { at: string; files: number; values: number; against: number }; stated?: { by: string; at: string } }
  /** What it is, in a line. */ note: string; /** May it leave this computer? Never a real one. */ shareable: boolean; isDefault: boolean; issueId: string | null; updatedAt: string | null
}
/** One call a task's change makes outside the app (engine/src/task-calls.ts), and what answers it now. */
export interface TaskCall {
  id: string; service: string; serviceName: string; method: string; path: string; /** What this task needs from it. */ what: string; by: 'agent' | 'user'
  /** answered: an endpoint of the service's mock answers it. no_endpoint: the mock is there and lacks this call. no_mock: the service has no mock. */ state: 'answered' | 'no_endpoint' | 'no_mock'
  mock: { key: string; name: string; status: Mock['status'] } | null; endpoint: MockEndpoint | null; /** Tied by hand, not found by its method and path. */ linked: boolean
}
/** One of the app's services that a task calls, with the task's calls of it. A service is set up in the app's settings; a task picks from those. */
export interface TaskService { key: string; name: string; standsInFor: string; status: Mock['status']; /** The task an agent found it for, in the code. */ foundFor: string | null; calls: TaskCall[] }
/** Where a mock's data comes from in each place a task runs (engine/src/mock-places.ts). */
export type MockPlace = 'prototype' | 'smoke' | 'review'
/** live: the real service. fake: the mock, each endpoint answering with its faked or provided data. replay: the mock, with recorded responses as they are (a person's own prototype or smoke test only). default: the app's (for the app: the mock, faked). data: from before data sat on the endpoint. */
export type MockSource = 'default' | 'live' | 'replay' | 'fake' | 'data'
export interface MockChoice { source: MockSource; data?: string }
/** What one place gets now, and whose choice it is. */
export interface MockPlan {
  mock: string; name: string; place: MockPlace; how: 'live' | 'data' | 'own' | 'none'
  /** The mock: which form of each endpoint's data it is given. */ form?: 'faked' | 'recorded'; /** It answers with a real response as it is, for at least one call. */ real?: boolean; record?: boolean
  choice: MockChoice; from: 'task' | 'app' | 'none'
  /** What it comes to, in words. */ says: string; /** What stands in the way of the choice. */ note?: string; /** Reviewer only: why its copy cannot be made. */ blocked?: string
  /** The task's own choice. */ own: MockChoice | null; /** The app's. */ app: MockChoice | null
}
export interface MockPlacesRow { mock: string; name: string; status: Mock['status']; /** Can it be called for real through the recorder? */ canLive: boolean; /** When its newest real response on this computer is from. */ real: string | null; places: Record<MockPlace, MockPlan> }
/** One change to a mock: the app's own (no task), or a task's. */
export interface MockChange { at: string; by: string; issue: { id: string; identifier: string } | null; what: string }
/** Where the Storybook that renders them stands, and the screens it has. */
export interface ScreensView { url: string | null; frame?: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[]; branch?: string | null; main?: boolean; screens: Screen[]; earlier: number }

/** Something made public for a look: a prototype, a place's mockups or its sketches, at a temporary address. */
export type ShareKind = 'prototype' | 'storybook' | 'sketch'
export interface Shared { kind: ShareKind; id: string; url: string; since: string; expiresAt: string; by: string; /** Which tunnel it goes through. */ via?: 'cloudflare' | 'funnel' | 'ngrok'; what?: string }
export interface Event { seq: number; ts: string; type: string; actor: string; issueId: string | null; projectId: string | null; payload: Record<string, unknown> }
export interface NewSubIssue { key: string; title: string; description?: string; brief?: string; dependsOn?: string[]; files?: string[] }
export interface NewProjectIssue { title: string; description?: string; brief?: string; subIssues?: NewSubIssue[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status}`)
  return JSON.parse(text) as T
}

/** Another device with the page open, over the private network. */
export interface Device { ip: string; name: string; kind: 'phone' | 'computer'; since: string }
/** `address`: the page on the private network, null when it is not served there. `remote`: this page is the one that came over it. */
export interface DevicesHere { /** Tailscale on this computer: not installed, not connected, or connected. */ tailscale: 'missing' | 'off' | 'ready'; address: string | null; remote: boolean; devices: Device[]; /** Where to allow serving on the Tailscale account, when it said no. */ enable?: string }
export const devicesHere = () => call<DevicesHere>('GET', '/devices')
/** Put the page on the private network (one press), or take it off. */
export const servePhone = () => call<DevicesHere>('POST', '/devices/serve', {})
export const stopPhone = () => call<DevicesHere>('POST', '/devices/serve/stop', {})

// The front door (GET /now): what's running, what needs a person, what just happened.
type Where = { projectId: string; projectName: string; appName: string }
export type Attention =
  | ({ kind: 'failed_build'; issueId: string; identifier: string; title: string; error: string | null } & Where)
  | ({ kind: 'question'; questionId: string; issueIdentifier: string | null; text: string; cost: string | null; askedAt: string } & Where)
  | ({ kind: 'run_project'; subIssues: number } & Where)
  | ({ kind: 'plan_issue'; issueId: string; identifier: string; issueTitle: string } & Where)
  | ({ kind: 'smoke_test'; issueId: string; identifier: string; issueTitle: string; owed: number; /** How many of them can be done now; the rest are on a pull request that is not open yet. */ ready?: number } & Where) // built, with checks left to a person: nothing more happens until they try it by hand
  | ({ kind: 'approve_brief'; issueId: string; identifier: string; issueTitle: string } & Where) // its prototype is approved and its brief is written: the line waits on the person's approval of the brief
  | ({ kind: 'backlog'; open: number; items: string[] } & Where)
  | { kind: 'todo'; todoId: string; identifier: string; title: string; owner: string; projectId: string | null; projectName: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | ({ kind: 'merge_pr'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'pr_feedback'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'behind_main'; files: string; commits: number } & Where)
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | { kind: 'checkout_behind'; appName: string; branch: string; path: string; commits: number; why: string; files: string[] }
  /** A nightly check is red: the tasks merged since its last green run, one of which broke it. */
  | { kind: 'nightly_failed'; appId: string; appName: string; name: string; workflow: string; url: string | null; nights: number; since: { id: string; identifier: string; title: string }[] }
  | { kind: 'needs_recording'; appId: string; appName: string; mock: string; mockKey: string; issueId: string | null; identifier: string | null; issueTitle: string | null; person: string | null; key: string | null; cost: string | null; recorded: boolean }
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
/** A task past its plan, for Build's page: ready (planned, not started), checking (being read before it is built), building, stopped (asking, failed, held or paused), smoke (built: the person's to try by hand, then close) or closed (by the person, and only then). */
export interface BuildTask {
  id: string; identifier: string; title: string; projectId: string; projectName: string | null; projectStatus: string
  phase: 'ready' | 'checking' | 'building' | 'stopped' | 'smoke' | 'closed'; done: number; total: number
  /** At the smoke test: what still stands between it and being closed; empty when it can be closed. */
  waits?: string[]
  /** Planned after a prototype and still being read before the build: the steps left; and, when the last one stopped for the person, its question and the conversation to answer it in. */
  checks?: { left: string[]; needsYou: string | null; sessionId: string | null }
  live: { id: string; identifier: string; title: string; status: string; step: string | null }[]
  held: { id: string; identifier: string; title: string; reason: string }[]
  failed: { id: string; identifier: string; title: string; error: string | null }[]
  questions: { id: string; text: string; cost: string | null; reason: string | null; options: { label: string; description: string; changes: string[]; recommended: boolean }[] }[]
  pr: { number: number | null; url: string | null; status: string } | null
}
export interface Now { hold?: Hold | null; running: RunningProject[]; tasks?: BuildTask[]; needsYou: Attention[]; recent: Event[]; counts: { projects: number; running: number; needsYou: number } }

// Talk: a conversation with the factory's agent. Messages are rows; talk.* events say when to refetch.
export type Risk = 'free' | 'cheap' | 'moderate' | 'expensive'
export interface SubjectRef { /** Learn's agent, reading the app's code. */ learn?: 'codebase'; projectId?: string; issueId?: string; ideaId?: string; prototypeId?: string; path?: string; /** About the app as a whole: no worktree. */ app?: boolean }
export interface TalkSession { id: string; appId: string | null; cwd: string | null; branch: string | null; worktreePath: string | null; subject: string | null; subjectRef: SubjectRef | null; title: string | null; status: string; createdAt: string; lastActiveAt: string | null; live: boolean; busy: boolean; messages?: number; autoApprove: Exclude<Risk, 'expensive'>
  terminalSince?: string | null; /** Its tab was closed in the agent's column: the conversation is still there. */ closedAt?: string | null; /** The task it belongs to: its own agent, or a prototype's started on it. */ taskId?: string | null; /** The idea it belongs to: its own agent, or a prototype's started on it. */ ideaId?: string | null } // handed to the terminal: what's said there is copied in until a message here takes it back
/** An agent a task's conductor has out, with its conversation. */
/** An agent a task's conductor has out: a prototype's builder, or a fresh agent on one check (`check`: its step). */
/** One line of what a run read, did or said. */
export interface RunLine { seq: number; at: string; type: string; text?: string; tool?: string; input?: Record<string, unknown>; error?: string; subIssues?: unknown[]; minutes?: number }
export interface RunLog { runId: string; status: string | null; working: boolean; startedAt: string | null; endedAt: string | null; costUsd: number | null; lines: RunLine[] }
export interface TaskAgentOut { /** Its conversation; none for the planner, which is a run (runId). */ sessionId: string | null; runId?: string; /** What came of it, once it is back. */ detail?: string; failed?: boolean; kind: 'prototype' | 'check' | 'planner' | /** The agent an idea came from (Learn's). */ 'source'; what: string; icon?: string; title: string; prototypeId?: string; check?: string; busy: boolean; /** Stopped on the person: what it asked to be allowed and has no answer to. */ asking?: { requestId: string; tool: string; what: string; risk: string; since: string } | null }
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
  runLog: (runId: string) => call<RunLog>('GET', `/runs/${runId}/log`),
  taskAgents: (issueId: string) => call<TaskAgentOut[]>('GET', `/issues/${issueId}/agents`),
  renameTalk: (id: string, subject: string) => call<TalkSession>('POST', `/talks/${id}/rename`, { subject }),
  transcript: (id: string) => call<Transcript>('GET', `/talks/${id}`),
  say: (id: string, text: string, context?: TalkContext, images?: TalkImage[]) => call<{ messageId: number }>('POST', `/talks/${id}/say`, { text, context, ...(images?.length ? { images } : {}) }),
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
  /** The app's mock library (Settings › Mocks). */
  mocks: (appId: string, /** A task: each endpoint also says the task's own data. */ issueId?: string | null) => call<Mock[]>('GET', `/apps/${appId}/mocks${issueId ? `?issue=${issueId}` : ''}`),
  /** A service that needs a mock: raised, with the real service's address and the variables that point the app at it. */
  raiseMock: (appId: string, body: { name: string; standsInFor?: string; upstream?: string; env?: Record<string, string>; addressSetting?: string; keySetting?: string; issueId?: string; needs?: Mock['needs'] }) => call<Mock>('POST', `/apps/${appId}/mocks`, body),
  updateMock: (appId: string, key: string, body: { name?: string; standsInFor?: string; upstream?: string | null; env?: Record<string, string>; addressSetting?: string | null; keySetting?: string | null }) => call<Mock>('PATCH', `/apps/${appId}/mocks/${key}`, body),
  /** files: its real responses are deleted from this computer with it. */
  removeMock: (appId: string, key: string, files = false) => call<{ removed: boolean; files: number }>('DELETE', `/apps/${appId}/mocks/${key}${files ? '?files=1' : ''}`),
  /** A service's real responses on this computer: what is there, never what is in it. */
  mockReal: (appId: string, key: string) => call<MockReal[]>('GET', `/apps/${appId}/mocks/${key}/real`),
  removeMockReal: (appId: string, key: string, id: string) => call<MockReal[]>('DELETE', `/apps/${appId}/mocks/${key}/real?id=${encodeURIComponent(id)}`),
  addMockEndpoint: (appId: string, key: string, body: { method: string; path?: string; what?: string; sensitive?: boolean; follows?: string | null; linkField?: string }) => call<Mock>('POST', `/apps/${appId}/mocks/${key}/endpoints`, body),
  /** One endpoint's data: the app's, or (issueId) one task's own in place of it. real: a response the service sent; otherwise the person states it holds nothing real. */
  giveEndpointData: async (appId: string, key: string, endpoint: string, files: File[], o: { real: boolean; issueId?: string | null }) => {
    const form = new FormData()
    for (const f of files) form.append('file', f)
    form.append('real', String(o.real)); if (o.issueId) form.append('issueId', o.issueId)
    const res = await fetch(`${API}/apps/${appId}/mocks/${key}/endpoints/${endpoint}/data`, { method: 'POST', body: form })
    const text = await res.text()
    if (!res.ok) throw new Error(text || `${res.status}`)
    return JSON.parse(text) as { kept: 'recorded' | 'faked' | 'provided'; asked: string | null; maybeStructure?: string[] }
  },
  fixtures: (appId: string, issueId?: string | null) => call<{ fixtures: Fixture[]; /** The fixture a task's runs are built from. */ used: string | null; /** Can one be made from the app's seed, and what is missing if not. */ make?: { ok: boolean; missing: string | null } }>('GET', `/apps/${appId}/fixtures${issueId ? `?issue=${issueId}` : ''}`),
  /** The app's test files and (for a task) the task's own. */
  testFiles: (appId: string, issueId?: string | null) => call<TestFile[]>('GET', `/apps/${appId}/test-files${issueId ? `?issue=${issueId}` : ''}`),
  /** Files added as test files, with what the person does with them. stated: they hold nothing real. */
  addTestFiles: async (appId: string, files: File[], o: { what: string; issueId?: string | null; stated: boolean; /** May hold something real: kept on this computer only, and a fake is made of it. */ real?: boolean }) => {
    const form = new FormData()
    for (const f of files) form.append('file', f)
    form.append('what', o.what); form.append('stated', String(o.stated)); if (o.real) form.append('real', 'true'); if (o.issueId) form.append('issueId', o.issueId)
    const res = await fetch(`${API}/apps/${appId}/test-files`, { method: 'POST', body: form })
    const text = await res.text()
    if (!res.ok) throw new Error(text || `${res.status}`)
    return JSON.parse(text) as TestFile[]
  },
  editTestFile: (appId: string, id: string, i: { what?: string; /** Which version a place uses. */ use?: { prototype?: 'fake' | 'real'; smoke?: 'fake' | 'real' } }) => call<TestFile>('PATCH', `/apps/${appId}/test-files/${id}`, i),
  removeTestFile: (appId: string, id: string) => call<{ removed: string }>('DELETE', `/apps/${appId}/test-files/${id}`),
  /** Where a test file is fetched from: to keep, or (a picture, show) to look at. */
  testFileUrl: (appId: string, id: string, show = false, version?: 'fake' | 'real') => `${API}/apps/${appId}/test-files/${id}/file${show || version ? `?${[show ? 'show=1' : '', version ? `version=${version}` : ''].filter(Boolean).join('&')}` : ''}`,
  /** A fixture made from the app's own seed: its schema and seed commands run on a database of its own. Minutes. */
  makeFixture: (appId: string, name?: string) => call<{ name: string; tables: Record<string, number> }>('POST', `/apps/${appId}/fixtures`, name ? { name } : {}),
  /** A table of a fixture as it is: its first rows, as text. */
  fixtureSample: (appId: string, name: string, table: string) => call<{ columns: string[]; rows: string[][]; total: number }>('GET', `/apps/${appId}/fixtures/${encodeURIComponent(name)}/${encodeURIComponent(table)}/rows`),
  renameFixture: (appId: string, name: string, to: string) => call<{ name: string }>('PATCH', `/apps/${appId}/fixtures/${encodeURIComponent(name)}`, { name: to }),
  deleteFixture: (appId: string, name: string) => call<{ deleted: string }>('DELETE', `/apps/${appId}/fixtures/${encodeURIComponent(name)}`),
  fixtureRows: (appId: string, name: string, table: string) => call<{ columns: string[]; rows: { index: number; label: string; values: Record<string, string> }[] }>('GET', `/apps/${appId}/fixtures/${encodeURIComponent(name)}/${encodeURIComponent(table)}`),
  /** An endpoint's data filled out for a fixture's people: count of them from one row on, the columns in map set from each. */
  /** Fields of an endpoint's data mapped from a file of the fixtures. file null: no longer. */
  mapFromFile: (appId: string, key: string, endpoint: string, body: { file: string | null; map?: Record<string, string>; issueId?: string | null }) => call<{ fromFile: { file: string; map: Record<string, string> } | null }>('PUT', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}/file-map`, body),
  assignFixture: (appId: string, key: string, endpoint: string, body: { fixture: string; table: string; row: number; count: number; map: Record<string, string>; issueId?: string | null }) => call<{ madeFor: { fixture: string; who: string; people: number }; changed: number }>('PUT', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}/fixture`, body),
  /** Whether a person's own runs get an endpoint's faked version: the app's answer, or (issueId) one task's own. null: the task follows the app again. */
  /** The saved real response of one endpoint, faked now: with the plan its fake had, else everything not plainly structure replaced. Refused while a real value is still in it. */
  fakeEndpoint: (appId: string, key: string, endpoint: string, issueId?: string | null) => call<{ data: MockEndpoint['data']; replaced: number; kept: number }>('POST', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}/fake`, { issueId: issueId ?? null }),
  setEndpointFaked: (appId: string, key: string, endpoint: string, faked: boolean | null, issueId?: string | null) => call<MockEndpoint['data']>('PUT', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}/faked`, { faked, issueId: issueId ?? null }),
  /** Taken away at one level: a task's own gone, it gets the app's again. real: the real response behind it is deleted from this computer too. */
  removeEndpointData: (appId: string, key: string, endpoint: string, o: { issueId?: string | null; real?: boolean } = {}) => call<{ removed: boolean; real: number }>('DELETE', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}/data?${o.issueId ? `issue=${o.issueId}&` : ''}${o.real ? 'real=1' : ''}`),
  editMockEndpoint: (appId: string, key: string, endpoint: string, body: { method?: string; path?: string; what?: string; sensitive?: boolean; follows?: string | null; linkField?: string }) => call<Mock>('PATCH', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}`, body),
  removeMockEndpoint: (appId: string, key: string, endpoint: string) => call<Mock>('DELETE', `/apps/${appId}/mocks/${key}/endpoints/${endpoint}`),
  renameMockData: (appId: string, key: string, data: string, name: string) => call<MockData[]>('PATCH', `/apps/${appId}/mocks/${key}/data/${data}`, { name }),
  /** Ask the agent of the task the newest recording was made for to mine it. */
  mineMock: (appId: string, key: string) => call<{ asked: string }>('POST', `/apps/${appId}/mocks/${key}/mine`),
  /** Where its exported files are downloaded from: the server, its invented data and its provenance. */
  /** The services a task calls, each with its calls. */
  taskServices: (issueId: string) => call<TaskService[]>('GET', `/issues/${issueId}/services`),
  /** One of the app's services, named for a task. */
  addTaskService: (issueId: string, service: string) => call<TaskService[]>('POST', `/issues/${issueId}/services`, { service }),
  /** Off the task's list, with the task's calls of it. The app's service stays. */
  removeTaskService: (issueId: string, service: string) => call<TaskService[]>('DELETE', `/issues/${issueId}/services/${service}`),
  /** What a task calls outside the app, each with what answers it. */
  taskCalls: (issueId: string) => call<TaskCall[]>('GET', `/issues/${issueId}/calls`),
  addTaskCall: (issueId: string, body: { service: string; method: string; path: string; what?: string }) => call<TaskCall[]>('POST', `/issues/${issueId}/calls`, body),
  removeTaskCall: (issueId: string, id: string) => call<TaskCall[]>('DELETE', `/issues/${issueId}/calls/${id}`),
  editTaskCall: (issueId: string, id: string, body: { service?: string; method?: string; path?: string; what?: string }) => call<TaskCall[]>('PATCH', `/issues/${issueId}/calls/${id}`, body),
  /** The whole list emptied, to start again. */
  clearTaskCalls: (issueId: string) => call<TaskCall[]>('DELETE', `/issues/${issueId}/calls`),
  linkTaskCall: (issueId: string, id: string, endpoint: string | null) => call<TaskCall[]>('PUT', `/issues/${issueId}/calls/${id}/endpoint`, { endpoint }),
  /** Something to answer it: the service's mock made if it has none, the call added to the mock if it lacks it. */
  coverTaskCall: (issueId: string, id: string) => call<{ calls: TaskCall[]; mock: Mock }>('POST', `/issues/${issueId}/calls/${id}/cover`, {}),
  /** Where each mock's data comes from, place by place: the app's defaults, or a task's. */
  mockPlaces: (appId: string, issueId?: string | null) => call<MockPlacesRow[]>('GET', `/apps/${appId}/mock-places${issueId ? `?issue=${issueId}` : ''}`),
  setMockPlace: (appId: string, key: string, place: MockPlace, body: { source: MockSource; data?: string; issueId?: string | null }) => call<MockPlan>('PUT', `/apps/${appId}/mocks/${key}/places/${place}`, body),
  mockHistory: (appId: string, key: string) => call<MockChange[]>('GET', `/apps/${appId}/mocks/${key}/history`),
  /** Data a person provides and states holds nothing real: kept as invented. */
  provideMockData: async (appId: string, key: string, files: File[], name: string, issueId?: string | null) => {
    const form = new FormData()
    for (const f of files) form.append('file', f)
    form.append('name', name); form.append('stated', 'yes'); if (issueId) form.append('issueId', issueId)
    const res = await fetch(`${API}/apps/${appId}/mocks/${key}/data`, { method: 'POST', body: form })
    const text = await res.text()
    if (!res.ok) throw new Error(text || `${res.status}`)
    return JSON.parse(text) as MockData
  },
  /** Which data a mock serves unless a run says otherwise. */
  setMockDefaultData: (appId: string, key: string, data: string | null) => call<MockData[]>('PUT', `/apps/${appId}/mocks/${key}/data/default`, { data }),
  removeMockData: (appId: string, key: string, data: string) => call<{ removed: boolean }>('DELETE', `/apps/${appId}/mocks/${key}/data/${data}`),
  /** Real responses the person already has (a saved JSON, a results CSV), given instead of a live run; the task's agent mines them. */
  giveRecording: async (appId: string, key: string, files: File[], /** The endpoint they are responses of. */ endpoint?: string) => {
    const form = new FormData()
    for (const f of files) form.append('file', f)
    if (endpoint) form.append('endpoint', endpoint)
    const res = await fetch(`${API}/apps/${appId}/mocks/${key}/recording`, { method: 'POST', body: form })
    const text = await res.text()
    if (!res.ok) throw new Error(text || `${res.status}`)
    return JSON.parse(text) as { files: string[]; asked: string | null }
  },
  mockExportUrl: (appId: string, key: string) => `/api/apps/${appId}/mocks/${key}/export`,
  /** A live smoke run of a task that records these services (their mocks' keys) through the engine. */
  startLiveSmoke: (issueId: string, live: string[], setup?: string) => call<SmokeView>('POST', `/issues/${issueId}/smoke/start`, { live, ...(setup ? { setup } : {}) }),
  /** A task's screens: the stories under Screens/ that its branch made, by screen, and the Storybook that renders them; `earlier` counts the ones it was handed, which `all` brings back. */
  screens: (appId: string, session?: string | null, all = false) => call<ScreensView>('GET', `/apps/${appId}/screens?${new URLSearchParams({ ...(session ? { session } : {}), ...(all ? { all: '1' } : {}) })}`),
  startStorybook: (appId: string, session?: string | null) => call<unknown>('POST', `/apps/${appId}/storybook/start${session ? `?session=${session}` : ''}`),
  // scope: a conversation's id (its worktree) or an app's (the main checkout).
  /** A conversation's sketches are the ones its branch made; `earlier` counts the ones it was handed, which `all` brings back. */
  sketches: (scope: string, all = false) => call<{ scope: string; branch: string | null; main: boolean; dir: string; sketches: { file: string; changedAt: number }[]; earlier?: number }>('GET', `/sketches/${scope}${all ? '?all=1' : ''}`),
  prototypes: (appId: string) => call<Prototype[]>('GET', `/apps/${appId}/prototypes`),
  prototype: (id: string) => call<Prototype>('GET', `/prototypes/${id}`),
  runPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start`),
  stopPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/stop`),
  /** touch: someone is looking at it, so it stays on. */
  // forId: the task (or prototype) whose own main it is, for comparing; left out, the app's.
  main: (appId: string, touch = false, forId?: string) => call<MainRunning>('GET', `/apps/${appId}/main${mainQuery({ touch, forId })}`),
  startMain: (appId: string, update = false, forId?: string, data?: MainDataChoice) => call<MainRunning>('POST', `/apps/${appId}/main/start${mainQuery({ update, forId, data })}`),
  stopMain: (appId: string, forId?: string) => call<MainRunning>('POST', `/apps/${appId}/main/stop${mainQuery({ forId })}`),
  prototypeRuns: (id: string) => call<StepRun[]>('GET', `/prototypes/${id}/runs`),
  runGuideStep: (id: string, step: number) => call<StepRun>('POST', `/prototypes/${id}/guide/${step}/run`),
  stopGuideStep: (id: string, step: number) => call<StepRun>('POST', `/prototypes/${id}/guide/${step}/stop`),
  restartPrototype: (id: string) => call<Prototype>('POST', `/prototypes/${id}/start?restart=1`),
  resetPrototypeData: (id: string, scenario: string | null) => call<unknown>('POST', `/prototypes/${id}/data/reset`, { scenario }),
  savePrototypeData: (id: string, name: string) => call<unknown>('POST', `/prototypes/${id}/data/save`, { name }),
  prototypeCode: (id: string) => call<PrototypeCode>('GET', `/prototypes/${id}/code`),
  prototypeFile: (id: string, path: string) => call<PrototypeFile>('GET', `/prototypes/${id}/file?path=${encodeURIComponent(path)}`),
  unshowInPrototype: (id: string, shownId: string) => call<unknown>('DELETE', `/prototypes/${id}/shown/${encodeURIComponent(shownId)}`),
  shared: (kind: ShareKind, id: string) => call<{ share: Shared | null }>('GET', `/shares/${kind}/${id}`).then((r) => r.share),
  share: (kind: ShareKind, id: string, opts: { freeNgrok?: boolean } = {}) => call<{ share: Shared }>('POST', `/shares/${kind}/${id}`, opts).then((r) => r.share),
  unshare: (kind: ShareKind, id: string) => call<{ stopped: boolean }>('DELETE', `/shares/${kind}/${id}`),
  prototypeTalk: (id: string) => call<{ id: string }>('POST', `/prototypes/${id}/talk`),
  now: (appId?: string) => call<Now>('GET', `/now${appId ? `?app=${appId}` : ''}`),
  ideas: (appId?: string) => call<IdeaRow[]>('GET', `/ideas${appId ? `?app=${appId}` : ''}`),
  idea: (id: string) => call<IdeaRow & { origin?: OriginView | null }>('GET', `/ideas/${id}`),
  createIdea: (body: { appId: string; title: string; body?: string }) => call<IdeaRow>('POST', '/ideas', body),
  planIdea: (id: string) => call<{ project: { id: string } }>('POST', `/ideas/${id}/project`, {}),
  convertIdea: (id: string, body: { as: 'task' | 'project'; title?: string; projectId?: string; why?: string }) => call<{ as: 'task' | 'project'; issueId?: string; projectId?: string }>('POST', `/ideas/${id}/convert`, body),
  ask: (body: { appId: string; subjectRef?: SubjectRef; text: string; /** For an idea: start its own agent if it has none. */ own?: boolean }) => call<TalkSession>('POST', '/talks/ask', body),
  plan: (appId: string) => call<Plan>('GET', `/plan?app=${appId}`),
  steps: (s: StepSubject) => call<StepsView>('GET', `/${s.kind}/${s.id}/steps`),
  step: (s: StepSubject, key: StepKey) => call<StepWork | null>('GET', `/${s.kind}/${s.id}/steps/${key}`),
  setStep: (s: StepSubject, key: StepKey, body: { status?: 'none' | 'started' | 'done' | 'skipped'; detail?: string | null; body?: string | null; refs?: string[] }) => call<StepWork>('PUT', `/${s.kind}/${s.id}/steps/${key}`, body),
  /** A person approves a step of a task (research, sketches, mockups, the prototype), or takes it back. */
  approveStep: (issueId: string, key: StepKey, approve = true) => call<StepWork>('POST', `/issues/${issueId}/steps/${key}/approve`, { approve }),
  setAcceptance: (issueId: string, change: AcceptanceChange) => call<{ acceptance: Criterion[]; note?: string }>('PUT', `/issues/${issueId}/acceptance`, change),
  mergeGuide: (issueId: string) => call<{ guide: string; /** Everything the guide left out. */ record?: string; subTasks: number }>('GET', `/issues/${issueId}/merge-guide`),
  smoke: (issueId: string) => call<SmokeView>('GET', `/issues/${issueId}/smoke`),
  startSmoke: (issueId: string, clean = false, setup?: string, /** Start from this fixture: its database is dropped and built again from it. EMPTY: from no fixture, only the set-up's own seed. */ fixture?: string) => call<SmokeView>('POST', `/issues/${issueId}/smoke/start`, clean || setup || fixture ? { ...(clean ? { clean: true } : {}), ...(setup ? { setup } : {}), ...(fixture === EMPTY ? { empty: true } : fixture ? { fixture } : {}) } : undefined),
  /** The folder of files a smoke test was given, opened in this computer's file manager. */
  revealSmokeFiles: (issueId: string, setup?: string) => call<{ opened: string }>('POST', `/issues/${issueId}/smoke/files/reveal`, setup ? { setup } : {}),
  /** A smoke test's database as it is now, kept as a fixture of the app's. real: it holds something real, this computer only. */
  keepSmokeDatabase: (issueId: string, b: { name: string; setup?: string; real: boolean }) => call<{ fixture: string; real: boolean; saved: Record<string, number> }>('POST', `/issues/${issueId}/smoke/keep`, b),
  stopSmoke: (issueId: string, setup?: string) => call<SmokeView>('POST', `/issues/${issueId}/smoke/stop`, setup ? { setup } : undefined),
  /** The smoke test's terminal: a shell in the build's checkout or a new folder. Opened when asked; the same one when asked again. */
  openSmokeTerminal: (issueId: string, setup: string, cols?: number, rows?: number, scratch = false) => call<{ setup: string; cwd: string; folder: 'build' | 'temp'; fresh: boolean }>('POST', `/issues/${issueId}/smoke/terminal`, { setup, cols, rows, ...(scratch ? { scratch: true } : {}) }),
  closeSmokeTerminal: (issueId: string, setup: string, scratch = false) => call<SmokeView>('POST', `/issues/${issueId}/smoke/terminal/close`, { setup, ...(scratch ? { scratch: true } : {}) }),
  /** An agent tries one check and says what it saw; it marks nothing. */
  trySmoke: (issueId: string, criterionId: string) => call<SmokeView>('POST', `/issues/${issueId}/smoke/${criterionId}/try`),
  /** The person accepts the smoke test: the built code is what goes to review. */
  acceptSmoke: (issueId: string) => call<SmokeView>('POST', `/issues/${issueId}/smoke/accept`),
  /** Whoever deployed says a release check is done, or that it is not, with why. */
  markRelease: (issueId: string, criterionId: string, done: boolean, note?: string) => call<{ release: ReleaseCheck[] }>('POST', `/issues/${issueId}/release/${criterionId}`, { done, note }),
  markSmoke: (issueId: string, criterionId: string, pass: boolean, note?: string, skip?: boolean) => call<SmokeView>('POST', `/issues/${issueId}/smoke/${criterionId}`, skip ? { skip: true, note } : { pass, note }),
  checklist: (issueId: string) => call<Checklist | null>('GET', `/issues/${issueId}/checklist`),
  /** The whole test run again, on the task's branch as it is now. Answers once it has started. */
  /** The check again, of only what is not checked yet (a criterion added or changed since the build's check). */
  checkAgain: (issueId: string) => call<{ started: true; checking: number; subTask: string }>('POST', `/issues/${issueId}/check`),
  testAgain: (issueId: string) => call<{ started: true; head: string }>('POST', `/issues/${issueId}/test`),
  learning: (appId: string) => call<Learning>('GET', `/apps/${appId}/learning`),
  learn: (appId: string) => call<{ sessionId: string; started: boolean }>('POST', `/apps/${appId}/learn`),
  /** The app's notes, newest day first; issueId: one task's. */
  notes: (appId: string, f: { issueId?: string; from?: string; to?: string } = {}) => call<Note[]>('GET', `/apps/${appId}/notes?${new URLSearchParams(Object.entries({ issue: f.issueId, from: f.from, to: f.to }).filter((e): e is [string, string] => !!e[1])).toString()}`),
  addNote: (appId: string, b: { on: string; kind: 'note' | 'decision'; title: string; body: string; issueIds: string[] }) => call<Note>('POST', `/apps/${appId}/notes`, b),
  editNote: (appId: string, id: string, b: Partial<{ on: string; kind: 'note' | 'decision'; title: string; body: string; issueIds: string[] }>) => call<Note>('PATCH', `/apps/${appId}/notes/${id}`, b),
  removeNote: (appId: string, id: string) => call<{ removed: string }>('DELETE', `/apps/${appId}/notes/${id}`),
  reports: (appId: string) => call<Reports>('GET', `/apps/${appId}/reports`),
  writeReport: (appId: string, body: { period: ReportPeriod; notes?: string }) => call<{ writing: boolean }>('POST', `/apps/${appId}/reports`, body),
  editReport: (id: string, body: string) => call<Report>('PUT', `/reports/${id}`, { body }),
  deleteReport: (id: string) => call<{ deleted: string }>('DELETE', `/reports/${id}`),
  setReportFormat: (appId: string, f: { daily?: string; weekly?: string }) => call<{ daily: string; weekly: string }>('PUT', `/apps/${appId}/report-format`, f),
  prView: (issueId: string) => call<PrView>('GET', `/issues/${issueId}/pr`),
  setPrMessage: (issueId: string, body: string) => call<{ written: string | null }>('PUT', `/issues/${issueId}/pr/message`, { body }),
  reviewCopy: (issueId: string, fresh = false) => call<ReviewCopyView>('GET', `/issues/${issueId}/review-copy${fresh ? '?fresh=1' : ''}`),
  makeReviewCopy: (issueId: string, body: { fixture: string | null; try: string }) => call<ReviewCopyView>('POST', `/issues/${issueId}/review-copy`, body),
  updatePr: (issueId: string) => call<{ number: number | null; url: string | null; status: string }>('POST', `/issues/${issueId}/pr/update`),
  markPrReady: (issueId: string) => call<{ number: number; url: string | null; status: string }>('POST', `/issues/${issueId}/pr/ready`),
  setTeamNames: (issueId: string, names: { ticket?: string | null; title?: string | null }) => call<{ teamTicket: string | null; teamTitle: string | null; ticket: string | null; ticketFrom: string | null; ticketMissing: boolean }>('PUT', `/issues/${issueId}/team`, names),
  submitPr: (issueId: string) => call<{ id: string; number: number | null; url: string | null; status: string }>('POST', `/issues/${issueId}/pr/submit`),
  keepSecret: (name: string, value: string, appId?: string) => call<KeptKey>('PUT', `/secrets/${encodeURIComponent(name)}`, { value, ...(appId ? { appId } : {}) }),
  dropSecret: (name: string, appId?: string) => call<KeptKey>('DELETE', `/secrets/${encodeURIComponent(name)}${appId ? `?app=${appId}` : ''}`),
  taskBranches: (issueId: string) => call<TaskBranches>('GET', `/issues/${issueId}/branches`),
  saveHere: (issueId: string, name: string) => call<{ id: string; name: string }>('POST', `/issues/${issueId}/save-points`, { name }),
  goBack: (savePointId: string, body: { name?: string; resetData?: boolean }) => call<TaskMoved>('POST', `/save-points/${savePointId}/go-back`, body),
  switchTaskBranch: (branchId: string, body: { resetData?: boolean } = {}) => call<TaskMoved>('POST', `/task-branches/${branchId}/switch`, body),
  deleteSavePoint: (id: string) => call<{ deleted: string }>('DELETE', `/save-points/${id}`),
  deleteTaskBranch: (id: string) => call<{ deleted: string }>('DELETE', `/task-branches/${id}`),
  clearTaskBranches: (issueId: string) => call<{ taskBranches: number; savePoints: number }>('DELETE', `/issues/${issueId}/branches`),
  approveBrief: (issueId: string, approve = true) => call<Issue>('POST', `/issues/${issueId}/brief/approve`, { approve }),
  workflows: (appId: string) => call<WorkflowRow[]>('GET', `/workflows?app=${appId}`),
  saveWorkflow: (body: { id?: string; appId: string; name: string; steps: WorkflowStep[]; ordered: boolean; build?: 'one' | 'planned'; style?: 'checklist' | 'staged'; requirements?: Record<string, boolean> | null }) => call<Workflow>(body.id ? 'PUT' : 'POST', body.id ? `/workflows/${body.id}` : '/workflows', body),
  writeHandover: (issueId: string, again = false) => call<{ handover: IssueDetail['handover']; why?: string }>('POST', `/issues/${issueId}/handover`, { again }),
  /** A task's speed: careful, fast, or null to follow its app. */
  useWorkflow: (target: { kind: 'apps' | 'projects' | 'issues'; id: string }, workflowId: string | null) => call<{ ok: true }>('POST', `/${target.kind}/${target.id}/workflow`, { workflowId }),
  apps: () => call<App[]>('GET', '/apps'),
  /** The apps put away, latest first, with what each holds. */
  removedApps: () => call<AppHolds[]>('GET', '/apps?removed=1'),
  /** Puts an app away: out of every list, nothing of it runs; it can be brought back. */
  removeApp: (id: string) => call<App>('POST', `/apps/${id}/remove`),
  restoreApp: (id: string) => call<App>('POST', `/apps/${id}/restore`),
  /** Deletes a put-away app and everything in it, for good; `name` is its name as the person typed it. */
  deleteApp: (id: string, name: string) => call<{ deleted: string }>('DELETE', `/apps/${id}`, { name }),
  workspaces: () => call<Workspace[]>('GET', '/workspaces'),
  settings: () => call<FactorySettings>('GET', '/settings'),
  updateWorkspace: (id: string, body: { name?: string; integrations?: IntegrationValues }) => call<Workspace>('PATCH', `/workspaces/${id}`, body),
  appSettings: (id: string) => call<AppSettings>('GET', `/apps/${id}/settings`),
  /** A probe tried on past work: the latest trial of each, and the merged tasks one would run on. */
  /** Each nightly check's last run on the default branch, and the workflows the app's checkout has (the engine's nightly.ts). */
  nightly: (appId: string) => call<{ checks: { key: string; workflow: string; status: 'passed' | 'failed' | 'none'; url: string | null; ranAt: string | null; failing: number; greenAt: string | null; error: string | null }[]; workflows: { file: string; name: string; scheduled: boolean; onPr: boolean; jobs: string[] }[] }>('GET', `/apps/${appId}/nightly`),
  trials: (appId: string) => call<{ trials: Trial[]; tasks: { issueId: string; identifier: string; title: string; pr: number | null }[] }>('GET', `/apps/${appId}/trials`),
  startTrial: (appId: string, body: { key: string; probe: Trial['probe']; limit?: number }) => call<Trial>('POST', `/apps/${appId}/trials`, body),
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
  updateApp: (id: string, body: { name?: string; /** Its abbreviation: MER in MER-50. */ key?: string; defaultBranch?: string; /** Only the settings that change: a value sets one, null removes it, the rest stay as the engine has them. */ setup?: Record<string, unknown>; /** Changes to what a build is held to, applied in order to the list as the engine has it. */ held?: import('@self-evident/engine/contracts').ProbeChange[] }) => call<App>('PATCH', `/apps/${id}`, body),
  createRepo: (body: { appId: string; fullName: string; localPath?: string; baseBranch?: string }) => call<Repo & { note: string | null }>('POST', '/repos', body),
  /** The open tickets of the app's Linear team (Integrations › Linear). Reads Linear; nothing is written there. */
  linearTickets: (appId: string, scope: LinearScope) => call<{ team: string; tickets: LinearTicket[] }>('GET', `/apps/${appId}/linear/tickets?scope=${scope}`),
  /** The tickets named become ideas, or (`as: 'task'`, a project's Add tasks) tasks. */
  importLinear: (appId: string, identifiers: string[], as: 'idea' | 'task' = 'idea') => call<LinearImported>('POST', `/apps/${appId}/linear/import`, { identifiers, as }),
  /** The app's assets, or with a project that project's own. Every conversation there is told them. */
  assets: (appId: string, projectId?: string) => call<Asset[]>('GET', `/apps/${appId}/assets${projectId ? `?project=${projectId}` : ''}`),
  addAsset: (body: { appId: string; projectId?: string; name: string; location: string; note?: string }) => call<Asset>('POST', '/assets', body),
  removeAsset: (id: string) => call<{ removed: string }>('DELETE', `/assets/${id}`),
  deleteRepo: (id: string) => call<{ removed: string }>('DELETE', `/repos/${id}`),
  /** Opens the folder dialog on the engine's computer (or scans `path`) and says which repositories are there. */
  chooseFolder: (path?: string) => call<Folder>('POST', '/folders/choose', path ? { path } : {}),
  updateRepo: (id: string, body: { fullName?: string; localPath?: string | null; baseBranch?: string | null }) => call<Repo & { note: string | null }>('PATCH', `/repos/${id}`, body),
  projects: (appId?: string, opts: { solo?: boolean } = {}) => call<ProjectSummary[]>('GET', `/projects${appId ? `?app=${appId}${opts.solo ? '&solo=1' : ''}` : ''}`), // solo: tasks planned on their own too (Build's page)
  graph: (id: string) => call<Graph>('GET', `/projects/${id}/graph`),
  createProject: (body: { appId: string; name: string; content?: string; description?: string; ideaId?: string; workflowId?: string; issues?: NewProjectIssue[] }) => call<{ project: { id: string } }>('POST', '/projects', body),
  cancelProject: (projectId: string) => call<{ cancelled: number; landed: number }>('POST', `/projects/${projectId}/cancel`),
  start: (id: string) => call<unknown>('POST', `/projects/${id}/start`),
  buildTask: (issueId: string) => call<{ planning: boolean; started: boolean }>('POST', `/issues/${issueId}/build`), // plan it if it is not, then build it: the task is what is built
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
  /** Close a task: it is Done. Its pull request is merged and every check left to a person is passed or skipped. Its project is closed with it when it was the last. */
  closeTask: (issueId: string) => call<{ id: string; state: 'done'; projectClosed: boolean }>('POST', `/issues/${issueId}/close`),
  pause: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/pause`),
  resume: (projectId: string) => call<unknown>('POST', `/projects/${projectId}/resume`),
  releaseHold: () => call<unknown>('POST', '/engine/release'),
  retry: (issueId: string, fresh = false) => call<{ identifier: string; fresh: boolean; resumed: number[] }>('POST', `/issues/${issueId}/retry`, { fresh }),
  setBuild: (issueId: string, status: BuildStatus) => call<unknown>('POST', `/issues/${issueId}/build`, { status }),
}

/** A picture sent with a message: base64, without the data: prefix. */
export interface TalkImage { name: string; mediaType: string; data: string }

export const EVENT_TYPES = [
  'project.created', 'project.started', 'project.landed', 'project.closed', 'task.closed', 'project.cleaned', 'project.cancelled', 'project.paused', 'project.resumed', 'project.described',
  'issue.created', 'issue.deleted', 'issue.updated', 'issue.state', 'issue.reordered', 'issue.cleared', 'issue.planning', 'issue.planned', 'issue.plan_failed', 'issue.plan_waiting', 'issue.commented',
  'question.asked', 'question.answered', 'initiative.created', 'initiative.updated', 'cycle.created',
  'talk.message', 'talk.permission', 'talk.result', 'prototype.shown', 'share.started', 'share.stopped', 'idea.created', 'idea.converted', 'step.updated', 'brief.approved', 'brief.unapproved', 'workflow.saved', 'workflow.used', 'engine.hold', 'engine.resumed',
  'pr.merged', 'pr.closed', 'pr.retargeted', 'pr.review', 'pr.checks', 'nightly.failed', 'nightly.passed', 'review.requested', 'project.caught_up', 'project.behind_main', 'trial.started', 'trial.progress', 'trial.finished', 'checkout.behind', 'checkout.pulled',
  'backlog.error', 'project.backlog_open',
  'build.status', 'build.held', 'build.retry', 'build.failed', 'build.error', 'build.interrupted', 'build.carried_on',
  'run.started', 'run.message', 'run.steps', 'run.tool_call', 'run.tool_result', 'run.result', 'run.error', 'run.rate_limit',
  'land.committed', 'land.tested', 'land.landed', 'land.conflict', 'land.retry', 'pr.opened', 'pr.updated', 'pr.error',
  'task.tested', 'task.testing', 'task.test_ran', 'task.test_again', 'task.test_failed', 'task.test_error', 'task.checked', 'learn.written', 'smoke.started', 'smoke.marked', 'smoke.skipped', 'smoke.trying', 'smoke.tried', 'task.smoke_waiting',
  'task.check_again', 'task.check_reopened', 'smoke.accepted', 'release.marked',
]

const LIVE_POLL_MS = 20_000

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
    es.onopen = () => { setError(null); void refresh() } // back after a gap (the engine restarted): what was missed is read now
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, LIVE_POLL_MS) // and a slow read besides, so a missed event never leaves a node stale until the page is reloaded
    return () => { closed = true; es.close(); window.clearTimeout(timer.current); window.clearInterval(poll) }
  }, [projectId])
  return { graph, events, error }
}
