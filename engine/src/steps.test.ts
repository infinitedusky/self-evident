import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKFLOW, addCheck, blocking, normalize, removeCheck, resolve, rows, validOrder, type Workflow, type WorkflowStep } from './steps.js'

const w = (steps: WorkflowStep[], ordered = true): Workflow => ({ id: 'wf', name: 'wf', ordered, steps })
const s = (key: WorkflowStep['key'], required = false, on = true): WorkflowStep => ({ key, on, required })
const ui = w([s('idea', true), s('research'), s('mockup', true), s('prototype', false, false), s('brief', true)])

describe('steps', () => {
  it('uses the task\'s workflow, else its project\'s, else the app\'s', () => {
    const own = { ...ui, id: 'own' }, proj = { ...ui, id: 'proj' }, app = { ...ui, id: 'app' }
    expect(resolve(own, proj, app)).toMatchObject({ workflow: { id: 'own' }, from: 'task' })
    expect(resolve(null, proj, app)).toMatchObject({ workflow: { id: 'proj' }, from: 'project' })
    expect(resolve(null, null, app)).toMatchObject({ workflow: { id: 'app' }, from: 'app' })
    expect(resolve()).toEqual({ workflow: DEFAULT_WORKFLOW, from: 'app' })
  })

  it('with no workflow, shows the default steps unordered, only the brief required', () => {
    expect(rows('project', [], null).map((r) => r.key)).toEqual(['idea', 'research', 'mockup', 'prototype'])
    const task = rows('task', [], null)
    expect(task.map((r) => r.key)).toEqual(['idea', 'research', 'mockup', 'prototype', 'brief'])
    expect(task.every((r) => r.required === (r.key === 'brief') && r.position === null && !r.waitingOn)).toBe(true)
    expect(rows('idea', [], null).some((r) => r.required)).toBe(false) // an idea commits to nothing: its rough draft is optional
  })

  it('leaves out switched-off steps and makes later steps wait on required ones in an enforced order', () => {
    const r = rows('task', [{ key: 'idea', status: 'done' }], ui)
    expect(r.map((x) => [x.key, x.position, x.waitingOn])).toEqual([['idea', 1, null], ['research', 2, null], ['mockup', 3, null], ['brief', 4, 'mockup']])
    expect(rows('task', [{ key: 'idea', status: 'done' }, { key: 'mockup', status: 'done' }], ui)[3].waitingOn).toBeNull()
  })

  it('counts a task\'s brief as finished only once approved, and blocks completing until then', () => {
    const after = w([s('idea'), s('research', false, false), s('brief', true), s('audit', true)])
    expect(rows('task', [{ key: 'brief', status: 'done' }], after).find((r) => r.key === 'audit')?.waitingOn).toBe('brief')
    expect(blocking([{ key: 'brief', status: 'done' }], null)).toEqual(['brief'])
    expect(blocking([{ key: 'brief', status: 'done', approved: { by: 'x', at: 'y' } }], null)).toEqual([])
    expect(blocking([{ key: 'brief', status: 'done', approved: { by: 'x', at: 'y' } }], after)).toEqual(['audit'])
  })
})

describe('the fixed rules', () => {
  it('keeps the idea first, research before the brief and the checks after it; mockups and the prototype go either side', () => {
    expect(validOrder([s('idea'), s('research'), s('brief'), s('mockup'), s('adr')])).toBe(true)
    expect(validOrder([s('idea'), s('mockup'), s('prototype'), s('brief'), s('risk'), s('audit')])).toBe(true)
    expect(validOrder([s('research'), s('idea'), s('brief')])).toBe(false)
    expect(validOrder([s('idea'), s('brief'), s('research')])).toBe(false)
    expect(validOrder([s('idea'), s('adr'), s('brief')])).toBe(false)
  })

  it('always lists the idea and the brief, keeps the brief required, and fixes an order that breaks the rules', () => {
    const bad = normalize(w([s('brief', false, false), s('research'), s('idea', false, false)]))
    expect(bad.steps.map((x) => x.key)).toEqual(['idea', 'research', 'mockup', 'prototype', 'brief'])
    expect(bad.steps.find((x) => x.key === 'brief')).toMatchObject({ on: true, required: true })
    expect(bad.steps.find((x) => x.key === 'idea')).toMatchObject({ on: true })
    expect(bad.steps.find((x) => x.key === 'mockup')).toMatchObject({ on: false })
  })

  it('adds a check after the brief and removes it again', () => {
    const added = addCheck(ui, 'adr')
    expect(added.steps.at(-1)?.key).toBe('adr')
    expect(validOrder(added.steps)).toBe(true)
    expect(removeCheck(added, 'adr').steps.some((x) => x.key === 'adr')).toBe(false)
  })
})
