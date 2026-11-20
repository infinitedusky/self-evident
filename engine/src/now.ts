/**
 * The front door: what is running, what needs a person, what just happened. Nothing here has state of its own;
 * it is all read from the project, issue, build, question, pr, run, step and event tables, so it is always true.
 */
import { smokeOwed, smokeReady } from './smoke.js'
import { acceptanceOf } from './acceptance.js'
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { BEFORE_PLAN, checksOf } from './steps.js'
import { workflowFor } from './work.js'
import { app, build, event, fileClaim, issue, outsidePr, project, pr, question, run, session, step, stepWork, nightly } from './db/schema.js'
import { leftTo } from './probe-list.js'
import { putAwayIds } from './apps.js'
import { identifier } from './issues.js'

const LIVE = ['running', 'merging', 'testing', 'awaiting_answer']
export const NOISE = ['run.tool_call', 'run.tool_result', 'run.rate_limit', 'run.message', 'talk.message', 'talk.permission', 'talk.result'] // conversations have their own place

type Where = { projectId: string; projectName: string; appName: string }
export type Attention =
  | ({ kind: 'failed_build'; issueId: string; identifier: string; title: string; error: string | null } & Where)
  | ({ kind: 'question'; questionId: string; issueIdentifier: string | null; text: string; cost: string | null; askedAt: Date } & Where)
  | ({ kind: 'run_project'; subIssues: number } & Where)
  | ({ kind: 'plan_issue'; issueId: string; identifier: string; issueTitle: string } & Where)
  | ({ kind: 'approve_brief'; issueId: string; identifier: string; issueTitle: string } & Where)
  | ({ kind: 'smoke_test'; issueId: string; identifier: string; issueTitle: string; /** How many checks wait for the person. */ owed: number; /** Of those, how many they can do now; the rest are on a pull request that is not open yet. */ ready: number } & Where)
  | ({ kind: 'backlog'; open: number; items: string[] } & Where)
  | { kind: 'todo'; todoId: string; identifier: string; title: string; owner: string; projectId: string | null; projectName: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | ({ kind: 'merge_pr'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'pr_feedback'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'behind_main'; files: string; commits: number } & Where)
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | { kind: 'checkout_behind'; appName: string; branch: string; path: string; commits: number; why: string; files: string[] }
  /** A nightly check is red (nightly.ts): the tasks merged since its last green run, one of which broke it. */
  | { kind: 'nightly_failed'; appId: string; appName: string; name: string; workflow: string; url: string | null; nights: number; since: { id: string; identifier: string; title: string }[] }
  | ({ kind: 'overlap'; prNumber: number; title: string; author: string | null; url: string | null; files: string[] } & Where)

/**
 * A task past its plan, for Build's page: ready (planned, not started), checking (planned after a prototype, being
 * read before it is built), building, stopped (asking, failed, held or paused), smoke (every sub-task is in: it is the
 * person's to try by hand, and then to close) or closed. A merge closes nothing (Sandy, 2026-11-19: "if it is merged
 * it should say that but it needs to be closed to be landed"; then "I am not seeing tasks that are at the smoke test
 * stage and I don't see a closed section"): the person's Close does (close.ts).
 */
export type Phase = 'ready' | 'checking' | 'building' | 'stopped' | 'smoke' | 'closed'

/** Where a task past its plan stands. Pure. `stopped`: it asks something, or a sub-task failed or is held. */
export function phaseOf(f: { state: string; done: number; total: number; projectStatus: string; stopped: boolean }): Phase {
  if (f.state === 'done') return 'closed'
  if (f.done === f.total) return 'smoke'
  if (['drafting', 'proposed', 'approved'].includes(f.projectStatus)) return 'ready'
  return f.stopped || f.projectStatus !== 'running' ? 'stopped' : 'building'
}

export interface BuildTask {
  id: string; identifier: string; title: string; projectId: string; projectName: string | null; projectStatus: string
  phase: Phase; done: number; total: number; appId: string
  /** Planned after a prototype and still being read before the build: the steps left; and, when the last one stopped for the person, its question and the conversation to answer it in. */
  checks?: { left: string[]; needsYou: string | null; sessionId: string | null }
  live: { id: string; identifier: string; title: string; status: string; step: string | null }[]
  held: { id: string; identifier: string; title: string; reason: string }[]
  failed: { id: string; identifier: string; title: string; error: string | null }[]
  questions: { id: string; text: string; cost: string | null; reason: string | null; options: { label: string; description: string; changes: string[]; recommended: boolean }[] }[]
  pr: { number: number | null; url: string | null; status: string } | null
  /** At the smoke test: what still stands between it and being closed, in the person's words; empty when it can be closed. */
  waits?: string[]
}

export async function now(appId?: string) {
  const away = await putAwayIds() // put-away apps are out of every list
  const projects = (await db.select().from(project).where(appId ? and(ne(project.status, 'superseded'), eq(project.appId, appId)) : ne(project.status, 'superseded')).orderBy(desc(project.createdAt))).filter((p) => !away.has(p.appId))
  const apps = (await db.select().from(app)).filter((a) => !away.has(a.id))
  const appOf = (id: string) => apps.find((a) => a.id === id)
  const appName = (id: string) => appOf(id)?.name ?? '?'
  const name = (i: { appId: string; number: number }) => identifier(appOf(i.appId)?.key ?? '?', i.number)
  const projectIds = projects.map((p) => p.id)
  const all = projectIds.length ? await db.select().from(issue).where(and(inArray(issue.projectId, projectIds), eq(issue.kind, 'code'))) : []
  const top = all.filter((i) => !i.parentId)
  const subs = all.filter((i) => i.parentId)
  const subIds = subs.map((x) => x.id)
  const builds = subIds.length ? await db.select().from(build).where(inArray(build.issueId, subIds)) : []
  const b = (id: string) => builds.find((x) => x.issueId === id)
  const status = (id: string) => b(id)?.status ?? 'queued'
  const questions = projectIds.length ? await db.select().from(question).where(and(inArray(question.projectId, projectIds), eq(question.status, 'open'))) : []
  const prs = projectIds.length ? await db.select().from(pr).where(inArray(pr.projectId, projectIds)) : []
  const runs = subIds.length ? await db.select().from(run).where(inArray(run.issueId, subIds)) : []
  const steps = subIds.length ? await db.select().from(step).where(inArray(step.issueId, subIds)) : []
  const recent = await db.select().from(event).where(appId ? and(notInArray(event.type, NOISE), eq(event.appId, appId)) : notInArray(event.type, NOISE)).orderBy(desc(event.seq)).limit(30)

  const lastRun = (id: string) => runs.filter((r) => r.issueId === id).sort((a, c) => c.attempt - a.attempt)[0]
  const currentStep = (id: string) => {
    const r = lastRun(id)
    return r ? steps.find((s) => s.issueId === id && s.runId === r.id && s.status === 'in_progress')?.text ?? null : null
  }
  const tag = (p: typeof projects[number]): Where => ({ projectId: p.id, projectName: p.name, appName: appName(p.appId) })
  const work = (p: { id: string }) => top.filter((t) => t.projectId === p.id && !['backlog', 'triage', 'canceled', 'duplicate'].includes(t.state)).sort((a, c) => a.sortOrder - c.sortOrder)
  const backlogOf = (p: { id: string }) => top.filter((t) => t.projectId === p.id && t.state === 'backlog')

  const running = projects.filter((p) => p.status === 'running' || p.status === 'paused').map((p) => {
    const mine = subs.filter((x) => x.projectId === p.id)
    const ps = prs.filter((q) => q.projectId === p.id)
    const thePr = ps.find((q) => !q.issueId) ?? ps[0]
    return {
      ...tag(p), status: p.status, integrationBranch: p.integrationBranch, backlogOpen: backlogOf(p).length,
      builds: { total: mine.length, done: mine.filter((x) => status(x.id) === 'done').length, failed: mine.filter((x) => status(x.id) === 'failed').length },
      live: mine.filter((x) => LIVE.includes(status(x.id))).map((x) => ({ id: x.id, identifier: name(x), title: x.title, status: status(x.id), step: currentStep(x.id) })),
      held: mine.filter((x) => ['queued', 'ready'].includes(status(x.id)) && b(x.id)?.heldReason).map((x) => ({ id: x.id, identifier: name(x), title: x.title, reason: b(x.id)!.heldReason })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  })

  // Build's page: every task that is past its plan (it has sub-tasks), with what is being built, what stopped it and
  // what it asks. A task is what is built; its project is only where the engine keeps the build.
  const tasks: BuildTask[] = projects.flatMap((p) => work(p).map((t): BuildTask | null => {
    const mine = subs.filter((x) => x.parentId === t.id && !['canceled', 'duplicate'].includes(x.state) && status(x.id) !== 'cancelled')
    if (!mine.length) return null
    const asked = questions.filter((q) => q.issueId === t.id || mine.some((x) => x.id === q.issueId))
    const failed = mine.filter((x) => status(x.id) === 'failed').map((x) => ({ id: x.id, identifier: name(x), title: x.title, error: lastRun(x.id)?.error ?? b(x.id)?.heldReason ?? null }))
    const held = mine.filter((x) => ['queued', 'ready'].includes(status(x.id)) && b(x.id)?.heldReason).map((x) => ({ id: x.id, identifier: name(x), title: x.title, reason: b(x.id)!.heldReason! }))
    const done = mine.filter((x) => status(x.id) === 'done').length
    const thePr = prs.find((q) => q.issueId === t.id) ?? prs.find((q) => q.projectId === p.id && !q.issueId) ?? null
    const phase = phaseOf({ state: t.state, done, total: mine.length, projectStatus: p.status, stopped: asked.length + failed.length + held.length > 0 })
    return {
      id: t.id, appId: t.appId, identifier: name(t), title: t.title, projectId: p.id, projectName: p.solo ? null : p.name, projectStatus: p.status, phase, done, total: mine.length,
      live: mine.filter((x) => LIVE.includes(status(x.id))).map((x) => ({ id: x.id, identifier: name(x), title: x.title, status: status(x.id), step: currentStep(x.id) })),
      held, failed,
      questions: asked.map((q) => ({ id: q.id, text: q.text, cost: q.cost, reason: q.reason, options: (q.options ?? []) as BuildTask['questions'][number]['options'] })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  }).filter((x): x is BuildTask => x !== null))
  // At the smoke test: what each still waits on (its pull request, the person's checks), as its Close button says it.
  {
    const { waitsOf } = await import('./close.js')
    await Promise.all(tasks.filter((x) => x.phase === 'smoke').map(async (x) => { const t = top.find((t) => t.id === x.id)!; x.waits = await waitsOf(t, prs.find((q) => q.issueId === t.id) ?? prs.find((q) => q.projectId === t.projectId && !q.issueId) ?? null, appOf(t.appId)?.setup) }))
  }
  // After a prototype a planned task is read before it is built (the blast radius, the audit, the final ADR and
  // plan). Until those are in it is not ready: it is being checked, or it is stopped because the last step has a
  // question for the person ("NEEDS YOU:", checks.ts).
  {
    const { stepsOf } = await import('./work.js')
    const { checksOwed, step: stepDef } = await import('./steps.js')
    for (const t of tasks.filter((x) => x.phase === 'ready')) {
      const v = await stepsOf({ issueId: t.id })
      const left = checksOwed(v.states, v.resolved.workflow)
      if (!left.length) continue
      const [held] = await db.select().from(stepWork).where(and(eq(stepWork.issueId, t.id), eq(stepWork.key, 'final'), eq(stepWork.status, 'started')))
      const asks = held?.summary?.trim().match(/^NEEDS YOU:?\s*([\s\S]*)/i)?.[1]?.trim() ?? null
      const [talk] = asks ? await db.select({ id: session.id }).from(session).where(and(eq(session.appId, t.appId), eq(session.status, 'open'), sql`${session.subjectRef}->>'checkOf' = ${t.id}`, sql`${session.subjectRef}->>'check' = 'final'`)).orderBy(desc(session.createdAt)).limit(1) : []
      t.checks = { left: left.map((k) => stepDef(k).label), needsYou: asks, sessionId: talk?.id ?? null }
      t.phase = asks ? 'stopped' : 'checking'
    }
  }

  const needsYou: Attention[] = []
  for (const p of projects) {
    for (const x of subs.filter((x) => x.projectId === p.id && status(x.id) === 'failed')) {
      needsYou.push({ kind: 'failed_build', ...tag(p), issueId: x.id, identifier: name(x), title: x.title, error: lastRun(x.id)?.error ?? b(x.id)?.heldReason ?? null })
    }
  }
  for (const q of questions) {
    const p = projects.find((x) => x.id === q.projectId)!
    const t = top.find((x) => x.id === q.issueId)
    needsYou.push({ kind: 'question', ...tag(p), questionId: q.id, issueIdentifier: t ? name(t) : null, text: q.text, cost: q.cost, askedAt: q.askedAt })
  }
  // A task whose prototype is approved and whose brief is written, waiting on the person's approval of the brief: the
  // line after the prototype stops here until they give it, and it said so only in the task's own conversation.
  const waiting = top.filter((t) => !t.briefApprovedBy && t.brief?.trim() && !['done', 'canceled', 'duplicate', 'backlog'].includes(t.state))
  const marks = waiting.length ? await db.select().from(stepWork).where(and(inArray(stepWork.issueId, waiting.map((t) => t.id)), inArray(stepWork.key, ['prototype', 'analysis', 'adr']))) : []
  for (const t of waiting) {
    const of = (key: string) => marks.find((m) => m.issueId === t.id && m.key === key)
    if (!of('prototype')?.approvedBy) continue
    const w = (await workflowFor(db, { issueId: t.id })).workflow
    const first = w ? checksOf(w).filter((k) => BEFORE_PLAN.includes(k)) : [] // the checks its workflow runs before the plan: none when it goes fast
    if (!first.every((k) => of(k)?.status === 'done')) continue // the brief is brought up to date from the analysis and the ADR first
    const p = projects.find((x) => x.id === t.projectId)
    if (p) needsYou.push({ kind: 'approve_brief', ...tag(p), issueId: t.id, identifier: name(t), issueTitle: t.title })
  }
  // A built task with checks left to a person (smoke.ts): nothing more happens on it until they try it by hand.
  for (const t of top.filter((x) => !['done', 'canceled', 'duplicate', 'backlog'].includes(x.state))) {
    const owed = smokeOwed(acceptanceOf(t))
    if (!owed) continue
    const mine = subs.filter((x) => x.parentId === t.id && !['canceled', 'duplicate'].includes(x.state))
    if (!mine.length || !mine.every((x) => x.state === 'done')) continue // still being built or checked: not their turn yet
    const p = projects.find((x) => x.id === t.projectId)
    const hasPr = prs.some((q) => (q.issueId === t.id || (!q.issueId && q.projectId === t.projectId)) && q.number && !['closed', 'merged'].includes(q.status))
    if (p) needsYou.push({ kind: 'smoke_test', ...tag(p), issueId: t.id, identifier: name(t), issueTitle: t.title, owed, ready: smokeReady(acceptanceOf(t), hasPr) })
  }
  for (const p of projects.filter((x) => ['drafting', 'proposed', 'approved'].includes(x.status))) {
    const mine = work(p)
    const unplanned = mine.filter((t) => !subs.some((x) => x.parentId === t.id))
    const open = questions.filter((q) => q.projectId === p.id).length
    if (!unplanned.length && mine.length && !open) needsYou.push({ kind: 'run_project', ...tag(p), subIssues: subs.filter((x) => x.projectId === p.id).length })
    else if (unplanned.length) needsYou.push({ kind: 'plan_issue', ...tag(p), issueId: unplanned[0].id, identifier: name(unplanned[0]), issueTitle: unplanned[0].title })
  }
  for (const p of projects.filter((x) => x.status === 'running')) { // the work is done but the backlog is not: it cannot land until a person takes on or drops what is left
    const mine = subs.filter((x) => x.projectId === p.id && status(x.id) !== 'cancelled')
    const items = backlogOf(p)
    const allPlanned = work(p).every((t) => mine.some((x) => x.parentId === t.id))
    if (items.length && allPlanned && mine.length && mine.every((x) => status(x.id) === 'done')) needsYou.push({ kind: 'backlog', ...tag(p), open: items.length, items: items.map((i) => i.title).slice(0, 5) })
  }
  // GitHub, as the sync last saw it: our PRs (review, checks), main moving under a project, teammates' PRs.
  const sig = (q: typeof prs[number]) => { const s = (q.signals ?? {}) as { review?: string | null; checks?: string; failing?: string[] }; return { review: s.review ?? null, checks: s.checks ?? 'none', failing: s.failing ?? [] } }
  for (const p of projects) {
    for (const thePr of prs.filter((q) => q.projectId === p.id && ['open', 'draft'].includes(q.status))) {
      const s = sig(thePr)
      const t = thePr.issueId ? top.find((q) => q.id === thePr.issueId) : null
      const mine = t ? subs.filter((x) => x.parentId === t.id) : []
      // An issue's PR (stacked) is ready once its own sub-issues have landed, while later issues still build; the project's one PR once the project has.
      const ready = t ? mine.length > 0 && mine.every((x) => status(x.id) === 'done') : p.status === 'landed'
      const row = { ...tag(p), projectName: t ? `${p.name} · ${name(t)} ${t.title}` : p.name, prNumber: thePr.number, url: thePr.url, ...s }
      if (ready) needsYou.push({ kind: 'merge_pr', ...row })
      else if (s.review === 'CHANGES_REQUESTED' || s.checks === 'failing') needsYou.push({ kind: 'pr_feedback', ...row })
    }
  }
  const mainEvents = projectIds.length ? await db.select().from(event).where(and(inArray(event.projectId, projectIds), inArray(event.type, ['project.caught_up', 'project.behind_main']))).orderBy(desc(event.seq)) : []
  for (const p of projects.filter((x) => !['stopped', 'superseded'].includes(x.status))) {
    const last = mainEvents.find((e) => e.projectId === p.id)
    if (last?.type === 'project.behind_main') needsYou.push({ kind: 'behind_main', ...tag(p), files: String((last.payload as any).files ?? ''), commits: Number((last.payload as any).commits ?? 0) })
  }
  // An app's own checkout held back from GitHub (github.ts, pullCheckout): only the person can free it.
  const mineApps = apps.filter((a) => !appId || a.id === appId)
  const held = mineApps.length ? await db.select().from(event).where(and(inArray(event.type, ['checkout.behind', 'checkout.pulled']), inArray(event.appId, mineApps.map((a) => a.id)))).orderBy(desc(event.seq)) : []
  for (const a of mineApps) {
    const last = held.find((e) => e.appId === a.id)
    const w = (last?.payload ?? {}) as { branch?: string; path?: string; commits?: number; why?: string; files?: string[] }
    if (last?.type === 'checkout.behind') needsYou.push({ kind: 'checkout_behind', appName: a.name, branch: w.branch ?? a.defaultBranch, path: w.path ?? '', commits: Number(w.commits ?? 0), why: String(w.why ?? ''), files: w.files ?? [] })
  }
  const outside = await db.select().from(outsidePr).where(appId ? and(eq(outsidePr.state, 'open'), eq(outsidePr.appId, appId)) : eq(outsidePr.state, 'open'))
  // A nightly check that is red, while the app still holds its builds to it.
  for (const n of (await db.select().from(nightly).where(eq(nightly.status, 'failed'))).filter((n) => appOf(n.appId) && (!appId || n.appId === appId))) {
    const held = leftTo(appOf(n.appId)!.setup, 'nightly').find((h) => h.key === n.key && h.runs === n.workflow)
    if (!held) continue
    const merged = n.greenAt ? prs.filter((q) => q.appId === n.appId && q.status === 'merged' && q.mergedAt && q.mergedAt > n.greenAt! && (!n.ranAt || q.mergedAt <= n.ranAt)) : []
    const since = top.filter((t) => merged.some((q) => (q.issueId ? q.issueId === t.id : q.projectId === t.projectId)) && !['backlog', 'triage', 'canceled', 'duplicate'].includes(t.state))
    needsYou.push({ kind: 'nightly_failed', appId: n.appId, appName: appName(n.appId), name: held.name, workflow: n.workflow, url: n.url, nights: n.failing, since: since.slice(0, 12).map((t) => ({ id: t.id, identifier: name(t), title: t.title })) })
  }
  for (const o of outside.filter((x) => x.reviewRequested && !x.draft)) needsYou.push({ kind: 'review', appName: appName(o.appId), prNumber: o.number, title: o.title, author: o.author, url: o.url })
  const live = subs.filter((x) => !['done', 'failed', 'cancelled'].includes(status(x.id)) && projects.find((p) => p.id === x.projectId && ['running', 'paused'].includes(p.status)))
  const claims = live.length ? await db.select().from(fileClaim).where(inArray(fileClaim.issueId, live.map((x) => x.id))) : []
  for (const o of outside) {
    const files = (o.files as string[]) ?? []
    for (const p of projects.filter((x) => ['running', 'paused'].includes(x.status) && x.appId === o.appId)) {
      const mine = claims.filter((c) => live.some((x) => x.id === c.issueId && x.projectId === p.id)).map((c) => c.path.replace(/\/+$/, ''))
      const hit = files.filter((f) => mine.some((m) => f === m || f.startsWith(m + '/') || m.startsWith(f + '/')))
      if (hit.length) needsYou.push({ kind: 'overlap', ...tag(p), prNumber: o.number, title: o.title, author: o.author, url: o.url, files: hit.slice(0, 8) })
    }
  }

  // To-dos: work outside the code. What waits on a person first; one whose only open lines wait on someone else after.
  const openTodo = and(eq(issue.kind, 'todo'), isNull(issue.parentId), notInArray(issue.state, ['done', 'canceled', 'duplicate']))
  const todos = await db.select().from(issue).where(appId ? and(openTodo, eq(issue.appId, appId)) : openTodo)
  const lines = todos.length ? await db.select().from(issue).where(inArray(issue.parentId, todos.map((t) => t.id))).orderBy(asc(issue.sortOrder), asc(issue.number)) : []
  const todoRows = todos.map((t) => {
    const mine = lines.filter((l) => l.parentId === t.id && l.state !== 'canceled'), open = mine.filter((l) => l.state !== 'done')
    return { kind: 'todo' as const, todoId: t.id, identifier: name(t), title: t.title, owner: t.delegate === 'agent' ? 'agent' : 'person', projectId: t.projectId, projectName: projects.find((p) => p.id === t.projectId)?.name ?? null, appName: appName(t.appId),
      done: mine.length - open.length, total: mine.length, next: open.find((l) => !l.waitingOn)?.title ?? null, waitingOn: [...new Set(open.filter((l) => l.waitingOn).map((l) => l.waitingOn!))] }
  })
  const stalled = (r: typeof todoRows[number]) => r.total > 0 && !r.next && r.waitingOn.length > 0
  const byNumber = (x: typeof todoRows[number], y: typeof todoRows[number]) => todos.find((t) => t.id === x.todoId)!.number - todos.find((t) => t.id === y.todoId)!.number
  needsYou.push(...todoRows.filter((r) => !stalled(r)).sort(byNumber), ...todoRows.filter(stalled).sort(byNumber))

  return { running, tasks, needsYou, recent: recent.reverse(), counts: { projects: projects.length, running: running.length, needsYou: needsYou.length } }
}
