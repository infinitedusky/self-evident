/** Where a checklist task stands: its stages from its sub-tasks, pure. */
import { describe, expect, it } from 'vitest'
import { flowOf, stagesOf } from './checklist.js'
import { CHECK_TITLE, FINISH_TITLE } from './verify.js'
const PROBE_TITLE = 'Probe: Try to break it'

const B = 'Build it'
it('the whole run under way is said, whatever it last was', () => {
  const s = stagesOf({ subs: [{ title: 'Build it', status: 'done' }], build: 'one', unmet: 0, met: 5, total: 5, hasTests: true, tested: false, testing: true }).find((x) => x.key === 'test')
  expect([s?.state, s?.detail]).toEqual(['doing', 'the whole run is under way'])
})

const at = (subs: [string, string][], more: Partial<Parameters<typeof stagesOf>[0]> = {}) =>
  stagesOf({ subs: subs.map(([title, status]) => ({ title, status })), build: 'one', unmet: 0, met: 0, total: 5, hasTests: true, tested: null, ...more }).map((s) => [s.key, s.state, s.detail])

describe('the stages of a checklist task', () => {
  it('before anything: not built, a list waiting, the probe and the tests after', () => {
    expect(at([])).toEqual([['build', 'todo', 'not built yet'], ['check', 'todo', '5 to check'], ['probe', 'todo', 'after the check'], ['test', 'todo', 'the whole run, once, last']])
    expect(at([], { hasTests: false }).map((s) => s[0])).toEqual(['build', 'check', 'probe']) // an app with no test command has no tests stage
  })
  it('building in one go, or sub-task by sub-task', () => {
    expect(at([[B, 'running']])[0]).toEqual(['build', 'doing', 'building, in one go'])
    expect(at([[B, 'done']])[0]).toEqual(['build', 'done', 'built in one go'])
    expect(at([[B, 'failed']])[0]).toEqual(['build', 'failed', 'the build failed'])
    expect(at([['Cart', 'done'], ['Pay', 'running'], ['Email', 'queued']], { build: 'planned' })[0]).toEqual(['build', 'doing', '1 of 3 sub-tasks'])
  })
  it('the check says its round, what was sent back, and when the list is met', () => {
    expect(at([[B, 'done'], [CHECK_TITLE, 'running']])[1]).toEqual(['check', 'doing', 'round 1'])
    expect(at([[B, 'done'], [CHECK_TITLE, 'done']], { unmet: 2, met: 3 })[1]).toEqual(['check', 'doing', 'round 1: 2 not done, sent back'])
    expect(at([[B, 'done'], [CHECK_TITLE, 'done'], [FINISH_TITLE, 'running']], { unmet: 2, met: 3 })[1]).toEqual(['check', 'doing', 'round 1: 2 not done, sent back'])
    expect(at([[B, 'done'], [CHECK_TITLE, 'done'], [FINISH_TITLE, 'done'], [`${CHECK_TITLE} (2)`, 'done']], { met: 5 })[1]).toEqual(['check', 'done', '5 of 5 met, in 2 rounds'])
    expect(at([[B, 'done'], [CHECK_TITLE, 'done']], { met: 5 })[1]).toEqual(['check', 'done', '5 of 5 met'])
  })
  it('three rounds and still not done: it is the person\'s', () => {
    const three: [string, string][] = [[B, 'done'], [CHECK_TITLE, 'done'], [FINISH_TITLE, 'done'], [`${CHECK_TITLE} (2)`, 'done'], [`${FINISH_TITLE} (2)`, 'done'], [`${CHECK_TITLE} (3)`, 'done'], [`${FINISH_TITLE} (3)`, 'done'], [`${CHECK_TITLE} (4)`, 'done']]
    expect(at(three, { unmet: 1, met: 4 })[1]).toEqual(['check', 'failed', '1 still not done after 3 rounds: yours'])
  })
  it('the probe, then the whole test run and its fixes', () => {
    const done: [string, string][] = [[B, 'done'], [CHECK_TITLE, 'done']]
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the probes found', 'running']], { met: 5 })[2]).toEqual(['probe', 'doing', 'fixing what the probes found'])
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the probes found', 'done'], ['Probe: Try to break it (2)', 'done']], { met: 5 })[2]).toEqual(['probe', 'done', 'probed, and what the probes found was fixed'])
    expect(at([...done, ['Try to break it, and clean up', 'done']], { met: 5 })[2][1]).toBe('done') // one probed the old way still reads as probed
    expect(at([...done, [PROBE_TITLE, 'running']], { met: 5 })[2]).toEqual(['probe', 'doing', 'agents that did not build it are trying it'])
    expect(at([...done, [PROBE_TITLE, 'done']], { met: 5, tested: true }).slice(2)).toEqual([['probe', 'done', 'probed: nothing to send back'], ['test', 'done', 'the whole run passed']])
    expect(at([...done, [PROBE_TITLE, 'done']], { met: 5, tested: false })[3]).toEqual(['test', 'failed', 'the whole run failed'])
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the whole test run found', 'running']], { met: 5, tested: false })[3]).toEqual(['test', 'doing', 'fixing what the run found'])
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the whole test run found', 'done']], { met: 5, tested: true })[3]).toEqual(['test', 'done', 'the whole run passed, after 1 fix'])
  })
})

describe('the flow of a checklist task, as nodes', () => {
  const stages = (subs: [string, string][], more: Partial<Parameters<typeof stagesOf>[0]> = {}) => stagesOf({ subs: subs.map(([title, status]) => ({ title, status })), build: 'one', unmet: 0, met: 0, total: 5, hasTests: true, tested: null, ...more })
  const flow = (subs: [string, string][], more: Partial<Parameters<typeof stagesOf>[0]> = {}) =>
    flowOf({ subs: subs.map(([title, status], n) => ({ id: `s${n}`, title, status, sortOrder: n })), stages: stages(subs, more), build: more.build ?? 'one' }).map((n) => [n.id, n.after, n.state])
  it('is whole before anything has started: the build, the check, the probe and the tests, each after the one before', () => {
    expect(flow([])).toEqual([['flow:build', [], 'todo'], ['flow:check', ['flow:build'], 'todo'], ['flow:probe', ['flow:check'], 'todo'], ['flow:test', ['flow:probe'], 'todo']])
    expect(flowOf({ subs: [], stages: stages([]), build: 'one' }).map((n) => n.title)).toEqual(['Build it', 'Check it against its list', 'Probes', 'The whole test run'])
    expect(flowOf({ subs: [], stages: stages([], { build: 'planned' }), build: 'planned' })[0].title).toBe('Planned into sub-tasks, and built')
    expect(flow([], { hasTests: false }).map((n) => n[0])).toEqual(['flow:build', 'flow:check', 'flow:probe']) // an app with no test command
  })
  it('a sub-task takes its stage\'s place as it is made, and what is to come follows the last one there is', () => {
    expect(flow([[B, 'running']])).toEqual([['s0', null, 'doing'], ['flow:check', ['s0'], 'todo'], ['flow:probe', ['flow:check'], 'todo'], ['flow:test', ['flow:probe'], 'todo']])
    // Sent back once: the check, the finish and the second check in a line, then the probe that is to come.
    expect(flow([[B, 'done'], [CHECK_TITLE, 'done'], [FINISH_TITLE, 'done'], [`${CHECK_TITLE} (2)`, 'running']], { met: 4, unmet: 1 }))
      .toEqual([['s0', null, 'done'], ['s1', ['s0'], 'done'], ['s2', ['s1'], 'done'], ['s3', ['s2'], 'doing'], ['flow:probe', ['s3'], 'todo'], ['flow:test', ['flow:probe'], 'todo']])
  })
  it('planned into sub-tasks: each keeps its own dependencies, and the check follows them all', () => {
    const f = flow([['Cart', 'done'], ['Pay', 'done'], [CHECK_TITLE, 'running']], { build: 'planned' })
    expect(f.slice(0, 3)).toEqual([['s0', null, 'done'], ['s1', null, 'done'], ['s2', ['s0', 's1'], 'doing']])
  })
  it('the smoke test stays a stage when the check verified everything itself: done, and still the person\'s to open', () => {
    const none = { todo: 0, failed: 0, total: 0 }
    expect(stages([[B, 'done'], [CHECK_TITLE, 'done'], [PROBE_TITLE, 'done']], { met: 5, tested: true, byHand: none }).at(-1)).toEqual({ key: 'smoke', label: 'Smoke test', state: 'done', detail: 'nothing left to you; look anyway' })
    expect(stages([[B, 'running']], { byHand: none }).at(-1)).toMatchObject({ key: 'smoke', state: 'todo', detail: 'yours, after the check' }) // not checked yet: nobody knows what will be left
    expect(stages([[B, 'done']]).some((x) => x.key === 'smoke')).toBe(false) // a task the smoke test is not asked about
  })
  it('a fix after a failed test run sits before the run it leads back to; the smoke test is last, when there is one', () => {
    const all: [string, string][] = [[B, 'done'], [CHECK_TITLE, 'done'], [PROBE_TITLE, 'done'], ['Fix what the whole test run found', 'running']]
    expect(flow(all, { met: 5, tested: false, byHand: { todo: 2, failed: 0, total: 2 } }).slice(2))
      .toEqual([['s2', ['s1'], 'done'], ['s3', ['s2'], 'doing'], ['flow:test', ['s3'], 'doing'], ['flow:smoke', ['flow:test'], 'todo']])
    expect(flow([[B, 'done'], [CHECK_TITLE, 'done'], [PROBE_TITLE, 'done']], { met: 5, tested: true, byHand: { todo: 1, failed: 0, total: 1 } }).slice(-2)).toEqual([['flow:test', ['s2'], 'done'], ['flow:smoke', ['flow:test'], 'doing']])
  })
})
