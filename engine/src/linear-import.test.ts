/**
 * Linear tickets brought in, against a stand-in for Linear (made-up tickets): what is listed, a ticket becoming an
 * idea once, a second import updating that idea, the task its idea becomes naming the ticket, and a project's Add
 * tasks making a task.
 */
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, idea, issue, workspace } from './db/schema.js'
import { ticketOf } from './conventions.js'
import { convertIdea } from './work.js'
import { newId } from './ids.js'
import { importTickets, linearTickets, type FetchTickets, type LinearTicket } from './linear-import.js'

const ticket = (n: number, over: Partial<LinearTicket> = {}): LinearTicket => ({
  id: `lin-${n}`, identifier: `SHOP-${n}`, title: `Made-up ticket ${n}`, description: `What ticket ${n} asks for.`, url: `https://linear.app/made-up/issue/SHOP-${n}`,
  branchName: `sam/shop-${n}-made-up-ticket`, priority: 2, state: { name: 'Todo', type: 'unstarted' }, assignee: 'Sam Sample', mine: true, project: 'Checkout', ...over,
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('Linear tickets brought in', () => {
  const wsId = newId('workspace'), appId = newId('app'), bare = newId('app')
  const env = { SHOP_LINEAR_KEY: 'made-up-key' }
  let tickets = [ticket(1), ticket(2, { state: { name: 'In Progress', type: 'started' }, description: null }), ticket(3, { assignee: null, mine: false, project: null })]
  const asked: { scope?: string; identifiers?: string[] }[] = []
  const fake: FetchTickets = async (key, team, opts) => {
    expect([key, team]).toEqual(['made-up-key', 'SHOP'])
    asked.push(opts)
    return opts.identifiers ? tickets.filter((t) => opts.identifiers!.includes(t.identifier)) : tickets
  }
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'linear import test' })
    await db.insert(app).values([
      { id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase(), setup: { integrations: { linear: { team: 'shop', key_env: 'SHOP_LINEAR_KEY' } } } },
      { id: bare, workspaceId: wsId, name: 'Blog', key: bare.slice(-6).toUpperCase() },
    ])
  })
  afterAll(async () => { await pool.end() })

  it('says what is missing: Linear not set for the app, or the key not in the environment', async () => {
    await expect(linearTickets(bare, 'mine', env, fake)).rejects.toThrow("Linear isn't set for Blog")
    await expect(linearTickets(appId, 'mine', {}, fake)).rejects.toThrow("SHOP_LINEAR_KEY has no key")
  })

  it('lists the team\'s tickets in the scope asked, none of them here yet, without their descriptions', async () => {
    const { team, tickets: rows } = await linearTickets(appId, 'all', env, fake)
    expect(team).toBe('SHOP')
    expect(asked.at(-1)).toEqual({ scope: 'all' })
    expect(rows.map((t) => [t.identifier, t.task, t.idea])).toEqual([['SHOP-1', null, null], ['SHOP-2', null, null], ['SHOP-3', null, null]])
    expect(rows[0]).not.toHaveProperty('description')
  })

  it('makes an idea of each ticket named, in the order asked, and says which were not found', async () => {
    const r = await importTickets(appId, ['shop-2', 'SHOP-1', 'SHOP-99'], 'user', env, fake)
    expect(r.made.map((m) => [m.kind, m.linear])).toEqual([['idea', 'SHOP-2'], ['idea', 'SHOP-1']])
    expect(r.updated).toEqual([])
    expect(r.missing).toEqual(['SHOP-99'])
    expect(await db.select().from(issue).where(eq(issue.appId, appId))).toEqual([]) // no task: what it becomes is decided on the idea
    const rows = await db.select().from(idea).where(and(eq(idea.appId, appId), eq(idea.source, 'linear'))).orderBy(idea.number)
    expect(rows.map((x) => [x.title, x.lane])).toEqual([['Made-up ticket 2', 'inbox'], ['Made-up ticket 1', 'inbox']])
    expect(rows[1].body).toBe('From Linear SHOP-1: https://linear.app/made-up/issue/SHOP-1\n\nWhat ticket 1 asks for.')
    expect(rows[0].body).toBe('From Linear SHOP-2: https://linear.app/made-up/issue/SHOP-2')
    expect(rows[1].sourceRef).toEqual({ linear: { id: 'lin-1', identifier: 'SHOP-1', url: 'https://linear.app/made-up/issue/SHOP-1', branchName: 'sam/shop-1-made-up-ticket', project: 'Checkout' } })
  })

  it('shows a ticket brought in as the idea it is, and bringing it in again updates that idea', async () => {
    const listed = await linearTickets(appId, 'mine', env, fake)
    expect(listed.tickets.map((t) => [!!t.idea, t.task])).toEqual([[true, null], [true, null], [false, null]])
    tickets = [ticket(1, { title: 'Made-up ticket 1, reworded', priority: 1 }), tickets[1], tickets[2]]
    const r = await importTickets(appId, ['SHOP-1', 'SHOP-3'], 'user', env, fake)
    expect(r.made.map((m) => m.linear)).toEqual(['SHOP-3'])
    expect(r.updated.map((m) => [m.kind, m.linear, m.title])).toEqual([['idea', 'SHOP-1', 'Made-up ticket 1, reworded']])
    expect(await db.select().from(idea).where(and(eq(idea.appId, appId), eq(idea.source, 'linear')))).toHaveLength(3)
    await expect(importTickets(appId, [], 'user', env, fake)).rejects.toThrow('at least one')
  })

  it('an idea from a ticket, converted, makes a task that names the ticket; the ticket is then that task, left as it is', async () => {
    const [one] = await db.select().from(idea).where(and(eq(idea.appId, appId), sql`${idea.sourceRef}->'linear'->>'identifier' = 'SHOP-1'`))
    const out = await convertIdea(one.id, 'project')
    const [made] = await db.select().from(issue).where(eq(issue.id, out.issueId))
    expect((made.sourceRef as { linear: { identifier: string } }).linear.identifier).toBe('SHOP-1')
    expect(ticketOf({ identifier: 'X-1', sourceRef: made.sourceRef })).toBe('SHOP-1')
    const listed = await linearTickets(appId, 'all', env, fake)
    expect(listed.tickets.find((t) => t.identifier === 'SHOP-1')?.task?.id).toBe(made.id)
    await db.update(issue).set({ title: 'Its part of the project' }).where(eq(issue.id, made.id))
    const again = await importTickets(appId, ['SHOP-1'], 'user', env, fake)
    expect([again.made, again.updated]).toEqual([[], []])
    expect((await db.select().from(issue).where(eq(issue.id, made.id)))[0].title).toBe('Its part of the project')
  })

  it('from a project\'s Add tasks, a ticket becomes a task, and bringing it in again updates that task', async () => {
    const r = await importTickets(appId, ['SHOP-2'], 'user', env, fake, 'task')
    expect(r.made.map((m) => [m.kind, m.linear])).toEqual([['task', 'SHOP-2']])
    const [row] = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.source, 'linear')))
    expect([row.title, row.state, row.priority]).toEqual(['Made-up ticket 2', 'todo', 2]) // started there is still to do here
    tickets = [tickets[0], ticket(2, { title: 'Made-up ticket 2, reworded', priority: 1, state: { name: 'In Progress', type: 'started' } }), tickets[2]]
    const again = await importTickets(appId, ['SHOP-2'], 'user', env, fake, 'task')
    expect(again.updated.map((m) => [m.kind, m.title])).toEqual([['task', 'Made-up ticket 2, reworded']])
    expect((await db.select().from(issue).where(eq(issue.id, row.id)))[0].priority).toBe(1)
  })
})
