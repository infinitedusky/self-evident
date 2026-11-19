/** When a project can be closed: its pull requests merged, and every check left to a person passed or skipped. Sample data. */
import { describe, expect, it } from 'vitest'
import { closeWaits, type CloseFacts } from './close.js'
import { smokeChecks } from './smoke.js'

const merged = { number: 12, status: 'merged' }
const task = (identifier: string, ...marks: ('todo' | 'pass' | 'fail' | 'skip')[]) => ({ identifier, checks: marks.map((mark) => ({ mark })) })
const ok: CloseFacts = { status: 'landed', prs: [merged], tasks: [task('SS-4', 'pass', 'skip'), task('SS-5')] }

describe('closeWaits', () => {
  it('nothing, once it is built, every pull request is merged and every check is passed or skipped', () => {
    expect(closeWaits(ok)).toEqual([])
    expect(closeWaits({ ...ok, prs: [merged, { number: 13, status: 'merged' }] })).toEqual([])
  })
  it('a pull request not merged, or none', () => {
    expect(closeWaits({ ...ok, prs: [merged, { number: 13, status: 'open' }] })).toEqual(['Pull request #13 is not merged.'])
    expect(closeWaits({ ...ok, prs: [{ number: 13, status: 'closed' }] })).toEqual(['Pull request #13 is closed without being merged.'])
    expect(closeWaits({ ...ok, prs: [] })).toEqual(['It has no pull request.'])
  })
  it('a check of the person\'s not marked, or one they failed, on any task', () => {
    expect(closeWaits({ ...ok, tasks: [task('SS-4', 'todo', 'todo', 'pass'), task('SS-5', 'fail')] })).toEqual(['SS-4: 2 checks of yours are not passed or skipped.', 'SS-5: 1 check failed by hand.'])
    expect(closeWaits({ ...ok, tasks: [task('SS-4', 'todo')] })).toEqual(['SS-4: 1 check of yours is not passed or skipped.'])
  })
  it('not before it is built, and never twice or after it was stopped', () => {
    expect(closeWaits({ ...ok, status: 'running' })).toEqual(['It is not built yet.'])
    expect(closeWaits({ ...ok, status: 'closed' })).toEqual(['It is closed already.'])
    expect(closeWaits({ ...ok, status: 'stopped' })).toEqual(['It was stopped, not finished.'])
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
