/**
 * The runner: starts projects, dispatches ready phases into worktrees and agent runs (as many as the cap allows,
 * across every running project), lands what finishes one at a time per project, retries what doesn't, keeps each project's
 * PR current, cleans up when a project lands, and recovers after a restart. One process; all state in Postgres.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, backlogItem, event, phase, project, pr as prTable, repo, run, step, task } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { addItems, laterFrom } from './backlog.js'
import { runTask, type Execute } from './executor.js'
import { addWorktree, branchExists, ensureBranch, git, headSha, removeWorktree } from './git.js'
import { landingBranch, prMode, stackBase, taskBranch, taskStart } from './branches.js'
import { newId } from './ids.js'
import { land, withLock } from './landing.js'
import { ensureProjectPr, prBody } from './pr.js'
import { projectGraph, PlanError, tickAll } from './projects.js'
import { finishPlanning, preparePlanning, type Propose } from './planner.js'
import { reapAgentProcesses } from './reap.js'
import { holdMinutes, isOutage } from './outage.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }

export class Runner {
  private active = new Map<string, AbortController>() // phase id → abort for its live run
  private interrupting = new Set<string>() // phases a pause is stopping on purpose: their run's end is not a failure
  /** The engine holds all dispatch while the model is unavailable; it tries again at `until`, backing off. */
  hold: { until: Date; reason: string; level: number } | null = null
  private outages = 0
  private holdTimer: NodeJS.Timeout | undefined
  private execute: Execute
  private sessionsMax: number

  private propose: Propose | undefined // the planner, for planning a project's next task; the real one unless a test gives one
  private planningTasks = new Set<string>()
  private backlogWaits = new Set<string>() // project.backlog_open said once per set of open items

  constructor(opts: { execute?: Execute; sessionsMax?: number; propose?: Propose } = {}) {
    this.execute = opts.execute ?? runTask
    this.sessionsMax = opts.sessionsMax ?? SESSIONS_MAX
    this.propose = opts.propose
  }

  async startProject(projectId: string) {
    const ctx = await this.context(projectId)
    const { p, a, r } = ctx
    if (!r) throw new PlanError(`app ${a.name} has no repo with a local path`)
    const g = (await projectGraph(projectId))!
    if (!g.phases.length) throw new PlanError('this project has no phases yet; project its tasks first')
    // From main as it is on GitHub when there is a remote (a teammate may have merged since the local main was pulled).
    const fetched = (await git(r.localPath!, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })).code === 0
    const sha = await ensureBranch(r.localPath!, p.integrationBranch!, fetched ? `origin/${a.defaultBranch}` : a.defaultBranch)
    await db.update(project).set({ status: 'running' }).where(eq(project.id, projectId))
    await this.emit({ ...ctx.base, type: 'project.started', payload: { integrationBranch: p.integrationBranch, from: a.defaultBranch, sha } })
    void this.dispatch()
    return { integrationBranch: p.integrationBranch, sha }
  }

  /**
   * One dispatch pass across every running project, serialized: one tick for all of them, launch whatever became
   * ready wherever it is, and close any project whose phases have all landed. Phases from different projects run at
   * once; phases that share a file never do.
   */
  dispatch(): Promise<void> {
    return withLock('dispatch', async () => {
      if (this.hold && this.hold.until.getTime() > Date.now()) return // waiting for the model; the timer dispatches when the hold ends
      const room = Math.max(0, this.sessionsMax - this.active.size)
      await tickAll(room)
      const running = await db.select().from(project).where(eq(project.status, 'running'))
      for (const p of running) {
        const g = (await projectGraph(p.id))!
        for (const x of g.phases) {
          if (x.status === 'ready' && !this.active.has(x.id)) {
            this.active.set(x.id, new AbortController())
            this.launch(x.id, p.id).catch(async (err) => {
              this.active.delete(x.id)
              await this.emit({ ...(await this.context(p.id)).base, taskId: x.taskId, phaseId: x.id, type: 'phase.error', payload: { error: String(err?.message ?? err) } })
            })
          }
        }
        // A project runs task by task: when every phase of the tasks before it has landed, the next unplanned task is
        // planned (the planner reads the code that just landed) and its phases join the graph. The project lands only
        // when every task has phases and all of them have landed.
        const pos = new Map(g.tasks.map((t) => [t.id, t.position]))
        const unplanned = g.tasks.filter((t) => !g.phases.some((x) => x.taskId === t.id)).sort((a, b) => a.position - b.position)
        const next = unplanned[0]
        if (next && g.phases.filter((x) => (pos.get(x.taskId) ?? 0) < next.position).every((x) => x.status === 'done')) await this.planNext(p.id, next.id)
        const openItems = g.backlog.filter((i) => i.state === 'open')
        if (!unplanned.length && g.phases.length && g.phases.every((x) => x.status === 'done') && openItems.length) {
          // The work is done but the backlog is not: the project waits for a person to cover or drop what is left.
          const key = `${p.id}:${openItems.map((i) => i.id).join(',')}`
          if (!this.backlogWaits.has(key)) { this.backlogWaits.add(key); await this.emit({ ...(await this.context(p.id)).base, type: 'project.backlog_open', payload: { open: openItems.length, items: openItems.map((i) => i.text).slice(0, 10) } }) }
        } else if (!unplanned.length && g.phases.length && g.phases.every((x) => x.status === 'done')) {
          await db.update(project).set({ status: 'landed' }).where(eq(project.id, p.id))
          await this.emit({ ...(await this.context(p.id)).base, type: 'project.landed', payload: {} })
          await this.cleanup(p.id)
        }
      }
    })
  }

  private async launch(phaseId: string, projectId: string) {
    const ctx = await this.context(projectId)
    const { p, a, r, base } = ctx
    const setup = (a.setup ?? {}) as AppSetup
    const [x] = await db.select().from(phase).where(eq(phase.id, phaseId))
    const [t] = await db.select().from(task).where(eq(task.id, x.taskId))
    const g = (await projectGraph(projectId))!
    const files = g.phases.find((q) => q.id === phaseId)!.files
    const branch = x.branch ?? `phase/${p.id}/${x.number}`
    const worktreePath = x.worktreePath ?? join(`${r!.localPath}-worktrees`, `${p.id}--${x.number}`)
    const pb = { ...base, taskId: x.taskId, phaseId }
    const mode = prMode(a.setup)
    const onto = landingBranch(mode, p.integrationBranch!, t) // the project's branch, or the task's own (stacked PRs)
    // Worktree and branch creation touch the repo's refs: one at a time per repo. A failure here is an attempt too.
    let baseSha: string
    try {
      baseSha = await withLock(`git:${r!.localPath}`, async () => {
        if (mode === 'task' && !(await branchExists(r!.localPath!, onto))) { // a task's branch starts where the task before it ended
          const tasks = await db.select().from(task).where(eq(task.projectId, projectId))
          const existing = new Set<string>()
          for (const q of tasks) { const b = taskBranch(p.integrationBranch!, q.number); if (await branchExists(r!.localPath!, b)) existing.add(b) }
          await git(r!.localPath!, ['branch', onto, taskStart(p.integrationBranch!, t, tasks, existing)])
        }
        await addWorktree(r!.localPath!, worktreePath, branch, onto)
        return headSha(r!.localPath!, onto)
      })
    } catch (err: any) {
      const attempt = x.attempt + 1
      await db.update(phase).set({ attempt, branch, worktreePath, updatedAt: new Date() }).where(eq(phase.id, phaseId))
      return this.failed(phaseId, attempt, x.maxAttempts, `could not prepare the worktree: ${err?.message ?? err}`, pb)
    }

    const [interrupted] = await db.select().from(run).where(and(eq(run.phaseId, phaseId), eq(run.status, 'interrupted'))).orderBy(desc(run.attempt)).limit(1)
    const previousFailure = await this.lastFailure(phaseId)
    const attempt = x.attempt + 1
    await db.update(phase).set({ status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null, updatedAt: new Date() }).where(eq(phase.id, phaseId))
    const runId = newId('run')
    await db.insert(run).values({ id: runId, appId: a.id, phaseId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    const rb = { ...pb, runId }
    await this.emit({ ...rb, type: 'phase.status', payload: { from: x.status, to: 'running', attempt, branch, worktreePath, resumes: interrupted?.agentSessionId ?? null } })

    const result = await this.execute({
      phase: { id: x.id, number: x.number, title: x.title, brief: x.brief }, task: { number: t.number, title: t.title, brief: t.brief },
      worktreePath, branch, files, testCmd: setup.test_cmd, previousFailure, model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
      resumeSessionId: interrupted?.agentSessionId ?? undefined, abort: this.active.get(phaseId),
      onEvent: async (type, payload) => {
        if (type === 'run.steps') await this.saveSteps(a.id, phaseId, runId, (payload.steps as { text: string; status: string }[]) ?? [])
        await this.emit({ ...rb, actor: `agent:${runId}`, type, payload })
      },
    })
    await db.update(run).set({
      status: result.status, endedAt: new Date(), agentSessionId: result.agentSessionId ?? null,
      costUsd: result.costUsd?.toString() ?? null, summary: result.summary ?? null, error: result.error ?? null,
    }).where(eq(run.id, runId))

    if (this.interrupting.has(phaseId)) { // paused on purpose: the run resumes from its session later
      this.interrupting.delete(phaseId); this.active.delete(phaseId)
      await db.update(run).set({ status: 'interrupted', error: 'paused' }).where(eq(run.id, runId))
      return
    }
    if (result.status !== 'completed' && isOutage(result.error)) return this.outage(phaseId, runId, result.error!, rb)
    if (result.status === 'completed' && this.outages) { this.outages = 0; this.hold = null; await this.emit({ ...base, type: 'engine.resumed', payload: {} }) }
    if (result.status !== 'completed') return this.failed(phaseId, attempt, x.maxAttempts, `the run ${result.error ?? 'failed'}`, rb)

    await db.update(phase).set({ status: 'merging', updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...rb, type: 'phase.status', payload: { from: 'running', to: 'merging' } })
    const landed = await withLock(`land:${projectId}`, () => land({
      repoPath: r!.localPath!, worktreePath, integrationBranch: onto, testCmd: setup.test_cmd,
      onEvent: async (type, payload) => { await this.emit({ ...rb, type, payload }) },
    }))
    if (!landed.ok) return this.failed(phaseId, attempt, x.maxAttempts, `landing failed at ${landed.stage}: ${landed.detail}`, rb)

    await db.update(phase).set({ status: 'done', updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...rb, type: 'phase.status', payload: { from: 'merging', to: 'done', sha: landed.sha } })
    const later = laterFrom(result.summary) // what the builder noticed and left for later joins the backlog, once its work has landed
    if (later.length) await addItems(projectId, later.map((text) => ({ text, source: 'builder' as const, sourceRef: { phaseId, runId } })), `agent:${runId}`).catch((err) => this.emit({ ...rb, type: 'backlog.error', payload: { error: String(err?.message ?? err) } }))
    await withLock(`land:${projectId}`, () => this.updatePr(projectId, mode === 'task' ? x.taskId : undefined)).catch((err) => this.emit({ ...rb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    this.active.delete(phaseId)
    await this.dispatch()
  }

  /** The builder's todo list, as the phase's steps: the latest list replaces the previous one for this run. */
  private async saveSteps(appId: string, phaseId: string, runId: string, steps: { text: string; status: string }[]) {
    const allowed = new Set(['pending', 'in_progress', 'completed'])
    await db.transaction(async (tx) => {
      await tx.delete(step).where(and(eq(step.phaseId, phaseId), eq(step.runId, runId)))
      const rows = steps.filter((s) => s.text).map((s, i) => ({ appId, phaseId, runId, position: i, text: s.text.slice(0, 500), status: allowed.has(s.status) ? s.status : 'pending' }))
      if (rows.length) await tx.insert(step).values(rows)
    })
  }

  private async failed(phaseId: string, attempt: number, max: number, why: string, pb: Omit<NewEvent, 'type'>) {
    const [current] = await db.select({ status: phase.status }).from(phase).where(eq(phase.id, phaseId))
    if (current?.status === 'cancelled') { this.active.delete(phaseId); return } // the project was cancelled under this run; nothing to retry
    const again = attempt < max
    await db.update(phase).set({ status: again ? 'queued' : 'failed', heldReason: again ? `attempt ${attempt} failed; will retry` : why.slice(0, 500), updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...pb, type: again ? 'phase.retry' : 'phase.failed', payload: { attempt, max, why: why.slice(0, 2000) } })
    this.active.delete(phaseId)
    await this.dispatch()
  }

  /** The model or account is unavailable: not the phase's fault. Give the attempt back, queue it to resume, hold the engine. */
  private async outage(phaseId: string, runId: string, error: string, pb: Omit<NewEvent, 'type'>) {
    const [x] = await db.select().from(phase).where(eq(phase.id, phaseId))
    await db.update(run).set({ status: 'interrupted', error: `outage: ${error.slice(0, 400)}` }).where(eq(run.id, runId))
    const minutes = holdMinutes(this.outages)
    this.outages++
    const until = new Date(Date.now() + minutes * 60_000)
    this.hold = { until, reason: error.slice(0, 200), level: this.outages }
    await db.update(phase).set({ status: 'queued', attempt: Math.max(0, (x?.attempt ?? 1) - 1), heldReason: `waiting for the model (${error.slice(0, 80)}); trying again at ${until.toTimeString().slice(0, 5)}`, updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...pb, type: 'engine.hold', payload: { reason: error.slice(0, 400), minutes, until: until.toISOString(), level: this.outages } })
    this.active.delete(phaseId)
    clearTimeout(this.holdTimer)
    this.holdTimer = setTimeout(() => void this.dispatch(), minutes * 60_000 + 500)
  }

  /** A person ends the hold early: try the model now. */
  async releaseHold() {
    clearTimeout(this.holdTimer)
    this.hold = null
    void this.dispatch()
    return { released: true }
  }

  /**
   * Pause a project: nothing new starts; running agents are stopped but keep their worktrees and conversations; a phase
   * that is landing finishes landing. Resume picks each stopped one up from its session.
   */
  async pauseProject(projectId: string, actor = 'user') {
    const ctx = await this.context(projectId)
    if (ctx.p.status !== 'running') throw new PlanError(`project is ${ctx.p.status}; only a running project can be paused`)
    await db.update(project).set({ status: 'paused' }).where(eq(project.id, projectId))
    const live = await db.select().from(phase).where(and(eq(phase.projectId, projectId), eq(phase.status, 'running')))
    for (const x of live) {
      this.interrupting.add(x.id)
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'paused' }).where(and(eq(run.phaseId, x.id), eq(run.status, 'working')))
      await db.update(phase).set({ status: 'queued', heldReason: 'paused; will resume where it stopped', updatedAt: new Date() }).where(eq(phase.id, x.id))
      this.active.get(x.id)?.abort()
    }
    await this.emit({ ...ctx.base, actor, type: 'project.paused', payload: { interrupted: live.map((x) => x.number) } })
    return { paused: true, interrupted: live.map((x) => x.number) }
  }

  async resumeProject(projectId: string, actor = 'user') {
    const ctx = await this.context(projectId)
    if (ctx.p.status !== 'paused') throw new PlanError(`project is ${ctx.p.status}; only a paused project can be resumed`)
    await db.update(project).set({ status: 'running' }).where(eq(project.id, projectId))
    await db.update(phase).set({ heldReason: null, updatedAt: new Date() }).where(and(eq(phase.projectId, projectId), eq(phase.status, 'queued')))
    await this.emit({ ...ctx.base, actor, type: 'project.resumed', payload: {} })
    void this.dispatch()
    return { resumed: true }
  }

  /** The last failure reason comes from the log, so it survives a restart. (A landed phase never retries again.) */
  private async lastFailure(phaseId: string): Promise<string | undefined> {
    const [e] = await db.select().from(event).where(and(eq(event.phaseId, phaseId), inArray(event.type, ['phase.retry', 'phase.failed']))).orderBy(desc(event.seq)).limit(1)
    return e ? String((e.payload as any).why ?? '') : undefined
  }

  /** After a project lands: remove its phase worktrees and local branches. The integration branch stays (it's the PR). */
  private async cleanup(projectId: string) {
    const { p, r, base } = await this.context(projectId)
    if (!r) return
    const phases = await db.select().from(phase).where(eq(phase.projectId, projectId))
    await withLock(`git:${r.localPath}`, async () => {
      for (const x of phases) {
        if (x.worktreePath) await removeWorktree(r.localPath!, x.worktreePath)
        if (x.branch) await git(r.localPath!, ['branch', '-D', x.branch], { allowFail: true })
      }
    })
    await db.update(phase).set({ worktreePath: null }).where(eq(phase.projectId, projectId))
    await this.emit({ ...base, type: 'project.cleaned', payload: { worktrees: phases.filter((x) => x.worktreePath).length, integrationBranch: p.integrationBranch } })
  }

  /** On startup: reap stray agents, mark their runs interrupted, re-queue their phases, and resume running projects. */
  async recover() {
    const running = await db.select().from(project).where(eq(project.status, 'running'))
    const repos = await db.select().from(repo)
    const roots = repos.filter((q) => q.localPath).map((q) => `${q.localPath}-worktrees`)
    const reaped = await reapAgentProcesses(roots)
    const stuck = await db.select().from(phase).where(inArray(phase.status, ['running', 'merging', 'testing']))
    for (const x of stuck) {
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(and(eq(run.phaseId, x.id), eq(run.status, 'working')))
      await db.update(phase).set({ status: 'queued', heldReason: 'interrupted by a restart; will resume', updatedAt: new Date() }).where(eq(phase.id, x.id))
      const { base } = await this.context(x.projectId)
      await this.emit({ ...base, taskId: x.taskId, phaseId: x.id, type: 'phase.interrupted', payload: { was: x.status, reaped: reaped.filter((q) => x.worktreePath && q.cwd.startsWith(x.worktreePath)).map((q) => q.pid) } })
    }
    if (running.length) void this.dispatch()
    return { projects: running.length, phases: stuck.length, reaped: reaped.length }
  }

  /** On shutdown: abort live runs so the agents stop; recover() picks the phases up next start. */
  async shutdown() {
    for (const [, ac] of this.active) ac.abort()
    this.active.clear()
  }

  /**
   * Stop a project: abort its live runs, cancel every phase that hasn't landed, mark the project stopped (it stays on the
   * lists and the graph with what it landed; superseded is for a project another project replaced), remove its
   * worktrees. What landed stays on the integration branch (and in its PR, if one was opened).
   */
  async cancelProject(projectId: string, why = 'cancelled by a person') {
    const ctx = await this.context(projectId)
    const phases = await db.select().from(phase).where(eq(phase.projectId, projectId))
    const ids = phases.map((x) => x.id)
    const open = phases.filter((x) => x.status !== 'done')
    if (open.length) await db.update(phase).set({ status: 'cancelled', heldReason: why, updatedAt: new Date() }).where(inArray(phase.id, open.map((x) => x.id)))
    await db.update(project).set({ status: 'stopped' }).where(eq(project.id, projectId))
    for (const x of phases) { const ac = this.active.get(x.id); if (ac) { ac.abort(); this.active.delete(x.id) } } // after the status flip: a failed run then sees 'cancelled' and stops
    if (ids.length) await db.update(run).set({ status: 'stopped', endedAt: new Date(), error: why }).where(and(inArray(run.phaseId, ids), eq(run.status, 'working')))
    await this.emit({ ...ctx.base, type: 'project.cancelled', payload: { why, cancelled: open.length, landed: phases.length - open.length } })
    await this.cleanup(projectId).catch(() => {}) // a worktree with an agent mid-write may refuse once; recovery handles leftovers
    return { cancelled: open.length, landed: phases.length - open.length }
  }

  /** Plan a running project's next task, once: not if it is already planning, waiting for the model, or its last planning failed (a person plans it again). */
  private async planNext(projectId: string, taskId: string) {
    if (this.planningTasks.has(taskId)) return
    const [last] = await db.select().from(event).where(and(eq(event.taskId, taskId), inArray(event.type, ['task.planning', 'task.plan_waiting', 'task.planned', 'task.plan_failed']))).orderBy(desc(event.seq)).limit(1)
    const restarted = last?.type === 'task.plan_failed' && String((last.payload as any)?.error ?? '').includes('engine restarted') // a restart is not a failure: plan it again
    if (last && ['task.planning', 'task.plan_waiting', 'task.plan_failed'].includes(last.type) && !restarted) return
    this.planningTasks.add(taskId)
    try {
      const ctx = await preparePlanning(taskId, { actor: 'engine' })
      void finishPlanning(ctx, { propose: this.propose, onPlanned: () => void this.dispatch() }).finally(() => this.planningTasks.delete(taskId))
    } catch (err: any) {
      this.planningTasks.delete(taskId)
      await this.emit({ ...(await this.context(projectId)).base, taskId, type: 'task.plan_failed', payload: { error: String(err?.message ?? err) } })
    }
  }

  /**
   * A person retries a failed (or cancelled) phase: three more attempts, and the builder is told why the last one
   * failed. By default it continues in the same worktree with what the last attempt left; fresh starts over from
   * the project's branch. A stopped project resumes: it runs again, with its other cancelled phases queued too.
   */
  async retryPhase(phaseId: string, opts: { fresh?: boolean; actor?: string } = {}) {
    const [x] = await db.select().from(phase).where(eq(phase.id, phaseId))
    if (!x) throw new PlanError(`no phase ${phaseId}`)
    if (!['failed', 'cancelled'].includes(x.status)) throw new PlanError(`phase #${x.number} is ${x.status}; only a failed or cancelled phase can be retried`)
    const ctx = await this.context(x.projectId)
    const { p, a, r } = ctx
    if (!r) throw new PlanError(`app ${a.name} has no repo with a local path`)
    if (opts.fresh && (x.worktreePath || x.branch)) {
      await withLock(`git:${r.localPath}`, async () => {
        if (x.worktreePath) await removeWorktree(r.localPath!, x.worktreePath)
        if (x.branch) await git(r.localPath!, ['branch', '-D', x.branch], { allowFail: true })
      })
    }
    const requeue = { status: 'queued', heldReason: null, maxAttempts: x.attempt + 3, updatedAt: new Date(), ...(opts.fresh ? { worktreePath: null, branch: null } : {}) }
    await db.update(phase).set(requeue).where(eq(phase.id, phaseId))
    const resumed: number[] = []
    if (p.status !== 'running') {
      if (p.status === 'stopped') { // resume: the other cancelled phases come back too
        const others = (await db.select().from(phase).where(and(eq(phase.projectId, p.id), eq(phase.status, 'cancelled')))).filter((o) => o.id !== phaseId)
        for (const o of others) { await db.update(phase).set({ status: 'queued', heldReason: null, maxAttempts: o.attempt + 3, updatedAt: new Date() }).where(eq(phase.id, o.id)); resumed.push(o.number) }
      }
      await ensureBranch(r.localPath!, p.integrationBranch!, a.defaultBranch)
      await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    }
    await this.emit({ ...ctx.base, actor: opts.actor ?? 'user', taskId: x.taskId, phaseId, type: 'phase.status', payload: { from: x.status, to: 'queued', why: `retried by a person${opts.fresh ? ', from scratch' : ''}`, attempts: 3, resumed } })
    void this.dispatch()
    return { phase: x.number, fresh: !!opts.fresh, resumed }
  }

  /**
   * The project's PR (one per project), or a task's (stacked: against the task before it while that PR is open,
   * else main). Opened at the first landing, updated after every one.
   */
  private async updatePr(projectId: string, taskId?: string) {
    const { p, a, r, base } = await this.context(projectId)
    if (!r?.fullName) return
    const tasks = await db.select().from(task).where(eq(task.projectId, projectId)).orderBy(asc(task.position))
    const phases = await db.select().from(phase).where(eq(phase.projectId, projectId)).orderBy(asc(phase.position))
    const mine = taskId ? phases.filter((x) => x.taskId === taskId) : phases
    const done = mine.filter((x) => x.status === 'done')
    const runs = done.length ? await db.select().from(run).where(and(inArray(run.phaseId, done.map((x) => x.id)), eq(run.status, 'completed'))) : []
    const landed = done.map((x) => {
      const last = runs.filter((q) => q.phaseId === x.id).sort((q, w) => w.attempt - q.attempt)[0]
      const t = tasks.find((q) => q.id === x.taskId)
      return { number: x.number, title: `${x.title}${t && !taskId ? ` (task #${t.number}: ${t.title})` : ''}`, summary: last?.summary, costUsd: last?.costUsd ? Number(last.costUsd) : null, sha: null }
    })
    const backlog = taskId ? [] : await db.select().from(backlogItem).where(eq(backlogItem.projectId, projectId))
    const prs = await db.select().from(prTable).where(eq(prTable.projectId, projectId))
    const t = taskId ? tasks.find((q) => q.id === taskId)! : null
    const head = t ? taskBranch(p.integrationBranch!, t.number) : p.integrationBranch!
    const stack = t ? stackBase(a.defaultBranch, t, tasks, prs) : { base: a.defaultBranch, on: null }
    const k = t ? tasks.findIndex((q) => q.id === t.id) + 1 : 0
    const title = t ? `${t.title} (${p.title}, ${k} of ${tasks.length})` : p.title
    const intro = t ? { ...p, title: `${p.title}, task ${k} of ${tasks.length}: ${t.title}`, spec: [t.description, stack.on ? `Stacked on #${stack.on}: review and merge that one first; this PR then retargets to ${a.defaultBranch}.` : null].filter(Boolean).join('\n\n') || p.spec } : p
    const body = prBody(intro, landed, mine.filter((x) => x.status !== 'done').map((x) => ({ number: x.number, title: x.title })), backlog)
    const result = await ensureProjectPr({ repoPath: r.localPath!, fullName: r.fullName, integrationBranch: head, base: stack.base, title, body })
    const existing = prs.find((q) => (taskId ? q.taskId === taskId : !q.taskId))
    if (!existing) await db.insert(prTable).values({ id: newId('pr'), appId: a.id, projectId, taskId: taskId ?? null, repoId: r.id, number: result.number, url: result.url, headBranch: head, baseBranch: stack.base, status: 'open', openedAt: new Date() })
    else if (existing.baseBranch !== stack.base) await db.update(prTable).set({ baseBranch: stack.base }).where(eq(prTable.id, existing.id))
    await this.emit({ ...base, ...(taskId ? { taskId } : {}), type: result.created ? 'pr.opened' : 'pr.updated', payload: { number: result.number, url: result.url, landed: landed.length, base: stack.base } })
  }

  private async context(projectId: string) {
    const [p] = await db.select().from(project).where(eq(project.id, projectId))
    if (!p) throw new PlanError(`no project ${projectId}`)
    const [a] = await db.select().from(app).where(eq(app.id, p.appId))
    const [r] = await db.select().from(repo).where(eq(repo.appId, a.id))
    const base: Omit<NewEvent, 'type'> = { workspaceId: a.workspaceId, appId: a.id, projectId, actor: 'engine' }
    return { p, a, r: r?.localPath ? r : null, base }
  }

  private emit(e: NewEvent) {
    return db.transaction((tx) => appendEvent(tx, e))
  }
}

export const runner = new Runner()
