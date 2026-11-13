/**
 * A task's own agent: one conversation per task, found by the task it is pinned to. Starting one needs a git checkout
 * (startTalk), so these rows are written straight in; what is tested is which conversation is the task's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, prototype, session, sessionMessage, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { createIdea } from './ideas.js'
import { convertIdea } from './work.js'
import { eq } from 'drizzle-orm'
import { agentsOut, closeTalk, closeTalks, ensureIdeaTalk, ensureTaskTalk, ideaAgents, ideaTalk, listTalks, modelFor, readAgent, reopenTalk, showTalk, startCheckTalk, takeReply, taskAgents, taskTalk } from './talk.js'

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

  it('lets the conductor see and read the agents it has out, and takes an agent\'s answer back to it once', async () => {
    const t = await createIssue(appId, { title: 'Conducted', kind: 'code' })
    const own = await talk({ issueId: t.id })
    const builder = await talk({ prototypeId: 'proto_c' })
    await db.insert(prototype).values({ id: newId('prototype'), appId, issueId: t.id, title: 'Swing (sample)', sessionId: builder.id, branch: 'proto/c', path: '/tmp/none', status: 'running' })
    const reader = await startCheckTalk({ appId, issueId: t.id, check: 'adr', cwd: '/tmp/none', branch: null, subject: 'ADR: Conducted' })
    const said = (sessionId: string, author: string, kind: string, body: string, payload?: object) => db.insert(sessionMessage).values({ appId, sessionId, author, kind, body, payload: payload ?? null, status: 'sent', sentAt: new Date() })
    await said(builder.id, 'user', 'text', 'make the ball bigger (sample)') // the person, directly
    await said(builder.id, 'agent', 'text', 'Bigger ball is in.')
    expect(await takeReply(builder.id)).toBeNull() // the conductor asked nothing: nothing goes back
    await said(builder.id, 'engine', 'brief', 'Slow the swing down (sample).', { from: own.id })
    await said(builder.id, 'tool', 'tool_call', 'Edit')
    await said(builder.id, 'agent', 'text', 'Working on it.')
    await said(builder.id, 'agent', 'text', 'The swing is slower now; look at the downswing.')

    expect(await agentsOut(own.id)).toMatchObject([{ kind: 'prototype', state: 'idle', lastSaid: 'The swing is slower now; look at the downswing.' }, { kind: 'check', check: 'adr', lastSaid: null }])
    const read = await readAgent(own.id, 'prototype')
    expect(read.messages.map((m) => m.by)).toEqual(['the person', 'the agent', 'you', 'the agent', 'the agent']) // no tool noise
    expect((await readAgent(own.id, 'adr')).sessionId).toBe(reader.id)
    expect((await readAgent(own.id, builder.id, 1)).messages).toHaveLength(1)
    await expect(readAgent(own.id, 'audit')).rejects.toThrow(/no agent "audit" out on this task; out now: Prototype/)
    await expect(readAgent(builder.id, 'adr')).rejects.toThrow(/only a task's own agent/)
    await expect(agentsOut(reader.id)).rejects.toThrow(/only a task's own agent/)

    expect(await takeReply(builder.id)).toEqual({ from: own.id, what: 'Prototype', said: 'The swing is slower now; look at the downswing.' })
    expect(await takeReply(builder.id)).toBeNull() // once
    await said(reader.id, 'engine', 'brief', 'Also weigh a queue (sample).', { from: own.id })
    expect(await takeReply(reader.id)).toEqual({ from: own.id, what: 'ADR', said: null }) // it stopped without a word
  })

  it('runs a prototype\'s agent on Sonnet unless the app names another model, and everything else on the app\'s model', () => {
    expect(modelFor({}, true)).toBe('claude-sonnet-5-5')
    expect(modelFor({ model: 'claude-opus-5-5' }, true)).toBe('claude-sonnet-5-5')
    expect(modelFor({ prototype_model: 'claude-haiku-5-5' }, true)).toBe('claude-haiku-5-5')
    expect(modelFor({ model: 'claude-opus-5-5' }, false)).toBe('claude-opus-5-5')
    expect(modelFor({}, false)).toBeUndefined()
  })

  it('gives an idea an agent of its own: the conversation pinned to it that has a worktree, not one about the app that started from it', async () => {
    const i = await createIdea({ appId, title: 'Made-up idea: themes' })
    expect(await ideaTalk(i.id)).toBeNull()
    await talk({ ideaId: i.id, app: true }) // a left-column conversation started on the idea's page: about the app, no worktree
    expect(await ideaTalk(i.id)).toBeNull()
    const own = await talk({ ideaId: i.id }, { worktreePath: '/tmp/none-worktrees/talk-idea', branch: 'talk/idea' })
    expect(await ideaTalk(i.id)).toMatchObject({ id: own.id })
    expect(await ensureIdeaTalk(i.id)).toMatchObject({ id: own.id }) // asked for again: the same one
    const p = await talk({ prototypeId: 'proto_made_up' })
    await db.insert(prototype).values({ id: newId('prototype'), appId, ideaId: i.id, title: 'Made-up prototype', branch: 'prototype/made-up-idea', path: '/tmp/none', status: 'running', sessionId: p.id })
    expect(await ideaAgents(i.id)).toMatchObject([{ sessionId: p.id, kind: 'prototype' }])
    const listed = await listTalks({ open: true })
    expect(listed.find((t) => t.id === own.id)).toMatchObject({ ideaId: i.id, taskId: null }) // the app's column leaves both out
    expect(listed.find((t) => t.id === p.id)).toMatchObject({ ideaId: i.id })
    await expect(ensureIdeaTalk('idea_nope')).rejects.toThrow(/no idea idea_nope/)
  })

  it('hands the idea\'s agent to the task it becomes: the same conversation and worktree, pinned to the task', async () => {
    const i = await createIdea({ appId, title: 'Made-up idea: a status page' })
    const own = await talk({ ideaId: i.id }, { worktreePath: '/tmp/none-worktrees/talk-status', branch: 'talk/status', closedAt: new Date() })
    const about = await talk({ ideaId: i.id, app: true })
    const out = await convertIdea(i.id, 'task')
    if (!('issueId' in out)) throw new Error('not a task')
    expect(await taskTalk(out.issueId)).toMatchObject({ id: own.id, worktreePath: '/tmp/none-worktrees/talk-status', branch: 'talk/status', closedAt: null })
    expect((await taskTalk(out.issueId))!.subject).toMatch(/Made-up idea: a status page$/)
    expect(await ideaTalk(i.id)).toBeNull()
    const [left] = await db.select().from(session).where(eq(session.id, about.id))
    expect(left.subjectRef).toEqual({ ideaId: i.id, app: true }) // the one about the app stays where it was
    await expect(ensureIdeaTalk(i.id)).rejects.toThrow(/was converted/)
  })

  it('is only for a top-level code task', async () => {
    const todo = await createIssue(appId, { title: 'Call the bank', kind: 'todo' })
    await expect(ensureTaskTalk(todo.id)).rejects.toThrow(/only a top-level code task/)
    await expect(ensureTaskTalk('iss_nope')).rejects.toThrow(/no task iss_nope/)
  })

  it('closes a tab without ending the conversation: its worktree and branch stay, and it comes back', async () => {
    const s = await talk(null, { worktreePath: '/tmp/none-worktrees/talk-x', branch: 'talk/x' })
    const closed = await closeTalk(s.id)
    expect(closed).toMatchObject({ status: 'open', worktreePath: '/tmp/none-worktrees/talk-x', branch: 'talk/x' })
    expect(closed.closedAt).toBeInstanceOf(Date)
    expect((await listTalks({ open: true })).find((t) => t.id === s.id)?.closedAt).toBeInstanceOf(Date) // still listed, marked closed
    expect((await reopenTalk(s.id)).closedAt).toBeNull()
    await closeTalk(s.id)
    await showTalk(s.id, appId) // the engine brings it to the front: its tab is back
    expect((await listTalks({ open: true })).find((t) => t.id === s.id)?.closedAt).toBeNull()
    const ended = await talk(null, { status: 'ended' })
    await expect(closeTalk(ended.id)).rejects.toThrow(/no open conversation/)
  })
})
