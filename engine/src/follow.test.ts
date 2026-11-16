/** Following the agent: a change made through the tools tells the workspace which page it shows on; a read does not. */
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, issue, session, workspace } from './db/schema.js'
import { mcpSession } from './follow.js'
import { newId } from './ids.js'
import { engineTools } from './tools.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('follow', () => {
  const wsId = newId('workspace')
  let appId: string, sessionId: string
  const followed = async () => (await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, 'ui.follow')))).sort((a, b) => a.seq - b.seq).map((e) => e.payload as { sessionId: string | null; tool: string; tab: { path: string }; projectId: string | null })
  const call = async (name: string, args: Record<string, unknown>, sid: string | undefined = sessionId) => {
    const t = engineTools({ appId, sessionId: sid }).find((x) => x.name === name)!
    const r = await t.handler(args)
    return r.isError ? null : JSON.parse(r.content[0].text)
  }
  beforeAll(async () => {
    appId = newId('app'); sessionId = newId('session')
    await db.insert(workspace).values({ id: wsId, name: 'follow test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(session).values({ id: sessionId, appId })
  })
  afterAll(async () => { await db.update(issue).set({ state: 'canceled', reason: 'test' }).where(and(eq(issue.appId, appId), isNull(issue.parentId))); await pool.end() })

  it('sends a created project, a task in it and a to-do to their pages, with the conversation; reads send nothing', async () => {
    const made = await call('create_project', { name: 'Checkout', issues: [{ title: 'Cart' }] })
    const projectId = made.project.id
    const t = await call('create_task', { title: 'Pay', kind: 'todo', projectId })
    await call('update_task', { issueId: t.id, title: 'Pay by card' })
    await call('create_todo', { title: 'Call the bank' })
    await call('projects', {})
    await call('task', { issueId: t.id })
    expect(await followed()).toEqual([
      { sessionId, tool: 'create_project', tab: { kind: 'page', path: `/projects/${projectId}` }, projectId },
      { sessionId, tool: 'create_task', tab: { kind: 'page', path: `/tasks/${t.id}` }, projectId },
      { sessionId, tool: 'update_task', tab: { kind: 'page', path: `/tasks/${t.id}` }, projectId },
      { sessionId, tool: 'create_todo', tab: { kind: 'page', path: '/todos' }, projectId: null },
    ])
  })

  it('sends nothing when the tool failed', async () => {
    const before = (await followed()).length
    await call('update_task', { issueId: 'iss_nope', title: 'x' })
    expect((await followed()).length).toBe(before)
  })

  it('knows a Claude Code session by the conversation in its address, else the only one carried on in a terminal', async () => {
    expect(await mcpSession(appId, sessionId)).toBe(sessionId)
    expect(await mcpSession(appId, 'sess_other')).toBeNull()
    expect(await mcpSession(appId, null)).toBeNull()
    await db.update(session).set({ terminalSince: new Date() }).where(eq(session.id, sessionId))
    expect(await mcpSession(appId, null)).toBe(sessionId)
    const second = newId('session')
    await db.insert(session).values({ id: second, appId, terminalSince: new Date() })
    expect(await mcpSession(appId, null)).toBeNull() // two in terminals: can't tell which
  })
  it('a task\'s own agent takes the person to the step\'s page of its task, in the task\'s tab, and does not follow its own task', async () => {
    const t = await call('create_task', { title: 'Has its own agent', kind: 'code' })
    const own = newId('session')
    await db.insert(session).values({ id: own, appId, kind: 'talk', subjectRef: { issueId: t.id } })
    const opened = async () => (await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, 'ui.open')))).sort((a, b) => a.seq - b.seq).map((e) => e.payload as { tab: { kind: string; path?: string }; split: string | null; issueId?: string }).at(-1)
    await call('open_tab', { kind: 'sketch', file: 'sketches/home.html' }, own)
    expect(await opened()).toEqual({ sessionId: own, tab: { kind: 'page', path: `/tasks/${t.id}/sketch?file=home.html` }, issueId: t.id })
    await call('open_tab', { kind: 'storybook', story: 'pages-cart--empty' }, own)
    expect((await opened())?.tab.path).toBe(`/tasks/${t.id}/mockup?story=pages-cart--empty`)
    await call('open_tab', { kind: 'build', issueId: t.id }, own)
    expect((await opened())?.tab.path).toBe(`/tasks/${t.id}/build`) // a build log: the task's Build page, in its tab
    await call('open_tab', { path: `/tasks/${t.id}/research` }, own)
    expect((await opened())?.tab.path).toBe(`/tasks/${t.id}/research`)
    expect(await call('open_tab', { path: '/todos' }, own)).toBeNull() // a page outside its task: not opened
    expect((await opened())?.tab.path).toBe(`/tasks/${t.id}/research`)
    await call('open_tab', { kind: 'sketch', file: 'home.html' }) // the app's agent: a tab of its own, and never a split
    const last = await opened()
    expect(last).toMatchObject({ tab: { kind: 'sketch', file: 'home.html' } })
    expect(last).not.toHaveProperty('split')
    const before = (await followed()).length
    await call('update_task', { issueId: t.id, brief: 'Do it.' }, own)
    expect((await followed()).length).toBe(before) // its own task: the person is there already
    const other = await call('create_task', { title: 'Somebody else\'s', kind: 'todo' })
    const mid = (await followed()).length
    await call('update_task', { issueId: other.id, title: 'Changed by the task\'s agent' }, own)
    await call('create_todo', { title: 'Made by the task\'s agent' }, own)
    expect((await followed()).length).toBe(mid) // nor anything else: a task's agent takes the person nowhere but its own tab
    const check = newId('session')
    await db.insert(session).values({ id: check, appId, kind: 'talk', subjectRef: { checkOf: t.id, check: 'analysis' } })
    await call('create_todo', { title: 'Made by a check' }, check)
    expect((await followed()).length).toBe(mid) // a check's agent on that task: the same
    await call('update_task', { issueId: t.id, brief: 'Do it well.' })
    expect((await followed()).at(-1)).toMatchObject({ tab: { path: `/tasks/${t.id}` } }) // another conversation changing it still shows
  })
})
