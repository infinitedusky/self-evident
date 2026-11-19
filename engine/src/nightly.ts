/**
 * Nightly checks (Sandy, 2026-11-19, on Bonkei's every-page docs smoke running on every pull request: "I feel like
 * this should be a nightly check"; asked whether Self Evident can allow it: "great lets do that"; and "the schedule
 * would be set in github and we would just be able to select it").
 *
 * A slow suite leaves the pull request and runs on a schedule on the default branch: the nightly build. The schedule
 * is the repository's own (a workflow with `schedule:` in `.github/workflows/`); Self Evident runs nothing. An app
 * names the workflow as one of the things its builds are held to, with "nightly" as when (held.ts), picked from the
 * workflows its checkout has. The engine then reads that workflow's last runs on the default branch with `gh`, with
 * the GitHub sync, and keeps one row for each: passed or failed, how many runs in a row have failed, and the last
 * green run. A failure is said once (`nightly.failed`) and shows under what needs the person, with the tasks merged
 * since the last green run: one of them broke it. Nothing waits for a nightly check and it blocks nothing.
 */
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { and, eq } from 'drizzle-orm'
import { parse } from 'yaml'
import { db } from './db/client.js'
import { app, nightly, repo } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { leftTo } from './probe-list.js'

const execFileP = promisify(execFile)

export interface GhRun { databaseId: number; status: string; conclusion: string | null; createdAt: string; url: string; headSha: string; event?: string }
export type RunsApi = (fullName: string, workflow: string, branch: string, cwd: string) => Promise<GhRun[]>
/** The workflow's last runs on a branch, newest first. */
export const ghRuns: RunsApi = async (fullName, workflow, branch, cwd) =>
  JSON.parse((await execFileP('gh', ['run', 'list', '-R', fullName, '--workflow', workflow, '--branch', branch, '--limit', '20', '--json', 'databaseId,status,conclusion,createdAt,url,headSha,event'], { cwd, maxBuffer: 8 * 1024 * 1024 })).stdout) as GhRun[]

const GREEN = ['success'], RED = ['failure', 'timed_out', 'startup_failure']
export interface Night { status: 'passed' | 'failed' | 'none'; /** The run that says so. */ run: GhRun | null; /** How many runs in a row have failed, newest first. */ failing: number; /** The last run that passed. */ green: GhRun | null }
/**
 * What a workflow's runs say. Pure. Only a run that finished as passed or failed counts: one still running, cancelled
 * or skipped says nothing, and the one before it stands. A run on a pull request is not the nightly one.
 */
export function nightOf(runs: GhRun[]): Night {
  const said = runs.filter((r) => r.event !== 'pull_request' && r.status === 'completed' && [...GREEN, ...RED].includes(r.conclusion ?? '')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const green = said.find((r) => GREEN.includes(r.conclusion!)) ?? null
  if (!said.length) return { status: 'none', run: null, failing: 0, green: null }
  const failing = green ? said.indexOf(green) : said.length
  return { status: failing ? 'failed' : 'passed', run: said[0], failing, green }
}

export interface WorkflowFile { /** Its file in `.github/workflows/`: what `gh` and the settings name it by. */ file: string; name: string; /** It runs on a schedule. */ scheduled: boolean; /** It runs on pull requests. */ onPr: boolean; /** Its jobs, as their checks are named on a pull request. */ jobs: string[] }
/** One workflow file, read. Pure; null when it is not a workflow. */
export function readWorkflow(file: string, text: string): WorkflowFile | null {
  let y: unknown
  try { y = parse(text) } catch { return null }
  if (!y || typeof y !== 'object') return null
  const w = y as { name?: unknown; on?: unknown; true?: unknown; jobs?: Record<string, { name?: unknown } | null> }
  const on = w.on ?? w.true // YAML 1.1 readers take a bare `on` for true
  const has = (k: string) => (typeof on === 'string' ? on === k : Array.isArray(on) ? on.includes(k) : !!on && typeof on === 'object' && k in on)
  return { file, name: typeof w.name === 'string' && w.name.trim() ? w.name.trim() : file, scheduled: has('schedule'), onPr: has('pull_request') || has('pull_request_target'),
    jobs: Object.entries(w.jobs ?? {}).map(([id, j]) => (typeof j?.name === 'string' && !j.name.includes('${{') ? j.name : id)) }
}
/** The workflows a checkout has, for picking one in Settings. */
export async function workflowsIn(localPath: string): Promise<WorkflowFile[]> {
  const dir = join(localPath, '.github', 'workflows')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /\.ya?ml$/.test(f)).sort()
  const out: WorkflowFile[] = []
  for (const f of files) { const w = readWorkflow(f, await readFile(join(dir, f), 'utf8').catch(() => '')); if (w) out.push(w) }
  return out
}

const home = async (appId: string) => (await db.select().from(repo).where(eq(repo.appId, appId))).find((r) => r.localPath) ?? null
const EVERY_MS = 15 * 60_000
const read = new Map<string, number>()

/**
 * Read each nightly check of an app from GitHub and keep what it says. At most every fifteen minutes with the sync;
 * `force` reads now (the settings page, a check just added). A workflow that cannot be read keeps what was known.
 */
export async function syncNightly(appId: string, api: RunsApi = ghRuns, force = false) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const r = a ? await home(appId) : null
  const held = a ? leftTo(a.setup, 'nightly') : []
  const was = await db.select().from(nightly).where(eq(nightly.appId, appId))
  for (const old of was.filter((w) => !held.some((h) => h.key === w.key))) await db.delete(nightly).where(eq(nightly.id, old.id)) // no longer held to it
  if (!a || !r?.localPath || !held.length) return []
  if (!force && Date.now() - (read.get(appId) ?? 0) < EVERY_MS && held.every((h) => was.some((w) => w.key === h.key && w.workflow === h.runs))) return was
  read.set(appId, Date.now())
  const branch = r.baseBranch ?? a.defaultBranch
  for (const h of held) {
    const before = was.find((w) => w.key === h.key && w.workflow === h.runs)
    let n: Night, error: string | null = null
    try { n = nightOf(await api(r.fullName, h.runs, branch, r.localPath)) } catch (err: any) {
      error = String(err?.stderr ?? err?.message ?? err).trim().split('\n')[0].slice(0, 200)
      if (before) { await db.update(nightly).set({ error, checkedAt: new Date() }).where(eq(nightly.id, before.id)); continue }
      n = { status: 'none', run: null, failing: 0, green: null }
    }
    const row = { appId, key: h.key, workflow: h.runs, status: n.status, runId: n.run ? String(n.run.databaseId) : null, url: n.run?.url ?? null, sha: n.run?.headSha ?? null, ranAt: n.run ? new Date(n.run.createdAt) : null,
      failing: n.failing, greenAt: n.green ? new Date(n.green.createdAt) : null, greenSha: n.green?.headSha ?? null, error, checkedAt: new Date() }
    if (before) await db.update(nightly).set(row).where(eq(nightly.id, before.id))
    else { await db.delete(nightly).where(and(eq(nightly.appId, appId), eq(nightly.key, h.key))); await db.insert(nightly).values({ id: newId('nightly'), ...row }) }
    // Said once for each run that changes the answer: a second red night is news, a second green one is not.
    const news = n.status === 'failed' ? before?.runId !== row.runId : n.status === 'passed' && before?.status === 'failed'
    if (news) await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor: 'engine', type: n.status === 'failed' ? 'nightly.failed' : 'nightly.passed', payload: { key: h.key, name: h.name, workflow: h.runs, url: row.url, failing: n.failing } }))
  }
  return db.select().from(nightly).where(eq(nightly.appId, appId))
}

/** For Settings: each nightly check's last word, and the workflows the checkout has to pick from. */
export async function nightlyView(appId: string, api: RunsApi = ghRuns) {
  const r = await home(appId)
  const rows = await syncNightly(appId, api).catch(() => db.select().from(nightly).where(eq(nightly.appId, appId)))
  return {
    checks: rows.map((n) => ({ key: n.key, workflow: n.workflow, status: n.status, url: n.url, ranAt: n.ranAt, failing: n.failing, greenAt: n.greenAt, error: n.error })),
    workflows: r?.localPath ? await workflowsIn(r.localPath) : [],
  }
}
