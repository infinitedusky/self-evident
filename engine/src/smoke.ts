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
 * - preview: a preview made for each pull request (a preview deployment of a site; an installable build of a
 *   library, like pkg.pr.new's). Staging, with an address of the pull request's own: the app gives the pattern,
 *   with {pr} where the number goes (Sandy, 2026-11-17, on Bonkei's per-PR previews: "yes").
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
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { and, eq } from 'drizzle-orm'
import { acceptanceOf, setAcceptance, type Criterion } from './acceptance.js'
import { styleOf } from './steps.js'
import { workflowFor } from './work.js'
import { landingBranch, modeOf } from './branches.js'
import { db } from './db/client.js'
import { app, pr as prTable, project, smokeRun } from './db/schema.js'
import { appendEvent } from './events.js'
import { git, headSha } from './git.js'
import { newId } from './ids.js'
import { getIssue, identifier, PlanError } from './issues.js'
import { morePorts, straySays, straysOf } from './ports.js'
import { databaseExists, databaseUrl, dropDatabase, listScenarios, rebuild, type PrototypeDb } from './prototype-data.js'
import { homeRepo } from './workbench.js'

export type Where = 'local' | 'preview' | 'staging' | 'flag'
export const WHERES: Where[] = ['local', 'preview', 'staging', 'flag']
export const WHERE_SAYS: Record<Where, string> = {
  local: 'run here, like its prototypes: the built branch, made-up data',
  preview: 'on a preview of its own pull request, at that pull request\'s address',
  staging: 'a deployed build at an address, with a test account',
  flag: 'in production, behind a feature flag that is on for a test account only',
}
export interface SmokeSetup { where: Where; /** staging or flag: the address to test at. preview: its pattern, with {pr} for the pull request's number. */ url?: string; /** How to get in for a test, in words: which account, where its sign-in is. Never a password. */ account?: string; /** flag: its name, or how flags are named here. */ flag?: string; /** local: a script of its own, any number of lines; else the command that runs prototypes. */ cmd?: string; /** local: run when it is stopped or started again, for what the script leaves running (containers). */ stop?: string; /** local: SQL that fills its database with made-up rows. */ seed?: string }

const text = (v: unknown, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
const one = (s: Partial<SmokeSetup>): SmokeSetup => {
  const where = WHERES.includes(s.where as Where) ? s.where as Where : 'local'
  return { where, ...(text(s.url) ? { url: text(s.url) } : {}), ...(text(s.account) ? { account: text(s.account) } : {}), ...(text(s.flag) ? { flag: text(s.flag) } : {}), ...(text(s.cmd, SCRIPT_MAX) ? { cmd: text(s.cmd, SCRIPT_MAX) } : {}), ...(text(s.stop, SCRIPT_MAX) ? { stop: text(s.stop, SCRIPT_MAX) } : {}), ...(text(s.seed, SEED_MAX) ? { seed: text(s.seed, SEED_MAX) } : {}) }
}

/**
 * An app can have several set-ups, each with a name (Sandy, 2026-11-17: "each question should be able to reference
 * a specific setup … if you have five questions that need the same setup, you just reference the same one … Those
 * setups then we need to have defined in settings"). A library's pull request can ask for two things at once: its
 * docs site, to see that it is accurate, and a demo app that exercises the library. Each is a set-up; each check
 * left to a person names the one it needs; each is brought up once, and they can be up side by side.
 * An app that has listed none has one, from the settings it had before set-ups had names.
 */
export interface NamedSetup extends SmokeSetup { key: string; name: string; /** What it is for, for the agent that sends checks to it and the person who reads them. */ what?: string }
export const MAIN = 'main'
export const SETUPS_MAX = 8
export const setupKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
export function smokeSetups(setup: unknown): NamedSetup[] {
  const s = (setup as { smoke?: Partial<SmokeSetup> & { setups?: unknown } } | null)?.smoke ?? {}
  const out: NamedSetup[] = []
  for (const x of (Array.isArray(s.setups) ? s.setups : []) as (Partial<NamedSetup> | null)[]) {
    const key = setupKey(String(x?.key ?? x?.name ?? ''))
    if (!x || !key || out.some((o) => o.key === key) || out.length >= SETUPS_MAX) continue
    out.push({ key, name: text(x.name, 60) ?? key, ...(text(x.what, 300) ? { what: text(x.what, 300) } : {}), ...one(x) })
  }
  // The one it always had: its name and what is checked there are kept beside its other settings.
  const own = s as { name?: unknown; what?: unknown }
  return out.length ? out : [{ key: MAIN, name: text(own.name, 60) ?? 'Smoke test', ...(text(own.what, 300) ? { what: text(own.what, 300) } : {}), ...one(s) }]
}
/** One set-up: the one of that key, else the app's first. Local when the app has said nothing, which is where its prototypes run. */
export function smokeSetup(setup: unknown, key?: string | null): SmokeSetup {
  const all = smokeSetups(setup)
  const { key: _k, name: _n, what: _w, ...rest } = all.find((x) => x.key === key) ?? all[0]
  return rest
}

/**
 * The smoke test's set-up is Self Evident's own, never the app's repository's (Sandy, 2026-11-17: "one main reason
 * for doing this is to keep any of this stuff out of the code base because we don't want this stuff to be versioned
 * or part of a code base that we're working with for a client … This is about us being able to test"). So the
 * script that brings the environment up, the one that takes it down and the SQL that fills its database are kept in
 * the app's settings, which is to say in whichever database holds the app: the shared one for an app that lives
 * there, this computer's for one that is kept local. Nothing of it is written into a worktree or committed.
 * When it runs, the seed is put in a file outside every repository and the script is told where ($SMOKE_SEED).
 */
export const SCRIPT_MAX = 20_000
export const SEED_MAX = 400_000
export const smokeHome = () => process.env.SMOKE_HOME ?? join(homedir(), '.self-evident', 'smoke')

/** What a script is run with, beyond the engine's own environment: its port, its database, where its seed is, and whether to start from nothing. */
export async function smokeEnv(appId: string, setup: SmokeSetup, i: { port: number; db?: Record<string, string>; clean?: boolean; /** Which set-up, when it is not the app's first. */ key?: string }) {
  const dir = join(smokeHome(), appId)
  const seed = join(dir, i.key && i.key !== MAIN ? `seed-${i.key}.sql` : 'seed.sql')
  if (setup.seed) { await mkdir(dir, { recursive: true }); await writeFile(seed, setup.seed.endsWith('\n') ? setup.seed : `${setup.seed}\n`) }
  else await rm(seed, { force: true })
  return { ...(i.db ?? {}), PORT: String(i.port), BROWSER: 'none', CI: '1', ...(setup.seed ? { SMOKE_SEED: seed } : {}), ...(i.clean ? { SMOKE_CLEAN: '1' } : {}) }
}

/** The app's stop script, run where the start one was, with what it had; what it prints is kept, a failure is not an error. */
export function runStop(cmd: string, cwd: string, env: Record<string, string>) {
  return new Promise<string[]>((done) => {
    if (!existsSync(cwd)) return done([])
    const out: string[] = []
    const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim() && out.length < 100) out.push(line.slice(0, 300)) }
    proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
    const end = setTimeout(() => { proc.kill('SIGKILL'); done(out) }, 60_000)
    proc.on('error', () => { clearTimeout(end); done(out) })
    proc.on('exit', () => { clearTimeout(end); done(out) })
  })
}

/** The app's set-ups for an agent to read or change: each with its scripts and seed whole. */
export async function smokeSetupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  const proto = (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd ?? null
  return {
    setups: smokeSetups(a.setup).map((s) => ({ key: s.key, name: s.name, what: s.what ?? null, where: s.where, url: s.url ?? null, script: s.cmd ?? null, stop: s.stop ?? null, seed: s.seed ?? null, falls_back_to: s.cmd ? null : proto })),
    database: !!(a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url,
  }
}
/**
 * Change one set-up, or add one: setup is its key (none: the app's first). A key the app does not have makes a new
 * set-up, which needs a name. Each of script, stop and seed is replaced when given, cleared when given empty, left
 * when not given.
 */
export async function setSmokeSetup(appId: string, i: { setup?: string; name?: string; what?: string; script?: string; stop?: string; seed?: string }) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  if ((i.script?.length ?? 0) > SCRIPT_MAX || (i.stop?.length ?? 0) > SCRIPT_MAX) throw new PlanError(`a script is ${SCRIPT_MAX} characters at most`)
  if ((i.seed?.length ?? 0) > SEED_MAX) throw new PlanError(`the seed is ${SEED_MAX} characters at most: keep it to the rows a person needs to try the app`)
  const was = (a.setup as { smoke?: Record<string, unknown> } | null)?.smoke ?? {}
  const all = smokeSetups(a.setup)
  const key = i.setup ? setupKey(i.setup) : all[0].key
  if (!key) throw new PlanError('a set-up\'s key is letters, numbers and dashes, like "playground"')
  const put = (o: Record<string, unknown>, k: string, v?: string) => { if (v === undefined) return; if (v.trim()) o[k] = v.trim(); else delete o[k] }
  const change = (o: Record<string, unknown>) => { put(o, 'cmd', i.script); put(o, 'stop', i.stop); put(o, 'seed', i.seed); put(o, 'name', i.name); put(o, 'what', i.what); return o }
  let smoke: Record<string, unknown>
  if (!Array.isArray(was.setups) && key === all[0].key) smoke = change({ ...was }) // an app with the one set-up it always had: its settings as they are
  else {
    const list = all.map((s) => ({ ...s })) as Record<string, unknown>[]
    const mine = list.find((s) => s.key === key)
    if (mine) change(mine)
    else {
      if (!i.name?.trim()) throw new PlanError(`this app has no set-up "${key}" (${all.map((s) => s.key).join(', ')}): give a name to add it`)
      if (list.length >= SETUPS_MAX) throw new PlanError(`an app has ${SETUPS_MAX} set-ups at most`)
      list.push(change({ key, where: 'local' }))
    }
    smoke = { setups: list }
  }
  await db.update(app).set({ setup: { ...(a.setup as object), smoke } }).where(eq(app.id, appId))
  return smokeSetupOf(appId)
}

/**
 * When a check left to a person can be done (Bonkei's agent, passed on by Sandy, 2026-11-17: the step "assumes every
 * check a person does happens on this machine, before the PR … each check should say when it can be done").
 * - here: on the built code, on this computer. Before the pull request.
 * - pr: only once the pull request exists: a bot's comment on it, a check that runs in CI, a preview of it.
 * - after: only once it is merged: a release, a deploy, a flag switched on.
 * A task waits for its here and pr checks; one for after the merge is listed and holds nothing.
 */
export type When = 'here' | 'pr' | 'after'
export const WHENS: When[] = ['here', 'pr', 'after']
/** When, from what the check said; for one written before checks said when, from its own words. */
export function whenOf(c: Criterion): When {
  if (c.builtWhen) return c.builtWhen
  const said = `${c.builtWhere ?? ''} ${c.built === undefined ? c.builtEvidence ?? '' : ''}`
  return /\b(pull request|PR)\b|pkg\.pr\.new|\bCI\b/.test(said) ? 'pr' : 'here'
}

export interface SmokeCheck {
  id: string; text: string
  when: When
  /** Which of the app's set-ups it needs up (its key); the view fills in the app's first when the check named none it has. */
  setup?: string
  /** Where to go: a path of the app, or a story's id. When nobody said, the path its own words name (placeIn). */
  where?: string
  /** That place as an address to open, on the set-up it needs, while that is up or deployed (the view fills it in). */
  link?: string
  /** What to do there and what passing looks like. */
  how?: string
  mark: 'todo' | 'pass' | 'fail'
  note?: string
  /** A mark made on an earlier commit than the branch is at now: the code has changed since. */
  stale?: boolean
  /** What they said last time, when it has come back to them after a fix. */
  before?: { pass: boolean; note: string }
}

/** Whether a check's "where" is somewhere to be sent: an address, a path, or a story's id. Anything else is a place said in words ("the pull request on GitHub"). */
export const goable = (where?: string | null) => !!where && (/^https?:\/\/\S+$/.test(where) || /^\/\S*$/.test(where) || /^[a-z0-9][a-z0-9-]*--[a-z0-9-]+$/i.test(where))
/** A place on a set-up's address: a path after it, a story alone as Storybook serves it, an address as it is. Null when it is only words. */
export function addressOf(base: string, where?: string | null): string | null {
  if (!where || !goable(where)) return null
  if (/^https?:\/\//.test(where)) return where
  const b = base.replace(/\/$/, '')
  return where.startsWith('/') ? `${b}${where}` : `${b}/iframe.html?id=${encodeURIComponent(where)}&viewMode=story`
}
/**
 * The path a criterion's own words name, when no one recorded where to go (Sandy, 2026-11-17: "smoke tests should
 * have links to test like the prototype guides"; on a staged task no check after the build fills it in, and the
 * person was working addresses out from a port). The first path of the app in what it says: "/import", or the path
 * of an address on this computer, whose port was another run's. Not a file in the repository, not a fraction.
 */
export function placeIn(...said: (string | undefined | null)[]): string | undefined {
  for (const text of said) {
    if (!text) continue
    const plain = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/)/gi, ' ') // an address on this computer: its path, on whatever port this run has
    for (const m of plain.matchAll(/(?<![\w:/.<~-])(\/[a-z0-9_[][\w\-./?=&%:[\]@~+]*)/gi)) {
      const path = m[1].replace(/[.,;:)\]]+$/, '')
      if (path.length < 2 || /\.(tsx?|jsx?|mjs|cjs|json|md|sql|css|html|ya?ml|sh|py|env|lock|png|svg)$/i.test(path) || /^\/(src|node_modules|engine|tests?|dist|build|usr|tmp|etc|var|bin|Users|home)\//.test(path)) continue
      return path
    }
  }
  return undefined
}

/** A preview's address for one pull request: the pattern with its number in place of {pr}. Null without a pattern or a number. */
export const previewUrl = (pattern: string | undefined, pr: number | null | undefined) => (pattern && pr ? pattern.replace(/\{pr\}/g, String(pr)) : null)

/** Whether a criterion is one for a person: the check left it to them, or they have marked it by hand already. */
export const byHand = (c: Criterion) => !!c.byHand || (c.built === undefined && !!c.builtEvidence)
/**
 * On a staged task there is no check after the build to leave criteria to a person (Sandy, 2026-11-17: "can we add it
 * to the other ones"): there, every criterion no agent has marked is the person's to check by hand, with the ones
 * they already marked.
 */
export const forPerson = (c: Criterion, staged: boolean) => byHand(c) || (staged && c.built === undefined)

/** The checks, from the task's criteria. Pure. `head` is the commit the branch is at, when it is known. */
export function smokeChecks(criteria: Criterion[], head: string | null = null, staged = false): SmokeCheck[] {
  return criteria.filter((c) => forPerson(c, staged)).map((c) => {
    const marked = c.built !== undefined && !!c.byHand
    const agent = c.built !== undefined && !c.byHand // the check verified it itself after all
    return {
      id: c.id, text: c.text, when: whenOf(c), ...(c.builtSetup ? { setup: c.builtSetup } : {}),
      ...((c.builtWhere ?? placeIn(c.built === undefined ? c.builtEvidence : null, c.check, c.evidence, c.text)) ? { where: c.builtWhere ?? placeIn(c.built === undefined ? c.builtEvidence : null, c.check, c.evidence, c.text) } : {}),
      ...((c.built === undefined ? c.builtEvidence ?? c.check : c.check) ? { how: (c.built === undefined ? c.builtEvidence ?? c.check : c.check)!.replace(/^(for a person|needs a person)[:,]?\s*/i, '') } : {}),
      mark: c.built === undefined ? 'todo' as const : c.built ? 'pass' as const : 'fail' as const,
      ...(marked || agent ? { note: c.builtEvidence ?? '' } : {}),
      ...(marked && head && c.byHand!.sha && c.byHand!.sha !== head ? { stale: true } : {}),
      ...(c.built === undefined && c.byHand ? { before: { pass: c.byHand.pass, note: c.byHand.note } } : {}),
    }
  })
}
/** How many still wait for the person and hold the task: not the ones for after the merge. */
export const smokeOwed = (criteria: Criterion[]) => smokeChecks(criteria).filter((c) => c.mark === 'todo' && c.when !== 'after').length
/** Of those, how many can be done now: the ones on the pull request wait for it to exist. */
export const smokeReady = (criteria: Criterion[], hasPr: boolean) => smokeChecks(criteria).filter((c) => c.mark === 'todo' && (c.when === 'here' || (c.when === 'pr' && hasPr))).length

const running = new Map<string, { proc: ChildProcess; log: string[]; given?: number[]; stray?: { at: number; ports: number[] }; stop?: { cmd: string; cwd: string; env: Record<string, string> } }>() // by task and set-up
const runKey = (issueId: string, key: string) => `${issueId}:${key}`
const alive = (issueId: string, key: string) => { const m = running.get(runKey(issueId, key)); return !!m && m.proc.exitCode === null && m.proc.signalCode === null }
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
  // Its pull request: the task's own when each task has one, else its project's.
  const prs = p ? await db.select().from(prTable).where(eq(prTable.projectId, p.id)) : []
  const pull = prs.find((x) => x.issueId === t.id) ?? prs.find((x) => !x.issueId) ?? null
  const staged = styleOf((await workflowFor(db, { issueId: t.id })).workflow) !== 'checklist'
  return { t, a, p, repoPath: r?.localPath ?? null, name, branch, head, staged, pr: pull?.number ? { number: pull.number, url: pull.url } : null }
}

export async function smokeView(issueId: string) {
  const { t, a, branch, head, pr, staged } = await built(issueId)
  const all = smokeSetups(a.setup)
  const runs = await db.select().from(smokeRun).where(eq(smokeRun.issueId, t.id))
  const proto = (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd?.trim()
  const hasDb = !!(a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url
  // A check that named no set-up, or one the app no longer has, is the first one's.
  const checks = smokeChecks(acceptanceOf(t), head, staged).map((c) => ({ ...c, setup: all.some((s) => s.key === c.setup) ? c.setup! : all[0].key }))
  const setups = await Promise.all(all.map(async (setup) => {
    const there = setup.where === 'preview' ? previewUrl(setup.url, pr?.number) : setup.url ?? null // where it is deployed, when it is
    const run = runs.find((r) => r.setup === setup.key)
    const on = alive(t.id, setup.key)
    const local = run?.port ? `http://localhost:${run.port}` : null
    const up = setup.where === 'local' ? (on && local ? await answers(local) : false) : !!there
    // Once it answers: does it listen anywhere it was not told to (ports.ts)?
    const stray = setup.where === 'local' && up ? await straysOf(running.get(runKey(t.id, setup.key)), (ports) => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: 'engine', type: 'smoke.stray_port', payload: { setup: setup.key, ports, note: straySays(ports) } }))) : []
    return {
      key: setup.key, name: setup.name, what: setup.what ?? null,
      where: setup.where, says: WHERE_SAYS[setup.where], account: setup.account ?? null, flag: setup.flag ?? null,
      /** local: the commit its server is running; it is behind when the branch has moved on. */ running: setup.where === 'local' && on ? run?.sha ?? null : null,
      url: setup.where === 'local' ? (on ? local : null) : there,
      up, ...(stray.length ? { /** Ports it listens on that it was not given: a second copy would share them. */ strayPorts: stray, strayNote: straySays(stray) } : {}),
      canRun: setup.where === 'local' && !!(setup.cmd ?? proto),
      /** local: there is something to start from nothing: a database of its own, a seed, or a script of its own. */ canClean: setup.where === 'local' && !!(setup.cmd || setup.seed || hasDb),
      log: running.get(runKey(t.id, setup.key))?.log.slice(-30) ?? [],
      /** How many of its checks still wait for the person. */ owed: checks.filter((c) => c.setup === setup.key && c.mark === 'todo' && c.when !== 'after').length,
    }
  }))
  const { key: _k, name: _n, what: _w, owed: _o, ...first } = setups[0]
  // Each check's place as an address on the set-up it needs, while that has one: a link to press, never a port to work out.
  const linked = checks.map((c) => {
    const base = setups.find((s) => s.key === c.setup)?.url
    const link = /^https?:\/\//.test(c.where ?? '') ? c.where! : base ? addressOf(base, c.where) : null
    return link ? { ...c, link } : c
  })
  return {
    /** A staged task: the checks are every criterion no agent marked, not what a check after the build left. */ staged,
    ...first, // the app's first set-up, as the view was when an app had one
    branch, head, /** Its pull request, when there is one: a preview is of it. */ pr,
    /** Every set-up of the app, each with where it is and whether it is up; a check names the one it needs. */ setups,
    checks: linked, owed: checks.filter((c) => c.mark === 'todo' && c.when !== 'after').length, failed: checks.filter((c) => c.mark === 'fail').length,
  }
}

/** Local only: run the built branch, at its head, in the smoke test's own worktree. Run again, it moves to the new head. */
export async function startSmoke(issueId: string, actor = 'user', opts: { /** Start from nothing: its database made again and filled, and the script told so ($SMOKE_CLEAN). */ clean?: boolean; /** Which set-up (its key); none: the app's first. */ setup?: string } = {}) {
  const { t, a, repoPath, name, branch, head } = await built(issueId)
  const all = smokeSetups(a.setup)
  const named = opts.setup ? all.find((x) => x.key === opts.setup) : all[0]
  if (!named) throw new PlanError(`${a.name} has no smoke test set-up "${opts.setup}" (${all.map((x) => x.key).join(', ')})`)
  const setup: SmokeSetup = named
  const key = named.key, first = key === all[0].key
  if (setup.where !== 'local') throw new PlanError(`${a.name} is smoke tested ${setup.where === 'staging' ? 'on staging' : setup.where === 'preview' ? 'on a preview of its pull request' : 'behind a feature flag'}: there is nothing to start here`)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout`)
  if (!branch || !head) throw new PlanError(`${name} is not built yet: there is no branch to run`)
  const cmd = setup.cmd ?? (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd?.trim()
  if (!cmd) throw new PlanError(`${a.name} has no command to run it: set how its prototypes are started in Settings, or a command of the smoke test's own`)
  await stopSmoke(t.id, key)
  const path = join(`${repoPath}-worktrees`, `smoke--${name.toLowerCase()}${first ? '' : `--${key}`}`) // a checkout per set-up, so two can install and run side by side
  // Its own worktree, at the commit and on no branch: the task's branch is nobody's to check out (it is moved by landing).
  if (existsSync(path)) await git(path, ['checkout', '--detach', '--force', head])
  else await git(repoPath, ['worktree', 'add', '--detach', path, head])
  const dbCfg = (a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url ? (a.setup as { prototype_db: PrototypeDb }).prototype_db : null
  const slug = `smoke-${name.toLowerCase()}${first ? '' : `-${key}`}`
  if (dbCfg && opts.clean) await dropDatabase(dbCfg, slug)
  if (dbCfg && !(await databaseExists(dbCfg, slug))) {
    const { url } = await rebuild(dbCfg, slug, path, (await listScenarios({ appId: a.id }, path)).includes('default') ? 'default' : null, { appId: a.id }) // the app's shared "default" scenario, when it has one
    if (setup.seed) { // the app's own seed, from its settings: after the schema, and after the app's shared scenario when it has one
      const c = new pg.Client({ connectionString: url })
      await c.connect()
      try { await c.query(setup.seed) } catch (err) { throw new PlanError(`the smoke test's seed failed: ${(err as Error).message}`) } finally { await c.end() }
    }
  }
  const [old] = await db.select().from(smokeRun).where(and(eq(smokeRun.issueId, t.id), eq(smokeRun.setup, key)))
  const port = await freePort(old?.port ?? 0)
  const more = await morePorts()
  const env = { ...more.env, ...await smokeEnv(a.id, setup, { port, db: dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, slug) } : undefined, clean: opts.clean, key }) }
  if (setup.stop && old) await runStop(setup.stop, old.path, { ...env, PORT: String(old.port) }) // what the last run left up, when the engine has been started again since
  const proc = spawn('sh', ['-c', cmd], { cwd: path, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(runKey(t.id, key), { proc, log, given: [port, ...more.ports], ...(setup.stop ? { stop: { cmd: setup.stop, cwd: path, env } } : {}) })
  if (old) await db.update(smokeRun).set({ path, sha: head, port, updatedAt: new Date() }).where(eq(smokeRun.id, old.id))
  else await db.insert(smokeRun).values({ id: newId('run').replace(/^run_/, 'smoke_'), appId: a.id, issueId: t.id, setup: key, path, sha: head, port })
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'smoke.started', payload: { sha: head, port, setup: key } }))
  return smokeView(t.id)
}

/** Stop one set-up of a task's, or, with no key, every one of them that is up. */
export function stopSmoke(issueId: string, key?: string): Promise<void> {
  if (key === undefined) return Promise.all([...running.keys()].filter((k) => k.startsWith(`${issueId}:`)).map((k) => stopSmoke(issueId, k.slice(issueId.length + 1)))).then(() => {})
  const m = running.get(runKey(issueId, key))
  running.delete(runKey(issueId, key))
  if (!m) return Promise.resolve()
  const down = () => (m.stop ? runStop(m.stop.cmd, m.stop.cwd, m.stop.env).then(() => {}) : Promise.resolve()) // the app's stop script, after its process: for what the script left running
  if (m.proc.exitCode !== null || m.proc.signalCode !== null || !m.proc.pid) return down()
  const gone = new Promise<void>((r) => { m.proc.once('exit', () => r()); setTimeout(r, 3000) })
  try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
  return gone.then(down)
}
export function stopSmokes() { for (const k of [...running.keys()]) { const at = k.lastIndexOf(':'); void stopSmoke(k.slice(0, at), k.slice(at + 1)) } }

/** A person's word on one check: the build's mark on that criterion, by hand, with their note and the commit it was made on. */
export async function markSmoke(issueId: string, criterionId: string, input: { pass: boolean; note?: string }, by = 'user') {
  const { t, a, head, pr, staged } = await built(issueId)
  const c = acceptanceOf(t).find((x) => x.id === criterionId)
  if (!c) throw new PlanError(`no acceptance criterion ${criterionId} on this task`)
  if (!forPerson(c, staged)) throw new PlanError(staged ? 'that criterion is not one for a person here: an agent has already marked it. Change its mark on the brief\'s page' : 'that criterion is not one for a person: the check after the build did not leave it to them')
  if (whenOf(c) === 'pr' && !pr) throw new PlanError('that one is checked on the pull request, and this task has none yet')
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!input.pass && !note) throw new PlanError('say what you saw: a fail is sent back to be fixed, and the note is what the fix works from')
  await setAcceptance(t.id, { update: [{ id: c.id, built: input.pass, builtEvidence: note || 'Checked by hand: it holds.', byHand: { pass: input.pass, note, sha: head, at: new Date().toISOString(), by } }] }, by)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'smoke.marked', payload: { criterionId: c.id, pass: input.pass, note, sha: head } }))
  const view = await smokeView(t.id)
  return { ...view, marked: { id: c.id, pass: input.pass } }
}
