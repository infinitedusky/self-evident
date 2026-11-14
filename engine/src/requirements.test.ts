/** Requirements: the app's list, a project's switches, what the planner is told and what the merge guide reports. Pure. */
import { describe, expect, it } from 'vitest'
import { covered, coveredLines, DEFAULT_REQUIREMENTS, inForce, requirementLines, requirementsOf } from './requirements.js'
import { prompt, PROPOSAL_SCHEMA } from './planner.js'
import { taskGuide } from './merge-guide.js'

describe('requirements', () => {
  it('an app starts with telemetry, tests, a test plan and docs; its own list replaces them', () => {
    expect(requirementsOf({}).map((r) => r.key)).toEqual(['telemetry', 'tests', 'test_plan', 'docs'])
    expect(requirementsOf(null)).toEqual(DEFAULT_REQUIREMENTS)
    const own = { requirements: [{ name: 'Works offline', what: 'Every screen opens with no network.' }, { name: ' ', what: 'no name: dropped' }, { key: 'tests', name: 'Tests', what: 'x', on: false }, { name: 'Works offline', what: 'twice: once' }] }
    expect(requirementsOf(own)).toEqual([{ key: 'works_offline', name: 'Works offline', what: 'Every screen opens with no network.', on: true }, { key: 'tests', name: 'Tests', what: 'x', on: false }])
    expect(requirementsOf({ requirements: [] })).toEqual([]) // an app can ask for none
  })
  it('a project switches one off or on for its own tasks', () => {
    expect(inForce({}, { docs: false }).map((r) => r.key)).toEqual(['telemetry', 'tests', 'test_plan'])
    expect(inForce({ requirements: [{ key: 'tests', name: 'Tests', what: 'x', on: false }] }, { tests: true }).map((r) => r.key)).toEqual(['tests'])
    expect(inForce({}, null)).toHaveLength(4)
  })
  it('the planner is told each one and must answer each', () => {
    const base = { repoPath: '/tmp/x', appId: 'a', issue: { identifier: 'SS-1', title: 'T', brief: 'b' }, acceptance: null, project: { name: 'P', content: null }, earlier: [], onEvent: async () => {} } as never as Parameters<typeof prompt>[0]
    const text = prompt({ ...base, requirements: inForce({}) })
    expect(text).toContain('- telemetry (Telemetry): ')
    expect(text).toContain('one entry per requirement above, by its key')
    expect(prompt({ ...base, requirements: [] })).toContain('this app asks for none')
    expect((PROPOSAL_SCHEMA as { required: string[] }).required).toContain('requirements')
  })
  it('what the planner said is lined up with what was required; one it skipped is kept as not addressed', () => {
    const got = covered(inForce({}), [{ key: 'tests', applies: true, how: 'SS-2 adds the totals test.' }, { key: 'docs', applies: false, how: 'Nothing a person reads changes.' }, { key: 'made_up', applies: true, how: 'ignored' }])
    expect(got.map((c) => [c.key, c.applies, c.how])).toEqual([['telemetry', true, ''], ['tests', true, 'SS-2 adds the totals test.'], ['test_plan', true, ''], ['docs', false, 'Nothing a person reads changes.']])
    const lines = coveredLines(got)
    expect(lines).toContain('- ⬜ **Telemetry**: the plan does not say.')
    expect(lines).toContain('- ✅ **Tests**: SS-2 adds the totals test.')
    expect(lines).toContain('- ➖ **Docs** does not apply: Nothing a person reads changes.')
    expect(requirementLines(inForce({}))).toContain('- docs (Docs): ')
  })
  it('the merge guide reports them', () => {
    const guide = taskGuide({ identifier: 'SS-1', title: 'T', acceptance: [], decisions: [], pending: [], requirements: covered(inForce({}), [{ key: 'tests', applies: true, how: 'Covered.' }]) })
    expect(guide).toContain('**What this app requires of every change**')
    expect(guide).toContain('✅ **Tests**: Covered.')
    expect(taskGuide({ identifier: 'SS-1', title: 'T', acceptance: [], decisions: [], pending: [] })).not.toContain('requires of every change')
  })
})
