/**
 * The runner: starts projects, dispatches ready sub-issues into worktrees and agent runs (as many as the cap allows,
 * across every running project), lands what finishes one at a time per project, retries what doesn't, keeps each
 * project's PR current, cleans up when a project lands, and recovers after a restart. One process; all state in Postgres.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, build, event, issue, project, pr as prTable, repo, run, step } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { addItems, laterFrom } from './backlog.js'
import { runTask, type Execute } from './executor.js'
import { addWorktree, branchExists, ensureBranch, git, headSha, removeWorktree } from './git.js'
import { issueBranch, issueStart, landingBranch, prMode, stackBase } from './branches.js'
import { newId } from './ids.js'
import { identifier, setState } from './issues.js'
import { land, withLock } from './landing.js'
import { ensureProjectPr, prBody } from './pr.js'
import { projectGraph, PlanError, setBuild, tickAll, type Graph } from './projects.js'
import { finishPlanning, preparePlanning, type Propose } from './planner.js'
import { reapAgentProcesses } from './reap.js'
import { holdMinutes, isOutage } from './outage.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number; storybook_url?: string; storybook_cmd?: string }

const PLANNING = ['issue.planning', 'issue.plan_waiting', 'issue.planned', 'issue.plan_failed']

export class Runner {
  private active = new Map<string, AbortController>() // sub-issue id → abort for its live run
  private interrupting = new Set<string>() // builds a pause is stopping on purpose: their run's end is not a failure
  /** The engine holds all dispatch while the model is unavailable; it tries again at `until`, backing off. */
  hold: { until: Date; reason: string; level: number } | null = null
  private outages = 0
  private holdTimer: NodeJS.Timeout | undefined
  private execute: Execute
  private sessionsMax: number

  private propose: Propose | undefined // the planner, for planning a project's next issue; the real one unless a test gives one
  private planningIssues = new Set<string>()
  private backlogWaits = new Set<string>() // project.backlog_open said once per set of open issues

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
    if (!g.subIssues.length) throw new PlanError('this project has nothing planned yet; plan its tasks first')
    // From main as it is on GitHub when there is a remote (a teammate may have merged since the local main was pulled).
    const fetched = (await git(r.localPath!, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })).code === 0
    const sha = await ensureBranch(r.localPath!, p.integrationBranch!, fetched ? `origin/${a.defaultBranch}` : a.defaultBranch)
    await db.update(project).set({ status: 'running', startDate: p.startDate ?? new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(project.id, projectId))
    await this.emit({ ...ctx.base, type: 'project.started', payload: { integrationBranch: p.integrationBranch, from: a.defaultBranch, sha } })
    void this.dispatch()
    return { integrationBranch: p.integrationBranch, sha }
  }

  /**
   * One dispatch pass across every running project, serialized: one tick for all of them, launch whatever became
   * ready wherever it is, and close any project whose sub-issues have all landed. Sub-issues from different projects
   * build at once; ones that share a file never do.
   */
  dispatch(): Promise<void> {
    return withLock('dispatch', async () => {
      if (this.hold && this.hold.until.getTime() > Date.now()) return // waiting for the model; the timer dispatches when the hold ends
      const room = Math.max(0, this.sessionsMax - this.active.size)
      await tickAll(room)
      const running = await db.select().from(project).where(eq(project.status, 'running'))
      for (const p of running) {
        const g = (await projectGraph(p.id))!
        for (const x of g.subIssues) {
          if (x.status === 'ready' && !this.active.has(x.id)) {
            this.active.set(x.id, new AbortController())
            this.launch(x.id, p.id).catch(async (err) => {
              this.active.delete(x.id)
              await this.emit({ ...(await this.context(p.id)).base, issueId: x.id, type: 'build.error', payload: { error: String(err?.message ?? err) } })
            })
          }
        }
        // A project runs issue by issue: when every sub-issue of the issues before it has landed, the next unplanned
        // issue is planned (the planner reads the code that just landed) and its sub-issues join the graph. The project
        // lands only when every issue is planned and everything planned has landed.
        const work = g.issues.filter((t) => t.state !== 'canceled')
        const pos = new Map(work.map((t) => [t.id, t.sortOrder]))
        const live = g.subIssues.filter((x) => x.status !== 'cancelled' && pos.has(x.parentId!))
        const unplanned = work.filter((t) => !t.subIssueIds.length).sort((a, b) => a.sortOrder - b.sortOrder)
        const next = unplanned[0]
        if (next && live.filter((x) => (pos.get(x.parentId!) ?? 0) < next.sortOrder).every((x) => x.status === 'done')) await this.planNext(p.id, next.id)
        const allDone = !unplanned.length && live.length > 0 && live.every((x) => x.status === 'done')
        const openItems = g.backlog.filter((i) => ['backlog', 'triage'].includes(i.state))
        if (allDone && openItems.length) {
          // The work is done but the backlog is not: the project waits for a person to take on or drop what is left.
          const key = `${p.id}:${openItems.map((i) => i.id).join(',')}`
          if (!this.backlogWaits.has(key)) { this.backlogWaits.add(key); await this.emit({ ...(await this.context(p.id)).base, type: 'project.backlog_open', payload: { open: openItems.length, items: openItems.map((i) => i.title).slice(0, 10) } }) }
        } else if (allDone) {
          await db.update(project).set({ status: 'landed', updatedAt: new Date() }).where(eq(project.id, p.id))
          await this.emit({ ...(await this.context(p.id)).base, type: 'project.landed', payload: {} })
          await this.cleanup(p.id)
        }
      }
    })
  }

  private async launch(subId: string, projectId: string) {
    const ctx = await this.context(projectId)
    const { p, a, r, base } = ctx
    const setup = (a.setup ?? {}) as AppSetup
    const g = (await projectGraph(projectId))!
    const x = g.subIssues.find((q) => q.id === subId)!
    const t = g.issues.find((q) => q.id === x.parentId)!
    const branch = x.branch ?? `sub/${p.id}/${x.identifier.toLowerCase()}`
    const worktreePath = x.worktreePath ?? join(`${r!.localPath}-worktrees`, `${p.id}--${x.identifier.toLowerCase()}`)
    const pb = { ...base, issueId: subId }
    const mode = prMode(a.setup)
    const onto = landingBranch(mode, p.integrationBranch!, t) // the project's branch, or the issue's own (stacked PRs)
    // Worktree and branch creation touch the repo's refs: one at a time per repo. A failure here is an attempt too.
    let baseSha: string
    try {
      baseSha = await withLock(`git:${r!.localPath}`, async () => {
        if (mode === 'issue' && !(await branchExists(r!.localPath!, onto))) { // an issue's branch starts where the issue before it ended
          const existing = new Set<string>()
          for (const q of g.issues) { const b = issueBranch(p.integrationBranch!, q.identifier); if (await branchExists(r!.localPath!, b)) existing.add(b) }
          await git(r!.localPath!, ['branch', onto, issueStart(p.integrationBranch!, t, g.issues, existing)])
        }
        await addWorktree(r!.localPath!, worktreePath, branch, onto)
        return headSha(r!.localPath!, onto)
      })
    } catch (err: any) {
      const attempt = x.attempt + 1
      await db.update(build).set({ attempt, branch, worktreePath, updatedAt: new Date() }).where(eq(build.issueId, subId))
      return this.failed(subId, attempt, x.maxAttempts, `could not prepare the worktree: ${err?.message ?? err}`, pb)
    }

    const [interrupted] = await db.select().from(run).where(and(eq(run.issueId, subId), eq(run.status, 'interrupted'))).orderBy(desc(run.attempt)).limit(1)
    const previousFailure = await this.lastFailure(subId)
    const attempt = x.attempt + 1
    const runId = newId('run')
    await db.insert(run).values({ id: runId, appId: a.id, issueId: subId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    await db.transaction((tx) => setBuild(tx, subId, { status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null }, { runId, payload: { attempt, branch, worktreePath, resumes: interrupted?.agentSessionId ?? null } }))
    const rb = { ...pb, runId }

    const result = await this.execute({
      subIssue: { id: x.id, identifier: x.identifier, title: x.title, brief: x.brief }, issue: { identifier: t.identifier, title: t.title, brief: t.brief },
      worktreePath, branch, files: x.files, testCmd: setup.test_cmd, storybook: !!(setup.storybook_url || setup.storybook_cmd), previousFailure, model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
      resumeSessionId: interrupted?.agentSessionId ?? undefined, abort: this.active.get(subId),
      onEvent: async (type, payload) => {
        if (type === 'run.steps') await this.saveSteps(a.id, subId, runId, (payload.steps as { text: string; status: string }[]) ?? [])
        await this.emit({ ...rb, actor: `agent:${runId}`, type, payload })
      },
    })
    await db.update(run).set({
      status: result.status, endedAt: new Date(), agentSessionId: result.agentSessionId ?? null,
      costUsd: result.costUsd?.toString() ?? null, summary: result.summary ?? null, error: result.error ?? null,
    }).where(eq(run.id, runId))

    if (this.interrupting.has(subId)) { // paused on purpose: the run resumes from its session later
      this.interrupting.delete(subId); this.active.delete(subId)
      await db.update(run).set({ status: 'interrupted', error: 'paused' }).where(eq(run.id, runId))
      return
    }
    if (result.status !== 'completed' && isOutage(result.error)) return this.outage(subId, runId, result.error!, rb)
    if (result.status === 'completed' && this.outages) { this.outages = 0; this.hold = null; await this.emit({ ...base, type: 'engine.resumed', payload: {} }) }
    if (result.status !== 'completed') return this.failed(subId, attempt, x.maxAttempts, `the run ${result.error ?? 'failed'}`, rb)

    await db.transaction((tx) => setBuild(tx, subId, { status: 'merging' }, { runId }))
    const landed = await withLock(`land:${projectId}`, () => land({
      repoPath: r!.localPath!, worktreePath, integrationBranch: onto, testCmd: setup.test_cmd,
      onEvent: async (type, payload) => { await this.emit({ ...rb, type, payload }) },
    }))
    if (!landed.ok) return this.failed(subId, attempt, x.maxAttempts, `landing failed at ${landed.stage}: ${landed.detail}`, rb)

    await db.transaction((tx) => setBuild(tx, subId, { status: 'done' }, { runId, payload: { sha: landed.sha } }))
    const later = laterFrom(result.summary) // what the builder noticed and left for later joins the backlog, once its work has landed
    if (later.length) await addItems(projectId, later.map((text) => ({ text, source: 'builder' as const, sourceRef: { issueId: subId, runId } })), `agent:${runId}`).catch((err) => this.emit({ ...rb, type: 'backlog.error', payload: { error: String(err?.message ?? err) } }))
    await withLock(`land:${projectId}`, () => this.updatePr(projectId, mode === 'issue' ? x.parentId! : undefined)).catch((err) => this.emit({ ...rb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    this.active.delete(subId)
    await this.dispatch()
  }

  /** The builder's todo list, as the sub-issue's steps: the latest list replaces the previous one for this run. */
  private async saveSteps(appId: string, issueId: string, runId: string, steps: { text: string; status: string }[]) {
    const allowed = new Set(['pending', 'in_progress', 'completed'])
    await db.transaction(async (tx) => {
      await tx.delete(step).where(and(eq(step.issueId, issueId), eq(step.runId, runId)))
      const rows = steps.filter((s) => s.text).map((s, i) => ({ appId, issueId, runId, position: i, text: s.text.slice(0, 500), status: allowed.has(s.status) ? s.status : 'pending' }))
      if (rows.length) await tx.insert(step).values(rows)
    })
  }

  private async failed(subId: string, attempt: number, max: number, why: string, pb: Omit<NewEvent, 'type'>) {
    const [current] = await db.select({ status: build.status }).from(build).where(eq(build.issueId, subId))
    if (current?.status === 'cancelled') { this.active.delete(subId); return } // the project was cancelled under this run; nothing to retry
    const again = attempt < max
    await db.transaction((tx) => setBuild(tx, subId, { status: again ? 'queued' : 'failed', heldReason: again ? `attempt ${attempt} failed; will retry` : why.slice(0, 500) },
      { runId: pb.runId ?? undefined, type: again ? 'build.retry' : 'build.failed', payload: { attempt, max, why: why.slice(0, 2000) } }))
    this.active.delete(subId)
    await this.dispatch()
  }

  /** The model or account is unavailable: not the sub-issue's fault. Give the attempt back, queue it to resume, hold the engine. */
  private async outage(subId: string, runId: string, error: string, pb: Omit<NewEvent, 'type'>) {
    const [b] = await db.select().from(build).where(eq(build.issueId, subId))
    await db.update(run).set({ status: 'interrupted', error: `outage: ${error.slice(0, 400)}` }).where(eq(run.id, runId))
    const minutes = holdMinutes(this.outages)
    this.outages++
    const until = new Date(Date.now() + minutes * 60_000)
    this.hold = { until, reason: error.slice(0, 200), level: this.outages }
    await db.transaction((tx) => setBuild(tx, subId, { status: 'queued', attempt: Math.max(0, (b?.attempt ?? 1) - 1), heldReason: `waiting for the model (${error.slice(0, 80)}); trying again at ${until.toTimeString().slice(0, 5)}` }))
    await this.emit({ ...pb, type: 'engine.hold', payload: { reason: error.slice(0, 400), minutes, until: until.toISOString(), level: this.outages } })
    this.active.delete(subId)
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

  private async builds(projectId: string, status?: string) {
    const rows = await db.select({ b: build, i: issue }).from(build).innerJoin(issue, eq(issue.id, build.issueId)).where(status ? and(eq(issue.projectId, projectId), eq(build.status, status)) : eq(issue.projectId, projectId))
    return rows.map((r) => ({ ...r.b, number: r.i.number, parentId: r.i.parentId }))
  }

  /**
   * Pause a project: nothing new starts; running agents are stopped but keep their worktrees and conversations; a
   * sub-issue that is landing finishes landing. Resume picks each stopped one up from its session.
   */
  async pauseProject(projectId: string, actor = 'user') {
    const ctx = await this.context(projectId)
    if (ctx.p.status !== 'running') throw new PlanError(`project is ${ctx.p.status}; only a running project can be paused`)
    await db.update(project).set({ status: 'paused', updatedAt: new Date() }).where(eq(project.id, projectId))
    const live = await this.builds(projectId, 'running')
    for (const x of live) {
      this.interrupting.add(x.issueId)
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'paused' }).where(and(eq(run.issueId, x.issueId), eq(run.status, 'working')))
      await db.transaction((tx) => setBuild(tx, x.issueId, { status: 'queued', heldReason: 'paused; will resume where it stopped' }))
      this.active.get(x.issueId)?.abort()
    }
    await this.emit({ ...ctx.base, actor, type: 'project.paused', payload: { interrupted: live.map((x) => x.number) } })
    return { paused: true, interrupted: live.map((x) => x.number) }
  }

  async resumeProject(projectId: string, actor = 'user') {
    const ctx = await this.context(projectId)
    if (ctx.p.status !== 'paused') throw new PlanError(`project is ${ctx.p.status}; only a paused project can be resumed`)
    await db.update(project).set({ status: 'running', updatedAt: new Date() }).where(eq(project.id, projectId))
    const queued = await this.builds(projectId, 'queued')
    if (queued.length) await db.update(build).set({ heldReason: null, updatedAt: new Date() }).where(inArray(build.issueId, queued.map((x) => x.issueId)))
    await this.emit({ ...ctx.base, actor, type: 'project.resumed', payload: {} })
    void this.dispatch()
    return { resumed: true }
  }

  /** The last failure reason comes from the log, so it survives a restart. (A landed sub-issue never retries again.) */
  private async lastFailure(subId: string): Promise<string | undefined> {
    const [e] = await db.select().from(event).where(and(eq(event.issueId, subId), inArray(event.type, ['build.retry', 'build.failed']))).orderBy(desc(event.seq)).limit(1)
    return e ? String((e.payload as any).why ?? '') : undefined
  }

  /** After a project lands: remove its worktrees and local build branches. The integration branch stays (it's the PR). */
  private async cleanup(projectId: string) {
    const { p, r, base } = await this.context(projectId)
    if (!r) return
    const builds = await this.builds(projectId)
    await withLock(`git:${r.localPath}`, async () => {
      for (const x of builds) {
        if (x.worktreePath) await removeWorktree(r.localPath!, x.worktreePath)
        if (x.branch) await git(r.localPath!, ['branch', '-D', x.branch], { allowFail: true })
      }
    })
    if (builds.length) await db.update(build).set({ worktreePath: null }).where(inArray(build.issueId, builds.map((x) => x.issueId)))
    await this.emit({ ...base, type: 'project.cleaned', payload: { worktrees: builds.filter((x) => x.worktreePath).length, integrationBranch: p.integrationBranch } })
  }

  /** On startup: reap stray agents, mark their runs interrupted, re-queue their builds, and resume running projects. */
  async recover() {
    const running = await db.select().from(project).where(eq(project.status, 'running'))
    const repos = await db.select().from(repo)
    const roots = repos.filter((q) => q.localPath).map((q) => `${q.localPath}-worktrees`)
    const reaped = await reapAgentProcesses(roots)
    const stuck = await db.select().from(build).where(inArray(build.status, ['running', 'merging', 'testing']))
    for (const x of stuck) {
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(and(eq(run.issueId, x.issueId), eq(run.status, 'working')))
      await db.transaction((tx) => setBuild(tx, x.issueId, { status: 'queued', heldReason: 'interrupted by a restart; will resume' },
        { type: 'build.interrupted', payload: { was: x.status, reaped: reaped.filter((q) => x.worktreePath && q.cwd.startsWith(x.worktreePath)).map((q) => q.pid) } }))
    }
    if (running.length) void this.dispatch()
    return { projects: running.length, builds: stuck.length, reaped: reaped.length }
  }

  /** On shutdown: abort live runs so the agents stop; recover() picks the builds up next start. */
  async shutdown() {
    for (const [, ac] of this.active) ac.abort()
    this.active.clear()
  }

  /**
   * Stop a project: abort its live runs, cancel every build that hasn't landed (and the issues they belong to), mark
   * the project stopped (it stays on the lists and the graph with what it landed; superseded is for a project another
   * project replaced), remove its worktrees. What landed stays on the integration branch, and in its PR if one opened.
   */
  async cancelProject(projectId: string, why = 'cancelled by a person') {
    const ctx = await this.context(projectId)
    const builds = await this.builds(projectId)
    const open = builds.filter((x) => x.status !== 'done')
    await db.transaction(async (tx) => { for (const x of open) await setBuild(tx, x.issueId, { status: 'cancelled', heldReason: why }) })
    await db.update(project).set({ status: 'stopped', updatedAt: new Date() }).where(eq(project.id, projectId))
    for (const x of builds) { const ac = this.active.get(x.issueId); if (ac) { ac.abort(); this.active.delete(x.issueId) } } // after the status flip: a failed run then sees 'cancelled' and stops
    if (builds.length) await db.update(run).set({ status: 'stopped', endedAt: new Date(), error: why }).where(and(inArray(run.issueId, builds.map((x) => x.issueId)), eq(run.status, 'working')))
    await this.emit({ ...ctx.base, type: 'project.cancelled', payload: { why, cancelled: open.length, landed: builds.length - open.length } })
    await this.cleanup(projectId).catch(() => {}) // a worktree with an agent mid-write may refuse once; recovery handles leftovers
    return { cancelled: open.length, landed: builds.length - open.length }
  }

  /** Plan a running project's next issue, once: not if it is already planning, waiting for the model, or its last planning failed (a person plans it again). */
  private async planNext(projectId: string, issueId: string) {
    if (this.planningIssues.has(issueId)) return
    const [t] = await db.select({ approved: issue.briefApprovedBy }).from(issue).where(eq(issue.id, issueId))
    if (!t?.approved) return // the brief waits for a person's approval; planning starts on the next pass after it
    const [last] = await db.select().from(event).where(and(eq(event.issueId, issueId), inArray(event.type, PLANNING))).orderBy(desc(event.seq)).limit(1)
    const restarted = last?.type === 'issue.plan_failed' && String((last.payload as any)?.error ?? '').includes('engine restarted') // a restart is not a failure: plan it again
    if (last && ['issue.planning', 'issue.plan_waiting', 'issue.plan_failed'].includes(last.type) && !restarted) return
    this.planningIssues.add(issueId)
    try {
      const ctx = await preparePlanning(issueId, { actor: 'engine' })
      void finishPlanning(ctx, { propose: this.propose, onPlanned: () => void this.dispatch() }).finally(() => this.planningIssues.delete(issueId))
    } catch (err: any) {
      this.planningIssues.delete(issueId)
      await this.emit({ ...(await this.context(projectId)).base, issueId, type: 'issue.plan_failed', payload: { error: String(err?.message ?? err) } })
    }
  }

  /**
   * A person retries a failed (or cancelled) sub-issue: three more attempts, and the builder is told why the last one
   * failed. By default it continues in the same worktree with what the last attempt left; fresh starts over from
   * the project's branch. A stopped project resumes: it runs again, with its other cancelled builds queued too.
   */
  async retry(subId: string, opts: { fresh?: boolean; actor?: string } = {}) {
    const [b] = await db.select().from(build).where(eq(build.issueId, subId))
    const [x] = await db.select().from(issue).where(eq(issue.id, subId))
    if (!b || !x?.projectId) throw new PlanError(`no build for ${subId}`)
    const ctx = await this.context(x.projectId)
    const { p, a, r } = ctx
    const name = identifier(a.key, x.number)
    if (!['failed', 'cancelled'].includes(b.status)) throw new PlanError(`${name} is ${b.status}; only a failed or cancelled build can be retried`)
    if (!r) throw new PlanError(`app ${a.name} has no repo with a local path`)
    if (opts.fresh && (b.worktreePath || b.branch)) {
      await withLock(`git:${r.localPath}`, async () => {
        if (b.worktreePath) await removeWorktree(r.localPath!, b.worktreePath)
        if (b.branch) await git(r.localPath!, ['branch', '-D', b.branch], { allowFail: true })
      })
    }
    const resumed: number[] = []
    await db.transaction(async (tx) => {
      const parent = x.parentId ? await tx.select().from(issue).where(eq(issue.id, x.parentId)) : []
      if (parent[0]?.state === 'canceled') await setState(tx, parent[0], 'in_progress', { actor: opts.actor ?? 'user' }) // the issue comes back with it
      await setBuild(tx, subId, { status: 'queued', heldReason: null, maxAttempts: b.attempt + 3, ...(opts.fresh ? { worktreePath: null, branch: null } : {}) },
        { actor: opts.actor ?? 'user', payload: { why: `retried by a person${opts.fresh ? ', from scratch' : ''}`, attempts: 3 } })
      if (p.status === 'stopped') { // resume: the other cancelled builds come back too
        const others = (await this.builds(p.id, 'cancelled')).filter((o) => o.issueId !== subId)
        for (const o of others) { await setBuild(tx, o.issueId, { status: 'queued', heldReason: null, maxAttempts: o.attempt + 3 }); resumed.push(o.number) }
        const canceledParents = await tx.select().from(issue).where(and(eq(issue.projectId, p.id), eq(issue.state, 'canceled'), eq(issue.kind, 'code')))
        for (const q of canceledParents.filter((q) => !q.parentId && others.some((o) => o.parentId === q.id))) await setState(tx, q, 'in_progress', { actor: opts.actor ?? 'user' })
      }
    })
    if (p.status !== 'running') {
      await ensureBranch(r.localPath!, p.integrationBranch!, a.defaultBranch)
      await db.update(project).set({ status: 'running', updatedAt: new Date() }).where(eq(project.id, p.id))
    }
    void this.dispatch()
    return { identifier: name, fresh: !!opts.fresh, resumed }
  }

  /**
   * The project's PR (one per project), or an issue's (stacked: against the issue before it while that PR is open,
   * else main). Opened at the first landing, updated after every one.
   */
  private async updatePr(projectId: string, issueId?: string) {
    const { p, a, r, base } = await this.context(projectId)
    if (!r?.fullName) return
    const g: Graph = (await projectGraph(projectId))!
    const mine = issueId ? g.subIssues.filter((x) => x.parentId === issueId) : g.subIssues
    const done = mine.filter((x) => x.status === 'done')
    const runs = done.length ? await db.select().from(run).where(and(inArray(run.issueId, done.map((x) => x.id)), eq(run.status, 'completed'))) : []
    const landed = done.map((x) => {
      const last = runs.filter((q) => q.issueId === x.id).sort((q, w) => w.attempt - q.attempt)[0]
      const t = g.issues.find((q) => q.id === x.parentId)
      return { identifier: x.identifier, title: `${x.title}${t && !issueId ? ` (${t.identifier}: ${t.title})` : ''}`, summary: last?.summary, costUsd: last?.costUsd ? Number(last.costUsd) : null, sha: null }
    })
    const prs = await db.select().from(prTable).where(eq(prTable.projectId, projectId))
    const issues = g.issues.filter((q) => q.state !== 'canceled')
    const t = issueId ? issues.find((q) => q.id === issueId)! : null
    const head = t ? issueBranch(p.integrationBranch!, t.identifier) : p.integrationBranch!
    const stack = t ? stackBase(a.defaultBranch, t, issues, prs) : { base: a.defaultBranch, on: null }
    const k = t ? issues.findIndex((q) => q.id === t.id) + 1 : 0
    const title = t ? `${t.identifier} ${t.title} (${p.name}, ${k} of ${issues.length})` : p.name
    const intro = t ? { ...p, name: `${p.name}, task ${k} of ${issues.length}: ${t.identifier} ${t.title}`, content: [t.description, stack.on ? `Stacked on #${stack.on}: review and merge that one first; this PR then retargets to ${a.defaultBranch}.` : null].filter(Boolean).join('\n\n') || p.content } : p
    const body = prBody(intro, landed, mine.filter((x) => x.status !== 'done' && x.status !== 'cancelled').map((x) => ({ identifier: x.identifier, title: x.title })), issueId ? [] : g.backlog)
    const result = await ensureProjectPr({ repoPath: r.localPath!, fullName: r.fullName, integrationBranch: head, base: stack.base, title, body })
    const existing = prs.find((q) => (issueId ? q.issueId === issueId : !q.issueId))
    if (!existing) await db.insert(prTable).values({ id: newId('pr'), appId: a.id, projectId, issueId: issueId ?? null, repoId: r.id, number: result.number, url: result.url, headBranch: head, baseBranch: stack.base, status: 'open', openedAt: new Date() })
    else if (existing.baseBranch !== stack.base) await db.update(prTable).set({ baseBranch: stack.base }).where(eq(prTable.id, existing.id))
    await this.emit({ ...base, ...(issueId ? { issueId } : {}), type: result.created ? 'pr.opened' : 'pr.updated', payload: { number: result.number, url: result.url, landed: landed.length, base: stack.base } })
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
