/** The smoke test: the app's setting, the checks a person has from a task's criteria, and their marks. Pure, with one stored test of marking. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyAcceptance, setAcceptance, type Criterion } from './acceptance.js'
import { stagesOf } from './checklist.js'
import { db, pool } from './db/client.js'
import { app, event, issue, pr as prTable, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { byHand, markSmoke, previewUrl, smokeChecks, smokeOwed, smokeSetup, smokeView, startSmoke } from './smoke.js'
import { checkTaskBrief, readVerdicts, verdictChange } from './verify.js'

const at = '2026-11-17T00:00:00.000Z'
const criteria: Criterion[] = [
  { id: 'ac_1', text: 'The file has every order (sample)', check: 'export.test.ts', built: true, builtEvidence: 'export.test.ts passes', by: 'engine', at },
  { id: 'ac_2', text: 'The tunnel reads as a tunnel (sample)', check: 'look at the Tunnel story', by: 'user', at },
  { id: 'ac_3', text: 'Portals keep 40 frames a second (sample)', by: 'user', at },
]

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('where an app is smoke tested', () => {
  it('is local unless it says otherwise, and keeps only what it knows', () => {
    expect(smokeSetup({})).toEqual({ where: 'local' }); expect(smokeSetup(null)).toEqual({ where: 'local' })
    expect(smokeSetup({ smoke: { where: 'staging', url: ' https://staging.example.test ', account: 'the test parent (sample)', password: 'never kept' } })).toEqual({ where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)' })
    expect(smokeSetup({ smoke: { where: 'flag', flag: 'new-checkout (sample)', url: 'https://app.example.test' } })).toMatchObject({ where: 'flag', flag: 'new-checkout (sample)' })
    expect(smokeSetup({ smoke: { where: 'the moon' } })).toEqual({ where: 'local' })
    // A preview per pull request: the app gives the pattern, and each pull request's number goes in it.
    expect(smokeSetup({ smoke: { where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' } })).toEqual({ where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' })
    expect(previewUrl('https://pkg.pr.new/sample@{pr}', 12)).toBe('https://pkg.pr.new/sample@12')
    expect(previewUrl('https://pr-{pr}.sample.test/app/{pr}', 7)).toBe('https://pr-7.sample.test/app/7')
    expect(previewUrl('https://pkg.pr.new/sample@{pr}', null)).toBeNull(); expect(previewUrl(undefined, 12)).toBeNull() // no pull request yet, or no pattern: nowhere to send them
  })
})

describe('the checks a person has', () => {
  it('are the criteria the check left to them, with where to go and what to look for', () => {
    expect(checkTaskBrief(criteria)).toContain('add "where", the path of the app or the story\'s id to open')
    const v = readVerdicts('```acceptance\n[{"id":"ac_2","met":null,"where":"edges-tunnel--default","evidence":"Open the story: the edge should dip under the lip, not sit on top of it"},{"id":"ac_3","met":null,"evidence":"needs a person: watch the fps counter with portals on"},{"id":"ac_1","met":true,"where":"/ignored","evidence":"export.test.ts"}]\n```', criteria.map((c) => c.id))
    expect(v.map((x) => x.where)).toEqual(['edges-tunnel--default', undefined, undefined]) // only one left to a person says where
    const { list } = applyAcceptance(criteria, verdictChange(v), 'engine')
    expect(list.map(byHand)).toEqual([false, true, true])
    expect(smokeChecks(list)).toEqual([
      { id: 'ac_2', text: 'The tunnel reads as a tunnel (sample)', where: 'edges-tunnel--default', how: 'Open the story: the edge should dip under the lip, not sit on top of it', mark: 'todo' },
      { id: 'ac_3', text: 'Portals keep 40 frames a second (sample)', how: 'watch the fps counter with portals on', mark: 'todo' },
    ])
    expect(smokeOwed(list)).toBe(2); expect(smokeOwed(criteria)).toBe(0) // nothing is theirs until the check says so
  })
  it('a mark is theirs, with their note; it is stale once the code has moved; and it comes back to them after a fix', () => {
    const left = applyAcceptance(criteria, { update: [{ id: 'ac_2', built: null, builtEvidence: 'for a person: open the Tunnel story', builtWhere: 'edges-tunnel--default' }, { id: 'ac_3', built: null, builtEvidence: 'watch the counter' }] }, 'engine').list
    const marked = applyAcceptance(left, { update: [{ id: 'ac_2', built: true, builtEvidence: 'trough visible, lip outline faint', byHand: { pass: true, note: 'trough visible, lip outline faint', sha: 'aaa111', at, by: 'user' } }, { id: 'ac_3', built: false, builtEvidence: 'portal 22 fps vs 45 none', byHand: { pass: false, note: 'portal 22 fps vs 45 none', sha: 'aaa111', at, by: 'user' } }] }, 'user').list
    expect(smokeChecks(marked, 'aaa111').map((c) => [c.id, c.mark, c.note, c.stale])).toEqual([['ac_2', 'pass', 'trough visible, lip outline faint', undefined], ['ac_3', 'fail', 'portal 22 fps vs 45 none', undefined]])
    expect(smokeChecks(marked, 'bbb222').map((c) => c.stale)).toEqual([true, true]) // the branch moved on: marked on an earlier commit
    expect(smokeOwed(marked)).toBe(0)
    // Fixed and checked again: the agent leaves it to the person once more, and what they said last time is beside it.
    const again = applyAcceptance(marked, { update: [{ id: 'ac_3', built: null, builtEvidence: 'watch the counter again: portals now batch their draws' }] }, 'engine').list
    expect(smokeChecks(again).find((c) => c.id === 'ac_3')).toMatchObject({ mark: 'todo', how: 'watch the counter again: portals now batch their draws', before: { pass: false, note: 'portal 22 fps vs 45 none' } })
    expect(smokeOwed(again)).toBe(1)
  })
  it('is a stage of the task once there is one: theirs when nothing is building, done when each is marked, failed when one was', () => {
    const subs = [{ title: 'Build it', status: 'done' }, { title: 'Check it against its acceptance criteria', status: 'done' }, { title: 'Try to break it, and clean up', status: 'done' }]
    const stage = (byHandCount: { todo: number; failed: number; total: number }, s = subs) => stagesOf({ subs: s, build: 'one', unmet: 0, met: 3, total: 5, hasTests: false, tested: null, byHand: byHandCount }).find((x) => x.key === 'smoke')
    expect(stage({ todo: 0, failed: 0, total: 0 })).toBeUndefined() // nothing for a person: no such stage
    expect(stage({ todo: 2, failed: 0, total: 2 })).toMatchObject({ state: 'doing', detail: '2 for you to check by hand' })
    expect(stage({ todo: 2, failed: 0, total: 2 }, [...subs.slice(0, 2), { title: 'Try to break it, and clean up', status: 'running' }])).toMatchObject({ state: 'todo', detail: '2 for you, once it is built and checked' })
    expect(stage({ todo: 0, failed: 1, total: 2 })).toMatchObject({ state: 'failed', detail: '1 failed by hand, sent back' })
    expect(stage({ todo: 0, failed: 0, total: 2 })).toMatchObject({ state: 'done', detail: '2 checked by hand' })
  })
})

describe.skipIf(!reachable)('a person marks a check', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'smoke test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase(), setup: { smoke: { where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)' } } })
  })
  afterAll(async () => { await pool.end() })

  it('their word is the build\'s mark on that criterion, with the note; a fail needs one; what is not theirs is refused', async () => {
    const { issues: [t] } = await createProject({ appId, name: 'Smoke (sample)', issues: [{ title: 'Edges (sample)', brief: 'Build it.' }] })
    const { acceptance } = await setAcceptance(t.id, { add: criteria.map((c) => ({ text: c.text, check: c.check })) })
    const [done, look, speed] = acceptance.map((c) => c.id)
    await setAcceptance(t.id, { update: [{ id: done, built: true, builtEvidence: 'export.test.ts' }, { id: look, built: null, builtEvidence: 'open the Tunnel story', builtWhere: 'edges-tunnel--default' }, { id: speed, built: null, builtEvidence: 'watch the counter' }] }, 'engine')
    const view = await smokeView(t.id)
    expect(view).toMatchObject({ where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)', owed: 2, failed: 0, canRun: false, up: true })
    await expect(startSmoke(t.id)).rejects.toThrow(/smoke tested on staging: there is nothing to start here/)
    await expect(markSmoke(t.id, done, { pass: true })).rejects.toThrow(/not one for a person/)
    await expect(markSmoke(t.id, speed, { pass: false })).rejects.toThrow(/say what you saw/)
    // The same app tried on a preview of each pull request: nowhere to go until there is one, then that one's address.
    const [was] = await db.select().from(app).where(eq(app.id, appId))
    await db.update(app).set({ setup: { smoke: { where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' } } }).where(eq(app.id, appId))
    expect(await smokeView(t.id)).toMatchObject({ where: 'preview', url: null, up: false, pr: null })
    await db.insert(prTable).values({ id: newId('pr'), appId, projectId: t.projectId!, issueId: t.id, number: 12, url: 'https://github.test/sample/pull/12', status: 'open' })
    expect(await smokeView(t.id)).toMatchObject({ where: 'preview', url: 'https://pkg.pr.new/sample@12', up: true, pr: { number: 12 } })
    await db.update(app).set({ setup: was.setup }).where(eq(app.id, appId))
    const one = await markSmoke(t.id, look, { pass: true, note: 'trough visible, lip outline faint' })
    expect(one).toMatchObject({ owed: 1, failed: 0, marked: { id: look, pass: true } })
    const two = await markSmoke(t.id, speed, { pass: false, note: 'portal 22 fps vs 45 none' })
    expect(two.checks.map((c) => [c.mark, c.note])).toEqual([['pass', 'trough visible, lip outline faint'], ['fail', 'portal 22 fps vs 45 none']])
    const [after] = await db.select().from(issue).where(eq(issue.id, t.id))
    const stored = after.acceptance as Criterion[]
    expect(stored.find((c) => c.id === speed)).toMatchObject({ built: false, builtEvidence: 'portal 22 fps vs 45 none', byHand: { pass: false, by: 'user' }, by: 'user' })
    expect(after.briefApprovedBy ?? null).toBeNull()
    expect((await db.select().from(event).where(eq(event.issueId, t.id))).filter((e) => e.type === 'smoke.marked').sort((a, b) => a.seq - b.seq).map((e) => (e.payload as { pass: boolean }).pass)).toEqual([true, false])
  })
})
