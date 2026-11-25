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
import { insertIssues } from './issues.js'
import { originOf, originPrompt } from './origins.js'
import { prompt as plannerPrompt } from './planner.js'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { keepSecret } from './secrets.js'

const ticket = (n: number, over: Partial<LinearTicket> = {}): LinearTicket => ({
  id: `lin-${n}`, identifier: `SHOP-${n}`, title: `Made-up ticket ${n}`, description: `What ticket ${n} asks for.`, url: `https://linear.app/made-up/issue/SHOP-${n}`,
  branchName: `sam/shop-${n}-made-up-ticket`, priority: 2, state: { name: 'Todo', type: 'unstarted' }, assignee: 'Sam Sample', mine: true, project: 'Checkout', ...over,
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('Linear tickets brought in', () => {
  const wsId = newId('workspace'), appId = newId('app'), bare = newId('app')
  const env = { SHOP_LINEAR_KEY: 'made-up-key' }
  const rich = (over: Partial<LinearTicket> = {}) => ticket(1, {
    description: 'What ticket 1 asks for.\n\n![the screen](https://uploads.linear.app/made-up/screen.png)\n\nAnd one more line.',
    comments: [{ author: 'Made-up Teammate', at: '2026-11-02T10:00:00Z', body: 'Also on mobile, see https://uploads.linear.app/made-up/gone.png' }, { author: 'Sam Sample', at: '2026-11-01T09:00:00Z', body: 'Keep the old button.' }].sort((x, y) => x.at.localeCompare(y.at)),
    links: [{ title: 'Design (made up)', url: 'https://example.com/design' }], ...over })
  let tickets = [rich(), ticket(2, { state: { name: 'In Progress', type: 'started' }, description: null }), ticket(3, { assignee: null, mine: false, project: null })]
  const asked: { scope?: string; identifiers?: string[] }[] = []
  const fake: FetchTickets = async (key, team, opts) => {
    expect([key, team]).toEqual(['made-up-key', 'SHOP'])
    asked.push(opts)
    return opts.identifiers ? tickets.filter((t) => opts.identifiers!.includes(t.identifier)).map((t) => ({ comments: [], links: [], ...t })) : tickets
  }
  // Linear's uploads, made up: one image that comes, one that is refused.
  const fetched: { url: string; auth: string | null }[] = []
  const getFile = (async (url: string, init?: { headers?: Record<string, string> }) => {
    fetched.push({ url, auth: init?.headers?.Authorization ?? null })
    return url.endsWith('/gone.png') ? new Response('no', { status: 404, statusText: 'Not Found' }) : new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  }) as unknown as typeof fetch
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

  it('told no keys, reads the ones kept for the app: a key pasted under Settings is found wherever a ticket is read', async () => {
    const home = process.env.SECRETS_HOME, was = process.env.SHOP_LINEAR_KEY
    process.env.SECRETS_HOME = mkdtempSync(join(tmpdir(), 'se-linear-keys-')); delete process.env.SHOP_LINEAR_KEY
    try {
      await expect(linearTickets(appId, 'mine', undefined, fake)).rejects.toThrow("SHOP_LINEAR_KEY has no key")
      const [a] = await db.select().from(app).where(eq(app.id, appId))
      await keepSecret('SHOP_LINEAR_KEY', 'made-up-key', a.key)
      await expect(linearTickets(appId, 'mine', undefined, fake)).resolves.toMatchObject({ team: 'SHOP' })
    } finally { if (home === undefined) delete process.env.SECRETS_HOME; else process.env.SECRETS_HOME = home; if (was !== undefined) process.env.SHOP_LINEAR_KEY = was }
  })

  it('lists the team\'s tickets in the scope asked, none of them here yet, without their descriptions', async () => {
    const { team, tickets: rows } = await linearTickets(appId, 'all', env, fake)
    expect(team).toBe('SHOP')
    expect(asked.at(-1)).toEqual({ scope: 'all' })
    expect(rows.map((t) => [t.identifier, t.task, t.idea])).toEqual([['SHOP-1', null, null], ['SHOP-2', null, null], ['SHOP-3', null, null]])
    expect(rows[0]).not.toHaveProperty('description')
  })

  it('makes an idea of each ticket named, in the order asked, and says which were not found', async () => {
    const r = await importTickets(appId, ['shop-2', 'SHOP-1', 'SHOP-99'], 'user', env, fake, 'idea', getFile)
    expect(r.made.map((m) => [m.kind, m.linear])).toEqual([['idea', 'SHOP-2'], ['idea', 'SHOP-1']])
    expect(r.updated).toEqual([])
    expect(r.missing).toEqual(['SHOP-99'])
    expect(await db.select().from(issue).where(eq(issue.appId, appId))).toEqual([]) // no task: what it becomes is decided on the idea
    const rows = await db.select().from(idea).where(and(eq(idea.appId, appId), eq(idea.source, 'linear'))).orderBy(idea.number)
    expect(rows.map((x) => [x.title, x.lane])).toEqual([['Made-up ticket 2', 'inbox'], ['Made-up ticket 1', 'inbox']])
    expect(rows[1].body).toBe('From Linear SHOP-1: https://linear.app/made-up/issue/SHOP-1\n\n' + rich().description)
    expect(rows[0].body).toBe('From Linear SHOP-2: https://linear.app/made-up/issue/SHOP-2')
    expect(rows[1].sourceRef).toEqual({ linear: { id: 'lin-1', identifier: 'SHOP-1', url: 'https://linear.app/made-up/issue/SHOP-1', branchName: 'sam/shop-1-made-up-ticket', project: 'Checkout' } })
  })

  it('shows a ticket brought in as the idea it is, and bringing it in again updates that idea', async () => {
    const listed = await linearTickets(appId, 'mine', env, fake)
    expect(listed.tickets.map((t) => [!!t.idea, t.task])).toEqual([[true, null], [true, null], [false, null]])
    tickets = [rich({ title: 'Made-up ticket 1, reworded', priority: 1 }), tickets[1], tickets[2]]
    const r = await importTickets(appId, ['SHOP-1', 'SHOP-3'], 'user', env, fake, 'idea', getFile)
    expect(r.made.map((m) => m.linear)).toEqual(['SHOP-3'])
    expect(r.updated.map((m) => [m.kind, m.linear, m.title])).toEqual([['idea', 'SHOP-1', 'Made-up ticket 1, reworded']])
    expect(await db.select().from(idea).where(and(eq(idea.appId, appId), eq(idea.source, 'linear')))).toHaveLength(3)
    await expect(importTickets(appId, [], 'user', env, fake)).rejects.toThrow('at least one')
  })

  it('keeps each ticket whole as its origin: text, comments oldest first, links, and its images fetched with the key', async () => {
    const [one] = await db.select().from(idea).where(and(eq(idea.appId, appId), sql`${idea.sourceRef}->'linear'->>'identifier' = 'SHOP-1'`))
    const o = (await originOf({ ideaId: one.id }))!
    expect([o.source, o.ref, o.title, o.body]).toEqual(['linear', 'SHOP-1', 'Made-up ticket 1, reworded', rich().description])
    expect(o.comments.map((c) => c.author)).toEqual(['Sam Sample', 'Made-up Teammate'])
    expect(o.links).toEqual([{ title: 'Design (made up)', url: 'https://example.com/design' }])
    expect(o.files.map((f) => [f.url, !!f.path, f.note ?? null])).toEqual([['https://uploads.linear.app/made-up/screen.png', true, null], ['https://uploads.linear.app/made-up/gone.png', false, '404 Not Found']])
    expect(existsSync(o.files[0].path!) && readFileSync(o.files[0].path!).length).toBe(4)
    expect(fetched.every((f) => f.auth === 'made-up-key')).toBe(true)
    expect(fetched.some((f) => f.url.includes('example.com'))).toBe(false) // only Linear's own uploads are fetched
    const told = originPrompt(o)
    for (const words of ['Linear SHOP-1, word for word', 'What ticket 1 asks for.', 'And one more line.', 'Keep the old button.', '**Made-up Teammate**', 'Design (made up): https://example.com/design', `kept at ${o.files[0].path}`, 'could not be fetched (404 Not Found)', 'Never quietly drop']) expect(told).toContain(words)
  })

  it('an idea from a ticket, converted, makes a task that names the ticket; the ticket is then that task, left as it is', async () => {
    const [one] = await db.select().from(idea).where(and(eq(idea.appId, appId), sql`${idea.sourceRef}->'linear'->>'identifier' = 'SHOP-1'`))
    const out = await convertIdea(one.id, 'project')
    const [made] = await db.select().from(issue).where(eq(issue.id, out.issueId))
    // Every task of the project has the whole ticket: the first, one its agent adds, and their sub-tasks; and the planner is given it.
    const [added] = await db.transaction((tx) => insertIssues(tx, appId, [{ title: 'Another part (made up)', projectId: out.projectId! }], 'agent'))
    const [sub] = await db.transaction((tx) => insertIssues(tx, appId, [{ title: 'A sub-task (made up)', parentId: added.id }], 'planner'))
    for (const id of [made.id, added.id, sub.id]) expect((await originOf({ issueId: id }))?.ref).toBe('SHOP-1')
    const planner = plannerPrompt({ repoPath: '/x', issue: { identifier: 'X-2', title: added.title, brief: 'Only the other part.' }, origin: originPrompt(await originOf({ issueId: added.id })), project: { name: 'P', content: null }, earlier: [] } as never)
    expect(planner).toContain('Keep the old button.')
    expect((made.sourceRef as { linear: { identifier: string } }).linear.identifier).toBe('SHOP-1')
    expect(ticketOf({ identifier: 'X-1', sourceRef: made.sourceRef })).toBe('SHOP-1')
    const listed = await linearTickets(appId, 'all', env, fake)
    expect(listed.tickets.find((t) => t.identifier === 'SHOP-1')?.task?.id).toBe(made.id)
    await db.update(issue).set({ title: 'Its part of the project' }).where(eq(issue.id, made.id))
    tickets = [rich({ comments: [...rich().comments!, { author: 'Sam Sample', at: '2026-11-03T09:00:00Z', body: 'One more thing, said later.' }] }), tickets[1], tickets[2]]
    const again = await importTickets(appId, ['SHOP-1'], 'user', env, fake, 'idea', getFile)
    expect([again.made, again.updated]).toEqual([[], []])
    expect((await db.select().from(issue).where(eq(issue.id, made.id)))[0].title).toBe('Its part of the project')
    expect((await originOf({ issueId: sub.id }))?.comments.at(-1)?.body).toBe('One more thing, said later.') // the ticket itself is brought up to date, whatever became of it here
  })

  it('from a project\'s Add tasks, a ticket becomes a task, and bringing it in again updates that task', async () => {
    const r = await importTickets(appId, ['SHOP-2'], 'user', env, fake, 'task', getFile)
    expect(r.made.map((m) => [m.kind, m.linear])).toEqual([['task', 'SHOP-2']])
    const [row] = await db.select().from(issue).where(and(eq(issue.appId, appId), eq(issue.source, 'linear')))
    expect([row.title, row.state, row.priority]).toEqual(['Made-up ticket 2', 'todo', 2]) // started there is still to do here
    tickets = [tickets[0], ticket(2, { title: 'Made-up ticket 2, reworded', priority: 1, state: { name: 'In Progress', type: 'started' } }), tickets[2]]
    const again = await importTickets(appId, ['SHOP-2'], 'user', env, fake, 'task', getFile)
    expect((await originOf({ issueId: row.id }))?.ref).toBe('SHOP-2')
    expect(again.updated.map((m) => [m.kind, m.title])).toEqual([['task', 'Made-up ticket 2, reworded']])
    expect((await db.select().from(issue).where(eq(issue.id, row.id)))[0].priority).toBe(1)
  })
})
