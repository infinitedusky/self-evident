/**
 * The summary page, written by a model from what the engine knows, so a person walking in can read where things
 * stand. First section, focus: what everyone (the person, the agents, teammates) is working on, and the goals near,
 * mid and long term, the way a Monday-morning round of the room would go. Goals come from the initiatives and cycles
 * a person stated, and otherwise are inferred from the work; every line cites the rows it came from (`refs`) and the
 * facts are kept beside the text.
 *
 * Rewritten when a person asks, or by the schedule when the newest is older than a day and something has happened
 * since. One model call, no tools, structured output.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, desc, eq, gt, gte, inArray, isNull, max, ne, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, event, idea, issue, outsidePr, pr, project, question, summary } from './db/schema.js'
import { appendEvent } from './events.js'
import { ghCli } from './github.js'
import { NOISE, now } from './now.js'
import { listCycles, listInitiatives } from './goals.js'
import { identifier, PlanError } from './issues.js'

type Ref = { kind: 'project' | 'issue' | 'todo' | 'idea' | 'question' | 'pr' | 'teammate_pr' | 'initiative' | 'cycle'; label: string; projectId?: string; url?: string | null }
type Line = { text: string; refs: string[] }
export type FocusBody = {
  headline: string
  people: { who: string; doing: Line[] }[]
  goals: { near: Line[]; mid: Line[]; long: Line[] }
  stated?: boolean // the goals rest on initiatives or a cycle someone stated, not only on the work
  links: Record<string, Ref> // every ref the facts offered, so the page can link what the text cites
}

const LINES = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'refs'], properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } } } }
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['headline', 'people', 'goals'],
  properties: {
    headline: { type: 'string' },
    people: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['who', 'doing'], properties: { who: { type: 'string' }, doing: LINES } } },
    goals: { type: 'object', additionalProperties: false, required: ['near', 'mid', 'long'], properties: { near: LINES, mid: LINES, long: LINES } },
  },
}
const WEEK_TYPES = ['project.created', 'project.started', 'project.landed', 'issue.planned', 'issue.state', 'pr.merged', 'idea.created', 'question.answered', 'initiative.created', 'cycle.created']

/** Everything the focus section is written from, compact enough to hand a model whole, and the refs it may cite. */
export async function focusFacts(appId: string, opts: { me?: () => Promise<string> } = {}) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const links: Record<string, Ref> = {}
  const name = (n: number) => identifier(a.key, n)
  const projects = await db.select().from(project).where(and(eq(project.appId, appId), notInArray(project.status, ['superseded']))).orderBy(desc(project.createdAt))
  const pids = projects.map((p) => p.id)
  const issues = pids.length ? await db.select().from(issue).where(and(inArray(issue.projectId, pids), eq(issue.kind, 'code'))) : []
  const subIds = issues.filter((i) => i.parentId).map((i) => i.id)
  const builds = subIds.length ? await db.select().from(build).where(inArray(build.issueId, subIds)) : []
  const loose = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.kind, 'code'), isNull(issue.projectId), isNull(issue.parentId), notInArray(issue.state, ['done', 'canceled', 'duplicate'])))
  const prs = pids.length ? await db.select().from(pr).where(inArray(pr.projectId, pids)) : []
  const ideas = await db.select().from(idea).where(and(eq(idea.appId, appId), ne(idea.lane, 'killed')))
  const questions = await db.select().from(question).where(and(eq(question.appId, appId), eq(question.status, 'open')))
  const teammates = await db.select().from(outsidePr).where(and(eq(outsidePr.appId, appId), eq(outsidePr.state, 'open')))
  const initiatives = (await listInitiatives(appId)).filter((i) => i.status !== 'completed')
  const cycles = (await listCycles(appId)).filter((c) => c.current || c.startsAt > new Date().toISOString().slice(0, 10)).slice(0, 2)
  const me = teammates.length ? await (opts.me ?? ghCli.me)().catch(() => null) : null // the person's own PRs, opened by hand, are theirs, not a teammate's
  const n = await now(appId)
  const since = new Date(Date.now() - 7 * 86_400_000)
  const week = await db.select().from(event).where(and(eq(event.appId, appId), inArray(event.type, WEEK_TYPES), gte(event.ts, since))).orderBy(event.seq)
  const status = (id: string) => builds.find((b) => b.issueId === id)?.status ?? 'queued'

  for (const i of ideas) links[i.id] = { kind: 'idea', label: `idea #${i.number} ${i.title}` }
  for (const i of initiatives) links[i.id] = { kind: 'initiative', label: i.name }
  for (const c of cycles) links[c.id] = { kind: 'cycle', label: c.name ?? `cycle ${c.number} (${c.startsAt} to ${c.endsAt})` }
  for (const i of loose) links[i.id] = { kind: 'issue', label: `${name(i.number)} ${i.title}` }
  const projectFacts = projects.filter((p) => p.status !== 'stopped' || p.createdAt > since).map((p) => {
    links[p.id] = { kind: 'project', label: p.name, projectId: p.id }
    const myPrs = prs.filter((q) => q.projectId === p.id && ['open', 'draft'].includes(q.status))
    for (const q of myPrs) if (q.number) links[`pr#${q.number}`] = { kind: 'pr', label: `PR #${q.number}`, url: q.url, projectId: p.id }
    const mine = issues.filter((i) => i.projectId === p.id && !i.parentId)
    return {
      id: p.id, name: p.name, status: p.status, why: p.content?.slice(0, 600) ?? null, createdAt: p.createdAt.toISOString().slice(0, 10),
      idea: p.ideaId ? links[p.ideaId]?.label ?? null : null,
      issues: mine.filter((t) => !['backlog', 'triage', 'duplicate'].includes(t.state)).sort((x, y) => x.sortOrder - y.sortOrder).map((t) => {
        links[t.id] = { kind: 'issue', label: `${name(t.number)} ${t.title}`, projectId: p.id }
        const subs = issues.filter((x) => x.parentId === t.id)
        return { id: t.id, identifier: name(t.number), title: t.title, description: t.description, state: t.state, subIssues: { total: subs.length, done: subs.filter((x) => status(x.id) === 'done').length, failed: subs.filter((x) => status(x.id) === 'failed').length, building: subs.filter((x) => ['running', 'merging', 'testing', 'awaiting_answer'].includes(status(x.id))).length } }
      }),
      backlogOpen: mine.filter((i) => i.state === 'backlog').map((i) => i.title),
      prs: myPrs.map((q) => ({ ref: q.number ? `pr#${q.number}` : null, status: q.status, ...(q.signals as object) })),
    }
  })
  for (const q of questions) links[q.id] = { kind: 'question', label: q.text.slice(0, 80), projectId: q.projectId ?? undefined }
  const todos = n.needsYou.filter((x) => x.kind === 'todo')
  for (const t of todos) links[t.todoId] = { kind: 'todo', label: `${t.identifier} ${t.title}` }
  for (const o of teammates) links[`teammate#${o.number}`] = { kind: 'teammate_pr', label: `#${o.number} ${o.title}`, url: o.url }

  const facts = {
    app: a.name, today: new Date().toISOString().slice(0, 10),
    statedGoals: {
      initiatives: initiatives.map((i) => ({ id: i.id, name: i.name, description: i.description, status: i.status, targetDate: i.targetDate, projects: i.projects.map((p) => p.id) })),
      cycles: cycles.map((c) => ({ id: c.id, name: c.name, startsAt: c.startsAt, endsAt: c.endsAt, current: c.current, description: c.description, issues: c.issues.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, state: i.state })) })),
    },
    projects: projectFacts,
    issuesInNoProject: loose.map((i) => ({ id: i.id, identifier: name(i.number), title: i.title, state: i.state })),
    buildingNow: n.running.flatMap((r) => r.live.map((x) => ({ project: r.projectId, subIssue: `${x.identifier} ${x.title}`, status: x.status, step: x.step }))),
    needsThePerson: n.needsYou.filter((x) => x.kind !== 'todo').map((x) => ({ kind: x.kind, ...('projectId' in x ? { project: x.projectId } : {}), ...('text' in x ? { text: x.text } : {}), ...('title' in x ? { title: x.title } : {}) })),
    openQuestions: questions.map((q) => ({ id: q.id, project: q.projectId, text: q.text, askedAt: q.askedAt.toISOString().slice(0, 10) })),
    todos: todos.map((t) => ({ id: t.todoId, identifier: t.identifier, title: t.title, owner: t.owner === 'agent' ? 'the agent' : 'the person', project: t.projectId, done: t.done, total: t.total, next: t.next, waitingOn: t.waitingOn })),
    theirOwnPullRequests: teammates.filter((o) => me && o.author === me).map((o) => ({ ref: `teammate#${o.number}`, title: o.title, draft: o.draft })),
    teammates: teammates.filter((o) => !me || o.author !== me).map((o) => ({ ref: `teammate#${o.number}`, author: o.author, title: o.title, draft: o.draft, reviewRequestedFromThePerson: o.reviewRequested })),
    ideas: ideas.map((i) => ({ id: i.id, title: i.title, lane: i.lane, hypothesis: i.hypothesis })),
    lastSevenDays: week.map((e) => ({ day: e.ts.toISOString().slice(0, 10), type: e.type, project: e.projectId, issue: e.issueId, ...(e.payload as object) })).slice(-80),
  }
  return { facts, links, stated: initiatives.length > 0 || cycles.length > 0, workspaceId: a.workspaceId, setup: (a.setup ?? {}) as { model?: string } }
}

function prompt(facts: { statedGoals: { initiatives: unknown[]; cycles: unknown[] } }) {
  const stated = facts.statedGoals.initiatives.length > 0 || facts.statedGoals.cycles.length > 0
  return [
    'You are writing the "What we are focused on" section of a summary page for one app built with Self Evident, a factory where agents plan and build the work.',
    'Picture the person who owns the app walking in on Monday morning and asking everyone in the room: what are you working on, and remind me where we are headed.',
    '',
    'Write, from the facts below and nothing else:',
    '- headline: one or two sentences, the state of the work in plain words.',
    '- people: one entry per who, each with what they are doing now. "You" (the person: what waits on them, their to-dos, their open questions to answer, and the pull requests they opened by hand, in theirOwnPullRequests); "The builders" (agents building sub-tasks right now, and what they are on); "The planner" (only if a task is being planned or waits on an answer); the agent\'s own to-dos as "The agent"; each teammate by their GitHub name, from their open pull requests. Leave out anyone with nothing going on.',
    '- goals.near: what should be true by the end of this week' + (stated ? ': the current cycle first, when there is one,' : '') + ' from what is in flight and what waits on the person.',
    '- goals.mid: the next few weeks, from projects proposed or planned but not started, open to-dos, open backlog' + (stated ? ', and the next cycle' : '') + '.',
    '- goals.long: where the app is headed' + (stated ? ': the initiatives, as stated, first; then' : ', from') + ' its ideas and the reasons given for its projects.',
    '',
    'Every line cites the ids it rests on in refs: initiative ids (init_…), cycle ids (cyc_…), project ids (proj_…), task ids (iss_…, task_…, ph_…), to-do ids, idea ids (idea_…), question ids (q_…), our pull requests as "pr#N", the others (a teammate\'s, or the person\'s own opened by hand) as "teammate#N". A line with no ref is not allowed: if the facts do not support it, leave it out.',
    stated
      ? 'Goals in statedGoals were stated by a person: keep their words and cite them. Anything else you add about where things are headed is inferred from the work; say what the work points at, not what you would want.'
      : 'These goals are inferred; nobody stated them. Say what the work points at, not what you would want.',
    'Fewer lines are better than padded ones; an empty list is fine. Name tasks by their identifier (like HG-12) when you name one.',
    'Plain words that read aloud. No file names, functions, tables, branches or routes. Short lines, one thing each.',
    '',
    JSON.stringify(facts, null, 1),
  ].join('\n')
}

type Writer = (prompt: string) => Promise<{ body: Omit<FocusBody, 'links'>; costUsd?: number | null; model?: string | null }>

const sdkWriter = (model?: string): Writer => async (p) => {
  let out: unknown, cost: number | null = null
  for await (const m of query({ prompt: p, options: { model, maxTurns: 6, tools: [], allowedTools: [], settingSources: [], outputFormat: { type: 'json_schema', schema: SCHEMA } } })) {
    if (m.type === 'result') { if ((m as any).subtype !== 'success') throw new PlanError(`summary failed: ${(m as any).subtype}`); out = (m as any).structured_output; cost = (m as any).total_cost_usd ?? null }
  }
  return { body: out as Omit<FocusBody, 'links'>, costUsd: cost, model: model ?? null }
}

const writing = new Set<string>()
export const isWriting = (appId: string) => writing.has(`${appId}:focus`)

async function lastSeq(appId: string) {
  const [r] = await db.select({ seq: max(event.seq) }).from(event).where(and(eq(event.appId, appId), notInArray(event.type, [...NOISE, 'summary.writing', 'summary.written', 'summary.failed'])))
  return Number(r?.seq ?? 0)
}

/** Write the focus section now. Refs the model made up are dropped; a line left with none is dropped with them. */
export async function writeFocus(appId: string, opts: { trigger?: 'person' | 'schedule'; model?: string; write?: Writer } = {}) {
  const key = `${appId}:focus`
  if (writing.has(key)) return null
  writing.add(key)
  try {
    const { facts, links, stated, workspaceId, setup } = await focusFacts(appId)
    const through = await lastSeq(appId)
    await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, actor: 'engine', type: 'summary.writing', payload: { section: 'focus' } }))
    try {
      const got = await (opts.write ?? sdkWriter(opts.model ?? setup.model))(prompt(facts))
      const keep = (ls: Line[] = []) => ls.map((l) => ({ text: l.text.trim(), refs: [...new Set(l.refs.filter((r) => r in links))] })).filter((l) => l.text && l.refs.length)
      const body: FocusBody = {
        headline: got.body.headline?.trim() ?? '',
        people: (got.body.people ?? []).map((p) => ({ who: p.who.trim(), doing: keep(p.doing) })).filter((p) => p.who && p.doing.length),
        goals: { near: keep(got.body.goals?.near), mid: keep(got.body.goals?.mid), long: keep(got.body.goals?.long) },
        links, stated,
      }
      const [row] = await db.insert(summary).values({ appId, section: 'focus', body, facts, throughSeq: through, model: got.model ?? null, costUsd: got.costUsd == null ? null : String(got.costUsd), trigger: opts.trigger ?? 'person' }).returning()
      await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, actor: 'engine', type: 'summary.written', payload: { section: 'focus', id: row.id, trigger: row.trigger } }))
      return row
    } catch (err) {
      await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, actor: 'engine', type: 'summary.failed', payload: { section: 'focus', error: String((err as Error).message ?? err) } }))
      throw err
    }
  } finally { writing.delete(key) }
}

export async function latestFocus(appId: string) {
  const [row] = await db.select().from(summary).where(and(eq(summary.appId, appId), eq(summary.section, 'focus'))).orderBy(desc(summary.id)).limit(1)
  return { focus: row ?? null, writing: isWriting(appId), stale: row ? (await lastSeq(appId)) > row.throughSeq : true }
}

/** Stale: none yet (and there is something to write about), or older than `hours` with events since. */
export async function dueApps(hours: number) {
  const apps = await db.select({ id: app.id }).from(app)
  const due: string[] = []
  for (const { id } of apps) {
    const [row] = await db.select().from(summary).where(and(eq(summary.appId, id), eq(summary.section, 'focus'))).orderBy(desc(summary.id)).limit(1)
    if (row && row.createdAt.getTime() > Date.now() - hours * 3_600_000) continue
    const [moved] = await db.select({ seq: event.seq }).from(event).where(and(eq(event.appId, id), gt(event.seq, row?.throughSeq ?? 0), notInArray(event.type, [...NOISE, 'summary.writing', 'summary.written', 'summary.failed']))).limit(1)
    if (moved) due.push(id)
  }
  return due
}

export function startSummaries(hours = 24, checkMinutes = 30) {
  const pass = async () => {
    for (const id of await dueApps(hours)) {
      try { await writeFocus(id, { trigger: 'schedule' }) } catch (err) { console.log(`[summary] ${id}: ${(err as Error).message}`) }
    }
  }
  const first = setTimeout(() => void pass().catch(() => undefined), 60_000)
  const timer = setInterval(() => void pass().catch(() => undefined), checkMinutes * 60_000)
  return () => { clearTimeout(first); clearInterval(timer) }
}
