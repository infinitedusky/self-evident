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
})
