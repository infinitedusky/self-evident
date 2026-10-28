/**
 * The front door: what is running, what needs a person, what just happened. Nothing here has state of its own;
 * it is all read from the project, issue, build, question, pr, run, step and event tables, so it is always true.
 */
import { and, asc, desc, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, event, fileClaim, issue, outsidePr, project, pr, question, run, step } from './db/schema.js'
import { identifier } from './issues.js'

const LIVE = ['running', 'merging', 'testing', 'awaiting_answer']
export const NOISE = ['run.tool_call', 'run.tool_result', 'run.rate_limit', 'run.message', 'talk.message', 'talk.permission', 'talk.result'] // conversations have their own place

type Where = { projectId: string; projectName: string; appName: string }
export type Attention =
  | ({ kind: 'failed_build'; issueId: string; identifier: string; title: string; error: string | null } & Where)
  | ({ kind: 'question'; questionId: string; issueIdentifier: string | null; text: string; cost: string | null; askedAt: Date } & Where)
  | ({ kind: 'run_project'; subIssues: number } & Where)
  | ({ kind: 'plan_issue'; issueId: string; identifier: string; issueTitle: string } & Where)
  | ({ kind: 'backlog'; open: number; items: string[] } & Where)
  | { kind: 'todo'; todoId: string; identifier: string; title: string; owner: string; projectId: string | null; projectName: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | ({ kind: 'merge_pr'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'pr_feedback'; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] } & Where)
  | ({ kind: 'behind_main'; files: string; commits: number } & Where)
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | ({ kind: 'overlap'; prNumber: number; title: string; author: string | null; url: string | null; files: string[] } & Where)

export async function now(appId?: string) {
  const projects = await db.select().from(project).where(appId ? and(ne(project.status, 'superseded'), eq(project.appId, appId)) : ne(project.status, 'superseded')).orderBy(desc(project.createdAt))
  const apps = await db.select().from(app)
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
      held: mine.filter((x) => status(x.id) === 'queued' && b(x.id)?.heldReason).map((x) => ({ id: x.id, identifier: name(x), title: x.title, reason: b(x.id)!.heldReason })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  })

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
  const outside = await db.select().from(outsidePr).where(appId ? and(eq(outsidePr.state, 'open'), eq(outsidePr.appId, appId)) : eq(outsidePr.state, 'open'))
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

  return { running, needsYou, recent: recent.reverse(), counts: { projects: projects.length, running: running.length, needsYou: needsYou.length } }
}
