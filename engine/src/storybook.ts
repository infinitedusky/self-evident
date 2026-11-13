/**
 * An app's Storybook: the Mockups integration (SHAPE.md: Storybook is the home of the design system, stories and
 * mockups; Sandy, 2026-11-09: an integration, with the screen map checked). The engine starts it on request (the
 * integration's command, in the app's checkout) and keeps it running; it is told apart from a Storybook someone
 * else started by simply asking the URL. The check reads the repo for the standard: Storybook 10 with the screen
 * map (@zigbang/storybook-addon-story-flow) wired in, its stylesheet imported, the flow files kept out of the story
 * tests, and a map; then whether it answers. First thing wrong is the answer.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo, session } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { git } from './git.js'
import { remoteAndBase } from './lifecycle.js'
import { PlanError } from './projects.js'
import { commitOnBase, type Run } from './tkt.js'

const running = new Map<string, { proc: ChildProcess; startedAt: Date }>() // by the folder it runs in: the main checkout, or a conversation's worktree

export interface StorybookSetup { on: boolean; url: string | null; cmd: string | null }
/**
 * The integration's values on an app: the switch, and the command and URL when the person set them (otherwise the
 * defaults from the repo, storybookValues). Before the switch (2026-11-09) a command or URL meant on; the keys the
 * values lived under before the integration are still read until the start-up move.
 */
export function storybookSetup(setup: unknown): StorybookSetup {
  const s = (setup ?? {}) as { integrations?: { storybook?: { on?: string; url?: string; cmd?: string } }; storybook_url?: string; storybook_cmd?: string }
  const url = s.integrations?.storybook?.url?.trim() || s.storybook_url?.trim() || null
  const cmd = s.integrations?.storybook?.cmd?.trim() || s.storybook_cmd?.trim() || null
  const sw = s.integrations?.storybook?.on?.trim()
  return { on: sw === undefined ? !!(url || cmd) : sw === 'true', url, cmd }
}
export const hasStorybook = (setup: unknown) => storybookSetup(setup).on

/**
 * The house defaults, read from the repo (Sandy, 2026-11-09: "for all the integrations there has to be a default where
 * I can just put the integration and say set up"): the first package with a `storybook` script, the root first, run
 * with the repo's package manager and --no-open; the URL from the port the script names, else Storybook's 6006.
 */
export async function storybookDefaults(repoPath: string): Promise<{ cmd: string; url: string } | null> {
  const pkgs = ['package.json', ...(await tracked(repoPath, '*/package.json')).filter((p) => !p.includes('node_modules/'))]
  const pm = await pmOf(repoPath)
  for (const rel of pkgs) {
    let script: string | undefined
    try { script = (JSON.parse(await text(join(repoPath, rel))) as { scripts?: Record<string, string> }).scripts?.storybook } catch { continue }
    if (!script) continue
    const start = pm === 'npm' ? 'npm run storybook -- --no-open' : pm === 'bun' ? 'bun run storybook --no-open' : `${pm} storybook --no-open`
    const port = /(?:^|\s)(?:-p|--port)(?:\s+|=)(\d+)/.exec(script)?.[1] ?? '6006'
    const dir = dirname(rel)
    return { cmd: dir === '.' ? start : `cd ${dir} && ${start}`, url: `http://localhost:${port}` }
  }
  return null
}
/** The values in force for an app: its own where set, the repo's defaults for the rest; nothing when it is off. */
export async function storybookValues(setup: unknown, repoPath: string | null): Promise<StorybookSetup> {
  const s = storybookSetup(setup)
  if (!s.on || (s.url && s.cmd) || !repoPath) return s
  const d = await storybookDefaults(repoPath)
  return { on: s.on, url: s.url ?? d?.url ?? null, cmd: s.cmd ?? d?.cmd ?? null }
}

/**
 * Once, when the engine starts: the old keys move under the integration (values already under it win), and an app with
 * a command or URL but no switch gets the switch on, since having them meant on. Returns how many apps changed.
 */
export async function migrateStorybookSetup(): Promise<number> {
  const moved = await db.execute(sql`update app set setup = (setup - 'storybook_url' - 'storybook_cmd')
    || jsonb_build_object('integrations', coalesce(setup->'integrations', '{}'::jsonb)
      || jsonb_build_object('storybook', jsonb_strip_nulls(jsonb_build_object('url', setup->>'storybook_url', 'cmd', setup->>'storybook_cmd')) || coalesce(setup->'integrations'->'storybook', '{}'::jsonb)))
    where setup ? 'storybook_url' or setup ? 'storybook_cmd'`)
  const switched = await db.execute(sql`update app set setup = jsonb_set(setup, '{integrations,storybook,on}', '"true"'::jsonb)
    where (setup->'integrations'->'storybook' ? 'cmd' or setup->'integrations'->'storybook' ? 'url') and not (setup->'integrations'->'storybook' ? 'on')`)
  return (moved.rowCount ?? 0) + (switched.rowCount ?? 0)
}

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const r = await homeRepo(appId)
  const { url, cmd } = await storybookValues(a.setup, r?.localPath ?? null)
  return { a, cwd: r?.localPath ?? null, url, cmd }
}

/** A worktree's own port, the same every time (so a Storybook started before an engine restart is found again by asking it). */
export function portFor(cwd: string): number {
  let h = 0
  for (const c of cwd) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return 6100 + (h % 800)
}

/**
 * Which Storybook a conversation looks at (Sandy, 2026-11-09: a first mockup "is not showing … it is coded on a
 * worktree, but I think that storybook is then showing from main"; "we need the screens to match the worktree of the
 * plan of the task"). A conversation with a worktree of its own that has a Storybook gets that worktree's, on the
 * worktree's own port, with the dependencies installed first when the worktree has none; anything else gets the
 * app's, from the main checkout. `branch` says which, for the page to show.
 */
async function placeFor(appId: string, sessionId?: string | null) {
  const base = await setupOf(appId)
  const main = { ...base, branch: base.a.defaultBranch ?? 'main', main: true }
  if (!sessionId) return main
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s || s.appId !== appId || !s.cwd || s.cwd === base.cwd || !(await exists(s.cwd))) return main
  if (!(await tracked(s.cwd, '*.storybook/main.*')).length) return main // its branch was cut before the app had a Storybook
  const d = await storybookDefaults(s.cwd)
  const own = storybookSetup(base.a.setup).cmd ?? d?.cmd ?? null
  if (!own) return main
  const port = portFor(s.cwd)
  const install = (await exists(join(s.cwd, 'node_modules'))) ? '' : `${{ pnpm: 'pnpm install --frozen-lockfile', npm: 'npm install', yarn: 'yarn install', bun: 'bun install' }[await pmOf(s.cwd)]} && `
  return { a: base.a, cwd: s.cwd, url: `http://localhost:${port}`, cmd: `${install}${own} -p ${port}`, branch: s.branch ?? 'its worktree', main: false }
}

/**
 * The address a page frames it at. Storybook 10 lets only localhost frame it (its frame-ancestors header), so when
 * Self Evident is served under a name (UI_URL) a proxy gives each Storybook a name beside it and drops the header:
 * STORYBOOK_FRAME is that address with {port} in it (https://sb-{port}.idea.dawn). Unset, or for a Storybook that is
 * not on this machine, it is the Storybook's own address.
 */
export function frameUrl(url: string | null, template = process.env.STORYBOOK_FRAME): string | null {
  const m = url && /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/.exec(url)
  return m && template ? `${template.replace('{port}', m[1]).replace(/\/$/, '')}${m[2] ?? ''}` : url
}

const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok || r.status < 500).catch(() => false)
const logFile = (cwd: string) => join(tmpdir(), 'self-evident', `storybook-${portFor(cwd)}.log`)
const logTail = async (cwd: string | null) => (cwd ? (await text(logFile(cwd))).split('\n').filter((l) => l.trim()).slice(-20).map((l) => l.slice(0, 300)) : [])

/**
 * Which story to show when one is asked for: itself when this Storybook has it; else the first story of the same
 * component (a mockup redone under new story names keeps its component); else none, and Storybook opens at its front.
 * A step can name a story from an earlier round in another worktree, and Storybook answers a missing id with an error
 * page (Sandy, 2026-11-10: "the mockup for RG-1 is broken").
 */
export function resolveStory(asked: string, ids: string[]): { asked: string; show: string | null; missing: boolean } {
  if (ids.includes(asked)) return { asked, show: asked, missing: false }
  const component = asked.split('--')[0]
  return { asked, show: ids.find((id) => id.split('--')[0] === component) ?? null, missing: true }
}

/** `story`: a story someone wants shown; the answer says which one this Storybook can show for it (resolveStory). */
export async function storybookStatus(appId: string, sessionId?: string | null, story?: string | null) {
  const { url, cmd, cwd, branch, main } = await placeFor(appId, sessionId)
  const mine = cwd ? running.get(cwd) : undefined
  const up = url ? await answers(url) : false
  let resolved: ReturnType<typeof resolveStory> | undefined
  if (up && story) {
    const ids = await listStories(appId, undefined, sessionId).then((l) => l.map((e) => e.id)).catch(() => null)
    if (ids) resolved = resolveStory(story, ids) // an index that won't answer leaves the story as asked
  }
  return { url, frame: frameUrl(url), configured: !!url, startable: !!(cmd && cwd), up, startedHere: !!mine && mine.proc.exitCode === null, log: up ? [] : await logTail(cwd), branch, main, ...(resolved ? { story: resolved } : {}) }
}

/**
 * Starts it where the conversation works. It runs on its own, not as the engine's child: the engine restarts on every
 * deploy, and a Storybook that died with it left the Mockups page on an error (Sandy's 502). Its output goes to a file.
 */
export async function startStorybook(appId: string, sessionId?: string | null) {
  const { a, url, cmd, cwd } = await placeFor(appId, sessionId)
  if (!cwd) throw new PlanError(`${a.name} has no local checkout: Storybook starts in the repo. Set it under Settings › Repo.`)
  if (!url || !cmd) throw new PlanError(`${a.name} has no Storybook to start: no \`storybook\` script in the repo, and no command set under Integrations › Storybook.`)
  if (await answers(url)) return storybookStatus(appId, sessionId)
  const mine = running.get(cwd)
  if (mine && mine.proc.exitCode === null) return storybookStatus(appId, sessionId)
  await mkdir(dirname(logFile(cwd)), { recursive: true })
  await writeFile(logFile(cwd), `> ${cmd}\n`)
  const out = openSync(logFile(cwd), 'a')
  const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, BROWSER: 'none', CI: '1' }, stdio: ['ignore', out, out], detached: true })
  proc.unref()
  closeSync(out)
  running.set(cwd, { proc, startedAt: new Date() })
  return storybookStatus(appId, sessionId)
}

/** Stops the Storybook of a worktree that is going away (a conversation ending), whoever started it: by its port. */
export async function stopStorybookAt(cwd: string) {
  const mine = running.get(cwd)
  running.delete(cwd)
  if (mine?.proc.pid && mine.proc.exitCode === null) { try { process.kill(-mine.proc.pid, 'SIGTERM') } catch { /* gone already */ } }
  const pids = await execFileP('lsof', ['-ti', `tcp:${portFor(cwd)}`, '-sTCP:LISTEN']).then((r) => r.stdout.split('\n').filter(Boolean), () => [] as string[])
  for (const pid of pids) { try { process.kill(Number(pid), 'SIGTERM') } catch { /* gone already */ } }
}

/**
 * The app's stories, from its running Storybook's own index: each one's id (what opens it), the component or page
 * it belongs to, and its name. `match` keeps those whose id, title or name contains it (any case).
 */
export async function listStories(appId: string, match?: string, sessionId?: string | null) {
  const { a, url } = await placeFor(appId, sessionId)
  if (!url) throw new PlanError(`${a.name} has no Storybook set; add its URL under Integrations › Storybook`)
  const res = await fetch(`${url.replace(/\/$/, '')}/index.json`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
  if (!res?.ok) throw new PlanError(`${a.name}'s Storybook is not answering at ${url}; opening the storybook tab offers to start it`)
  const index = (await res.json()) as { entries?: Record<string, { id: string; type?: string; title: string; name: string }> }
  const q = match?.toLowerCase()
  return Object.values(index.entries ?? {})
    .filter((e) => (e.type ?? 'story') === 'story')
    .map((e) => ({ id: e.id, title: e.title, name: e.name }))
    .filter((e) => !q || `${e.id} ${e.title} ${e.name}`.toLowerCase().includes(q))
    .slice(0, 200)
}

/** Forgets them; they keep running, and are found again by asking their address (tests stop theirs with stopStorybookAt). */
export function stopStorybooks() { running.clear() }

// The check: the standard for every project's Storybook, read from the repo.

export const ADDON = '@zigbang/storybook-addon-story-flow'
export interface StorybookContext { app: { id: string; name: string; defaultBranch?: string }; repoPath: string | null; url: string | null; cmd: string | null }
export interface Check { ok: boolean; detail: string; links?: { label: string; href: string }[] }
/** `answers` and `run` only in tests: whether a URL answers, and the command runner the install uses. */
export interface StorybookDeps { answers?: (url: string) => Promise<boolean>; run?: Run }
const SETUP = 'Set up Storybook (the button below) does it.'

const exists = (p: string) => stat(p).then(() => true, () => false)
const text = (p: string) => readFile(p, 'utf8').catch(() => '')
/** Files git has or would add under the repo, so node_modules stays out of the search. */
async function tracked(repoPath: string, pattern: string): Promise<string[]> {
  const r = await git(repoPath, ['ls-files', '--cached', '--others', '--exclude-standard', '--', pattern], { allowFail: true })
  return r.code === 0 ? r.stdout.split('\n').filter(Boolean).sort() : []
}
/** Whether the flow files stay out of the story tests: true when no vitest config runs the stories (nothing would import them), or the one that does excludes them. */
async function flowsExcluded(repoPath: string, prefix: string): Promise<boolean> {
  const configs = [...(await tracked(repoPath, `${prefix}vite*.config.*`)), ...(await tracked(repoPath, `${prefix}vitest.workspace.*`))]
  let runs = false
  for (const f of configs) { const t = await text(join(repoPath, f)); if (/addon-vitest|storybookTest/.test(t)) { runs = true; if (t.includes('flow.json')) return true } }
  return !runs
}
const depsOf = (pkg: string): Record<string, string> => { try { const p = JSON.parse(pkg); return { ...p.dependencies, ...p.devDependencies } } catch { return {} } }
const major = (range: string) => Number((range.match(/\d+/) ?? [NaN])[0])
/** Storybook's id for a map's docs page, from the flow file's title: "Parent/Map" → parent-map--docs. */
export const mapDocsId = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}--docs`

export async function checkStorybook(ctx: StorybookContext, deps: StorybookDeps = {}): Promise<Check> {
  const { repoPath, url } = ctx
  if (!repoPath) return { ok: false, detail: 'No local checkout under Repo: the check reads the Storybook config in the repo.' }
  const rel = (p: string) => relative(repoPath, p)
  const mains = await tracked(repoPath, '*.storybook/main.*')
  if (!mains.length) return { ok: false, detail: `No Storybook in ${repoPath}: no .storybook/main.* anywhere in the repo. Set up Storybook (the button below) installs it to the standard.` }
  const main = join(repoPath, mains[0])
  const sbDir = dirname(main)
  const where = relative(repoPath, dirname(sbDir)) || '.'
  const prefix = where === '.' ? '' : `${where}/`
  const pkg = { ...depsOf(await text(join(repoPath, 'package.json'))), ...depsOf(await text(join(repoPath, where, 'package.json'))) }
  const version = pkg.storybook ?? null
  if (version && major(version) < 10) return { ok: false, detail: `Storybook ${version} in ${where}: the screen map's add-on needs Storybook 10.` }
  if (!pkg[ADDON]) return { ok: false, detail: `Storybook is there (${where}), the screen map isn't: ${ADDON} isn't installed. ${SETUP}` }
  const mainText = await text(main)
  if (!mainText.includes('storybook-addon-story-flow')) return { ok: false, detail: `${ADDON} is installed but not in ${rel(main)}'s addons. ${SETUP}` }
  if (!mainText.includes('flowGlob')) return { ok: false, detail: `${rel(main)} has the add-on without a flowGlob: the default scans the parent tree of .storybook, which can crawl far. Give it one under the stories folder.` }
  const css = join(sbDir, 'story-flow.css')
  if (!(await exists(css))) return { ok: false, detail: `${rel(css)} isn't there: without it, titles float over the screens when the map is zoomed out. ${SETUP}` }
  const preview = (await tracked(repoPath, `${prefix}.storybook/preview.*`))[0]
  if (!preview || !(await text(join(repoPath, preview))).includes('story-flow.css')) return { ok: false, detail: `story-flow.css isn't imported in ${preview ?? `${prefix}.storybook/preview`}: import it after the app's global CSS.` }
  if (pkg['@storybook/addon-vitest'] && !(await flowsExcluded(repoPath, prefix))) return { ok: false, detail: `Flow files aren't excluded from the vitest project in ${where}: the story tests would import each *.flow.json as a test. Add test.exclude ['**/*.flow.json'] to the storybook project.` }
  const flows = await tracked(repoPath, '*.flow.json')
  if (!flows.length) return { ok: false, detail: `No map yet: no *.flow.json in ${where}'s stories. ${SETUP}` }
  let title: string | null = null
  try { title = (JSON.parse(await text(join(repoPath, flows[0]))) as { title?: string }).title ?? null } catch { /* a broken flow file is the add-on's to report */ }
  const up = url ? await (deps.answers ?? answers)(url) : false
  const have = `Storybook${version ? ` ${version.replace(/^[\^~]/, '')}` : ''} in ${where} with the screen map: ${flows.length} flow file${flows.length === 1 ? '' : 's'}`
  const detail = `${have}; ${!url ? 'no URL set yet.' : up ? `answering at ${url}.` : `not running at ${url}: Start it.`}`
  const links = url && title && up ? [{ label: 'Open the map', href: `${url.replace(/\/$/, '')}/?path=/docs/${mapDocsId(title)}` }] : []
  return { ok: true, detail, links }
}


/** The stylesheet the standard adds beside the add-on (served at GET /api/storybook/story-flow.css for step 4). */
export const STORY_FLOW_CSS = `/* The UX map (@zigbang/storybook-addon-story-flow). Our standard for every project's Storybook.
   1. Zoomed out past 70%, the add-on blows each screen's title bar up to twice its size and floats it over the top
      of the screen it names (fixed in the add-on: LEGIBLE_ZOOM 0.7, MAX_HEADER_SCALE 2; no setting). The bar keeps
      its own strip above the screen at every zoom instead.
   2. A clear line between the title and the screen: the node's own border, 2px in its coverage colour (blue for an
      existing screen), inherited from the node box the bar sits in. */
.storyflow-header-floats {
  transform: none !important;
  width: 100% !important;
  box-shadow: none !important;
}
.storyflow-node-drag {
  border-bottom-style: solid !important;
  border-bottom-width: 2px !important;
  border-bottom-color: inherit !important;
}
`

// Installing it (docs/integrations/storybook.md, "Installation"; Sandy, 2026-11-09: "Storybook is simple, every project
// uses it, it should not be hard to add to a repo"): Storybook's own installer, then the standard, each step skipped
// when already done, so pressing again is safe. What cannot be done from here is `left`, for the agent.

type Pm = 'pnpm' | 'npm' | 'yarn' | 'bun'
/** The repo's package manager, by its lockfile; npm when there is none. */
async function pmOf(repoPath: string): Promise<Pm> {
  return (await exists(join(repoPath, 'pnpm-lock.yaml'))) ? 'pnpm' : (await exists(join(repoPath, 'yarn.lock'))) ? 'yarn' : (await exists(join(repoPath, 'bun.lockb'))) || (await exists(join(repoPath, 'bun.lock'))) ? 'bun' : 'npm'
}
const UI_DEPS = ['vite', 'react', 'vue', 'svelte', 'next', 'nuxt', 'lit', 'preact', 'solid-js', '@angular/core', '@sveltejs/kit', 'webpack']
/** The package the UI lives in: the root when it has a framework or builder dependency, else the first workspace package that has one, else the root. */
async function uiPackage(repoPath: string): Promise<string> {
  const hasUi = (deps: Record<string, string>) => UI_DEPS.some((d) => d in deps)
  if (hasUi(depsOf(await text(join(repoPath, 'package.json'))))) return '.'
  for (const rel of (await tracked(repoPath, '*/package.json')).filter((p) => !p.includes('node_modules/') && p.split('/').length <= 3)) {
    if (hasUi(depsOf(await text(join(repoPath, rel))))) return dirname(rel)
  }
  return '.'
}
const dlx = (pm: Pm, yarn2: boolean, args: string[]): [string, string[]] => pm === 'pnpm' ? ['pnpm', ['dlx', ...args]] : pm === 'bun' ? ['bunx', args] : pm === 'yarn' && yarn2 ? ['yarn', ['dlx', ...args]] : ['npx', ['-y', ...args]]
const addDev = (pm: Pm, pkg: string): [string, string[]] => pm === 'pnpm' ? ['pnpm', ['add', '-D', pkg]] : pm === 'yarn' ? ['yarn', ['add', '-D', pkg]] : pm === 'bun' ? ['bun', ['add', '-d', pkg]] : ['npm', ['install', '-D', pkg]]
/** The install after Storybook's upgrade: its own runs frozen under CI, against a lockfile it has just outdated. */
const installAll = (pm: Pm, yarn2: boolean): [string, string[]] => pm === 'pnpm' ? ['pnpm', ['install', '--no-frozen-lockfile']] : pm === 'yarn' ? ['yarn', ['install', yarn2 ? '--no-immutable' : '--no-frozen-lockfile']] : pm === 'bun' ? ['bun', ['install']] : ['npm', ['install']]
const lastLine = (e: unknown) => { const x = e as { stdout?: string; stderr?: string; message?: string }; return `${x.stderr ?? ''}\n${x.stdout ?? ''}\n${x.message ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0] ?? 'no output' }
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** The stories folder's prefix from main's first `stories` glob (a glob under ../src gives "../src/"), for the flowGlob and the first map. */
export function storiesPrefix(mainText: string): string {
  const m = /["'`](\.\.?\/[^"'`*]*)\*/.exec(mainText)
  return m ? m[1].replace(/\/?$/, '/') : '../src/'
}
const execFileP = promisify(execFile)
const installRun: Run = (file, args, cwd) => execFileP(file, args, { cwd, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: '1', BROWSER: 'none' } })

export interface Install { did: string[]; left: string[] }
export async function installStorybook(ctx: StorybookContext, deps: StorybookDeps = {}): Promise<Install> {
  const repo = ctx.repoPath!
  const run = deps.run ?? installRun
  const did: string[] = []
  const left: string[] = []
  const status = async () => (await execFileP('git', ['status', '--porcelain'], { cwd: repo })).stdout.split('\n').filter(Boolean) // untrimmed: the first column can be a space
  const before = new Set(await status()) // the person's own changes, left alone
  const pm = await pmOf(repo)
  const yarn2 = await exists(join(repo, '.yarnrc.yml'))
  let mains = await tracked(repo, '*.storybook/main.*')
  const where = mains.length ? relative(repo, dirname(dirname(join(repo, mains[0])))) || '.' : await uiPackage(repo)
  const pkgDir = join(repo, where)
  const prefix = where === '.' ? '' : `${where}/`
  if (!mains.length) {
    const [file, args] = dlx(pm, yarn2, ['storybook@latest', 'init', '--yes', '--no-dev', '--features', 'docs', '--package-manager', pm === 'yarn' ? (yarn2 ? 'yarn2' : 'yarn1') : pm, '--no-agent', '--disable-telemetry'])
    try { await run(file, args, pkgDir); did.push(`Installed Storybook in ${where} with its own installer, docs only.`) } catch (e) { return { did, left: [`Storybook's installer failed in ${where}: ${lastLine(e)}. Run \`${file} ${args.join(' ')}\` there and see.`] } }
    mains = await tracked(repo, `${prefix}.storybook/main.*`)
    if (!mains.length) return { did, left: [`The installer ran in ${where}, but there is no .storybook/main.* there.`] }
  }
  const main = mains[0]
  const sbDir = dirname(join(repo, main))
  const readPkg = async () => ({ ...depsOf(await text(join(repo, 'package.json'))), ...depsOf(await text(join(pkgDir, 'package.json'))) })
  let pkg = await readPkg()
  if (pkg.storybook && major(pkg.storybook) < 10) { // an older Storybook: its own upgrade, then the install (Sandy, 2026-11-12, Merman on Storybook 8: the press went to an agent)
    const from = pkg.storybook
    const hadLog = await exists(join(pkgDir, 'debug-storybook.log'))
    const [file, args] = dlx(pm, yarn2, ['storybook@latest', 'upgrade', '--yes', '--disable-telemetry'])
    let failed: string | null = null
    try { await run(file, args, pkgDir) } catch (e) { failed = lastLine(e) }
    if (!hadLog) await rm(join(pkgDir, 'debug-storybook.log'), { force: true }) // the upgrade's own log, not the repo's
    pkg = await readPkg()
    if (!pkg.storybook || major(pkg.storybook) < 10) return { did, left: [`Storybook ${from} in ${where}: the screen map's add-on needs Storybook 10, and Storybook's upgrade didn't get there${failed ? ` (${failed})` : ''}. Run \`${file} ${args.join(' ')}\` there and see.`] }
    did.push(`Upgraded Storybook in ${where} from ${from} to ${pkg.storybook} with its own upgrade.`)
    const [ifile, iargs] = installAll(pm, yarn2)
    try { await run(ifile, iargs, pkgDir) } catch (e) { left.push(`Installing after the upgrade failed in ${where}: ${lastLine(e)}. Run \`${ifile} ${iargs.join(' ')}\` there.`) }
  }
  if (!pkg[ADDON]) {
    const [file, args] = addDev(pm, ADDON)
    try { await run(file, args, pkgDir); did.push(`Added ${ADDON} as a dev dependency in ${where}.`) } catch (e) { left.push(`Adding ${ADDON} in ${where} failed: ${lastLine(e)}.`) }
  }
  if (!(await exists(join(sbDir, 'story-flow.css')))) { await writeFile(join(sbDir, 'story-flow.css'), STORY_FLOW_CSS); did.push(`Wrote ${prefix}.storybook/story-flow.css.`) }
  let mainText = await text(join(repo, main))
  const stories = storiesPrefix(mainText)
  if (!mainText.includes('storybook-addon-story-flow')) {
    const m = /(["']?addons["']?\s*:\s*\[)/.exec(mainText)
    if (m) {
      mainText = mainText.replace(m[1], `${m[1]}\n    { name: "${ADDON}", options: { flowGlob: "${stories}**/*.flow.json" } },`)
      await writeFile(join(repo, main), mainText)
      did.push(`Wired the add-on into ${main}, flowGlob ${stories}**/*.flow.json.`)
    } else left.push(`${main} has no addons list: add { name: "${ADDON}", options: { flowGlob: "${stories}**/*.flow.json" } } to it.`)
  }
  const preview = (await tracked(repo, `${prefix}.storybook/preview.*`))[0]
  if (!preview) { await writeFile(join(sbDir, 'preview.ts'), "import './story-flow.css'\n\nexport default {}\n"); did.push(`Wrote ${prefix}.storybook/preview.ts with the stylesheet import.`) }
  else if (!(await text(join(repo, preview))).includes('story-flow.css')) {
    const lines = (await text(join(repo, preview))).split('\n')
    let last = -1
    lines.forEach((l, i) => { if (/^import\b/.test(l)) last = i })
    lines.splice(last + 1, 0, "import './story-flow.css'")
    await writeFile(join(repo, preview), lines.join('\n'))
    did.push(`Imported story-flow.css in ${preview}.`)
  }
  if (pkg['@storybook/addon-vitest'] && !(await flowsExcluded(repo, prefix))) left.push(`Exclude '**/*.flow.json' from the storybook vitest project in ${where} (test.exclude), or the story tests import each flow file as a test.`)
  let flows = await tracked(repo, '*.flow.json')
  if (!flows.length) {
    const base = resolve(sbDir, stories)
    const dir = (await exists(join(base, 'stories'))) ? join(base, 'stories', 'flows') : join(base, 'flows')
    const page = (await tracked(repo, '*Page.stories.*')).length > 0
    const flow = {
      $schema: 'https://zigbang.github.io/storybook-addon-story-flow/flow.schema.json',
      epic: ctx.app.name,
      title: `${ctx.app.name}/Map`,
      scenarios: [{ id: 'start', label: 'The first screen' }],
      nodes: page ? [{ id: 'page', data: { label: "Page (the installer's example)", coverage: 'existing', tags: ['/'], scenarios: ['start'], stories: [{ id: 'example-page--logged-out', label: 'Logged out' }, { id: 'example-page--logged-in', label: 'Logged in' }] } }] : [],
      edges: [],
    }
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${slug(ctx.app.name)}.flow.json`)
    await writeFile(file, `${JSON.stringify(flow, null, 2)}\n`)
    did.push(`Wrote a first map, ${relative(repo, file)}${page ? ", with the installer's example page as its first screen" : ', with no screens yet'}.`)
    flows = [relative(repo, file)]
  }
  const readme = (await tracked(repo, 'README.md'))[0] ?? (await tracked(repo, 'readme.md'))[0]
  if (readme && !/screen map/i.test(await text(join(repo, readme)))) {
    const start = pm === 'npm' ? 'npm run storybook' : `${pm} storybook`
    await appendFile(join(repo, readme), `\n## The screen map\n\nStorybook (\`${start}\`${where === '.' ? '' : `, in ${where}`}) draws a map of the screens from \`${dirname(flows[0])}/*.flow.json\`: open the Map page under Docs and zoom out. Add a screen by adding its page story to a node there, whole screens only.\n`)
    did.push(`Added "The screen map" to ${readme}.`)
  }
  if (did.length) { // one commit of what the install touched (new or changed since `before`), the person's own changes left as they were
    const paths = (await status()).filter((l) => !before.has(l)).map((l) => l.slice(3))
    const { remote, base } = await remoteAndBase(repo, ctx.app.defaultBranch, run)
    did.push(await commitOnBase(run, repo, { remote: remote?.name ?? 'origin', base, paths, subject: `Set up Storybook for ${ctx.app.name}`, body: 'Installed by Self Evident to the house standard: Storybook with the screen map add-on, its stylesheet and a first map. Set up Storybook under Integrations › Storybook does it again.' }))
  }
  return { did, left }
}

const installDoc = fileURLToPath(new URL('../../docs/integrations/storybook.md', import.meta.url))
/** The job for the agent when a step could not be done from here: the integration's own document, to finish without asking. */
export async function installAsk(): Promise<string> {
  return `Finish setting up Storybook in this repo to the house standard, without asking: these are the standard, not choices. The integration's document follows; its Installation section is the order of steps, and Self Evident has done the ones it said it did.\n\n${await readFile(installDoc, 'utf8')}`
}
