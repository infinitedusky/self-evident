/**
 * Tasks from Linear tickets, against a stand-in for Linear (made-up tickets): what is listed, a ticket becoming a
 * task once, and a second import updating that task instead of making another.
 */
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, issue, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { importTickets, linearTickets, type FetchTickets, type LinearTicket } from './linear-import.js'

const ticket = (n: number, over: Partial<LinearTicket> = {}): LinearTicket => ({
  id: `lin-${n}`, identifier: `SHOP-${n}`, title: `Made-up ticket ${n}`, description: `What ticket ${n} asks for.`, url: `https://linear.app/made-up/issue/SHOP-${n}`,
  branchName: `sam/shop-${n}-made-up-ticket`, priority: 2, state: { name: 'Todo', type: 'unstarted' }, assignee: 'Sam Sample', mine: true, project: 'Checkout', ...over,
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('tasks from Linear tickets', () => {
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
    await expect(linearTickets(appId, 'mine', {}, fake)).rejects.toThrow("SHOP_LINEAR_KEY isn't set")
  })

  it('lists the team\'s tickets in the scope asked, none of them a task yet, without their descriptions', async () => {
    const { team, tickets: rows } = await linearTickets(appId, 'all', env, fake)
    expect(team).toBe('SHOP')
    expect(asked.at(-1)).toEqual({ scope: 'all' })
    expect(rows.map((t) => [t.identifier, t.task])).toEqual([['SHOP-1', null], ['SHOP-2', null], ['SHOP-3', null]])
    expect(rows[0]).not.toHaveProperty('description')
  })

  it('makes a task of each ticket named, in the order asked, and says which were not found', async () => {
    const r = await importTickets(appId, ['shop-2', 'SHOP-1', 'SHOP-99'], 'user', env, fake)
    expect(r.made.map((m) => m.linear)).toEqual(['SHOP-2', 'SHOP-1'])
    expect(r.updated).toEqual([])
    expect(r.missing).toEqual(['SHOP-99'])
    const rows = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.source, 'linear'))).orderBy(issue.number)
    expect(rows.map((x) => [x.title, x.state, x.priority])).toEqual([['Made-up ticket 2', 'todo', 2], ['Made-up ticket 1', 'todo', 2]]) // started there is still to do here
    expect(rows[1].description).toBe('From Linear SHOP-1: https://linear.app/made-up/issue/SHOP-1\n\nWhat ticket 1 asks for.')
    expect(rows[0].description).toBe('From Linear SHOP-2: https://linear.app/made-up/issue/SHOP-2')
    expect(rows[1].sourceRef).toEqual({ linear: { id: 'lin-1', identifier: 'SHOP-1', url: 'https://linear.app/made-up/issue/SHOP-1', branchName: 'sam/shop-1-made-up-ticket', project: 'Checkout' } })
  })

  it('shows a ticket brought in as the task it is, and bringing it in again updates that task', async () => {
    const listed = await linearTickets(appId, 'mine', env, fake)
    expect(listed.tickets.map((t) => !!t.task)).toEqual([true, true, false])
    tickets = [ticket(1, { title: 'Made-up ticket 1, reworded', priority: 1 }), tickets[1], tickets[2]]
    const r = await importTickets(appId, ['SHOP-1', 'SHOP-3'], 'user', env, fake)
    expect(r.made.map((m) => m.linear)).toEqual(['SHOP-3'])
    expect(r.updated.map((m) => [m.linear, m.title])).toEqual([['SHOP-1', 'Made-up ticket 1, reworded']])
    const rows = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.source, 'linear')))
    expect(rows).toHaveLength(3)
    expect(rows.find((x) => x.title.endsWith('reworded'))?.priority).toBe(1)
    await expect(importTickets(appId, [], 'user', env, fake)).rejects.toThrow('at least one')
  })
})
