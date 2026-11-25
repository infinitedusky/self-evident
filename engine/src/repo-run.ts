/**
 * How one repository is brought up and run, set once for the repository and used for every pull request in it
 * (Sandy, 2026-11-25: "for whatever repo we can get the environment up every time … We shouldn't be doing it on a PR
 * by PR basis. It should be on a repository basis"). Kept as scripts in the app's workbench folder, as its hooks are
 * (hooks.ts): what is particular to one repository is a script of its people's, versioned with their others, and
 * Evident knows only when to run each.
 *
 *     <workbench>/repos/<repository's short name>/
 *       setup       once per checkout: install what it needs
 *       up          bring up what its tests need (a database, a service). NAME=value lines it prints are given to
 *                   test, the checks and down
 *       test        run the test files given as arguments; with none, whatever it chooses
 *       checks/*    one script per check (lint, types); exit 0 passes
 *       down        stop what up started; always run after up, whatever happened between
 *
 * Any extension. One that can be executed is run as it is; any other with sh. Each is run from the checkout's top
 * folder with CHECKOUT, REPO, BASE and HEAD set, and PR for a pull request. A review (pr-review.ts) uses them;
 * **Check it** runs them all on the default branch, so they are known to work before any pull request is looked at.
 *
 * The app's own tasks (the build, the check, the finalizing) still run from the app's settings: those move here once
 * this has proved itself.
 */
import { accessSync, constants, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app as appTable, event } from './db/schema.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { gaveOf, workbenchDirOf } from './hooks.js'
import { PlanError } from './issues.js'
import { sh as realSh, type Sh } from './mutation.js'
import { reposOf } from './workbench.js'

export const PARTS = ['setup', 'up', 'test', 'down'] as const
export type Part = (typeof PARTS)[number]
export const PART_SAYS: Record<Part | 'checks', string> = {
  setup: 'Once per checkout: installs what it needs.',
  up: 'Brings up what its tests need. NAME=value lines it prints are given to the rest.',
  test: 'Runs the test files given as arguments; with none, whatever it chooses.',
  checks: 'One script per check; exit 0 passes.',
  down: 'Stops what up started. Always run after up.',
}
export interface RepoScripts {
  repo: string
  /** Where its scripts go, whether or not the folder is there yet; null: the app has no workbench folder. */ dir: string | null
  /** The folder is there with at least one script in it. */ has: boolean
  setup: string | null; up: string | null; test: string | null; down: string | null
  checks: { name: string; file: string }[]
}
const shortName = (fullName: string) => fullName.split('/').pop() || fullName
const isFile = (p: string) => { try { return statSync(p).isFile() } catch { return false } }
const find = (dir: string, part: string): string | null => { if (!existsSync(dir)) return null; const n = readdirSync(dir).sort().find((f) => (f === part || f.startsWith(`${part}.`)) && isFile(join(dir, f))); return n ? join(dir, n) : null }
/** `lint-and-format.sh` is shown as "Lint and format". */
export const checkName = (file: string) => { const n = basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(); return n ? n[0].toUpperCase() + n.slice(1) : file }

/** A repository's scripts, read from the workbench folder. Nothing is kept: the folder is the record. */
export function scriptsOf(setup: unknown, fullName: string): RepoScripts {
  const bench = workbenchDirOf(setup)
  const none: RepoScripts = { repo: fullName, dir: bench ? join(bench, 'repos', shortName(fullName)) : null, has: false, setup: null, up: null, test: null, down: null, checks: [] }
  if (!none.dir || !existsSync(none.dir)) return none
  const dir = none.dir, checksDir = join(dir, 'checks')
  const checks = existsSync(checksDir) ? readdirSync(checksDir).sort().filter((f) => !f.startsWith('.') && !/^readme/i.test(f) && isFile(join(checksDir, f))).map((f) => ({ name: checkName(f), file: join(checksDir, f) })) : []
  const got = { setup: find(dir, 'setup'), up: find(dir, 'up'), test: find(dir, 'test'), down: find(dir, 'down') }
  return { ...none, ...got, checks, has: !!(got.setup || got.up || got.test || got.down || checks.length) }
}

const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`
const executable = (p: string) => { try { accessSync(p, constants.X_OK); return true } catch { return false } }
/** The shell line that runs a script with what it is given. `args` is put in as it is: `{files}` for the mutation run to fill. Pure but for reading whether the file can be executed. */
export const lineFor = (file: string, env: Record<string, string>, args = '') => `${Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join(' ')} ${executable(file) ? q(file) : `sh ${q(file)}`}${args ? ` ${args}` : ''} </dev/null`.trim() // nothing to read: a script that waits for typing would never end

/** A script that never started: the shell could not find a folder or a program. That is this computer or the scripts, not the code being run. Pure. */
export const couldNotRun = (r: { exit: number | null; output: string }) => r.exit === 126 || r.exit === 127 || /^(\/bin\/)?(ba|z)?sh: (line \d+: )?(cd: )?[^\n]*: (No such file or directory|command not found|not found|Permission denied)\s*$/.test(r.output.trim())
export const tail = (out: string, n = 12) => out.trim().split('\n').slice(-n).join('\n').slice(-1200)

export interface Ran { key: string; name: string; state: 'pass' | 'fail' | 'unrun' | 'none'; /** Its last lines, when it did not pass. */ output: string }
export interface CheckView { state: 'running' | 'done'; at: string; sha: string | null; branch: string; steps: Ran[]; ok: boolean }
export interface RepoRunView { repo: string; home: boolean; local: boolean; scripts: { dir: string | null; has: boolean; setup: boolean; up: boolean; test: boolean; down: boolean; checks: string[] }; check: CheckView | null }

const going = new Map<string, { at: string; branch: string; steps: Ran[] }>()
const viewOf = (s: RepoScripts): RepoRunView['scripts'] => ({ dir: s.dir, has: s.has, setup: !!s.setup, up: !!s.up, test: !!s.test, down: !!s.down, checks: s.checks.map((c) => c.name) })

/** Every repository of the app: where its scripts go, which are there, and what the last check of them said. */
export async function repoRuns(appId: string): Promise<{ workbench: string | null; says: typeof PART_SAYS; repos: RepoRunView[] }> {
  const { app: a, repos } = await reposOf(appId)
  if (!a) throw new PlanError('no such app')
  const done = await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, 'repo_run.checked'))).orderBy(desc(event.seq)).limit(60)
  return { workbench: workbenchDirOf(a.setup), says: PART_SAYS, repos: repos.filter((r) => r.fullName).map((r, n) => {
    const now = going.get(`${appId}:${r.fullName}`)
    const last = done.find((e) => (e.payload as { repo?: string }).repo === r.fullName)
    const p = last?.payload as { sha?: string; branch?: string; steps?: Ran[] } | undefined
    return { repo: r.fullName, home: n === 0, local: !!r.localPath && existsSync(r.localPath), scripts: viewOf(scriptsOf(a.setup, r.fullName)),
      check: now ? { state: 'running', at: now.at, sha: null, branch: now.branch, steps: now.steps, ok: false } : last && p ? { state: 'done', at: last.ts.toISOString(), sha: p.sha ?? null, branch: p.branch ?? '', steps: p.steps ?? [], ok: (p.steps ?? []).every((s) => s.state === 'pass' || s.state === 'none') && (p.steps ?? []).some((s) => s.state === 'pass') } : null }
  }) }
}

/**
 * Check a repository's scripts: all of them, in order, on its default branch, in a checkout of the engine's own.
 * What each said is kept (`repo_run.checked`). Awaited by a test; started and left to run by the page (startCheck).
 */
export async function checkRepo(appId: string, fullName: string, deps: { sh?: Sh } = {}, actor = 'user'): Promise<void> {
  const { app: a, repos } = await reposOf(appId)
  const r = repos.find((x) => x.fullName === fullName)
  if (!a || !r) throw new PlanError(`${fullName} is not one of this app's repositories`)
  if (!r.localPath || !existsSync(r.localPath)) throw new PlanError(`${fullName} has no folder on this computer to check its scripts in`)
  const s = scriptsOf(a.setup, fullName)
  if (!s.has) throw new PlanError(s.dir ? `${fullName} has no scripts yet: they go in ${s.dir}` : 'this app has no workbench folder to keep a repository\'s scripts in (Settings › Workbench)')
  const key = `${appId}:${fullName}`
  if (going.has(key)) throw new PlanError('its scripts are already being checked')
  const run = deps.sh ?? realSh, local = r.localPath, branch = r.baseBranch ?? a.defaultBranch ?? 'main'
  const steps: Ran[] = [...(['setup', 'up', 'test'] as const).map((k) => ({ key: k, name: k, state: 'none' as const, output: '' })), ...s.checks.map((c) => ({ key: `check:${c.name}`, name: c.name, state: 'none' as const, output: '' })), { key: 'down', name: 'down', state: 'none' as const, output: '' }]
  going.set(key, { at: new Date().toISOString(), branch, steps })
  let sha: string | null = null
  try {
    await git(local, ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { allowFail: true })
    sha = (await git(local, ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { allowFail: true })).stdout.trim() || (await git(local, ['rev-parse', '--verify', '--quiet', branch], { allowFail: true })).stdout.trim() || null
    if (!sha) throw new PlanError(`${branch} could not be found in ${fullName}`)
    const path = join(`${local}-worktrees`, 'review-of--check')
    if (existsSync(path)) { await git(path, ['checkout', '--detach', '--force', sha]); await git(path, ['clean', '-fdq', '--exclude=node_modules', '--exclude=.venv'], { allowFail: true }) } else await git(local, ['worktree', 'add', '--detach', path, sha])
    let env: Record<string, string> = { CHECKOUT: path, REPO: fullName, BASE: branch, HEAD: sha }
    const one = async (k: string, file: string | null, timeoutMs: number): Promise<{ ok: boolean; output: string }> => {
      const step = steps.find((x) => x.key === k)!
      if (!file) return { ok: true, output: '' }
      const got = await run(lineFor(file, env), path, timeoutMs)
      step.state = got.exit === 0 ? 'pass' : couldNotRun(got) ? 'unrun' : 'fail'
      step.output = got.exit === 0 ? '' : got.timedOut ? `It did not finish in ${Math.round(timeoutMs / 60_000)} minutes.` : tail(got.output)
      return { ok: got.exit === 0, output: got.output }
    }
    const ready = (await one('setup', s.setup, 20 * 60_000)).ok
    let up = false
    if (ready) { const u = await one('up', s.up, 15 * 60_000); up = u.ok; if (u.ok) env = { ...env, ...gaveOf(u.output) } }
    if (ready && up) { await one('test', s.test, 45 * 60_000); for (const c of s.checks) await one(`check:${c.name}`, c.file, 30 * 60_000) }
    if (s.up && ready) await one('down', s.down, 10 * 60_000) // whatever up managed to start is stopped
  } catch (err) {
    if (!(err instanceof PlanError)) console.warn(`[engine] checking ${fullName}'s scripts failed: ${(err as Error).message}`)
    steps.unshift({ key: 'checkout', name: 'checkout', state: 'fail', output: String((err as Error).message).split('\n')[0].slice(0, 400) })
  } finally {
    going.delete(key)
    await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, actor, type: 'repo_run.checked', payload: { repo: fullName, branch, sha, steps } })).catch(() => {})
  }
}
export async function startCheck(appId: string, fullName: string, deps: { sh?: Sh } = {}, actor = 'user'): Promise<void> {
  const { app: a, repos } = await reposOf(appId)
  if (!a || !repos.some((x) => x.fullName === fullName)) throw new PlanError(`${fullName} is not one of this app's repositories`)
  if (!scriptsOf(a.setup, fullName).has) throw new PlanError(`${fullName} has no scripts yet`)
  if (going.has(`${appId}:${fullName}`)) throw new PlanError('its scripts are already being checked')
  void checkRepo(appId, fullName, deps, actor).catch((err) => console.warn(`[engine] a check of ${fullName}'s scripts would not start: ${(err as Error).message}`))
}

const STUB = (part: string, says: string, example: string) => `#!/bin/sh
# ${part}: ${says}
# Run from the top folder of a checkout of this repository. Given: CHECKOUT, REPO, BASE, HEAD, and PR for a pull request.
# Not written yet: until it is, it says so and nothing is drawn from it.
#
# ${example}
echo "${part}: not written yet" >&2
exit 127
`
/** Start a repository's folder with a stub of each script, which says it is not written and is never taken for a result. Nothing that is there is overwritten. */
export async function scaffold(appId: string, fullName: string): Promise<RepoScripts> {
  const { app: a, repos } = await reposOf(appId)
  if (!a || !repos.some((x) => x.fullName === fullName)) throw new PlanError(`${fullName} is not one of this app's repositories`)
  const s = scriptsOf(a.setup, fullName)
  if (!s.dir) throw new PlanError('this app has no workbench folder to keep a repository\'s scripts in (Settings › Workbench)')
  mkdirSync(join(s.dir, 'checks'), { recursive: true })
  const stubs: [Part, string][] = [['setup', 'e.g. uv sync, or pnpm install --frozen-lockfile'], ['up', 'e.g. docker compose up -d test-db && echo "DATABASE_URL=postgres://localhost:5434/test"'], ['test', 'e.g. uv run pytest -q "$@"'], ['down', 'e.g. docker compose down']]
  for (const [part, example] of stubs) if (!s[part]) writeFileSync(join(s.dir, `${part}.sh`), STUB(part, PART_SAYS[part], example), { mode: 0o755 })
  if (!s.checks.length) writeFileSync(join(s.dir, 'checks', 'lint.sh'), STUB('checks/lint', PART_SAYS.checks, 'e.g. uv run ruff check .'), { mode: 0o755 })
  return scriptsOf(a.setup, fullName)
}
