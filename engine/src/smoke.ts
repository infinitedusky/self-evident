/**
 * The smoke test: a person checks the built code by hand, for what an agent cannot judge (how it looks, how it
 * feels, speed on a real machine), and their word goes straight onto the criterion (Sandy, 2026-11-17: "lets build
 * it"; SHAPE.md, "An app says where it is smoke tested"). It is the code about to be reviewed: the task's branch
 * at its head, never the prototype's branch.
 *
 * Where it runs is the app's setting (setup.smoke), beside where it is prototyped, "and they can either be the same
 * or they can be different":
 * - local: the engine runs the built branch here, in a worktree of its own at the branch's head, with the command
 *   that runs the app's prototypes (or one of the smoke test's own) and a database of its own. For a library and
 *   its Storybook this is the whole environment.
 * - staging: a deployed build at an address, with a test account. The engine starts nothing; the person is sent there.
 * - flag: production, behind a feature flag on for a test account only. The same, and it comes after the merge.
 *
 * The checks are the criteria the check after the build left to a person (verify.ts: met null), each with where to
 * go and what to look for. A pass or a fail is the build's mark on that criterion, by hand, with the note as its
 * evidence and the commit it was made on. A fail is sent back like anything else the check found. While a check
 * waits for the person, the task's project is not called landed (runner.ts).
 *
 * This slice is the step and the marks. Watching while they test (the page's console, the app's telemetry,
 * screenshots) and testers through a link are not built.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { acceptanceOf, setAcceptance, type Criterion } from './acceptance.js'
import { landingBranch, modeOf } from './branches.js'
import { db } from './db/client.js'
import { app, project, smokeRun } from './db/schema.js'
import { appendEvent } from './events.js'
import { git, headSha } from './git.js'
import { newId } from './ids.js'
import { getIssue, identifier, PlanError } from './issues.js'
import { databaseExists, databaseUrl, listScenarios, rebuild, type PrototypeDb } from './prototype-data.js'
import { homeRepo } from './workbench.js'

export type Where = 'local' | 'staging' | 'flag'
export const WHERES: Where[] = ['local', 'staging', 'flag']
export const WHERE_SAYS: Record<Where, string> = {
  local: 'run here, like its prototypes: the built branch, made-up data',
  staging: 'a deployed build at an address, with a test account',
  flag: 'in production, behind a feature flag that is on for a test account only',
}
export interface SmokeSetup { where: Where; /** staging or flag: the address to test at. */ url?: string; /** How to get in for a test, in words: which account, where its sign-in is. Never a password. */ account?: string; /** flag: its name, or how flags are named here. */ flag?: string; /** local: a command of its own; else the one that runs prototypes. */ cmd?: string }

/** The app's setting; local when it has said nothing, which is where its prototypes run. */
export function smokeSetup(setup: unknown): SmokeSetup {
  const s = (setup as { smoke?: Partial<SmokeSetup> } | null)?.smoke ?? {}
  const where = WHERES.includes(s.where as Where) ? s.where as Where : 'local'
  const text = (v: unknown, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
  return { where, ...(text(s.url) ? { url: text(s.url) } : {}), ...(text(s.account) ? { account: text(s.account) } : {}), ...(text(s.flag) ? { flag: text(s.flag) } : {}), ...(text(s.cmd, 2000) ? { cmd: text(s.cmd, 2000) } : {}) }
}

export interface SmokeCheck {
  id: string; text: string
  /** Where to go: a path of the app, or a story's id. */
  where?: string
  /** What to do there and what passing looks like. */
  how?: string
  mark: 'todo' | 'pass' | 'fail'
  note?: string
  /** A mark made on an earlier commit than the branch is at now: the code has changed since. */
  stale?: boolean
  /** What they said last time, when it has come back to them after a fix. */
  before?: { pass: boolean; note: string }
}

/** Whether a criterion is one for a person: the check left it to them, or they have marked it by hand already. */
export const byHand = (c: Criterion) => !!c.byHand || (c.built === undefined && !!c.builtEvidence)

/** The checks, from the task's criteria. Pure. `head` is the commit the branch is at, when it is known. */
export function smokeChecks(criteria: Criterion[], head: string | null = null): SmokeCheck[] {
  return criteria.filter(byHand).map((c) => {
    const marked = c.built !== undefined && !!c.byHand
    const agent = c.built !== undefined && !c.byHand // the check verified it itself after all
    return {
      id: c.id, text: c.text, ...(c.builtWhere ? { where: c.builtWhere } : {}),
      ...((c.built === undefined ? c.builtEvidence : c.check) ? { how: (c.built === undefined ? c.builtEvidence : c.check)!.replace(/^(for a person|needs a person)[:,]?\s*/i, '') } : {}),
      mark: c.built === undefined ? 'todo' as const : c.built ? 'pass' as const : 'fail' as const,
      ...(marked || agent ? { note: c.builtEvidence ?? '' } : {}),
      ...(marked && head && c.byHand!.sha && c.byHand!.sha !== head ? { stale: true } : {}),
      ...(c.built === undefined && c.byHand ? { before: { pass: c.byHand.pass, note: c.byHand.note } } : {}),
    }
  })
}
/** How many still wait for the person. */
export const smokeOwed = (criteria: Criterion[]) => smokeChecks(criteria).filter((c) => c.mark === 'todo').length

const running = new Map<string, { proc: ChildProcess; log: string[] }>() // by task
const alive = (issueId: string) => { const m = running.get(issueId); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }
const freePort = (want = 0): Promise<number> => new Promise((resolveP, reject) => {
  const s = createServer()
  s.once('error', (err) => (want ? freePort(0).then(resolveP, reject) : reject(err)))
  s.listen(want, () => { const { port } = s.address() as AddressInfo; s.close(() => resolveP(port)) })
})
const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.status < 500).catch(() => false)

/** The task, its app, and the branch its build is on, with the commit that branch is at (null: nothing built yet). */
async function built(issueId: string) {
  const t = await getIssue(db, issueId)
  if (t.parentId || t.kind !== 'code') throw new PlanError('a smoke test is of a whole task, not a sub-task')
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [p] = t.projectId ? await db.select().from(project).where(eq(project.id, t.projectId)) : []
  const r = await homeRepo(t.appId)
  const name = identifier(a.key, t.number)
  const branch = p?.integrationBranch ? landingBranch(modeOf(p, a.setup), p.integrationBranch, { identifier: name }) : null
  const head = branch && r?.localPath ? await headSha(r.localPath, branch).catch(() => null) : null
  return { t, a, p, repoPath: r?.localPath ?? null, name, branch, head }
}

export async function smokeView(issueId: string) {
  const { t, a, branch, head } = await built(issueId)
  const setup = smokeSetup(a.setup)
  const [run] = await db.select().from(smokeRun).where(eq(smokeRun.issueId, t.id))
  const on = alive(t.id)
  const local = run?.port ? `http://localhost:${run.port}` : null
  const checks = smokeChecks(acceptanceOf(t), head)
  return {
    where: setup.where, says: WHERE_SAYS[setup.where], account: setup.account ?? null, flag: setup.flag ?? null,
    branch, head, /** local: the commit its server is running; it is behind when the branch has moved on. */ running: setup.where === 'local' && on ? run?.sha ?? null : null,
    url: setup.where === 'local' ? (on ? local : null) : setup.url ?? null,
    up: setup.where === 'local' ? (on && local ? await answers(local) : false) : !!setup.url,
    canRun: setup.where === 'local' && !!(setup.cmd ?? (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd?.trim()),
    log: running.get(t.id)?.log.slice(-30) ?? [],
    checks, owed: checks.filter((c) => c.mark === 'todo').length, failed: checks.filter((c) => c.mark === 'fail').length,
  }
}

/** Local only: run the built branch, at its head, in the smoke test's own worktree. Run again, it moves to the new head. */
export async function startSmoke(issueId: string, actor = 'user') {
  const { t, a, repoPath, name, branch, head } = await built(issueId)
  const setup = smokeSetup(a.setup)
  if (setup.where !== 'local') throw new PlanError(`${a.name} is smoke tested ${setup.where === 'staging' ? 'on staging' : 'behind a feature flag'}: there is nothing to start here${setup.url ? `; it is at ${setup.url}` : ''}`)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout`)
  if (!branch || !head) throw new PlanError(`${name} is not built yet: there is no branch to run`)
  const cmd = setup.cmd ?? (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd?.trim()
  if (!cmd) throw new PlanError(`${a.name} has no command to run it: set how its prototypes are started in Settings, or a command of the smoke test's own`)
  await stopSmoke(t.id)
  const path = join(`${repoPath}-worktrees`, `smoke--${name.toLowerCase()}`)
  // Its own worktree, at the commit and on no branch: the task's branch is nobody's to check out (it is moved by landing).
  if (existsSync(path)) await git(path, ['checkout', '--detach', '--force', head])
  else await git(repoPath, ['worktree', 'add', '--detach', path, head])
  const dbCfg = (a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url ? (a.setup as { prototype_db: PrototypeDb }).prototype_db : null
  const slug = `smoke-${name.toLowerCase()}`
  if (dbCfg && !(await databaseExists(dbCfg, slug))) await rebuild(dbCfg, slug, path, (await listScenarios(path)).includes('default') ? 'default' : null)
  const [old] = await db.select().from(smokeRun).where(eq(smokeRun.issueId, t.id))
  const port = await freePort(old?.port ?? 0)
  const proc = spawn('sh', ['-c', cmd], { cwd: path, env: { ...process.env, ...(dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, slug) } : {}), PORT: String(port), BROWSER: 'none', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(t.id, { proc, log })
  if (old) await db.update(smokeRun).set({ path, sha: head, port, updatedAt: new Date() }).where(eq(smokeRun.id, old.id))
  else await db.insert(smokeRun).values({ id: newId('run').replace(/^run_/, 'smoke_'), appId: a.id, issueId: t.id, path, sha: head, port })
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'smoke.started', payload: { sha: head, port } }))
  return smokeView(t.id)
}

export function stopSmoke(issueId: string): Promise<void> {
  const m = running.get(issueId)
  running.delete(issueId)
  if (!m || m.proc.exitCode !== null || m.proc.signalCode !== null || !m.proc.pid) return Promise.resolve()
  const gone = new Promise<void>((r) => { m.proc.once('exit', () => r()); setTimeout(r, 3000) })
  try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
  return gone
}
export function stopSmokes() { for (const id of [...running.keys()]) void stopSmoke(id) }

/** A person's word on one check: the build's mark on that criterion, by hand, with their note and the commit it was made on. */
export async function markSmoke(issueId: string, criterionId: string, input: { pass: boolean; note?: string }, by = 'user') {
  const { t, a, head } = await built(issueId)
  const c = acceptanceOf(t).find((x) => x.id === criterionId)
  if (!c) throw new PlanError(`no acceptance criterion ${criterionId} on this task`)
  if (!byHand(c)) throw new PlanError('that criterion is not one for a person: the check after the build did not leave it to them')
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!input.pass && !note) throw new PlanError('say what you saw: a fail is sent back to be fixed, and the note is what the fix works from')
  await setAcceptance(t.id, { update: [{ id: c.id, built: input.pass, builtEvidence: note || 'Checked by hand: it holds.', byHand: { pass: input.pass, note, sha: head, at: new Date().toISOString(), by } }] }, by)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'smoke.marked', payload: { criterionId: c.id, pass: input.pass, note, sha: head } }))
  const view = await smokeView(t.id)
  return { ...view, marked: { id: c.id, pass: input.pass } }
}
