/** Issue order as drawn edges: finishers of the earlier issue → starters of the next; explicit edges not repeated. */
import { describe, expect, it } from 'vitest'
import { orderEdges } from './projects.js'

const ph = (id: string, parentId: string, dependsOn: string[] = []) => ({ id, parentId, dependsOn })
const tasks = [{ id: 't1', sortOrder: 0 }, { id: 't2', sortOrder: 1 }, { id: 't3', sortOrder: 2 }]

describe('orderEdges', () => {
  it('points the sub-issues that start an issue at the sub-issues that finish the one before', () => {
    const edges = orderEdges([ph('a', 't1'), ph('b', 't1', ['a']), ph('c', 't1'), ph('d', 't2'), ph('e', 't2', ['d'])], tasks)
    expect(edges.get('a')).toEqual([]); expect(edges.get('b')).toEqual([]); expect(edges.get('c')).toEqual([])
    expect(edges.get('d')).toEqual(['b', 'c']) // a is not a finisher: b depends on it
    expect(edges.get('e')).toEqual([]) // e starts after d, inside its issue
  })
  it('skips an issue with no sub-issues and does not repeat an explicit edge', () => {
    const edges = orderEdges([ph('a', 't1'), ph('x', 't3', ['a']), ph('y', 't3')], tasks) // t2 has nothing yet
    expect(edges.get('x')).toEqual([]) // already explicit
    expect(edges.get('y')).toEqual(['a'])
  })
  it('follows the order things were built in: nothing finished is drawn as coming after something still running', () => {
    const at = (h: number) => `2026-11-16T${String(h).padStart(2, '0')}:00:00.000Z`
    const made = (id: string, parentId: string, h: number | null, dependsOn: string[] = [], created = 1) => ({ id, parentId, dependsOn, startedAt: h === null ? null : at(h), createdAt: at(created) })
    // Listed t1, t2, t3. Built: t1 first, then t3 (finished), and t2 is only now running. t4 has not started.
    const four = [...tasks, { id: 't4', sortOrder: 3 }]
    const edges = orderEdges([made('a', 't1', 2), made('run', 't2', 9), made('late', 't3', 5), made('next', 't4', null)], four)
    expect(edges.get('late')).toEqual(['a']) // built second, so it follows the first
    expect(edges.get('run')).toEqual(['late']) // the running one comes after what is already built, not before it
    expect(edges.get('next')).toEqual(['run']) // not started: after everything that has, in its listed order
    // Two not started keep their listed order.
    const waiting = orderEdges([made('p', 't1', null), made('q', 't3', null), made('r', 't2', null)], tasks)
    expect([waiting.get('p'), waiting.get('r'), waiting.get('q')]).toEqual([[], ['p'], ['r']])
  })
  it('inside a task, one added later with nothing said is drawn after the one added just before it: a check comes from what it checked', () => {
    const at = (m: number) => `2026-11-16T10:${String(m).padStart(2, '0')}:00.000Z`
    const sub = (id: string, parentId: string, m: number, dependsOn: string[] = []) => ({ id, parentId, dependsOn, startedAt: at(m), createdAt: at(m) })
    const edges = orderEdges([sub('before', 't1', 1), sub('build', 't2', 10), sub('check', 't2', 20), sub('finish', 't2', 30), sub('probe', 't2', 40), sub('said', 't2', 50, ['build'])], tasks)
    expect(edges.get('build')).toEqual(['before']) // only the task's first comes from the task before
    expect([edges.get('check'), edges.get('finish'), edges.get('probe')]).toEqual([['build'], ['check'], ['finish']])
    expect(edges.get('said')).toEqual([]) // it said what it follows: nothing is guessed
    // Planned together, at the same moment: side by side, as planned.
    const planned = orderEdges([sub('x', 't1', 5), sub('y', 't1', 5)], tasks)
    expect([planned.get('x'), planned.get('y')]).toEqual([[], []])
    // The task after one whose follow-ups were inferred comes from its real last node, not from all of them.
    expect(orderEdges([sub('build', 't1', 10), sub('check', 't1', 20), sub('probe', 't1', 30), sub('z', 't2', 40)], tasks).get('z')).toEqual(['probe'])
  })
  it('is empty for a single issue', () => {
    expect([...orderEdges([ph('a', 't1'), ph('b', 't1')], tasks).values()]).toEqual([[], []])
  })
})
