import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKFLOW, addCheck, blocking, canRemove, canSkip, checksOwed, settled, undecided, finished, needsApproval, normalize, owed, ready, removeCheck, resolve, rows, validOrder, type Workflow, type WorkflowStep } from './steps.js'

const w = (steps: WorkflowStep[], ordered = true): Workflow => ({ id: 'wf', name: 'wf', ordered, steps })
const s = (key: WorkflowStep['key'], required = false, on = true): WorkflowStep => ({ key, on, required })
const ui = w([s('idea', true), s('research'), s('sketch', false, false), s('mockup', true), s('prototype', false, false), s('brief', true)])
const proto = w([s('idea', true), s('research', false, false), s('sketch', false, false), s('mockup', true), s('prototype', true), s('brief', true)]) // ordered, with a required prototype

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
    expect(r.map((x) => [x.key, x.position, x.waitingOn])).toEqual([['idea', 1, null], ['research', 2, null], ['mockup', 3, null], ['brief', null, null]]) // no prototype in this workflow: no checks
    const by = { by: 'sam', at: 'now' }
    const idea = { key: 'idea' as const, status: 'done' as const }
    const at = (states: Parameters<typeof rows>[1], key: string) => rows('task', states, proto).find((x) => x.key === key)
    expect(rows('task', [idea], proto).map((x) => x.key)).toEqual(['idea', 'mockup', 'prototype', 'analysis', 'adr', 'risk', 'audit', 'final', 'brief']) // a required prototype brings its checks
    expect(at([idea], 'risk')).toMatchObject({ required: true, waitingOn: 'mockup' })
    expect(at([idea, { key: 'mockup', status: 'done' }], 'risk')?.waitingOn).toBe('mockup') // done by the agent's word: still the person's to approve
    expect(at([idea, { key: 'mockup', status: 'done', approved: by }], 'analysis')?.waitingOn).toBe('prototype')
    expect(at([idea, { key: 'mockup', status: 'done', approved: by }, { key: 'prototype', status: 'done', approved: by }], 'analysis')?.waitingOn).toBeNull()
    expect(at([idea, { key: 'mockup', status: 'done', approved: by }, { key: 'prototype', status: 'done', approved: by }], 'adr')?.waitingOn).toBe('analysis') // the checks go in their order
  })

  it('the checks belong to a prototype: on a task only while it has one in play', () => {
    const optional = w([s('idea'), s('research', false, false), s('sketch', false, false), s('mockup', false, false), s('prototype'), s('brief', true)], false)
    const keys = (states: Parameters<typeof rows>[1]) => rows('task', states, optional).map((x) => x.key)
    expect(keys([])).toEqual(['idea', 'prototype', 'brief']) // optional and untouched: nothing is owed for it
    expect(keys([{ key: 'prototype', status: 'started' }])).toEqual(['idea', 'prototype', 'analysis', 'adr', 'risk', 'audit', 'final', 'brief']) // begun: its checks come with it
    expect(keys([{ key: 'prototype', status: 'skipped' }])).toEqual(['idea', 'prototype', 'brief']) // skipped: they go
    expect(rows('task', [{ key: 'prototype', status: 'started' }], optional).filter((x) => x.required).map((x) => x.key)).toEqual(['analysis', 'adr', 'risk', 'audit', 'final', 'brief'])
    expect(rows('project', [{ key: 'prototype', status: 'done' }], optional).map((x) => x.key)).toEqual(['idea', 'prototype']) // a project's prototype has no checks
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

  it('keeps the brief outside the order: open from the start, nothing waits on it; it waits on the required steps, never on the checks', () => {
    const by = { by: 'sam', at: 'now' }
    const draft = rows('task', [{ key: 'brief', status: 'started' }], proto)
    expect(draft.at(-1)).toMatchObject({ key: 'brief', position: null, waitingOn: null })
    expect(owed([{ key: 'brief', status: 'done' }], proto)).toEqual(['idea', 'mockup', 'prototype'])
    const shown = [{ key: 'idea' as const, status: 'done' as const }, { key: 'mockup' as const, status: 'done' as const, approved: by }, { key: 'prototype' as const, status: 'done' as const, approved: by }]
    expect(owed(shown, proto)).toEqual([]) // the brief can be approved before the checks are in
    expect(checksOwed(shown, proto)).toEqual(['analysis', 'adr', 'risk', 'audit', 'final']) // the build waits for them instead
    expect(checksOwed([...shown, ...(['analysis', 'adr', 'risk', 'audit', 'final'] as const).map((key) => ({ key, status: 'done' as const }))], proto)).toEqual([])
    expect(checksOwed([], ui)).toEqual([]) // no prototype: nothing to wait for
    expect(owed([], null)).toEqual([])
  })

  it('counts a task\'s brief as finished only once approved, and blocks completing until then; a prototype\'s checks block completing too', () => {
    const by = { by: 'x', at: 'y' }
    expect(blocking([{ key: 'brief', status: 'done' }], null)).toEqual(['brief'])
    expect(blocking([{ key: 'brief', status: 'done', approved: by }], null)).toEqual([])
    const optional = w([s('idea'), s('research', false, false), s('sketch', false, false), s('mockup', false, false), s('prototype'), s('brief', true)], false)
    expect(blocking([{ key: 'brief', status: 'done', approved: by }], optional)).toEqual([]) // never prototyped: nothing more
    expect(blocking([{ key: 'brief', status: 'done', approved: by }, { key: 'prototype', status: 'done', approved: by }], optional)).toEqual(['analysis', 'adr', 'risk', 'audit', 'final'])
  })
})

describe('the fixed rules', () => {
  it('an optional step is done or skipped, never just left: the brief waits on the undecided ones', () => {
    const wf = w([s('idea'), s('research'), s('sketch', false, false), s('mockup', true), s('prototype'), s('brief', true)], false)
    expect(undecided([], wf)).toEqual(['research', 'prototype']) // the idea is a fact, not work; sketches are switched off; mockups are required
    expect(undecided([{ key: 'research', status: 'skipped' }, { key: 'prototype', status: 'started' }], wf)).toEqual(['prototype']) // started is not decided
    expect(undecided([{ key: 'research', status: 'skipped' }, { key: 'prototype', status: 'done', approved: { by: 'sam', at: 'now' } }], wf)).toEqual([])
    expect(settled({ key: 'research', status: 'skipped' }, 'task')).toBe(true)
    expect(finished({ key: 'research', status: 'skipped' }, 'task')).toBe(false) // skipped is not done
    expect(canSkip({ key: 'mockup', required: true })).toBe(false)
    expect(canSkip({ key: 'brief', required: false })).toBe(false)
    expect(owed([{ key: 'research', status: 'skipped' }], wf)).toEqual(['mockup']) // what is required is still owed
  })

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
    expect(old.steps.map((x) => x.key)).toEqual(['idea', 'research', 'sketch', 'mockup', 'prototype', 'analysis', 'adr', 'risk', 'audit', 'final', 'brief']) // the brief, wherever it was saved, goes last; the prototype brings its checks
    const off = normalize(w([s('idea'), s('sketch', false, false), s('mockup'), s('prototype'), s('brief', true)]))
    expect(off.steps.find((x) => x.key === 'sketch')).toMatchObject({ on: false }) // switched off by the person: stays off
    expect(validOrder([s('idea'), s('sketch'), s('mockup'), s('brief'), s('prototype')])).toBe(true)
  })

  it('the checks are not a workflow\'s to choose: all four after a prototype, none without, whatever was saved', () => {
    expect(normalize(ui).steps.some((x) => ['analysis', 'adr', 'risk', 'audit', 'final'].includes(x.key))).toBe(false) // its prototype is off
    const saved = normalize(w([s('idea'), s('research'), s('sketch'), s('mockup'), s('risk', false), s('prototype'), s('brief', true), s('audit', true)])) // saved when they were choices: one optional, one missing
    expect(saved.steps.map((x) => [x.key, x.required])).toEqual([['idea', false], ['research', false], ['sketch', false], ['mockup', false], ['prototype', false], ['analysis', true], ['adr', true], ['risk', true], ['audit', true], ['final', true], ['brief', true]])
    expect(validOrder(saved.steps)).toBe(true)
    expect(normalize(w([s('idea'), s('adr', true), s('brief', true)])).steps.some((x) => x.key === 'adr')).toBe(false) // a check saved without a prototype is dropped
    expect(removeCheck(saved, 'adr').steps.some((x) => x.key === 'adr')).toBe(true) // nothing takes one out
    expect(addCheck(ui, 'adr').steps.some((x) => x.key === 'adr')).toBe(false) // nor puts one in
    expect(canRemove('adr')).toBe(false)
  })
})
