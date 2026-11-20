/** A task's team ticket: where it is read from, in what order, and how it is set. Made-up tickets (sample). */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, idea, issue, project, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { issueDetail, createProject } from './projects.js'
import { needsTicket, setTeamNames, teamTicket, ticketIn, ticketOfTask, ticketRequired } from './ticket.js'

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
})
