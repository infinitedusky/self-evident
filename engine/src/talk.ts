/**
 * Talk: an interactive agent session the engine owns. The same Claude Code the planner and the builders run, with
 * a person on the other end. The conversation is rows and events (so it survives a restart and shows on any
 * page); the engine's own API is the agent's MCP tools; an edit or a shell command waits for the person's yes in
 * the UI, Claude Code's default mode. Development runs on the operator's login, the product on an API key.
 */
import { fileURLToPath } from 'node:url'
import { createSdkMcpServer, query, tool, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, idea, issue, project, prototype, repo, session, sessionMessage, workspace } from './db/schema.js'
import { step, type StepKey } from './steps.js'
import { addWorktree, git, removeWorktree } from './git.js'
import { checkoutProblem } from './checkout.js'
import { withLock } from './landing.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { referenceHolding, referencePrompt, referencesOf, refusal } from './references.js'
import { assetPrompt, assetsFor } from './assets.js'
import { addMates, homeRepo, mateHolding, matePrompt, matesOf, removeMates } from './workbench.js'
import { EDIT_TOOLS, rank, riskOf, type Risk } from './risk.js'
import { holdMinutes, isOutage } from './outage.js'
import { engineTools } from './tools.js'
import { prototypeEnv } from './prototype.js'
import { skillOptions } from './skills.js'
import { issueDetail, PlanError, projectGraph } from './projects.js'
import { existsSync, statSync } from 'node:fs'
import { stopStorybookAt } from './storybook.js'
import { lastUuid, latestSession, readTurns, sessionFile, sessionLabel, sessionsIn, sessionTitle } from './terminal.js'

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'WebFetch', 'WebSearch', 'Skill']
const ASK_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']
const CHECK_TOOLS = ['Bash'] // a check reads: no editing tools, and the shell is rated like anyone's
const PERMISSION_TIMEOUT_MS = 10 * 60_000

/** Self Evident's own guide to running it, in the engine's checkout: any app's agent can read it when asked for help. */
export const GUIDE = fileURLToPath(new URL('../../docs/running-it.md', import.meta.url))

const talkPrompt = (cwd: string, branch: string | null, base: string, where?: string) => `You are Self Evident's agent (Self Evident: software that proves itself — observe, learn, ideate, mockup, build), talking with the person who runs it, in its own web UI.
The factory builds software from ideas, shaped like Linear: initiative (a goal) → project (tasks in order) → task (a title and a brief; code, or a to-do: work outside the code) → sub-task (under code: one agent, one worktree, one commit; under a to-do: a checklist line). We say task where Linear says issue (and sub-task for sub-issue); say task to the person, though tool fields and ids still say issue (issueId is a task's id). Tasks are named by the app's key and a number, like HG-12; use those names with the person. Read CLAUDE.md, LOG.md and SHAPE.md in this checkout when you need the history; LOG.md's top entries are the latest decisions.
You have the engine as tools (mcp__engine__*): see what needs attention, keep ideas, make projects, keep each project's backlog (everything it has to cover; when the person mentions something a project should not forget, add it), keep the app's to-dos (work outside the code: accounts, approvals, people, checks; when the person mentions one, make it with a checklist you draft, and check lines off as they get done), run the planner on a task, answer its questions, start or cancel projects, read the event log. Use them rather than describing what the person should click.
You can read, search and edit files and run commands here, as in any Claude Code session. The engine rates every action's risk (free, cheap, moderate, expensive); up to the person's threshold it runs without asking and is logged, above it a card asks them. Expensive things (main, force, deletes, merges, publishing, starting a project) always ask. Work on a branch in a worktree, never in a checkout that is on main; say what each action is for.
${where ?? `You work in your own worktree, ${cwd}, on branch ${branch ?? '(none)'} cut from ${base}: edit and commit there; push and open a pull request when the work is ready (both ask).`}
The brief is the parent of a task's steps: research, sketches, mockups, the prototype and the checks (the prototype analysis, an ADR, the blast radius, a brief audit) all exist to make it solid, and it is approved last, once the required ones are done. Keep it up to date as the steps land, and name in it what each produced (the sketch files, the story ids, the prototype's branch, the report), so it points at them. Looking before building has three steps, in this order: sketches, mockups, the prototype. A sketch is about speed: one plain HTML file per screen under sketches/ in your worktree, its CSS inside it, no framework and no build, a whole screen as the user sees it with made-up data that says so; show it with open_tab (kind sketch, file: its name) so it is beside the conversation, where it reloads by itself each time you change the file; never send the person a link or a path to open. Change it the moment they react, and record it with set_step (key sketch, refs: the files). A story you write shows the same way: open_tab kind storybook with its id, which shows your worktree's Storybook. Once they like it, do it properly as a story (the mockup step); the agreed mockup is named in the brief. The prototype finds the best way to build it, and what it taught goes into the brief too, in a Prototype section: its branch, what the analysis found, what to keep and what to change. The real build starts from main with the prototype as a map to follow and improve on, never as code to carry over.
About Self Evident itself (how it runs on this computer, its database, moving between computers, adding an app, two GitHub accounts, reference apps, why it won't start): read ${GUIDE} before answering, and LOG.md beside it for why a thing is the way it is. They are Self Evident's own files, not this app's: read them, don't edit them from here.
How this person works: PRs only, main is production; short answers that lead with the answer; questions are questions, not instructions to change things; give a recommendation, not a survey; write decisions into LOG.md or SHAPE.md the moment they are made; one git worktree per branch, never the main checkout.`

/**
 * A prototype's conversation: the actual thing built fast, to demo and learn from, then analysed into the plan and built
 * again from scratch. Speed and change come first; quality lives in the real build.
 */
const appPrompt = (name: string, cwd: string) => `This conversation is about ${name} as a whole: an idea, a new task, a question about the code, a look at what was found. You are in its checkout, ${cwd}, which is the person's own: read it and run its tests or a read-only command, and change nothing in it. You have no editing tools here, no worktree and no branch, and a command that leaves a mark asks the person first. Anything that changes files (code, a sketch, a story, a fix) is a task's work: create the task with create_task, or name the one that exists, and tell the person to open it; its own agent works there, in a worktree of its own. A prototype still starts from here (start_prototype) and gets its own worktree.`

const prototypePrompt = (p: typeof prototype.$inferSelect) => `This conversation builds the prototype "${p.title}" (${p.id}), in its own worktree ${p.path} on branch ${p.branch}. The person sees it running in the Prototype tab beside you${p.port ? ` (http://localhost:${p.port})` : ''}; its server is the engine's, started with the app's prototype command on $PORT.
What a prototype is: the actual thing, built fast so it can be used, changed in moments and shown to people. It is never merged: when it is ready, everything about it (the diff, its data's final shape, the conversation, people's feedback, what changed between iterations and why) is analysed into the plan, and the real build starts from main, from scratch. So:
- Speed over quality. Shortcuts are the default: hardcode, fake, skip error handling and edge cases. No tests, no review, no conventions to keep. Build only what the person needs to see or try.
- Start from the agreed mockups (stories) when there are any; the prototype decides how it works, not how it looks.
- Its data is made up and says so. Change the data shape freely (schema, JSON, whatever is fastest); write no migrations: the real build works them out.
- When the app has a database, the prototype has its own throwaway one (your environment's database variable already points at it). Its made-up data lives in scenarios: .prototype/scenarios/<name>/<table>.json, each an array of rows, committed with the prototype. Write a scenario for each situation worth showing ("default" is used first), load one with prototype_data (reset), and save a state worth keeping with prototype_data (save). After a schema change, reset so the database is built again.
- Commit after each change the person could look at, with a message that says what changed and why; begin a line with "shortcut:" for anything faked or skipped that the real build must do properly. The commits are the record the analysis reads.
- Never push, never open a pull request, never merge.
- After a change, check the server still answers (the prototype tool says, with its last lines of output) and tell the person in one line what to look at. If the change needs a restart (no hot reload, new dependencies), use run_prototype with restart: it keeps the same address, and the open tab reloads by itself, so never ask the person to reload.
Your first message is the brief: build a first version straight away, then ask what to change.`

interface Pending { resolve: (v: { allow: boolean; always?: boolean }) => void; tool: string }
type Rated = { risk: Risk; why: string }
interface Live { q: Query; push: (m: SDKUserMessage) => void; close: () => void; pending: Map<string, Pending>; rated: Map<string, Rated>; lastPrompt?: string; outages: number; always: Set<string>; busy: boolean; autoApprove: Risk; cwd: string }
const execFileP = promisify(execFile)
const branchOf = (cwd: string) => execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).then((r) => r.stdout.trim()).catch(() => null)
const key = (tool: string, input: unknown) => tool + JSON.stringify(input).slice(0, 200)
const live = new Map<string, Live>()

function inputQueue() {
  const buf: SDKUserMessage[] = []
  let wake: (() => void) | null = null
  let closed = false
  const it = (async function* () {
    while (!closed) {
      if (buf.length) yield buf.shift()!
      else await new Promise<void>((r) => { wake = r })
    }
  })()
  return { it, push: (m: SDKUserMessage) => { buf.push(m); wake?.(); wake = null }, close: () => { closed = true; wake?.(); wake = null } }
}

const clip = (s: unknown, n = 600) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? t.slice(0, n) + '…' : (t ?? '') }
const summariseInput = (name: string, input: any) => {
  switch (name) {
    case 'Bash': return { command: clip(input?.command, 400) }
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return { file: input?.file_path, ...(name === 'Edit' ? { old: clip(input?.old_string, 200), new: clip(input?.new_string, 200) } : {}), ...(name === 'Write' ? { bytes: String(input?.content ?? '').length } : {}) }
    case 'Glob': case 'Grep': return { pattern: input?.pattern, path: input?.path }
    default: return { input: clip(input, 400) }
  }
}

/** The engine, as tools for this conversation's agent: the shared set (tools.ts), through the Agent SDK. */
function engineServer(appId: string, sessionId?: string) {
  return createSdkMcpServer({
    name: 'engine', version: '0.3.0',
    instructions: 'The Self Evident engine, scoped to this conversation\'s app, shaped like Linear. Initiatives are goals; projects are tasks in order; a code task becomes sub-tasks through the planner; each sub-task is built by an agent in a worktree and lands into the project\'s branch and PR. To-dos are tasks for the work around the code, with checklists. Tasks are named like HG-12 (Linear calls them issues; tool fields and ids still say issue).',
    tools: engineTools({ appId, sessionId, actor: 'agent', waitForPlanner: true }).map((t) => tool(t.name, t.description, t.shape, (a) => t.handler(a))),
  })
}

/**
 * Where a new conversation's auto-approve starts: the level last picked in any conversation (kept on the workspace), or
 * up to moderate. A task's agent works in its own worktree and branch, so moderate (commits there, the engine's own
 * actions) is contained; a conversation about the app has no editing tools and asks before a command that leaves a
 * mark; expensive (pushing main, deleting, spending) always asks.
 */
async function defaultAutoApprove(appId: string): Promise<Risk> {
  const [w] = await db.select().from(workspace).where(eq(workspace.id, await workspaceFor(appId)))
  const picked = (w?.settings as { talkAutoApprove?: Risk } | undefined)?.talkAutoApprove
  return picked && ['free', 'cheap', 'moderate'].includes(picked) ? picked : 'moderate'
}

async function workspaceFor(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (a) return a.workspaceId
  const [w] = await db.select().from(workspace).limit(1)
  return w?.id ?? 'ws_none'
}

/** One transcript row, and the event that tells every open page about it. */
async function record(sessionId: string, author: string, kind: string, body: string, payload?: Record<string, unknown>, at?: Date) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  const workspaceId = await workspaceFor(s.appId)
  const [row] = await db.insert(sessionMessage).values({ appId: s.appId, sessionId, author, kind, body, payload: payload ?? null, status: 'sent', sentAt: at ?? new Date(), ...(at ? { queuedAt: at } : {}) }).returning()
  await db.update(session).set({ lastActiveAt: new Date() }).where(eq(session.id, sessionId))
  await db.transaction((tx) => appendEvent(tx, {
    workspaceId, appId: s.appId, sessionId, actor: author === 'user' ? 'user' : `agent:${sessionId}`,
    type: kind === 'permission' ? 'talk.permission' : kind === 'result' ? 'talk.result' : 'talk.message',
    payload: { sessionId, messageId: row.id, author, kind, body: clip(body, 200), ...(payload ?? {}) },
  }))
  return row
}

/** `issueId` pins a task's own agent; `checkOf` and `check` mark a fresh agent out on one check of that task (checks.ts). */
export interface SubjectRef { projectId?: string; issueId?: string; ideaId?: string; prototypeId?: string; path?: string; checkOf?: string; check?: StepKey; setup?: string; /** About the app as a whole: in its checkout, reading, with no worktree. */ app?: boolean }

/** What a conversation is about, from where it started: a project's title, an idea's title, or nothing yet. */
async function subjectFrom(ref?: SubjectRef): Promise<{ subject: string | null; subjectRef: SubjectRef | null }> {
  if (ref?.projectId) { const [p] = await db.select().from(project).where(eq(project.id, ref.projectId)); if (p) return { subject: p.name, subjectRef: { projectId: p.id } } }
  if (ref?.ideaId) { const [i] = await db.select().from(idea).where(eq(idea.id, ref.ideaId)); if (i) return { subject: i.title, subjectRef: { ideaId: i.id } } }
  if (ref?.issueId) { const [t] = await db.select().from(issue).where(eq(issue.id, ref.issueId)); const [a] = t ? await db.select().from(app).where(eq(app.id, t.appId)) : []; if (t && a) return { subject: `${a.key}-${t.number} ${t.title}`, subjectRef: { issueId: t.id } } } // a task's own agent (ensureTaskTalk)
  if (ref?.setup) return { subject: `Set up ${ref.setup}`, subjectRef: { setup: ref.setup } } // an integration's set-up, handed to the agent (one per app at a time)
  return { subject: null, subjectRef: ref?.path ? { path: ref.path } : null }
}

/**
 * A new conversation. Only a task's agent, and an integration's set-up (which ends in a pull request), gets a worktree
 * of each of the app's repos on a branch of its own. Every other one is a conversation about the app as a whole
 * (Sandy, 2026-11-13: "only tasks should … they are now just different conversations about the app as a whole"): it
 * sits in the app's checkout, reads it, and has no worktree or branch (`subjectRef.app`).
 */
export async function startTalk(input: { appId: string; subjectRef?: SubjectRef; actor?: string }) {
  const [a] = await db.select().from(app).where(eq(app.id, input.appId))
  if (!a) throw new PlanError(`no app ${input.appId}`)
  const r = await homeRepo(input.appId)
  if (!r?.localPath) throw new PlanError(`${a.name} has no local checkout yet; add its repo in Settings`)
  const problem = await checkoutProblem(r.localPath)
  if (problem) throw new PlanError(`${problem} Save it under Settings › Repo and Self Evident sets it up.`)
  const id = newId('session')
  if (!input.subjectRef?.issueId && !input.subjectRef?.setup) {
    const { subject, subjectRef } = await subjectFrom(input.subjectRef)
    const [row] = await db.insert(session).values({
      id, appId: a.id, kind: 'talk', cwd: r.localPath, branch: null, worktreePath: null, subject, subjectRef: { ...subjectRef, app: true }, createdBy: input.actor ?? 'user', lastActiveAt: new Date(),
      autoApprove: await defaultAutoApprove(a.id),
    }).returning()
    return row
  }
  const short = id.slice(-6).toLowerCase()
  const branch = `talk/${short}`
  const worktreePath = `${r.localPath}-worktrees/talk-${short}`
  await withLock(`git:${r.localPath}`, async () => {
    await git(r.localPath!, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })
    const base = (await git(r.localPath!, ['rev-parse', '--verify', '--quiet', `origin/${a.defaultBranch}`], { allowFail: true })).code === 0 ? `origin/${a.defaultBranch}` : a.defaultBranch
    await addWorktree(r.localPath!, worktreePath, branch, base)
  })
  const { left } = await addMates(a.id, worktreePath, branch) // the app's other repositories, on the same branch (workbench.ts)
  for (const l of left) console.log(`[workbench] ${a.name}: no worktree in ${l}`)
  const { subject, subjectRef } = await subjectFrom(input.subjectRef)
  const [row] = await db.insert(session).values({
    id, appId: a.id, kind: 'talk', cwd: worktreePath, branch, worktreePath, subject, subjectRef, createdBy: input.actor ?? 'user', lastActiveAt: new Date(),
    autoApprove: await defaultAutoApprove(a.id),
  }).returning()
  return row
}

/**
 * A task's own agent: the one open conversation pinned to the task, the conductor of its worktree for the life of the
 * task (SHAPE.md, "A task's agent lives on the task's page"). The oldest open one, so a stray second never takes over.
 */
export async function taskTalk(issueId: string) {
  const [row] = await db.select().from(session)
    .where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), sql`${session.subjectRef}->>'issueId' = ${issueId}`)).orderBy(session.createdAt).limit(1)
  return row ? { ...row, live: live.has(row.id), busy: live.get(row.id)?.busy ?? false } : null
}

/**
 * The agents a task's conductor has out: the conversation of each prototype started on the task (its own agent, in
 * the prototype's worktree), and each fresh agent out on a check (checks.ts). They are the task's, so they show on its
 * page beside the conductor and not in the app's column (Sandy, 2026-11-10: "if there is a sub agent we should see
 * some indication").
 */
export async function taskAgents(issueId: string) {
  const protos = await db.select().from(prototype).where(and(eq(prototype.issueId, issueId), inArray(prototype.status, ['running', 'stopped']), isNotNull(prototype.sessionId))).orderBy(prototype.createdAt)
  const rows = protos.length ? await db.select().from(session).where(inArray(session.id, protos.map((p) => p.sessionId!))) : []
  const building = protos.flatMap((p) => {
    const s = rows.find((r) => r.id === p.sessionId)
    return s && s.status === 'open' ? [{ sessionId: s.id, kind: 'prototype' as const, what: 'Prototype', icon: step('prototype').icon, title: p.title, prototypeId: p.id, busy: live.get(s.id)?.busy ?? false }] : []
  })
  const checking = (await checkTalks(issueId)).map((s) => {
    const d = step((s.subjectRef as SubjectRef).check!)
    return { sessionId: s.id, kind: 'check' as const, what: d.label, icon: d.icon, title: s.subject ?? d.label, check: d.key, busy: live.get(s.id)?.busy ?? false }
  })
  return [...building, ...checking]
}

/** The open conversations of the fresh agents out on a task's checks, oldest first. */
export const checkTalks = (issueId: string) => db.select().from(session)
  .where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), sql`${session.subjectRef}->>'checkOf' = ${issueId}`)).orderBy(session.createdAt)

/**
 * A fresh agent for one check of a task: a conversation of its own that starts from what it is told and nothing
 * else, in a folder it only reads (the prototype's worktree, or the conductor's), so ending it removes nothing.
 */
export async function startCheckTalk(i: { appId: string; issueId: string; check: StepKey; cwd: string; branch: string | null; subject: string }) {
  const [row] = await db.insert(session).values({
    id: newId('session'), appId: i.appId, kind: 'talk', cwd: i.cwd, branch: i.branch, worktreePath: null,
    subject: i.subject, subjectRef: { checkOf: i.issueId, check: i.check }, createdBy: 'engine', lastActiveAt: new Date(), autoApprove: 'cheap',
  }).returning()
  return row
}

/**
 * The conductor directs the agents it has out (Sandy, 2026-11-11: "talk with one agent throughout the task lifecycle
 * and it can manage the whole thing"). It sends one a message; that agent works in its own conversation, where the
 * person can watch; when its turn ends, what it said comes back to the conductor as a message, so the conductor is
 * free to talk meanwhile. The ask is kept on the message itself (`payload.from`, then `answered`), so nothing is held
 * in memory.
 */
async function conducted(fromSessionId: string, agent: string) {
  const [from] = await db.select().from(session).where(eq(session.id, fromSessionId))
  const issueId = (from?.subjectRef as SubjectRef | null)?.issueId
  if (!from || !issueId) throw new PlanError('only a task\'s own agent has agents out')
  const out = await taskAgents(issueId)
  const want = agent.trim().toLowerCase()
  const found = out.filter((a) => a.sessionId === agent || a.kind === want || a.what.toLowerCase() === want || ('check' in a && a.check === want))
  if (!found.length) throw new PlanError(out.length ? `no agent "${agent}" out on this task; out now: ${out.map((a) => `${a.what} (${a.sessionId})`).join(', ')}` : 'this task has no agents out')
  if (found.length > 1) throw new PlanError(`more than one agent matches "${agent}": name it by its sessionId (${found.map((a) => a.sessionId).join(', ')})`)
  return { from, issueId, to: found[0] }
}

/** What a task's conductor has out, each with the last thing it said. */
export async function agentsOut(fromSessionId: string) {
  const [from] = await db.select().from(session).where(eq(session.id, fromSessionId))
  const issueId = (from?.subjectRef as SubjectRef | null)?.issueId
  if (!issueId) throw new PlanError('only a task\'s own agent has agents out')
  return Promise.all((await taskAgents(issueId)).map(async (a) => {
    const [last] = await db.select({ body: sessionMessage.body, at: sessionMessage.sentAt }).from(sessionMessage).where(and(eq(sessionMessage.sessionId, a.sessionId), eq(sessionMessage.author, 'agent'), eq(sessionMessage.kind, 'text'))).orderBy(desc(sessionMessage.id)).limit(1)
    return { ...a, state: a.busy ? 'working' : 'idle', lastSaid: last ? clip(last.body, 600) : null, lastSaidAt: last?.at ?? null }
  }))
}

/** The conductor says something to an agent it has out. The answer comes back by itself when that agent's turn ends. */
export async function tellAgent(fromSessionId: string, agent: string, message: string) {
  const { to } = await conducted(fromSessionId, agent)
  await say(to.sessionId, message, undefined, { author: 'engine', kind: 'brief', payload: { from: fromSessionId, label: 'From this task\'s agent' } })
  return { sent: true, to: to.what, sessionId: to.sessionId, next: 'Its answer comes back to you here as a message when it finishes; do not wait or poll. The person can watch it work in its tab.' }
}

/** The recent conversation of an agent the conductor has out: what was said to it (the person may have, directly) and what it said. */
export async function readAgent(fromSessionId: string, agent: string, last = 20) {
  const { to } = await conducted(fromSessionId, agent)
  const rows = await db.select().from(sessionMessage).where(and(eq(sessionMessage.sessionId, to.sessionId), inArray(sessionMessage.kind, ['text', 'brief']))).orderBy(desc(sessionMessage.id)).limit(Math.min(Math.max(last, 1), 60))
  return { agent: to.what, sessionId: to.sessionId, state: to.busy ? 'working' : 'idle', messages: rows.reverse().map((m) => ({ by: m.author === 'agent' ? 'the agent' : (m.payload as any)?.from ? 'you' : m.author === 'user' ? 'the person' : 'the engine', at: m.sentAt, text: clip(m.body, 2000) })) }
}

/**
 * What goes back to the conductor when a turn ends in a conversation it had asked something of: who asked, and what
 * the agent said since. Marks the ask answered, so it goes back once. Null when nobody is waiting.
 */
export async function takeReply(sessionId: string): Promise<{ from: string; what: string; said: string | null } | null> {
  const open = and(eq(sessionMessage.sessionId, sessionId), sql`${sessionMessage.payload}->>'from' is not null`, sql`${sessionMessage.payload}->>'answered' is null`)
  const asks = await db.select().from(sessionMessage).where(open).orderBy(sessionMessage.id)
  if (!asks.length) return null
  for (const m of asks) await db.update(sessionMessage).set({ payload: { ...(m.payload as object), answered: true } }).where(eq(sessionMessage.id, m.id)) // one answer covers every open ask
  const [said] = await db.select({ body: sessionMessage.body }).from(sessionMessage).where(and(eq(sessionMessage.sessionId, sessionId), eq(sessionMessage.author, 'agent'), eq(sessionMessage.kind, 'text'), sql`${sessionMessage.id} > ${asks[0].id}`)).orderBy(desc(sessionMessage.id)).limit(1)
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  const ref = s?.subjectRef as SubjectRef | null
  return { from: (asks[asks.length - 1].payload as { from: string }).from, what: ref?.check ? step(ref.check).label : ref?.prototypeId ? 'Prototype' : s?.subject ?? 'An', said: said?.body ?? null }
}

async function reportBack(sessionId: string) {
  const r = await takeReply(sessionId)
  if (!r) return
  const [home] = await db.select().from(session).where(eq(session.id, r.from))
  if (!home || home.status !== 'open') return
  await say(r.from, `The ${r.what} agent finished what you asked.\n\n${r.said ? clip(r.said, 6000) : 'It stopped without saying anything; read_agent shows what happened.'}`, undefined, { author: 'engine', kind: 'brief', payload: { back: sessionId, label: `Back from the ${r.what} agent` } })
}

const turnEnded: ((sessionId: string) => void)[] = [(id) => { void reportBack(id).catch((err) => console.error('talk: could not report back to the conductor', err)) }]
/** Called each time a conversation's agent finishes a turn; what follows from it (the next check) lives elsewhere. */
export const onTurnEnd = (fn: (sessionId: string) => void) => { turnEnded.push(fn) }

/** The task's agent, started if it has none: one conversation, one worktree, however many times it is asked for. */
export async function ensureTaskTalk(issueId: string, actor = 'user') {
  return withLock(`task-talk:${issueId}`, async () => {
    const there = await taskTalk(issueId)
    if (there) return there
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    if (t.parentId || t.kind !== 'code') throw new PlanError('only a top-level code task has an agent of its own')
    const row = await startTalk({ appId: t.appId, subjectRef: { issueId }, actor })
    return { ...row, live: false, busy: false }
  })
}

/**
 * The model a conversation runs on. A prototype is for speed, so its agent runs on Sonnet (Sandy, 2026-11-10: "the
 * prototype agent should be sonnet and it should build fast"); an app can name another with `prototype_model`. Every
 * other conversation runs on the app's `model`, or the harness's default.
 */
export const PROTOTYPE_MODEL = 'claude-sonnet-5-5'
export const modelFor = (setup: { model?: string; prototype_model?: string }, prototype: boolean) => (prototype ? setup.prototype_model || PROTOTYPE_MODEL : setup.model)

const taskPrompt = (t: { id: string; number: number; title: string }, key: string) => `
This conversation is the agent of one task, ${key}-${t.number} "${t.title}" (${t.id}), and the only one: you are its conductor from its first sketch to its merge, in this one worktree. Every step of its brief (research, sketches, mockups, the prototype, the checks) and its build is done or directed from here: record each with set_step on this task, and keep its brief current with update_task. Marking a step done says it is ready for the person; they approve it on its page, and only then does it count. The person sees this conversation on the task's page, beside the step they are looking at, and "this" means this task. open_tab with a sketch, a story or the prototype takes them to that step's page of this task, where it shows beside you; it never splits a tab off. A prototype you start gets an agent of its own, in the prototype's worktree: the person sees it as a second tab at the top of this same column, named Prototype, with a dot that pulses while it works; name the tab when you point them to it, never "the conversation beside you". You direct the agents you have out, so the person talks to you alone: agents_out lists them with what each last said; tell_agent sends one a message (when the person asks for a change to the prototype, pass it on in full, with what you know from the conversation, instead of sending them to the tab); its answer comes back to you here as a message when it finishes, so say you have passed it on and carry on, never wait or poll; read_agent reads its conversation, since the person may have talked to it directly. When an answer comes back, tell the person in a line or two what changed and what to look at. When the person approves the prototype, the engine sends a fresh agent for each check this task's workflow has, one after the other (the prototype analysis, the ADR, the blast radius), each a tab in this same column; you do not write those yourself. The engine then tells you here to bring the brief up to date, and after that the brief audit runs the same way. Keep to this task: for a new idea, another task or a look at findings, point them to the app's agent in the left column.`

/** A fresh agent out on one check: it reads, reports once with set_step, and stops. Its first message says what to read and what to report. */
const checkPrompt = (key: StepKey, cwd: string) => `You are a fresh agent sent out for one piece of work on one task: its ${step(key).label.toLowerCase()}. You start from the message you are given and nothing else; that is the point, eyes that have not seen the conversation. You work in ${cwd}, which is someone else's folder: read anything, change nothing. You have no editing tools; use the shell only to read (git log, git diff, git show, ls, cat, grep, rg). Never commit, push, install or start anything. Your report is the whole result: record it once with set_step as you are told, then say in two or three lines what you found and stop. If the person writes to you afterwards, answer from what you read.`

/**
 * A prototype's conversation: it works in the prototype's own worktree (not one of its own), so ending it leaves the
 * prototype alone. It acts up to moderate without asking (a prototype is for speed); expensive still asks.
 */
export async function startPrototypeTalk(p: typeof prototype.$inferSelect, actor = 'user') {
  const [row] = await db.insert(session).values({
    id: newId('session'), appId: p.appId, kind: 'talk', cwd: p.path, branch: p.branch, worktreePath: null,
    subject: `Prototype: ${p.title}`, subjectRef: { prototypeId: p.id, ...(p.projectId ? { projectId: p.projectId } : {}) },
    createdBy: actor, lastActiveAt: new Date(), autoApprove: 'moderate',
  }).returning()
  return row
}

/** Ask every open Self Evident to show this conversation in the agent's column. */
export async function showTalk(sessionId: string, appId: string) {
  const workspaceId = await workspaceFor(appId)
  await db.update(session).set({ closedAt: null }).where(eq(session.id, sessionId)) // shown again, so its tab is back
  await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, sessionId, actor: 'engine', type: 'ui.talk', payload: { sessionId } }))
}

/**
 * Closing a conversation's tab (Sandy, 2026-11-11: "the tabs to close with an x and not delete the worktree"): the tab
 * leaves the agent's column and nothing else changes. The conversation stays open, its agent carries on if it is
 * working, its worktree and branch stay; reopening puts the tab back. Ending (endTalk) is what removes the worktree.
 */
/** The open conversation already setting an integration up for an app, so a second press joins it and starts no other. */
export async function setupTalk(appId: string, key: string) {
  const [s] = await db.select().from(session)
    .where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), eq(session.appId, appId), sql`${session.subjectRef}->>'setup' = ${key}`)).orderBy(desc(session.createdAt)).limit(1)
  return s ?? null
}

export async function closeTalk(sessionId: string) {
  const [row] = await db.update(session).set({ closedAt: new Date() }).where(and(eq(session.id, sessionId), eq(session.status, 'open'))).returning()
  if (!row) throw new PlanError(`no open conversation ${sessionId}`)
  return row
}
export async function reopenTalk(sessionId: string) {
  const [row] = await db.update(session).set({ closedAt: null }).where(and(eq(session.id, sessionId), eq(session.status, 'open'))).returning()
  if (!row) throw new PlanError(`no open conversation ${sessionId}`)
  return row
}

export async function renameTalk(sessionId: string, subject: string) {
  const [row] = await db.update(session).set({ subject: subject.trim() || null }).where(eq(session.id, sessionId)).returning()
  if (!row) throw new PlanError(`no session ${sessionId}`)
  return row
}

/** `taskId` on a conversation that belongs to a task: its own agent, a prototype's started on it, or a check's. The app's column leaves those out. */
export const listTalks = async (opts: { open?: boolean } = {}) => {
  const rows = await db.select().from(session).where(opts.open ? and(eq(session.kind, 'talk'), eq(session.status, 'open')) : eq(session.kind, 'talk')).orderBy(desc(session.lastActiveAt))
  const counts = await db.select({ sessionId: sessionMessage.sessionId, n: sql<number>`count(*)` }).from(sessionMessage).groupBy(sessionMessage.sessionId)
  const n = new Map(counts.map((c) => [c.sessionId, Number(c.n)]))
  const protos = await db.select({ sessionId: prototype.sessionId, issueId: prototype.issueId }).from(prototype).where(isNotNull(prototype.issueId))
  const ofTask = new Map(protos.filter((p) => p.sessionId).map((p) => [p.sessionId!, p.issueId!]))
  return rows.map((s) => ({ ...s, live: live.has(s.id), busy: live.get(s.id)?.busy ?? false, messages: n.get(s.id) ?? 0, taskId: (s.subjectRef as SubjectRef | null)?.issueId ?? (s.subjectRef as SubjectRef | null)?.checkOf ?? ofTask.get(s.id) ?? null }))
}

export async function talkTranscript(sessionId: string) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  const messages = await db.select().from(sessionMessage).where(eq(sessionMessage.sessionId, sessionId)).orderBy(sessionMessage.id)
  const l = live.get(sessionId)
  return { session: { ...s, live: !!l, busy: l?.busy ?? false }, messages, pending: l ? [...l.pending.keys()] : [] }
}

/** Open (or reopen, resuming the SDK session) the live conversation behind a session row. */
async function open(sessionId: string): Promise<Live> {
  const existing = live.get(sessionId)
  if (existing) return existing
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  if (s.status === 'ended') throw new PlanError('this conversation has ended')
  if (s.terminalSince) await takeBack(sessionId)
  const [a] = s.appId ? await db.select().from(app).where(eq(app.id, s.appId)) : []
  const setup = (a?.setup ?? {}) as { model?: string; prototype_model?: string }
  const input = inputQueue()
  const entry: Live = { q: null as unknown as Query, push: input.push, close: input.close, pending: new Map(), rated: new Map(), outages: 0, always: new Set(s.alwaysAllow ?? []), busy: false, autoApprove: (s.autoApprove as Risk) ?? 'moderate', cwd: s.cwd! }
  const skills = await skillOptions('talk', s.cwd!, s.appId)
  const [proto] = await db.select().from(prototype).where(eq(prototype.sessionId, sessionId))
  const ownTaskId = (s.subjectRef as SubjectRef | null)?.issueId
  const [ownTask] = ownTaskId ? await db.select().from(issue).where(eq(issue.id, ownTaskId)) : []
  const check = (s.subjectRef as SubjectRef | null)?.check
  const whole = !!(s.subjectRef as SubjectRef | null)?.app && !s.worktreePath // about the app as a whole: it reads the app's checkout
  const refs = await referencesOf(s.appId)
  const mates = await matesOf(s.appId, s.worktreePath)
  const assets = await assetsFor(s.appId, (s.subjectRef as SubjectRef | null)?.projectId ?? ownTask?.projectId) // the app's, and the project's when it is about one
  const q = query({
    prompt: input.it,
    options: {
      cwd: s.cwd!,
      ...(refs.length || mates.length ? { additionalDirectories: [...mates.map((m) => m.path), ...refs.map((r) => r.path)] } : {}),
      ...(proto ? { env: { ...process.env, ...(await prototypeEnv(proto)) } } : {}),
      resume: s.agentSessionId ?? undefined,
      model: modelFor(setup, !!proto),
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: talkPrompt(s.cwd!, s.branch, a?.defaultBranch ?? 'main', proto ? prototypePrompt(proto) : check ? checkPrompt(check, s.cwd!) : whole && a ? appPrompt(a.name, s.cwd!) : undefined) + (ownTask && a ? taskPrompt(ownTask, a.key) : '') + matePrompt(mates, s.branch) + referencePrompt(refs) + assetPrompt(assets) },
      ...skills,
      mcpServers: { engine: engineServer(s.appId, s.id), ...skills.mcpServers },
      tools: [...READ_TOOLS, ...(check || whole ? CHECK_TOOLS : ASK_TOOLS)],
      allowedTools: READ_TOOLS, // everything else is rated by the hook (the hook sees every call; allowedTools would not)
      permissionMode: 'default',
      // The gate: rate the call; up to the person's threshold allow it and log it; above, ask (which lands in canUseTool).
      hooks: { PreToolUse: [{ hooks: [async (h) => {
        if (h.hook_event_name !== 'PreToolUse') return { continue: true }
        const input = (h.tool_input ?? {}) as Record<string, unknown>
        const ref = EDIT_TOOLS.has(h.tool_name) ? referenceHolding(refs, entry.cwd, input.file_path ?? input.notebook_path) : null
        if (ref) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusal(ref) } } // not asked: a reference is never changed from here
        const at = (EDIT_TOOLS.has(h.tool_name) ? mateHolding(mates, entry.cwd, input.file_path ?? input.notebook_path)?.path : null) ?? entry.cwd // an edit in another of the app's repos is rated by that worktree and its branch
        const branch = ASK_TOOLS.includes(h.tool_name) ? await branchOf(at) : undefined
        const { risk, why } = riskOf(h.tool_name, input, { cwd: at, branch })
        const auto = risk === 'free' || entry.always.has(h.tool_name) || ((risk !== 'expensive' && rank(risk) <= rank(entry.autoApprove)) && !(whole && h.tool_name === 'Bash' && risk === 'moderate')) // in the app's own checkout, a command that leaves a mark asks
        if (auto) {
          if (risk !== 'free') await record(sessionId, 'engine', 'auto', `${h.tool_name} · ${risk}`, { tool: h.tool_name, risk, why, input: summariseInput(h.tool_name, input) })
          return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }
        }
        entry.rated.set(key(h.tool_name, input), { risk, why })
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `${risk}: ${why}` } }
      }] }] },
      canUseTool: async (toolName, toolInput) => {
        const rated = entry.rated.get(key(toolName, toolInput)) ?? riskOf(toolName, toolInput as Record<string, unknown>, { cwd: entry.cwd, branch: await branchOf(entry.cwd) })
        entry.rated.delete(key(toolName, toolInput))
        const requestId = newId('run')
        const summary = summariseInput(toolName, toolInput)
        await record(sessionId, 'engine', 'permission', `${toolName}: may I?`, { requestId, tool: toolName, input: summary, risk: rated.risk, why: rated.why })
        const answer = await new Promise<{ allow: boolean; always?: boolean }>((resolveP) => {
          entry.pending.set(requestId, { resolve: resolveP, tool: toolName })
          setTimeout(() => { if (entry.pending.delete(requestId)) resolveP({ allow: false }) }, PERMISSION_TIMEOUT_MS)
        })
        if (answer.always) { entry.always.add(toolName); await db.update(session).set({ alwaysAllow: [...entry.always] }).where(eq(session.id, sessionId)) } // kept, so a restart doesn't ask again
        await record(sessionId, 'user', 'text', answer.allow ? `Allowed ${toolName}${answer.always ? ' for this conversation' : ''}.` : `Denied ${toolName}.`, { requestId, decision: answer.allow ? 'allow' : 'deny' })
        return answer.allow ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: 'The person said no. Ask what they would prefer.' }
      },
    },
  })
  entry.q = q
  live.set(sessionId, entry)
  void (async () => {
    try { for await (const m of q) await handle(sessionId, entry, m) }
    catch (err: any) {
      const e = String(err?.message ?? err)
      if (isOutage(e) && entry.lastPrompt) { live.delete(sessionId); await waitAndResend(sessionId, entry, e).catch(() => {}) }
      else await record(sessionId, 'engine', 'error', clip(e, 1000)).catch(() => {})
    }
    finally { live.delete(sessionId); entry.busy = false }
  })()
  return entry
}

async function handle(sessionId: string, entry: Live, m: SDKMessage) {
  const a = m as any
  switch (m.type) {
    case 'system':
      if (a.subtype === 'init') await db.update(session).set({ agentSessionId: a.session_id }).where(eq(session.id, sessionId))
      return
    case 'assistant':
      for (const block of a.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) await record(sessionId, 'agent', 'text', block.text)
        else if (block.type === 'tool_use') await record(sessionId, 'tool', 'tool_call', block.name, { tool: block.name, input: summariseInput(block.name, block.input), toolUseId: block.id })
      }
      return
    case 'user':
      for (const block of a.message?.content ?? []) {
        if (block?.type === 'tool_result') {
          const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('\n') : String(block.content ?? '')
          await record(sessionId, 'tool', 'tool_result', clip(text, 1500), { ok: !block.is_error, toolUseId: block.tool_use_id })
        }
      }
      return
    case 'result':
      entry.busy = false
      if (a.subtype !== 'success' && isOutage(`${a.subtype} ${a.result ?? ''} ${JSON.stringify(a.errors ?? '')} ${a.terminal_reason ?? ''}`)) return waitAndResend(sessionId, entry, String(a.result ?? a.terminal_reason ?? a.subtype))
      entry.outages = 0
      await record(sessionId, 'engine', 'result', a.subtype === 'success' ? 'done' : `${a.subtype}`, { subtype: a.subtype, costUsd: a.total_cost_usd, turns: a.num_turns, durationMs: a.duration_ms })
      for (const fn of turnEnded) { try { fn(sessionId) } catch { /* what follows a turn never breaks the turn */ } }
      return
  }
}

export interface TalkContext { path: string; label?: string; projectId?: string; issueId?: string; appId?: string; ideaId?: string; tabs?: { title: string; path: string; focused?: boolean }[] }

/** Where the person is, as one line the agent can act on. The transcript keeps the plain text; only the agent sees this. */
async function describeContext(c?: TalkContext): Promise<string> {
  if (!c?.path) return ''
  const bits = [`the page ${c.path}`]
  if (c.projectId) {
    const g = await projectGraph(c.projectId).catch(() => null)
    if (g) bits.push(`project ${c.projectId} "${g.project.name}" (${g.project.status}; ${g.issues.length} task(s), ${g.subIssues.length} sub-task(s), ${g.backlog.filter((i) => i.state === 'backlog').length} in the backlog, ${g.questions.filter((q) => q.status === 'open').length} open question(s))`)
  }
  if (c.issueId) {
    const i = await issueDetail(c.issueId).catch(() => null)
    if (i) bits.push(`task ${i.identifier} (${c.issueId}) "${i.title}" (${i.kind}, ${i.state}; ${i.subIssues.length} sub-task(s))`)
  }
  if (c.appId) bits.push(`app ${c.appId}`)
  if (c.ideaId) bits.push(`idea ${c.ideaId}`)
  const tabs = c.tabs?.length ? ` Open in their workspace: ${c.tabs.map((t) => `${t.title} (${t.path})${t.focused ? ' in front' : ''}`).join('; ')}. open_tab shows them more.` : ''
  return `(The person is looking at ${bits.join(', ')}. "This" means that unless they say otherwise; use the engine tools for details.${tabs})\n\n`
}

export async function say(sessionId: string, text: string, context?: TalkContext, as?: { author: string; kind: string; payload?: Record<string, unknown> }) {
  if (!text.trim()) throw new PlanError('say something')
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (s && !s.subject) { // pinned by first contact: the project or idea in view, else the first thing said
    const from = await subjectFrom({ projectId: context?.projectId, ideaId: context?.ideaId })
    const said = text.trim().replace(/\s+/g, ' ').slice(0, 48).replace(/[\s.,;:!?]+$/, '')
    await db.update(session).set({ subject: from.subject ?? said, subjectRef: from.subjectRef ?? s.subjectRef }).where(eq(session.id, sessionId))
  }
  const l = await open(sessionId)
  const row = await record(sessionId, as?.author ?? 'user', as?.kind ?? 'text', text.trim(), context || as?.payload ? { ...(context ? { context } : {}), ...as?.payload } : undefined)
  l.busy = true
  l.lastPrompt = (await describeContext(context)) + text.trim()
  l.push({ type: 'user', message: { role: 'user', content: l.lastPrompt }, parent_tool_use_id: null })
  return { messageId: row.id }
}

export async function answerPermission(sessionId: string, requestId: string, allow: boolean, always = false) {
  const l = live.get(sessionId)
  const p = l?.pending.get(requestId)
  if (!l || !p) throw new PlanError('nothing is waiting for that answer')
  l.pending.delete(requestId)
  p.resolve({ allow, always })
  return { ok: true }
}

/** The model is unavailable: say so, and send the person's last message again after a backoff. Nothing is lost. */
async function waitAndResend(sessionId: string, entry: Live, error: string) {
  const minutes = holdMinutes(entry.outages++)
  const at = new Date(Date.now() + minutes * 60_000)
  await record(sessionId, 'engine', 'error', `Waiting for the model (${clip(error, 120)}). I'll send your last message again at ${at.toTimeString().slice(0, 5)}.`, { waiting: true, retryAt: at.toISOString() })
  const prompt = entry.lastPrompt
  setTimeout(() => {
    if (!prompt) return
    void open(sessionId).then((l) => { l.busy = true; l.lastPrompt = prompt; l.outages = entry.outages; l.push({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null }) }).catch(() => {})
  }, minutes * 60_000)
}

/** The person's threshold for this conversation, and the next ones: the agent acts without asking up to it. Expensive always asks. */
export async function setAutoApprove(sessionId: string, level: Risk) {
  if (!['free', 'cheap', 'moderate'].includes(level)) throw new PlanError('auto-approve is free, cheap or moderate; expensive always asks')
  const [row] = await db.update(session).set({ autoApprove: level }).where(eq(session.id, sessionId)).returning()
  if (!row) throw new PlanError(`no session ${sessionId}`)
  const l = live.get(sessionId)
  if (l) l.autoApprove = level
  if (row.appId) { // and where the next conversation starts
    const wsId = await workspaceFor(row.appId)
    const [w] = await db.select().from(workspace).where(eq(workspace.id, wsId))
    if (w) await db.update(workspace).set({ settings: { ...(w.settings as object), talkAutoApprove: level } }).where(eq(workspace.id, wsId))
  }
  await record(sessionId, 'user', 'text', level === 'free' ? 'Auto-approve off: ask for everything.' : `Auto-approve up to ${level}.`, { autoApprove: level })
  return row
}

export async function interruptTalk(sessionId: string) {
  const l = live.get(sessionId)
  if (!l) return { interrupted: false }
  await l.q.interrupt().catch(() => {})
  l.busy = false
  return { interrupted: true }
}

export async function endTalk(sessionId: string) {
  const l = live.get(sessionId)
  if (l) { l.close(); await l.q.interrupt().catch(() => {}); live.delete(sessionId) }
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  let branchKept: string | null = null
  const keptIn: string[] = [] // the repositories whose branch has commits, so was kept
  if (s?.worktreePath && s.appId) {
    const [a] = await db.select().from(app).where(eq(app.id, s.appId))
    const r = await homeRepo(s.appId)
    await stopStorybookAt(s.worktreePath) // its own Storybook, if one was started there
    if (r?.localPath) await withLock(`git:${r.localPath}`, async () => {
      await removeWorktree(r.localPath!, s.worktreePath!)
      if (s.branch) {
        const def = a?.defaultBranch ?? 'main'
        const base = (await git(r.localPath!, ['rev-parse', '--verify', '--quiet', `origin/${def}`], { allowFail: true })).code === 0 ? `origin/${def}` : def // the same base it was cut from
        const ahead = await git(r.localPath!, ['rev-list', '--count', `${base}..${s.branch}`], { allowFail: true })
        if (ahead.code === 0 && Number(ahead.stdout) === 0) await git(r.localPath!, ['branch', '-D', s.branch], { allowFail: true })
        else { branchKept = s.branch; keptIn.push(r.fullName.split('/').pop() ?? r.fullName) }
      }
    })
    for (const k of await removeMates(s.appId, s.worktreePath, s.branch)) { branchKept = k.branch; keptIn.push(k.name) } // the app's other repositories
  }
  await db.update(session).set({ status: 'ended' }).where(eq(session.id, sessionId))
  return { ended: true, branchKept, keptIn }
}

/** On shutdown: close the live conversations; they resume from their SDK session ids on the next message. */
export function closeTalks() { for (const [, l] of live) l.close(); live.clear(); for (const [, stop] of watching) stop(); watching.clear() }

// ---- The same conversation in the terminal (terminal.ts) ----

const watching = new Map<string, () => void>()
const ENGINE_PORT = Number(process.env.PORT ?? 4000)

/** Copies into the transcript what was said in the terminal since the last line copied, marked as from there. */
async function importTerminal(sessionId: string): Promise<number> {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s?.agentSessionId || !s.cwd) return 0
  const turns = readTurns(sessionFile(s.cwd, s.agentSessionId), s.importedThrough)
  for (const t of turns) {
    const payload = { ...(t.kind === 'tool_call' ? { ...t.payload, input: summariseInput(t.body, t.payload?.input) } : t.payload ?? {}), via: 'terminal' }
    await record(sessionId, t.author, t.kind, t.body, payload, new Date(t.at))
  }
  if (turns.length) await db.update(session).set({ importedThrough: turns[turns.length - 1].uuid }).where(eq(session.id, sessionId))
  return turns.length
}

/** While it's in the terminal, the transcript follows the file: checked every two seconds, read only when it grew. */
function watchTerminal(sessionId: string, file: string) {
  if (watching.has(sessionId)) return
  let size = -1
  let busy = false
  const timer = setInterval(() => {
    if (busy || !existsSync(file)) return
    const now = statSync(file).size
    if (now === size) return
    size = now; busy = true
    void importTerminal(sessionId).catch(() => {}).finally(() => { busy = false })
  }, 2000)
  watching.set(sessionId, () => clearInterval(timer))
}

/** On start: follow every conversation still in the terminal. */
export async function watchTerminals() {
  const rows = await db.select().from(session).where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), sql`${session.terminalSince} is not null`))
  for (const s of rows) if (s.cwd && s.agentSessionId) watchTerminal(s.id, sessionFile(s.cwd, s.agentSessionId))
}

/** The command that continues this conversation in a terminal, with the engine's tools for its app. */
export function terminalCommand(s: { id: string; cwd: string | null; agentSessionId: string | null; appId: string }) {
  const mcp = JSON.stringify({ mcpServers: { 'self-evident': { type: 'http', url: `http://localhost:${ENGINE_PORT}/api/mcp/${s.appId}?session=${s.id}` } } })
  return `cd ${JSON.stringify(s.cwd)} && claude --resume ${s.agentSessionId} --mcp-config '${mcp}'`
}

/**
 * Hand the conversation to the terminal: the engine lets go of it, and from this line on copies in what's said there.
 * Sending a message here takes it back. Refused while the agent is mid-turn, so the two never write at once.
 */
export async function handOff(sessionId: string) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  if (s.status === 'ended') throw new PlanError('this conversation has ended')
  if (!s.agentSessionId || !s.cwd) throw new PlanError('nothing to continue yet: say something here first')
  const l = live.get(sessionId)
  if (l?.busy) throw new PlanError('the agent is still working: wait for it to finish, or stop it, first')
  if (l) { l.close(); await l.q.interrupt().catch(() => {}); live.delete(sessionId) }
  const file = sessionFile(s.cwd, s.agentSessionId)
  if (!s.terminalSince) {
    await db.update(session).set({ terminalSince: new Date(), importedThrough: lastUuid(file) }).where(eq(session.id, sessionId))
    await record(sessionId, 'engine', 'handoff', 'Continued in the terminal. What\'s said there shows here; send a message here to bring it back.', { to: 'terminal' })
  }
  watchTerminal(sessionId, file)
  return { command: terminalCommand(s) }
}

/** Back from the terminal: copy in the rest, stop following the file, and note it. */
async function takeBack(sessionId: string) {
  await importTerminal(sessionId)
  watching.get(sessionId)?.(); watching.delete(sessionId)
  await db.update(session).set({ terminalSince: null }).where(eq(session.id, sessionId))
  await record(sessionId, 'engine', 'handoff', 'Back in Self Evident. Close the terminal session so the two don\'t talk over each other.', { to: 'ui' })
}

export interface ClaudeSession { id: string; cwd: string; branch: string | null; title: string | null; at: string; talkId: string | null }

/**
 * The Claude Code sessions someone ran on this app, in a terminal or an editor, newest first: those in its checkout
 * and in its other worktrees, but not the engine's own (under `<repo>-worktrees`: builds, prototypes, conversations
 * started here). `talkId` marks one already brought in. Read from the files' ends only, so a list stays quick.
 */
export async function listClaudeSessions(appId: string, limit = 20): Promise<ClaudeSession[]> {
  const repos = await db.select().from(repo).where(eq(repo.appId, appId))
  const folders = new Map<string, string | null>() // path → branch
  for (const r of repos) {
    if (!r.localPath || !existsSync(r.localPath)) continue
    const ours = `${r.localPath}-worktrees/`
    const out = await execFileP('git', ['worktree', 'list', '--porcelain'], { cwd: r.localPath }).then((x) => x.stdout).catch(() => '')
    let path: string | null = null
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) { path = line.slice(9); if (!path.startsWith(ours)) folders.set(path, null) }
      else if (line.startsWith('branch ') && path && folders.has(path)) folders.set(path, line.slice(7).replace(/^refs\/heads\//, ''))
    }
    if (!folders.size) folders.set(r.localPath, null)
  }
  const found = [...folders].flatMap(([cwd, branch]) => sessionsIn(cwd).map((f) => ({ ...f, cwd, branch })))
    .sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
  const here = found.length ? await db.select().from(session).where(and(eq(session.appId, appId), eq(session.status, 'open'), sql`${session.agentSessionId} in (${sql.join(found.map((f) => sql`${f.id}`), sql`, `)})`)) : []
  return found.map((f) => ({
    id: f.id, cwd: f.cwd, branch: f.branch, title: sessionLabel(f.file, f.bytes), at: f.at.toISOString(),
    talkId: here.find((s) => s.agentSessionId === f.id && s.cwd === f.cwd)?.id ?? null,
  }))
}

/**
 * A conversation started in the terminal (or an editor), brought into Self Evident: a session for it, its recent
 * turns copied in, and the file followed. Its folder is the person's own, not a worktree of ours, so ending it here
 * never removes it. Bringing the same session twice gives the one already here.
 */
export async function adoptTalk(input: { appId: string; cwd: string; agentSessionId?: string; actor?: string }) {
  const [a] = await db.select().from(app).where(eq(app.id, input.appId))
  if (!a) throw new PlanError(`no app ${input.appId}`)
  const id = input.agentSessionId ?? latestSession(input.cwd)
  if (!id) throw new PlanError(`no Claude Code session in ${input.cwd}`)
  const file = sessionFile(input.cwd, id)
  if (!existsSync(file)) throw new PlanError(`no session ${id} in ${input.cwd}`)
  const [had] = await db.select().from(session).where(and(eq(session.agentSessionId, id), eq(session.appId, a.id), eq(session.cwd, input.cwd), eq(session.status, 'open')))
  if (had) { await showTalk(had.id, had.appId); return had }
  const turns = readTurns(file, null)
  const keep = 200 // a long session's last turns; the agent still has all of it
  const from = turns.length > keep ? turns[turns.length - keep - 1].uuid : null
  const [row] = await db.insert(session).values({
    id: newId('session'), appId: a.id, kind: 'talk', cwd: input.cwd, branch: await branchOf(input.cwd), worktreePath: null,
    subject: sessionTitle(file), agentSessionId: id, createdBy: input.actor ?? 'terminal', lastActiveAt: new Date(), autoApprove: await defaultAutoApprove(a.id),
    terminalSince: new Date(), importedThrough: from,
  }).returning()
  if (from) await record(row.id, 'engine', 'handoff', `Brought in from the terminal; its last ${keep} of ${turns.length} turns are shown. The agent remembers all of it.`, { to: 'terminal' })
  else await record(row.id, 'engine', 'handoff', 'Brought in from the terminal. What\'s said there shows here; send a message here to continue in Self Evident.', { to: 'terminal' })
  await importTerminal(row.id)
  watchTerminal(row.id, file)
  await showTalk(row.id, a.id)
  return row
}
