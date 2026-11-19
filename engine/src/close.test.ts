/** When a task can be closed: its pull request merged, and every check left to a person passed or skipped. Sample data. */
import { describe, expect, it } from 'vitest'
import { taskWaits, type CloseFacts } from './close.js'
import { smokeChecks } from './smoke.js'

const marks = (...m: ('todo' | 'pass' | 'fail' | 'skip')[]) => m.map((mark) => ({ mark }))
const ok: CloseFacts = { state: 'in_review', pr: { number: 12, status: 'merged' }, checks: marks('pass', 'skip') }

describe('taskWaits', () => {
  it('nothing, once it is built, its pull request is merged and every check is passed or skipped', () => {
    expect(taskWaits(ok)).toEqual([]); expect(taskWaits({ ...ok, checks: [] })).toEqual([])
  })
  it('a pull request not merged, or none', () => {
    expect(taskWaits({ ...ok, pr: { number: 13, status: 'open' } })).toEqual(['Pull request #13 is not merged.'])
    expect(taskWaits({ ...ok, pr: { number: 13, status: 'closed' } })).toEqual(['Pull request #13 is closed without being merged.'])
    expect(taskWaits({ ...ok, pr: null })).toEqual(['It has no pull request.'])
  })
  it('a check of the person\'s not marked, or one they failed', () => {
    expect(taskWaits({ ...ok, checks: marks('todo', 'todo', 'pass', 'fail') })).toEqual(['2 checks of yours are not passed or skipped.', '1 check failed by hand.'])
    expect(taskWaits({ ...ok, checks: marks('todo') })).toEqual(['1 check of yours is not passed or skipped.'])
  })
  it('not before it is built, and never twice', () => {
    expect(taskWaits({ ...ok, state: 'in_progress' })).toEqual(['It is not built yet.'])
    expect(taskWaits({ ...ok, state: 'done' })).toEqual(['It is closed already.'])
    expect(taskWaits({ ...ok, state: 'canceled' })).toEqual(['It was not built.'])
  })
})

describe('a skipped check', () => {
  const at = '2026-11-18T00:00:00Z'
  it('reads as skipped, not as passed, and no longer waits', () => {
    const c = { id: 'ac_1', text: 'The release note is on the site (sample)', by: 'user', at, builtWhen: 'after' as const, built: true, builtEvidence: 'Skipped, not tried: nothing to release yet (sample)', byHand: { pass: true, note: 'nothing to release yet (sample)', sha: null, at, by: 'user', skipped: true } }
    expect(smokeChecks([c as never])[0]).toMatchObject({ mark: 'skip', note: 'Skipped, not tried: nothing to release yet (sample)' })
    expect(smokeChecks([{ ...c, byHand: { ...c.byHand, skipped: undefined } } as never])[0].mark).toBe('pass')
  })
})
