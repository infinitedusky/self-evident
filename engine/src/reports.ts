/**
 * Reports on an app's work over a period (Sandy, 2026-11-13: "a way to do a daily report of what was built or what
 * was worked on that I can produce and report every day … It would be on an app level and we could ask for today or
 * last week"). The end-of-day note and the weekly status, as a person sends them to whoever they report to.
 *
 * The engine gathers what happened in the period: what moved on each task, the pull requests opened and merged, the
 * commits in the app's repositories, what was written on the tickets, and what is in progress now (for "tomorrow").
 * The person adds what the engine cannot know (a meeting, a review given). A model writes it in the person's own
 * format, kept on the app with examples of theirs; the result is a draft, theirs to edit, copy and send. Nothing is
 * sent from here. `facts` is kept beside the text so every line can be checked.
 *
 * After a stand-up note ("today / tomorrow") and a weekly status ("where it stands / done / next / risks"), and the
 * summary page (summary.ts) for one model call over gathered facts.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, desc, eq, gte, inArray, lt, notInArray, or } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, issue, issueComment, outsidePr, pr, question, report, stepWork } from './db/schema.js'
import { accountEnv } from './account.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { ghCli } from './github.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'
import { NOISE } from './now.js'
import { reposOf } from './workbench.js'

export type Kind = 'daily' | 'weekly'
export type Period = 'today' | 'yesterday' | 'this_week' | 'last_week'
export const PERIODS: Period[] = ['today', 'yesterday', 'this_week', 'last_week']
const QUIET = [...NOISE, 'summary.writing', 'summary.written', 'summary.failed', 'report.writing', 'report.written', 'report.failed', 'ui.open', 'run.started', 'run.steps', 'run.result', 'talk.started', 'talk.ended']
const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** A named period as dates, in this computer's time: today so far, yesterday, this week so far (from Monday), last week. */
export function periodOf(which: Period, now = new Date()): { from: Date; to: Date; kind: Kind; label: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const back = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
  const monday = back(start, (start.getDay() + 6) % 7)
  if (which === 'today') return { from: start, to: now, kind: 'daily', label: `Today, ${day(start)}` }
  if (which === 'yesterday') return { from: back(start, 1), to: start, kind: 'daily', label: `Yesterday, ${day(back(start, 1))}` }
  if (which === 'this_week') return { from: monday, to: now, kind: 'weekly', label: `Week of ${day(monday)}` }
  return { from: back(monday, 7), to: monday, kind: 'weekly', label: `Week of ${day(back(monday, 7))}` }
}

/** What one event says, in a few words, from the parts of its payload a report could use. */
function said(type: string, p: Record<string, any>): string {
  const bits = [p.key && `step ${p.key}`, p.status && `status ${p.status}`, p.approved === true && 'approved', p.from && p.to && `${p.from} → ${p.to}`, p.number && type.startsWith('pr.') && `#${p.number}`,
    Array.isArray(p.subIssues) && `${p.subIssues.length} sub-tasks`, p.heading && `"${clip(p.heading, 80)}"`, p.name && `"${clip(p.name, 60)}"`, p.reason && `because ${clip(p.reason, 120)}`, p.error && `error: ${clip(p.error, 120)}`, p.url && type.startsWith('share') && 'shared for a look']
  return [type, ...bits.filter(Boolean)].join(' · ')
}

/** Everything a report on this period is written from, compact enough to hand a model whole. */
export async function reportFacts(appId: string, from: Date, to: Date, opts: { me?: () => Promise<string>; notes?: string | null } = {}) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const name = (n: number) => identifier(a.key, n)
  const events = await db.select().from(event).where(and(eq(event.appId, appId), gte(event.ts, from), lt(event.ts, to), notInArray(event.type, QUIET))).orderBy(event.seq).limit(3000)
  const touched = [...new Set(events.map((e) => e.issueId).filter(Boolean))] as string[]
  const rows = touched.length ? await db.select().from(issue).where(inArray(issue.id, touched)) : []
  const parents = [...new Set(rows.map((r) => r.parentId).filter(Boolean))] as string[]
  const tops = parents.length ? await db.select().from(issue).where(inArray(issue.id, parents)) : []
  const all = [...rows, ...tops.filter((t) => !rows.some((r) => r.id === t.id))]
  const topOf = (id: string) => { const r = all.find((x) => x.id === id); return r?.parentId ? all.find((x) => x.id === r.parentId) ?? r : r }
  const ext = (i: typeof issue.$inferSelect) => (i.sourceRef as { linear?: { identifier?: string; url?: string } } | null)?.linear
  const byTask = new Map<string, string[]>()
  for (const e of events) {
    if (!e.issueId) continue
    const top = topOf(e.issueId); if (!top) continue
    const sub = all.find((x) => x.id === e.issueId)
    const line = `${sub && sub.id !== top.id ? `sub-task ${name(sub.number)} "${clip(sub.title, 70)}": ` : ''}${said(e.type, (e.payload ?? {}) as Record<string, any>)}`
    const list = byTask.get(top.id) ?? []; if (list[list.length - 1] !== line && list.length < 60) list.push(line); byTask.set(top.id, list)
  }
  const ids = [...byTask.keys()]
  const steps = ids.length ? await db.select().from(stepWork).where(and(inArray(stepWork.issueId, ids), gte(stepWork.updatedAt, from), lt(stepWork.updatedAt, to))) : []
  const comments = all.length ? await db.select().from(issueComment).where(and(inArray(issueComment.issueId, all.map((x) => x.id)), gte(issueComment.updatedAt, from), lt(issueComment.updatedAt, to))) : []
  const inWindow = (d: Date | null) => !!d && d >= from && d < to
  const ours = (await db.select().from(pr).where(eq(pr.appId, appId))).filter((p) => inWindow(p.openedAt) || inWindow(p.mergedAt))
  const me = await (opts.me ?? ghCli.me)().catch(() => null)
  const outside = me ? (await db.select().from(outsidePr).where(and(eq(outsidePr.appId, appId), eq(outsidePr.author, me)))).filter((p) => inWindow(p.updatedAt)) : []
  const commits: { repo: string; subject: string }[] = []
  for (const r of (await reposOf(appId)).repos) {
    if (!r.localPath) continue
    const who = (await git(r.localPath, ['config', 'user.email'], { allowFail: true })).stdout
    const log = await git(r.localPath, ['log', '--all', '--no-merges', `--since=${from.toISOString()}`, `--until=${to.toISOString()}`, ...(who ? [`--author=${who}`] : []), '--format=%s', '-n', '150'], { allowFail: true }).catch(() => null)
    for (const subject of new Set((log?.stdout ?? '').split('\n').filter((l) => l.trim() && !/^(Save point|Set aside):/.test(l)))) commits.push({ repo: r.fullName.split('/').pop() ?? r.fullName, subject: clip(subject, 160) })
  }
  const open = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.kind, 'code'), inArray(issue.state, ['in_progress', 'in_review'])))
  const openTop = open.filter((i) => !i.parentId)
  const asks = await db.select().from(question).where(and(eq(question.appId, appId), eq(question.status, 'open')))
  const waiting = await db.select().from(pr).where(and(eq(pr.appId, appId), eq(pr.status, 'open')))
  const myOpen = me ? await db.select().from(outsidePr).where(and(eq(outsidePr.appId, appId), eq(outsidePr.author, me), eq(outsidePr.state, 'open'))) : []
  const task = (i: typeof issue.$inferSelect) => ({ id: name(i.number), ticket: ext(i)?.identifier ?? null, ticketUrl: ext(i)?.url ?? null, title: i.title, state: i.state })
  return {
    workspaceId: a.workspaceId, setup: a.setup,
    facts: {
      app: a.name, from: from.toISOString(), to: to.toISOString(),
      tasks: ids.map((id) => { const t = all.find((x) => x.id === id)!; return { ...task(t), about: clip(t.description, 300) || null, happened: byTask.get(id)!,
        steps: steps.filter((s) => s.issueId === id).map((s) => ({ step: s.key, status: s.status, approved: !!s.approvedBy, says: clip(s.detail, 200) || null })),
        written: comments.filter((c) => topOf(c.issueId)?.id === id).map((c) => ({ heading: c.heading, text: clip(c.body, 400) })) } }),
      pullRequests: [
        ...ours.map((p) => ({ number: p.number, url: p.url, opened: inWindow(p.openedAt), merged: inWindow(p.mergedAt), status: p.status, task: p.issueId ? (() => { const t = all.find((x) => x.id === p.issueId); return t ? name(t.number) : null })() : null })),
        ...outside.map((p) => ({ number: p.number, url: p.url, title: p.title, state: p.state, draft: p.draft, review: p.reviewDecision, openedByHand: true })),
      ],
      commits: commits.slice(0, 200),
      other: events.filter((e) => !e.issueId && !e.type.startsWith('issue.') && !e.type.startsWith('prototype.')).slice(0, 40).map((e) => said(e.type, (e.payload ?? {}) as Record<string, any>)),
      next: {
        inProgress: openTop.map(task),
        openPullRequests: [...waiting.map((p) => ({ number: p.number, url: p.url })), ...myOpen.map((p) => ({ number: p.number, url: p.url, title: p.title, review: p.reviewDecision }))],
        openQuestions: asks.map((q) => clip(q.text, 200)),
      },
      fromThePerson: opts.notes?.trim() || null,
    },
  }
}

const RULES: Record<Kind, string[]> = {
  daily: [
    'Shape: a "Today:" list, then a "Tomorrow:" list. When several things were done on one ticket, lead with the ticket (its id, a few words on what it is, its pull request) and put what was done under it; otherwise one line per thing.',
    'Each line starts with what was done, in the past tense: Merged, Opened, Fixed, Started, Tested, Addressed, Prototyped, Planned. One thing per line, short.',
    '"Tomorrow:" comes from what is in progress, the pull requests waiting on review, and what the person said is next. Lead with the verb: Continue, Get review on, Address feedback on, Start.',
  ],
  weekly: [
    'Shape: a title line ("<what it is>: weekly status (<the week>)"), then these sections, each a short label on its own line: "Where it stands" (two or three sentences a reader could stop after), "Done this week" (one line per thing), "Delays and why" (only when the facts show something slipped, was redone or waited), "Next week", "Open decisions and risks" (what needs someone else, what could move the date).',
    'Group the week by outcome, not by day. Count where the facts let you ("4 pull requests merged"); never estimate a percentage the facts do not give.',
  ],
}

/** What the model is told: the rules for the kind, the person's own format (which wins), then the facts. */
export function prompt(kind: Kind, label: string, facts: unknown, format?: string | null): string {
  return [
    `Write the ${kind === 'daily' ? 'end-of-day note' : 'weekly status'} for the work on ${(facts as { app?: string }).app ?? 'this app'}, covering: ${label}. It is written in the first person by the engineer who did the work and sent to the people they report to: a team lead, a client. Those readers know the product and its ticket ids. They do not know the tool the engineer works in.`,
    '',
    ...RULES[kind],
    'Name a ticket by `ticket` when the task has one (the team\'s own tracker), else by its `id`. Name a pull request as #number. Name a person only if the facts name them.',
    'Use only the facts below. Never invent a ticket, a pull request number, a person, a date or a number. What is not in the facts did not happen; if nothing happened, say so in one line.',
    'Say outcomes, not the tool\'s workings: "happened" lists steps, briefs, approvals, sub-tasks, save points and agents, which the reader has never heard of. Turn them into what they mean ("prototyped the employee findings page", "wrote the acceptance criteria", "planned the build in 8 parts", "3 of 8 parts built") and leave out what means nothing to them. Do not mention agents or the tool. Sub-task ids are not tickets: do not cite them.',
    'The commits are raw material: read them for what was done, never list them. `fromThePerson` is what the engineer added themselves: include all of it, in the right section, in their meaning.',
    'Plain text for a chat message: short lines, "-" bullets, no Markdown headings, bold or tables, no closing remark.',
    format?.trim() ? `\nThe engineer's own format and past reports follow. Their shape, section names, tone and level of detail win over the rules above. Copy the shape, never the content: every fact in them is about other days.\n<format>\n${format.trim()}\n</format>` : '',
    '',
    '<facts>',
    JSON.stringify(facts, null, 1),
    '</facts>',
  ].join('\n')
}

type Writer = (prompt: string) => Promise<{ text: string; costUsd?: number | null; model?: string | null }>
const SCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } }
const sdkWriter = (model?: string, setup?: unknown): Writer => async (p) => {
  let out: { text?: string } | undefined, cost: number | null = null
  for await (const m of query({ prompt: p, options: { ...accountEnv(setup), model, maxTurns: 4, tools: [], allowedTools: [], settingSources: [], outputFormat: { type: 'json_schema', schema: SCHEMA } } })) {
    if (m.type === 'result') { if ((m as any).subtype !== 'success') throw new PlanError(`the report could not be written: ${(m as any).subtype}`); out = (m as any).structured_output; cost = (m as any).total_cost_usd ?? null }
  }
  if (!out?.text?.trim()) throw new PlanError('the report came back empty')
  return { text: out.text.trim(), costUsd: cost, model: model ?? null }
}

/** The person's own format for each kind of report, with examples of theirs: kept on the app, never in the code. */
export async function reportFormat(appId: string): Promise<{ daily: string; weekly: string }> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const f = ((a.setup ?? {}) as { report_format?: { daily?: string; weekly?: string } }).report_format ?? {}
  return { daily: f.daily ?? '', weekly: f.weekly ?? '' }
}
export async function setReportFormat(appId: string, i: { daily?: string; weekly?: string }) {
  const now = await reportFormat(appId)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const next = { daily: (i.daily ?? now.daily).slice(0, 40_000), weekly: (i.weekly ?? now.weekly).slice(0, 40_000) }
  await db.update(app).set({ setup: { ...(a.setup as object), report_format: next } }).where(eq(app.id, appId))
  return next
}

const writing = new Set<string>()
export const isWritingReport = (appId: string) => writing.has(appId)
const lean = ({ facts: _, ...r }: typeof report.$inferSelect) => r

/** Write a report on a period now, as a draft. One at a time for an app. */
export async function writeReport(appId: string, i: { period?: Period; from?: string; to?: string; kind?: Kind; notes?: string | null; actor?: string; write?: Writer; me?: () => Promise<string>; now?: Date }) {
  if (writing.has(appId)) throw new PlanError('a report on this app is being written: wait for it')
  const named = i.period ? periodOf(i.period, i.now) : null
  const from = named?.from ?? (i.from ? new Date(i.from) : null), to = named?.to ?? (i.to ? new Date(i.to) : null)
  if (!from || !to || Number.isNaN(+from) || Number.isNaN(+to) || from >= to) throw new PlanError(`say which period: ${PERIODS.join(', ')}, or from and to as dates`)
  const kind: Kind = i.kind ?? named?.kind ?? (+to - +from > 36 * 3600_000 ? 'weekly' : 'daily')
  const label = named?.label ?? `${day(from)} to ${day(new Date(+to - 1))}`
  writing.add(appId)
  const { facts, workspaceId, setup } = await reportFacts(appId, from, to, { me: i.me, notes: i.notes }).catch((err) => { writing.delete(appId); throw err })
  const base = { workspaceId, appId, actor: i.actor ?? 'user' }
  try {
    await db.transaction((tx) => appendEvent(tx, { ...base, type: 'report.writing', payload: { kind, label } }))
    const format = (await reportFormat(appId))[kind]
    const got = await (i.write ?? sdkWriter((setup as { model?: string } | null)?.model, setup))(prompt(kind, label, facts, format))
    const [row] = await db.insert(report).values({ id: newId('report'), appId, kind, fromAt: from, toAt: to, label, body: got.text, notes: i.notes?.trim() || null, facts, model: got.model ?? null, costUsd: got.costUsd == null ? null : String(got.costUsd), createdBy: i.actor ?? 'user' }).returning()
    await db.transaction((tx) => appendEvent(tx, { ...base, type: 'report.written', payload: { reportId: row.id, kind, label } }))
    return lean(row)
  } catch (err: any) {
    await db.transaction((tx) => appendEvent(tx, { ...base, type: 'report.failed', payload: { kind, label, error: clip(err?.message ?? err, 300) } })).catch(() => {})
    throw err
  } finally { writing.delete(appId) }
}

export async function listReports(appId: string) {
  const rows = await db.select().from(report).where(eq(report.appId, appId)).orderBy(desc(report.createdAt)).limit(60)
  return { writing: writing.has(appId), format: await reportFormat(appId), reports: rows.map(lean) }
}
export async function getReport(id: string) {
  const [r] = await db.select().from(report).where(eq(report.id, id))
  if (!r) throw new PlanError('no such report')
  return r
}
/** The person's own wording: the draft is theirs to change before it goes anywhere. */
export async function editReport(id: string, body: string) {
  if (!body.trim()) throw new PlanError('a report needs its text; delete it instead')
  const [r] = await db.update(report).set({ body: body.trim(), editedAt: new Date() }).where(eq(report.id, id)).returning()
  if (!r) throw new PlanError('no such report')
  return lean(r)
}
export async function deleteReport(id: string) {
  const [r] = await db.delete(report).where(or(eq(report.id, id))).returning()
  if (!r) throw new PlanError('no such report')
  return { deleted: r.label }
}
