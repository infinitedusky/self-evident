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
import { patchSetup } from './setup.js'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { and, eq } from 'drizzle-orm'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { accountEnv } from './account.js'
import { acceptanceOf, later, proofOf, setAcceptance, type Criterion, type Tried } from './acceptance.js'
import { event } from './db/schema.js'
import { desc, inArray } from 'drizzle-orm'
import { builderGuard, guardOptions, STOP_ONLY_YOURS } from './guard.js'
import { styleOf } from './steps.js'
import { workflowFor } from './work.js'
import { landingBranch, modeOf } from './branches.js'
import { db } from './db/client.js'
import { app, pr as prTable, project, scenario, smokeRun } from './db/schema.js'
import { appendEvent } from './events.js'
import { git, headSha } from './git.js'
import { newId } from './ids.js'
import { getIssue, identifier, PlanError } from './issues.js'
import { morePorts, straySays, straysOf } from './ports.js'
import { fixedOf, fixedSays } from './addresses.js'
import { databaseExists, databaseUrl, dropDatabase, listScenarios, rebuild, save, type PrototypeDb } from './prototype-data.js'
import { homeRepo } from './workbench.js'
import { fixtureForTask } from './fixtures.js'
import { plansFor } from './mock-places.js'
import { placedFiles, placeTestFiles, testFilesSay } from './test-files.js'
import { dropUse, isGiven, libraryStandIns, noteRecording, noteUse } from './mocks.js'
import { mock } from './db/schema.js'
import { startRecorder, type Recording } from './recorder.js'
import { envOf, fill, homeOf, startStandIns, stopStandIns, writeEnvFile } from './stand-ins.js'
import { scratchKey, terminalOpen } from './smoke-terminal.js'

export type Where = 'local' | 'preview' | 'staging' | 'flag' | 'terminal'
export const WHERES: Where[] = ['local', 'preview', 'staging', 'flag', 'terminal']
export const WHERE_SAYS: Record<Where, string> = {
  local: 'run here, like its prototypes: the built branch, made-up data',
  preview: 'on a preview of its own pull request, at that pull request\'s address',
  staging: 'a deployed build at an address, with a test account',
  flag: 'in production, behind a feature flag that is on for a test account only',
  terminal: 'in a terminal on this computer: commands you run and watch',
}
export interface SmokeSetup { where: Where; /** staging or flag: the address to test at. preview: its pattern, with {pr} for the pull request's number. */ url?: string; /** How to get in for a test, in words: which account, where its sign-in is. Never a password. */ account?: string; /** flag: its name, or how flags are named here. */ flag?: string; /** local: a script of its own, any number of lines; else the command that runs prototypes. */ cmd?: string; /** local: run when it is stopped or started again, for what the script leaves running (containers). */ stop?: string; /** local: SQL that fills its database with made-up rows. */ seed?: string; /** terminal: where it opens. build: the smoke test's checkout of the built code. temp: a new empty folder, thrown away when it is closed. */ folder?: 'build' | 'temp' }

const text = (v: unknown, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
const one = (s: Partial<SmokeSetup>): SmokeSetup => {
  const where = WHERES.includes(s.where as Where) ? s.where as Where : 'local'
  return { where, ...(text(s.url) ? { url: text(s.url) } : {}), ...(text(s.account) ? { account: text(s.account) } : {}), ...(text(s.flag) ? { flag: text(s.flag) } : {}), ...(text(s.cmd, SCRIPT_MAX) ? { cmd: text(s.cmd, SCRIPT_MAX) } : {}), ...(text(s.stop, SCRIPT_MAX) ? { stop: text(s.stop, SCRIPT_MAX) } : {}), ...(text(s.seed, SEED_MAX) ? { seed: text(s.seed, SEED_MAX) } : {}), ...(where === 'terminal' ? { folder: s.folder === 'temp' ? 'temp' as const : 'build' as const } : {}) }
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
 * The smoke test's set-up is Evident's own, never the app's repository's (Sandy, 2026-11-17: "one main reason
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
    setups: smokeSetups(a.setup).map((s) => ({ key: s.key, name: s.name, what: s.what ?? null, where: s.where, ...(s.folder ? { folder: s.folder } : {}), url: s.url ?? null, script: s.cmd ?? null, stop: s.stop ?? null, seed: s.seed ?? null, falls_back_to: s.cmd || s.where === 'terminal' ? null : proto })),
    database: !!(a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url,
  }
}
/**
 * Change one set-up, or add one: setup is its key (none: the app's first). A key the app does not have makes a new
 * set-up, which needs a name. Each of script, stop and seed is replaced when given, cleared when given empty, left
 * when not given.
 */
export async function setSmokeSetup(appId: string, i: { setup?: string; name?: string; what?: string; script?: string; stop?: string; seed?: string; /** local (a server, shown in the page) or terminal (commands, run and watched). */ where?: 'local' | 'terminal'; /** terminal: build (the built code's checkout) or temp (a new empty folder). */ folder?: 'build' | 'temp' }) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  if ((i.script?.length ?? 0) > SCRIPT_MAX || (i.stop?.length ?? 0) > SCRIPT_MAX) throw new PlanError(`a script is ${SCRIPT_MAX} characters at most`)
  if ((i.seed?.length ?? 0) > SEED_MAX) throw new PlanError(`the seed is ${SEED_MAX} characters at most: keep it to the rows a person needs to try the app`)
  const was = (a.setup as { smoke?: Record<string, unknown> } | null)?.smoke ?? {}
  const all = smokeSetups(a.setup)
  const key = i.setup ? setupKey(i.setup) : all[0].key
  if (!key) throw new PlanError('a set-up\'s key is letters, numbers and dashes, like "playground"')
  const put = (o: Record<string, unknown>, k: string, v?: string) => { if (v === undefined) return; if (v.trim()) o[k] = v.trim(); else delete o[k] }
  const change = (o: Record<string, unknown>) => { put(o, 'cmd', i.script); put(o, 'stop', i.stop); put(o, 'seed', i.seed); put(o, 'name', i.name); put(o, 'what', i.what); if (i.where) o.where = i.where; if (i.folder) o.folder = i.folder; return o }
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
  await patchSetup(appId, { smoke })
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
/** nightly: left to the repository's scheduled run on its default branch (held.ts). Like one for after the merge it holds nothing, and it does not hold the task open either. */
export type When = 'here' | 'pr' | 'after' | 'nightly'
export const WHENS: When[] = ['here', 'pr', 'after', 'nightly']
/** Whether a check waits for the person before the merge. */
export const holds = (when: When) => when === 'here' || when === 'pr'
/** When, from what the check said; for one written before checks said when, from its own words. */
export function whenOf(c: Criterion): When {
  if (proofOf(c) === 'release') return 'after'
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
  /** skip: the person chose not to try it. It holds nothing up, and it is not a pass. */
  mark: 'todo' | 'pass' | 'fail' | 'skip'
  note?: string
  /** A mark made on an earlier commit than the branch is at now: the code has changed since. */
  stale?: boolean
  /** What they said last time, when it has come back to them after a fix. */
  before?: { pass: boolean; note: string }
  /** What an agent saw when asked to try it (trySmoke): its word, not a mark. stale: said on an earlier commit. */
  tried?: Tried & { stale?: boolean }
  /** An agent is trying it now. */
  trying?: boolean
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
export const forPerson = (c: Criterion, staged: boolean) => !later(c) && (byHand(c) || (c.kind === 'smoke' && c.built === undefined) || (staged && c.built === undefined))

/**
 * What is owed at deploy, by whoever deploys (Sandy, 2026-11-23: "Release (at deploy): what must be true for it to
 * go live and can only be done there … Never on the Smoke page, never holding the smoke test. Written into the PR's
 * Merge Danger as deploy steps, in order, and listed on the task as owed by whoever deploys"). The criteria tagged
 * release, and the ones a check said can only be seen after the merge, in the order they were written. Pure.
 */
export interface ReleaseCheck { id: string; text: string; /** The step, in a line: what the check said, else how the criterion says it is known. */ how?: string; /** Whoever deployed said it is done (or that it is not, with why). Absent: owed. */ done?: boolean; note?: string; by?: string; at?: string }
export function releaseChecks(criteria: Criterion[]): ReleaseCheck[] {
  return criteria.filter((c) => proofOf(c) === 'release').map((c) => {
    const how = (c.byHand ? c.check : c.builtEvidence ?? c.check)?.replace(/^(for a person|needs a person|at deploy)[:,]?\s*/i, '')
    return { id: c.id, text: c.text, ...(how ? { how } : {}), ...(c.byHand && c.built !== undefined ? { done: c.built, note: c.byHand.note, by: c.byHand.by, at: c.byHand.at } : {}) }
  })
}
/** What is watched in production after the deploy: nobody checks these before the merge. Pure. */
export const watchChecks = (criteria: Criterion[]) => criteria.filter((c) => proofOf(c) === 'watch').map((c) => ({ id: c.id, text: c.text, ...(c.check ? { how: c.check } : {}) }))

/**
 * The deploy steps as the pull request carries them: numbered, in order, between marks of the engine's own so the
 * next update replaces them and nothing the writer said. Empty when there are none.
 */
export const DEPLOY_OPEN = '<!-- evident:deploy -->', DEPLOY_CLOSE = '<!-- /evident:deploy -->'
export function deploySteps(criteria: Criterion[]): string {
  const steps = releaseChecks(criteria)
  if (!steps.length) return ''
  return [DEPLOY_OPEN, `**At deploy, in order** (${steps.length === 1 ? 'this is' : 'these are'} owed by whoever deploys; nothing before the merge checks ${steps.length === 1 ? 'it' : 'them'}):`, '', ...steps.map((s, i) => `${i + 1}. ${s.text.replace(/\.$/, '')}.${s.how ? ` ${s.how.replace(/\.$/, '')}.` : ''}`), DEPLOY_CLOSE].join('\n')
}

/** The checks, from the task's criteria. Pure. `head` is the commit the branch is at, when it is known. */
export function smokeChecks(criteria: Criterion[], head: string | null = null, staged = false): SmokeCheck[] {
  return criteria.filter((c) => forPerson(c, staged)).map((c) => {
    const marked = c.built !== undefined && !!c.byHand
    const agent = c.built !== undefined && !c.byHand // the check verified it itself after all
    return {
      id: c.id, text: c.text, when: whenOf(c), ...(c.builtSetup ? { setup: c.builtSetup } : {}),
      ...((c.builtWhere ?? placeIn(c.built === undefined ? c.builtEvidence : null, c.check, c.evidence, c.text)) ? { where: c.builtWhere ?? placeIn(c.built === undefined ? c.builtEvidence : null, c.check, c.evidence, c.text) } : {}),
      ...((c.built === undefined ? c.builtEvidence ?? c.check : c.check) ? { how: (c.built === undefined ? c.builtEvidence ?? c.check : c.check)!.replace(/^(for a person|needs a person)[:,]?\s*/i, '') } : {}),
      mark: c.built === undefined ? 'todo' as const : c.byHand?.skipped ? 'skip' as const : c.built ? 'pass' as const : 'fail' as const,
      ...(marked || agent ? { note: c.builtEvidence ?? '' } : {}),
      ...(marked && head && c.byHand!.sha && c.byHand!.sha !== head ? { stale: true } : {}),
      ...(c.built === undefined && c.byHand ? { before: { pass: c.byHand.pass, note: c.byHand.note } } : {}),
      ...(c.tried ? { tried: { ...c.tried, ...(head && c.tried.sha && c.tried.sha !== head ? { stale: true } : {}) } } : {}),
    }
  })
}
/** How many still wait for the person and hold the task: not the ones for after the merge. */
export const smokeOwed = (criteria: Criterion[]) => smokeChecks(criteria).filter((c) => c.mark === 'todo' && holds(c.when)).length
/** Of those, how many can be done now: the ones on the pull request wait for it to exist. */
export const smokeReady = (criteria: Criterion[], hasPr: boolean) => smokeChecks(criteria).filter((c) => c.mark === 'todo' && (c.when === 'here' || (c.when === 'pr' && hasPr))).length

export interface Mocks { /** Its stand-ins' key (stand-ins.ts). */ id: string; recorders: Recording[]; on: { key: string; name: string; /** real: a real response served as it is. recording: the real service, kept as it comes. */ how: 'mock' | 'assumed' | 'real' | 'recording' }[] }
const running = new Map<string, { proc: ChildProcess; log: string[]; given?: number[]; stray?: { at: number; ports: number[] }; stop?: { cmd: string; cwd: string; env: Record<string, string> }; mocks?: Mocks }>() // by task and set-up
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
  const branch = p?.integrationBranch ? landingBranch(modeOf(p, a.setup), p.integrationBranch, { identifier: name, branch: t.branch }) : null
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
  const checks = smokeChecks(acceptanceOf(t), head, staged).map((c) => ({ ...c, setup: all.some((s) => s.key === c.setup) ? c.setup! : all[0].key, ...(trying.has(runKey(t.id, c.id)) ? { trying: true } : {}) }))
  const setups = await Promise.all(all.map(async (setup) => {
    const there = setup.where === 'preview' ? previewUrl(setup.url, pr?.number) : setup.url ?? null // where it is deployed, when it is
    const run = runs.find((r) => r.setup === setup.key)
    const on = alive(t.id, setup.key)
    const local = run?.port ? `http://localhost:${run.port}` : null
    const up = setup.where === 'local' ? (on && local ? await answers(local) : false) : setup.where === 'terminal' ? terminalOpen(t.id, setup.key) : !!there
    // Once it answers: does it listen anywhere it was not told to (ports.ts)?
    const stray = setup.where === 'local' && up ? await straysOf(running.get(runKey(t.id, setup.key)), (ports) => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: 'engine', type: 'smoke.stray_port', payload: { setup: setup.key, ports, note: straySays(ports) } }))) : []
    // And does its page call an address fixed to this computer (addresses.ts)? It would load here and nowhere else.
    const fixed = setup.where === 'local' && up && local ? await fixedOf(`smoke:${runKey(t.id, setup.key)}`, local, (found) => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: 'engine', type: 'smoke.fixed_address', payload: { setup: setup.key, addresses: found, note: fixedSays(found, local) } }))) : []
    return {
      ...(fixed.length ? { /** Addresses fixed to this computer that its page names: it will not load through any other address. */ fixedAddresses: fixed, fixedNote: fixedSays(fixed, local!) } : {}),
      /** The throwaway terminal every set-up has (Sandy, 2026-11-18: "we always want access to a terminal pointed at a temp throwaway folder"): a new empty folder. Left out where the set-up's own terminal is already that. */ ...(setup.where === 'terminal' && setup.folder === 'temp' ? {} : { scratch: { open: terminalOpen(t.id, scratchKey(setup.key)) } }),
      /** A terminal can be opened on it (smoke-terminal.ts), and where it would open; open: one is. */ ...(setup.where === 'local' || setup.where === 'terminal' ? { terminal: { folder: setup.where === 'terminal' ? setup.folder ?? 'build' : 'build' as const, open: terminalOpen(t.id, setup.key) } } : {}),
      key: setup.key, name: setup.name, what: setup.what ?? null,
      where: setup.where, says: WHERE_SAYS[setup.where], account: setup.account ?? null, flag: setup.flag ?? null,
      /** local: the commit its server is running; it is behind when the branch has moved on. */ running: setup.where === 'local' && on ? run?.sha ?? null : null,
      url: setup.where === 'local' ? (on ? local : null) : there,
      up, ...(stray.length ? { /** Ports it listens on that it was not given: a second copy would share them. */ strayPorts: stray, strayNote: straySays(stray) } : {}),
      canRun: setup.where === 'local' && !!(setup.cmd ?? proto),
      /** local: there is something to start from nothing: a database of its own, a seed, or a script of its own. */ canClean: setup.where === 'local' && !!(setup.cmd || setup.seed || hasDb),
      /** local, with a database of its own: it can be started from a fixture, and kept as one. builtFrom: the fixture its database was last built from (null: the set-up's own seed alone). */ ...(setup.where === 'local' && hasDb ? { data: { builtFrom: run?.fixture ?? null, ran: !!run } } : {}),
      /** local: the fixtures' files it was given when it last started (test-files.ts), and the folder they are in on this computer. */ ...(setup.where === 'local' ? await (async () => { const f = await placedFiles(a.id, t.id, 'smoke', smokeFilesDir(t.id, setup.key)); return f?.files.length ? { files: { dir: f.dir, files: f.files } } : {} })() : {}),
      log: running.get(runKey(t.id, setup.key))?.log.slice(-30) ?? [],
      /** While it runs: the app's mocks it is pointed at, and the services it calls for real through a recorder (mocks.ts). */ mocks: on ? running.get(runKey(t.id, setup.key))?.mocks?.on ?? [] : [],
      /** How many of its checks still wait for the person. */ owed: checks.filter((c) => c.setup === setup.key && c.mark === 'todo' && holds(c.when)).length,
    }
  }))
  const { key: _k, name: _n, what: _w, owed: _o, ...first } = setups[0]
  const [last] = await db.select({ payload: event.payload, actor: event.actor, ts: event.ts }).from(event).where(and(eq(event.issueId, t.id), inArray(event.type, ['smoke.accepted']))).orderBy(desc(event.seq)).limit(1)
  const sha = (last?.payload as { sha?: string | null } | undefined)?.sha ?? null
  const accepted = last ? { by: last.actor, at: new Date(last.ts).toISOString(), sha, ...(head && sha !== head ? { stale: true } : {}) } : null
  const why = whyNotAccept({ head, owed: checks.filter((c) => c.mark === 'todo' && holds(c.when)).length, failed: checks.filter((c) => c.mark === 'fail').length, unchecked: staged ? 0 : acceptanceOf(t).filter((c) => c.built === undefined && !c.builtEvidence && !proofOf(c)).length })
  // Each check's place as an address on the set-up it needs, while that has one: a link to press, never a port to work out.
  const linked = checks.map((c) => {
    const base = setups.find((s) => s.key === c.setup)?.url
    const link = /^https?:\/\//.test(c.where ?? '') ? c.where! : base ? addressOf(base, c.where) : null
    return link ? { ...c, link } : c
  })
  return {
    /** A staged task: the checks are every criterion no agent marked, not what a check after the build left. */ staged,
    /** The person has accepted the smoke test (acceptSmoke): by whom, when, and on which commit. stale: the branch has moved since. Null: not accepted. */ accepted,
    /** It can be accepted now; else why not. */ canAccept: !why, acceptWaits: why,
    /** What is owed at deploy and what is watched after: neither is checked here. */ release: releaseChecks(acceptanceOf(t)), watch: watchChecks(acceptanceOf(t)),
    ...first, // the app's first set-up, as the view was when an app had one
    branch, head, /** Its pull request, when there is one: a preview is of it. */ pr,
    /** Every set-up of the app, each with where it is and whether it is up; a check names the one it needs. */ setups,
    checks: linked, owed: checks.filter((c) => c.mark === 'todo' && holds(c.when)).length, failed: checks.filter((c) => c.mark === 'fail').length,
  }
}

/** A set-up's checkout of the build: one per set-up, so two can install and run side by side. */
const checkoutPath = (repoPath: string, name: string, key: string, first: boolean) => join(`${repoPath}-worktrees`, `smoke--${name.toLowerCase()}${first ? '' : `--${key}`}`)

/**
 * Where a set-up's terminal opens (smoke-terminal.ts): its checkout of the build, made at the branch's head when
 * there is none yet and left as it is when there is (a server may be running in it); whether it wants a new empty
 * folder instead; the script typed in at the start (a terminal set-up's own); and the address of the build, when a
 * set-up tested here is up, for commands that ask it.
 */
export async function smokePlace(issueId: string, setupKey?: string, /** Not the set-up's own terminal: the throwaway one every set-up has, in a new empty folder. */ scratch = false) {
  const { t, a, repoPath, name, head } = await built(issueId)
  const all = smokeSetups(a.setup)
  const named = setupKey ? all.find((x) => x.key === setupKey) : all[0]
  if (!named) throw new PlanError(`${a.name} has no smoke test set-up "${setupKey}" (${all.map((x) => x.key).join(', ')})`)
  if (!scratch && named.where !== 'local' && named.where !== 'terminal') throw new PlanError(`${named.name} is deployed: there is no folder here to open a terminal in`)
  const folder = scratch ? 'temp' as const : named.where === 'terminal' ? named.folder ?? 'build' : 'build'
  let checkout: string | null = null
  if (repoPath && head) {
    checkout = checkoutPath(repoPath, name, named.key, named.key === all[0].key)
    if (!existsSync(checkout)) await git(repoPath, ['worktree', 'add', '--detach', checkout, head])
  }
  if (folder === 'build' && !checkout) throw new PlanError(`${name} is not built yet: there is no checkout to open a terminal in`)
  const runs = await db.select().from(smokeRun).where(eq(smokeRun.issueId, t.id))
  const up = all.filter((x) => x.where === 'local').map((x) => ({ x, run: runs.find((r) => r.setup === x.key) })).find(({ x, run }) => run?.port && alive(t.id, x.key))
  return { key: scratch ? scratchKey(named.key) : named.key, task: name, folder, checkout, script: !scratch && named.where === 'terminal' ? named.cmd ?? null : null, url: up?.run?.port ? `http://localhost:${up.run.port}` : null }
}

/** Local only: run the built branch, at its head, in the smoke test's own worktree. Run again, it moves to the new head. */
/** A smoke test, for a main run beside it (main-running.ts): its database, and how that set-up is started (its own script, stop script and variables), so main is started the same way. */
export async function smokeDataOf(issueId: string, setupKey?: string | null) {
  const { a, name } = await built(issueId)
  const all = smokeSetups(a.setup)
  const named = all.find((x) => x.key === setupKey) ?? all[0]
  const first = named.key === all[0].key
  const { PORT: _port, ...env } = await smokeEnv(a.id, named, { port: 0, key: first ? undefined : named.key })
  return { slug: `smoke-${name.toLowerCase()}${first ? '' : `-${named.key}`}`, cmd: named.cmd ?? null, stop: named.stop ?? null, env, beside: `${name}'s smoke test` }
}

/**
 * A smoke run's outside services (mocks.ts): every mock in the app's library that can serve, as stand-ins; and each
 * service it calls for real (live) through a recorder, so the response is kept with the task. Their variables go to
 * the script and into $STAND_INS_ENV, for a container's env_file, as a prototype's do. A recorded run is marked
 * SELF_EVIDENT_RECORDING=1: the base URL is on this computer, but every call reaches the real service and costs.
 */
export async function mocksFor(appId: string, issueId: string, key: string, path: string, live: string[], base: Record<string, string>) {
  const id = `smoke-${issueId}-${key}`.toLowerCase()
  // The task's table says which data each mock serves in a smoke test, and which services it calls for real (mock-places.ts).
  const plans = await plansFor(appId, 'smoke', issueId)
  live = [...new Set([...live, ...plans.record])]
  const lib = await libraryStandIns(appId, live, plans.pick)
  const ports = await startStandIns(id, lib, path, { ...process.env, ...base })
  const env: Record<string, string> = envOf(id, lib, ports, path)
  const held: Mocks = { id, recorders: [], on: lib.map((s) => ({ key: s.key, name: s.name, how: s.data?.kind === 'real' ? 'real' as const : s.mock === 'assumed' ? 'assumed' as const : 'mock' as const })) }
  try {
    for (const k of live) {
      const [m] = await db.select().from(mock).where(and(eq(mock.appId, appId), eq(mock.key, k)))
      if (!m) throw new PlanError(`this app has no mock "${k}" to record: raise it first (Settings › Mocks), with the real service's address`)
      if (!m.upstream) throw new PlanError(`${m.name} has no address for the real service: set it on Settings › Mocks before a live run`)
      if (!Object.keys(m.env ?? {}).length) throw new PlanError(`${m.name} has no variables that point the app at it: set them on Settings › Mocks before a live run`)
      const rec = await startRecorder({ appId, issueId, key: m.key, upstream: m.upstream })
      held.recorders.push(rec)
      held.on.push({ key: m.key, name: m.name, how: 'recording' })
      for (const [v, val] of Object.entries(m.env ?? {})) env[v] = fill(val, { port: rec.port, home: homeOf(id), dir: rec.dir, worktree: path })
    }
  } catch (err) { await endMocks(issueId, held, false); throw err }
  if (held.recorders.length) env.SELF_EVIDENT_RECORDING = '1'
  const out: Record<string, string> = { ...env, STAND_INS_ENV: writeEnvFile(id, env) }
  return { env: out, held }
}
/** Stop them; a recorder that kept something says so on its mock, and the task's agent is asked to mine it. */
export async function endMocks(issueId: string, m: Mocks | undefined, mine = true) {
  if (!m) return
  dropUse(m.id)
  await stopStandIns(m.id)
  for (const r of m.recorders) {
    const { dir, exchanges } = await r.stop()
    if (!dir) continue
    const t = await getIssue(db, issueId).catch(() => null)
    if (!t) continue
    await noteRecording(t.appId, r.key, dir, issueId, exchanges).catch(() => undefined)
    if (mine) await askToMine(issueId, r.key, dir, exchanges).catch(() => undefined)
  }
}
/** The words the task's agent is given to mine a recording: also what "Mine it" on the Mocks page sends. */
/** What a mock's server is, said the same to whoever writes one. */
const THE_SERVER = (name: string) => `Write its server (stdlib only where you can): it serves on $PORT, answers the calls the app makes to ${name} the way ${name} does, and reads what it answers with from the folder $MOCK_DATA, which holds the response files under the same names as the real response's folder (the real ones, or a fake of them: it must work with either, and holds no data of its own). Every response there is one endpoint's, by its file's name: <key>.<ext> is that endpoint's response, <key>.<anything>.<ext> is more of the same added by hand, and an endpoint whose real file came under another name says so in its file. The server answers each endpoint from that endpoint's files (all of them: a fake may have people added beside it) and from nothing else; an endpoint with no file, it answers as the code that calls it expects. Read the code that calls ${name} first, and above all how the app matches an answer to what it sent: a service that answers a batch (ids, emails or an order carried back, row for row) must be answered for exactly what this request sent, so the server remembers what each job was sent and builds that job's answer from it, giving each thing sent a row of the data (the row whose key matches it, else one by turn, so everything sent is answered) with the sent ids and emails written over the data's. A link it sends to fetch next points back at the server. It accepts any key`
const THE_DATA = (key: string, dir: string) => `Then its data, with the mock_data tool, mock ${key}: op fake, recording ${dir}, and a plan naming what is structure (keep: the columns or keys the app reads as fixed words, a status, a category, a platform; keepHosts: the sites whose address the app reads; text: any column that is prose about the person). It refuses while a real value is still in the fake, and says which: change the plan and fake again. Then add the people the real response did not have (someone with nothing found, someone with one of each, someone with a lot) as a file of their own beside the fake's: op write with data set to the key the fake's result gave (a response given for one endpoint is faked into that endpoint's own data, under a key of its own), giving the fake's files as they are and yours (the same header, rows invented in the same shape and marked as sample data). A fake made again from a newer real response keeps your file and replaces only its own. An endpoint marked sensitive has no real response to fake: the engine faked it as it arrived and did not keep the original, so add people beside that fake and never ask for the original.`
const NEVER = 'Never copy a real response, or a value from one, into the server, the data you write, the repository or a message.'
/** What the task's agent is asked, once a live run of a service has been recorded. */
export const MINE_IT = (name: string, key: string, dir: string, exchanges: number) => `A live run of ${name} was recorded: ${exchanges} call${exchanges === 1 ? '' : 's'}, kept raw in ${dir} (outside every repository; it holds a real person's data). Make the app's mock of ${name} from it now:\n1. Read every file there. Each call is NNN.meta.json (method, address, status; secrets were never kept) with its NNN.request.* and NNN.response.* bodies.\n2. ${THE_SERVER(name)}.\n3. Save it with the mock tool: op save, key ${key}, status mined, recording ${dir}, endpoints (every call the app makes to ${name}, in the order it makes them, each with a key, its method, its path and what it answers with), the server's files, cmd, env, and provenance (minedFrom in counts and never naming the person, real, invented, covers, cannotShow; changed when it replaces one).\n4. ${THE_DATA(key, dir)}\n${NEVER}`
/** The same, for files the person gave (mocks.ts giveRecording): only the responses the app reads were kept, not the calls around them. */
export const MINE_GIVEN = (name: string, key: string, dir: string) => `Real responses from ${name} were given: files the person already had (any body the service sends, JSON, CSV or other text), kept untouched in ${dir} (outside every repository; it holds real people's data). given.meta.json says which files and what they are. Make the app's mock of ${name} from them now:\n1. Read each file: its columns or keys, nesting, formats, what is written inside a cell (JSON, lists, quoted reprs), empty and large values.\n2. ${THE_SERVER(name)}. Any call around the files that was not given (start, poll, pages, errors, the link to fetch a file) was not recorded: take it from the code that makes it.\n3. Save it with the mock tool: op save, key ${key}, status mined, recording ${dir}, endpoints (every call the app makes to ${name}, in the order it makes them, each with a key, its method, its path and what it answers with; the one each given file answers names that file in its file), the server's files, cmd, env, and provenance: minedFrom (files the person gave, in counts, never naming anyone), real (their shape), invented, covers, and cannotShow, which must name each call taken from the code rather than given.\n4. ${THE_DATA(key, dir)}\n${NEVER}`
export async function askToMine(issueId: string, key: string, dir: string, exchanges: number) {
  const t = await getIssue(db, issueId)
  const [m] = await db.select().from(mock).where(and(eq(mock.appId, t.appId), eq(mock.key, key)))
  const { ensureTaskTalk, say } = await import('./talk.js') // late: talk.ts reaches here through its tools
  const talk = await ensureTaskTalk(issueId, 'engine')
  await say(talk.id, isGiven(dir) ? MINE_GIVEN(m?.name ?? key, key, dir) : MINE_IT(m?.name ?? key, key, dir, exchanges), undefined, { author: 'engine', kind: 'brief', payload: { label: `Mine a mock of ${m?.name ?? key}` } })
}

export async function startSmoke(issueId: string, actor = 'user', opts: { /** Start from nothing: its database made again and filled, and the script told so ($SMOKE_CLEAN). */ clean?: boolean; /** Which set-up (its key); none: the app's first. */ setup?: string; /** The services to call for real, by their mock's key: each through a recorder, so what they send is kept (recorder.ts). */ live?: string[]; /** Start from this fixture of the app's: its database is dropped and built again from it. */ fixture?: string; /** Start empty: its database is dropped and built again from no fixture at all, only the set-up's own seed (in the app's settings), which says what empty is for this app. */ empty?: boolean } = {}) {
  const { t, a, repoPath, name, branch, head } = await built(issueId)
  const all = smokeSetups(a.setup)
  const named = opts.setup ? all.find((x) => x.key === opts.setup) : all[0]
  if (!named) throw new PlanError(`${a.name} has no smoke test set-up "${opts.setup}" (${all.map((x) => x.key).join(', ')})`)
  const setup: SmokeSetup = named
  const first = named.key === all[0].key
  const key = named.key // what its run is kept under
  if (setup.where === 'terminal') throw new PlanError(`${named.name} is a terminal: open it, there is no server to start`)
  if (setup.where !== 'local') throw new PlanError(`${a.name} is smoke tested ${setup.where === 'staging' ? 'on staging' : setup.where === 'preview' ? 'on a preview of its pull request' : 'behind a feature flag'}: there is nothing to start here`)
  if (!repoPath) throw new PlanError(`${a.name} has no local checkout`)
  if (!branch || !head) throw new PlanError(`${name} is not built yet: there is no branch to run`)
  const cmd = setup.cmd ?? (a.setup as { prototype_cmd?: string } | null)?.prototype_cmd?.trim()
  if (!cmd) throw new PlanError(`${a.name} has no command to run it: set how its prototypes are started in Settings, or a command of the smoke test's own`)
  await stopOne(t.id, key)
  const path = checkoutPath(repoPath, name, named.key, first) // a checkout per set-up, so two can install and run side by side
  // Its own worktree, at the commit and on no branch: the task's branch is nobody's to check out (it is moved by landing).
  if (existsSync(path)) await git(path, ['checkout', '--detach', '--force', head])
  else await git(repoPath, ['worktree', 'add', '--detach', path, head])
  const dbCfg = (a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url ? (a.setup as { prototype_db: PrototypeDb }).prototype_db : null
  const slug = `smoke-${name.toLowerCase()}${first ? '' : `-${named.key}`}`
  // Started from a fixture the person chose: checked before anything is dropped, so a wrong name loses nothing.
  if (opts.fixture && !dbCfg) throw new PlanError(`${a.name} has no database set for its prototypes, so there is nothing to build from a fixture`)
  if (opts.fixture && !(await listScenarios({ appId: a.id }, path)).includes(opts.fixture)) throw new PlanError(`${a.name} has no fixture "${opts.fixture}"`)
  if (opts.empty && opts.fixture) throw new PlanError('start from a fixture, or empty: not both')
  if (opts.empty && !dbCfg) throw new PlanError(`${a.name} has no database set for its prototypes, so there is nothing to start empty`)
  if (dbCfg && (opts.clean || opts.fixture || opts.empty)) await dropDatabase(dbCfg, slug)
  let builtFrom: string | null | undefined // undefined: its database was left as it was
  if (dbCfg && !(await databaseExists(dbCfg, slug))) {
    // The fixture this task's mock data was made for (fixtures.ts), so what the app sends is who the mock answers for; else the app's shared "default", when it has one.
    const names = await listScenarios({ appId: a.id }, path), made = await fixtureForTask(a.id, t.id)
    builtFrom = opts.empty ? null : opts.fixture ?? (made && names.includes(made) ? made : names.includes('default') ? 'default' : null)
    const { url } = await rebuild(dbCfg, slug, path, builtFrom, { appId: a.id })
    if (setup.seed) { // the app's own seed, from its settings: after the schema, and after the app's shared scenario when it has one
      const c = new pg.Client({ connectionString: url })
      await c.connect()
      try { await c.query(setup.seed) } catch (err) { throw new PlanError(`the smoke test's seed failed: ${(err as Error).message}`) } finally { await c.end() }
    }
  }
  const [old] = await db.select().from(smokeRun).where(and(eq(smokeRun.issueId, t.id), eq(smokeRun.setup, key)))
  const port = await freePort(old?.port ?? 0)
  const more = await morePorts()
  const env = { ...more.env, ...await smokeEnv(a.id, setup, { port, db: dbCfg ? { [dbCfg.env ?? 'DATABASE_URL']: databaseUrl(dbCfg, slug) } : undefined, clean: opts.clean, key: named.key }) }
  if (setup.stop && old) await runStop(setup.stop, old.path, { ...env, PORT: String(old.port) }) // what the last run left up, when the engine has been started again since
  const mocks = await mocksFor(a.id, t.id, key, path, opts.live ?? [], env)
  Object.assign(env, mocks.env)
  // What a tester brings to it (test-files.ts): the versions the task says a smoke test uses, in a folder outside every repository.
  Object.assign(env, { TEST_FILES: (await placeTestFiles(a.id, t.id, 'smoke', smokeFilesDir(t.id, key))).dir })
  const proc = spawn('sh', ['-c', cmd], { cwd: path, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 300) log.splice(0, log.length - 300) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  proc.on('exit', (code) => { log.push(`exited${code === null ? '' : ` with ${code}`}`) })
  running.set(runKey(t.id, key), { proc, log, given: [port, ...more.ports], mocks: mocks.held, ...(setup.stop ? { stop: { cmd: setup.stop, cwd: path, env } } : {}) })
  noteUse(mocks.held.id, a.id, `Smoke test: ${name}`, mocks.held.on.filter((m) => m.how !== 'recording').map((m) => m.key), mocks.held.on.filter((m) => m.how === 'recording' || m.how === 'real').map((m) => m.key))
  if (old) await db.update(smokeRun).set({ path, sha: head, port, ...(builtFrom !== undefined ? { fixture: builtFrom } : {}), updatedAt: new Date() }).where(eq(smokeRun.id, old.id))
  else await db.insert(smokeRun).values({ id: newId('run').replace(/^run_/, 'smoke_'), appId: a.id, issueId: t.id, setup: key, path, sha: head, port, fixture: builtFrom ?? null })
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'smoke.started', payload: { sha: head, port, setup: named.key, ...(mocks.held.on.length ? { mocks: mocks.held.on } : {}) } }))
  return smokeView(t.id)
}

const smokeFilesDir = (issueId: string, key: string) => join(homeOf(`smoke-${issueId}-${key}`.toLowerCase()), 'test-files')

/** The folder of files a smoke test was given, opened in this computer's file manager: a browser's own file dialog cannot be pointed at it. */
export async function revealSmokeFiles(issueId: string, setupKey?: string) {
  const { t, a } = await built(issueId)
  const all = smokeSetups(a.setup), named = setupKey ? all.find((x) => x.key === setupKey) : all[0]
  if (!named) throw new PlanError(`${a.name} has no smoke test set-up "${setupKey}"`)
  const dir = smokeFilesDir(t.id, named.key)
  if (!existsSync(dir)) throw new PlanError('this smoke test has been given no files: add them under Fixtures › Files, then start it')
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  spawn(cmd, [dir], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  return { opened: dir }
}

/**
 * A smoke test's database as it is now, kept as a fixture of the app's (Sandy, 2026-11-23: "we need to be able to save
 * the smoke test or prototype database as fixtures. Then when we start the smoke test, we choose which fixture to
 * use"). real: it holds what a real service sent about a real person, so it is this computer's only.
 */
export async function keepSmokeDatabase(issueId: string, i: { name: string; setup?: string; real?: boolean }, actor = 'user') {
  const { t, a, name } = await built(issueId)
  const all = smokeSetups(a.setup), named = i.setup ? all.find((x) => x.key === i.setup) : all[0]
  if (!named) throw new PlanError(`${a.name} has no smoke test set-up "${i.setup}"`)
  const dbCfg = (a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db?.url ? (a.setup as { prototype_db: PrototypeDb }).prototype_db : null
  const slug = `smoke-${name.toLowerCase()}${named.key === all[0].key ? '' : `-${named.key}`}`
  if (!dbCfg || !(await databaseExists(dbCfg, slug))) throw new PlanError('this smoke test has no database yet: run it first')
  const saved = await save(dbCfg, slug, { appId: a.id }, i.name.trim(), true)
  await db.update(scenario).set({ real: !!i.real }).where(and(eq(scenario.appId, a.id), eq(scenario.scope, ''), eq(scenario.name, saved.scenario)))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'smoke.kept_as_fixture', payload: { name: saved.scenario, real: !!i.real, saved: saved.saved } }))
  return { fixture: saved.scenario, real: !!i.real, saved: saved.saved }
}

/** Stop one set-up of a task's, or, with no key, every one of them that is up. */
export function stopSmoke(issueId: string, key?: string): Promise<void> {
  if (key === undefined) return Promise.all([...running.keys()].filter((k) => k.startsWith(`${issueId}:`)).map((k) => stopOne(issueId, k.slice(issueId.length + 1)))).then(() => {})
  return stopOne(issueId, key)
}
/** mine: a recording it made is handed to the task's agent; not when the engine itself is stopping (the Mocks page offers it after). */
function stopOne(issueId: string, key: string, mine = true): Promise<void> {
  const m = running.get(runKey(issueId, key))
  running.delete(runKey(issueId, key))
  if (!m) return Promise.resolve()
  const down = () => (m.stop ? runStop(m.stop.cmd, m.stop.cwd, m.stop.env).then(() => {}) : Promise.resolve()).then(() => endMocks(issueId, m.mocks, mine)) // the app's stop script, after its process: for what the script left running; then its mocks and recorders
  if (m.proc.exitCode !== null || m.proc.signalCode !== null || !m.proc.pid) return down()
  const gone = new Promise<void>((r) => { m.proc.once('exit', () => r()); setTimeout(r, 3000) })
  try { process.kill(-m.proc.pid, 'SIGTERM') } catch { m.proc.kill('SIGTERM') }
  return gone.then(down)
}
export function stopSmokes() { for (const k of [...running.keys()]) { const at = k.lastIndexOf(':'); void stopOne(k.slice(0, at), k.slice(at + 1), false) } }

/** Why the smoke test cannot be accepted now; null when it can. Pure. */
export function whyNotAccept(i: { head: string | null; /** Checks of the person's that still wait, before the merge. */ owed: number; failed: number; /** Criteria the check has not looked at. */ unchecked: number }): string | null {
  if (!i.head) return 'nothing is built yet'
  if (i.failed) return `${i.failed} check${i.failed === 1 ? '' : 's'} failed by hand: ${i.failed === 1 ? 'it is' : 'they are'} sent back, and come${i.failed === 1 ? 's' : ''} back to you`
  if (i.owed) return `${i.owed} check${i.owed === 1 ? '' : 's'} of yours still wait${i.owed === 1 ? 's' : ''}: mark ${i.owed === 1 ? 'it' : 'each'}, or skip ${i.owed === 1 ? 'it' : 'them'}`
  if (i.unchecked) return `${i.unchecked} ${i.unchecked === 1 ? 'criterion is' : 'criteria are'} not checked yet: run the check first`
  return null
}

/**
 * The person accepts the smoke test: they have tried the built code and it is what goes to review (Sandy, 2026-11-23:
 * "Smoke test: the person tries the built code and accepts it. Before merge only"; "Accepting the smoke test starts
 * the Pull request finalizing"). Kept as an event with the commit it was said on, so a branch that has moved since
 * shows the acceptance as stale. What is owed at deploy does not hold it. The finalizing it starts is not built yet:
 * it will be started from here.
 */
export async function acceptSmoke(issueId: string, by = 'user') {
  const view = await smokeView(issueId)
  if (!view.canAccept) throw new PlanError(`the smoke test cannot be accepted yet: ${view.acceptWaits}`)
  const { t, a, head } = await built(issueId)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'smoke.accepted', payload: { sha: head, checks: view.checks.length, release: view.release.length } }))
  return smokeView(issueId)
}

/**
 * Whoever deployed says a release check is done, or that it is not, with why. The task's own record: nothing here
 * can see the environment.
 */
export async function markRelease(issueId: string, criterionId: string, input: { done: boolean; note?: string }, by = 'user') {
  const { t, a, head } = await built(issueId)
  const c = acceptanceOf(t).find((x) => x.id === criterionId)
  if (!c) throw new PlanError(`no acceptance criterion ${criterionId} on this task`)
  if (proofOf(c) !== 'release') throw new PlanError('that criterion is not a release check: only what is done at deploy is marked here')
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!input.done && !note) throw new PlanError('say what stands in the way: a release check that is not done is usually why production is wrong')
  await setAcceptance(t.id, { update: [{ id: c.id, kind: 'release', built: input.done, byHand: { pass: input.done, note, sha: head, at: new Date().toISOString(), by } }] }, by)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'release.marked', payload: { criterionId: c.id, done: input.done, note } }))
  return { release: releaseChecks(acceptanceOf(await getIssue(db, t.id))) }
}

/** A person's word on one check: the build's mark on that criterion, by hand, with their note and the commit it was made on. */
export async function markSmoke(issueId: string, criterionId: string, input: { pass: boolean; note?: string; /** Not tried, by choice: it stops waiting for the person, and is recorded as skipped, never as passed. */ skip?: boolean }, by = 'user') {
  const { t, a, head, pr, staged } = await built(issueId)
  const c = acceptanceOf(t).find((x) => x.id === criterionId)
  if (!c) throw new PlanError(`no acceptance criterion ${criterionId} on this task`)
  if (later(c)) throw new PlanError(proofOf(c) === 'release' ? 'that one is a release check: it is done at deploy by whoever deploys, and marked on the pull request step, not in the smoke test' : 'that one is watched in production after the deploy: nobody marks it in the smoke test')
  if (!forPerson(c, staged)) throw new PlanError(staged ? 'that criterion is not one for a person here: an agent has already marked it. Change its mark on the brief\'s page' : 'that criterion is not one for a person: the check after the build did not leave it to them')
  if (whenOf(c) === 'pr' && !pr && !input.skip) throw new PlanError('that one is checked on the pull request, and this task has none yet')
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (input.skip) {
    await setAcceptance(t.id, { update: [{ id: c.id, built: true, builtEvidence: `Skipped, not tried${note ? `: ${note}` : '.'}`, byHand: { pass: true, note, sha: head, at: new Date().toISOString(), by, skipped: true } }] }, by)
    await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'smoke.skipped', payload: { criterionId: c.id, note, sha: head } }))
    return { ...(await smokeView(t.id)), marked: { id: c.id, pass: true, skipped: true } }
  }
  if (!input.pass && !note) throw new PlanError('say what you saw: a fail is sent back to be fixed, and the note is what the fix works from')
  await setAcceptance(t.id, { update: [{ id: c.id, built: input.pass, builtEvidence: note || 'Checked by hand: it holds.', byHand: { pass: input.pass, note, sha: head, at: new Date().toISOString(), by } }] }, by)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor: by, type: 'smoke.marked', payload: { criterionId: c.id, pass: input.pass, note, sha: head } }))
  const view = await smokeView(t.id)
  return { ...view, marked: { id: c.id, pass: input.pass } }
}

/**
 * An agent tries one check, when the person asks (Sandy, 2026-11-18: "a button that triggers the agent to do a test of
 * it and gets their result. That doesn't pass it, but it gives us their result since we're no longer doing that as
 * part of the regular workflow"). What it saw is kept on the criterion as `tried` and shown on the check; the mark
 * stays the person's. It runs in the smoke test's own worktree, against what is up, and changes nothing.
 */
const trying = new Set<string>() // by task and criterion; in memory, so an engine that is started again forgets a try it lost
const TRY_SCHEMA = { type: 'object', additionalProperties: false, required: ['verdict', 'note'], properties: { verdict: { type: 'string', enum: ['holds', 'fails', 'unsure'] }, note: { type: 'string' } } }
const TRY_TOOLS = ['Read', 'Glob', 'Grep', 'LS']
export const TRY_MINUTES = 6

export const tryPrompt = (i: { text: string; where?: string; how?: string; url: string | null; link?: string | null; pr?: string | null; when: When; /** What a tester brings to it, and where it is (test-files.ts). */ files?: string[] }) => [
  'A person is smoke testing a built task by hand, and has asked you to try one of its checks and say what you saw. You do not mark it: your word is shown beside the check, and the person decides.',
  '',
  `The check: ${i.text}`,
  ...(i.how ? [`What to do and what passing looks like: ${i.how}`] : []),
  ...(i.where ? [`Where: ${i.where}${i.link ? ` (${i.link})` : ''}`] : []),
  i.url ? `The built code is running at ${i.url}. You are in its checkout, at the commit it runs. Use what is running; do not start another copy.` : 'The built code is not running here. You are in its checkout: try what you can from the code and its commands.',
  ...(i.when === 'pr' && i.pr ? [`It can only be seen on the pull request: ${i.pr} (gh can read it).`] : []),
  ...(i.files?.length ? ['', ...i.files] : []),
  '',
  'Rules:',
  '- Try it the way the person would: ask the running code (curl, or a headless browser the repository already has), run the command, read what comes back.',
  `- A few minutes at most (${TRY_MINUTES} and you are stopped). One or two cases, not a sweep.`,
  '- Change nothing: no edits, no commits, no installs. Stop anything you start.',
  `- ${STOP_ONLY_YOURS}`,
  '- verdict is "holds" only if you saw it hold, "fails" only if you saw it fail, and "unsure" when you could not see it (how it looks or feels, a real device) or could not get there.',
  '- note is for the person, under 300 characters, plain words: what you did and what you saw. For "unsure", what they should look at.',
].join('\n')

/** The agent's run, apart so a test can stand in for it. */
export type TryRun = (i: { prompt: string; cwd: string; setup: unknown }) => Promise<{ verdict: Tried['verdict']; note: string }>
const agentTry: TryRun = async (i) => {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TRY_MINUTES * 60_000)
  let out: unknown
  try {
    for await (const m of query({ prompt: i.prompt, options: { cwd: i.cwd, ...accountEnv(i.setup as never), abortController: abort, maxTurns: 40, settingSources: [], tools: [...TRY_TOOLS, 'Bash'], allowedTools: TRY_TOOLS, permissionMode: 'default', ...guardOptions(builderGuard(i.cwd, TRY_TOOLS, [])), outputFormat: { type: 'json_schema', schema: TRY_SCHEMA } } })) {
      if (m.type === 'result') out = (m as { structured_output?: unknown }).structured_output
    }
  } finally { clearTimeout(timer) }
  const o = out as { verdict?: string; note?: string } | undefined
  if (!o || !['holds', 'fails', 'unsure'].includes(o.verdict ?? '')) throw new Error(abort.signal.aborted ? `it ran out of time (${TRY_MINUTES} minutes)` : 'it finished without saying what it saw')
  return { verdict: o.verdict as Tried['verdict'], note: String(o.note ?? '') }
}

export async function trySmoke(issueId: string, criterionId: string, actor = 'user', run: TryRun = agentTry) {
  const { t, a, repoPath, head, pr } = await built(issueId)
  const view = await smokeView(t.id)
  const check = view.checks.find((c) => c.id === criterionId)
  if (!check) throw new PlanError(`no smoke test check ${criterionId} on this task`)
  const k = runKey(t.id, criterionId)
  if (trying.has(k)) throw new PlanError('an agent is already trying that one')
  const su = view.setups.find((x) => x.key === check.setup) ?? view.setups[0]
  if (su.where === 'local' && check.when === 'here' && !su.up) throw new PlanError(`${su.name} is not running: run it first, and the agent tries what is up`)
  const runRow = (await db.select().from(smokeRun).where(and(eq(smokeRun.issueId, t.id), eq(smokeRun.setup, su.key))))[0]
  const cwd = runRow?.path && existsSync(runRow.path) ? runRow.path : repoPath ?? tmpdir() // deployed, with no checkout here: it still has the address to ask
  const files = su.where === 'local' ? testFilesSay(await placeTestFiles(a.id, t.id, 'smoke', smokeFilesDir(t.id, su.key))) : []
  const prompt = tryPrompt({ text: check.text, where: check.where, how: check.how, url: su.url, link: check.link, pr: pr?.url ?? null, when: check.when, files })
  const say = (type: string, payload: Record<string, unknown>) => db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type, payload: { criterionId, ...payload } }))
  trying.add(k)
  await say('smoke.trying', {})
  const done = (async () => {
    let tried: Tried
    try { const r = await run({ prompt, cwd, setup: a.setup }); tried = { verdict: r.verdict, note: r.note, sha: head, at: new Date().toISOString() } }
    catch (err) { tried = { verdict: 'unsure', note: `The agent could not try it: ${String((err as Error).message ?? err).slice(0, 300)}`, sha: head, at: new Date().toISOString() } }
    finally { trying.delete(k) }
    await setAcceptance(t.id, { update: [{ id: criterionId, tried }] }, 'engine')
    await say('smoke.tried', { verdict: tried.verdict, note: tried.note, sha: head })
  })().catch((err) => console.warn(`[smoke] a try of ${criterionId} was lost: ${(err as Error).message}`))
  return { view: await smokeView(t.id), /** For a test: when the agent has said. */ done }
}
