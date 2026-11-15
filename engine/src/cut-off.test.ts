/** Whether an agent was cut off mid-turn, from what its conversation holds. Sample data. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, session, sessionMessage, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { cutOff } from './talk.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('an agent cut off mid-turn (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'cut off test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await pool.end() })
  const talk = async (messages: [author: string, kind: string, body?: string][]) => {
    const id = newId('session')
    await db.insert(session).values({ id, appId, kind: 'talk', status: 'open', subjectRef: { checkOf: 'iss_sample', check: 'risk' } })
    for (const [author, kind, body] of messages) await db.insert(sessionMessage).values({ sessionId: id, appId, author, kind, body: body ?? '(sample)' } as typeof sessionMessage.$inferInsert)
    return id
  }

  it('given its brief and nothing more: cut off', async () => {
    expect(await cutOff(await talk([['engine', 'brief']]))).toBe(true)
  })
  it('working when it stopped, a tool call with no end of turn after it: cut off', async () => {
    expect(await cutOff(await talk([['engine', 'brief'], ['agent', 'text'], ['tool', 'tool_call'], ['tool', 'tool_result']]))).toBe(true)
  })
  it('its turn ended, finished or waiting for the person: not cut off, whatever a person set afterwards', async () => {
    expect(await cutOff(await talk([['engine', 'brief'], ['tool', 'tool_call'], ['agent', 'text'], ['engine', 'result', 'done']]))).toBe(false)
    expect(await cutOff(await talk([['engine', 'brief'], ['agent', 'text'], ['engine', 'result', 'done'], ['user', 'text', 'Auto-approve up to moderate.']]))).toBe(false)
  })
  it('a second turn that never ended: cut off', async () => {
    expect(await cutOff(await talk([['engine', 'brief'], ['agent', 'text'], ['engine', 'result', 'done'], ['engine', 'brief', 'Carry on'], ['tool', 'tool_call']]))).toBe(true)
  })
  it('a conversation nobody has spoken in: not cut off', async () => {
    expect(await cutOff(await talk([]))).toBe(false)
  })
})
