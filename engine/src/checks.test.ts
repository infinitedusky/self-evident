/**
 * The checks after a prototype is approved: which comes next, from what is stored, and what each fresh agent is told.
 * No agent runs here; `nextMove` is the whole order.
 */
import { describe, expect, it } from 'vitest'
import { BEFORE_PLAN, checkBrief, finalizeBrief, nextMove, reportsIn, type CheckFacts } from './checks.js'
import { CHECKS, type StepKey } from './steps.js'

const all = (done: StepKey[] = [], out: StepKey[] = []) => CHECKS.map((key) => ({ key, done: done.includes(key), out: out.includes(key) }))
const idle = { busy: false, askedToFinalize: false, toldDone: false }

describe('the checks after the prototype is approved', () => {
  it('run in order: analysis, ADR, the plan, the blast radius, the audit, then the conductor is told', () => {
    expect(CHECKS).toEqual(['analysis', 'adr', 'risk', 'audit'])
    expect(BEFORE_PLAN).toEqual(['analysis', 'adr']) // what the plan is made from; the other two read it
    const at = (done: StepKey[], out: StepKey[] = [], extra: object = {}) => nextMove({ approved: true, checks: all(done, out), hasPrototype: true, conductor: idle, briefApproved: true, planned: false, ...extra })
    expect(at([])).toEqual({ do: 'run', key: 'analysis' })
    expect(at([], ['analysis'])).toEqual({ do: 'nothing' }) // its agent is on it
    expect(at(['analysis'], ['analysis'])).toEqual({ do: 'run', key: 'adr' })
    expect(at(['analysis', 'adr'])).toEqual({ do: 'plan' }) // the plan before anything reads it
    expect(at(['analysis', 'adr'], [], { planned: true })).toEqual({ do: 'run', key: 'risk' })
    expect(at(['analysis', 'adr', 'risk'], [], { planned: true })).toEqual({ do: 'run', key: 'audit' }) // an approved brief is not rewritten on the way
    expect(at(['analysis', 'adr', 'risk'], ['audit'], { planned: true })).toEqual({ do: 'nothing' })
    expect(at(CHECKS, [], { planned: true })).toEqual({ do: 'tell' })
    expect(at(CHECKS, [], { planned: true, conductor: { busy: false, askedToFinalize: false, toldDone: true } })).toEqual({ do: 'nothing' }) // said once
    expect(reportsIn(['analysis', 'adr', 'risk', 'audit'], true)).toMatch(/The brief is approved, so do not change it/)
    expect(reportsIn(['analysis', 'adr', 'risk', 'audit'])).not.toMatch(/do not change it/)
  })

  it('the plan is made from an approved brief: until then the conductor brings it up to date once, and the line waits for the person', () => {
    const at = (extra: object = {}) => nextMove({ approved: true, checks: all(['analysis', 'adr']), hasPrototype: true, conductor: idle, briefApproved: false, planned: false, ...extra })
    expect(at()).toEqual({ do: 'finalize' })
    expect(at({ conductor: { ...idle, askedToFinalize: true } })).toEqual({ do: 'nothing' }) // asked once; now it is the person's to approve
    expect(at({ conductor: null })).toEqual({ do: 'nothing' }) // nobody to write it: still the person's
    expect(at({ briefApproved: true })).toEqual({ do: 'plan' }) // approved: on it goes
    expect(at({ planned: true })).toEqual({ do: 'run', key: 'risk' }) // planned by hand meanwhile: the readers read it
  })

  it('wait for the person: nothing runs before the prototype is approved', () => {
    expect(nextMove({ approved: false, checks: all(), hasPrototype: true, conductor: idle })).toEqual({ do: 'nothing' })
  })

  it('skip the analysis when there is no prototype to read, and handle a task that has only some of them', () => {
    const only = (keys: StepKey[], done: StepKey[] = []) => keys.map((key) => ({ key, done: done.includes(key), out: false }))
    const go = { hasPrototype: true, conductor: idle, briefApproved: true, planned: true }
    expect(nextMove({ approved: true, checks: [], ...go })).toEqual({ do: 'nothing' })
    expect(nextMove({ approved: true, checks: only(['risk']), ...go })).toEqual({ do: 'run', key: 'risk' })
    expect(nextMove({ approved: true, checks: only(['risk'], ['risk']), ...go })).toEqual({ do: 'tell' })
    expect(nextMove({ approved: true, checks: all(), ...go, hasPrototype: false })).toEqual({ do: 'run', key: 'adr' })
    expect(nextMove({ approved: true, checks: only(['analysis']), ...go, hasPrototype: false })).toEqual({ do: 'nothing' })
  })

  it('carry on without a conductor: the readers read the plan, and no one is told', () => {
    expect(nextMove({ approved: true, checks: all(['analysis', 'adr', 'risk']), hasPrototype: true, conductor: null, briefApproved: true, planned: true })).toEqual({ do: 'run', key: 'audit' })
    expect(nextMove({ approved: true, checks: all(CHECKS), hasPrototype: true, conductor: null, briefApproved: true, planned: true })).toEqual({ do: 'nothing' })
  })

  it('tell each fresh agent where the prototype is, what came before, and how to hand its report back', () => {
    const f: CheckFacts = { identifier: 'XX-1', title: 'Swing lab (sample)', issueId: 'iss_sample', base: 'main', prototype: { path: '/tmp/proto', branch: 'prototype/swing', title: 'Swing (sample)' }, before: ['analysis'] }
    for (const key of CHECKS) {
      const text = checkBrief(key, { ...f, before: CHECKS.slice(0, CHECKS.indexOf(key)) })
      expect(text).toContain('XX-1')
      expect(text).toContain('/tmp/proto')
      expect(text).toContain(`key ${key}, status done`)
      for (const b of CHECKS.slice(0, CHECKS.indexOf(key))) expect(text).toContain(`${b} (`)
    }
    expect(checkBrief('analysis', f)).not.toMatch(/shortcut/) // a prototype is built the way we would ship it: the analysis checks that, and lists the seams
    expect(checkBrief('analysis', f)).toMatch(/\*\*Requirements\*\*[\s\S]*\*\*Against the conventions\*\*[\s\S]*\*\*Seams and stubs\*\*[\s\S]*\*\*Faked inside the system\*\*/)
    expect(checkBrief('analysis', f)).toMatch(/\*\*Cleaner\*\*[^]*\*Repeats\*[^]*should be one function[^]*\*Simpler\*[^]*more efficient[^]*\*Refactor\*[^]*\*Leave out\*/) // clean-up is part of the analysis
    expect(checkBrief('adr', f)).toMatch(/the reference for the build[\s\S]*its branch is not merged/)
    expect(checkBrief('risk', { ...f, prototype: null })).not.toContain('/tmp/proto')
    expect(() => checkBrief('sketch', f)).toThrow(/not a check/)
    expect(finalizeBrief(['analysis', 'adr', 'risk'], f)).toMatch(/\*\*Prototype\*\* section: the branch prototype\/swing/)
    expect(finalizeBrief(['analysis', 'adr', 'risk'], f)).toMatch(/what the analysis says under Cleaner, as instructions to the builder/)
    expect(reportsIn(['analysis', 'audit'])).toMatch(/fix in the brief what it found/)
    expect(reportsIn(['risk'])).not.toMatch(/brief audit/)
  })
})
