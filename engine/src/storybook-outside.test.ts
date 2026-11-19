/**
 * A Storybook kept outside the repo: run by the integration's command for each checkout, given the checkout and its
 * port, with nothing read from, installed into or committed to the repo. Made-up apps and throwaway folders.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, session, workspace } from './db/schema.js'
import { git } from './git.js'
import { newId } from './ids.js'
import { setupIntegration } from './integrations.js'
import { checkStorybook, listStories, OUTSIDE, portFor, startStorybook, stopStorybookAt, storiesLead, storiesNote, storybookSetup, storybookStatus, storybookValues } from './storybook.js'

const outside = (more: Record<string, string> = {}) => ({ integrations: { storybook: { on: 'true', outside: 'true', cmd: 'run.sh "$WORKTREE" "$PORT"', ...more } } })
const ctx = (over: Record<string, unknown> = {}) => ({ app: { id: 'app_x', name: 'Shop' }, repoPath: '/tmp/none', url: 'http://localhost:6123', cmd: 'run.sh', outside: true, ...over })

describe('a Storybook kept outside the repo', () => {
  it('is a switch on the integration, with where stories go in words', () => {
    expect(storybookSetup(outside({ stories: 'Next to the component.' }))).toMatchObject({ on: true, outside: true, stories: 'Next to the component.' })
    expect(storybookSetup({ integrations: { storybook: { on: 'true' } } })).toMatchObject({ outside: false, stories: null })
  })

  it('takes nothing from the repo: the command is the one set, the address the checkout\'s own port', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'se-sbo-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { storybook: 'storybook dev -p 6006' } })) // a script in the repo is not the answer
    expect(await storybookValues(outside(), dir)).toMatchObject({ cmd: 'run.sh "$WORKTREE" "$PORT"', url: `http://localhost:${portFor(dir)}` })
    expect((await storybookValues(outside({ url: 'http://localhost:7001' }), dir)).url).toBe('http://localhost:7001')
  })

  it('does not hold builders to stories in the repo, and tells a conversation where stories go', () => {
    expect(storiesLead(outside())).toBe(false)
    expect(storiesLead({ integrations: { storybook: { on: 'true' } } })).toBe(true)
    expect(storiesNote(outside({ stories: 'Next to the component.' }))).toMatch(/kept outside the repository.*Never install Storybook into the repository.*Where stories go: Next to the component\./s)
    expect(storiesNote({ integrations: { storybook: { on: 'true' } } })).toBe('')
  })

  it('is checked by asking it: a command, an answer, its stories; nothing in the repo is read', async () => {
    expect((await checkStorybook(ctx({ cmd: null }))).detail).toMatch(/no command/)
    expect(await checkStorybook(ctx(), { answers: async () => false })).toEqual({ ok: true, detail: 'Storybook outside the repo; not running at http://localhost:6123: Start it.' })
    expect(await checkStorybook(ctx(), { answers: async () => true, stories: async () => 12 })).toEqual({ ok: true, detail: 'Storybook outside the repo: 12 stories, answering at http://localhost:6123.' })
    expect((await checkStorybook(ctx(), { answers: async () => true, stories: async () => null })).ok).toBe(false)
  })

  it('is never set up: nothing is installed or committed', async () => {
    let ran = 0
    const r = await setupIntegration('storybook', { on: 'true', outside: 'true' }, {}, { storybook: { ctx: ctx(), deps: { run: async () => { ran++; return { stdout: '', stderr: '' } } } } })
    expect(r).toEqual({ done: false, did: [], ask: null, detail: OUTSIDE })
    expect(ran).toBe(0)
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
describe.skipIf(!reachable)('started for a worktree', () => {
  const wsId = newId('workspace'), appId = newId('app'), talkId = newId('session')
  let wt = ''
  afterAll(async () => {
    if (wt) await stopStorybookAt(wt)
    await db.delete(session).where(eq(session.id, talkId)); await db.delete(repo).where(eq(repo.appId, appId)); await db.delete(app).where(eq(app.id, appId)); await db.delete(workspace).where(eq(workspace.id, wsId)); await pool.end()
  })

  it('runs the command as written, with the worktree and its port, though the worktree has no .storybook in git', async () => {
    const main = await mkdtemp(join(tmpdir(), 'se-sbo-main-'))
    await git(main, ['init', '-q', '-b', 'main'])
    wt = await mkdtemp(join(tmpdir(), 'se-sbo-wt-'))
    await git(wt, ['init', '-q', '-b', 'task'])
    const tools = await mkdtemp(join(tmpdir(), 'se-sbo-tools-')) // the set-up lives outside both
    // A stand-in for Storybook: says what it was given, and serves an index with one story on the port it was given.
    await writeFile(join(tools, 'run.mjs'), `import { createServer } from 'node:http'; import { writeFileSync } from 'node:fs'
const [worktree, port] = process.argv.slice(2)
writeFileSync(${JSON.stringify(join(tools, 'given.json'))}, JSON.stringify({ worktree, port, cwd: process.cwd(), env: [process.env.WORKTREE, process.env.PORT] }))
createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ entries: { 'made-up--one': { id: 'made-up--one', type: 'story', title: 'Made up', name: 'One' } } })) }).listen(Number(port))`)
    const cmd = `node ${join(tools, 'run.mjs')} "$WORKTREE" "$PORT"`
    await db.insert(workspace).values({ id: wsId, name: 'Sample' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Made-up shop', key: `S${Date.now() % 100000}`, setup: outside({ cmd }) } as typeof app.$inferInsert)
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: main })
    await db.insert(session).values({ id: talkId, appId, kind: 'talk', status: 'open', cwd: wt, worktreePath: wt, branch: 'task', subjectRef: {} } as typeof session.$inferInsert)

    const before = await storybookStatus(appId, talkId)
    expect(before).toMatchObject({ url: `http://localhost:${portFor(wt)}`, main: false, startable: true, up: false })
    await startStorybook(appId, talkId)
    let up = false
    for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 250)); up = (await storybookStatus(appId, talkId)).up }
    expect(up).toBe(true)
    const given = JSON.parse(await readFile(join(tools, 'given.json'), 'utf8'))
    expect(given).toEqual({ worktree: wt, port: String(portFor(wt)), cwd: expect.stringContaining('se-sbo-wt-'), env: [wt, String(portFor(wt))] }) // nothing added to the command
    expect(await listStories(appId, undefined, talkId)).toEqual([{ id: 'made-up--one', title: 'Made up', name: 'One' }])
    await stopStorybookAt(wt)
    let down = false
    for (let i = 0; i < 20 && !down; i++) { await new Promise((r) => setTimeout(r, 250)); down = !(await storybookStatus(appId, talkId)).up }
    expect(down).toBe(true)
  }, 30000)
})
