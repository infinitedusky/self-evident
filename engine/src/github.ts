/**
 * The GitHub sync: what happened on GitHub that the engine did not do. Every two minutes (and on demand), per repo:
 * - our pull requests: merged or closed, the review decision, the CI checks, whether GitHub can merge them;
 * - pull requests Self Evident did not open (a teammate's): kept in `outside_pr`, with a review requested from the
 *   person and the files each one changes, so My Stuff can say "review this" and "this touches what you're building";
 * - main moving: the default branch is fetched and merged into every open project's branch, under the same lock
 *   landing uses. A conflict is not resolved here: it becomes a "needs you" with the files.
 * GitHub is read through the person's own `gh` login, like the rest of the engine.
 */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, outsidePr, pr as prTable, project, repo } from './db/schema.js'
import { appendEvent } from './events.js'
import { addWorktree, branchExists, git, headSha, isAncestor, mergeInto, push, removeWorktree, fastForward } from './git.js'
import { setState } from './issues.js'
import { withLock } from './landing.js'

const execFileP = promisify(execFile)

export interface GhPr {
  number: number; title: string; url: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; isDraft: boolean
  author?: { login: string } | null; headRefName: string; baseRefName: string
  reviewDecision?: string | null; reviewRequests?: { login?: string; name?: string; slug?: string }[]
  statusCheckRollup?: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[]
  mergeable?: string; mergedAt?: string | null; updatedAt?: string; files?: { path: string }[]; mergeCommit?: { oid: string } | null
}
export interface GitHubApi { me: () => Promise<string>; listPrs: (fullName: string, cwd: string) => Promise<GhPr[]>; retarget: (fullName: string, number: number, base: string, cwd: string) => Promise<void> }

const FIELDS = 'number,title,url,state,isDraft,author,headRefName,baseRefName,reviewDecision,reviewRequests,statusCheckRollup,mergeable,mergedAt,updatedAt,files,mergeCommit'
let login: string | null = null
export const ghCli: GitHubApi = {
  me: async () => (login ??= (await execFileP('gh', ['api', 'user', '--jq', '.login'])).stdout.trim()),
  retarget: async (fullName, number, base, cwd) => { await execFileP('gh', ['pr', 'edit', String(number), '-R', fullName, '--base', base], { cwd }) },
  listPrs: async (fullName, cwd) => JSON.parse((await execFileP('gh', ['pr', 'list', '-R', fullName, '--state', 'all', '--limit', '60', '--json', FIELDS], { cwd, maxBuffer: 32 * 1024 * 1024 })).stdout),
}

/** The CI checks, as one word: passing, failing, pending, or none. */
export function checksOf(rollup: GhPr['statusCheckRollup'] = []): { state: 'passing' | 'failing' | 'pending' | 'none'; failing: string[] } {
  if (!rollup?.length) return { state: 'none', failing: [] }
  const bad = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
  const failing = rollup.filter((c) => bad.includes(c.conclusion ?? '') || bad.includes(c.state ?? '')).map((c) => c.name ?? c.context ?? '?')
  if (failing.length) return { state: 'failing', failing }
  const pending = rollup.some((c) => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED')
  return { state: pending ? 'pending' : 'passing', failing: [] }
}

const STATE = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const

/** One repo's pull requests: ours updated, everyone else's kept. Returns what changed, for the log. */
export async function syncPrs(appId: string, api: GitHubApi = ghCli) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new Error(`no app ${appId}`)
  const repos = (await db.select().from(repo).where(eq(repo.appId, appId))).filter((r) => r.fullName && r.localPath)
  const me = await api.me()
  const changes: string[] = []
  for (const r of repos) {
    const all = await api.listPrs(r.fullName, r.localPath!)
    const projects = await db.select().from(project).where(and(eq(project.appId, appId), isNotNull(project.integrationBranch)))
    const ours = await db.select().from(prTable).where(eq(prTable.appId, appId))
    for (const g of all) {
      const known = ours.find((x) => x.number === g.number && (x.repoId === r.id || !x.repoId))
      const p = projects.find((x) => x.integrationBranch === g.headRefName || g.headRefName.startsWith(`${x.integrationBranch}--`)) // the project's branch, or one of its issue branches
      if (!known && !p) { await keepOutside(appId, r.id, g, me); continue } // not ours: a teammate's, or opened by hand
      if (!known) continue // our branch, but a PR we never recorded: leave it
      const checks = checksOf(g.statusCheckRollup)
      const signals = { review: g.reviewDecision || null, checks: checks.state, failing: checks.failing, mergeable: g.mergeable ?? null, syncedAt: new Date().toISOString() }
      const status = g.state === 'OPEN' ? (g.isDraft ? 'draft' : 'open') : STATE[g.state]
      const before = known
      const prev = (before.signals ?? {}) as { review?: string | null; checks?: string }
      await db.update(prTable).set({ status, signals, repoId: r.id, url: g.url, headBranch: g.headRefName, baseBranch: g.baseRefName, changedFiles: g.files?.length ?? null, mergedAt: g.mergedAt ? new Date(g.mergedAt) : null, mergeSha: g.mergeCommit?.oid ?? null }).where(eq(prTable.id, before.id))
      const projectId = before.projectId
      const base = { workspaceId: a.workspaceId, appId, projectId, actor: 'github' }
      const say = async (type: string, payload: Record<string, unknown>) => { changes.push(`#${g.number} ${type}`); await db.transaction((tx) => appendEvent(tx, { ...base, type, payload: { number: g.number, url: g.url, ...payload } })) }
      if (before.status !== status && (status === 'merged' || status === 'closed')) await say(`pr.${status}`, { title: g.title })
      if (before.status !== status && status === 'merged') await mergedDone(projectId, before.issueId) // Linear's way: the PR merged, its issues are done
      if ((prev.review ?? null) !== signals.review && signals.review) await say('pr.review', { decision: signals.review })
      if ((prev.checks ?? 'none') !== signals.checks && signals.checks !== 'pending') await say('pr.checks', { state: signals.checks, failing: signals.failing })
    }
    // A stack: once the PR an issue's PR was stacked on has merged (or closed), point the next one at main.
    const rows = await db.select().from(prTable).where(eq(prTable.appId, appId))
    for (const q of rows.filter((x) => ['open', 'draft'].includes(x.status) && x.number && x.baseBranch && x.baseBranch !== a.defaultBranch)) {
      const below = rows.find((x) => x.headBranch === q.baseBranch && x.projectId === q.projectId)
      if (!below || ['open', 'draft'].includes(below.status)) continue
      await api.retarget(r.fullName, q.number!, a.defaultBranch, r.localPath!)
      await db.update(prTable).set({ baseBranch: a.defaultBranch }).where(eq(prTable.id, q.id))
      changes.push(`#${q.number} retargeted`)
      await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, projectId: q.projectId, ...(q.issueId ? { issueId: q.issueId } : {}), actor: 'github', type: 'pr.retargeted', payload: { number: q.number, base: a.defaultBranch, after: below.number } }))
    }
  }
  return { me, changes }
}

/** A PR merged: the code issues it carried are done (one issue's, when stacked; else every issue of the project in review). */
async function mergedDone(projectId: string, issueId: string | null) {
  await db.transaction(async (tx) => {
    const rows = issueId ? await tx.select().from(issue).where(eq(issue.id, issueId))
      : await tx.select().from(issue).where(and(eq(issue.projectId, projectId), eq(issue.kind, 'code'), eq(issue.state, 'in_review')))
    for (const i of rows.filter((x) => !x.parentId && x.state === 'in_review')) await setState(tx, i, 'done', { actor: 'github' })
  })
}

async function keepOutside(appId: string, repoId: string, g: GhPr, me: string) {
  const row = {
    appId, repoId, number: g.number, title: g.title, author: g.author?.login ?? null, url: g.url, state: STATE[g.state], draft: g.isDraft,
    headBranch: g.headRefName, baseBranch: g.baseRefName, reviewRequested: (g.reviewRequests ?? []).some((q) => q.login === me),
    reviewDecision: g.reviewDecision || null, files: (g.files ?? []).map((f) => f.path), updatedAt: g.updatedAt ? new Date(g.updatedAt) : null, syncedAt: new Date(),
  }
  const [was] = await db.select().from(outsidePr).where(and(eq(outsidePr.repoId, repoId), eq(outsidePr.number, g.number)))
  if (was) await db.update(outsidePr).set(row).where(eq(outsidePr.id, was.id))
  else if (row.state === 'open') await db.insert(outsidePr).values(row) // closed ones we never saw open are history, not news
  if (row.reviewRequested && !was?.reviewRequested && row.state === 'open') {
    const [a] = await db.select().from(app).where(eq(app.id, appId))
    await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor: 'github', type: 'review.requested', payload: { number: g.number, title: g.title, author: row.author, url: g.url } }))
  }
}

/**
 * Main moved: merge it into a project's open branches, in a scratch worktree, under the landing lock. One PR per
 * project: the project's branch, from main. Stacked PRs: each issue branch with an open PR, from what it is stacked
 * on (main, or the issue branch below it, already caught up in this pass). Pushed when the branch has a PR. A
 * conflict is reported, not resolved.
 */
export async function catchUp(projectId: string): Promise<{ state: 'current' | 'caught_up' | 'conflict' | 'skipped'; files?: string; commits?: number }> {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p?.integrationBranch) return { state: 'skipped' }
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, p.appId))
  if (!r?.localPath) return { state: 'skipped' }
  const main = `origin/${a.defaultBranch}`
  if ((await git(r.localPath, ['rev-parse', '--verify', '-q', main], { allowFail: true })).code !== 0) return { state: 'skipped' }
  const prs = await db.select().from(prTable).where(eq(prTable.projectId, p.id))
  const issues = await db.select().from(issue).where(eq(issue.projectId, p.id))
  const stacked = prs.filter((q) => q.issueId && q.headBranch && ['open', 'draft'].includes(q.status))
    .sort((x, y) => (issues.find((t) => t.id === x.issueId)?.sortOrder ?? 0) - (issues.find((t) => t.id === y.issueId)?.sortOrder ?? 0))
  const targets = stacked.length
    ? stacked.map((q) => ({ branch: q.headBranch!, from: q.baseBranch && q.baseBranch !== a.defaultBranch ? q.baseBranch : main, pushed: true }))
    : [{ branch: p.integrationBranch, from: main, pushed: prs.some((q) => !q.issueId && q.number) }]
  return withLock(`land:${projectId}`, async () => {
    let result: { state: 'current' | 'caught_up' | 'conflict' | 'skipped'; files?: string; commits?: number } = { state: 'current' }
    for (const t of targets) {
      if (!(await branchExists(r.localPath!, t.branch))) continue
      const one = await mergeFrom(p, a, r.localPath!, t.branch, t.from, t.pushed && !!r.fullName)
      if (one.state === 'conflict') return one // the branches above it wait for this one
      if (one.state === 'caught_up') result = { state: 'caught_up', commits: (result.commits ?? 0) + (one.commits ?? 0) }
    }
    return result
  })
}

async function mergeFrom(p: typeof project.$inferSelect, a: typeof app.$inferSelect, repoPath: string, branchName: string, from: string, pushIt: boolean) {
  if (await isAncestor(repoPath, from, branchName)) return { state: 'current' as const }
  const commits = Number((await git(repoPath, ['rev-list', '--count', `${branchName}..${from}`])).stdout) || 0
  const path = join(`${repoPath}-worktrees`, `${p.id}--catch-up`)
  const scratch = `catch-up/${p.id}`
  const base = { workspaceId: a.workspaceId, appId: a.id, projectId: p.id, actor: 'github' }
  const old = await headSha(repoPath, branchName)
  try {
    await git(repoPath, ['branch', '-f', scratch, old])
    await addWorktree(repoPath, path, scratch, old)
    const merged = await mergeInto(path, from)
    if (!merged.ok) {
      await db.transaction((tx) => appendEvent(tx, { ...base, type: 'project.behind_main', payload: { files: merged.conflict, commits, branch: branchName, from } }))
      return { state: 'conflict' as const, files: merged.conflict, commits }
    }
    const sha = await headSha(path)
    const ff = await fastForward(repoPath, branchName, sha, old)
    if (!ff.ok) return { state: 'skipped' as const } // it moved under us; the next pass tries again
    if (pushIt) await push(repoPath, branchName)
    await db.transaction((tx) => appendEvent(tx, { ...base, type: 'project.caught_up', payload: { commits, sha, branch: branchName, from, pushed: pushIt } }))
    return { state: 'caught_up' as const, commits }
  } finally {
    await removeWorktree(repoPath, path)
    await git(repoPath, ['branch', '-D', scratch], { allowFail: true })
  }
}

/** Fetch the default branch, then bring every open project of the app up to date with it. */
export async function catchUpApp(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, appId))
  if (!a || !r?.localPath) return []
  const fetched = await git(r.localPath, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })
  if (fetched.code !== 0) return []
  const live = await db.select().from(project).where(and(eq(project.appId, appId), notInArray(project.status, ['stopped', 'superseded', 'drafting', 'proposed', 'approved'])))
  const prs = live.length ? await db.select().from(prTable).where(inArray(prTable.projectId, live.map((p) => p.id))) : []
  const out = []
  for (const p of live) {
    const open = prs.filter((x) => x.projectId === p.id && ['open', 'draft'].includes(x.status))
    if (p.status === 'landed' && !open.length) continue // done with: every PR merged or closed
    out.push({ projectId: p.id, ...(await catchUp(p.id)) })
  }
  return out
}

/** One app, both halves. Errors are reported, never thrown: a sync that fails waits for the next pass. */
export async function syncApp(appId: string, api: GitHubApi = ghCli) {
  const out: { prs?: Awaited<ReturnType<typeof syncPrs>>; catchUp?: Awaited<ReturnType<typeof catchUpApp>>; error?: string } = {}
  try { out.prs = await syncPrs(appId, api) } catch (err: any) { out.error = `pull requests: ${String(err?.message ?? err).slice(0, 300)}` }
  try { out.catchUp = await catchUpApp(appId) } catch (err: any) { out.error = [out.error, `main: ${String(err?.message ?? err).slice(0, 300)}`].filter(Boolean).join('; ') }
  lastSync.set(appId, { at: new Date(), error: out.error ?? null })
  return out
}

export const lastSync = new Map<string, { at: Date; error: string | null }>()

/** Every app with a GitHub repo, every `minutes`. Returns a stop function. */
export function startSync(minutes = 2, api: GitHubApi = ghCli) {
  const pass = async () => {
    const apps = await db.select({ appId: repo.appId }).from(repo).where(isNotNull(repo.localPath))
    for (const { appId } of apps) { const r = await syncApp(appId, api); if (r.error) console.log(`[github] ${appId}: ${r.error}`) }
  }
  const first = setTimeout(() => void pass(), 5_000)
  const timer = setInterval(() => void pass(), minutes * 60_000)
  return () => { clearTimeout(first); clearInterval(timer) }
}
