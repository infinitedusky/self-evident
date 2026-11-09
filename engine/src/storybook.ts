/**
 * An app's Storybook: the Mockups integration (SHAPE.md: Storybook is the home of the design system, stories and
 * mockups; Sandy, 2026-11-09: an integration, with the screen map checked). The engine starts it on request (the
 * integration's command, in the app's checkout) and keeps it running; it is told apart from a Storybook someone
 * else started by simply asking the URL. The check reads the repo for the standard: Storybook 10 with the screen
 * map (@zigbang/storybook-addon-story-flow) wired in, its stylesheet imported, the flow files kept out of the story
 * tests, and a map; then whether it answers. First thing wrong is the answer.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo } from './db/schema.js'
import { git } from './git.js'
import { PlanError } from './projects.js'

const running = new Map<string, { proc: ChildProcess; startedAt: Date; log: string[] }>()

export interface StorybookSetup { url: string | null; cmd: string | null }
/** The integration's values on an app; the keys they lived under before 2026-11-09 are still read until the start-up move. */
export function storybookSetup(setup: unknown): StorybookSetup {
  const s = (setup ?? {}) as { integrations?: { storybook?: { url?: string; cmd?: string } }; storybook_url?: string; storybook_cmd?: string }
  return { url: s.integrations?.storybook?.url?.trim() || s.storybook_url?.trim() || null, cmd: s.integrations?.storybook?.cmd?.trim() || s.storybook_cmd?.trim() || null }
}
export const hasStorybook = (setup: unknown) => { const s = storybookSetup(setup); return !!(s.url || s.cmd) }

/** The old keys moved under the integration, once, when the engine starts; values already under it win. Returns how many apps moved. */
export async function migrateStorybookSetup(): Promise<number> {
  const r = await db.execute(sql`update app set setup = (setup - 'storybook_url' - 'storybook_cmd')
    || jsonb_build_object('integrations', coalesce(setup->'integrations', '{}'::jsonb)
      || jsonb_build_object('storybook', jsonb_strip_nulls(jsonb_build_object('url', setup->>'storybook_url', 'cmd', setup->>'storybook_cmd')) || coalesce(setup->'integrations'->'storybook', '{}'::jsonb)))
    where setup ? 'storybook_url' or setup ? 'storybook_cmd'`)
  return r.rowCount ?? 0
}

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const [r] = await db.select().from(repo).where(eq(repo.appId, appId))
  const { url, cmd } = storybookSetup(a.setup)
  return { a, cwd: r?.localPath ?? null, url, cmd }
}

const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok || r.status < 500).catch(() => false)

export async function storybookStatus(appId: string) {
  const { url, cmd, cwd } = await setupOf(appId)
  const mine = running.get(appId)
  return { url, configured: !!url, startable: !!(cmd && cwd), up: url ? await answers(url) : false, startedHere: !!mine && mine.proc.exitCode === null, log: mine?.log.slice(-20) ?? [] }
}

export async function startStorybook(appId: string) {
  const { a, url, cmd, cwd } = await setupOf(appId)
  if (!url || !cmd || !cwd) throw new PlanError(`${a.name} has no Storybook command or URL; set them under Integrations › Storybook`)
  if (await answers(url)) return storybookStatus(appId)
  const mine = running.get(appId)
  if (mine && mine.proc.exitCode === null) return storybookStatus(appId)
  const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, BROWSER: 'none', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: false })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 200) log.splice(0, log.length - 200) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  running.set(appId, { proc, startedAt: new Date(), log })
  return storybookStatus(appId)
}

/**
 * The app's stories, from its running Storybook's own index: each one's id (what opens it), the component or page
 * it belongs to, and its name. `match` keeps those whose id, title or name contains it (any case).
 */
export async function listStories(appId: string, match?: string) {
  const { a, url } = await setupOf(appId)
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

export function stopStorybooks() { for (const [, m] of running) m.proc.kill('SIGTERM'); running.clear() }

// The check: the standard for every project's Storybook, read from the repo.

export const ADDON = '@zigbang/storybook-addon-story-flow'
export interface StorybookContext { app: { id: string; name: string }; repoPath: string | null; url: string | null; cmd: string | null }
export interface Check { ok: boolean; detail: string; links?: { label: string; href: string }[] }
const SETUP = 'Set up the screen map (the action below hands the agent the job).'

const exists = (p: string) => stat(p).then(() => true, () => false)
const text = (p: string) => readFile(p, 'utf8').catch(() => '')
/** Files git has or would add under the repo, so node_modules stays out of the search. */
async function tracked(repoPath: string, pattern: string): Promise<string[]> {
  const r = await git(repoPath, ['ls-files', '--cached', '--others', '--exclude-standard', '--', pattern], { allowFail: true })
  return r.code === 0 ? r.stdout.split('\n').filter(Boolean).sort() : []
}
const depsOf = (pkg: string): Record<string, string> => { try { const p = JSON.parse(pkg); return { ...p.dependencies, ...p.devDependencies } } catch { return {} } }
const major = (range: string) => Number((range.match(/\d+/) ?? [NaN])[0])
/** Storybook's id for a map's docs page, from the flow file's title: "Parent/Map" → parent-map--docs. */
export const mapDocsId = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}--docs`

export async function checkStorybook(ctx: StorybookContext, deps: { answers?: (url: string) => Promise<boolean> } = {}): Promise<Check> {
  const { repoPath, url } = ctx
  if (!repoPath) return { ok: false, detail: 'No local checkout under Repo: the check reads the Storybook config in the repo.' }
  const rel = (p: string) => relative(repoPath, p)
  const mains = await tracked(repoPath, '*.storybook/main.*')
  if (!mains.length) return { ok: false, detail: `No Storybook in ${repoPath}: no .storybook/main.* anywhere in the repo. Set up Storybook 10 first, then the screen map.` }
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
  if (pkg['@storybook/addon-vitest']) {
    const configs = [...(await tracked(repoPath, `${prefix}vite*.config.*`)), ...(await tracked(repoPath, `${prefix}vitest.workspace.*`))]
    let excluded = false
    for (const f of configs) if ((await text(join(repoPath, f))).includes('flow.json')) excluded = true
    if (!excluded) return { ok: false, detail: `Flow files aren't excluded from the vitest project in ${where}: the story tests would import each *.flow.json as a test. Add test.exclude ['**/*.flow.json'] to the storybook project.` }
  }
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

/** The job "Set up the screen map" hands the agent: the standard, step by step; it confirms each file before writing. */
export const setupMapAsk = (engineUrl: string) => `Set up the screen map in this repo's Storybook. Every project with Storybook gets a map of its screens, drawn by ${ADDON}; this is the standard, step by step. Confirm each file change with me before writing it.
1. Storybook 10 with a Vite or webpack5 framework (the add-on's peer range is storybook ^10). On an older Storybook, stop and say so.
2. Add ${ADDON} as a dev dependency, with the project's own package manager.
3. In .storybook/main.ts, in addons: { name: "${ADDON}", options: { flowGlob: "../stories/**/*.flow.json" } }, the glob relative to .storybook/ and pointing at the stories folder (never the default, which scans the parent tree).
4. Save ${engineUrl}/storybook/story-flow.css as .storybook/story-flow.css and import it in .storybook/preview after the app's global CSS: it keeps each title in its own strip when zoomed out and draws the outline-coloured line under it.
5. If stories run with @storybook/addon-vitest, exclude '**/*.flow.json' from that vitest project, or the run imports each JSON as a test.
6. A first map: stories/flows/<area>.flow.json with "title": "<Area>/Map". Whole screens only: each node's stories draw a page as the user sees it, frame and all, never a card or a form on its own; a screen that isn't ours (a third-party sign-in) is a node with no story, coverage "external" and a noStoryReason. Edge labels say what you tap; tag each node with its address; mark what is already built existing; add scenarios for the main journeys. The contract is in node_modules/${ADDON}/skills/story-flow-author/SKILL.md.
7. One paragraph in the dev docs: where the map is and how to add a screen.
Then open ?path=/docs/<area>-map--docs, zoom in and out, and check every node renders its real screen with no title covering it; run the story tests.`

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
