import { describe, expect, it } from 'vitest'
import { claimsOverlap, findCycle, pickTasksToStart, type SchedTask } from './scheduler.js'

const t = (id: string, o: Partial<SchedTask> = {}): SchedTask =>
  ({ id, status: 'queued', dependsOn: [], files: [`src/${id}`], ...o })

describe('pickTasksToStart', () => {
  it('starts every task whose dependencies are done, up to the cap', () => {
    const pick = pickTasksToStart([t('a'), t('b'), t('c')], 2)
    expect(pick.start).toEqual(['a', 'b'])
    expect(pick.held).toEqual([{ id: 'c', reason: 'at the session cap' }])
  })

  it('never starts a task that is held, whatever else is free, and says why', () => {
    const pick = pickTasksToStart([t('a', { hold: 'its plan is read before it is built' }), t('b')], 5)
    expect(pick.start).toEqual(['b'])
    expect(pick.held).toEqual([{ id: 'a', reason: 'its plan is read before it is built' }])
  })

  it('holds a task until its dependency is done, and says so', () => {
    const tasks = [t('a', { status: 'running' }), t('b', { dependsOn: ['a'] })]
    expect(pickTasksToStart(tasks, 4)).toEqual({ start: [], held: [{ id: 'b', reason: 'waiting on a' }] })
    tasks[0].status = 'done'
    expect(pickTasksToStart(tasks, 4).start).toEqual(['b'])
  })

  it('never runs two tasks that share a file, picking one at a time', () => {
    const tasks = [t('a', { files: ['src/x.ts'] }), t('b', { files: ['src/x.ts'] }), t('c', { files: ['src/y.ts'] })]
    const pick = pickTasksToStart(tasks, 4)
    expect(pick.start).toEqual(['a', 'c'])
    expect(pick.held).toEqual([{ id: 'b', reason: 'shares src/x.ts with a' }])
  })

  it('treats a directory claim as covering its files, and no claims as everything', () => {
    expect(claimsOverlap('src/app', 'src/app/x.ts')).toBe(true)
    expect(claimsOverlap('src/app', 'src/apple.ts')).toBe(false)
    const pick = pickTasksToStart([t('a', { files: [] }), t('b')], 4)
    expect(pick.start).toEqual(['a'])
    expect(pick.held[0].reason).toBe('shares files with a')
  })

  it('holds against work already active, not just against what it starts now', () => {
    const pick = pickTasksToStart([t('a', { status: 'merging', files: ['lib'] }), t('b', { files: ['lib/util.ts'] })], 4)
    expect(pick.start).toEqual([])
    expect(pick.held).toEqual([{ id: 'b', reason: 'shares lib/util.ts with a' }])
  })

  it('blocks dependents of a failed task and leaves the rest alone', () => {
    const pick = pickTasksToStart([t('a', { status: 'failed' }), t('b', { dependsOn: ['a'] }), t('c')], 4)
    expect(pick.start).toEqual(['c'])
    expect(pick.held).toEqual([{ id: 'b', reason: 'blocked: a failed' }])
  })

  it('orders by priority, then position', () => {
    const pick = pickTasksToStart([t('a', { position: 2 }), t('b', { position: 1 }), t('c', { priority: 5, position: 9 })], 1)
    expect(pick.start).toEqual(['c'])
    expect(pick.held.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('reports an unknown dependency instead of guessing', () => {
    expect(pickTasksToStart([t('a', { dependsOn: ['ghost'] })], 4).held[0].reason).toBe('depends on unknown task ghost')
  })
})

describe('findCycle', () => {
  it('finds a cycle as a path', () => {
    expect(findCycle([t('a', { dependsOn: ['b'] }), t('b', { dependsOn: ['c'] }), t('c', { dependsOn: ['a'] })])).toEqual(['a', 'b', 'c', 'a'])
  })
  it('returns null for a DAG', () => {
    expect(findCycle([t('a'), t('b', { dependsOn: ['a'] }), t('c', { dependsOn: ['a', 'b'] })])).toBeNull()
  })
})
