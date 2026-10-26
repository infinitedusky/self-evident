/**
 * To-dos: kept with a checklist, numbered per app; done when the last line is checked, open again when one is
 * unchecked; dropped only with a reason; a backlog item can become one; a project shows the to-dos that unblock it;
 * Now lists what waits on a person before what waits on someone else.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addItems, listBacklog } from './backlog.js'
import { db, pool } from './db/client.js'
import { app, project, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { now } from './now.js'
import { createProject, projectGraph } from './projects.js'
import { addChecklist, draftChecklist, completeTodo, createTodo, dropTodo, itemToTodo, listTodos, reopenTodo, setChecklistItem } from './todos.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('todos', () => {
  const wsId = newId('workspace')
  let appId: string, otherApp: string
  beforeAll(async () => {
    appId = newId('app'); otherApp = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'todos test' })
    await db.insert(app).values([{ id: appId, workspaceId: wsId, name: 'fake app' }, { id: otherApp, workspaceId: wsId, name: 'other app' }])
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('keeps a to-do with its checklist; checking the last line finishes it, unchecking one opens it again', async () => {
    const t = await createTodo({ appId, title: ' Get approved for Apple ', checklist: ['Enroll in the developer program', { text: 'Request Family Controls', waitingOn: "Apple's review" }, '  '] })
    expect(t).toMatchObject({ number: 1, title: 'Get approved for Apple', owner: 'person', status: 'open' })
    expect(t.checklist.map((l) => [l.text, l.waitingOn, l.done])).toEqual([['Enroll in the developer program', null, false], ['Request Family Controls', "Apple's review", false]])

    let after = await setChecklistItem(t.checklist[0].id, { done: true })
    expect(after.status).toBe('open')
    after = await setChecklistItem(t.checklist[1].id, { done: true, waitingOn: null })
    expect(after).toMatchObject({ status: 'done' })
    after = await setChecklistItem(t.checklist[1].id, { done: false })
    expect(after.status).toBe('open')
    await setChecklistItem(t.checklist[1].id, { done: true })
    after = await addChecklist(t.id, ['Set up TestFlight'])
    expect(after.status).toBe('open') // a new line on a done to-do opens it again
    expect(after.checklist.map((l) => l.text)).toEqual(['Enroll in the developer program', 'Request Family Controls', 'Set up TestFlight'])

    await expect(dropTodo(t.id, ' ')).rejects.toThrow(/why/)
    expect(await dropTodo(t.id, 'doing Android first')).toMatchObject({ status: 'dropped', reason: 'doing Android first' })
    await expect(setChecklistItem(after.checklist[2].id, { done: true })).rejects.toThrow(/dropped/)
    expect(await reopenTodo(t.id)).toMatchObject({ status: 'open', reason: null })
    expect(await completeTodo(t.id)).toMatchObject({ status: 'done' }) // a person can say it is done whatever the list says
  })

  it('a backlog item becomes a to-do that unblocks its project, which shows it; another app\'s project is refused', async () => {
    const { project: p } = await createProject({ appId, title: 'iPhone gate', tasks: [{ title: 'Native lock' }] })
    const [item] = await addItems(p.id, [{ text: 'Get Naya set up', body: 'she tests it first' }])
    const t = await itemToTodo(item.id, { checklist: ['Call Naya', 'Install it on her phone'] })
    expect(t).toMatchObject({ title: 'Get Naya set up', notes: 'she tests it first', projectId: p.id })
    expect((await listBacklog(p.id))[0]).toMatchObject({ state: 'covered', todoId: t.id, taskId: null })
    const g = (await projectGraph(p.id))!
    expect(g.todos.map((x) => [x.title, x.checklist.length])).toEqual([['Get Naya set up', 2]])

    const { project: foreign } = await createProject({ appId: otherApp, title: 'elsewhere', tasks: [{ title: 'x' }] })
    await expect(createTodo({ appId, title: 'x', projectId: foreign.id })).rejects.toThrow(/not in this app/)
    await db.update(project).set({ status: 'superseded' }).where(eq(project.id, foreign.id))
  })

  it('the agent drafts what the checklist is missing, told what is already there', async () => {
    const t = await createTodo({ appId, title: 'Get Naya set up', checklist: ['Call Naya'] })
    let seen = ''
    const out = await draftChecklist(t.id, { draft: async (prompt) => { seen = prompt; return [{ text: 'Install it on her laptop', waitingOn: '' }, { text: 'She accepts the invite', waitingOn: 'Naya' }] } })
    expect(seen).toContain('- Call Naya')
    expect(out.checklist.map((l) => [l.text, l.waitingOn])).toEqual([['Call Naya', null], ['Install it on her laptop', null], ['She accepts the invite', 'Naya']])
    await dropTodo(t.id, 'test')
  })

  it('Now lists open to-dos: what waits on a person first, then what only waits on someone else', async () => {
    const stalled = await createTodo({ appId, title: 'Distribution permission', checklist: [{ text: 'Apple reviews the request', waitingOn: 'Apple' }] })
    const mine = await createTodo({ appId, title: 'Confirm PostHog sees her', owner: 'agent', checklist: ['Find her anonymous id', 'Match sessions'] })
    await setChecklistItem(mine.checklist[0].id, { done: true })
    const rows = (await now(appId)).needsYou.filter((a) => a.kind === 'todo') as any[]
    const order = rows.map((r) => r.title)
    expect(order.indexOf('Confirm PostHog sees her')).toBeLessThan(order.indexOf('Distribution permission'))
    expect(rows.find((r) => r.todoId === mine.id)).toMatchObject({ owner: 'agent', done: 1, total: 2, next: 'Match sessions', waitingOn: [] })
    expect(rows.find((r) => r.todoId === stalled.id)).toMatchObject({ next: null, waitingOn: ['Apple'] })
    expect((await listTodos(appId)).map((t) => t.status)).toEqual(['open', 'open', 'open', 'done', 'dropped'])
  })
})
