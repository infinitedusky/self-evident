/**
 * A task's own agent: one conversation per task, found by the task it is pinned to. Starting one needs a git checkout
 * (startTalk), so these rows are written straight in; what is tested is which conversation is the task's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, session, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { closeTalks, ensureTaskTalk, taskTalk } from './talk.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a task\'s own agent', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const talk = (subjectRef: object | null, extra: object = {}) => db.insert(session).values({ id: newId('session'), appId, kind: 'talk', cwd: '/tmp/none', subject: 'x', subjectRef, createdBy: 'user', lastActiveAt: new Date(), ...extra }).returning().then((r) => r[0])
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'task agent test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { closeTalks(); await pool.end() })

  it('is the one open conversation pinned to the task: not another task\'s, not an ended one, not the app\'s', async () => {
    const t = await createIssue(appId, { title: 'Has an agent', kind: 'code' })
    const other = await createIssue(appId, { title: 'Another', kind: 'code' })
    expect(await taskTalk(t.id)).toBeNull()
    await talk(null) // the app's agent, in the left column
    await talk({ projectId: 'proj_none' })
    await talk({ issueId: other.id })
    await talk({ issueId: t.id }, { status: 'ended' })
    expect(await taskTalk(t.id)).toBeNull()
    const own = await talk({ issueId: t.id })
    await talk({ issueId: t.id }, { createdAt: new Date(Date.now() + 60_000) }) // a stray second never takes over
    expect(await taskTalk(t.id)).toMatchObject({ id: own.id, live: false, busy: false })
    expect(await ensureTaskTalk(t.id)).toMatchObject({ id: own.id }) // asked for again: the same one, nothing started
  })

  it('is only for a top-level code task', async () => {
    const todo = await createIssue(appId, { title: 'Call the bank', kind: 'todo' })
    await expect(ensureTaskTalk(todo.id)).rejects.toThrow(/only a top-level code task/)
    await expect(ensureTaskTalk('iss_nope')).rejects.toThrow(/no task iss_nope/)
  })
})
