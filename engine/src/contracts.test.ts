/** The steps' contracts as an app sees them, and a change made on Settings › Skills as a change to its settings. Sample data. */
import { describe, expect, it } from 'vitest'
import { applyFinalizeChange, contractsOf, CONTRACTS, finalizingOf, heldTo, TAKES_SKILLS } from './contracts.js'
import { CHECKS, DEFAULT_STEPS, type Workflow } from './steps.js'

const main: Workflow = { id: 'w1', name: 'Main', ordered: false, build: 'one', style: 'checklist', requirements: { adr: true }, steps: [...DEFAULT_STEPS.map((s) => ({ ...s, on: ['idea', 'brief', 'research', 'prototype'].includes(s.key) })), ...CHECKS.map((key) => ({ key, on: false, required: false }))] } // as Main is: no check between the prototype and the build
const usable = [{ name: 'ticket-naming-convention', label: 'ticket-naming-convention', from: 'this repo' }, { name: 'self-evident:prototype', label: 'prototype', from: 'self-evident' }]
const setup = { test_cmd: 'pnpm test', step_skills: { build: ['ticket-naming-convention', 'gone'], prototype: ['self-evident:prototype'] }, probes: [{ name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { key: 'comments', on: false }] }

describe('contractsOf', () => {
  const groups = contractsOf({ setup, workflow: main, usable })
  const stepOf = (k: string) => groups.flatMap((g) => g.steps).find((s) => s.key === k)!
  it('shows only the steps the workflow uses, then the build, the smoke test and the pull request', () => {
    expect(groups.map((g) => g.steps.map((s) => s.key))).toEqual([['research', 'brief', 'prototype'], ['build', 'smoke', 'pr']]) // no blast radius on Main
    expect(contractsOf({ setup: {} })[0].steps.map((s) => s.key)).toContain('risk') // with no workflow to go by, every step
  })
  it('every step has a contract, and its stages say who runs them', () => {
    for (const s of groups.flatMap((g) => g.steps)) { expect(s.needs.length).toBeGreaterThan(0); expect(s.done).toBeTruthy(); expect(s.stages.length).toBeGreaterThan(0) }
    expect(stepOf('build').stages.map((s) => [s.key, s.by])).toEqual([['prepare', 'engine'], ['do', 'agent'], ['verify', 'engine'], ['report', 'agent']])
    expect(TAKES_SKILLS).toContain('build'); expect(TAKES_SKILLS).not.toContain('smoke'); expect(Object.keys(CONTRACTS)).not.toContain('idea')
  })
  it('skills sit on the stage an agent does: the app\'s, one gone marked missing, and the one every prototype has', () => {
    expect(stepOf('build').stages[1].skills).toEqual([{ name: 'ticket-naming-convention', label: 'ticket-naming-convention', from: 'this repo' }, { name: 'gone', label: 'gone', from: '', missing: true }])
    expect(stepOf('prototype').stages[1].skills).toEqual([{ name: 'self-evident:prototype', label: 'prototype', from: 'self-evident', fixed: true }])
    expect(stepOf('build').stages[0].skills).toBeUndefined(); expect(stepOf('smoke').stages[1].skills).toBeUndefined()
  })
  it('the build is held to one list: the criteria, the requirements, the agents\' probes, then the commands', () => {
    const held = stepOf('build').stages[2].probes!
    expect(held.map((p) => [p.key, p.kind])).toEqual([['criteria', 'built-in'], ['req:telemetry', 'judged'], ['req:tests', 'judged'], ['req:test_plan', 'judged'], ['req:docs', 'judged'], ['req:adr', 'judged'], ['req:risks', 'judged'], ['break', 'built-in'], ['comments', 'built-in'], ['tests', 'command'], ['lint', 'command']])
    expect(held.find((p) => p.key === 'req:adr')).toMatchObject({ on: true, from: 'Main', editable: true }); expect(held.find((p) => p.key === 'req:risks')).toMatchObject({ on: false }); expect(held.find((p) => p.key === 'req:risks')).not.toHaveProperty('from')
    expect(held.find((p) => p.key === 'comments')).toMatchObject({ on: false, blocks: false, own: false, changed: true }); expect(held.find((p) => p.key === 'lint')).toMatchObject({ own: true, editable: true, runs: 'pnpm lint' })
    expect(held.filter((p) => p.fixed).map((p) => p.key)).toEqual(['criteria']) // the one row an app cannot change
    expect(heldTo({}).find((p) => p.key === 'tests')).toMatchObject({ runs: '', on: false, editable: true }) // no test command yet: the row is there to give it one
  })
  it('a staged workflow is held to its criteria and the test run only', () => {
    expect(heldTo(setup, { ...main, style: 'staged' }).map((p) => p.key)).toEqual(['criteria', 'tests'])
  })
})

describe('the pull request\'s finalizing, as Settings shows it', () => {
  it('lists its five steps in order, then the six gate checks, on the engine\'s Verify stage', () => {
    const pr = contractsOf({ setup: {} })[1].steps.find((s) => s.key === 'pr')!
    expect(pr.stages.map((s) => [s.key, s.by])).toEqual([['verify', 'engine'], ['do', 'person']])
    const rows = pr.stages[0].finalize!
    expect(rows.map((r) => r.key)).toEqual(['trajectory', 'mutation', 'review', 'gate', 'evidence', 'gate:github', 'gate:commands', 'gate:title', 'gate:description', 'gate:rollback', 'gate:smoke'])
    expect(rows.filter((r) => !r.fixed).map((r) => r.key)).toEqual(['mutation']) // the one part an app sets
    expect(rows.find((r) => r.key === 'mutation')).toMatchObject({ on: true, set: { off: false, tool: null, testCmd: null, prepare: null, max: 150, maxDefault: 150 } })
  })
  it('reads the app\'s mutation settings and its prepare command', () => {
    const m = finalizingOf({ mutation: { off: true, test_cmd: 'pytest {files}', max: 40 }, finalize: { prepare: 'uv sync' } }).find((r) => r.key === 'mutation')!
    expect(m).toMatchObject({ on: false, set: { testCmd: 'pytest {files}', prepare: 'uv sync', max: 40 } })
  })
  it('a change is kept as the two settings, and one emptied is removed', () => {
    expect(applyFinalizeChange({}, { off: true })).toEqual({ mutation: { off: true }, finalize: null })
    expect(applyFinalizeChange({ mutation: { off: true, test_cmd: 'pytest {files}' }, finalize: { prepare: 'uv sync' } }, { off: false, testCmd: '', prepare: 'uv sync --all-extras', max: 60, tool: { cmd: 'npx stryker run', report: 'reports/mutation.json' } }))
      .toEqual({ mutation: { tool: { cmd: 'npx stryker run', report: 'reports/mutation.json' }, max: 60 }, finalize: { prepare: 'uv sync --all-extras' } })
    expect(applyFinalizeChange({ mutation: { max: 60 }, finalize: { prepare: 'uv sync' } }, { max: null, prepare: '' })).toEqual({ mutation: null, finalize: null })
    expect(applyFinalizeChange({ mutation: { max: 60 } }, { tool: { cmd: 'x', report: '' } })).toEqual({ mutation: { max: 60 }, finalize: null }) // a tool with no report is no tool
  })
})
