import { describe, expect, it } from 'vitest'
import { resolve, rows, validOrder, type Workflow } from './steps'

const ui: Workflow = { id: 'wf_ui', name: 'UI', ordered: true, steps: [
  { key: 'mockup', on: true, required: true }, { key: 'prototype', on: false, required: false }, { key: 'brief', on: true, required: true },
] }

describe('steps', () => {
  it('uses the task\'s workflow, else its project\'s, else the app\'s', () => {
    const own = { ...ui, id: 'own' }, proj = { ...ui, id: 'proj' }, app = { ...ui, id: 'app' }
    expect(resolve(own, proj, app)).toMatchObject({ workflow: { id: 'own' }, from: 'task' })
    expect(resolve(null, proj, app)).toMatchObject({ workflow: { id: 'proj' }, from: 'project' })
    expect(resolve(null, null, app)).toMatchObject({ workflow: { id: 'app' }, from: 'app' })
    expect(resolve()).toEqual({ workflow: null, from: null })
  })
  it('with no workflow, shows every step that can be done there, unordered, only the brief required', () => {
    expect(rows('project', [], null).map((r) => r.key)).toEqual(['idea', 'research', 'mockup', 'prototype'])
    expect(rows('task', [], null).every((r) => r.required === (r.key === 'brief') && r.position === null && !r.waitingOn)).toBe(true)
  })
  it('leaves out switched-off steps and makes later steps wait on required ones in an enforced order', () => {
    const r = rows('task', [], ui)
    expect(r.map((x) => [x.key, x.position, x.waitingOn])).toEqual([['mockup', 1, null], ['brief', 2, 'mockup']])
    expect(rows('task', [{ key: 'mockup', status: 'done' }], ui)[1].waitingOn).toBeNull()
  })
  it('counts a task\'s brief as finished only once approved', () => {
    const briefFirst: Workflow = { ...ui, steps: [ui.steps[2], ui.steps[0]] }
    expect(rows('task', [{ key: 'brief', status: 'done' }], briefFirst)[1].waitingOn).toBe('brief')
    expect(rows('task', [{ key: 'brief', status: 'done', approved: { by: 'x', at: 'y' } }], briefFirst)[1].waitingOn).toBeNull()
  })
})

describe('the fixed rules', () => {
  it('keeps the idea first and research before the brief; mockups and the prototype go either side', () => {
    expect(validOrder([{ key: 'idea' }, { key: 'research' }, { key: 'brief' }, { key: 'mockup' }])).toBe(true)
    expect(validOrder([{ key: 'mockup' }, { key: 'prototype' }, { key: 'brief' }])).toBe(true)
    expect(validOrder([{ key: 'research' }, { key: 'idea' }, { key: 'brief' }])).toBe(false)
    expect(validOrder([{ key: 'brief' }, { key: 'research' }])).toBe(false)
  })
  it('always requires the brief, even when a workflow switches it off', () => {
    const off: Workflow = { id: 'w', name: 'w', ordered: false, steps: [{ key: 'brief', on: false, required: false }] }
    expect(rows('task', [], off)).toMatchObject([{ key: 'brief', required: true }])
    expect(rows('task', [], null).find((r) => r.key === 'brief')?.required).toBe(true)
  })
})
