/** The Storybook integration's check, against throwaway repos, and the move of the old setup keys under it. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { git } from './git.js'
import { newId } from './ids.js'
import { ADDON, checkStorybook, hasStorybook, mapDocsId, migrateStorybookSetup, storybookSetup } from './storybook.js'

async function repoWith(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'se-sb-'))
  await git(dir, ['init', '-q', '-b', 'main'])
  for (const [p, c] of Object.entries(files)) { await mkdir(dirname(join(dir, p)), { recursive: true }); await writeFile(join(dir, p), c) }
  return dir
}
const ctx = (repoPath: string | null, url: string | null = 'http://localhost:6006') => ({ app: { id: 'app_x', name: 'Shop' }, repoPath, url, cmd: 'pnpm storybook' })
const down = { answers: async () => false }
const up = { answers: async () => true }
const pkg = (deps: Record<string, string>) => JSON.stringify({ name: 'web', devDependencies: deps })
const good = {
  'package.json': JSON.stringify({ name: 'root', private: true }),
  'app/package.json': pkg({ storybook: '^10.6.3', [ADDON]: '^0.4.0', '@storybook/addon-vitest': '^10.6.3' }),
  'app/.storybook/main.ts': `export default { addons: [{ name: "${ADDON}", options: { flowGlob: "../src/stories/**/*.flow.json" } }] }`,
  'app/.storybook/story-flow.css': '.storyflow-header-floats { transform: none !important }',
  'app/.storybook/preview.tsx': "import '../src/app.css'\nimport './story-flow.css'\n",
  'app/vite.config.ts': "export default { test: { projects: [{ test: { name: 'storybook', exclude: ['**/*.flow.json'] } }] } }",
  'app/src/stories/flows/pages.flow.json': JSON.stringify({ title: 'Pages/Map', nodes: [] }),
}
const without = (...keys: string[]) => Object.fromEntries(Object.entries(good).filter(([k]) => !keys.includes(k)))

describe('checkStorybook', () => {
  it('passes the standard: Storybook 10, the add-on wired with a glob, the stylesheet imported, flow files out of the tests, a map', async () => {
    const r = await checkStorybook(ctx(await repoWith(good)), up)
    expect(r).toEqual({ ok: true, detail: 'Storybook 10.6.3 in app with the screen map: 1 flow file; answering at http://localhost:6006.', links: [{ label: 'Open the map', href: 'http://localhost:6006/?path=/docs/pages-map--docs' }] })
  })

  it('says when it is not running, and offers no link to a map nobody can open', async () => {
    const r = await checkStorybook(ctx(await repoWith(good)), down)
    expect(r.ok).toBe(true); expect(r.detail).toMatch(/not running at http:\/\/localhost:6006: Start it\.$/); expect(r.links).toEqual([])
    expect((await checkStorybook(ctx(await repoWith(good), null), down)).detail).toMatch(/no URL set yet\.$/)
  })

  it('finds a Storybook at the repo root too', async () => {
    const files = Object.fromEntries(Object.entries(good).filter(([k]) => k !== 'package.json').map(([k, v]) => [k.replace(/^app\//, ''), v]))
    expect((await checkStorybook(ctx(await repoWith(files)), up)).detail).toMatch(/^Storybook 10.6.3 in \. with the screen map/)
  })

  it('names the first thing wrong, in order', async () => {
    const say = async (files: Record<string, string>) => (await checkStorybook(ctx(await repoWith(files)), down)).detail
    expect((await checkStorybook(ctx(null))).detail).toMatch(/^No local checkout under Repo/)
    expect(await say({ 'package.json': '{}' })).toMatch(/^No Storybook in .*: no \.storybook\/main\.\* anywhere in the repo\./)
    expect(await say({ ...good, 'app/package.json': pkg({ storybook: '^9.1.0' }) })).toBe("Storybook ^9.1.0 in app: the screen map's add-on needs Storybook 10.")
    expect(await say({ ...good, 'app/package.json': pkg({ storybook: '^10.6.3' }) })).toMatch(/^Storybook is there \(app\), the screen map isn't: @zigbang\/storybook-addon-story-flow isn't installed\. Set up the screen map/)
    expect(await say({ ...good, 'app/.storybook/main.ts': 'export default { addons: [] }' })).toMatch(/installed but not in app\/\.storybook\/main\.ts's addons\./)
    expect(await say({ ...good, 'app/.storybook/main.ts': `export default { addons: ["${ADDON}"] }` })).toMatch(/^app\/\.storybook\/main\.ts has the add-on without a flowGlob/)
    expect(await say(without('app/.storybook/story-flow.css'))).toMatch(/^app\/\.storybook\/story-flow\.css isn't there/)
    expect(await say({ ...good, 'app/.storybook/preview.tsx': "import '../src/app.css'\n" })).toBe("story-flow.css isn't imported in app/.storybook/preview.tsx: import it after the app's global CSS.")
    expect(await say({ ...good, 'app/vite.config.ts': 'export default {}' })).toMatch(/^Flow files aren't excluded from the vitest project in app/)
    expect(await say(without('app/src/stories/flows/pages.flow.json'))).toMatch(/^No map yet: no \*\.flow\.json in app's stories\./)
  })

  it('skips the vitest step when the stories do not run as tests', async () => {
    const files = { ...without('app/vite.config.ts'), 'app/package.json': pkg({ storybook: '^10.6.3', [ADDON]: '^0.4.0' }) }
    expect((await checkStorybook(ctx(await repoWith(files)), down)).ok).toBe(true)
  })

  it('keeps node_modules out of the search', async () => {
    const files = { 'package.json': '{}', 'node_modules/x/.storybook/main.ts': 'export default {}', '.gitignore': 'node_modules\n' }
    expect((await checkStorybook(ctx(await repoWith(files)))).detail).toMatch(/^No Storybook in/)
  })
})

describe('storybookSetup', () => {
  it('reads the integration, and the keys the values lived under before', () => {
    expect(storybookSetup({ integrations: { storybook: { url: 'http://localhost:6007', cmd: 'pnpm storybook' } } })).toEqual({ url: 'http://localhost:6007', cmd: 'pnpm storybook' })
    expect(storybookSetup({ storybook_url: 'http://localhost:6006', storybook_cmd: 'cd web && pnpm storybook' })).toEqual({ url: 'http://localhost:6006', cmd: 'cd web && pnpm storybook' })
    expect(storybookSetup({})).toEqual({ url: null, cmd: null }); expect(hasStorybook({})).toBe(false); expect(hasStorybook({ storybook_cmd: 'x' })).toBe(true)
  })
  it('turns a map title into its docs id', () => { expect(mapDocsId('Pages/Map')).toBe('pages-map--docs'); expect(mapDocsId('Parent App/Map')).toBe('parent-app-map--docs') })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
describe.skipIf(!reachable)('migrateStorybookSetup', () => {
  const wsId = newId('workspace'), appId = newId('app')
  afterAll(async () => { await db.delete(app).where(eq(app.id, appId)); await db.delete(workspace).where(eq(workspace.id, wsId)); await pool.end() })
  it('moves the old keys under the integration and leaves the rest of the setup alone', async () => {
    await db.insert(workspace).values({ id: wsId, name: 'sb move' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Old', key: appId.slice(-6).toUpperCase(), setup: { storybook_url: 'http://localhost:6006', storybook_cmd: 'cd web && pnpm storybook --no-open', test_cmd: 'pnpm test', integrations: { linear: { team: 'OLD' } } } })
    expect(await migrateStorybookSetup()).toBeGreaterThanOrEqual(1)
    const [a] = await db.select().from(app).where(eq(app.id, appId))
    expect(a.setup).toEqual({ test_cmd: 'pnpm test', integrations: { linear: { team: 'OLD' }, storybook: { url: 'http://localhost:6006', cmd: 'cd web && pnpm storybook --no-open' } } })
    expect(await migrateStorybookSetup()).toBe(0) // nothing left to move
  })
})
