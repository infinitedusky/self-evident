import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKFLOW, addCheck, blocking, finished, needsApproval, normalize, owed, ready, removeCheck, resolve, rows, validOrder, type Workflow, type WorkflowStep } from './steps.js'

const w = (steps: WorkflowStep[], ordered = true): Workflow => ({ id: 'wf', name: 'wf', ordered, steps })
const s = (key: WorkflowStep['key'], required = false, on = true): WorkflowStep => ({ key, on, required })
const ui = w([s('idea', true), s('research'), s('sketch', false, false), s('mockup', true), s('prototype', false, false), s('brief', true)])

describe('steps', () => {
  it('uses the task\'s workflow, else its project\'s, else the app\'s', () => {
    const own = { ...ui, id: 'own' }, proj = { ...ui, id: 'proj' }, app = { ...ui, id: 'app' }
    expect(resolve(own, proj, app)).toMatchObject({ workflow: { id: 'own' }, from: 'task' })
    expect(resolve(null, proj, app)).toMatchObject({ workflow: { id: 'proj' }, from: 'project' })
    expect(resolve(null, null, app)).toMatchObject({ workflow: { id: 'app' }, from: 'app' })
    expect(resolve()).toEqual({ workflow: DEFAULT_WORKFLOW, from: 'app' })
  })

  it('with no workflow, shows the default steps unordered, only the brief required', () => {
    expect(rows('project', [], null).map((r) => r.key)).toEqual(['idea', 'research', 'sketch', 'mockup', 'prototype'])
    const task = rows('task', [], null)
    expect(task.map((r) => r.key)).toEqual(['idea', 'research', 'sketch', 'mockup', 'prototype', 'brief'])
    expect(task.every((r) => r.required === (r.key === 'brief') && r.position === null && !r.waitingOn)).toBe(true)
    expect(rows('idea', [], null).some((r) => r.required)).toBe(false) // an idea commits to nothing: its rough draft is optional
  })

  it('leaves out switched-off steps and makes later steps wait on required ones in an enforced order', () => {
    const r = rows('task', [{ key: 'idea', status: 'done' }], ui)
    const checked = addCheck(ui, 'risk')
    expect(r.map((x) => [x.key, x.position, x.waitingOn])).toEqual([['idea', 1, null], ['research', 2, null], ['mockup', 3, null], ['brief', null, null]])
    expect(rows('task', [{ key: 'idea', status: 'done' }], checked).find((x) => x.key === 'risk')).toMatchObject({ position: 4, waitingOn: 'mockup' })
    expect(rows('task', [{ key: 'idea', status: 'done' }, { key: 'mockup', status: 'done' }], checked).find((x) => x.key === 'risk')?.waitingOn).toBe('mockup') // done by the agent's word: still the person's to approve
    expect(rows('task', [{ key: 'idea', status: 'done' }, { key: 'mockup', status: 'done', approved: { by: 'sam', at: 'now' } }], checked).find((x) => x.key === 'risk')?.waitingOn).toBeNull()
  })

  it('finishes a task\'s research, sketches, mockups and prototype only on a person\'s approval; a check is finished when done', () => {
    const done = { key: 'sketch' as const, status: 'done' as const }
    expect([needsApproval('sketch', 'task'), needsApproval('prototype', 'task'), needsApproval('brief', 'task'), needsApproval('risk', 'task'), needsApproval('idea', 'task'), needsApproval('sketch', 'idea'), needsApproval('sketch', 'project')]).toEqual([true, true, true, false, false, false, false])
    expect([finished(done, 'task'), ready(done, 'task')]).toEqual([false, true])
    expect([finished({ ...done, approved: { by: 'sam', at: 'now' } }, 'task'), ready({ ...done, approved: { by: 'sam', at: 'now' } }, 'task')]).toEqual([true, false])
    expect(finished(done, 'idea')).toBe(true) // an idea commits to nothing
    expect(finished({ key: 'risk', status: 'done' }, 'task')).toBe(true) // read and approved with the brief
    expect(ready({ key: 'sketch', status: 'started' }, 'task')).toBe(false)
  })

  it('keeps the brief outside the order: open from the start, nothing waits on it, approved once the required steps are done', () => {
    const checked = w([s('idea'), s('research', false, false), s('prototype'), s('audit', true), s('brief', true)])
    const draft = rows('task', [{ key: 'brief', status: 'started' }], checked)
    expect(draft.at(-1)).toMatchObject({ key: 'brief', position: null, waitingOn: null })
    expect(draft.find((x) => x.key === 'audit')?.waitingOn).toBeNull() // a check never waits on the brief
    expect(owed([{ key: 'brief', status: 'done' }], checked)).toEqual(['audit'])
    expect(owed([{ key: 'brief', status: 'done' }, { key: 'audit', status: 'done' }], checked)).toEqual([])
    expect(owed([], null)).toEqual([])
  })

  it('counts a task\'s brief as finished only once approved, and blocks completing until then', () => {
    const after = w([s('idea'), s('research', false, false), s('brief', true), s('audit', true)])
    expect(blocking([{ key: 'brief', status: 'done' }], null)).toEqual(['brief'])
    expect(blocking([{ key: 'brief', status: 'done', approved: { by: 'x', at: 'y' } }], null)).toEqual([])
    expect(blocking([{ key: 'brief', status: 'done', approved: { by: 'x', at: 'y' } }], after)).toEqual(['audit'])
  })
})

describe('the fixed rules', () => {
  it('keeps the idea first and the checks after the other steps; where the brief sits means nothing', () => {
    expect(validOrder([s('idea'), s('research'), s('brief'), s('mockup'), s('adr')])).toBe(true)
    expect(validOrder([s('idea'), s('mockup'), s('prototype'), s('risk'), s('audit'), s('brief')])).toBe(true)
    expect(validOrder([s('idea'), s('brief'), s('research')])).toBe(true)
    expect(validOrder([s('research'), s('idea'), s('brief')])).toBe(false)
    expect(validOrder([s('idea'), s('adr'), s('prototype'), s('brief')])).toBe(false)
  })

  it('always lists the idea and the brief, keeps the brief required, and fixes an order that breaks the rules', () => {
    const bad = normalize(w([s('brief', false, false), s('research'), s('idea', false, false)]))
    expect(bad.steps.map((x) => x.key)).toEqual(['idea', 'research', 'sketch', 'mockup', 'prototype', 'brief'])
    expect(bad.steps.find((x) => x.key === 'brief')).toMatchObject({ on: true, required: true })
    expect(bad.steps.find((x) => x.key === 'idea')).toMatchObject({ on: true })
    expect(bad.steps.find((x) => x.key === 'mockup')).toMatchObject({ on: false })
    expect(bad.steps.find((x) => x.key === 'sketch')).toMatchObject({ on: true }) // new since the workflow was saved: on
  })

  it('gives a workflow saved before sketches its sketches, on, right before its mockups, wherever those sit', () => {
    const old = normalize(w([s('idea'), s('research'), s('brief', true), s('mockup', true), s('prototype')]))
    expect(old.steps.map((x) => x.key)).toEqual(['idea', 'research', 'sketch', 'mockup', 'prototype', 'brief']) // the brief, wherever it was saved, goes last
    const off = normalize(w([s('idea'), s('sketch', false, false), s('mockup'), s('prototype'), s('brief', true)]))
    expect(off.steps.find((x) => x.key === 'sketch')).toMatchObject({ on: false }) // switched off by the person: stays off
    expect(validOrder([s('idea'), s('sketch'), s('mockup'), s('brief'), s('prototype')])).toBe(true)
  })

  it('adds a check after the other steps, the brief still last, and removes it again', () => {
    const added = addCheck(ui, 'adr')
    expect(added.steps.slice(-2).map((x) => x.key)).toEqual(['adr', 'brief'])
    expect(validOrder(added.steps)).toBe(true)
    expect(removeCheck(added, 'adr').steps.some((x) => x.key === 'adr')).toBe(false)
  })
})
