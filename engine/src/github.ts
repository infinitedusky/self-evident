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
import { app, outsidePr, pr as prTable, project, repo } from './db/schema.js'
import { appendEvent } from './events.js'
import { addWorktree, branchExists, git, headSha, isAncestor, mergeInto, push, removeWorktree, fastForward } from './git.js'
import { withLock } from './landing.js'

const execFileP = promisify(execFile)

export interface GhPr {
  number: number; title: string; url: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; isDraft: boolean
  author?: { login: string } | null; headRefName: string; baseRefName: string
  reviewDecision?: string | null; reviewRequests?: { login?: string; name?: string; slug?: string }[]
  statusCheckRollup?: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[]
  mergeable?: string; mergedAt?: string | null; updatedAt?: string; files?: { path: string }[]; mergeCommit?: { oid: string } | null
}
export interface GitHubApi { me: () => Promise<string>; listPrs: (fullName: string, cwd: string) => Promise<GhPr[]> }

const FIELDS = 'number,title,url,state,isDraft,author,headRefName,baseRefName,reviewDecision,reviewRequests,statusCheckRollup,mergeable,mergedAt,updatedAt,files,mergeCommit'
let login: string | null = null
export const ghCli: GitHubApi = {
  me: async () => (login ??= (await execFileP('gh', ['api', 'user', '--jq', '.login'])).stdout.trim()),
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
      const p = projects.find((x) => x.integrationBranch === g.headRefName)
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
      if ((prev.review ?? null) !== signals.review && signals.review) await say('pr.review', { decision: signals.review })
      if ((prev.checks ?? 'none') !== signals.checks && signals.checks !== 'pending') await say('pr.checks', { state: signals.checks, failing: signals.failing })
    }
  }
  return { me, changes }
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
 * Main moved: merge the app's default branch (as on origin) into one project's branch, in a scratch worktree, under
 * the landing lock. Pushed if the branch is already on GitHub (it has a PR). A conflict is reported, not resolved.
 */
export async function catchUp(projectId: string): Promise<{ state: 'current' | 'caught_up' | 'conflict' | 'skipped'; files?: string; commits?: number }> {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p?.integrationBranch) return { state: 'skipped' }
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, p.appId))
  if (!r?.localPath || !(await branchExists(r.localPath, p.integrationBranch))) return { state: 'skipped' }
  return withLock(`land:${projectId}`, async () => {
    const main = `origin/${a.defaultBranch}`
    if ((await git(r.localPath!, ['rev-parse', '--verify', '-q', main], { allowFail: true })).code !== 0) return { state: 'skipped' as const }
    if (await isAncestor(r.localPath!, main, p.integrationBranch!)) return { state: 'current' as const }
    const commits = Number((await git(r.localPath!, ['rev-list', '--count', `${p.integrationBranch}..${main}`])).stdout) || 0
    const path = join(`${r.localPath}-worktrees`, `${p.id}--catch-up`)
    const branch = `catch-up/${p.id}`
    const base = { workspaceId: a.workspaceId, appId: a.id, projectId: p.id, actor: 'github' }
    const old = await headSha(r.localPath!, p.integrationBranch!)
    try {
      await git(r.localPath!, ['branch', '-f', branch, old])
      await addWorktree(r.localPath!, path, branch, old)
      const merged = await mergeInto(path, main)
      if (!merged.ok) {
        await db.transaction((tx) => appendEvent(tx, { ...base, type: 'project.behind_main', payload: { files: merged.conflict, commits, branch: p.integrationBranch } }))
        return { state: 'conflict' as const, files: merged.conflict, commits }
      }
      const sha = await headSha(path)
      const ff = await fastForward(r.localPath!, p.integrationBranch!, sha, old)
      if (!ff.ok) return { state: 'skipped' as const } // it moved under us; the next pass tries again
      const [thePr] = await db.select().from(prTable).where(eq(prTable.projectId, p.id))
      if (thePr?.number && r.fullName) await push(r.localPath!, p.integrationBranch!)
      await db.transaction((tx) => appendEvent(tx, { ...base, type: 'project.caught_up', payload: { commits, sha, pushed: !!thePr?.number } }))
      return { state: 'caught_up' as const, commits }
    } finally {
      await removeWorktree(r.localPath!, path)
      await git(r.localPath!, ['branch', '-D', branch], { allowFail: true })
    }
  })
}

/** Fetch the default branch, then bring every open project of the app up to date with it. */
export async function catchUpApp(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, appId))
  if (!a || !r?.localPath) return []
  const fetched = await git(r.localPath, ['fetch', '-q', 'origin', a.defaultBranch], { allowFail: true })
  if (fetched.code !== 0) return []
  const open = await db.select().from(project).where(and(eq(project.appId, appId), notInArray(project.status, ['stopped', 'superseded', 'drafting', 'proposed', 'approved'])))
  const prs = open.length ? await db.select().from(prTable).where(inArray(prTable.projectId, open.map((p) => p.id))) : []
  const out = []
  for (const p of open) {
    const thePr = prs.find((x) => x.projectId === p.id)
    if (p.status === 'landed' && (!thePr || thePr.status === 'merged' || thePr.status === 'closed')) continue // done with
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
