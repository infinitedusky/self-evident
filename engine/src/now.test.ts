import { describe, expect, it } from 'vitest'
import { phaseOf } from './now.js'

describe('where a task past its plan stands (Build)', () => {
  const f = { state: 'in_review', done: 2, total: 2, projectStatus: 'landed', stopped: false }
  it('is landed only once it is closed: a merged pull request leaves it built', () => {
    expect(phaseOf(f)).toBe('built') // every sub-task in, pull request merged, project landed: still not closed
    expect(phaseOf({ ...f, state: 'done' })).toBe('landed')
    expect(phaseOf({ ...f, state: 'done', projectStatus: 'closed' })).toBe('landed')
  })
  it('is ready, building or stopped before that', () => {
    expect(phaseOf({ ...f, done: 0, projectStatus: 'approved' })).toBe('ready')
    expect(phaseOf({ ...f, done: 1, projectStatus: 'running' })).toBe('building')
    expect(phaseOf({ ...f, done: 1, projectStatus: 'running', stopped: true })).toBe('stopped')
    expect(phaseOf({ ...f, done: 1, projectStatus: 'paused' })).toBe('stopped')
  })
})
