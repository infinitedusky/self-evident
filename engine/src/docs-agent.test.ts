/** An app's docs agent: what its pages are held to, what it may touch, when it is asked. Everything here is made up. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, decision, event, project, question, session, workspace } from './db/schema.js'
import { afterClose, afterDocsTurn, afterLearning, askDocsAgent, checkPages, docsAgent, docsPrompt, linkedFile, NOTHING_CHANGED, slugOf, TASK_PAGE, taskPage, wall, type Say } from './docs-agent.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { setLearning } from './learn.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const dirs: string[] = []
const put = (dir: string, file: string, text: string) => { mkdirSync(join(dir, file, '..'), { recursive: true }); writeFileSync(join(dir, file), text) }
/** A workbench folder with a docs site and both sections started. */
const bench = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-agent-')); dirs.push(dir)
  mkdirSync(join(dir, 'docs', '.vitepress'), { recursive: true })
  put(dir, 'docs/system/index.md', '# How the system works\n\n- [Sign-in](/system/sign-in): how a person gets a session.\n')
  put(dir, 'docs/system/sign-in.md', '# Sign-in\n\nA code is sent by email (sample).\n\n## Sessions\n\nThey last a day.\n')
  put(dir, 'docs/work/index.md', '# Our work\n')
  return dir
}
const WORK = `---\ntask: SHOP-12\ndate: 2026-11-25\n---\n# Sessions last a day\n\n## Introduction\n\nSessions end after a day (sample). A shared computer stayed signed in.\n\n## Decisions\n\n### How long\n\nA day, not a week.\n\n## Questions\n\nNone.\n\n## Call-outs\n\nNothing signs out a session that is open in another tab.\n\n## What it changed in the system\n\n- [Sign-in, Sessions](/system/sign-in#sessions): they last a day now.\n`

describe('the pages of the two sections, checked', () => {
  it('both sections start at an index, and a site with them and nothing wrong passes', () => {
    const dir = bench()
    expect(checkPages(dir)).toEqual([])
    rmSync(join(dir, 'docs', 'work'), { recursive: true })
    expect(checkPages(dir)).toEqual([expect.stringMatching(/docs\/work\/index\.md is missing.*Our work/)])
  })
  it('a page has a title, its line in the index, and links that lead somewhere', () => {
    const dir = bench()
    put(dir, 'docs/system/parts.md', 'The web app calls the API (sample). See [the queue](/system/queue) and [sign-in](./sign-in.md), [the site](https://example.com), [here](#top).\n\n```md\n# not a title, and [not a link](/nowhere)\n```\n')
    const found = checkPages(dir)
    expect(found).toHaveLength(3)
    expect(found[0]).toMatch(/docs\/system\/parts\.md has no title/)
    expect(found[1]).toMatch(/links to \/system\/queue, and there is no such page/)
    expect(found[2]).toMatch(/parts\.md is not linked from docs\/system\/index\.md/)
  })
  it('a task\'s page has the sections of the structure, and points at what it changed in How the system works', () => {
    const dir = bench()
    put(dir, 'docs/work/index.md', '# Our work\n\n- [SHOP-12: sessions last a day](/work/SHOP-12-sessions)\n- [SHOP-13](/work/SHOP-13-copy)\n- [SHOP-14](/work/SHOP-14-bare)\n')
    put(dir, 'docs/work/SHOP-12-sessions.md', WORK)
    put(dir, 'docs/work/SHOP-13-copy.md', WORK.replace(/- \[Sign-in.*\n/, `${NOTHING_CHANGED}: only the words on one button.\n`))
    put(dir, 'docs/work/SHOP-14-bare.md', '# Something\n\n## Introduction\n\nA thing.\n\n## Decisions\n\nNone were recorded.\n\n## What it changed in the system\n\nIt is better now, see [our work](/work/SHOP-12-sessions).\n')
    const found = checkPages(dir)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatch(/SHOP-14-bare\.md has no "## Questions", "## Call-outs": a task's page has these sections, in this order: Introduction, Decisions, Questions, Call-outs, What it changed in the system/)
    expect(found[1]).toMatch(/SHOP-14-bare\.md, under "What it changed in the system", links to no page of How the system works/)
  })
  it('the structure of a task\'s page is the folder\'s own when it has one, and always ends where it points back', () => {
    const dir = bench()
    expect(taskPage(dir).headings).toEqual(['Introduction', 'Decisions', 'Questions', 'Call-outs', 'What it changed in the system'])
    put(dir, TASK_PAGE, '# How a task\'s page is set out\n\nOurs (sample).\n\n## Summary\n\nTwo lines.\n\n## Risks\n\nWhat could go wrong.\n')
    expect(taskPage(dir).headings).toEqual(['Summary', 'Risks', 'What it changed in the system'])
    expect(taskPage(dir).text).toMatch(/^## Summary\n\nTwo lines\./)
    put(dir, 'docs/work/index.md', '# Our work\n\n- [SHOP-12](/work/SHOP-12-sessions)\n')
    put(dir, 'docs/work/SHOP-12-sessions.md', WORK)
    expect(checkPages(dir)).toEqual([expect.stringMatching(/has no "## Summary", "## Risks"/)])
    expect(docsPrompt({ name: 'Shop (sample)', key: 'SHOP' }, dir, [])).toContain('## Risks\n\nWhat could go wrong.')
  })
  it('a project has a folder: its page lists its tasks\' pages, and has its own line in Our work', () => {
    const dir = bench()
    put(dir, 'docs/work/sign-in-sample/SHOP-12-sessions.md', WORK)
    expect(checkPages(dir)).toEqual([expect.stringMatching(/docs\/work\/sign-in-sample\/ has no index\.md.*the project's page/)])
    put(dir, 'docs/work/sign-in-sample/index.md', '---\nproject: Sign-in (sample)\n---\n# Sign-in (sample)\n\nSafer sessions.\n')
    expect(checkPages(dir)).toEqual([
      expect.stringMatching(/SHOP-12-sessions\.md is not linked from docs\/work\/sign-in-sample\/index\.md/),
      expect.stringMatching(/sign-in-sample\/index\.md is not linked from docs\/work\/index\.md/),
      expect.stringMatching(/sign-in-sample\/index\.md has no "## Tasks" section/),
    ])
    put(dir, 'docs/work/sign-in-sample/index.md', '---\nproject: Sign-in (sample)\n---\n# Sign-in (sample)\n\nSafer sessions.\n\n## Tasks\n\n- [SHOP-12: sessions last a day](/work/sign-in-sample/SHOP-12-sessions)\n')
    put(dir, 'docs/work/index.md', '# Our work\n\n- [Sign-in (sample)](/work/sign-in-sample/): safer sessions.\n')
    expect(checkPages(dir)).toEqual([])
    expect(slugOf('Sign-in (sample)')).toBe('sign-in-sample'); expect(slugOf('  ¡!  ')).toBe('project')
  })
  it('what VitePress would refuse is said before its build: an unquoted colon in the frontmatter, curly braces, two titles', () => {
    const dir = bench()
    put(dir, 'docs/system/index.md', '# How the system works\n\n- [Sign-in](/system/sign-in)\n- [Jobs](/system/jobs)\n')
    put(dir, 'docs/system/jobs.md', '---\ntitle: Jobs: how they run (sample)\nquoted: "Jobs: fine"\ndate: 2026-11-25\n---\n# Jobs\n\nThe step is `${{ matrix.os }}` in code, and {{ here }} in prose.\n\n# Again\n')
    expect(checkPages(dir)).toEqual([
      expect.stringMatching(/jobs\.md: in the frontmatter, the value of "title" has a colon.*double quotes/),
      expect.stringMatching(/jobs\.md has "\{\{" outside a code span/),
      expect.stringMatching(/jobs\.md has more than one "# " title/),
    ])
  })
  it('a link is read from the site\'s root or from the page, with or without .md, to a page or a folder\'s index', () => {
    const dir = bench(), docs = join(dir, 'docs'), page = join(docs, 'work', 'a.md')
    expect(linkedFile(docs, page, '/system/sign-in#sessions')).toBe(join(docs, 'system', 'sign-in.md'))
    expect(linkedFile(docs, page, '../system/sign-in.md')).toBe(join(docs, 'system', 'sign-in.md'))
    expect(linkedFile(docs, page, '/system/')).toBe(join(docs, 'system', 'index.md'))
    expect(linkedFile(docs, page, '/system/gone')).toBe(join(docs, 'system', 'gone.md'))
    expect(linkedFile(docs, page, 'https://example.com/x')).toBeNull()
    expect(linkedFile(docs, page, '#here')).toBeNull()
  })
})

describe('the wall around the docs agent', () => {
  const cwd = '/bench-sample'
  it('writes pages under the two sections and public/, and nothing else', () => {
    expect(wall(cwd, 'Write', { file_path: '/bench-sample/docs/system/parts.md' }, 'moderate')).toEqual({ allow: true })
    expect(wall(cwd, 'Edit', { file_path: 'docs/work/SHOP-12-sessions.md' }, 'moderate')).toEqual({ allow: true })
    expect(wall(cwd, 'Write', { file_path: 'docs/public/flow.png' }, 'moderate')).toEqual({ allow: true })
    for (const file of ['docs/.vitepress/config.ts', 'docs/index.md', 'hooks/before-start', '/code/shop-sample/src/app.ts', 'docs/system/../../hooks/x', ''])
      expect(wall(cwd, 'Write', { file_path: file }, 'moderate')).toMatchObject({ allow: false, why: expect.stringMatching(/pages under docs\/system\/, docs\/work\/, docs\/public\//) })
  })
  it('reads and asks the engine freely; what leaves a mark is refused, not put to anyone', () => {
    expect(wall(cwd, 'Bash', { command: 'git log --oneline -5' }, 'free')).toEqual({ allow: true })
    expect(wall(cwd, 'mcp__engine__create_idea', {}, 'cheap')).toEqual({ allow: true })
    expect(wall(cwd, 'Bash', { command: 'git commit -am x' }, 'moderate')).toMatchObject({ allow: false })
    expect(wall(cwd, 'Bash', { command: 'git push' }, 'expensive')).toMatchObject({ allow: false, why: expect.stringMatching(/commits your pages/) })
  })
  it('is told its two sections, where the code is and what it is held to', () => {
    const p = docsPrompt({ name: 'Shop (sample)', key: 'SHOP' }, cwd, [{ name: 'acme/shop', path: '/code/shop-sample' }])
    expect(p).toContain('the docs agent of Shop (sample)')
    expect(p).toContain('How the system works, docs/system/'); expect(p).toContain('Our work, docs/work/')
    expect(p).toContain('/code/shop-sample (acme/shop)')
    for (const h of ['## Introduction', '## Decisions', '## Questions', '## Call-outs', '## What it changed in the system', '## Tasks']) expect(p).toContain(h)
    expect(p).toContain(NOTHING_CHANGED); expect(p).toContain('.claude/skills/'); expect(p).toContain('Do not commit')
  })
})

describe.skipIf(!reachable)('the docs agent, asked', () => {
  const wsId = newId('workspace')
  const anApp = async (dir: string | null) => {
    const id = newId('app')
    await db.insert(app).values({ id, workspaceId: wsId, name: 'Shop (sample)', key: id.slice(-6).toUpperCase(), setup: dir ? { workbench: { dir } } : {} })
    return id
  }
  const heard: { sessionId: string; text: string; payload: Record<string, unknown> }[] = []
  const say: Say = async (sessionId, text, payload) => { heard.push({ sessionId, text, payload }) }
  const events = async (appId: string, type: string) => (await db.select().from(event).where(eq(event.appId, appId))).filter((e) => e.type === type)
  beforeAll(async () => { await db.insert(workspace).values({ id: wsId, name: 'docs agent test' }) })
  afterAll(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); await pool.end() })

  it('an app with no docs site has no docs agent: asking says why, and the engine\'s own moments pass by', async () => {
    const none = await anApp(null)
    expect(await docsAgent(none)).toMatchObject({ ready: false, problem: expect.stringMatching(/no workbench folder/), sessionId: null, pages: { system: 0, work: 0 } })
    await expect(askDocsAgent(none, 'Write down how sign-in works.', { say })).rejects.toThrow(/no workbench folder/)
    const t = await createIssue(none, { title: 'Sessions last a day (sample)' })
    expect(await afterClose(t.id, { say })).toBeNull()
  })

  it('is one conversation in the workbench folder, asked by a person, an agent or the engine', async () => {
    const dir = bench(), id = await anApp(dir)
    const first = await askDocsAgent(id, 'Write down how sign-in works.', { say })
    const again = await askDocsAgent(id, 'And the queue.', { say, from: 'sess_sample' })
    expect(again.sessionId).toBe(first.sessionId)
    const [s] = await db.select().from(session).where(eq(session.id, first.sessionId))
    expect(s).toMatchObject({ cwd: dir, worktreePath: null, subject: 'Docs for Shop (sample)', subjectRef: { docsOf: id } })
    expect(heard.slice(-2).map((h) => h.payload)).toEqual([{ label: 'From you' }, { from: 'sess_sample', label: 'From an agent' }])
    await expect(askDocsAgent(id, 'Write it.', { say, from: first.sessionId })).rejects.toThrow(/you are the docs agent/)
    expect(await docsAgent(id, () => true)).toMatchObject({ ready: true, problem: null, sessionId: first.sessionId, busy: true, pages: { system: 1, work: 0 }, asked: { why: 'asked', label: 'From an agent' }, wrote: null })
  })

  it('a closed task asks for its page in Our work; a learned codebase asks for How the system works, once', async () => {
    const id = await anApp(bench())
    const t = await createIssue(id, { title: 'Sessions last a day (sample)' })
    const asked = await afterClose(t.id, { say })
    expect(heard.at(-1)!.text).toMatch(/Sessions last a day \(sample\)" is closed/)
    expect(heard.at(-1)!.text).toContain('docs/work/'); expect(heard.at(-1)!.payload.label).toMatch(/-\d+ was closed$/)
    expect(heard.at(-1)!.text).toContain('No decision was recorded on it.'); expect(heard.at(-1)!.text).toContain("Give the task's page its line at the top of docs/work/index.md")
    // A task of a project: its record is handed over, and its page goes in the project's folder
    const projectId = newId('project')
    await db.insert(project).values({ id: projectId, appId: id, name: 'Sign-in (sample)', content: 'Sessions that end (sample).' })
    const u = await createIssue(id, { title: 'Sign out everywhere (sample)', projectId })
    await db.insert(decision).values({ id: newId('decision'), appId: id, issueId: u.id, question: 'Where is a session ended (sample)?', options: [{ key: 'A', text: 'On the server', tradeoff: 'one more table' }, { key: 'B', text: 'In the browser' }], chosen: 'A', rationale: 'A browser cannot be trusted to forget.' })
    await db.insert(question).values({ id: newId('question'), appId: id, issueId: u.id, text: 'Does it end the session on a phone too (sample)?', status: 'answered', answer: 'Yes.' })
    await afterClose(u.id, { say })
    const told = heard.at(-1)!.text
    expect(told).toContain('It is a task of the project "Sign-in (sample)"')
    expect(told).toMatch(/- Where is a session ended \(sample\)\?\n  Chosen: On the server \(one more table\)\n  Turned down: In the browser\n  Why: A browser cannot be trusted to forget\./)
    expect(told).toMatch(/- Does it end the session on a phone too \(sample\)\?\n  Answered: Yes\./)
    expect(told).toMatch(/docs\/work\/sign-in-sample\/[A-Z0-9]+-\d+-<a few words>\.md/); expect(told).toContain('docs/work/sign-in-sample/index.md'); expect(told).toContain('Sessions that end (sample).')
    const learn = newId('session')
    await db.insert(session).values({ id: learn, appId: id, kind: 'talk', cwd: '/code/shop-sample', subject: 'Learn the codebase', subjectRef: { learn: 'codebase', app: true }, createdBy: 'user', lastActiveAt: new Date() })
    expect(await afterLearning(learn, { say })).toBeNull() // it wrote nothing yet
    expect(await afterLearning(asked!.sessionId, { say })).toBeNull() // not Learn's conversation
    await setLearning(id, { key: 'parts', summary: 'A web app and an API (sample).', body: 'web/ calls api/ over HTTP (sample).' })
    expect(await afterLearning(learn, { say })).toMatchObject({ sessionId: asked!.sessionId })
    expect(heard.at(-1)!.text).toMatch(/The codebase was learned again: Learn's agent wrote "The parts"/)
    expect(await afterLearning(learn, { say })).toBeNull() // told already
    expect((await events(id, 'docs_agent.asked')).map((e) => (e.payload as { why: string }).why)).toEqual(['work', 'work', 'learned'])
  })

  it('when its turn ends: what the check finds is said back twice, then kept for the person; pages that pass are committed', async () => {
    const dir = bench(), id = await anApp(dir)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Sample', GIT_AUTHOR_EMAIL: 'sample@example.com', GIT_COMMITTER_NAME: 'Sample', GIT_COMMITTER_EMAIL: 'sample@example.com' } })
    git('init', '-q'); git('config', 'user.name', 'Sample'); git('config', 'user.email', 'sample@example.com'); git('add', '-A'); git('commit', '-qm', 'A sample site')
    const { sessionId } = await askDocsAgent(id, 'Write the page for SHOP-12.', { say, label: 'SHOP-12 was closed', why: 'work' })
    const built: string[] = [], build = async (d: string) => { built.push(d); return [] }
    expect(await afterDocsTurn('sess_nobody', { say, build })).toBeNull()
    expect(await afterDocsTurn(sessionId, { say, build })).toEqual({ problems: [], retried: false, commit: null }) // it wrote nothing: nothing to keep

    put(dir, 'docs/work/SHOP-12-sessions.md', WORK) // not in the index yet
    put(dir, 'hooks/after-stop', 'echo not a page\n')
    for (const _ of [1, 2]) {
      expect(await afterDocsTurn(sessionId, { say, build })).toMatchObject({ retried: true, problems: [expect.stringMatching(/not linked from docs\/work\/index\.md/)] })
      expect(heard.at(-1)).toMatchObject({ sessionId, payload: { label: 'The check on your pages' } })
    }
    expect(await afterDocsTurn(sessionId, { say, build })).toMatchObject({ retried: false, commit: null, problems: [expect.stringMatching(/not linked/)] })
    expect(built).toHaveLength(1) // the build is not run on pages the file check already refused
    expect((await docsAgent(id)).wrote).toMatchObject({ files: [], commit: null, problems: [expect.stringMatching(/not linked/)] })

    put(dir, 'docs/work/index.md', '# Our work\n\n- [SHOP-12: sessions last a day](/work/SHOP-12-sessions)\n')
    expect(await afterDocsTurn(sessionId, { say, build: async () => ['the site does not build (sample)'] })).toMatchObject({ retried: true, problems: ['the site does not build (sample)'] })
    const kept = await afterDocsTurn(sessionId, { say, build })
    expect(kept).toMatchObject({ retried: false, problems: [], commit: expect.stringMatching(/^[0-9a-f]{7,}$/) })
    expect(git('log', '-1', '--format=%s').trim()).toBe('Docs: SHOP-12 was closed')
    expect(git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual(['docs/work/SHOP-12-sessions.md', 'docs/work/index.md'])
    expect(git('status', '--porcelain').trim()).toBe('?? hooks/') // what is not a page is not its to commit
    expect(await docsAgent(id)).toMatchObject({ pages: { system: 1, work: 1 }, wrote: { files: ['docs/work/SHOP-12-sessions.md', 'docs/work/index.md'], commit: kept!.commit, problems: [] } })
  })
})
