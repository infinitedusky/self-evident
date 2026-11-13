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
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { setupIntegration } from './integrations.js'
import { ADDON, checkStorybook, hasStorybook, installStorybook, mapDocsId, migrateStorybookSetup, storiesPrefix, storybookDefaults, storybookSetup, storybookValues, resolveStory } from './storybook.js'
import type { Run } from './tkt.js'

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
    expect(await say({ ...good, 'app/package.json': pkg({ storybook: '^10.6.3' }) })).toMatch(/^Storybook is there \(app\), the screen map isn't: @zigbang\/storybook-addon-story-flow isn't installed\. Set up Storybook/)
    expect(await say({ ...good, 'app/.storybook/main.ts': 'export default { addons: [] }' })).toMatch(/installed but not in app\/\.storybook\/main\.ts's addons\./)
    expect(await say({ ...good, 'app/.storybook/main.ts': `export default { addons: ["${ADDON}"] }` })).toMatch(/^app\/\.storybook\/main\.ts has the add-on without a flowGlob/)
    expect(await say(without('app/.storybook/story-flow.css'))).toMatch(/^app\/\.storybook\/story-flow\.css isn't there/)
    expect(await say({ ...good, 'app/.storybook/preview.tsx': "import '../src/app.css'\n" })).toBe("story-flow.css isn't imported in app/.storybook/preview.tsx: import it after the app's global CSS.")
    expect(await say({ ...good, 'app/vite.config.ts': "import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'\nexport default { test: { projects: [{ plugins: [storybookTest()] }] } }" })).toMatch(/^Flow files aren't excluded from the vitest project in app/)
    expect(await say({ ...good, 'app/vite.config.ts': 'export default {}' })).not.toMatch(/^Flow files/) // the add-on is there but no config runs the stories as tests: nothing would import the flow files
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
  it('reads the switch, the integration, and the keys the values lived under before', () => {
    expect(storybookSetup({ integrations: { storybook: { on: 'true', url: 'http://localhost:6007', cmd: 'pnpm storybook' } } })).toEqual({ on: true, url: 'http://localhost:6007', cmd: 'pnpm storybook' })
    expect(storybookSetup({ integrations: { storybook: { url: 'http://localhost:6007' } } })).toEqual({ on: true, url: 'http://localhost:6007', cmd: null }) // before the switch, a value meant on
    expect(storybookSetup({ integrations: { storybook: { on: 'false', url: 'http://localhost:6007' } } }).on).toBe(false)
    expect(storybookSetup({ storybook_url: 'http://localhost:6006', storybook_cmd: 'cd web && pnpm storybook' })).toEqual({ on: true, url: 'http://localhost:6006', cmd: 'cd web && pnpm storybook' })
    expect(storybookSetup({})).toEqual({ on: false, url: null, cmd: null }); expect(hasStorybook({})).toBe(false); expect(hasStorybook({ storybook_cmd: 'x' })).toBe(true); expect(hasStorybook({ integrations: { storybook: { on: 'true' } } })).toBe(true)
  })
  it('defaults the command and URL from the repo: the storybook script, the package manager, the port', async () => {
    const root = await repoWith({ 'package.json': JSON.stringify({ scripts: { storybook: 'storybook dev -p 6007' } }), 'pnpm-lock.yaml': '' })
    expect(await storybookDefaults(root)).toEqual({ cmd: 'pnpm storybook --no-open', url: 'http://localhost:6007' })
    const sub = await repoWith({ 'package.json': JSON.stringify({ name: 'root' }), 'web/package.json': JSON.stringify({ scripts: { storybook: 'storybook dev' } }), 'package-lock.json': '' })
    expect(await storybookDefaults(sub)).toEqual({ cmd: 'cd web && npm run storybook -- --no-open', url: 'http://localhost:6006' })
    expect(await storybookDefaults(await repoWith({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }) }))).toBeNull()
    expect(await storybookValues({ integrations: { storybook: { on: 'true', url: 'http://localhost:9000' } } }, root)).toEqual({ on: true, url: 'http://localhost:9000', cmd: 'pnpm storybook --no-open' }) // the app's own value wins
    expect(await storybookValues({ integrations: { storybook: { on: 'false' } } }, root)).toEqual({ on: false, url: null, cmd: null }) // off: nothing read
  })
  it('turns a map title into its docs id', () => { expect(mapDocsId('Pages/Map')).toBe('pages-map--docs'); expect(mapDocsId('Parent App/Map')).toBe('parent-app-map--docs') })
})

describe('installing it', () => {
  const identity = { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@x' }
  const execFileP = promisify(execFile)
  /** A committed checkout with a bare origin, so a push has somewhere to go. */
  async function committed(files: Record<string, string>) {
    const dir = await repoWith(files)
    const bare = await mkdtemp(join(tmpdir(), 'se-sb-origin-'))
    await git(bare, ['init', '-q', '--bare', '-b', 'main'])
    await git(dir, ['remote', 'add', 'origin', bare])
    await git(dir, ['add', '-A'])
    await execFileP('git', ['commit', '-q', '-m', 'start'], { cwd: dir, env: { ...process.env, ...identity } })
    await git(dir, ['push', '-q', '-u', 'origin', 'main'])
    return dir
  }
  /** Package-manager commands faked (the installer leaves behind what Storybook's did on 2026-11-09); git is real. */
  const fakeRun = (log: string[]): Run => async (file, args, cwd) => {
    log.push(`${file} ${args.join(' ')} @ ${cwd}`)
    if (file === 'git') return execFileP('git', args, { cwd, env: { ...process.env, ...identity } })
    const pkgPath = join(cwd!, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8').catch(() => '{}')) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> }
    if (args.includes('init')) {
      await mkdir(join(cwd!, '.storybook'), { recursive: true })
      await mkdir(join(cwd!, 'src/stories'), { recursive: true })
      await writeFile(join(cwd!, '.storybook/main.js'), '/** @type { import(\'@storybook/react-vite\').StorybookConfig } */\nconst config = {\n  "stories": [\n    "../src/**/*.mdx",\n    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"\n  ],\n  "addons": [\n    "@storybook/addon-docs"\n  ],\n  "framework": "@storybook/react-vite"\n};\nexport default config;')
      await writeFile(join(cwd!, '.storybook/preview.jsx'), '/** @type { import(\'@storybook/react-vite\').Preview } */\nconst preview = {\n  parameters: {},\n};\n\nexport default preview;')
      await writeFile(join(cwd!, 'src/stories/Page.stories.js'), "export default { title: 'Example/Page' }\nexport const LoggedOut = {}\n")
      pkg.devDependencies = { ...pkg.devDependencies, storybook: '^10.6.6', '@storybook/react-vite': '^10.6.6', '@storybook/addon-docs': '^10.6.6' }
      pkg.scripts = { ...pkg.scripts, storybook: 'storybook dev -p 6006' }
    } else if (args.includes('upgrade')) { // what Storybook's upgrade left on Merman, 2026-11-12: the packages moved to 10, its log beside them
      pkg.devDependencies = { ...pkg.devDependencies, storybook: '^10.6.7', '@storybook/react-vite': '^10.6.7' }
      await writeFile(join(cwd!, 'debug-storybook.log'), 'log')
      await writeFile(join(cwd!, '.storybook/main.ts'), "export default { stories: ['../src/**/*.stories.tsx'], framework: '@storybook/react-vite', addons: ['@storybook/addon-mcp'] }\n")
    } else if (args[0] === 'install' && args.length <= 2 && !args.includes('-D')) { /* the install after an upgrade: nothing to fake */
    } else if (args[0] === 'add' || args[0] === 'install') pkg.devDependencies = { ...pkg.devDependencies, [args[args.length - 1]]: '^0.10.0' }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
    return { stdout: '', stderr: '' }
  }
  const sb = (repoPath: string | null) => ({ app: { id: 'app_x', name: 'Ragdoll Golf', defaultBranch: 'main' }, repoPath, url: null, cmd: null })
  const read = (dir: string, p: string) => readFile(join(dir, p), 'utf8')

  it('installs from nothing: the installer in the UI package, then the standard, then one commit on main, pushed', async () => {
    const dir = await committed({ 'package.json': JSON.stringify({ name: 'golf', scripts: { dev: 'vite' }, devDependencies: { vite: '^8' } }), 'package-lock.json': '', 'README.md': '# Golf\n' })
    const log: string[] = []
    const r = await installStorybook(sb(dir), { run: fakeRun(log) })
    expect(r.left).toEqual([])
    expect(log[0]).toBe(`npx -y storybook@latest init --yes --no-dev --features docs --package-manager npm --no-agent --disable-telemetry @ ${dir}`)
    expect(log).toContain(`npm install -D ${ADDON} @ ${dir}`)
    expect(r.did).toEqual([
      'Installed Storybook in . with its own installer, docs only.',
      `Added ${ADDON} as a dev dependency in ..`,
      'Wrote .storybook/story-flow.css.',
      `Wired the add-on into .storybook/main.js, flowGlob ../src/**/*.flow.json.`,
      'Imported story-flow.css in .storybook/preview.jsx.',
      "Wrote a first map, src/stories/flows/ragdoll-golf.flow.json, with the installer's example page as its first screen.",
      'Added "The screen map" to README.md.',
      expect.stringMatching(/^Committed to main and pushed \([0-9a-f]{7}\)\.$/),
    ])
    expect(await read(dir, '.storybook/main.js')).toContain(`"addons": [\n    { name: "${ADDON}", options: { flowGlob: "../src/**/*.flow.json" } },\n    "@storybook/addon-docs"`)
    expect((await read(dir, '.storybook/preview.jsx')).split('\n')[0]).toBe("import './story-flow.css'") // no imports to go after: first line
    const flow = JSON.parse(await read(dir, 'src/stories/flows/ragdoll-golf.flow.json')) as { title: string; nodes: { data: { stories: { id: string }[] } }[] }
    expect(flow.title).toBe('Ragdoll Golf/Map'); expect(flow.nodes[0].data.stories[0].id).toBe('example-page--logged-out')
    expect(await read(dir, 'README.md')).toContain('## The screen map\n\nStorybook (`npm run storybook`) draws a map of the screens from `src/stories/flows/*.flow.json`')
    expect((await git(dir, ['status', '--porcelain'])).stdout).toBe('')
    expect((await git(dir, ['log', '--oneline', 'origin/main', '-1'])).stdout).toMatch(/Set up Storybook for Ragdoll Golf$/)
    const again = await installStorybook(sb(dir), { run: fakeRun([]) })
    expect(again).toEqual({ did: [], left: [] }) // every step already done
    expect((await checkStorybook({ ...sb(dir), url: 'http://localhost:6006' }, { answers: async () => false })).ok).toBe(true)
  })

  it('upgrades an older Storybook with its own upgrade, installs, then goes on to the standard', async () => {
    const dir = await committed({
      'package.json': JSON.stringify({ name: 'merman', devDependencies: { storybook: '^8.4.7', '@storybook/react-vite': '^8.4.7', vite: '^5' } }), 'pnpm-lock.yaml': '', 'README.md': '# Merman\n',
      '.storybook/main.ts': "export default { stories: ['../src/**/*.stories.tsx'], framework: '@storybook/react-vite' }\n",
      '.storybook/preview.ts': 'export default {}\n',
    })
    const log: string[] = []
    const r = await installStorybook(sb(dir), { run: fakeRun(log) })
    expect(log.slice(0, 2)).toEqual([`pnpm dlx storybook@latest upgrade --yes --disable-telemetry @ ${dir}`, `pnpm install --no-frozen-lockfile @ ${dir}`])
    expect(r.left).toEqual([])
    expect(r.did[0]).toBe('Upgraded Storybook in . from ^8.4.7 to ^10.6.7 with its own upgrade.')
    expect(r.did).toContain('Wired the add-on into .storybook/main.ts, flowGlob ../src/**/*.flow.json.')
    expect((await git(dir, ['status', '--porcelain'])).stdout).toBe('') // committed, and the upgrade's log is gone
    expect((await git(dir, ['ls-files', 'debug-storybook.log'])).stdout).toBe('')
    expect((await checkStorybook({ ...sb(dir), url: null }, {})).ok).toBe(true)
  })
  it('says so when the upgrade does not reach Storybook 10', async () => {
    const dir = await committed({ 'package.json': JSON.stringify({ name: 'old', devDependencies: { storybook: '^8.4.7' } }), 'pnpm-lock.yaml': '', '.storybook/main.ts': 'export default { addons: [] }\n' })
    const r = await installStorybook(sb(dir), { run: async (file, args, cwd) => { if (file === 'git') return execFileP('git', args, { cwd }); throw Object.assign(new Error('x'), { stderr: 'no network' }) } })
    expect(r).toEqual({ did: [], left: ["Storybook ^8.4.7 in .: the screen map's add-on needs Storybook 10, and Storybook's upgrade didn't get there (x). Run `pnpm dlx storybook@latest upgrade --yes --disable-telemetry` there and see."] })
  })

  it('finishes a Storybook that is already there (in a workspace package, with pnpm) and leaves the vitest exclude to the agent', async () => {
    const dir = await committed({
      'package.json': JSON.stringify({ name: 'root', private: true }), 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages:\n  - app\n',
      'app/package.json': JSON.stringify({ name: 'app', devDependencies: { storybook: '^10.6.3', '@storybook/addon-vitest': '^10.6.3', react: '^19' } }),
      'app/.storybook/main.ts': "export default { stories: ['../src/**/*.stories.tsx'], addons: ['@storybook/addon-docs'] }\n",
      'app/.storybook/preview.tsx': "import '../src/app.css'\n\nexport default {}\n",
      'app/vite.config.ts': "import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'\nexport default { test: { projects: [{ plugins: [storybookTest()] }] } }\n",
    })
    const log: string[] = []
    const r = await installStorybook(sb(dir), { run: fakeRun(log) })
    expect(log.filter((l) => !l.startsWith('git'))).toEqual([`pnpm add -D ${ADDON} @ ${join(dir, 'app')}`])
    expect(r.did.slice(0, 4)).toEqual([`Added ${ADDON} as a dev dependency in app.`, 'Wrote app/.storybook/story-flow.css.', `Wired the add-on into app/.storybook/main.ts, flowGlob ../src/**/*.flow.json.`, 'Imported story-flow.css in app/.storybook/preview.tsx.'])
    expect(r.did[4]).toBe('Wrote a first map, app/src/flows/ragdoll-golf.flow.json, with no screens yet.')
    expect(r.left).toEqual(["Exclude '**/*.flow.json' from the storybook vitest project in app (test.exclude), or the story tests import each flow file as a test."])
    expect(await read(dir, 'app/.storybook/preview.tsx')).toBe("import '../src/app.css'\nimport './story-flow.css'\n\nexport default {}\n")
    expect(await read(dir, 'app/.storybook/main.ts')).toContain(`addons: [\n    { name: "${ADDON}", options: { flowGlob: "../src/**/*.flow.json" } },'@storybook/addon-docs']`)
  })

  it('commits only what it touched, leaving the person\'s own changes as they were', async () => {
    const dir = await committed({ 'package.json': JSON.stringify({ devDependencies: { vite: '^8' } }), 'index.html': '<p>old</p>' })
    await writeFile(join(dir, 'notes.txt'), 'in progress')
    await writeFile(join(dir, 'index.html'), '<p>new</p>')
    const r = await installStorybook(sb(dir), { run: fakeRun([]) })
    expect(r.did.at(-1)).toMatch(/^Committed to main and pushed/)
    expect((await git(dir, ['status', '--porcelain'])).stdout.split('\n').map((l) => l.trim()).sort()).toEqual(['?? notes.txt', 'M index.html']) // theirs, untouched
    expect((await git(dir, ['show', '--stat', '--format=', 'HEAD'])).stdout).toMatch(/\.storybook\/main\.js/)
  })

  it('reads the stories folder from main', () => {
    expect(storiesPrefix('stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|ts)"]')).toBe('../src/')
    expect(storiesPrefix("stories: ['../stories/*.stories.tsx']")).toBe('../stories/')
    expect(storiesPrefix('export default {}')).toBe('../src/')
  })

  it('is reached through the integration: off waits, no checkout waits, otherwise it installs and checks', async () => {
    const dir = await committed({ 'package.json': JSON.stringify({ devDependencies: { vite: '^8' } }), 'package-lock.json': '' })
    const local = (repoPath: string | null) => ({ storybook: { ctx: sb(repoPath), deps: { run: fakeRun([]), answers: async () => false } } })
    expect((await setupIntegration('storybook', { on: 'false' }, {}, local(dir))).detail).toMatch(/off for this app/)
    expect((await setupIntegration('storybook', { on: 'true' }, {}, local(null))).detail).toMatch(/No local checkout under Repo/)
    const r = await setupIntegration('storybook', { on: 'true' }, {}, local(dir))
    expect(r.done).toBe(true); expect(r.did[0]).toBe('Installed Storybook in . with its own installer, docs only.')
    expect(r.detail).toMatch(/^Storybook 10\.6\.6 in \. with the screen map: 1 flow file; not running at http:\/\/localhost:6006: Start it\.$/) // the URL from the script the installer made
  })
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
    expect(a.setup).toEqual({ test_cmd: 'pnpm test', integrations: { linear: { team: 'OLD' }, storybook: { on: 'true', url: 'http://localhost:6006', cmd: 'cd web && pnpm storybook --no-open' } } }) // on, since having values meant on
    expect(await migrateStorybookSetup()).toBe(0) // nothing left to move
  })
})

describe('which story to show', () => {
  const ids = ['screens-home--default', 'mockups-swinglab--face-on', 'mockups-swinglab--top']
  it('shows the story asked for when this Storybook has it', () => {
    expect(resolveStory('mockups-swinglab--top', ids)).toEqual({ asked: 'mockups-swinglab--top', show: 'mockups-swinglab--top', missing: false })
  })
  it('shows the first story of the same component when the one asked for is gone, and says it is missing', () => {
    expect(resolveStory('mockups-swinglab--at-address', ids)).toEqual({ asked: 'mockups-swinglab--at-address', show: 'mockups-swinglab--face-on', missing: true })
  })
  it('shows none, so Storybook opens at its front, when the component is gone too', () => {
    expect(resolveStory('mockups-cart--empty', ids)).toEqual({ asked: 'mockups-cart--empty', show: null, missing: true })
  })
})
