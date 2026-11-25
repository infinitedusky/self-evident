/** A task's team ticket: where it is read from, in what order, and how it is set. Made-up tickets (sample). */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, contextDoc, idea, issue, project, ticket, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { issueDetail, createProject } from './projects.js'
import { keepOrigin } from './origins.js'
import { needsTicket, setTeamNames, teamTicket, ticketIn, projectTickets, ticketOf, ticketOfTask, ticketRequired, ticketsOf } from './ticket.js'

describe('a team ticket', () => {
  it('is read from a link to it, never from a bare mention', () => {
    expect(ticketIn('See https://linear.app/sample-co/issue/ent-322/bring-the-fields (sample)')).toBe('ENT-322')
    expect(ticketIn('[ENT-322 Bring the fields](<https://linear.app/sample-co/issue/ENT-322/bring>)')).toBe('ENT-322')
    expect(ticketIn('A copy of ENT-322, like ALL-40841 before it')).toBeNull()
    expect(ticketIn(null)).toBeNull()
  })
  it('is what was set, else the ticket it was imported from, else a link in its text, else one in the idea it came from', () => {
    const link = 'https://linear.app/sample-co/issue/ENT-9/x'
    expect(ticketOfTask({ teamTicket: 'ENT-1', sourceRef: { linear: { identifier: 'ENT-2' } }, description: link })).toEqual({ ticket: 'ENT-1', from: 'set' })
    expect(ticketOfTask({ sourceRef: { linear: { identifier: 'ENT-2' } }, description: link })).toEqual({ ticket: 'ENT-2', from: 'import' })
    expect(ticketOfTask({ sourceRef: { sessionId: 's' }, description: link })).toEqual({ ticket: 'ENT-9', from: 'link' })
    expect(ticketOfTask({ brief: `Why: ${link}` })).toEqual({ ticket: 'ENT-9', from: 'link' })
    expect(ticketOfTask({ description: 'no link' }, `From the idea: ${link}`)).toEqual({ ticket: 'ENT-9', from: 'idea' })
    expect(ticketOfTask({ description: 'no link' })).toBeNull()
    expect(ticketRequired({ ticket_required: true })).toBe(true); expect(ticketRequired({})).toBe(false); expect(ticketRequired(null)).toBe(false)
    expect(needsTicket('SS-9', 'its branch is named by it')).toMatch(/^SS-9 has no team ticket, and this app requires one/)
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
describe.skipIf(!reachable)('a task\'s team ticket and its name for the team', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'ticket test (sample)' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase(), setup: { ticket_required: true } })
  })
  afterAll(async () => { await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId)); await pool.end() })

  it('is set and cleared by its key, shown on the task with where it was read from, and missing is said when the app requires one', async () => {
    const { issues: [t] } = await createProject({ appId, name: 'Tickets (sample)', issues: [{ title: 'Third build: brand fields (sample)', brief: 'Build it.' }] })
    expect(await issueDetail(t.id)).toMatchObject({ ticket: null, ticketFrom: null, ticketMissing: true })
    await expect(setTeamNames(t.id, { ticket: 'not a ticket' })).rejects.toThrow(/its key, like ENT-322/)
    expect(await setTeamNames(t.id, { ticket: ' ent-322 ', title: '  Brand fields from the   employee scan (sample) ' })).toMatchObject({ teamTicket: 'ENT-322', teamTitle: 'Brand fields from the employee scan (sample)', ticket: 'ENT-322', ticketFrom: 'set' })
    expect(await issueDetail(t.id)).toMatchObject({ ticket: 'ENT-322', ticketFrom: 'set', ticketMissing: false, teamTitle: 'Brand fields from the employee scan (sample)' })
    // Cleared: a link in the description is read; and with none, the idea it came from.
    await setTeamNames(t.id, { ticket: '' })
    await db.update(issue).set({ description: 'Why: https://linear.app/sample-co/issue/ENT-400/x (sample)' }).where(eq(issue.id, t.id))
    expect(await issueDetail(t.id)).toMatchObject({ ticket: 'ENT-400', ticketFrom: 'link' })
    const ideaId = newId('idea')
    await db.insert(idea).values({ id: ideaId, appId, number: 1, title: 'Brand fields (sample)', body: 'From https://linear.app/sample-co/issue/ENT-500/y (sample)', source: 'person' })
    await db.update(issue).set({ description: 'no link', ideaId }).where(eq(issue.id, t.id))
    expect(await teamTicket((await db.select().from(issue).where(eq(issue.id, t.id)))[0])).toEqual({ ticket: 'ENT-500', from: 'idea' })
  })

  it('is a record several tasks are under: one ticket, a task per pull request, done when they all are', async () => {
    const { issues: [one, two, three, other] } = await createProject({ appId, name: 'Executive protection (sample)', issues: [
      { title: 'The group stored, with add and remove (sample)', brief: 'Build it.' },
      { title: 'Add and remove on the employee record (sample)', brief: 'Build it.' },
      { title: 'Badge, filter and row menu (sample)', brief: 'Build it.', description: 'For https://linear.app/sample-co/issue/ENT-323/protected (sample)' },
      { title: 'Takedowns (sample)', brief: 'Build it.' },
    ] })
    // Two linked by hand, the second in lower case, and a third read from a link: one record, three tasks.
    await setTeamNames(one.id, { ticket: 'ENT-323' })
    await setTeamNames(two.id, { ticket: 'ent-323', title: 'On the employee record (sample)' })
    expect(await db.select().from(ticket).where(eq(ticket.appId, appId)).then((r) => r.filter((x) => x.key === 'ENT-323'))).toHaveLength(1)
    const [a, b] = await db.select().from(issue).where(eq(issue.projectId, one.projectId!)).then((r) => r.filter((x) => [one.id, two.id].includes(x.id)))
    expect(a.ticketId).toBeTruthy(); expect(a.ticketId).toBe(b.ticketId)
    let g = await ticketOf(appId, 'ent-323')
    expect(g).toMatchObject({ key: 'ENT-323', title: null, read: false, done: 0, total: 3, finished: false })
    expect(g.tasks.map((t) => [t.id, t.from, t.teamTitle])).toEqual([[one.id, 'set', null], [two.id, 'set', 'On the employee record (sample)'], [three.id, 'link', null]])
    expect(g.tasks[0].project).toMatchObject({ name: 'Executive protection (sample)' })
    expect(g.tasks.some((t) => t.id === other.id)).toBe(false)
    // Read from its tracker: the same record gains its title and link; nothing about its tasks changes.
    await keepOrigin(db, appId, { source: 'linear', ref: 'ENT-323', url: 'https://linear.app/sample-co/issue/ENT-323/protected', title: 'Protected people (sample)', body: 'Made up.' })
    g = await ticketOf(appId, 'ENT-323')
    expect(g).toMatchObject({ title: 'Protected people (sample)', url: 'https://linear.app/sample-co/issue/ENT-323/protected', source: 'linear', read: true, total: 3 })
    expect((await db.select().from(issue).where(eq(issue.id, one.id)))[0].ticketId).toBe(a.ticketId)
    // A dropped task is listed and not counted; the ticket is done when the rest are.
    await db.update(issue).set({ state: 'done' }).where(eq(issue.id, one.id)); await db.update(issue).set({ state: 'done' }).where(eq(issue.id, two.id))
    expect(await ticketOf(appId, 'ENT-323')).toMatchObject({ done: 2, total: 3, finished: false })
    await db.update(issue).set({ state: 'canceled', reason: 'folded into the first (sample)' }).where(eq(issue.id, three.id))
    g = await ticketOf(appId, 'ENT-323')
    expect(g).toMatchObject({ done: 2, total: 2, finished: true }); expect(g.tasks).toHaveLength(3)
    // Unlinked, a task leaves the ticket; the record stays. A ticket still being worked comes before a finished one.
    await setTeamNames(two.id, { ticket: '' })
    expect((await ticketOf(appId, 'ENT-323')).tasks.map((t) => t.id)).toEqual([one.id, three.id])
    await setTeamNames(other.id, { ticket: 'ENT-900' }, async () => { throw new Error('the tracker is not set (sample)') }) // it can't be read: the link stands with its key alone
    const all = await ticketsOf(appId)
    expect(all.findIndex((x) => x.key === 'ENT-900')).toBeLessThan(all.findIndex((x) => x.key === 'ENT-323'))
    await expect(ticketOf(appId, 'ENT-1')).rejects.toThrow(/no ticket ENT-1 here/)
    await expect(setTeamNames((await db.select().from(issue).where(eq(issue.parentId, one.id)))[0]?.id ?? 'iss_none', { ticket: 'ENT-323' })).rejects.toThrow(/no task|not a sub-task/)
  })

  it('a task can be under more than one ticket: the first names its branch, the rest only place it', async () => {
    const { issues: [both, one] } = await createProject({ appId, name: 'Two tickets (sample)', issues: [{ title: 'Shared list screen (sample)', brief: 'Build it.' }, { title: 'Detail screen (sample)', brief: 'Build it.' }] })
    await setTeamNames(both.id, { ticket: 'ENT-610', also: ['ent-611', 'ENT-610', ' ENT-612 '] })
    await setTeamNames(one.id, { ticket: 'ENT-611' })
    expect(await issueDetail(both.id)).toMatchObject({ ticket: 'ENT-610', ticketFrom: 'set', alsoTickets: ['ENT-611', 'ENT-612'] }) // its first ticket is not one of the rest
    expect((await ticketOf(appId, 'ENT-611')).tasks.map((t) => [t.id, t.from])).toEqual([[both.id, 'also'], [one.id, 'set']])
    expect((await ticketOf(appId, 'ENT-610')).tasks.map((t) => [t.id, t.from])).toEqual([[both.id, 'set']])
    await expect(setTeamNames(both.id, { also: ['nope'] })).rejects.toThrow(/its key, like ENT-322/)
    // One of the rest made the first: it is no longer among the rest. The list replaced: what is left out goes.
    await setTeamNames(both.id, { ticket: 'ENT-612' })
    expect(await issueDetail(both.id)).toMatchObject({ ticket: 'ENT-612', alsoTickets: ['ENT-611'] })
    await setTeamNames(both.id, { also: [] })
    expect(await issueDetail(both.id)).toMatchObject({ ticket: 'ENT-612', alsoTickets: [] })
    expect((await ticketOf(appId, 'ENT-611')).tasks.map((t) => t.id)).toEqual([one.id])
  })

  it('a project\'s tickets are the ones in its Context and the ones its tasks are under, the unplanned first', async () => {
    const { project: p, issues: [t] } = await createProject({ appId, name: 'Its tickets (sample)', issues: [{ title: 'Authorization form (sample)', brief: 'Build it.' }] })
    const planned = await keepOrigin(db, appId, { source: 'linear', ref: 'ENT-701', title: 'Executive authorization (sample)', body: 'Made up.' })
    const waiting = await keepOrigin(db, appId, { source: 'linear', ref: 'ENT-702', title: 'Deepfake checks (sample)', body: 'Made up.' })
    await keepOrigin(db, appId, { source: 'linear', ref: 'ENT-703', title: 'Another project\'s (sample)', body: 'Made up.' })
    for (const o of [planned, waiting]) await db.insert(contextDoc).values({ id: `cdoc_${o.id.slice(-10)}`, appId, projectId: p.id, kind: 'ticket', originId: o.id, title: o.title, createdBy: 'user' })
    await setTeamNames(t.id, { ticket: 'ENT-701', also: ['ENT-704'] })
    const got = await projectTickets(p.id)
    expect(got.map((g) => [g.key, g.inContext, g.here, g.tasks.length])).toEqual([['ENT-702', true, 0, 0], ['ENT-701', true, 1, 1], ['ENT-704', false, 1, 1]])
    await expect(projectTickets('proj_nope')).rejects.toThrow(/no project proj_nope/)
  })
})
