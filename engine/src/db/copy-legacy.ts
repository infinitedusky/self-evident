/**
 * One-off: copy the database from before the Linear shape (`ideafactory`) into the new one (`selfevident`). The old
 * database is only read; run it again after fixing anything (it refuses a target that already has apps, unless
 * --replace empties it first). Ids are kept, so branches, PRs, links and summaries still point at the same things.
 *
 * Tasks, phases, to-dos, checklist lines and backlog items all become issues, numbered per app in the order they
 * were made (HG-1, HG-2, …). A phase is a sub-issue of its task with a build; a checklist line a sub-issue of its
 * to-do; a backlog item an issue in the Backlog state (covered: a duplicate of what covered it; dropped: canceled).
 * The event log keeps its sequence numbers, with its types renamed.
 */
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { DATABASE_URL, db, LEGACY_DATABASE_URL, pool } from './client.js'
import { ensureDatabase } from './ensure.js'
import * as t from './schema.js'
import { BUILD_STATE, type BuildStatus, type IssueState } from './schema.js'
import { appKey, newId } from '../ids.js'

type Row = Record<string, any>

const EVENT_TYPES: Record<string, string> = {
  'task.created': 'issue.created', 'task.planning': 'issue.planning', 'task.planned': 'issue.planned', 'task.plan_failed': 'issue.plan_failed',
  'task.plan_waiting': 'issue.plan_waiting', 'task.cleared': 'issue.cleared',
  'phase.created': 'issue.created', 'phase.status': 'build.status', 'phase.held': 'build.held', 'phase.retry': 'build.retry', 'phase.failed': 'build.failed',
  'phase.error': 'build.error', 'phase.interrupted': 'build.interrupted',
  'todo.created': 'issue.created', 'todo.updated': 'issue.updated', 'todo.checked': 'issue.updated', 'todo.done': 'issue.state', 'todo.dropped': 'issue.state', 'todo.reopened': 'issue.state',
  'backlog.added': 'issue.created', 'backlog.covered': 'issue.state', 'backlog.dropped': 'issue.state', 'backlog.reopened': 'issue.state',
  'plan.created': 'project.created', 'plan.started': 'project.started', 'plan.landed': 'project.landed', 'plan.cleaned': 'project.cleaned', 'plan.cancelled': 'project.cancelled', 'plan.described': 'project.described',
}

export async function copyLegacy(opts: { replace?: boolean; log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log
  const old = new pg.Client({ connectionString: LEGACY_DATABASE_URL })
  await old.connect()
  const q = async (text: string) => (await old.query(text)).rows as Row[]
  try {
    await ensureDatabase(DATABASE_URL)
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from app`)).rows as { n: number }[]
    if (n && !opts.replace) throw new Error(`${new URL(DATABASE_URL).pathname.slice(1)} already has ${n} app(s); pass --replace to empty it and copy again`)

    const L = {
      workspace: await q('select * from workspace'), user: await q('select * from "user"'), app: await q('select * from app order by created_at'), repo: await q('select * from repo'),
      provider: await q('select * from provider_connection'), idea: await q('select * from idea'), evidence: await q('select * from evidence'),
      project: await q('select * from project order by created_at'), task: await q('select * from task order by created_at, position'), phase: await q('select * from phase order by created_at, position'),
      dep: await q('select * from phase_dependency'), claim: await q('select * from phase_file_claim'), todo: await q('select * from todo order by created_at'),
      line: await q('select * from checklist_item order by todo_id, position, id'), backlog: await q('select * from backlog_item order by created_at'),
      decision: await q('select * from decision'), step: await q('select * from step order by id'), session: await q('select * from session'),
      message: await q('select * from session_message order by id'), run: await q('select * from run'), question: await q('select * from question'),
      event: await q('select * from event order by seq'), outside: await q('select * from outside_pr order by id'), summary: await q('select * from summary order by id'),
      pr: await q('select * from pr'), verification: await q('select * from verification'),
    }

    await db.transaction(async (tx) => {
      if (opts.replace) {
        await tx.execute(sql.raw(`truncate ${['verification', 'pr', 'summary', 'outside_pr', 'event', 'question', 'run', 'session_message', 'session', 'step', 'decision', 'file_claim', 'build', 'issue_relation', 'issue', 'initiative_project', 'initiative', 'cycle', 'project', 'evidence', 'idea', 'provider_connection', 'repo', 'app', '"user"', 'workspace'].join(', ')} cascade`))
      }
      const chunks = async <T>(table: any, rows: T[]) => { for (let i = 0; i < rows.length; i += 400) await tx.insert(table).values(rows.slice(i, i + 400) as any) }

      await chunks(t.workspace, L.workspace.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })))
      await chunks(t.user, L.user.map((r) => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, email: r.email, githubLogin: r.github_login, role: r.role, createdAt: r.created_at })))
      const keys: string[] = []
      const keyOf = new Map<string, string>()
      await chunks(t.app, L.app.map((r) => {
        const key = appKey(r.name, keys); keys.push(key); keyOf.set(r.id, key)
        const setup = { ...(r.setup ?? {}) }
        if (setup.pr_mode === 'task') setup.pr_mode = 'issue'
        return { id: r.id, workspaceId: r.workspace_id, name: r.name, key, defaultBranch: r.default_branch, setup, createdAt: r.created_at }
      }))
      await chunks(t.repo, L.repo.map((r) => ({ id: r.id, appId: r.app_id, fullName: r.full_name, localPath: r.local_path, writable: r.writable, baseBranch: r.base_branch })))
      await chunks(t.providerConnection, L.provider.map((r) => ({ id: r.id, appId: r.app_id, role: r.role, provider: r.provider, config: r.config, secretRef: r.secret_ref, status: r.status, checkedAt: r.checked_at })))
      await chunks(t.idea, L.idea.map((r) => ({ id: r.id, appId: r.app_id, number: r.number, title: r.title, body: r.body, source: r.source, sourceRef: r.source_ref, lane: r.lane, hypothesis: r.hypothesis, baseline: r.baseline, measures: r.measures, testability: r.testability, lookBy: r.look_by, decision: r.decision, decidedAt: r.decided_at, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at })))
      await chunks(t.evidence, L.evidence.map((r) => ({ id: r.id, appId: r.app_id, ideaId: r.idea_id, prId: r.pr_id, kind: r.kind, metric: r.metric, value: r.value, baselineValue: r.baseline_value, windowStart: r.window_start, windowEnd: r.window_end, provider: r.provider, summary: r.summary, raw: r.raw, capturedAt: r.captured_at })))
      await chunks(t.project, L.project.map((r) => ({ id: r.id, appId: r.app_id, ideaId: r.idea_id, name: r.title, content: r.spec, status: r.status, integrationBranch: r.integration_branch, createdAt: r.created_at })))

      // Issues. A task's state comes from its phases and its project's PR; the rest map one to one.
      const projectOf = new Map(L.project.map((p) => [p.id, p]))
      const merged = new Set(L.pr.filter((p) => p.status === 'merged').map((p) => p.task_id ?? `project:${p.project_id}`))
      const taskState = (task: Row): { state: IssueState; reason?: string } => {
        const p = projectOf.get(task.project_id)!
        const phases = L.phase.filter((x) => x.task_id === task.id)
        const live = phases.filter((x) => x.status !== 'cancelled')
        if (['stopped', 'superseded'].includes(p.status) && !(live.length && live.every((x) => x.status === 'done'))) return { state: 'canceled', reason: `project ${p.status}` }
        if (!live.length) return { state: phases.length ? 'canceled' : 'todo', reason: phases.length ? 'its sub-issues were cancelled' : undefined }
        if (live.every((x) => x.status === 'done')) return { state: merged.has(task.id) || merged.has(`project:${p.id}`) ? 'done' : 'in_review' }
        return { state: live.some((x) => x.status !== 'queued' && x.status !== 'ready') || phases.some((x) => x.status === 'done') ? 'in_progress' : 'todo' }
      }
      const coverOf = (b: Row) => b.task_id ?? b.todo_id
      type Made = { at: Date; order: number; row: Row }
      const made: Made[] = []
      const lineIds = new Map<number, string>()
      for (const r of L.task) { const s = taskState(r); made.push({ at: r.created_at, order: 0, row: { id: r.id, appId: r.app_id, kind: 'code', projectId: r.project_id, ideaId: r.idea_id, title: r.title, description: r.description, brief: r.brief, sortOrder: r.position, delegate: 'planner', state: s.state, reason: s.reason ?? null, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at } }) }
      for (const r of L.phase) made.push({ at: r.created_at, order: 1, row: { id: r.id, appId: r.app_id, kind: 'code', parentId: r.task_id, projectId: r.project_id, title: r.title, description: r.description, brief: r.brief, sortOrder: r.position, estimate: r.size, delegate: 'builder', state: BUILD_STATE[r.status as BuildStatus], reason: r.status === 'cancelled' ? r.held_reason : null, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at } })
      for (const r of L.todo) made.push({ at: r.created_at, order: 2, row: { id: r.id, appId: r.app_id, kind: 'todo', projectId: r.project_id, title: r.title, description: r.notes, delegate: r.owner === 'agent' ? 'agent' : null, state: r.status === 'done' ? 'done' : r.status === 'dropped' ? 'canceled' : 'todo', reason: r.reason, sortOrder: r.number, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, closedBy: r.closed_by, completedAt: r.status === 'done' ? r.closed_at : null, canceledAt: r.status === 'dropped' ? r.closed_at : null } })
      for (const r of L.line) {
        const todo = L.todo.find((x) => x.id === r.todo_id)!
        const id = newId('issue'); lineIds.set(Number(r.id), id)
        made.push({ at: todo.created_at, order: 3 + r.position / 10_000, row: { id, appId: r.app_id, kind: 'todo', parentId: r.todo_id, projectId: todo.project_id, title: r.text, waitingOn: r.waiting_on, sortOrder: r.position, state: r.done ? 'done' : 'todo', completedAt: r.done ? r.done_at : null, closedBy: r.done ? r.done_by : null, createdAt: todo.created_at } })
      }
      for (const [i, r] of L.backlog.entries()) {
        const state = r.state === 'open' ? 'backlog' : r.state === 'covered' ? 'duplicate' : 'canceled'
        const coveredBy = coverOf(r) ? [...L.task, ...L.todo].find((x) => x.id === coverOf(r)) : null
        made.push({ at: r.created_at, order: 4, row: { id: r.id, appId: r.app_id, kind: r.todo_id ? 'todo' : 'code', projectId: r.project_id, ideaId: r.idea_id, title: r.text, description: r.body, source: r.source, sourceRef: r.source_ref, state, sortOrder: 1000 + i,
          reason: state === 'duplicate' ? (r.reason ?? (coveredBy ? `covered by ${coveredBy.title}` : 'covered')) : r.reason, createdBy: r.created_by, createdAt: r.created_at, closedBy: r.resolved_by, canceledAt: state !== 'backlog' ? r.resolved_at : null } })
      }
      made.sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order)
      const next = new Map<string, number>()
      const issues: Row[] = made.map(({ row }) => { const n = (next.get(row.appId) ?? 0) + 1; next.set(row.appId, n); return { ...row, number: n, startedAt: ['in_progress', 'in_review', 'done'].includes(row.state) && row.kind === 'code' ? row.createdAt : null } })
      // Parents before their sub-issues (a sub-issue's foreign key names its parent).
      await chunks(t.issue, issues.filter((r) => !r.parentId))
      await chunks(t.issue, issues.filter((r) => r.parentId))
      await chunks(t.build, L.phase.map((r) => ({ issueId: r.id, appId: r.app_id, status: r.status, attempt: r.attempt, maxAttempts: r.max_attempts, branch: r.branch, worktreePath: r.worktree_path, baseSha: r.base_sha, requiresSchemaChange: r.requires_schema_change, heldReason: r.held_reason, updatedAt: r.updated_at })))
      await chunks(t.issueRelation, [
        ...L.dep.map((r) => ({ appId: r.app_id, issueId: r.depends_on_phase_id, relatedIssueId: r.phase_id, type: 'blocks' })),
        ...L.backlog.filter((r) => r.state === 'covered' && coverOf(r)).map((r) => ({ appId: r.app_id, issueId: coverOf(r), relatedIssueId: r.id, type: 'duplicate' })),
      ])
      await chunks(t.fileClaim, L.claim.map((r) => ({ appId: r.app_id, issueId: r.phase_id, path: r.path })))
      await chunks(t.decision, L.decision.map((r) => ({ id: r.id, appId: r.app_id, ideaId: r.idea_id, projectId: r.project_id, issueId: r.task_id, runId: r.run_id, question: r.question, options: r.options, chosen: r.chosen, provisional: r.provisional, decidedBy: r.decided_by, decidedAt: r.decided_at, rationale: r.rationale })))
      await chunks(t.session, L.session.map((r) => ({ id: r.id, appId: r.app_id, kind: r.kind === 'phase' ? 'issue' : r.kind, issueId: r.phase_id, cwd: r.cwd, branch: r.branch, worktreePath: r.worktree_path, title: r.title, subject: r.subject, subjectRef: r.subject_ref, agentSessionId: r.agent_session_id, status: r.status, createdBy: r.created_by, createdAt: r.created_at, lastActiveAt: r.last_active_at, autoApprove: r.auto_approve })))
      await chunks(t.sessionMessage, L.message.map((r) => ({ id: Number(r.id), appId: r.app_id, sessionId: r.session_id, author: r.author, kind: r.kind, body: r.body, payload: r.payload, attachments: r.attachments, status: r.status, queuedAt: r.queued_at, sentAt: r.sent_at })))
      await chunks(t.run, L.run.map((r) => ({ id: r.id, appId: r.app_id, issueId: r.phase_id ?? r.task_id, sessionId: r.session_id, attempt: r.attempt, kind: r.kind, agent: r.agent, model: r.model, status: r.status, agentSessionId: r.agent_session_id, pid: r.pid, startedAt: r.started_at, endedAt: r.ended_at, costUsd: r.cost_usd, budgetCapUsd: r.budget_cap_usd, tokens: r.tokens, summary: r.summary, error: r.error })))
      await chunks(t.step, L.step.map((r) => ({ id: Number(r.id), appId: r.app_id, issueId: r.phase_id, runId: r.run_id, position: r.position, text: r.text, status: r.status, updatedAt: r.updated_at })))
      await chunks(t.question, L.question.map((r) => ({ id: r.id, appId: r.app_id, ideaId: r.idea_id, projectId: r.project_id, issueId: r.phase_id ?? r.task_id, runId: r.run_id, text: r.text, options: r.options, reason: r.reason, cost: r.cost, status: r.status, answer: r.answer, answeredBy: r.answered_by, answeredAt: r.answered_at, askedAt: r.asked_at })))
      await chunks(t.pr, L.pr.map((r) => ({ id: r.id, appId: r.app_id, projectId: r.project_id, repoId: r.repo_id, issueId: r.task_id, number: r.number, url: r.url, headBranch: r.head_branch, baseBranch: r.base_branch, headSha: r.head_sha, mergeSha: r.merge_sha, status: r.status, additions: r.additions, deletions: r.deletions, changedFiles: r.changed_files, readiness: r.readiness, signals: r.signals, pitch: r.pitch, openedAt: r.opened_at, mergedAt: r.merged_at })))
      await chunks(t.verification, L.verification.map((r) => ({ id: r.id, appId: r.app_id, issueId: r.phase_id, prId: r.pr_id, runId: r.run_id, kind: r.kind, label: r.label, name: r.name, route: r.route, blobUrl: r.blob_url, notes: r.notes, capturedAt: r.captured_at })))
      await chunks(t.outsidePr, L.outside.map((r) => ({ id: Number(r.id), appId: r.app_id, repoId: r.repo_id, number: r.number, title: r.title, author: r.author, url: r.url, state: r.state, draft: r.draft, headBranch: r.head_branch, baseBranch: r.base_branch, reviewRequested: r.review_requested, reviewDecision: r.review_decision, files: r.files, updatedAt: r.updated_at, syncedAt: r.synced_at })))
      await chunks(t.summary, L.summary.map((r) => ({ id: Number(r.id), appId: r.app_id, section: r.section, body: r.body, facts: r.facts, throughSeq: Number(r.through_seq), model: r.model, costUsd: r.cost_usd, trigger: r.trigger, createdAt: r.created_at })))
      await chunks(t.event, L.event.map((r) => {
        const todoRef = r.payload?.todoId ?? null
        return { seq: Number(r.seq), ts: r.ts, workspaceId: r.workspace_id, appId: r.app_id, ideaId: r.idea_id, projectId: r.project_id, issueId: r.phase_id ?? r.task_id ?? todoRef ?? r.payload?.itemId ?? null, runId: r.run_id, sessionId: r.session_id, actor: r.actor, type: EVENT_TYPES[r.type] ?? r.type, payload: { ...r.payload, ...(EVENT_TYPES[r.type] ? { was: r.type } : {}) } }
      }))
      for (const [table, col] of [['event', 'seq'], ['outside_pr', 'id'], ['summary', 'id'], ['step', 'id'], ['session_message', 'id'], ['evidence', 'id']]) {
        await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('${table}', '${col}'), greatest(coalesce((select max(${col}) from ${table}), 0), 1))`))
      }

      // Checks: every row arrived, and every issue's parent and project resolve.
      const count = async (table: string) => Number(((await tx.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0] as { n: number }).n)
      const expect: [string, number][] = [
        ['issue', L.task.length + L.phase.length + L.todo.length + L.line.length + L.backlog.length], ['build', L.phase.length], ['project', L.project.length],
        ['event', L.event.length], ['run', L.run.length], ['step', L.step.length], ['question', L.question.length], ['decision', L.decision.length], ['pr', L.pr.length],
        ['file_claim', L.claim.length], ['session_message', L.message.length], ['outside_pr', L.outside.length], ['summary', L.summary.length],
      ]
      for (const [table, want] of expect) { const got = await count(table); if (got !== want) throw new Error(`${table}: copied ${got}, expected ${want}`); log(`  ${table.padEnd(16)} ${got}`) }
      for (const a of L.app) log(`  ${a.name}: ${keyOf.get(a.id)}-1 … ${keyOf.get(a.id)}-${next.get(a.id) ?? 0}`)
    })
  } finally {
    await old.end()
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  copyLegacy({ replace: process.argv.includes('--replace') })
    .then(() => console.log(`copied ${new URL(LEGACY_DATABASE_URL).pathname.slice(1)} → ${new URL(DATABASE_URL).pathname.slice(1)}`))
    .catch((err) => { console.error(err.message ?? err); process.exitCode = 1 })
    .finally(() => pool.end())
}
