/** Reports on an app's work over a period: the facts gathered, the prompt, the draft kept. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { changeState, commentOnIssue, createIssue } from './issues.js'
import { editReport, getReport, listReports, periodOf, prompt, reportFacts, setReportFormat, writeReport } from './reports.js'

describe('a report\'s period and prompt', () => {
  it('names the periods in this computer\'s days: today so far, yesterday, the week from Monday, last week', () => {
    const now = new Date(2026, 10, 13, 17, 30) // a Friday
    expect(periodOf('today', now)).toMatchObject({ kind: 'daily', label: 'Today, Nov 13', from: new Date(2026, 10, 13), to: now })
    expect(periodOf('yesterday', now)).toMatchObject({ kind: 'daily', label: 'Yesterday, Nov 12', from: new Date(2026, 10, 12), to: new Date(2026, 10, 13) })
    expect(periodOf('this_week', now)).toMatchObject({ kind: 'weekly', label: 'Week of Nov 9', from: new Date(2026, 10, 9), to: now })
    expect(periodOf('last_week', now)).toMatchObject({ kind: 'weekly', label: 'Week of Nov 2', from: new Date(2026, 10, 2), to: new Date(2026, 10, 9) })
  })
  it('asks for outcomes in the reader\'s words, from the facts only, and lets the person\'s own format win', () => {
    const p = prompt('daily', 'Today, Nov 13', { app: 'Shop' }, 'Today:\n- Merged #1 (sample)\n\nTomorrow:\n- Continue (sample)')
    expect(p).toMatch(/end-of-day note for the work on Shop/); expect(p).toMatch(/Never invent a ticket/); expect(p).toMatch(/Do not mention agents or the tool/)
    expect(p).toMatch(/Their shape, section names, tone and level of detail win[\s\S]*<format>\nToday:\n- Merged #1 \(sample\)/)
    expect(prompt('weekly', 'Week of Nov 9', { app: 'Shop' })).toMatch(/"Where it stands"[\s\S]*"Open decisions and risks"/)
    expect(prompt('weekly', 'Week of Nov 9', { app: 'Shop' })).not.toContain('<format>')
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a report on an app (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let taskId: string
  const from = new Date(Date.now() - 3600_000), to = new Date(Date.now() + 60_000)
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'reports test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    taskId = (await createIssue(appId, { title: 'Export orders (sample)', kind: 'code', description: 'People can download their orders (sample).', sourceRef: { linear: { identifier: 'SHOP-12', url: 'https://linear.example/SHOP-12' } } })).id
    await changeState(taskId, 'in_progress')
    await commentOnIssue(taskId, { body: 'Review\n\nLooks right; one nit on naming (sample).' }, 'user')
    await db.insert(event).values({ workspaceId: wsId, appId, issueId: taskId, actor: 'engine', type: 'talk.message', payload: { body: 'chatter that is not work' } })
  })
  afterAll(async () => { await pool.end() })

  it('gathers what moved on each task in the period, by the team\'s own ticket id, with what is in progress for tomorrow', async () => {
    const { facts } = await reportFacts(appId, from, to, { me: async () => 'sam', notes: 'Met with Em about the export (sample)' })
    expect(facts.tasks).toHaveLength(1)
    expect(facts.tasks[0]).toMatchObject({ ticket: 'SHOP-12', title: 'Export orders (sample)', state: 'in_progress', about: 'People can download their orders (sample).' })
    expect(facts.tasks[0].happened.join('\n')).toMatch(/issue\.state · todo → in_progress/); expect(facts.tasks[0].happened.join('\n')).not.toContain('talk.message')
    expect(facts.tasks[0].written).toMatchObject([{ heading: 'Review' }])
    expect(facts.next.inProgress).toMatchObject([{ ticket: 'SHOP-12' }])
    expect(facts.fromThePerson).toBe('Met with Em about the export (sample)')
    expect((await reportFacts(appId, new Date(+from - 7200_000), from, { me: async () => 'sam' })).facts.tasks).toEqual([]) // nothing before the period
  })

  it('writes a draft in the person\'s format, keeps what it was written from, and the person can reword it', async () => {
    await setReportFormat(appId, { daily: 'Today:\n- (sample shape)\n\nTomorrow:\n- (sample shape)' })
    let asked = ''
    const r = await writeReport(appId, { from: from.toISOString(), to: to.toISOString(), kind: 'daily', notes: 'Met with Em (sample)', me: async () => 'sam', write: async (p) => { asked = p; return { text: 'Today:\n- Started SHOP-12 (sample)', costUsd: 0.01 } } })
    expect(asked).toContain('(sample shape)'); expect(asked).toContain('SHOP-12'); expect(asked).toContain('Met with Em (sample)')
    expect(r).toMatchObject({ kind: 'daily', body: 'Today:\n- Started SHOP-12 (sample)', notes: 'Met with Em (sample)' }); expect(r).not.toHaveProperty('facts')
    expect((await getReport(r.id)).facts).toMatchObject({ app: 'Shop' })
    expect((await editReport(r.id, 'Today:\n- Started the export, SHOP-12 (sample)')).editedAt).toBeTruthy()
    const list = await listReports(appId)
    expect(list.reports).toHaveLength(1); expect(list.format.daily).toContain('(sample shape)'); expect(list.writing).toBe(false)
    await expect(writeReport(appId, {})).rejects.toThrow(/say which period/)
  })
})
