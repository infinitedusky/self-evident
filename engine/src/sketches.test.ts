/**
 * What shows beside a conversation comes from the conversation's own worktree: its sketches, and its Storybook when
 * the branch has one; the app's main checkout otherwise. And a sketch address never reads outside sketches/.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, session, workspace } from './db/schema.js'
import { git } from './git.js'
import { newId } from './ids.js'
import { listSketches, listSketchFiles, placeOf, readSketch } from './sketches.js'
import { portFor, storybookStatus } from './storybook.js'

async function folder(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'se-sk-'))
  await git(dir, ['init', '-q', '-b', 'main'])
  for (const [p, c] of Object.entries(files)) { await mkdir(dirname(join(dir, p)), { recursive: true }); await writeFile(join(dir, p), c) }
  return dir
}

describe('sketch files', () => {
  it('lists the HTML under sketches/, newest first, and nothing else', async () => {
    const dir = await folder({ 'sketches/home.html': '<h1>Home</h1>', 'sketches/flows/checkout.html': '<h1>Pay</h1>', 'sketches/style.css': 'h1{}', 'index.html': 'not a sketch' })
    expect((await listSketchFiles(dir)).map((s) => s.file).sort()).toEqual(['flows/checkout.html', 'home.html'])
    expect(await listSketchFiles(await folder({ 'index.html': 'x' }))).toEqual([])
  })
  it('gives a worktree a port of its own, the same every time', () => {
    expect(portFor('/a/b')).toBe(portFor('/a/b')); expect(portFor('/a/b')).not.toBe(portFor('/a/c'))
    expect(portFor('/a/b')).toBeGreaterThanOrEqual(6100); expect(portFor('/a/b')).toBeLessThan(6900)
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
describe.skipIf(!reachable)('a conversation\'s worktree', () => {
  const wsId = newId('workspace'), appId = newId('app'), withSb = newId('session'), without = newId('session'), gone = newId('session')
  let main = '', tree = '', bare = ''
  afterAll(async () => {
    await db.delete(session).where(eq(session.appId, appId)); await db.delete(repo).where(eq(repo.appId, appId))
    await db.delete(app).where(eq(app.id, appId)); await db.delete(workspace).where(eq(workspace.id, wsId)); await pool.end()
  })
  it('is where its sketches and its Storybook come from; the main checkout otherwise', async () => {
    const pkg = JSON.stringify({ scripts: { storybook: 'storybook dev -p 6006' } })
    main = await folder({ 'package.json': pkg, 'package-lock.json': '', '.storybook/main.js': 'export default {}', 'sketches/old.html': '<p>main</p>', 'secret.txt': 'no' })
    tree = await folder({ 'package.json': pkg, 'package-lock.json': '', '.storybook/main.js': 'export default {}', 'sketches/swing.html': '<h1>Swing lab</h1>', 'sketches/swing.css': 'h1{}', 'node_modules/.keep': '' })
    bare = await folder({ 'package.json': '{}' })
    await db.insert(workspace).values({ id: wsId, name: 'sketches' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Golf', key: appId.slice(-6).toUpperCase(), setup: { integrations: { storybook: { on: 'true' } } } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'x/golf', localPath: main })
    await db.insert(session).values([
      { id: withSb, appId, kind: 'talk', cwd: tree, branch: 'talk/swing', worktreePath: tree },
      { id: without, appId, kind: 'talk', cwd: bare, branch: 'talk/old', worktreePath: bare },
      { id: gone, appId, kind: 'talk', cwd: '/nowhere/at/all', branch: 'talk/gone', worktreePath: '/nowhere/at/all' },
    ])
    expect(await placeOf(withSb)).toEqual({ appId, root: tree, branch: 'talk/swing', main: false })
    expect(await placeOf(gone)).toMatchObject({ root: main, main: true }) // its worktree is gone: the app's checkout
    expect((await listSketches(withSb)).sketches.map((s) => s.file)).toEqual(['swing.html'])
    expect(await listSketches(appId)).toMatchObject({ branch: 'main', main: true, sketches: [{ file: 'old.html' }] })

    const mine = await storybookStatus(appId, withSb)
    expect(mine).toMatchObject({ url: `http://localhost:${portFor(tree)}`, branch: 'talk/swing', main: false, startable: true, up: false })
    expect(await storybookStatus(appId, without)).toMatchObject({ url: 'http://localhost:6006', branch: 'main', main: true }) // its branch has no Storybook
    expect(await storybookStatus(appId)).toMatchObject({ url: 'http://localhost:6006', main: true })
  })
  it('serves a sketch and what it links, sandboxed, and never a file outside sketches/', async () => {
    const page = await readSketch(withSb, 'swing.html')
    expect(page?.body.toString()).toBe('<h1>Swing lab</h1>')
    expect(page?.headers).toMatchObject({ 'content-type': 'text/html; charset=utf-8', 'content-security-policy': 'sandbox allow-scripts allow-forms', 'cache-control': 'no-store' })
    expect((await readSketch(withSb, 'swing.css'))?.headers['content-security-policy']).toBeUndefined()
    expect(await readSketch(appId, '../secret.txt')).toBeNull(); expect(await readSketch(appId, '../package.json')).toBeNull()
    expect(await readSketch(appId, '/etc/hosts')).toBeNull(); expect(await readSketch(withSb, 'nope.html')).toBeNull()
  })
})
