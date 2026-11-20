/**
 * The runner: starts projects, dispatches ready sub-issues into worktrees and agent runs (as many as the cap allows,
 * across every running project), lands what finishes one at a time per project, retries what doesn't, keeps each
 * project's PR current, cleans up when a project lands, and recovers after a restart. One process; all state in Postgres.
 */
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, build, event, issue, project, pr as prTable, repo, run, step } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { appendEvent, type NewEvent } from './events.js'
import { runTask, type Execute } from './executor.js'
import { addWorktree, branchExists, ensureBranch, git, headSha, removeWorktree } from './git.js'
import { storiesLead } from './storybook.js'
import { branchOf, issueBranch, issueStart, landingBranch, modeOf, stackBase } from './branches.js'
import { newId } from './ids.js'
import { commentOnIssue, identifier, setState } from './issues.js'
import { commandRun, land, wholeRun, withLock } from './landing.js'
import { agentProbes, builderHeld, commandFixBrief, commandProbes, leftTo, reviewerSkills, nextProbe, PROBE_FIX_TITLE, PROBE_PREFIX, probeBrief, probeFixBrief, probeOfTitle, probesOf, probeTitle, resultOf, TESTS_KEY, withResult, BUILT_IN, type ProbeResult } from './probes.js'
import { skillOptions } from './skills.js'
import { guideTasks, mergeGuide, mergeRecord } from './merge-guide.js'
import { acceptanceOf, setAcceptance } from './acceptance.js'
import { unchecked, afterBuild, CHECK_TITLE, checkTaskBrief, finishBrief, FINISH_TITLE, MAX_ROUNDS, numbered, OLD_PROBE_TITLE, readVerdicts, reqId, requirementsChecked, unmetOf, verdictChange } from './verify.js'
import { inForce, type Covered } from './requirements.js'
import { smokeOwed , smokeSetups } from './smoke.js'
import { ONE_GO_TITLE } from './planner.js'
import { workflowFor } from './work.js'
import { ensureProjectPr, prDraft, prTitle, prBody , prAuto } from './pr.js'
import { addSubTask, projectGraph, PlanError, setBuild, tickAll, type Graph } from './projects.js'
import { finishPlanning, preparePlanning, type Propose } from './planner.js'
import { BEFORE_PLAN, checksOwed, styleOf } from './steps.js'
import { stepsOf } from './work.js'
import { reapAgentProcesses } from './reap.js'
import { holdMinutes, isOutage } from './outage.js'
import { referencesOf } from './references.js'
import { settleProject } from './close.js'
import { branchName, commitRule, installCommitCheck, ticketOf } from './conventions.js'

/** The team's own ticket id for a task, when it came from their tracker; null when it is only ours. */
const teamTicket = (t: { sourceRef?: unknown }) => (t.sourceRef as { linear?: { identifier?: string } } | null | undefined)?.linear?.identifier ?? null

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

/** The sub-task added when a task's whole test run fails; counted by its title. */
export const FIX_TITLE = 'Fix what the whole test run found'
/** A check or a probe: it only looks, so it has no tool that edits and what it leaves is thrown away. */
export const onlyLooks = (title: string) => title.startsWith(CHECK_TITLE) || title.startsWith(PROBE_PREFIX)
const MAX_FIXES = 2
export const fixBrief = (testCmd: string, detail: string) => [
  'Every sub-task of this task is merged, and the app\'s whole test run then failed (twice in a row). Nothing has been blamed yet.',
  '',
  '1. Find the cause first. Which test fails, and which merged change broke it (git log on this branch)? Run the failing test alone.',
  '2. Fix the cause. If the test also fails on the default branch, or passes when run alone and fails only in the whole run, it is an unreliable test: make it reliable, and say so in your summary.',
  `3. Run the whole suite before you finish; this sub-task is the one that does: ${testCmd}`,
  '',
  'What the run said:',
  '```', detail, '```',
].join('\n')

interface AppSetup { test_cmd?: string; probes?: unknown; model?: string; max_budget_usd?: number; max_turns?: number }

/**
 * A build that runs out of turns carries on; it is not a failure (Bonkei's agent, 2026-11-17, on BON-113: the engine
 * "retries the same sub-task with a fresh agent, which uses up one of its 3 attempts and has to work out from
 * scratch what was already done"). The limit was set for small sub-tasks; a task built in one go is the whole task
 * in one run. So: the same agent is resumed, in its own conversation, with everything it had worked out; the
 * attempt is given back; and a run that is the whole task starts with more turns. Three times at most, then it is
 * a failure like any other.
 */
export const ranOutOfTurns = (error: string | null | undefined) => !!error && /maximum number of turns|max[_ ]turns/i.test(error)
export const MAX_CARRY_ONS = 3
const OUT_OF_TURNS = 'out of turns'
/** How many turns a run starts with, when the app has not said: more for one that is the whole task, or that reads all of it. */
export const turnsFor = (title: string, setup: { max_turns?: number }) => setup.max_turns ?? (title === ONE_GO_TITLE ? 200 : [CHECK_TITLE, FINISH_TITLE, OLD_PROBE_TITLE, PROBE_PREFIX, PROBE_FIX_TITLE, FIX_TITLE].some((t) => title.startsWith(t)) ? 120 : undefined)

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

  private openPr: typeof ensureProjectPr
  constructor(opts: { execute?: Execute; sessionsMax?: number; propose?: Propose; /** What opens or updates a pull request: GitHub's, unless a test stands in for it. */ openPr?: typeof ensureProjectPr } = {}) {
    this.openPr = opts.openPr ?? ensureProjectPr
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
    await db.update(project).set({ status: 'running', prMode: modeOf(p, a.setup), startDate: p.startDate ?? new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(project.id, projectId))
    await this.emit({ ...ctx.base, type: 'project.started', payload: { integrationBranch: p.integrationBranch, from: a.defaultBranch, sha } })
    void this.dispatch()
    return { integrationBranch: p.integrationBranch, sha }
  }

  /**
   * Build one task, with nothing more to press (Sandy, 2026-11-14: "it should all just be automated from that point
   * forward"): plan it if it has no sub-tasks, then start its build. Called when the task's brief is approved. The
   * task's project (its own hidden one when it is in none) is only where the engine keeps the build; nobody runs it.
   * A task that is already planned just starts. Planning that fails or asks a question says so on the task as before.
   */
  async buildTask(issueId: string, actor = 'engine'): Promise<{ planning: boolean; started: boolean }> {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    const planned = (await db.select({ id: issue.id }).from(issue).where(and(eq(issue.parentId, issueId), eq(issue.kind, 'code'), notInArray(issue.state, ['canceled', 'duplicate'])))).length > 0
    if (planned) return { planning: false, started: await this.startIfWaiting(t.projectId) }
    if (this.planningIssues.has(issueId)) return { planning: true, started: false }
    this.planningIssues.add(issueId)
    try {
      const ctx = await preparePlanning(issueId, { actor })
      void finishPlanning(ctx, { propose: this.propose, onPlanned: () => void this.startIfWaiting(ctx.projectId).catch(() => {}) }).finally(() => this.planningIssues.delete(issueId))
      return { planning: true, started: false }
    } catch (err) { this.planningIssues.delete(issueId); throw err }
  }

  /**
   * Plan one task and stop there: cut it into sub-tasks without starting its build. For the line after a prototype,
   * where the plan is read (the blast radius, the audit) before anything is built. Once only: not while it is being
   * planned, not if it is planned, and not again by itself after a planning that failed (a person plans it again).
   */
  async planTask(issueId: string, after?: () => void, actor = 'engine'): Promise<'planning' | 'planned' | 'failed' | 'waiting'> {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    if (!t.briefApprovedBy) return 'waiting'
    if ((await db.select({ id: issue.id }).from(issue).where(and(eq(issue.parentId, issueId), eq(issue.kind, 'code'), notInArray(issue.state, ['canceled', 'duplicate'])))).length > 0) return 'planned'
    if (this.planningIssues.has(issueId)) return 'planning'
    const [last] = await db.select().from(event).where(and(eq(event.issueId, issueId), inArray(event.type, PLANNING))).orderBy(desc(event.seq)).limit(1)
    const restarted = last?.type === 'issue.plan_failed' && String((last.payload as any)?.error ?? '').includes('engine restarted')
    if (last && ['issue.planning', 'issue.plan_waiting'].includes(last.type)) return 'planning'
    if (last?.type === 'issue.plan_failed' && !restarted) return 'failed'
    this.planningIssues.add(issueId)
    try {
      const ctx = await preparePlanning(issueId, { actor })
      void finishPlanning(ctx, { propose: this.propose, onPlanned: () => { after?.() } }).finally(() => this.planningIssues.delete(issueId))
      return 'planning'
    } catch (err) { this.planningIssues.delete(issueId); throw err }
  }

  /** Start a project's build if it is planned and nobody has started it; a running one just gets a dispatch pass. */
  private async startIfWaiting(projectId: string | null): Promise<boolean> {
    if (!projectId) return false
    const [p] = await db.select().from(project).where(eq(project.id, projectId))
    if (!p) return false
    if (['drafting', 'proposed', 'approved'].includes(p.status)) {
      const g = await projectGraph(projectId)
      if (!g?.subIssues.length) return false
      await this.startProject(projectId)
      return true
    }
    void this.dispatch()
    return false
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
              // Saying so must not fail in its turn: nobody awaits this, so a second failure here (the database gone) had nowhere to go.
              try { await this.emit({ ...(await this.context(p.id)).base, issueId: x.id, type: 'build.error', payload: { error: String(err?.message ?? err) } }) }
              catch (again) { console.error(`[engine] a build of ${x.id} failed to start, and that could not be recorded: ${String(err?.message ?? err).slice(0, 200)} (${String((again as Error)?.message ?? again).slice(0, 120)})`) }
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
        } else if (allDone && !this.testing.get(p.id) && !(await this.heldForSmoke(p.id))) { // not while a task's whole test run is going (it may add a sub-task), nor while a person has checks of theirs to do by hand
          await db.update(project).set({ status: 'landed', updatedAt: new Date() }).where(eq(project.id, p.id))
          await this.emit({ ...(await this.context(p.id)).base, type: 'project.landed', payload: {} })
          await settleProject(p.id).catch(() => false) // every task closed already: the project is closed with it
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
    const mode = modeOf(p, a.setup)
    const named = { ticket: teamTicket(t), id: t.identifier, title: t.title, project: p.name }
    // A task's branch is named once, when it is first cut: by the app's template when it has one and the name is free,
    // else the engine's own. One already building keeps the name it had.
    const wanted = mode === 'issue' && !t.branch && !(await branchExists(r!.localPath!, issueBranch(p.integrationBranch!, t.identifier))) ? branchName(a.setup, named) : null
    if (wanted && !(await branchExists(r!.localPath!, wanted))) { await db.update(issue).set({ branch: wanted }).where(eq(issue.id, t.id)); t.branch = wanted }
    const onto = landingBranch(mode, p.integrationBranch!, t) // the project's branch, or the issue's own (stacked PRs)
    // Worktree and branch creation touch the repo's refs: one at a time per repo. A failure here is an attempt too.
    let baseSha: string
    try {
      baseSha = await withLock(`git:${r!.localPath}`, async () => {
        if (mode === 'issue' && !(await branchExists(r!.localPath!, onto))) { // an issue's branch starts where the issue before it ended
          const existing = new Set<string>()
          for (const q of g.issues) { const b = branchOf(p.integrationBranch!, q); if (await branchExists(r!.localPath!, b)) existing.add(b) }
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

    const [interrupted] = await db.select().from(run).where(and(eq(run.issueId, subId), eq(run.status, 'interrupted'))).orderBy(desc(run.attempt), desc(run.startedAt)).limit(1) // the latest: runs carried on share an attempt
    const previousFailure = await this.lastFailure(subId)
    const attempt = x.attempt + 1
    const runId = newId('run')
    await db.insert(run).values({ id: runId, appId: a.id, issueId: subId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    await db.transaction((tx) => setBuild(tx, subId, { status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null }, { runId, payload: { attempt, branch, worktreePath, resumes: interrupted?.agentSessionId ?? null } }))
    const rb = { ...pb, runId }

    const commits = commitRule(a.setup, named)
    const hooksPath = commits.pattern ? await installCommitCheck(worktreePath, { pattern: commits.pattern, format: commits.format }).catch(() => undefined) : undefined
    // The skills this run is given: the one a probe runs as a reviewer, or, for a builder, the app's skills for the build
    // (Settings › Skills, Build › Do). Only ones this app's agents have; a probe whose skill is not there is not run.
    const probe = probeOfTitle(x.title, probesOf(a.setup))
    // A builder on a checklist task is told what Verify will hold its work to, and given the reviewers' skills with its own.
    const told = !onlyLooks(x.title) && styleOf((await workflowFor(db, { issueId: t.id })).workflow) === 'checklist'
    const skillsWanted = probe?.kind === 'skill' ? [probe.runs] : onlyLooks(x.title) ? [] : [...new Set([...((a.setup as { step_skills?: { build?: string[] } } | null)?.step_skills?.build ?? []), ...(told ? reviewerSkills(a.setup) : [])])]
    const has = skillsWanted.length ? await skillOptions('talk', worktreePath, a.id).catch(() => null) : null
    const names = skillsWanted.filter((n) => has?.skills.includes(n))
    const skill = names.length ? { names, plugins: has!.plugins, mcpServers: has!.mcpServers } : undefined
    const result = probe?.kind === 'skill' && !skill ? { status: 'completed' as const, summary: `The skill \`${probe.runs}\` is not one this app's agents have, so this probe was not run.` } : await this.execute({
      subIssue: { id: x.id, identifier: x.identifier, title: x.title, brief: x.brief }, issue: { identifier: t.identifier, title: t.title, brief: t.brief },
      readOnly: onlyLooks(x.title), skills: skill, ...(told ? { heldTo: builderHeld(a.setup) } : {}),
      ticket: ticketOf(t), commitFormat: commits.format ?? undefined, hooksPath,
      worktreePath, branch, files: x.files, testCmd: setup.test_cmd, storybook: storiesLead(setup), references: await referencesOf(a.id), previousFailure, model: setup.model, setup, maxTurns: turnsFor(x.title, setup), maxBudgetUsd: setup.max_budget_usd,
      resumeSessionId: interrupted?.agentSessionId ?? undefined, ...(interrupted?.error?.startsWith(OUT_OF_TURNS) ? { resumeWhy: 'turns' as const } : {}), abort: this.active.get(subId),
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
    if (result.status !== 'completed' && ranOutOfTurns(result.error) && result.agentSessionId && await this.carryOn(subId, runId, attempt, rb)) return
    if (result.status !== 'completed') return this.failed(subId, attempt, x.maxAttempts, `the run ${result.error ?? 'failed'}`, rb)

    await db.transaction((tx) => setBuild(tx, subId, { status: 'merging' }, { runId }))
    const landed = await withLock(`land:${projectId}`, () => land({
      repoPath: r!.localPath!, worktreePath, integrationBranch: onto, discard: onlyLooks(x.title), // merged, not tested: the whole test run is once per task (testTask)
      onEvent: async (type, payload) => { await this.emit({ ...rb, type, payload }) },
    }))
    if (!landed.ok) return this.failed(subId, attempt, x.maxAttempts, `landing failed at ${landed.stage}: ${landed.detail}`, rb)

    this.testing.set(projectId, (this.testing.get(projectId) ?? 0) + 1) // from before it counts as done, so the project is not called landed under the run
    try {
    await db.transaction((tx) => setBuild(tx, subId, { status: 'done' }, { runId, payload: { sha: landed.sha } }))
    await this.markCriteria(subId, x.parentId!, result.summary, rb).catch((err) => this.emit({ ...rb, type: 'task.check_error', payload: { error: String(err?.message ?? err) } }))
    await this.markProbe(x.title, x.parentId!, a.setup, result.summary, rb).catch((err) => this.emit({ ...rb, type: 'task.probe_error', payload: { error: String(err?.message ?? err) } }))
    await withLock(`land:${projectId}`, () => this.updatePr(projectId, mode === 'issue' ? x.parentId! : undefined)).catch((err) => this.emit({ ...rb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    await this.testTask(projectId, x.parentId!, r!.localPath!, worktreePath, onto, setup, rb, mode).catch((err) => this.emit({ ...rb, type: 'task.test_error', payload: { error: String(err?.message ?? err) } }))
    } finally { this.testing.set(projectId, (this.testing.get(projectId) ?? 1) - 1) }
    this.active.delete(subId)
    await this.dispatch()
  }

  /**
   * After the build (verify.ts): when the sub-task that just landed was the last one, the task is checked against
   * its list, what the check found is sent back and checked again, someone who did not build it probes it, and then
   * the app's test command runs on the merged work, once. If it fails (twice: see wholeRun), one more sub-task is added to find the cause and fix
   * it (Sandy, 2026-11-15: "If it fails we analyze and create an additional subtask to fix the issue"). Two such
   * fixes at most; after that the task says so and waits for a person.
   */
  private testing = new Map<string, number>() // projects with a landing or a whole test run under way

  /** What a task is checked against: its acceptance criteria, and the app's requirements in force for its project. */
  private async listOf(taskId: string) {
    const [task] = await db.select().from(issue).where(eq(issue.id, taskId))
    const [a] = task ? await db.select().from(app).where(eq(app.id, task.appId)) : []
    const [p] = task?.projectId ? await db.select().from(project).where(eq(project.id, task.projectId)) : []
    const criteria = task ? acceptanceOf(task) : []
    // A checklist workflow (Main) is held to the whole list, round after round, and probed. A staged one is as it was: its
    // acceptance criteria checked once (Sandy, 2026-11-16: "Keep this in 'legacy', create a new main").
    const w = task ? (await workflowFor(db, { issueId: taskId })).workflow : null
    const loop = styleOf(w) === 'checklist' // with sub-tasks or in one go
    const required = a && loop ? inForce(a.setup, p?.requirements, w?.requirements) : []
    return { task, criteria, required, loop, held: (task?.requirements ?? null) as Covered[] | null, base: a?.defaultBranch ?? 'main', probed: (task?.probes ?? []) as ProbeResult[] }
  }

  /** A check sub-task landed: its verdicts become the build's mark on each criterion and each requirement of the task. */
  private async markCriteria(subId: string, taskId: string, summary: string | null | undefined, pb: Omit<NewEvent, 'type'>) {
    const [sub] = await db.select({ title: issue.title }).from(issue).where(eq(issue.id, subId))
    if (!sub?.title.startsWith(CHECK_TITLE)) return
    const { criteria, required, held } = await this.listOf(taskId)
    const verdicts = readVerdicts(summary, [...criteria.map((c) => c.id), ...required.map((r) => reqId(r.key))])
    const onCriteria = verdictChange(verdicts)
    if (onCriteria.update?.length) await setAcceptance(taskId, onCriteria, 'engine')
    if (required.length && verdicts.some((v) => v.id.startsWith('req_'))) await db.update(issue).set({ requirements: requirementsChecked(required, held, verdicts) }).where(eq(issue.id, taskId))
    await this.emit({ ...pb, issueId: taskId, type: 'task.checked', payload: { criteria: criteria.length, requirements: required.length, read: verdicts.length, met: verdicts.filter((v) => v.met === true).length, notMet: verdicts.filter((v) => v.met === false).length, forAPerson: verdicts.filter((v) => v.met === null).length } })
  }

  /** A probe's sub-task landed: its verdict is kept on the task, the latest for that probe. */
  private async markProbe(title: string, taskId: string, setup: unknown, summary: string | null | undefined, pb: Omit<NewEvent, 'type'>) {
    const p = probeOfTitle(title, probesOf(setup))
    if (!p) return
    const subs = await db.select({ title: issue.title, state: issue.state }).from(issue).where(eq(issue.parentId, taskId))
    const fixes = subs.filter((s) => s.state !== 'canceled' && s.title.startsWith(PROBE_FIX_TITLE)).length
    const [task] = await db.select({ probes: issue.probes }).from(issue).where(eq(issue.id, taskId))
    const result = resultOf(p, summary, fixes)
    await db.update(issue).set({ probes: withResult(task?.probes as ProbeResult[] | null, result) }).where(eq(issue.id, taskId))
    await this.emit({ ...pb, issueId: taskId, type: 'task.probed', payload: { key: p.key, name: p.name, kind: p.kind, pass: result.pass, blocks: p.blocks, evidence: result.evidence, findings: result.findings.length } })
  }

  private async testTask(projectId: string, taskId: string, repoPath: string, worktreePath: string, onto: string, setup: AppSetup, pb: Omit<NewEvent, 'type'>, mode: 'project' | 'issue' = 'issue') {
    const outcome = await withLock(`land:${projectId}`, async () => {
      const every = (await db.select({ id: issue.id, state: issue.state, title: issue.title, sortOrder: issue.sortOrder }).from(issue).where(eq(issue.parentId, taskId))).sort((a, b) => a.sortOrder - b.sortOrder)
      const subs = every.filter((s) => s.state !== 'canceled' && s.state !== 'duplicate')
      const builds = subs.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, subs.map((s) => s.id))) : []
      if (!subs.length || !subs.every((s) => builds.find((b) => b.issueId === s.id)?.status === 'done')) return null // more to build first
      if (await headSha(worktreePath) !== await headSha(repoPath, onto)) return null // another sub-task landed after this one: the run is its
      // Built. What comes next is the checklist's to say (verify.ts): check, finish what it found, probe, then the whole test run.
      const list = await this.listOf(taskId)
      const unmet = unmetOf(list.criteria, list.held, list.required)
      // The agents' probes (probes.ts), for a task on Main. One that had the old single probe is not probed again by the engine's own.
      const old = subs.some((s) => s.title.startsWith(OLD_PROBE_TITLE))
      const agents = list.loop ? agentProbes(setup).filter((p) => !(old && BUILT_IN.some((b) => b.key === p.key))) : []
      const probeFixes = subs.filter((s) => s.title.startsWith(PROBE_FIX_TITLE)).length
      const probing = nextProbe(agents, list.probed, probeFixes)
      const commands = list.loop ? commandProbes(setup) : setup.test_cmd ? commandProbes({ test_cmd: setup.test_cmd }) : []
      const next = afterBuild({ titles: subs.map((s) => s.title), listed: list.loop ? list.criteria.length + list.required.length > 0 : list.criteria.some(unchecked), unmet: unmet.length, commands: commands.length > 0, probe: probing.do, loop: list.loop })
      // What is added now follows what there is: the first check, every sub-task of the build; anything later, the last one.
      const first = !subs.some((s) => [CHECK_TITLE, FINISH_TITLE, OLD_PROBE_TITLE, PROBE_PREFIX, PROBE_FIX_TITLE, FIX_TITLE].some((t) => s.title.startsWith(t)))
      const after = first ? subs.map((s) => s.id) : subs.slice(-1).map((s) => s.id)
      if (next.do !== 'test') return { next, list, unmet, after, probing }
      const fixes = subs.filter((s) => s.title.startsWith(FIX_TITLE)).length
      // The commands, the engine's own to run: each once on the merged work (the test run twice before it is called failed).
      const emit = async (type: string, payload: Record<string, unknown>) => { await this.emit({ ...pb, issueId: taskId, type, payload }) }
      const failed: { name: string; runs: string; detail: string }[] = []
      let probed = list.probed
      for (const c of commands) {
        const ran = c.key === TESTS_KEY ? await wholeRun({ testCmd: c.runs, cwd: worktreePath, onEvent: emit }) : await commandRun({ cmd: c.runs, cwd: worktreePath })
        const detail = ran.ok ? '' : (ran as { detail: string }).detail
        probed = withResult(probed, { key: c.key, name: c.name, kind: 'command', pass: ran.ok, evidence: ran.ok ? `\`${c.runs}\` passed` : `\`${c.runs}\` failed`, findings: [], blocks: c.blocks, fixes, at: new Date().toISOString() })
        if (c.key !== TESTS_KEY) await emit('task.probed', { key: c.key, name: c.name, kind: 'command', pass: ran.ok, blocks: c.blocks, evidence: ran.ok ? '' : detail.slice(-600), findings: 0 })
        if (!ran.ok && c.blocks) failed.push({ name: c.name, runs: c.runs, detail })
      }
      if (list.loop) await db.update(issue).set({ probes: probed }).where(eq(issue.id, taskId))
      return { next, list, unmet, after, probing, fixes, failed }
    })
    if (!outcome) return
    const { next, list, unmet, after, probing } = outcome
    if (next.do === 'check') {
      // The first check reads the whole list; a later one, only what the last left not done.
      const again = next.round > 1
      const criteria = again ? list.criteria.filter((c) => c.built === false) : list.criteria
      const required = again ? list.required.filter((r) => list.held?.find((c) => c.key === r.key)?.built === false) : list.required
      await addSubTask(taskId, { title: numbered(CHECK_TITLE, next.round), brief: checkTaskBrief(criteria, required, again ? { round: next.round } : undefined, smokeSetups(setup), { pr: leftTo(setup, 'pr'), nightly: leftTo(setup, 'nightly') }), after }, 'engine')
      return
    }
    if (next.do === 'finish') { await addSubTask(taskId, { title: numbered(FINISH_TITLE, next.round), brief: finishBrief(unmet, next.round), after }, 'engine'); return }
    if (next.do === 'stuck') {
      await commentOnIssue(taskId, { heading: 'Still not done after three rounds', body: `What the check found was sent back ${MAX_ROUNDS} times and ${unmet.length === 1 ? 'this is' : 'these are'} still not done. It needs a person.\n\n${unmet.map((u) => `- ${u.text}${u.missing ? ` Missing: ${u.missing}` : ''}`).join('\n')}` }, 'engine')
      await this.emit({ ...pb, issueId: taskId, type: 'task.check_stuck', payload: { rounds: MAX_ROUNDS, unmet: unmet.map((u) => u.id) } })
      return
    }
    if (next.do === 'probe' && probing.do === 'run') { await addSubTask(taskId, { title: probeTitle(probing.probe, probing.run), brief: probeBrief(probing.probe, list.criteria, list.base), after }, 'engine'); return }
    if (next.do === 'probe_fix' && probing.do === 'fix') { await addSubTask(taskId, { title: numbered(PROBE_FIX_TITLE, probing.round), brief: probeFixBrief(probing.failing, probing.round), after }, 'engine'); return }
    if (next.do === 'probe_stuck' && probing.do === 'stuck') {
      await commentOnIssue(taskId, { heading: 'Probes still fail after three rounds', body: `What the probes found was sent back ${MAX_ROUNDS} times and ${probing.failing.length === 1 ? 'this one still fails' : 'these still fail'}. It needs a person.\n\n${probing.failing.map((f) => `- ${f.name}: ${f.findings.join('; ') || f.evidence}`).join('\n')}` }, 'engine')
      await this.emit({ ...pb, issueId: taskId, type: 'task.probe_stuck', payload: { rounds: MAX_ROUNDS, failing: probing.failing.map((f) => f.key) } })
      return
    }
    const failed = 'failed' in outcome ? outcome.failed ?? [] : []
    if (next.do === 'done' || !failed.length) {
      // Built, checked, probed and tested: its draft pull request is opened, so what can only be seen on one can be (smoke.ts, when: pr).
      if (prAuto(setup)) await withLock(`land:${projectId}`, () => this.updatePr(projectId, mode === 'issue' ? taskId : undefined, 'auto')).catch((err) => this.emit({ ...pb, issueId: taskId, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
      return
    }
    const fixes = (outcome as { fixes: number }).fixes
    const tests = failed.find((f) => f.runs === setup.test_cmd)
    if (fixes >= MAX_FIXES) {
      await commentOnIssue(taskId, { heading: tests && failed.length === 1 ? 'The whole test run still fails' : 'Its commands still fail', body: `Its sub-tasks are all merged and ${fixes} fixes were tried. It needs a person.\n\n${failed.map((f) => `\`${f.runs}\`\n\n\`\`\`\n${f.detail}\n\`\`\``).join('\n\n')}` }, 'engine')
      await this.emit({ ...pb, issueId: taskId, type: 'task.test_failed', payload: { fixes, tail: failed[0].detail, failed: failed.map((f) => f.name) } })
      return
    }
    await addSubTask(taskId, { title: fixes ? `${FIX_TITLE} (${fixes + 1})` : FIX_TITLE, brief: tests && failed.length === 1 ? fixBrief(tests.runs, tests.detail) : commandFixBrief(failed), after }, 'engine')
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

  /**
   * It ran out of turns: the run is set aside to be resumed, the attempt is given back, and it is queued again.
   * False when it has carried on as often as it may: then it fails, as it used to.
   */
  private async carryOn(subId: string, runId: string, attempt: number, pb: Omit<NewEvent, 'type'>): Promise<boolean> {
    const before = (await db.select({ error: run.error }).from(run).where(and(eq(run.issueId, subId), eq(run.status, 'interrupted')))).filter((r) => r.error?.startsWith(OUT_OF_TURNS)).length
    if (before >= MAX_CARRY_ONS) return false
    await db.update(run).set({ status: 'interrupted', error: `${OUT_OF_TURNS}: carried on from where it was (${before + 1} of ${MAX_CARRY_ONS})` }).where(eq(run.id, runId))
    await db.transaction((tx) => setBuild(tx, subId, { status: 'queued', attempt: Math.max(0, attempt - 1), heldReason: 'ran out of turns; carrying on from where it was' },
      { runId: pb.runId ?? undefined, type: 'build.carried_on', payload: { times: before + 1, of: MAX_CARRY_ONS } }))
    this.active.delete(subId)
    await this.dispatch()
    return true
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
    // After a prototype the plan is made from the analysis and the draft ADR: until they are in, the checks' line plans it (checks.ts), not this pass.
    const v = await stepsOf({ issueId })
    if (checksOwed(v.states, v.resolved.workflow).some((k) => BEFORE_PLAN.includes(k))) return
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
  /**
   * A task with checks left to a person (smoke.ts) is built but not finished: its project is not called landed, and
   * its worktrees are kept, until they have marked each one. Said once for each change in how many wait. Only a
   * checklist task: a staged one lands as it always did.
   */
  private smokeWaits = new Set<string>()
  private async heldForSmoke(projectId: string): Promise<boolean> {
    const tasks = (await db.select().from(issue).where(and(eq(issue.projectId, projectId), eq(issue.kind, 'code')))).filter((t) => !t.parentId && !['canceled', 'duplicate'].includes(t.state))
    let held = false
    for (const t of tasks) {
      const owed = smokeOwed(acceptanceOf(t))
      if (!owed || styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist') continue
      held = true
      const key = `${t.id}:${owed}`
      if (!this.smokeWaits.has(key)) { this.smokeWaits.add(key); await this.emit({ ...(await this.context(projectId)).base, issueId: t.id, type: 'task.smoke_waiting', payload: { owed } }) }
    }
    return held
  }

  /**
   * A person has marked every check of theirs (smoke.ts). What they failed is sent back to be done, with their notes,
   * and looked at again when it is; with nothing failed, the task carries on to its end.
   */
  async afterSmoke(issueId: string): Promise<{ sentBack: number }> {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    const criteria = acceptanceOf(t)
    if (smokeOwed(criteria)) return { sentBack: 0 } // some still wait: one trip back, with everything that failed
    const failed = criteria.filter((c) => c.built === false && c.byHand)
    if (failed.length) {
      const subs = (await db.select({ id: issue.id, title: issue.title, state: issue.state, sortOrder: issue.sortOrder }).from(issue).where(eq(issue.parentId, issueId))).filter((s) => s.state !== 'canceled' && s.state !== 'duplicate').sort((a, b) => a.sortOrder - b.sortOrder)
      const round = subs.filter((s) => s.title.startsWith(FINISH_TITLE)).length + 1
      const brief = `${finishBrief(failed.map((c) => ({ id: c.id, text: c.text, missing: c.byHand!.note || c.builtEvidence })), round)}\n\nA person found ${failed.length === 1 ? 'this' : 'these'} by trying the build by hand. What is under "Missing" is what they saw.`
      await addSubTask(issueId, { title: numbered(FINISH_TITLE, round), brief, after: subs.slice(-1).map((x) => x.id) }, 'engine')
    }
    void this.dispatch()
    return { sentBack: failed.length }
  }

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
  private async updatePr(projectId: string, issueId?: string, submit: boolean | 'auto' | 'preview' = false): Promise<void | { title: string; body: string; head: string; base: string; landed: number; pending: string[] }> {
    const preview = submit === 'preview' // only what it would open with: nothing is pushed, opened or recorded
    if (preview) submit = false
    const { p, a, r, base } = await this.context(projectId)
    const auto = submit === 'auto' // the engine opening a draft once the task is built and checked (pr.ts, prAuto): never a reopening, never an error
    if (preview && !r?.localPath) return
    if (!preview && !r?.fullName) { if (submit === true) throw new PlanError('this app\'s repository is not on GitHub, so there is no pull request to open'); return }
    // Nothing leaves this computer until the person submits it: no push, no pull request. After that, each landing updates it.
    const [had] = (await db.select().from(prTable).where(eq(prTable.projectId, projectId))).filter((q) => (issueId ? q.issueId === issueId : !q.issueId))
    if (!preview && !submit && (!had || had.status === 'closed' || had.status === 'merged')) return
    if (auto && had && (had.status === 'closed' || had.status === 'merged')) return // one the person closed stays closed
    if (auto && had) submit = false // it is open already: this is an update like any other
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
    const head = t ? branchOf(p.integrationBranch!, t) : p.integrationBranch!
    const stack = t ? stackBase(a.defaultBranch, t, issues, prs) : { base: a.defaultBranch, on: null }
    const k = t ? issues.findIndex((q) => q.id === t.id) + 1 : 0
    const ticket = t ? teamTicket(t) : null
    const subjects = (await git(r!.localPath!, ['log', '--reverse', '--no-merges', '--format=%s', `${stack.base}..${head}`], { allowFail: true })).stdout.split('\n').filter(Boolean) // what the builder chose in its commits fills the title
    const title = prTitle(a.setup, { ticket, id: t?.identifier ?? p.name, title: t?.title ?? p.name, project: p.name, n: k, of: issues.length }, t ? (t as { prTitle?: string | null }).prTitle : null, subjects)
      ?? (t ? `${t.identifier} ${t.title} (${p.name}, ${k} of ${issues.length})` : p.name)
    const intro = t ? { ...p, name: `${p.name}, task ${k} of ${issues.length}: ${t.identifier} ${t.title}`, content: [t.description, stack.on ? `Stacked on #${stack.on}: review and merge that one first; this PR then retargets to ${a.defaultBranch}.` : null].filter(Boolean).join('\n\n') || p.content } : p
    const open = mine.filter((x) => x.status !== 'done' && x.status !== 'cancelled')
    const guided = await guideTasks((t ? [t] : issues).map((q) => ({ id: q.id, identifier: q.identifier, title: q.title })), open.map((x) => ({ parentId: x.parentId ?? null, identifier: x.identifier }))).catch(() => [])
    const guide = mergeGuide(guided)
    const body = prBody(intro, landed, mine.filter((x) => x.status !== 'done' && x.status !== 'cancelled').map((x) => ({ identifier: x.identifier, title: x.title })), issueId ? [] : g.backlog, guide, mergeRecord(guided))
    if (preview) return { title, body, head, base: stack.base, landed: landed.length, pending: open.map((x) => x.identifier) }
    if (!r?.fullName) return
    if (auto && submit && (open.length || !mine.some((x) => x.status === 'done'))) return // not whole yet: nothing is opened
    if (submit && open.length) throw new PlanError(`${open.length} sub-task${open.length === 1 ? ' has' : 's have'} still to land (${open.map((x) => x.identifier).join(', ')}): the pull request is submitted once they all have`)
    if (submit && !landed.length) throw new PlanError('nothing has landed yet: there is nothing to submit')
    const result = await this.openPr({ repoPath: r.localPath!, fullName: r.fullName, integrationBranch: head, base: stack.base, title, body, draft: submit === 'auto' ? true : prDraft(a.setup), reopen: submit === true })
    const existing = prs.find((q) => (issueId ? q.issueId === issueId : !q.issueId))
    if (result.closed) { // the person closed it: the work goes on, on its branch; the pull request stays theirs to reopen
      if (existing && existing.status !== 'closed') await db.update(prTable).set({ status: 'closed' }).where(eq(prTable.id, existing.id))
      await this.emit({ ...base, ...(issueId ? { issueId } : {}), type: 'pr.left_closed', payload: { number: result.number, url: result.url, landed: landed.length, pending: open.length } })
      return
    }
    if (!existing) await db.insert(prTable).values({ id: newId('pr'), appId: a.id, projectId, issueId: issueId ?? null, repoId: r.id, number: result.number, url: result.url, headBranch: head, baseBranch: stack.base, status: submit === 'auto' || prDraft(a.setup) ? 'draft' : 'open', openedAt: new Date() })
    else await db.update(prTable).set({ baseBranch: stack.base, number: result.number, url: result.url, ...(submit ? { status: submit === 'auto' || prDraft(a.setup) ? 'draft' : 'open' } : {}) }).where(eq(prTable.id, existing.id))
    if (submit) await this.emit({ ...base, ...(issueId ? { issueId } : {}), actor: submit === 'auto' ? 'engine' : 'user', type: 'pr.submitted', payload: { number: result.number, url: result.url, draft: submit === 'auto' || prDraft(a.setup), ...(submit === 'auto' ? { auto: true } : {}) } })
    await this.emit({ ...base, ...(issueId ? { issueId } : {}), type: result.created ? 'pr.opened' : 'pr.updated', payload: { number: result.number, url: result.url, landed: landed.length, base: stack.base } })
  }

  /** What a task's pull request would open with now, or be updated to: its title and message. Nothing is pushed or opened. Null when there is no checkout to read. */
  async previewPr(projectId: string, issueId?: string) {
    return (await this.updatePr(projectId, issueId, 'preview')) ?? null
  }

  /** The person submits the pull request: the branch is pushed and it is opened (a draft, by the app's rule), or the one they closed is reopened. Refused while sub-tasks are still to land. */
  async submitPr(projectId: string, issueId?: string) {
    await withLock(`land:${projectId}`, () => this.updatePr(projectId, issueId, true))
    const [row] = (await db.select().from(prTable).where(eq(prTable.projectId, projectId))).filter((q) => (issueId ? q.issueId === issueId : !q.issueId))
    return row
  }

  private async context(projectId: string) {
    const [p] = await db.select().from(project).where(eq(project.id, projectId))
    if (!p) throw new PlanError(`no project ${projectId}`)
    const [a] = await db.select().from(app).where(eq(app.id, p.appId))
    const r = await homeRepo(a.id)
    const base: Omit<NewEvent, 'type'> = { workspaceId: a.workspaceId, appId: a.id, projectId, actor: 'engine' }
    return { p, a, r: r?.localPath ? r : null, base }
  }

  private emit(e: NewEvent) {
    return db.transaction((tx) => appendEvent(tx, e))
  }
}

export const runner = new Runner()
