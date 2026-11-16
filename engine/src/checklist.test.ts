/** Where a checklist task stands: its stages from its sub-tasks, pure. */
import { describe, expect, it } from 'vitest'
import { stagesOf } from './checklist.js'
import { CHECK_TITLE, FINISH_TITLE, PROBE_TITLE } from './verify.js'

const B = 'Build it'
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
    expect(at([...done, [PROBE_TITLE, 'running']], { met: 5 })[2]).toEqual(['probe', 'doing', 'an agent that did not build it is trying it'])
    expect(at([...done, [PROBE_TITLE, 'done']], { met: 5, tested: true }).slice(2)).toEqual([['probe', 'done', 'tried to break it, and cleaned up'], ['test', 'done', 'the whole run passed']])
    expect(at([...done, [PROBE_TITLE, 'done']], { met: 5, tested: false })[3]).toEqual(['test', 'failed', 'the whole run failed'])
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the whole test run found', 'running']], { met: 5, tested: false })[3]).toEqual(['test', 'doing', 'fixing what the run found'])
    expect(at([...done, [PROBE_TITLE, 'done'], ['Fix what the whole test run found', 'done']], { met: 5, tested: true })[3]).toEqual(['test', 'done', 'the whole run passed, after 1 fix'])
  })
})
