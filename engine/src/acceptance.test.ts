/** A task's acceptance criteria: built one at a time, approved with the brief, and a change to what was approved asks again. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, issue, workspace } from './db/schema.js'
import { acceptanceLines, applyAcceptance, setAcceptance, type Criterion } from './acceptance.js'
import { newId } from './ids.js'
import { createIssue, updateIssue } from './issues.js'
import { prompt } from './planner.js'
import { checkBrief, finalizeBrief } from './checks.js'
import { approveBrief } from './work.js'

describe('acceptance criteria, as a list', () => {
  const at = new Date('2026-11-13T10:00:00Z')
  it('adds, sharpens, records what the prototype showed and removes; only a change to what is approved counts as a change', () => {
    const a = applyAcceptance([], { add: [{ text: '  A returning customer pays\n in one tap (sample) ', check: 'the returning-customer scenario' }, { text: 'Running it twice makes no duplicates (sample)' }, { text: 'a returning customer pays in one tap (sample)' }] }, 'agent', at)
    expect(a.changed).toBe(true)
    expect(a.list.map((c) => [c.text, c.check])).toEqual([['A returning customer pays in one tap (sample)', 'the returning-customer scenario'], ['Running it twice makes no duplicates (sample)', undefined]]) // the same one said twice is kept once
    const [one, two] = a.list
    const shown = applyAcceptance(a.list, { update: [{ id: one.id, shown: true, evidence: '/checkout as Ada (sample)' }, { id: two.id, shown: false, evidence: 'the second run adds a row' }] }, 'agent', at)
    expect(shown.changed).toBe(false) // what the prototype showed is not what the person approves
    expect(shown.list.map((c) => c.shown)).toEqual([true, false])
    const sharper = applyAcceptance(shown.list, { update: [{ id: two.id, check: 'scripts/twice.sh prints 0 new rows' }], remove: [one.id] }, 'user', at)
    expect(sharper.changed).toBe(true)
    expect(sharper.list).toHaveLength(1)
    expect(acceptanceLines(sharper.list)).toBe(`- [${two.id}] Running it twice makes no duplicates (sample) (how we will know: scripts/twice.sh prints 0 new rows) · NOT shown in the prototype: the second run adds a row`)
    const left = applyAcceptance(sharper.list, { update: [{ id: two.id, buildOnly: true, why: 'only real traffic shows it (sample)' }], add: [{ text: 'Final copy is reviewed (sample)', buildOnly: true }] }, 'agent', at)
    expect(left.list.map((c) => [c.buildOnly, c.why])).toEqual([[true, 'only real traffic shows it (sample)'], [true, undefined]])
    expect(acceptanceLines(left.list)).toContain('· FINAL BUILD ONLY, the prototype skips it: only real traffic shows it (sample)')
    expect(applyAcceptance(sharper.list, { update: [{ id: two.id, buildOnly: true }] }, 'agent', at).changed).toBe(false) // which half proves it is not what the person approved
    expect(applyAcceptance(left.list, { update: [{ id: two.id, buildOnly: false }] }, 'user', at).list[0]).not.toHaveProperty('why')
    const built = applyAcceptance(left.list, { update: [{ id: two.id, built: true, builtEvidence: 'twice.test.ts passes (sample)' }] }, 'agent', at)
    expect(built.changed).toBe(false) // the build's mark is not what the person approved either
    expect(built.list[0]).toMatchObject({ built: true, builtEvidence: 'twice.test.ts passes (sample)', shown: false }) // two marks, kept apart
    expect(acceptanceLines(built.list)).toContain('· met by the build: twice.test.ts passes (sample)')
    expect(applyAcceptance(built.list, { update: [{ id: two.id, built: null }] }, 'user', at).list[0]).not.toHaveProperty('builtEvidence')
    expect(() => applyAcceptance(a.list, { update: [{ id: 'ac_none', text: 'x' }] }, 'agent')).toThrow(/no acceptance criterion/)
    expect(() => applyAcceptance(a.list, { update: [{ id: one.id, text: ' ' }] }, 'agent')).toThrow(/remove it instead/)
    expect(() => applyAcceptance([], { add: [{ text: '' }] }, 'agent')).toThrow(/needs its statement/)
  })

  it('reaches the agents that need them: the planner covers each, the brief is finalized with them, the audit asks whether they are enough', () => {
    const list: Criterion[] = [{ id: 'ac_1', text: 'Pays in one tap (sample)', by: 'agent', at: at.toISOString() }]
    const said = prompt({ repoPath: '/tmp/none', issue: { identifier: 'XX-1', title: 'Checkout', brief: 'One page.' }, acceptance: acceptanceLines(list), project: { name: 'P', content: null }, earlier: [], onEvent: async () => {} })
    expect(said).toMatch(/Acceptance criteria \(the person approved these with the brief[\s\S]*- \[ac_1\] Pays in one tap \(sample\)/)
    expect(said).toMatch(/Every acceptance criterion above must be a check of the sub-task that makes it true/)
    expect(prompt({ repoPath: '/tmp/none', issue: { identifier: 'XX-1', title: 'Checkout', brief: 'One page.' }, project: { name: 'P', content: null }, earlier: [], onEvent: async () => {} })).not.toMatch(/acceptance criteri/i)
    const f = { identifier: 'XX-1', title: 'Checkout', issueId: 'iss_x', base: 'main', prototype: null, before: [] }
    expect(checkBrief('audit', f)).toMatch(/acceptance criteria\*\*[\s\S]*are they sufficient\?/)
    expect(finalizeBrief(['analysis'], f)).toMatch(/bring the acceptance criteria up to date with set_acceptance/)
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('acceptance criteria, on a task', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'acceptance test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await pool.end() })

  it('is kept on the task; changing a statement after the brief is approved asks for approval again, recording what the prototype showed does not', async () => {
    const t = await createIssue(appId, { title: 'Checkout (sample)', kind: 'code' })
    await updateIssue(t.id, { brief: 'One page (sample).' })
    const made = await setAcceptance(t.id, { add: [{ text: 'Pays in one tap (sample)' }] }, 'agent')
    const id = made.acceptance[0].id
    await approveBrief(t.id, 'sandy')
    expect(await setAcceptance(t.id, { update: [{ id, shown: true, evidence: '/checkout (sample)' }] }, 'agent')).not.toHaveProperty('note')
    expect((await db.select().from(issue).where(eq(issue.id, t.id)))[0].briefApprovedBy).toBe('sandy')
    const after = await setAcceptance(t.id, { add: [{ text: 'A failed card is retried once (sample)' }] }, 'agent')
    expect(after.note).toMatch(/asks for the person's approval again/)
    const [row] = await db.select().from(issue).where(eq(issue.id, t.id))
    expect(row.briefApprovedBy).toBeNull()
    expect(row.acceptance).toHaveLength(2)
    await expect(setAcceptance(t.id, { update: [{ id, buildOnly: true }] }, 'agent', { prototyping: true })).rejects.toThrow(/cannot mark a criterion as for the final build only/) // the prototype's agent cannot excuse itself
    expect((await setAcceptance(t.id, { update: [{ id, buildOnly: true, why: 'polish (sample)' }] }, 'agent')).acceptance[0]).toMatchObject({ buildOnly: true, why: 'polish (sample)' })
    await expect(setAcceptance(t.id, { update: [{ id, built: true }] }, 'agent', { prototyping: true })).rejects.toThrow(/final build's mark is not its to set/)
    const sub = await createIssue(appId, { title: 'A sub-task (sample)', kind: 'code', parentId: t.id })
    await expect(setAcceptance(sub.id, { add: [{ text: 'x' }] })).rejects.toThrow(/only a top-level code task/)
  })
})
