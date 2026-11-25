/**
 * A review of a pull request that is someone else's (Sandy, 2026-11-25: "I want to choose a PR that isn't mine and I
 * want to review it … all from here, using the context we built up"). The simplest version: pick an open pull request
 * of the app's repository, and the engine runs on it what it runs on a task of ours before its own goes out:
 *
 * 1. a checkout of its head that is the engine's own, prepared as the finalizing's is;
 * 2. mutation testing of the lines it changed, against the tests it changed (mutation.ts);
 * 3. the commands every build of this app is held to (held.ts).
 *
 * From what those find it drafts comments. **Nothing is sent to GitHub, ever**: "An agent shouldn't comment on other
 * people's PRs. It could suggest comments, but we would do that." The page shows each one to copy, beside a link to
 * its line.
 *
 * It runs the pull request's code on this computer (its tests, whatever its install runs), and that code has not been
 * reviewed: that is the point of it. The page says so before anything is run, and a run is only ever started by a
 * person's press.
 *
 * Kept as events on the app (`pr_review.*`), as a finalizing is: a review belongs to no task.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app as appTable, event, repo as repoTable } from './db/schema.js'
import { appendEvent } from './events.js'
import { checkoutAt, mutateAt } from './finalize.js'
import { git } from './git.js'
import { heldOf, whenRun } from './held.js'
import { PlanError } from './issues.js'
import { scoreOf, sh as realSh, type Sh, type Survivor } from './mutation.js'
import { finalizePrepare } from './mutation-setup.js'
import { TEST_FILE } from './trajectory.js'

const execFileP = promisify(execFile)
export type Gh = (args: string[], cwd: string) => Promise<string>
const realGh: Gh = (args, cwd) => execFileP(process.env.GH_BIN ?? 'gh', args, { cwd, maxBuffer: 20_000_000, timeout: 30_000 }).then((r) => r.stdout.trim())
export interface Deps { gh?: Gh; sh?: Sh }

export type StepKey = 'checkout' | 'mutation' | 'commands'
export interface Step { key: StepKey; name: string; state: 'waiting' | 'running' | 'pass' | 'fail' | 'skipped'; says: string }
export const REVIEW_STEPS: readonly { key: StepKey; name: string }[] = [
  { key: 'checkout', name: 'Its code, checked out here' },
  { key: 'mutation', name: 'Mutation testing of the lines it changed' },
  { key: 'commands', name: 'The commands this app is held to' },
]
export interface CommandRan { key: string; name: string; runs: string; pass: boolean; /** Its last lines. */ output: string }
/** A comment the person might make. `file` and `line` when it is about one line; `url` opens that line in the pull request. */
export interface Suggestion { id: string; from: 'mutation' | 'command'; file: string | null; line: number | null; url: string | null; text: string }
export interface Found {
  steps: Step[]
  mutation: { tool: 'evident' | 'app'; tried: number; caught: number; meaningful: number; percent: number | null; survivors: Survivor[]; partial?: string } | null
  commands: CommandRan[]
  suggestions: Suggestion[]
}
export interface Pull { repo: string; number: number; title: string; url: string; author: string; draft: boolean; branch: string; base: string; head: string; updatedAt: string | null; files: number; /** The person's own: it can be reviewed here too, but it is theirs to finalize. */ mine: boolean }
export interface ReviewSummary { state: 'running' | 'done' | 'failed'; sha: string; at: string; /** The pull request has moved since. */ stale: boolean; suggestions: number; survivors: number; failed: number }
export interface ReviewView extends Found {
  pull: Pull | null
  state: 'none' | 'running' | 'done' | 'failed'
  /** The commit reviewed, and whether the pull request has moved since. */ sha: string | null; stale: boolean
  at: string | null; problem: string | null
  /** Said before anything is run: this is code nobody here has read. */ warning: string
}
export const WARNING = 'This runs the pull request\'s code on this computer: its tests, and whatever installing it runs. Nobody here has reviewed that code yet. Run it for people you trust.'

/** Where a line is in a pull request's Files tab: GitHub anchors a file by the SHA-256 of its path, and a line on the new side with R. Pure. */
export const lineUrl = (prUrl: string, file: string, line: number) => `${prUrl.replace(/\/$/, '')}/files#diff-${createHash('sha256').update(file).digest('hex')}R${line}`

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
/** The comments drafted from what a review found: one per break no test caught, then one per command that fails. Pure. */
export function suggest(i: { prUrl: string; survivors: Survivor[]; commands: CommandRan[] }): Suggestion[] {
  const fromBreaks = i.survivors.filter((s) => !s.equivalent).map((s): Suggestion => ({
    id: `m:${s.id}`, from: 'mutation', file: s.file, line: s.line, url: lineUrl(i.prUrl, s.file, s.line),
    text: `Changing \`${s.from.trim()}\` to \`${s.to.trim() || 'nothing'}\` on this line doesn't fail any of the tests in this pull request. ${cap(s.means)}. Is it worth a test that pins it?`,
  }))
  const fromCommands = i.commands.filter((c) => !c.pass).map((c): Suggestion => ({
    id: `c:${c.key}`, from: 'command', file: null, line: null, url: null,
    text: `${c.name} fails for me on this branch (\`${c.runs.length > 140 ? `${c.runs.slice(0, 140)}…` : c.runs}\`):\n\n\`\`\`\n${c.output}\n\`\`\``,
  }))
  return [...fromBreaks, ...fromCommands]
}

interface Going { run: string; sha: string; steps: Step[]; abort: AbortController }
const going = new Map<string, Going>()
const keyOf = (appId: string, repo: string, number: number) => `${appId}:${repo}#${number}`
const TYPES = ['pr_review.started', 'pr_review.done', 'pr_review.failed']

async function placeOf(appId: string, fullName: string) {
  const [a] = await db.select().from(appTable).where(eq(appTable.id, appId))
  if (!a) throw new PlanError('no such app')
  const [r] = (await db.select().from(repoTable).where(eq(repoTable.appId, appId))).filter((x) => x.fullName === fullName)
  if (!r) throw new PlanError(`${fullName} is not one of this app's repositories`)
  if (!r.localPath || !existsSync(r.localPath)) throw new PlanError(`${fullName} has no folder on this computer to check a pull request out in`)
  return { a, r, local: r.localPath }
}

type GhPull = { number: number; title: string; url: string; isDraft?: boolean; author?: { login?: string } | null; headRefName?: string; baseRefName?: string; headRefOid?: string; updatedAt?: string; changedFiles?: number; state?: string }
const FIELDS = 'number,title,url,isDraft,author,headRefName,baseRefName,headRefOid,updatedAt,changedFiles,state'
const pullOf = (repo: string, p: GhPull, me: string | null): Pull => ({ repo, number: p.number, title: p.title, url: p.url, author: p.author?.login ?? 'someone', draft: !!p.isDraft, branch: p.headRefName ?? '', base: p.baseRefName ?? 'main', head: p.headRefOid ?? '', updatedAt: p.updatedAt ?? null, files: p.changedFiles ?? 0, mine: !!me && p.author?.login === me })

/** The latest of each pull request's reviews, newest event first. */
async function latest(appId: string): Promise<Map<string, { started: typeof event.$inferSelect | null; ended: typeof event.$inferSelect | null }>> {
  const rows = await db.select().from(event).where(and(eq(event.appId, appId), inArray(event.type, TYPES))).orderBy(desc(event.seq)).limit(600)
  const by = new Map<string, { run: string; started: typeof event.$inferSelect | null; ended: typeof event.$inferSelect | null }>()
  for (const e of rows) {
    const p = e.payload as { repo?: string; number?: number; run?: string }
    const k = `${p.repo}#${p.number}`
    const got = by.get(k) ?? { run: p.run ?? '', started: null, ended: null }
    if (got.run !== p.run) continue // an earlier run of the same pull request
    if (e.type === 'pr_review.started') got.started = e; else got.ended ??= e
    by.set(k, got)
  }
  return by
}

/**
 * What GitHub last said is open, by app. Reading a hundred pull requests from each repository takes seconds, and the
 * page asks every time it is opened: so it is read once and kept for a few minutes, and read again when the person
 * presses Refresh. Where each review stands is not kept: that is the engine's own and is read each time.
 */
const LIST_KEPT_MS = 5 * 60_000
const kept = new Map<string, { at: number; me: string | null; pulls: Pull[]; problems: string[]; repos: string[] }>()
let login: string | null = null
const meOf = async (gh: Gh) => (login ??= await gh(['api', 'user', '--jq', '.login'], process.cwd()).catch(() => null))
/** For a test: nothing kept. */
export const forgetPulls = () => { kept.clear(); login = null }

/** The open pull requests of the app's repositories, other people's first, each with where its review stands. `fresh`: read from GitHub now, whatever is kept. */
export async function listPulls(appId: string, deps: Deps = {}, o: { fresh?: boolean } = {}): Promise<{ me: string | null; pulls: (Pull & { review: ReviewSummary | null })[]; problems: string[]; warning: string; /** The app's repositories a pull request can be opened from, home first. */ repos: string[]; /** When GitHub was last read. */ readAt: string }> {
  const gh = deps.gh ?? realGh
  let got = kept.get(appId)
  if (!got || o.fresh || Date.now() - got.at > LIST_KEPT_MS) {
    const repos = (await db.select().from(repoTable).where(eq(repoTable.appId, appId))).filter((r) => r.fullName && r.localPath)
    // Every repository at once, and who is asking beside them: one after another is the sum of their waits.
    const [me, ...read] = await Promise.all([meOf(gh), ...repos.map(async (r) => {
      try { return { pulls: JSON.parse(await gh(['pr', 'list', '-R', r.fullName, '--state', 'open', '--limit', '100', '--json', FIELDS], r.localPath!)) as GhPull[], repo: r.fullName, problem: null } }
      catch (err) { return { pulls: [] as GhPull[], repo: r.fullName, problem: `${r.fullName} could not be read from GitHub: ${String((err as { stderr?: string }).stderr ?? (err as Error).message).trim().split('\n')[0].slice(0, 200)}` } }
    })])
    const pulls = read.flatMap((x) => x.pulls.map((p) => pullOf(x.repo, p, me)))
    pulls.sort((x, y) => Number(x.mine) - Number(y.mine) || String(y.updatedAt).localeCompare(String(x.updatedAt)))
    got = { at: Date.now(), me, pulls, problems: read.flatMap((x) => (x.problem ? [x.problem] : [])), repos: repos.map((r) => r.fullName) }
    if (!got.problems.length) kept.set(appId, got); else kept.delete(appId) // a failure is not kept: the next look asks again
  }
  const last = await latest(appId)
  const summary = (p: Pull): ReviewSummary | null => {
    const l = last.get(`${p.repo}#${p.number}`); if (!l?.started) return null
    const sha = String((l.started.payload as { sha?: string }).sha ?? ''), found = (l.ended?.payload as { found?: Found } | undefined)?.found
    const running = going.has(keyOf(appId, p.repo, p.number))
    return { state: running ? 'running' : l.ended?.type === 'pr_review.done' ? 'done' : 'failed', sha, at: (l.ended ?? l.started).ts.toISOString(), stale: !!p.head && !!sha && p.head !== sha, suggestions: found?.suggestions.length ?? 0, survivors: found?.mutation?.survivors.filter((s) => !s.equivalent).length ?? 0, failed: found?.commands.filter((c) => !c.pass).length ?? 0 }
  }
  return { me: got.me, pulls: got.pulls.map((p) => ({ ...p, review: summary(p) })), problems: got.problems, warning: WARNING, repos: got.repos, readAt: new Date(got.at).toISOString() }
}

export { namedPull } from './pr-named.js'

const waiting = (): Step[] => REVIEW_STEPS.map((s) => ({ ...s, state: 'waiting', says: '' }))

/** One pull request's review: where it stands and what it found. */
export async function reviewView(appId: string, fullName: string, number: number, deps: Deps = {}): Promise<ReviewView> {
  const { local } = await placeOf(appId, fullName)
  const gh = deps.gh ?? realGh
  let pull: Pull | null = null, problem: string | null = null
  try { const me = await meOf(gh); pull = pullOf(fullName, JSON.parse(await gh(['pr', 'view', String(number), '-R', fullName, '--json', FIELDS], local)) as GhPull, me) }
  catch (err) { problem = `GitHub could not be asked about #${number}: ${String((err as { stderr?: string }).stderr ?? (err as Error).message).trim().split('\n')[0].slice(0, 200)}` }
  const now = going.get(keyOf(appId, fullName, number))
  const l = (await latest(appId)).get(`${fullName}#${number}`)
  const none: Found = { steps: waiting(), mutation: null, commands: [], suggestions: [] }
  if (now) return { ...none, steps: now.steps, pull, state: 'running', sha: now.sha, stale: false, at: null, problem, warning: WARNING }
  if (!l?.started) return { ...none, pull, state: 'none', sha: null, stale: false, at: null, problem, warning: WARNING }
  const sha = String((l.started.payload as { sha?: string }).sha ?? '')
  const stale = !!pull?.head && pull.head !== sha
  if (l.ended?.type === 'pr_review.done') return { ...((l.ended.payload as { found: Found }).found), pull, state: 'done', sha, stale, at: l.ended.ts.toISOString(), problem, warning: WARNING }
  // Failed, or started by an engine that has since stopped: either way it did not finish.
  return { ...none, pull, state: 'failed', sha, stale, at: (l.ended ?? l.started).ts.toISOString(), problem: problem ?? String((l.ended?.payload as { error?: string } | undefined)?.error ?? 'The engine stopped while it was running. Run it again.'), warning: WARNING }
}

/** One review, start to end. Awaited by a test; started and left to run by the page's press (startReview). */
export async function runReview(appId: string, fullName: string, number: number, deps: Deps = {}, actor = 'user'): Promise<void> {
  const { a, local } = await placeOf(appId, fullName)
  const gh = deps.gh ?? realGh, run = deps.sh ?? realSh
  const key = keyOf(appId, fullName, number)
  if (going.has(key)) throw new PlanError('this pull request is already being reviewed')
  let pr: GhPull
  try { pr = JSON.parse(await gh(['pr', 'view', String(number), '-R', fullName, '--json', FIELDS], local)) as GhPull } catch (err) { throw new PlanError(`GitHub could not be asked about #${number}: ${String((err as { stderr?: string }).stderr ?? (err as Error).message).trim().split('\n')[0].slice(0, 200)}`) }
  if (pr.state && pr.state !== 'OPEN') throw new PlanError(`#${number} is ${pr.state.toLowerCase()}: there is nothing left to review`)
  const id = `${Date.now().toString(36)}`
  const steps = waiting(), abort = new AbortController()
  const emit = (type: string, payload: Record<string, unknown>, by = 'engine') => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor: by, type, payload: { repo: fullName, number, run: id, ...payload } }))
  const set = async (k: StepKey, state: Step['state'], says: string) => { const s = steps.find((x) => x.key === k)!; s.state = state; s.says = says; await emit('pr_review.step', { key: k, state, says: says.slice(0, 600) }) }
  const tail = (out: string, n = 12) => out.trim().split('\n').slice(-n).join('\n').slice(-1200)
  going.set(key, { run: id, sha: pr.headRefOid ?? '', steps, abort })
  try {
    await emit('pr_review.started', { sha: pr.headRefOid ?? '', title: pr.title, author: pr.author?.login ?? null }, actor)
    // 1. Its code, here. GitHub keeps every pull request's head at refs/pull/<n>/head, a fork's too.
    await set('checkout', 'running', '')
    const ref = `refs/evident/review/${number}`, base = pr.baseRefName ?? 'main'
    const fetched = await git(local, ['fetch', '--quiet', 'origin', `+refs/pull/${number}/head:${ref}`, `+refs/heads/${base}:refs/remotes/origin/${base}`], { allowFail: true })
    const head = (await git(local, ['rev-parse', '--verify', '--quiet', ref], { allowFail: true })).stdout.trim()
    if (!head) { await set('checkout', 'fail', `Its code could not be fetched from GitHub: ${tail(fetched.stderr || fetched.stdout, 3) || 'no such pull request there'}`); throw new PlanError('its code could not be fetched') }
    going.get(key)!.sha = head
    const path = join(`${local}-worktrees`, `review-of--${number}`)
    await checkoutAt(local, path, head)
    const baseRef = `origin/${base}`
    const files = (await git(local, ['diff', '--name-only', '--diff-filter=AM', `${baseRef}...${head}`], { allowFail: true })).stdout.split('\n').filter(Boolean)
    const prepare = finalizePrepare(a.setup)
    let prepared = true
    if (prepare) { const p = await run(prepare, path, 15 * 60_000); if (p.exit !== 0) { prepared = false; await set('checkout', 'fail', `At ${head.slice(0, 7)}, but it could not be prepared (\`${prepare.slice(0, 120)}\`): ${tail(p.output, 4)}`) } }
    if (prepared) await set('checkout', 'pass', `At ${head.slice(0, 7)}: ${files.length} file${files.length === 1 ? '' : 's'} changed against ${base}.${prepare ? '' : ' Nothing was run in it first (the app\'s settings, finalize.prepare).'}`)

    // 2. The breaks, against the tests it changed.
    let mutation: Found['mutation'] = null
    if (!prepared) await set('mutation', 'skipped', 'Its checkout could not be prepared, so its tests cannot be run.')
    else {
      await set('mutation', 'running', '')
      const tests = files.filter((f) => TEST_FILE.test(f) && existsSync(join(path, f)))
      const m = await mutateAt({ setup: a.setup, repo: local, head, base: baseRef, path, tests, run, signal: abort.signal, prepared: true, onProgress: (says) => { const s = steps.find((x) => x.key === 'mutation')!; s.says = says } })
      if (m.result) { const s = scoreOf(m.result); mutation = { tool: m.result.tool, tried: m.result.tried, caught: s.caught, meaningful: s.meaningful, percent: s.percent, survivors: m.result.survivors, ...(m.result.partial ? { partial: m.result.partial } : {}) } }
      await set('mutation', m.state, m.says.replace('The pull request has no tests of its own to run a break against: no test plan, and no test file added or changed.', 'It adds or changes no test file, so there is nothing of its own to run a break against.'))
    }

    // 3. What every build of this app is held to, as commands.
    const commands: CommandRan[] = []
    const held = heldOf(a.setup).filter((h) => h.kind === 'command' && h.on && whenRun(h) === 'build' && h.runs.trim())
    if (!prepared) await set('commands', 'skipped', 'Its checkout could not be prepared, so nothing can be run in it.')
    else if (!held.length) await set('commands', 'skipped', 'This app holds a build to no command (Settings › Skills).')
    else {
      await set('commands', 'running', '')
      for (const h of held) {
        if (abort.signal.aborted) break
        steps.find((x) => x.key === 'commands')!.says = `Running ${h.name}… (${commands.length + 1} of ${held.length})`
        const r = await run(h.runs, path, 30 * 60_000)
        commands.push({ key: h.id, name: h.name, runs: h.runs, pass: r.exit === 0, output: r.exit === 0 ? '' : r.timedOut ? 'It did not finish in 30 minutes.' : tail(r.output) })
      }
      const failed = commands.filter((c) => !c.pass)
      await set('commands', failed.length ? 'fail' : 'pass', failed.length ? `${failed.length} of ${commands.length} fail: ${failed.map((c) => c.name).join(', ')}.` : `All ${commands.length} pass.`)
    }
    await git(path, ['checkout', '--force', '--', '.'], { allowFail: true })
    const found: Found = { steps, mutation, commands, suggestions: suggest({ prUrl: pr.url, survivors: mutation?.survivors ?? [], commands }) }
    await emit('pr_review.done', { sha: head, found })
  } catch (err) {
    await emit('pr_review.failed', { error: String((err as Error).message).split('\n')[0].slice(0, 400), steps }).catch(() => {})
    if (!(err instanceof PlanError)) console.warn(`[engine] the review of ${fullName}#${number} failed: ${(err as Error).message}`)
  } finally { going.delete(key) }
}

/** The page's press: it runs by itself from here. Never started by anything else. */
export async function startReview(appId: string, fullName: string, number: number, deps: Deps = {}, actor = 'user'): Promise<void> {
  await placeOf(appId, fullName)
  if (going.has(keyOf(appId, fullName, number))) throw new PlanError('this pull request is already being reviewed')
  void runReview(appId, fullName, number, deps, actor).catch((err) => console.warn(`[engine] a review would not start: ${(err as Error).message}`))
}
