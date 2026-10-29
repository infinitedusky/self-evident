/** The MCP endpoint, spoken to the way Claude Code does: initialize, list the tools, call one; foreign hosts are refused. */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, issue, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { handleMcp } from './mcp.js'
import { createTodo } from './todos.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const rpc = (id: number, method: string, params: Record<string, unknown> = {}, host = 'localhost:4000') => new Request('http://localhost:4000/api/mcp/x', {
  method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  headers: { host, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
})

describe.skipIf(!reachable)('mcp', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'mcp test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await db.update(issue).set({ state: 'canceled', reason: 'test' }).where(and(eq(issue.appId, appId), isNull(issue.parentId))); await pool.end() })

  it('initializes, lists the engine tools with read-only hints, and runs one against the app in the URL', async () => {
    const init = await (await handleMcp(appId, rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }), 4000)).json()
    expect(init.result.serverInfo.name).toBe('self-evident')
    expect(init.result.instructions).toContain('Shop')

    const list = await (await handleMcp(appId, rpc(2, 'tools/list'), 4000)).json()
    const tools = list.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[]
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['now', 'todos', 'create_todo', 'check_item', 'plan_task', 'start_project']))
    expect(tools.find((t) => t.name === 'now')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === 'start_project')?.annotations?.readOnlyHint).toBe(false)

    await createTodo({ appId, title: 'Call the supplier', checklist: ['Find the number'] })
    const call = await (await handleMcp(appId, rpc(3, 'tools/call', { name: 'todos', arguments: {} }), 4000)).json()
    expect(JSON.parse(call.result.content[0].text).map((t: { title: string }) => t.title)).toEqual(['Call the supplier'])
    const made = await (await handleMcp(appId, rpc(4, 'tools/call', { name: 'create_todo', arguments: { title: 'From the editor' } }), 4000)).json()
    expect(JSON.parse(made.result.content[0].text)).toMatchObject({ title: 'From the editor', createdBy: 'agent:claude-code' })
  })

  it('opens a tab in the workspace as an event the UI acts on, and refuses a page without a path', async () => {
    const ok = await (await handleMcp(appId, rpc(5, 'tools/call', { name: 'open_tab', arguments: { path: '/todos', split: 'right' } }), 4000)).json()
    expect(ok.result.isError).toBeFalsy()
    const [e] = await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, 'ui.open')))
    expect(e.payload).toMatchObject({ tab: { kind: 'page', path: '/todos' }, split: 'right' })
    const bad = await (await handleMcp(appId, rpc(6, 'tools/call', { name: 'open_tab', arguments: { path: 'todos' } }), 4000)).json()
    expect(bad.result.isError).toBe(true)
  })

  it('lists the stories from the app\'s Storybook, narrowed by match, and opens one', async () => {
    const index = { v: 5, entries: {
      'pages-cart--empty': { id: 'pages-cart--empty', type: 'story', title: 'Pages/Cart', name: 'Empty' },
      'pages-cart--docs': { id: 'pages-cart--docs', type: 'docs', title: 'Pages/Cart', name: 'Docs' },
      'components-badge--ok': { id: 'components-badge--ok', type: 'story', title: 'Components/Badge', name: 'Ok' },
    } }
    const sb = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(req.url === '/index.json' ? JSON.stringify(index) : '{}') })
    await new Promise<void>((r) => sb.listen(0, '127.0.0.1', r))
    await db.update(app).set({ setup: { storybook_url: `http://127.0.0.1:${(sb.address() as AddressInfo).port}/` } }).where(eq(app.id, appId))
    try {
      const all = await (await handleMcp(appId, rpc(7, 'tools/call', { name: 'stories', arguments: {} }), 4000)).json()
      expect(JSON.parse(all.result.content[0].text).map((e: { id: string }) => e.id)).toEqual(['pages-cart--empty', 'components-badge--ok'])
      const cart = await (await handleMcp(appId, rpc(8, 'tools/call', { name: 'stories', arguments: { match: 'CART' } }), 4000)).json()
      expect(JSON.parse(cart.result.content[0].text)).toEqual([{ id: 'pages-cart--empty', title: 'Pages/Cart', name: 'Empty' }])
      await handleMcp(appId, rpc(9, 'tools/call', { name: 'open_tab', arguments: { kind: 'storybook', story: 'pages-cart--empty' } }), 4000)
      const opened = await db.select().from(event).where(and(eq(event.appId, appId), eq(event.type, 'ui.open')))
      expect(opened.at(-1)?.payload).toMatchObject({ tab: { kind: 'storybook', story: 'pages-cart--empty' } })
    } finally { sb.close() }
  })

  it('says so when the Storybook is not answering', async () => {
    await db.update(app).set({ setup: { storybook_url: 'http://127.0.0.1:9/' } }).where(eq(app.id, appId))
    const r = await (await handleMcp(appId, rpc(10, 'tools/call', { name: 'stories', arguments: {} }), 4000)).json()
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toContain('not answering')
  })

  it('refuses a request whose Host is not localhost, and an app that does not exist', async () => {
    expect((await handleMcp(appId, rpc(1, 'tools/list', {}, 'evil.example:4000'), 4000)).status).toBe(403)
    expect((await handleMcp('app_nope', rpc(1, 'tools/list'), 4000)).status).toBe(404)
  })
})
