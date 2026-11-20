/**
 * A task's pull request, as its own step (Sandy, 2026-11-20: "a new step to the build section after smoke test, 'PR'.
 * This will show us the PR status, the message, let us submit (new PR or draft to complete conversion) and let us
 * see any comments. It will also in the future give us tools to help reviewers").
 *
 * One view: where it stands (not submitted, a draft, open, closed, merged; what review and its checks say), the
 * message (what it will open with before it exists; after, what GitHub has, and what the next update would send),
 * what submitting waits on, and what people have said on it: comments, reviews and the comments on lines, oldest
 * first. GitHub is asked each time the page is read; when it cannot be reached the view says so and shows what
 * the engine last knew.
 *
 * Two acts, both the person's and neither a tool an agent has: submitting (runner.submitPr, as before) and marking
 * a draft ready for review (`gh pr ready`), which is the step a draft waits for.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { eq, inArray } from 'drizzle-orm'
import { acceptanceOf } from './acceptance.js'
import { db } from './db/client.js'
import { app, build, issue, pr as prTable, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { getIssue, PlanError } from './issues.js'
import { prAuto, prDraft } from './pr.js'
import { smokeOwed } from './smoke.js'
import { homeRepo } from './workbench.js'

const execFileP = promisify(execFile)
export type Gh = (args: string[], cwd: string) => Promise<string>
const realGh: Gh = (args, cwd) => execFileP(process.env.GH_BIN ?? 'gh', args, { cwd, maxBuffer: 20_000_000, timeout: 30_000 }).then((r) => r.stdout.trim())

export interface PrComment { id: string; kind: 'comment' | 'review' | 'line'; author: string; body: string; at: string; url: string | null; /** A review: approved, changes requested, or commented. */ state?: string; /** A comment on a line: the file and the line. */ path?: string; line?: number | null }
export interface PrCheck { name: string; state: 'pass' | 'fail' | 'pending' | 'skipped' }
export interface PrOnGithub { number: number; url: string; status: 'draft' | 'open' | 'closed' | 'merged'; title: string; body: string; review: string | null; mergeable: string | null; checks: PrCheck[]; updatedAt: string | null }

const checkState = (c: { conclusion?: string; status?: string; state?: string }): PrCheck['state'] => {
  const v = (c.conclusion || c.state || '').toUpperCase()
  if (['SUCCESS', 'NEUTRAL'].includes(v)) return 'pass'
  if (['SKIPPED'].includes(v)) return 'skipped'
  if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(v)) return 'fail'
  return 'pending'
}

/** A pull request as GitHub has it, with what was said on it, oldest first. Pure but for the one it asks. */
export async function readPr(gh: Gh, cwd: string, fullName: string, number: number): Promise<{ pr: PrOnGithub; comments: PrComment[] }> {
  const g = JSON.parse(await gh(['pr', 'view', String(number), '-R', fullName, '--json', 'number,url,state,isDraft,title,body,reviewDecision,mergeable,statusCheckRollup,updatedAt,comments,reviews'], cwd)) as {
    number: number; url: string; state: string; isDraft: boolean; title: string; body: string; reviewDecision?: string; mergeable?: string; updatedAt?: string
    statusCheckRollup?: { name?: string; context?: string; conclusion?: string; status?: string; state?: string }[]
    comments?: { id: string; author?: { login?: string }; body: string; createdAt: string; url?: string }[]
    reviews?: { id: string; author?: { login?: string }; body: string; submittedAt?: string; state: string }[]
  }
  const lines = await gh(['api', `repos/${fullName}/pulls/${number}/comments`, '--paginate'], cwd).then((t) => JSON.parse(t || '[]') as { id: number; user?: { login?: string }; body: string; created_at: string; html_url?: string; path?: string; line?: number | null; original_line?: number | null }[]).catch(() => [])
  const comments: PrComment[] = [
    ...(g.comments ?? []).map((c): PrComment => ({ id: `c_${c.id}`, kind: 'comment', author: c.author?.login ?? 'someone', body: c.body, at: c.createdAt, url: c.url ?? null })),
    // A review with nothing written and no verdict is only the wrapper of its line comments.
    ...(g.reviews ?? []).filter((r) => r.body?.trim() || r.state !== 'COMMENTED').map((r): PrComment => ({ id: `r_${r.id}`, kind: 'review', author: r.author?.login ?? 'someone', body: r.body ?? '', at: r.submittedAt ?? '', url: null, state: r.state.toLowerCase().replace(/_/g, ' ') })),
    ...lines.map((c): PrComment => ({ id: `l_${c.id}`, kind: 'line', author: c.user?.login ?? 'someone', body: c.body, at: c.created_at, url: c.html_url ?? null, path: c.path, line: c.line ?? c.original_line ?? null })),
  ].sort((x, y) => x.at.localeCompare(y.at))
  const status = g.state === 'MERGED' ? 'merged' : g.state === 'CLOSED' ? 'closed' : g.isDraft ? 'draft' : 'open'
  return { pr: { number: g.number, url: g.url, status, title: g.title, body: g.body ?? '', review: g.reviewDecision ? g.reviewDecision.toLowerCase().replace(/_/g, ' ') : null, mergeable: g.mergeable ? g.mergeable.toLowerCase() : null, checks: (g.statusCheckRollup ?? []).map((c) => ({ name: c.name ?? c.context ?? 'check', state: checkState(c) })), updatedAt: g.updatedAt ?? null }, comments }
}

async function rowOf(t: { id: string; projectId: string | null }) {
  if (!t.projectId) return null
  const rows = await db.select().from(prTable).where(eq(prTable.projectId, t.projectId))
  return rows.find((q) => q.issueId === t.id) ?? rows.find((q) => !q.issueId) ?? null
}

export async function prView(issueId: string, deps: { gh?: Gh; preview: (projectId: string, issueId?: string) => Promise<{ title: string; body: string; head: string; base: string; landed: number; pending: string[] } | null> }) {
  const t = await getIssue(db, issueId)
  if (t.parentId) throw new PlanError('a pull request is a task\'s, not a sub-task\'s')
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [p] = t.projectId ? await db.select().from(project).where(eq(project.id, t.projectId)) : []
  const r = await homeRepo(t.appId)
  const row = await rowOf(t)
  const mine = row?.issueId === t.id || (p?.prMode ?? 'issue') === 'issue'
  const subs = await db.select({ id: issue.id, state: issue.state }).from(issue).where(eq(issue.parentId, t.id))
  const live = subs.filter((s) => s.state !== 'canceled' && s.state !== 'duplicate')
  const builds = live.length ? await db.select({ issueId: build.issueId, status: build.status }).from(build).where(inArray(build.issueId, live.map((s) => s.id))) : []
  const landed = live.filter((s) => builds.find((b) => b.issueId === s.id)?.status === 'done').length
  const criteria = acceptanceOf(t)
  const unchecked = criteria.filter((c) => c.built !== true).length, byHand = smokeOwed(criteria)
  const message = t.projectId ? await deps.preview(t.projectId, mine ? t.id : undefined).catch(() => null) : null
  let onGithub: PrOnGithub | null = null, comments: PrComment[] = [], problem: string | null = null
  if (row?.number && r?.fullName) {
    try { const got = await readPr(deps.gh ?? realGh, r.localPath ?? process.cwd(), r.fullName, row.number); onGithub = got.pr; comments = got.comments } catch (err) { problem = `GitHub could not be asked just now, so this is what was last known: ${String((err as { stderr?: string }).stderr || (err as Error).message).trim().split('\n')[0].slice(0, 200)}` }
    if (onGithub && onGithub.status !== row.status) await db.update(prTable).set({ status: onGithub.status }).where(eq(prTable.id, row.id)) // closed, merged or made ready on GitHub since
  }
  const pr = onGithub ?? (row?.number ? { number: row.number, url: row.url ?? '', status: row.status as PrOnGithub['status'], title: '', body: '', review: null, mergeable: null, checks: [], updatedAt: null } : null)
  const liveNow = !!pr && pr.status !== 'closed' && pr.status !== 'merged'
  const waits: string[] = []
  if (!r?.fullName) waits.push('This app\'s repository is not on GitHub, so there is no pull request to open.')
  if (!live.length) waits.push('Nothing is built yet.')
  else if (landed < live.length) waits.push(`${live.length - landed} of its ${live.length} sub-task${live.length === 1 ? '' : 's'} ${live.length - landed === 1 ? 'has' : 'have'} still to land.`)
  return {
    issueId: t.id,
    /** The pull request, as GitHub has it now (or as last known, with `problem`). Null: not submitted. */ pr,
    /** What it would open with now, or what the next update sends: the title by the app's rule, the message with its merge guide. */ message: message && { title: message.title, body: message.body, head: message.head, base: message.base },
    /** What GitHub has differs from what would be sent: it is brought up to date when the next sub-task lands, or on submitting again. */ behind: !!(onGithub && message && liveNow && (onGithub.title !== message.title || onGithub.body.trim() !== message.body.trim())),
    landed, total: live.length, unchecked, byHand,
    /** The app opens pull requests as drafts; and opens one by itself once the task is built and checked. */ draft: prDraft(a?.setup), auto: prAuto(a?.setup),
    /** It can be submitted now (a new one, or the closed one again); else why not. */ canSubmit: !liveNow && pr?.status !== 'merged' && waits.length === 0, waits,
    /** It is a draft: the person can mark it ready for review. */ canReady: pr?.status === 'draft',
    comments, problem,
  }
}

/** A draft marked ready for review: the person's, never an agent's. */
export async function markReady(issueId: string, actor = 'user', gh: Gh = realGh) {
  const t = await getIssue(db, issueId)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const r = await homeRepo(t.appId)
  const row = await rowOf(t)
  if (!row?.number || !r?.fullName) throw new PlanError('there is no pull request to mark ready: submit it first')
  if (row.status === 'merged' || row.status === 'closed') throw new PlanError(`#${row.number} is ${row.status}`)
  try { await gh(['pr', 'ready', String(row.number), '-R', r.fullName], r.localPath ?? process.cwd()) } catch (err) { throw new PlanError(`GitHub would not mark #${row.number} ready: ${String((err as { stderr?: string }).stderr || (err as Error).message).trim().split('\n')[0].slice(0, 200)}`) }
  await db.update(prTable).set({ status: 'open' }).where(eq(prTable.id, row.id))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'pr.ready', payload: { number: row.number, url: row.url } }))
  return { number: row.number, url: row.url, status: 'open' as const }
}
