/**
 * The checks after a prototype is approved: which comes next, from what is stored, and what each fresh agent is told.
 * No agent runs here; `nextMove` is the whole order.
 */
import { describe, expect, it } from 'vitest'
import { checkBrief, finalizeBrief, nextMove, reportsIn, type CheckFacts } from './checks.js'
import { CHECKS, type StepKey } from './steps.js'

const all = (done: StepKey[] = [], out: StepKey[] = []) => CHECKS.map((key) => ({ key, done: done.includes(key), out: out.includes(key) }))
const idle = { busy: false, askedToFinalize: false, toldDone: false }

describe('the checks after the prototype is approved', () => {
  it('run in order: analysis, ADR, blast radius, the brief brought up to date, the audit, then the conductor is told', () => {
    expect(CHECKS).toEqual(['analysis', 'adr', 'risk', 'audit'])
    const at = (done: StepKey[], out: StepKey[] = [], conductor = idle) => nextMove({ approved: true, checks: all(done, out), hasPrototype: true, conductor })
    expect(at([])).toEqual({ do: 'run', key: 'analysis' })
    expect(at([], ['analysis'])).toEqual({ do: 'nothing' }) // its agent is on it
    expect(at(['analysis'], ['analysis'])).toEqual({ do: 'run', key: 'adr' })
    expect(at(['analysis', 'adr'])).toEqual({ do: 'run', key: 'risk' })
    expect(at(['analysis', 'adr', 'risk'])).toEqual({ do: 'finalize' })
    expect(at(['analysis', 'adr', 'risk'], [], { ...idle, askedToFinalize: true, busy: true })).toEqual({ do: 'nothing' }) // the conductor is writing the brief
    expect(at(['analysis', 'adr', 'risk'], [], { ...idle, askedToFinalize: true })).toEqual({ do: 'run', key: 'audit' })
    expect(at(['analysis', 'adr', 'risk'], ['audit'], { ...idle, askedToFinalize: true })).toEqual({ do: 'nothing' })
    expect(at(CHECKS, [], { ...idle, askedToFinalize: true })).toEqual({ do: 'tell' })
    expect(at(CHECKS, [], { busy: false, askedToFinalize: true, toldDone: true })).toEqual({ do: 'nothing' }) // said once
  })

  it('wait for the person: nothing runs before the prototype is approved', () => {
    expect(nextMove({ approved: false, checks: all(), hasPrototype: true, conductor: idle })).toEqual({ do: 'nothing' })
  })

  it('run only what the workflow has, and skip the analysis when there is no prototype to read', () => {
    const only = (keys: StepKey[], done: StepKey[] = []) => keys.map((key) => ({ key, done: done.includes(key), out: false }))
    expect(nextMove({ approved: true, checks: [], hasPrototype: true, conductor: idle })).toEqual({ do: 'nothing' })
    expect(nextMove({ approved: true, checks: only(['risk']), hasPrototype: true, conductor: idle })).toEqual({ do: 'run', key: 'risk' })
    expect(nextMove({ approved: true, checks: only(['risk'], ['risk']), hasPrototype: true, conductor: idle })).toEqual({ do: 'tell' })
    expect(nextMove({ approved: true, checks: only(['audit']), hasPrototype: true, conductor: idle })).toEqual({ do: 'run', key: 'audit' }) // no reports to write in first
    expect(nextMove({ approved: true, checks: all(), hasPrototype: false, conductor: idle })).toEqual({ do: 'run', key: 'adr' })
    expect(nextMove({ approved: true, checks: only(['analysis']), hasPrototype: false, conductor: idle })).toEqual({ do: 'nothing' })
  })

  it('carry on without a conductor: the audit reads the brief as it stands, and no one is told', () => {
    expect(nextMove({ approved: true, checks: all(['analysis', 'adr', 'risk']), hasPrototype: true, conductor: null })).toEqual({ do: 'run', key: 'audit' })
    expect(nextMove({ approved: true, checks: all(CHECKS), hasPrototype: true, conductor: null })).toEqual({ do: 'nothing' })
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
