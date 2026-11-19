/**
 * Trying a change to what an app's builds are held to, on past work (Sandy, 2026-11-19: "these setting changes are
 * really sort of core to the way you build for an entire project, so I think it's worth having … an A/B test … that
 * gets linked to changes"; "It's not required"). One probe, as it is at that moment (saved or not yet), is run on the
 * app's last merged tasks, each at its merged commit in a scratch worktree, and what it says of each is kept with the
 * probe as it was (`probe_trial`). All of those tasks were merged, so a probe that fails most of them is too strict,
 * and one that passes the task known to be wrong is too weak.
 *
 * It can be replayed because a probe changes nothing: a command's exit code, or an agent that only reads and runs.
 * A command costs nothing and answers the same twice. A skill, a sentence or one of the engine's own costs an agent
 * run per task, and is an opinion. A skill put on a step an agent does (Build › Do) changes what is built, so trying
 * one would mean building a task twice: not this.
 */
import { join } from 'node:path'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, pr, probeTrial } from './db/schema.js'
import { acceptanceOf } from './acceptance.js'
import { appendEvent } from './events.js'
import { runTask, type Execute } from './executor.js'
import { git, removeWorktree } from './git.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'
import { commandRun } from './landing.js'
import { judgedBrief, probeBrief, readProbe } from './probes.js'
import type { Probe } from './probe-list.js'
import { skillOptions } from './skills.js'
import { homeRepo } from './workbench.js'

export type Tried = { name: string; kind: 'command' | 'skill' | 'judged' | 'built-in'; runs: string }
export type TrialRow = typeof probeTrial.$inferSelect
export const TRIAL_TASKS = 5

/** The app's merged tasks, the latest first: what a trial runs on. Only ones with a pull request of their own, since that is where a task's merged commit is known. */
export async function pastTasks(appId: string, limit = TRIAL_TASKS) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const rows = await db.select({ issueId: issue.id, number: issue.number, title: issue.title, acceptance: issue.acceptance, pr: pr.number, sha: pr.mergeSha, mergedAt: pr.mergedAt })
    .from(pr).innerJoin(issue, eq(pr.issueId, issue.id)).where(and(eq(pr.appId, appId), eq(pr.status, 'merged'), isNotNull(pr.mergeSha))).orderBy(desc(pr.mergedAt)).limit(Math.max(1, Math.min(limit, 20)))
  return rows.map((r) => ({ issueId: r.issueId, identifier: identifier(a.key, r.number), title: r.title, pr: r.pr, sha: r.sha!, mergedAt: r.mergedAt, acceptance: r.acceptance }))
}

/** An app's trials, the latest first; with `latest`, only the last one of each probe. */
export async function trialsOf(appId: string, latest = false): Promise<TrialRow[]> {
  const rows = await db.select().from(probeTrial).where(eq(probeTrial.appId, appId)).orderBy(desc(probeTrial.createdAt)).limit(200)
  const seen = new Set<string>()
  return latest ? rows.filter((r) => !seen.has(r.key) && (seen.add(r.key), true)) : rows
}

const running = new Set<string>()
/** Trials cut off by a restart are not left saying they run. */
export async function endStrayTrials() {
  await db.update(probeTrial).set({ status: 'failed', error: 'The engine restarted while it ran.', finishedAt: new Date() }).where(eq(probeTrial.status, 'running'))
}

/**
 * Start a trial of one probe. Returns its row at once and `done`, which settles when it has run on every task.
 * One at a time for an app: they share a scratch worktree, and an agent's runs are not cheap.
 */
export async function startTrial(appId: string, i: { key: string; probe: Tried; limit?: number }, execute: Execute = runTask): Promise<{ trial: TrialRow; done: Promise<TrialRow> }> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const probe: Tried = { name: String(i.probe?.name ?? '').trim().slice(0, 80), kind: i.probe?.kind, runs: String(i.probe?.runs ?? '').trim().slice(0, 1000) }
  if (!i.key?.trim() || !probe.name || !probe.runs || !['command', 'skill', 'judged', 'built-in'].includes(probe.kind)) throw new PlanError('a trial needs a probe: its key, name, kind and what it runs')
  if (running.has(appId)) throw new PlanError('a trial is already running for this app: wait for it')
  const r = await homeRepo(appId)
  if (!r?.localPath) throw new PlanError('this app has no checkout on this computer to try it in')
  const tasks = await pastTasks(appId, i.limit)
  if (!tasks.length) throw new PlanError('this app has no merged task yet to try it on')
  const [trial] = await db.insert(probeTrial).values({ id: newId('trial'), appId, key: i.key.trim(), probe, tasks: tasks.length }).returning()
  const say = (type: string, row: TrialRow) => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor: 'engine', type, payload: { trialId: row.id, key: row.key, name: probe.name, done: row.results.length, of: row.tasks } })).catch(() => {})
  running.add(appId)
  await say('trial.started', trial)
  const done = (async () => {
    const path = join(`${r.localPath}-worktrees`, `trial-${trial.id}`)
    let row = trial, cost = 0
    try {
      for (const t of tasks) {
        const began = Date.now()
        await removeWorktree(r.localPath!, path)
        const added = await git(r.localPath!, ['worktree', 'add', '--detach', path, t.sha], { allowFail: true })
        let res: { pass: boolean | null; evidence: string; findings: string[] }
        if (added.code !== 0) res = { pass: null, evidence: `Its merged commit could not be checked out: ${added.stderr.split('\n')[0].slice(0, 200)}`, findings: [] }
        else if (probe.kind === 'command') { const ran = await commandRun({ cmd: probe.runs, cwd: path }); res = { pass: ran.ok, evidence: ran.ok ? '' : ran.detail.slice(-800), findings: [] } }
        else {
          const base = `${t.sha}^1` // what main was before this task's merge
          const has = probe.kind === 'skill' ? await skillOptions('talk', path, appId).catch(() => null) : null
          if (probe.kind === 'skill' && !has?.skills.includes(probe.runs)) res = { pass: null, evidence: `The skill \`${probe.runs}\` is not one this app's agents have.`, findings: [] }
          else {
            const brief = probe.kind === 'judged' ? judgedBrief(probe.name, probe.runs, base) : probeBrief({ key: i.key, name: probe.name, kind: probe.kind, runs: probe.runs, blocks: true, on: true } as Probe, acceptanceOf(t), base)
            const out = await execute({
              subIssue: { id: trial.id, identifier: t.identifier, title: `Trial: ${probe.name}`, brief }, issue: { identifier: t.identifier, title: t.title, brief: null },
              readOnly: true, ...(has ? { skills: { names: [probe.runs], plugins: has.plugins, mcpServers: has.mcpServers } } : {}),
              worktreePath: path, branch: t.sha, files: [], setup: a.setup, model: (a.setup as { model?: string } | null)?.model, onEvent: async () => {},
            })
            cost += out.costUsd ?? 0
            const v = readProbe(out.summary)
            res = v ?? { pass: null, evidence: out.error?.slice(0, 300) || 'Its agent gave no verdict.', findings: [] }
          }
        }
        const results = [...row.results, { issueId: t.issueId, identifier: t.identifier, title: t.title, pr: t.pr, sha: t.sha, ...res, ms: Date.now() - began }]
        ;[row] = await db.update(probeTrial).set({ results, ...(cost ? { costUsd: cost.toFixed(2) } : {}) }).where(eq(probeTrial.id, trial.id)).returning()
        await say('trial.progress', row)
      }
      ;[row] = await db.update(probeTrial).set({ status: 'done', finishedAt: new Date() }).where(eq(probeTrial.id, trial.id)).returning()
    } catch (err: any) {
      ;[row] = await db.update(probeTrial).set({ status: 'failed', error: String(err?.message ?? err).slice(0, 500), finishedAt: new Date() }).where(eq(probeTrial.id, trial.id)).returning()
    } finally {
      await removeWorktree(r.localPath!, path)
      running.delete(appId)
    }
    await say('trial.finished', row)
    return row
  })()
  return { trial, done }
}
