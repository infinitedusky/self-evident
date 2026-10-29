/**
 * Talk: an interactive agent session the engine owns. The same Claude Code the planner and the builders run, with
 * a person on the other end. The conversation is rows and events (so it survives a restart and shows on any
 * page); the engine's own API is the agent's MCP tools; an edit or a shell command waits for the person's yes in
 * the UI, Claude Code's default mode. Development runs on the operator's login, the product on an API key.
 */
import { createSdkMcpServer, query, tool, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, idea, project, repo, session, sessionMessage, workspace } from './db/schema.js'
import { addWorktree, git, removeWorktree } from './git.js'
import { withLock } from './landing.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { rank, riskOf, type Risk } from './risk.js'
import { holdMinutes, isOutage } from './outage.js'
import { engineTools } from './tools.js'
import { skillOptions } from './skills.js'
import { issueDetail, PlanError, projectGraph } from './projects.js'

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'WebFetch', 'WebSearch', 'Skill']
const ASK_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']
const PERMISSION_TIMEOUT_MS = 10 * 60_000

const talkPrompt = (cwd: string, branch: string | null, base: string) => `You are Self Evident's agent (Self Evident: software that proves itself — observe, learn, ideate, mockup, build), talking with the person who runs it, in its own web UI.
The factory builds software from ideas, shaped like Linear: initiative (a goal) → project (issues in order) → issue (a title and a brief; code, or a to-do: work outside the code) → sub-issue (under code: one agent, one worktree, one commit; under a to-do: a checklist line). Issues are named by the app's key and a number, like HG-12; use those names with the person. Read CLAUDE.md, LOG.md and SHAPE.md in this checkout when you need the history; LOG.md's top entries are the latest decisions.
You have the engine as tools (mcp__engine__*): see what needs attention, keep ideas, make projects, keep each project's backlog (everything it has to cover; when the person mentions something a project should not forget, add it), keep the app's to-dos (work outside the code: accounts, approvals, people, checks; when the person mentions one, make it with a checklist you draft, and check lines off as they get done), run the planner on an issue, answer its questions, start or cancel projects, read the event log. Use them rather than describing what the person should click.
You can read, search and edit files and run commands here, as in any Claude Code session. The engine rates every action's risk (free, cheap, moderate, expensive); up to the person's threshold it runs without asking and is logged, above it a card asks them. Expensive things (main, force, deletes, merges, publishing, starting a project) always ask. Work on a branch in a worktree, never in a checkout that is on main; say what each action is for.
You work in your own worktree, ${cwd}, on branch ${branch ?? '(none)'} cut from ${base}: edit and commit there; push and open a pull request when the work is ready (both ask).
How this person works: PRs only, main is production; short answers that lead with the answer; questions are questions, not instructions to change things; give a recommendation, not a survey; write decisions into LOG.md or SHAPE.md the moment they are made; one git worktree per branch, never the main checkout.`

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
    instructions: 'The Self Evident engine, scoped to this conversation\'s app, shaped like Linear. Initiatives are goals; projects are issues in order; a code issue becomes sub-issues through the planner; each sub-issue is built by an agent in a worktree and lands into the project\'s branch and PR. To-dos are issues for the work around the code, with checklists. Issues are named like HG-12.',
    tools: engineTools({ appId, sessionId, actor: 'agent', waitForPlanner: true }).map((t) => tool(t.name, t.description, t.shape, (a) => t.handler(a))),
  })
}

async function workspaceFor(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (a) return a.workspaceId
  const [w] = await db.select().from(workspace).limit(1)
  return w?.id ?? 'ws_none'
}

/** One transcript row, and the event that tells every open page about it. */
async function record(sessionId: string, author: string, kind: string, body: string, payload?: Record<string, unknown>) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  const workspaceId = await workspaceFor(s.appId)
  const [row] = await db.insert(sessionMessage).values({ appId: s.appId, sessionId, author, kind, body, payload: payload ?? null, status: 'sent', sentAt: new Date() }).returning()
  await db.update(session).set({ lastActiveAt: new Date() }).where(eq(session.id, sessionId))
  await db.transaction((tx) => appendEvent(tx, {
    workspaceId, appId: s.appId, sessionId, actor: author === 'user' ? 'user' : `agent:${sessionId}`,
    type: kind === 'permission' ? 'talk.permission' : kind === 'result' ? 'talk.result' : 'talk.message',
    payload: { sessionId, messageId: row.id, author, kind, body: clip(body, 200), ...(payload ?? {}) },
  }))
  return row
}

export interface SubjectRef { projectId?: string; issueId?: string; ideaId?: string; path?: string }

/** What a conversation is about, from where it started: a project's title, an idea's title, or nothing yet. */
async function subjectFrom(ref?: SubjectRef): Promise<{ subject: string | null; subjectRef: SubjectRef | null }> {
  if (ref?.projectId) { const [p] = await db.select().from(project).where(eq(project.id, ref.projectId)); if (p) return { subject: p.name, subjectRef: { projectId: p.id } } }
  if (ref?.ideaId) { const [i] = await db.select().from(idea).where(eq(idea.id, ref.ideaId)); if (i) return { subject: i.title, subjectRef: { ideaId: i.id } } }
  return { subject: null, subjectRef: ref?.path ? { path: ref.path } : null }
}

/** A conversation gets its own worktree of the app's repo, on its own branch, so its edits are cheap and a PR is the natural end. */
export async function startTalk(input: { appId: string; subjectRef?: SubjectRef; actor?: string }) {
  const [a] = await db.select().from(app).where(eq(app.id, input.appId))
  if (!a) throw new PlanError(`no app ${input.appId}`)
  const [r] = await db.select().from(repo).where(eq(repo.appId, input.appId))
  if (!r?.localPath) throw new PlanError(`${a.name} has no local checkout yet; add its repo in Settings`)
  const id = newId('session')
  const short = id.slice(-6).toLowerCase()
  const branch = `talk/${short}`
  const worktreePath = `${r.localPath}-worktrees/talk-${short}`
  await withLock(`git:${r.localPath}`, async () => {
    await git(r.localPath!, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })
    const base = (await git(r.localPath!, ['rev-parse', '--verify', '--quiet', `origin/${a.defaultBranch}`], { allowFail: true })).code === 0 ? `origin/${a.defaultBranch}` : a.defaultBranch
    await addWorktree(r.localPath!, worktreePath, branch, base)
  })
  const { subject, subjectRef } = await subjectFrom(input.subjectRef)
  const [row] = await db.insert(session).values({
    id, appId: a.id, kind: 'talk', cwd: worktreePath, branch, worktreePath, subject, subjectRef, createdBy: input.actor ?? 'user', lastActiveAt: new Date(),
  }).returning()
  return row
}

export async function renameTalk(sessionId: string, subject: string) {
  const [row] = await db.update(session).set({ subject: subject.trim() || null }).where(eq(session.id, sessionId)).returning()
  if (!row) throw new PlanError(`no session ${sessionId}`)
  return row
}

export const listTalks = async (opts: { open?: boolean } = {}) => {
  const rows = await db.select().from(session).where(opts.open ? and(eq(session.kind, 'talk'), eq(session.status, 'open')) : eq(session.kind, 'talk')).orderBy(desc(session.lastActiveAt))
  const counts = await db.select({ sessionId: sessionMessage.sessionId, n: sql<number>`count(*)` }).from(sessionMessage).groupBy(sessionMessage.sessionId)
  const n = new Map(counts.map((c) => [c.sessionId, Number(c.n)]))
  return rows.map((s) => ({ ...s, live: live.has(s.id), busy: live.get(s.id)?.busy ?? false, messages: n.get(s.id) ?? 0 }))
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
  const [a] = s.appId ? await db.select().from(app).where(eq(app.id, s.appId)) : []
  const setup = (a?.setup ?? {}) as { model?: string }
  const input = inputQueue()
  const entry: Live = { q: null as unknown as Query, push: input.push, close: input.close, pending: new Map(), rated: new Map(), outages: 0, always: new Set(), busy: false, autoApprove: (s.autoApprove as Risk) ?? 'cheap', cwd: s.cwd! }
  const skills = await skillOptions('talk', s.cwd!, s.appId)
  const q = query({
    prompt: input.it,
    options: {
      cwd: s.cwd!,
      resume: s.agentSessionId ?? undefined,
      model: setup.model,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: talkPrompt(s.cwd!, s.branch, a?.defaultBranch ?? 'main') },
      ...skills,
      mcpServers: { engine: engineServer(s.appId, s.id), ...skills.mcpServers },
      tools: [...READ_TOOLS, ...ASK_TOOLS],
      allowedTools: READ_TOOLS, // everything else is rated by the hook (the hook sees every call; allowedTools would not)
      permissionMode: 'default',
      // The gate: rate the call; up to the person's threshold allow it and log it; above, ask (which lands in canUseTool).
      hooks: { PreToolUse: [{ hooks: [async (h) => {
        if (h.hook_event_name !== 'PreToolUse') return { continue: true }
        const input = (h.tool_input ?? {}) as Record<string, unknown>
        const branch = ASK_TOOLS.includes(h.tool_name) ? await branchOf(entry.cwd) : undefined
        const { risk, why } = riskOf(h.tool_name, input, { cwd: entry.cwd, branch })
        const auto = risk === 'free' || entry.always.has(h.tool_name) || (risk !== 'expensive' && rank(risk) <= rank(entry.autoApprove))
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
        if (answer.always) entry.always.add(toolName)
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
    if (g) bits.push(`project ${c.projectId} "${g.project.name}" (${g.project.status}; ${g.issues.length} issue(s), ${g.subIssues.length} sub-issue(s), ${g.backlog.filter((i) => i.state === 'backlog').length} in the backlog, ${g.questions.filter((q) => q.status === 'open').length} open question(s))`)
  }
  if (c.issueId) {
    const i = await issueDetail(c.issueId).catch(() => null)
    if (i) bits.push(`issue ${i.identifier} (${c.issueId}) "${i.title}" (${i.kind}, ${i.state}; ${i.subIssues.length} sub-issue(s))`)
  }
  if (c.appId) bits.push(`app ${c.appId}`)
  if (c.ideaId) bits.push(`idea ${c.ideaId}`)
  const tabs = c.tabs?.length ? ` Open in their workspace: ${c.tabs.map((t) => `${t.title} (${t.path})${t.focused ? ' in front' : ''}`).join('; ')}. open_tab shows them more.` : ''
  return `(The person is looking at ${bits.join(', ')}. "This" means that unless they say otherwise; use the engine tools for details.${tabs})\n\n`
}

export async function say(sessionId: string, text: string, context?: TalkContext) {
  if (!text.trim()) throw new PlanError('say something')
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (s && !s.subject) { // pinned by first contact: the project or idea in view, else the first thing said
    const from = await subjectFrom({ projectId: context?.projectId, ideaId: context?.ideaId })
    const said = text.trim().replace(/\s+/g, ' ').slice(0, 48).replace(/[\s.,;:!?]+$/, '')
    await db.update(session).set({ subject: from.subject ?? said, subjectRef: from.subjectRef ?? s.subjectRef }).where(eq(session.id, sessionId))
  }
  const l = await open(sessionId)
  const row = await record(sessionId, 'user', 'text', text.trim(), context ? { context } : undefined)
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

/** The person's threshold for this conversation: the agent acts without asking up to it. Expensive always asks. */
export async function setAutoApprove(sessionId: string, level: Risk) {
  if (!['free', 'cheap', 'moderate'].includes(level)) throw new PlanError('auto-approve is free, cheap or moderate; expensive always asks')
  const [row] = await db.update(session).set({ autoApprove: level }).where(eq(session.id, sessionId)).returning()
  if (!row) throw new PlanError(`no session ${sessionId}`)
  const l = live.get(sessionId)
  if (l) l.autoApprove = level
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
  if (s?.worktreePath && s.appId) {
    const [a] = await db.select().from(app).where(eq(app.id, s.appId))
    const [r] = await db.select().from(repo).where(eq(repo.appId, s.appId))
    if (r?.localPath) await withLock(`git:${r.localPath}`, async () => {
      await removeWorktree(r.localPath!, s.worktreePath!)
      if (s.branch) {
        const def = a?.defaultBranch ?? 'main'
        const base = (await git(r.localPath!, ['rev-parse', '--verify', '--quiet', `origin/${def}`], { allowFail: true })).code === 0 ? `origin/${def}` : def // the same base it was cut from
        const ahead = await git(r.localPath!, ['rev-list', '--count', `${base}..${s.branch}`], { allowFail: true })
        if (ahead.code === 0 && Number(ahead.stdout) === 0) await git(r.localPath!, ['branch', '-D', s.branch], { allowFail: true })
        else branchKept = s.branch
      }
    })
  }
  await db.update(session).set({ status: 'ended' }).where(eq(session.id, sessionId))
  return { ended: true, branchKept }
}

/** On shutdown: close the live conversations; they resume from their SDK session ids on the next message. */
export function closeTalks() { for (const [, l] of live) l.close(); live.clear() }
