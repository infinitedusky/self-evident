/**
 * The planner: an issue's brief → sub-issues, decisions and questions, as rows. InDusk's approach on the new foundation:
 * one agent run with read-only tools on the repo, returning one validated object (Agent SDK structured output),
 * with a self-review pass inside the same run. Nothing is decided silently: a choice the planner settles from the
 * brief and the code is a decision (provisional until a person approves); one it cannot settle is a question. The
 * server sets the cost of every question, never the agent.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, decision, issue, question, repo, run } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { handle } from './executor.js'
import { guardOptions, readerGuard } from './guard.js'
import { reaRisk, skillOptions } from './skills.js'
import { holdMinutes, isOutage } from './outage.js'
import { newId } from './ids.js'
import { addItems } from './backlog.js'
import { identifier } from './issues.js'
import { addSubIssues, PlanError, projectGraph, type NewSubIssue } from './projects.js'

export interface ProposeInput {
  repoPath: string
  appId?: string // its plugins, as switched for it; none without
  issue: { identifier: string; title: string; brief: string | null }
  project: { name: string; content: string | null }
  earlier: { identifier: string; title: string; subIssues: { identifier: string; title: string }[] }[] // issues before this one in the project
  testCmd?: string
  storybook?: boolean // the app keeps a Storybook: stories lead its UI
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  abort?: AbortController
  onEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
}

export type Changes = 'brief' | 'promise' | 'look' | 'gate'
export type Cost = 'cheap' | 'moderate' | 'expensive'
export interface Proposal {
  phases: {
    key: string; title: string; description: string; summary: string; depends_on: string[]; files: string[]
    steps: { text: string; technical: string }[]
    checks: { statement: string; command: string; expected: string }[]
    done_when: string
  }[]
  decisions: { title: string; chosen: string; rejected: string[]; reason: string }[]
  questions: { question: string; options: { label: string; description: string; changes: Changes[] }[]; recommended: string; reason: string; cost: Cost }[]
  notes: string
  later?: { text: string; why: string }[] // noticed, not this issue's to do; joins the project's backlog
}
export interface ProposeOutput { status: 'completed' | 'failed'; proposal?: Proposal; agentSessionId?: string; costUsd?: number; numTurns?: number; error?: string }
export type Propose = (i: ProposeInput) => Promise<ProposeOutput>

const str = { type: 'string' } as const
const arr = (items: unknown) => ({ type: 'array', items })
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

/** What the planner must return. Every field is required; "none" is an empty string or array. */
export const PROPOSAL_SCHEMA = obj({
  phases: arr(obj({
    key: str, title: str, description: str, summary: str, depends_on: arr(str), files: arr(str),
    steps: arr(obj({ text: str, technical: str })),
    checks: arr(obj({ statement: str, command: str, expected: str })),
    done_when: str,
  })),
  decisions: arr(obj({ title: str, chosen: str, rejected: arr(str), reason: str })),
  questions: arr(obj({
    question: str,
    options: arr(obj({ label: str, description: str, changes: arr({ type: 'string', enum: ['brief', 'promise', 'look', 'gate'] }) })),
    recommended: str, reason: str, cost: { type: 'string', enum: ['cheap', 'moderate', 'expensive'] },
  })),
  notes: str,
  later: arr(obj({ text: str, why: str })),
})

function prompt(i: ProposeInput): string {
  const earlier = i.earlier.length
    ? i.earlier.map((t) => `  - ${t.identifier} ${t.title}${t.subIssues.length ? `: ${t.subIssues.map((p) => `${p.identifier} ${p.title}`).join('; ')}` : ' (not planned yet)'}`).join('\n')
    : '  (none: this is the first issue)'
  return [
    `You are planning ${i.issue.identifier}: ${i.issue.title}`,
    `It is part of the project "${i.project.name}".`,
    '',
    i.issue.brief ?? '(The issue has no brief beyond its title.)',
    i.project.content ? `\nWhy the project exists:\n${i.project.content}` : '',
    '',
    'Issues earlier in the project (their sub-issues land before yours start; you need not depend on them explicitly):',
    earlier,
    '',
    'Read the repository until you understand where this change lives: the files, the tests, the conventions, what already exists. You have read-only tools; you change nothing. Then cut the issue into sub-issues.',
    '',
    'Sub-issues (returned in `phases`):',
    '- One sub-issue is one agent in one git worktree making one commit. Each lands on its own, so each must leave the tests passing by itself. Sub-issues of this issue that share no files are built at the same time.',
    '- Cut by what each produces and consumes: granular enough to track, not so granular they are busywork. Most issues are one to six sub-issues; a small issue is one.',
    '- files: the paths (files or directories, relative to the repository root) the sub-issue will change. Two that share a path never build at once. Declare honestly: one with no files declared claims the whole app.',
    '- depends_on: keys of sub-issues in this issue whose result this one needs. Prefer fewer; a shared file already serializes two.',
    '- title: what will be true when it lands, in plain words ("Parents sign in with Clerk"), not the code change.',
    '- description: one to three short sentences for the person who asked for this, who may never read the code: what will be different for the people using the app, and why it matters. No file names, functions, columns, routes or environment variables. Write it so it reads aloud.',
    '- summary: for the builder, in short paragraphs (a blank line between them, at most four sentences each): what the phase does in this codebase and why. File names and code go in backticks.',
    '- steps: the work in order, one action each, each with a technical note (the file, the function, the approach) so the builder does not rediscover it. Keep each step to one sentence; put detail in the note.',
    '- checks: behavioural checks a non-engineer could read aloud, with the command and the expected result where there is one.',
    '- done_when: one sentence.',
    i.testCmd ? `- The tests run with: ${i.testCmd}` : '- There is no test command configured; say in each sub-issue how it is verified.',
    i.storybook ? '- Stories lead the UI: this app keeps a Storybook. In a sub-issue that adds or changes a screen, the first step writes the stories (each new or changed page, component and state, with labelled sample data) and the steps after it build the screen to match. A check says the stories render.' : '',
    '',
    'Decisions and questions:',
    '- A choice you can settle from the brief and the code: settle it, and record it as a decision with the alternatives you rejected and the reason. Never settle such a choice silently.',
    '- A choice the brief does not settle, where the person might reasonably want it either way: ask it as a question. Give at least two options, say which you recommend and why, and for each option say what it changes (brief, promise, look, gate) when it changes what was agreed. Rate the cost of getting it wrong: cheap (easy to undo), moderate, expensive. Plan the phases as if your recommendation were chosen.',
    '- notes: what you assumed, and anything in the brief you could not place in the code.',
    '- later: things you noticed that this issue should not do but the project should not forget (a bug nearby, a follow-up the brief implies, something an earlier issue left undone). One plain line each, and why. They join the project\'s backlog, where a person takes them on or drops them. Empty if none.',
    '',
    'Before you answer, review your own plan once: does it build what the brief asks and nothing it does not? What else would have to change for it to hold? What would the sub-issues do that the brief never asked for? Fix what you find, then answer.',
  ].join('\n')
}

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'Skill']
const reaReads = (tool: string) => tool.startsWith('mcp__rea__') && reaRisk(tool.slice('mcp__rea__'.length)).risk === 'free' // no one to ask: the rest is refused

/** The real planner: one Claude Code run, read-only in the repo, ending in a structured proposal. */
export const proposeWithAgent: Propose = async (i) => {
  let out: ProposeOutput = { status: 'failed', error: 'no result message' }
  let structured: unknown
  try {
    const skills = i.appId ? await skillOptions('planner', i.repoPath, i.appId) : {}
    for await (const m of query({
      prompt: prompt(i),
      options: {
        cwd: i.repoPath,
        abortController: i.abort,
        model: i.model,
        maxTurns: i.maxTurns ?? 40,
        maxBudgetUsd: i.maxBudgetUsd,
        settingSources: ['project'],
        tools: [...READ_TOOLS, 'Bash'], // the whole tool set
        allowedTools: READ_TOOLS, // auto-approved; the guard decides Bash (see guard.ts)
        permissionMode: 'default',
        outputFormat: { type: 'json_schema', schema: PROPOSAL_SCHEMA },
        ...skills,
        ...guardOptions(readerGuard(READ_TOOLS, reaReads)),
      },
    })) {
      if (m.type === 'result') structured = (m as any).structured_output
      await handle(m, i.onEvent, (o) => { out = { status: o.status, agentSessionId: o.agentSessionId, costUsd: o.costUsd, numTurns: o.numTurns, error: o.error } })
    }
  } catch (err: any) {
    const error = String(err?.message ?? err).slice(0, 1000)
    await i.onEvent('run.error', { error })
    return { ...out, status: 'failed', error }
  }
  if (out.status !== 'completed') return out
  if (!structured) return { ...out, status: 'failed', error: 'the planner finished without a structured proposal' }
  return { ...out, proposal: structured as Proposal }
}

/** The server sets the cost: any option that changes what was agreed makes the question expensive, whatever the agent said. */
export function questionCost(q: Proposal['questions'][number]): Cost {
  return q.options.some((o) => (o.changes ?? []).length > 0) ? 'expensive' : q.cost
}

/** The sub-issue's brief, as Markdown: the summary, then steps (each with its technical note under it), checks and done-when. */
export function subIssueBrief(p: Proposal['phases'][number]): string {
  const steps = p.steps.map((s, n) => `${n + 1}. ${s.text}${s.technical ? `\n   - ${s.technical}` : ''}`).join('\n')
  const checks = p.checks.map((c) => `- ${c.statement}${c.command ? ` — \`${c.command}\`${c.expected ? ` → ${c.expected}` : ''}` : ''}`).join('\n')
  return [p.summary.trim(), steps && `### Steps\n\n${steps}`, checks && `### Checks\n\n${checks}`, p.done_when && `**Done when:** ${p.done_when.trim()}`].filter(Boolean).join('\n\n')
}

/** Shape problems the schema cannot catch. Throws PlanError. */
export function validateProposal(p: Proposal) {
  if (!Array.isArray(p?.phases) || !p.phases.length) throw new PlanError('the proposal has no sub-issues')
  const keys = new Set<string>()
  for (const x of p.phases) {
    if (!x.key?.trim() || !x.title?.trim()) throw new PlanError('every sub-issue needs a key and a title')
    if (keys.has(x.key)) throw new PlanError(`sub-issue key ${x.key} is used twice`)
    keys.add(x.key)
  }
  for (const x of p.phases) for (const d of x.depends_on ?? []) if (!keys.has(d)) throw new PlanError(`sub-issue ${x.key} depends on unknown sub-issue ${d}`)
  for (const q of p.questions ?? []) {
    if ((q.options?.length ?? 0) < 2) throw new PlanError(`question "${q.question}" needs at least two options`)
    if (!q.options.some((o) => o.label === q.recommended)) throw new PlanError(`question "${q.question}" recommends an option it does not offer`)
  }
}

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number; storybook_url?: string; storybook_cmd?: string }

export interface PlanningContext {
  runId: string; issueId: string; projectId: string; appId: string; attempt: number
  input: Omit<ProposeInput, 'onEvent' | 'abort'>
  base: Omit<NewEvent, 'type'>
}

const emit = (e: NewEvent) => db.transaction((tx) => appendEvent(tx, e))

/** Checks the issue can be planned, records the run, announces it. Throws PlanError before anything is written. */
export async function preparePlanning(issueId: string, opts: { actor?: string } = {}): Promise<PlanningContext> {
  const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
  if (!t) throw new PlanError(`no issue ${issueId}`)
  if (t.kind !== 'code' || t.parentId) throw new PlanError('only a top-level code issue is planned')
  if (!t.projectId) throw new PlanError(`${t.title}: add it to a project before planning it`)
  if (!t.briefApprovedBy) throw new PlanError(`${t.title}: ${t.brief?.trim() ? 'approve its brief' : 'write and approve its brief'} before planning it`)
  const g = (await projectGraph(t.projectId))!
  const mine = g.subIssues.filter((x) => x.parentId === issueId)
  const name = identifier(g.app.key, t.number)
  if (mine.length) throw new PlanError(`${name} already has ${mine.length} sub-issue${mine.length > 1 ? 's' : ''}; it is planned`)
  if (['landed', 'stopped', 'superseded'].includes(g.project.status)) throw new PlanError(`project is ${g.project.status}; it takes no more planning`) // drafts, and running or paused projects planning their next issue
  if (['backlog', 'triage', 'canceled', 'duplicate', 'done'].includes(t.state)) throw new PlanError(`${name} is ${t.state}; take it on first`)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, t.appId))
  if (!r?.localPath) throw new PlanError(`app ${a.name} has no repo with a local path`)
  const setup = (a.setup ?? {}) as AppSetup
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(run).where(and(eq(run.issueId, issueId), eq(run.kind, 'plan')))
  const attempt = Number(n) + 1
  const runId = newId('run')
  await db.insert(run).values({ id: runId, appId: a.id, issueId, attempt, kind: 'plan', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
  const base: Omit<NewEvent, 'type'> = { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId, runId, actor: opts.actor ?? 'engine' }
  await emit({ ...base, type: 'issue.planning', payload: { attempt, identifier: name, title: t.title } })
  const earlier = g.issues.filter((x) => x.sortOrder < t.sortOrder && x.state !== 'canceled').map((x) => ({
    identifier: x.identifier, title: x.title, subIssues: g.subIssues.filter((p) => p.parentId === x.id).map((p) => ({ identifier: p.identifier, title: p.title })),
  }))
  return {
    runId, issueId, projectId: t.projectId, appId: a.id, attempt, base,
    input: {
      repoPath: r.localPath, appId: a.id, issue: { identifier: name, title: t.title, brief: t.brief }, project: { name: g.project.name, content: g.project.content }, earlier,
      testCmd: setup.test_cmd, storybook: !!(setup.storybook_url || setup.storybook_cmd), model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
    },
  }
}

export interface PlanningResult {
  status: 'completed' | 'failed' | 'waiting'; runId: string; costUsd?: number; error?: string; retryAt?: string
  subIssues: { id: string; number: number; title: string }[]
  decisions: (typeof decision.$inferSelect)[]
  questions: (typeof question.$inferSelect)[]
}

/** Runs the planner and writes what it proposed. Never throws: a failure is a failed run and an issue.plan_failed event. */
const outagesByIssue = new Map<string, number>() // planner outages in a row, per issue: the backoff level

export async function finishPlanning(ctx: PlanningContext, opts: { propose?: Propose; abort?: AbortController; retryAfterMs?: (minutes: number) => number; onPlanned?: () => void } = {}): Promise<PlanningResult> {
  const propose = opts.propose ?? proposeWithAgent
  const onEvent: ProposeInput['onEvent'] = async (type, payload) => { await emit({ ...ctx.base, actor: `agent:${ctx.runId}`, type, payload }) }
  const failed = async (error: string, out?: ProposeOutput): Promise<PlanningResult> => {
    await db.update(run).set({ status: 'failed', endedAt: new Date(), error, costUsd: out?.costUsd?.toString() ?? null, agentSessionId: out?.agentSessionId ?? null }).where(eq(run.id, ctx.runId))
    await emit({ ...ctx.base, type: 'issue.plan_failed', payload: { attempt: ctx.attempt, error } })
    return { status: 'failed', runId: ctx.runId, error, costUsd: out?.costUsd, subIssues: [], decisions: [], questions: [] }
  }
  // Losing the model is not the planner's failure: the run is interrupted, and planning starts again after a backoff.
  const waiting = async (error: string, out?: ProposeOutput): Promise<PlanningResult> => {
    const level = outagesByIssue.get(ctx.issueId) ?? 0
    outagesByIssue.set(ctx.issueId, level + 1)
    const minutes = holdMinutes(level)
    const ms = opts.retryAfterMs ? opts.retryAfterMs(minutes) : minutes * 60_000
    const retryAt = new Date(Date.now() + ms).toISOString()
    await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: `outage: ${error.slice(0, 400)}`, costUsd: out?.costUsd?.toString() ?? null }).where(eq(run.id, ctx.runId))
    await emit({ ...ctx.base, type: 'issue.plan_waiting', payload: { attempt: ctx.attempt, error: error.slice(0, 400), retryAt, minutes } })
    setTimeout(() => { void preparePlanning(ctx.issueId, { actor: 'engine' }).then((next) => finishPlanning(next, opts)).catch(() => {}) }, ms)
    return { status: 'waiting', runId: ctx.runId, error, retryAt, subIssues: [], decisions: [], questions: [] }
  }
  let out: ProposeOutput
  try { out = await propose({ ...ctx.input, abort: opts.abort, onEvent }) } catch (err: any) {
    const e = String(err?.message ?? err).slice(0, 1000)
    return isOutage(e) ? waiting(e) : failed(e)
  }
  if (out.status !== 'completed' && isOutage(out.error)) return waiting(out.error!, out)
  if (out.status !== 'completed' || !out.proposal) return failed(out.error ?? 'the planner did not finish', out)
  outagesByIssue.delete(ctx.issueId)
  const proposal = out.proposal
  try { validateProposal(proposal) } catch (err: any) { return failed(err.message, out) }

  try {
    const written = await db.transaction(async (tx) => {
      const subs = await addSubIssues(ctx.issueId, proposal.phases.map((p): NewSubIssue => ({
        key: p.key, title: p.title, description: p.description?.trim() || undefined, brief: subIssueBrief(p), dependsOn: p.depends_on ?? [], files: p.files ?? [],
      })), 'planner', tx)
      const decisions = proposal.decisions.length ? await tx.insert(decision).values(proposal.decisions.map((d) => ({
        id: newId('decision'), appId: ctx.appId, projectId: ctx.projectId, issueId: ctx.issueId, runId: ctx.runId, question: d.title,
        options: [{ key: 'A', text: d.chosen, recommended: true }, ...d.rejected.map((r, n) => ({ key: String.fromCharCode(66 + n), text: r, recommended: false }))],
        chosen: 'A', provisional: true, rationale: d.reason,
      }))).returning() : []
      const questions = proposal.questions.length ? await tx.insert(question).values(proposal.questions.map((q) => ({
        id: newId('question'), appId: ctx.appId, projectId: ctx.projectId, issueId: ctx.issueId, runId: ctx.runId, text: q.question,
        options: q.options.map((o) => ({ ...o, recommended: o.label === q.recommended })), reason: q.reason, cost: questionCost(q), status: 'open',
      }))).returning() : []
      for (const q of questions) await appendEvent(tx, { ...ctx.base, type: 'question.asked', payload: { questionId: q.id, text: q.text, cost: q.cost } })
      const later = await addItems(ctx.projectId, (proposal.later ?? []).map((l) => ({ text: l.text, body: l.why || undefined, source: 'planner' as const, sourceRef: { issueId: ctx.issueId, runId: ctx.runId } })), 'planner', tx)
      await tx.update(run).set({
        status: 'completed', endedAt: new Date(), costUsd: out.costUsd?.toString() ?? null, agentSessionId: out.agentSessionId ?? null,
        summary: [proposal.notes?.trim(), `${subs.length} sub-issue(s), ${decisions.length} decision(s), ${questions.length} question(s)`].filter(Boolean).join('\n\n'),
      }).where(eq(run.id, ctx.runId))
      await appendEvent(tx, { ...ctx.base, type: 'issue.planned', payload: {
        attempt: ctx.attempt, subIssues: subs.map((p) => ({ id: p.id, number: p.number, title: p.title })),
        decisions: decisions.length, questions: questions.length, later: later.length, costUsd: out.costUsd ?? null, notes: proposal.notes ?? '',
      } })
      return { subs, decisions, questions }
    })
    opts.onPlanned?.() // e.g. the runner: the new sub-issues can be built now
    return { status: 'completed', runId: ctx.runId, costUsd: out.costUsd, subIssues: written.subs.map((p) => ({ id: p.id, number: p.number, title: p.title })), decisions: written.decisions, questions: written.questions }
  } catch (err: any) {
    return failed(`the proposal could not be saved: ${err?.message ?? err}`, out)
  }
}

/** The whole thing, for the CLI and tests. */
export async function planIssue(issueId: string, opts: { propose?: Propose; actor?: string; retryAfterMs?: (minutes: number) => number; onPlanned?: () => void } = {}) {
  return finishPlanning(await preparePlanning(issueId, opts), opts)
}

/** After a restart: a planner run that was working is gone; say so, and the issue can be planned again. */
export async function recoverPlanning() {
  const stranded = await db.select().from(run).where(and(eq(run.kind, 'plan'), eq(run.status, 'working')))
  for (const r of stranded) {
    await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(eq(run.id, r.id))
    const [t] = r.issueId ? await db.select().from(issue).where(eq(issue.id, r.issueId)) : []
    if (!t) continue
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    await emit({ workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, runId: r.id, actor: 'engine', type: 'issue.plan_failed', payload: { attempt: r.attempt, error: 'engine restarted while planning' } })
  }
  return stranded.length
}

/** A person answers a question. (A late answer that disagrees with what was built opens a follow-on; that comes with follow-ups.) */
export async function answerQuestion(questionId: string, answer: string, actor = 'user') {
  const [q] = await db.select().from(question).where(eq(question.id, questionId))
  if (!q) throw new PlanError(`no question ${questionId}`)
  const [row] = await db.update(question).set({ status: 'answered', answer, answeredBy: actor, answeredAt: new Date() }).where(eq(question.id, questionId)).returning()
  const [t] = q.issueId ? await db.select().from(issue).where(eq(issue.id, q.issueId)) : []
  if (t) {
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    await emit({ workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'question.answered', payload: { questionId, answer } })
  }
  return row
}
