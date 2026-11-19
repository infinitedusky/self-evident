/** After the build, the checklist: which step comes next, the requirements in the check, what is sent back, and the probe. Pure. */
import { describe, expect, it } from 'vitest'
import type { Criterion } from './acceptance.js'
import { DEFAULT_REQUIREMENTS } from './requirements.js'
import { afterBuild, CHECK_TITLE, checkTaskBrief, finishBrief, FINISH_TITLE, MAX_ROUNDS, LEAVE_LONG_RUNS, numbered, readVerdicts, reqId, requirementsChecked, unmetOf } from './verify.js'
import { ONE_GO_TITLE, oneGoBrief, oneGoProposal, validateProposal } from './planner.js'

const at = '2026-11-16T00:00:00.000Z'
const criteria: Criterion[] = [
  { id: 'ac_1', text: 'The file has every order (sample)', check: 'export.test.ts', by: 'user', at },
  { id: 'ac_2', text: 'Running it twice makes no duplicates (sample)', by: 'user', at },
]

describe('what comes next once a task is built', () => {
  const on = (titles: string[], unmet = 0, more: { listed?: boolean; testCmd?: boolean; loop?: boolean; probe?: 'run' | 'fix' | 'stuck' | 'done' } = {}) => afterBuild({ titles, listed: more.listed ?? true, unmet, commands: more.testCmd ?? true, loop: more.loop, probe: more.probe ?? (titles.some((t) => t.startsWith('Probe: ')) ? 'done' : 'run') })
  const B = ONE_GO_TITLE, C = CHECK_TITLE, F = FINISH_TITLE, P = 'Probe: Try to break it'
  it('check, then the probe, then the whole test run, when the check finds everything done', () => {
    expect(on([B])).toEqual({ do: 'check', round: 1 })
    expect(on([B, C])).toEqual({ do: 'probe' })
    expect(on([B, C, P])).toEqual({ do: 'test' })
    expect(on([B, C, P], 0, { testCmd: false })).toEqual({ do: 'done' })
  })
  it('what the check found is sent back and checked again, three rounds at most, then it stops for a person', () => {
    expect(on([B, C], 2)).toEqual({ do: 'finish', round: 1 })
    expect(on([B, C, F], 2)).toEqual({ do: 'check', round: 2 }) // a finish landed: look again, whatever the old count says
    expect(on([B, C, F, numbered(C, 2)], 1)).toEqual({ do: 'finish', round: 2 })
    expect(on([B, C, F, numbered(C, 2), numbered(F, 2), numbered(C, 3)], 1)).toEqual({ do: 'finish', round: 3 })
    const three = [B, C, F, numbered(C, 2), numbered(F, 2), numbered(C, 3), numbered(F, 3), numbered(C, 4)]
    expect(on(three, 1)).toEqual({ do: 'stuck' }); expect(MAX_ROUNDS).toBe(3)
    expect(on(three, 0)).toEqual({ do: 'probe' }) // the third round did it
    expect(on([B, C, F, numbered(C, 2)], 0)).toEqual({ do: 'probe' })
  })
  it('with nothing to check it goes to the probe; a fix after the test run is not probed again', () => {
    expect(on([B], 0, { listed: false })).toEqual({ do: 'probe' })
    expect(on([B, C, P, 'Fix what the whole test run found'])).toEqual({ do: 'test' })
    // What the probes found is sent back, and after three rounds it is a person's.
    expect(on([B, C, P], 0, { probe: 'fix' })).toEqual({ do: 'probe_fix' }); expect(on([B, C, P], 0, { probe: 'stuck' })).toEqual({ do: 'probe_stuck' })
    expect(on([B, C], 2, { probe: 'run' })).toEqual({ do: 'finish', round: 1 }) // never before the list is done
  })
  it('Legacy is as it was: its criteria checked once, then the test run; no finish, no probe', () => {
    expect(on(['A', 'B'], 0, { loop: false })).toEqual({ do: 'check', round: 1 })
    expect(on(['A', 'B', C], 3, { loop: false, listed: false })).toEqual({ do: 'test' })
    expect(on(['A'], 0, { loop: false, listed: false, testCmd: false })).toEqual({ do: 'done' })
  })
})

describe('the list a build is checked against', () => {
  const required = DEFAULT_REQUIREMENTS.slice(0, 3) // telemetry, tests, test_plan
  it('the check is asked about the criteria and the requirements, each under its id', () => {
    const b = checkTaskBrief(criteria, required)
    expect(b).toContain('[ac_1] The file has every order (sample)'); expect(b).toContain('[req_telemetry] Telemetry:'); expect(b).toContain('[req_tests] Tests:')
    expect(b).toContain('does not apply'); expect(b).toContain('Check, do not build')
    expect(checkTaskBrief([criteria[1]], [], { round: 2 })).toMatch(/^Check 2: the last check found these not done/)
    // What would take it a long run is left to the person, not swept.
    expect(b).toContain('when checking it would take you more than about two minutes of running'); expect(b).toContain('do not run or write a sweep')
    expect(LEAVE_LONG_RUNS).toContain('do not run it and do not write a script that does')
  })
  it('its verdicts mark the requirements: done, not done with what is missing, does not apply, or left alone', () => {
    const v = readVerdicts('```acceptance\n[{"id":"req_telemetry","met":false,"evidence":"no span on a failed export"},{"id":"req_tests","met":true,"evidence":"export.test.ts"},{"id":"req_test_plan","met":true,"evidence":"does not apply: nothing a person does changes"},{"id":"ac_2","met":false,"evidence":"the second run adds a row"}]\n```', [...criteria.map((c) => c.id), ...required.map((r) => reqId(r.key))])
    const held = [{ key: 'tests', name: 'Tests', applies: true, how: 'the plan said: a totals test' }]
    const got = requirementsChecked(required, held, v)
    expect(got).toEqual([
      { key: 'telemetry', name: 'Telemetry', applies: true, how: 'no span on a failed export', built: false },
      { key: 'tests', name: 'Tests', applies: true, how: 'export.test.ts', built: true },
      { key: 'test_plan', name: 'Test plan', applies: false, how: 'does not apply: nothing a person does changes', built: true },
    ])
    expect(requirementsChecked(required, held, [])[1]).toEqual(held[0]) // no verdict: what was held stands
    const marked: Criterion[] = [criteria[0], { ...criteria[1], built: false, builtEvidence: 'the second run adds a row' }]
    const unmet = unmetOf(marked, got, required)
    expect(unmet.map((u) => u.id)).toEqual(['ac_2', 'req_telemetry'])
    expect(unmetOf(marked, got, required.map((r) => (r.key === 'telemetry' ? { ...r, blocks: false } : r))).map((u) => u.id)).toEqual(['ac_2']) // set to report only: not sent back
    const f = finishBrief(unmet, 2)
    expect(f).toContain('these 2 not done (round 2 of 3)'); expect(f).toContain('[ac_2] Running it twice makes no duplicates (sample)\n  Missing: the second run adds a row'); expect(f).toContain('[req_telemetry] Telemetry:')
    expect(finishBrief([unmet[0]], 1)).toMatch(/^A check of what was built found this not done\. Do it, and nothing else/)
  })
})

describe('a task built in one go', () => {
  it('has one sub-task, with the list it will be checked against and the prototype to build from', () => {
    const brief = oneGoBrief({ criteria, required: DEFAULT_REQUIREMENTS.slice(0, 2), prototype: { branch: 'prototype/export-ab12', path: '/tmp/sample/prototype--export-ab12' }, base: 'main' })
    for (const s of ['in this one go', 'git diff main...prototype/export-ab12', '[ac_1] The file has every order (sample)', '- telemetry (Telemetry):', 'another agent checks every line above']) expect(brief).toContain(s)
    expect(oneGoBrief({ criteria: [], required: [], prototype: null, base: 'main' })).not.toContain('### The prototype')
    expect(oneGoBrief({ criteria, required: [], prototype: { branch: 'b', path: '/p', rough: true }, base: 'main' })).toContain('a rough prototype')
    const p = oneGoProposal(brief)
    expect(() => validateProposal(p)).not.toThrow()
    expect(p.phases.map((x) => [x.title, x.files, x.depends_on])).toEqual([[ONE_GO_TITLE, [], []]]) // it claims every file: there is nobody to share with
    expect(p.questions).toEqual([]); expect(p.decisions).toEqual([])
  })
})
