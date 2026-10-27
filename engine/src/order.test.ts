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
  it('is empty for a single issue', () => {
    expect([...orderEdges([ph('a', 't1'), ph('b', 't1')], tasks).values()]).toEqual([[], []])
  })
})
