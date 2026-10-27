/**
 * The front door: what is running, what needs a person, what just happened. Nothing here has state of its own;
 * it is all read from the project, task, phase, question, pr, run, step and event tables, so it is always true.
 */
import { and, asc, desc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, backlogItem, checklistItem, outsidePr, phaseFileClaim, todo, event, phase, project, pr, question, run, step, task } from './db/schema.js'

const LIVE = ['running', 'merging', 'testing', 'awaiting_answer']
export const NOISE = ['run.tool_call', 'run.tool_result', 'run.rate_limit', 'run.message', 'talk.message', 'talk.permission', 'talk.result'] // conversations have their own place

export type Attention =
  | { kind: 'failed_phase'; projectId: string; planTitle: string; appName: string; phaseId: string; number: number; title: string; error: string | null }
  | { kind: 'question'; projectId: string; planTitle: string; appName: string; questionId: string; taskNumber: number | null; text: string; cost: string | null; askedAt: Date }
  | { kind: 'run_project'; projectId: string; planTitle: string; appName: string; phases: number }
  | { kind: 'plan_task'; projectId: string; planTitle: string; appName: string; taskId: string; taskNumber: number; taskTitle: string }
  | { kind: 'backlog'; projectId: string; planTitle: string; appName: string; open: number; items: string[] }
  | { kind: 'todo'; todoId: string; number: number; title: string; owner: string; projectId: string | null; planTitle: string | null; appName: string; done: number; total: number; next: string | null; waitingOn: string[] }
  | { kind: 'merge_pr'; projectId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] }
  | { kind: 'pr_feedback'; projectId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null; review: string | null; checks: string; failing: string[] }
  | { kind: 'behind_main'; projectId: string; planTitle: string; appName: string; files: string; commits: number }
  | { kind: 'review'; appName: string; prNumber: number; title: string; author: string | null; url: string | null }
  | { kind: 'overlap'; appName: string; prNumber: number; title: string; author: string | null; url: string | null; files: string[]; projectId: string; planTitle: string }

export async function now(appId?: string) {
  const projects = await db.select().from(project).where(appId ? and(ne(project.status, 'superseded'), eq(project.appId, appId)) : ne(project.status, 'superseded')).orderBy(desc(project.createdAt))
  const apps = await db.select().from(app)
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? '?'
  const projectIds = projects.map((p) => p.id)
  const tasks = projectIds.length ? await db.select().from(task).where(inArray(task.projectId, projectIds)) : []
  const phases = projectIds.length ? await db.select().from(phase).where(inArray(phase.projectId, projectIds)) : []
  const questions = projectIds.length ? await db.select().from(question).where(and(inArray(question.projectId, projectIds), eq(question.status, 'open'))) : []
  const prs = projectIds.length ? await db.select().from(pr).where(inArray(pr.projectId, projectIds)) : []
  const openItems = projectIds.length ? await db.select().from(backlogItem).where(and(inArray(backlogItem.projectId, projectIds), eq(backlogItem.state, 'open'))) : []
  const phaseIds = phases.map((x) => x.id)
  const runs = phaseIds.length ? await db.select().from(run).where(inArray(run.phaseId, phaseIds)) : []
  const steps = phaseIds.length ? await db.select().from(step).where(inArray(step.phaseId, phaseIds)) : []
  const recent = await db.select().from(event).where(appId ? and(notInArray(event.type, NOISE), eq(event.appId, appId)) : notInArray(event.type, NOISE)).orderBy(desc(event.seq)).limit(30)

  const lastRun = (phaseId: string) => runs.filter((r) => r.phaseId === phaseId).sort((a, b) => b.attempt - a.attempt)[0]
  const currentStep = (phaseId: string) => {
    const r = lastRun(phaseId)
    return r ? steps.find((s) => s.phaseId === phaseId && s.runId === r.id && s.status === 'in_progress')?.text ?? null : null
  }
  const tag = (p: typeof projects[number]) => ({ projectId: p.id, planTitle: p.title, appName: appName(p.appId) })

  const running = projects.filter((p) => p.status === 'running' || p.status === 'paused').map((p) => {
    const mine = phases.filter((x) => x.projectId === p.id)
    const thePr = prs.find((q) => q.projectId === p.id)
    return {
      ...tag(p), status: p.status, integrationBranch: p.integrationBranch, backlogOpen: openItems.filter((i) => i.projectId === p.id).length,
      phases: { total: mine.length, done: mine.filter((x) => x.status === 'done').length, failed: mine.filter((x) => x.status === 'failed').length },
      live: mine.filter((x) => LIVE.includes(x.status)).map((x) => ({ id: x.id, number: x.number, title: x.title, status: x.status, step: currentStep(x.id) })),
      held: mine.filter((x) => x.status === 'queued' && x.heldReason).map((x) => ({ id: x.id, number: x.number, title: x.title, reason: x.heldReason })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  })

  const needsYou: Attention[] = []
  for (const p of projects) {
    const mine = phases.filter((x) => x.projectId === p.id)
    for (const x of mine.filter((x) => x.status === 'failed')) {
      needsYou.push({ kind: 'failed_phase', ...tag(p), phaseId: x.id, number: x.number, title: x.title, error: lastRun(x.id)?.error ?? x.heldReason ?? null })
    }
  }
  for (const q of questions) {
    const p = projects.find((x) => x.id === q.projectId)!
    const t = tasks.find((x) => x.id === q.taskId)
    needsYou.push({ kind: 'question', ...tag(p), questionId: q.id, taskNumber: t?.number ?? null, text: q.text, cost: q.cost, askedAt: q.askedAt })
  }
  for (const p of projects.filter((x) => ['drafting', 'proposed', 'approved'].includes(x.status))) {
    const myTasks = tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.position - b.position)
    const unplanned = myTasks.filter((t) => !phases.some((x) => x.taskId === t.id))
    const open = questions.filter((q) => q.projectId === p.id).length
    if (!unplanned.length && myTasks.length && !open) needsYou.push({ kind: 'run_project', ...tag(p), phases: phases.filter((x) => x.projectId === p.id).length })
    else if (unplanned.length) needsYou.push({ kind: 'plan_task', ...tag(p), taskId: unplanned[0].id, taskNumber: unplanned[0].number, taskTitle: unplanned[0].title })
  }
  for (const p of projects.filter((x) => x.status === 'running')) { // the work is done but the backlog is not: it cannot land until a person covers or drops what is left
    const mine = phases.filter((x) => x.projectId === p.id)
    const items = openItems.filter((i) => i.projectId === p.id)
    const allPlanned = tasks.filter((t) => t.projectId === p.id).every((t) => mine.some((x) => x.taskId === t.id))
    if (items.length && allPlanned && mine.length && mine.every((x) => x.status === 'done')) needsYou.push({ kind: 'backlog', ...tag(p), open: items.length, items: items.map((i) => i.text).slice(0, 5) })
  }
  // GitHub, as the sync last saw it: our PRs (review, checks), main moving under a project, teammates' PRs.
  const sig = (q: typeof prs[number]) => { const s = (q.signals ?? {}) as { review?: string | null; checks?: string; failing?: string[] }; return { review: s.review ?? null, checks: s.checks ?? 'none', failing: s.failing ?? [] } }
  for (const p of projects) {
    for (const thePr of prs.filter((q) => q.projectId === p.id && ['open', 'draft'].includes(q.status))) {
      const s = sig(thePr)
      const t = thePr.taskId ? tasks.find((q) => q.id === thePr.taskId) : null
      const mine = t ? phases.filter((x) => x.taskId === t.id) : []
      // A task's PR (stacked) is ready once its own phases have landed, while later tasks still build; the project's one PR once the project has.
      const ready = t ? mine.length > 0 && mine.every((x) => x.status === 'done') : p.status === 'landed'
      const row = { ...tag(p), planTitle: t ? `${p.title} · task #${t.number} ${t.title}` : p.title, prNumber: thePr.number, url: thePr.url, ...s }
      if (ready) needsYou.push({ kind: 'merge_pr', ...row })
      else if (s.review === 'CHANGES_REQUESTED' || s.checks === 'failing') needsYou.push({ kind: 'pr_feedback', ...row })
    }
  }
  const projectIdsAll = projects.map((p) => p.id)
  const mainEvents = projectIdsAll.length ? await db.select().from(event).where(and(inArray(event.projectId, projectIdsAll), inArray(event.type, ['project.caught_up', 'project.behind_main']))).orderBy(desc(event.seq)) : []
  for (const p of projects.filter((x) => !['stopped', 'superseded'].includes(x.status))) {
    const last = mainEvents.find((e) => e.projectId === p.id)
    if (last?.type === 'project.behind_main') needsYou.push({ kind: 'behind_main', ...tag(p), files: String((last.payload as any).files ?? ''), commits: Number((last.payload as any).commits ?? 0) })
  }
  const outside = await db.select().from(outsidePr).where(appId ? and(eq(outsidePr.state, 'open'), eq(outsidePr.appId, appId)) : eq(outsidePr.state, 'open'))
  for (const o of outside.filter((x) => x.reviewRequested && !x.draft)) needsYou.push({ kind: 'review', appName: appName(o.appId), prNumber: o.number, title: o.title, author: o.author, url: o.url })
  const live = phases.filter((x) => !['done', 'failed', 'cancelled'].includes(x.status) && projects.find((p) => p.id === x.projectId && ['running', 'paused'].includes(p.status)))
  const claims = live.length ? await db.select().from(phaseFileClaim).where(inArray(phaseFileClaim.phaseId, live.map((x) => x.id))) : []
  for (const o of outside) {
    const files = (o.files as string[]) ?? []
    for (const p of projects.filter((x) => ['running', 'paused'].includes(x.status) && x.appId === o.appId)) {
      const mine = claims.filter((c) => live.some((x) => x.id === c.phaseId && x.projectId === p.id)).map((c) => c.path.replace(/\/+$/, ''))
      const hit = files.filter((f) => mine.some((m) => f === m || f.startsWith(m + '/') || m.startsWith(f + '/')))
      if (hit.length) needsYou.push({ kind: 'overlap', appName: appName(o.appId), prNumber: o.number, title: o.title, author: o.author, url: o.url, files: hit.slice(0, 8), projectId: p.id, planTitle: p.title })
    }
  }

  // To-dos: work outside the code. What waits on a person first; one whose only open lines wait on someone else after.
  const todos = await db.select().from(todo).where(appId ? and(eq(todo.status, 'open'), eq(todo.appId, appId)) : eq(todo.status, 'open'))
  const lines = todos.length ? await db.select().from(checklistItem).where(inArray(checklistItem.todoId, todos.map((t) => t.id))).orderBy(asc(checklistItem.position), asc(checklistItem.id)) : []
  const todoRows = todos.map((t) => {
    const mine = lines.filter((l) => l.todoId === t.id), open = mine.filter((l) => !l.done)
    return { kind: 'todo' as const, todoId: t.id, number: t.number, title: t.title, owner: t.owner, projectId: t.projectId, planTitle: projects.find((p) => p.id === t.projectId)?.title ?? null, appName: appName(t.appId),
      done: mine.length - open.length, total: mine.length, next: open.find((l) => !l.waitingOn)?.text ?? null, waitingOn: [...new Set(open.filter((l) => l.waitingOn).map((l) => l.waitingOn!))] }
  })
  const stalled = (r: typeof todoRows[number]) => r.total > 0 && !r.next && r.waitingOn.length > 0
  needsYou.push(...todoRows.filter((r) => !stalled(r)).sort((a, b) => a.number - b.number), ...todoRows.filter(stalled).sort((a, b) => a.number - b.number))

  return { running, needsYou, recent: recent.reverse(), counts: { projects: projects.length, running: running.length, needsYou: needsYou.length } }
}
