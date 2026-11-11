/**
 * A task's own agent: one conversation per task, found by the task it is pinned to. Starting one needs a git checkout
 * (startTalk), so these rows are written straight in; what is tested is which conversation is the task's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, prototype, session, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { closeTalks, ensureTaskTalk, listTalks, modelFor, startCheckTalk, taskAgents, taskTalk } from './talk.js'

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

  it('lists a prototype\'s agent as one the task has out, and marks both as the task\'s so the app\'s column leaves them out', async () => {
    const t = await createIssue(appId, { title: 'Prototyped', kind: 'code' })
    const own = await talk({ issueId: t.id })
    const builder = await talk({ prototypeId: 'proto_x' })
    const loose = await talk({ prototypeId: 'proto_y' }) // a prototype on no task: stays the app's
    const proto = (issueId: string | null, sessionId: string, status = 'running') => db.insert(prototype).values({ id: newId('prototype'), appId, issueId, title: 'Swing (sample)', sessionId, branch: 'proto/x', path: '/tmp/none', status })
    await proto(t.id, builder.id)
    await proto(null, loose.id)
    await proto(t.id, (await talk({ prototypeId: 'proto_z' }, { status: 'ended' })).id) // its conversation ended: not out any more
    await proto(t.id, (await talk({ prototypeId: 'proto_w' })).id, 'discarded')
    expect(await taskAgents(t.id)).toMatchObject([{ sessionId: builder.id, kind: 'prototype', what: 'Prototype', title: 'Swing (sample)', busy: false }])
    expect(await taskAgents('iss_none')).toEqual([])
    const mine = (await listTalks({ open: true })).filter((s) => [own.id, builder.id, loose.id].includes(s.id))
    expect(Object.fromEntries(mine.map((s) => [s.id, s.taskId]))).toEqual({ [own.id]: t.id, [builder.id]: t.id, [loose.id]: null })
  })

  it('lists a fresh agent out on a check beside the prototype\'s, by its step, and marks it as the task\'s', async () => {
    const t = await createIssue(appId, { title: 'Checked', kind: 'code' })
    const reader = await startCheckTalk({ appId, issueId: t.id, check: 'analysis', cwd: '/tmp/none', branch: 'prototype/x', subject: 'Prototype analysis: Checked' })
    await talk({ checkOf: t.id, check: 'adr' }, { status: 'ended' }) // ended: not out any more
    expect(reader).toMatchObject({ worktreePath: null, createdBy: 'engine', subjectRef: { checkOf: t.id, check: 'analysis' } }) // ending it removes no folder
    expect(await taskAgents(t.id)).toMatchObject([{ sessionId: reader.id, kind: 'check', check: 'analysis', what: 'Prototype analysis', icon: '🔬', busy: false }])
    expect(await taskTalk(t.id)).toBeNull() // it is not the task's own agent
    expect((await listTalks({ open: true })).find((s) => s.id === reader.id)?.taskId).toBe(t.id)
  })

  it('runs a prototype\'s agent on Sonnet unless the app names another model, and everything else on the app\'s model', () => {
    expect(modelFor({}, true)).toBe('claude-sonnet-5-5')
    expect(modelFor({ model: 'claude-opus-5-5' }, true)).toBe('claude-sonnet-5-5')
    expect(modelFor({ prototype_model: 'claude-haiku-5-5' }, true)).toBe('claude-haiku-5-5')
    expect(modelFor({ model: 'claude-opus-5-5' }, false)).toBe('claude-opus-5-5')
    expect(modelFor({}, false)).toBeUndefined()
  })

  it('is only for a top-level code task', async () => {
    const todo = await createIssue(appId, { title: 'Call the bank', kind: 'todo' })
    await expect(ensureTaskTalk(todo.id)).rejects.toThrow(/only a top-level code task/)
    await expect(ensureTaskTalk('iss_nope')).rejects.toThrow(/no task iss_nope/)
  })
})
