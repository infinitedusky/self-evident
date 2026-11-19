/** The steps' contracts as an app sees them, and a change made on Settings › Skills as a change to its settings. Sample data. */
import { describe, expect, it } from 'vitest'
import { applyProbeChange, contractsOf, CONTRACTS, heldTo, TAKES_SKILLS } from './contracts.js'
import { CHECKS, DEFAULT_STEPS, type Workflow } from './steps.js'

const main: Workflow = { id: 'w1', name: 'Main', ordered: false, build: 'one', style: 'checklist', requirements: { adr: true }, steps: [...DEFAULT_STEPS.map((s) => ({ ...s, on: ['idea', 'brief', 'research', 'prototype'].includes(s.key) })), ...CHECKS.map((key) => ({ key, on: false, required: false }))] } // as Main is: no check between the prototype and the build
const usable = [{ name: 'ticket-naming-convention', label: 'ticket-naming-convention', from: 'this repo' }, { name: 'self-evident:prototype', label: 'prototype', from: 'self-evident' }]
const setup = { test_cmd: 'pnpm test', step_skills: { build: ['ticket-naming-convention', 'gone'], prototype: ['self-evident:prototype'] }, probes: [{ name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { key: 'comments', on: false }] }

describe('contractsOf', () => {
  const groups = contractsOf({ setup, workflow: main, usable })
  const stepOf = (k: string) => groups.flatMap((g) => g.steps).find((s) => s.key === k)!
  it('shows only the steps the workflow uses, then the build and the smoke test', () => {
    expect(groups.map((g) => g.steps.map((s) => s.key))).toEqual([['research', 'brief', 'prototype'], ['build', 'smoke']]) // no blast radius on Main
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
    expect(held.find((p) => p.key === 'req:adr')).toMatchObject({ on: true, fixed: 'Switched on by the Main workflow.' }); expect(held.find((p) => p.key === 'req:risks')!.on).toBe(false)
    expect(held.find((p) => p.key === 'comments')).toMatchObject({ on: false, blocks: false, own: false }); expect(held.find((p) => p.key === 'lint')).toMatchObject({ own: true, runs: 'pnpm lint' })
  })
  it('a staged workflow is held to its criteria and the test run only', () => {
    expect(heldTo(setup, { ...main, style: 'staged' }).map((p) => p.key)).toEqual(['criteria', 'tests'])
  })
})

describe('applyProbeChange', () => {
  it('a command or a skill is added to the app\'s probes; a sentence to judge, to its requirements', () => {
    expect(applyProbeChange(setup, { op: 'add', name: 'Types', kind: 'command', runs: 'pnpm typecheck' })!.probes!.map((p) => p.key)).toEqual(['lint', 'comments', 'types'])
    const judged = applyProbeChange({}, { op: 'add', name: 'Audit log', kind: 'judged', runs: 'Every admin action is written to the audit log (sample).' })!
    expect(judged.requirements!.at(-1)).toEqual({ key: 'audit_log', name: 'Audit log', what: 'Every admin action is written to the audit log (sample).', on: true }); expect(judged.requirements!.length).toBe(7)
    expect(applyProbeChange(setup, { op: 'add', name: 'Lint', kind: 'command', runs: 'x' })).toBeNull(); expect(applyProbeChange(setup, { op: 'add', name: ' ', kind: 'command', runs: 'x' })).toBeNull()
  })
  it('one is switched, set to report only, or removed, where it is kept', () => {
    expect(applyProbeChange(setup, { op: 'on', key: 'break', on: false })!.probes).toContainEqual({ key: 'break', on: false })
    expect(applyProbeChange(setup, { op: 'blocks', key: 'lint', blocks: false })!.probes).toContainEqual({ key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint', blocks: false })
    expect(applyProbeChange(setup, { op: 'remove', key: 'lint' })!.probes!.map((p) => p.key)).toEqual(['comments'])
    expect(applyProbeChange({}, { op: 'on', key: 'req:docs', on: false })!.requirements!.find((r) => r.key === 'docs')!.on).toBe(false)
    expect(applyProbeChange({}, { op: 'remove', key: 'req:docs' })!.requirements!.map((r) => r.key)).not.toContain('docs')
  })
  it('a requirement can report only, and block again', () => {
    const off = applyProbeChange({}, { op: 'blocks', key: 'req:docs', blocks: false })!
    expect(off.requirements!.find((r) => r.key === 'docs')!.blocks).toBe(false)
    expect(heldTo(off).find((p) => p.key === 'req:docs')!.blocks).toBe(false)
    expect(applyProbeChange(off, { op: 'blocks', key: 'req:docs', blocks: true })!.requirements!.find((r) => r.key === 'docs')).not.toHaveProperty('blocks')
    expect(applyProbeChange(setup, { op: 'add', name: 'Types', kind: 'command', runs: 'pnpm typecheck', blocks: false })!.probes!.at(-1)).toMatchObject({ key: 'types', blocks: false })
    expect(applyProbeChange({}, { op: 'add', name: 'Audit log', kind: 'judged', runs: 'Sample.', blocks: false })!.requirements!.at(-1)).toMatchObject({ key: 'audit_log', blocks: false })
  })
  it('the app\'s own is edited in place: its name and what it runs, never its key; the engine\'s are not', () => {
    expect(applyProbeChange(setup, { op: 'edit', key: 'lint', name: 'Lint and format', runs: 'pnpm lint --fix=false' })!.probes).toContainEqual({ key: 'lint', name: 'Lint and format', kind: 'command', runs: 'pnpm lint --fix=false' })
    expect(applyProbeChange({}, { op: 'edit', key: 'req:docs', name: 'Docs', runs: 'The README says what changed (sample).' })!.requirements!.find((r) => r.key === 'docs')).toMatchObject({ name: 'Docs', what: 'The README says what changed (sample).', on: true })
    expect(applyProbeChange(setup, { op: 'edit', key: 'break', name: 'x', runs: 'y' })).toBeNull(); expect(applyProbeChange(setup, { op: 'edit', key: 'tests', name: 'x', runs: 'y' })).toBeNull()
    expect(applyProbeChange(setup, { op: 'edit', key: 'lint', name: ' ', runs: 'y' })).toBeNull()
    expect(applyProbeChange(setup, { op: 'edit', key: 'lint', name: 'Lint', runs: 'pnpm lint', blocks: false })!.probes).toContainEqual({ key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint', blocks: false })
    expect(applyProbeChange({}, { op: 'edit', key: 'req:docs', name: 'Docs', runs: 'Sample.', blocks: false })!.requirements!.find((r) => r.key === 'docs')!.blocks).toBe(false)
  })
})
