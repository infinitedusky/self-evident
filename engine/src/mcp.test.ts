/** The MCP endpoint, spoken to the way Claude Code does: initialize, list the tools, call one; foreign hosts are refused. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, todo, workspace } from './db/schema.js'
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
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop' })
  })
  afterAll(async () => { await db.update(todo).set({ status: 'dropped', reason: 'test' }).where(eq(todo.appId, appId)); await pool.end() })

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

  it('refuses a request whose Host is not localhost, and an app that does not exist', async () => {
    expect((await handleMcp(appId, rpc(1, 'tools/list', {}, 'evil.example:4000'), 4000)).status).toBe(403)
    expect((await handleMcp('app_nope', rpc(1, 'tools/list'), 4000)).status).toBe(404)
  })
})
