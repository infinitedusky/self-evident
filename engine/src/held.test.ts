/** What a build is held to: one list in layers, and each change to it as a change to an app's settings. Sample data. */
import { describe, expect, it } from 'vitest'
import { applyHeldChange, applyHeldChanges, cleanHeld, diffsOf, hasLegacy, heldOf, JUDGED, type HeldChange } from './held.js'

const ids = (setup: unknown, ...more: unknown[]) => heldOf(setup, ...more).map((h) => h.id)
const after = (setup: Record<string, unknown>, ...changes: HeldChange[]) => Object.fromEntries(Object.entries({ ...setup, ...applyHeldChanges(setup, changes) }).filter(([, v]) => v !== null))
const find = (setup: unknown, id: string, ...more: unknown[]) => heldOf(setup, ...more).find((h) => h.id === id)!

describe('the one list', () => {
  it('with nothing set is what the engine ships: its two probes and its sentences, two of them off', () => {
    expect(ids({})).toEqual(['break', 'comments', 'req:telemetry', 'req:tests', 'req:test_plan', 'req:docs', 'req:adr', 'req:risks'])
    expect(heldOf(null).filter((h) => !h.on).map((h) => h.id)).toEqual(['req:adr', 'req:risks']); expect(heldOf({}).every((h) => !h.own && !h.changed)).toBe(true)
  })
  it('the test command is on it as a command, after the engine\'s probes', () => {
    expect(ids({ test_cmd: 'pnpm test' }).slice(0, 3)).toEqual(['break', 'comments', 'tests']); expect(find({ test_cmd: 'pnpm test' }, 'tests')).toMatchObject({ kind: 'command', runs: 'pnpm test', blocks: true })
  })
  it('an app keeps only its differences: a default it has not touched follows the engine', () => {
    const setup = { held: [{ key: 'docs', kind: 'judged', on: false }, { key: 'telemetry', kind: 'judged', runs: 'A structured log line Datadog can read (sample).' }, { name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { key: 'tests', kind: 'judged', runs: JUDGED[1].runs, on: true }] }
    expect(diffsOf(setup).map((d) => d.key)).toEqual(['docs', 'telemetry', 'lint']) // the last says nothing the engine does not: not kept
    expect(find(setup, 'req:telemetry')).toMatchObject({ runs: 'A structured log line Datadog can read (sample).', name: 'Telemetry', changed: true, own: false })
    expect(find(setup, 'req:tests')).toMatchObject({ changed: false }); expect(find(setup, 'lint')).toMatchObject({ own: true, changed: false, blocks: true, on: true })
  })
  it('a judged one and a command can share a key: the sentence about tests, and the test command', () => {
    const setup = { test_cmd: 'pnpm test', held: [{ key: 'tests', blocks: false }, { key: 'tests', kind: 'judged', on: false }] }
    expect(find(setup, 'tests')).toMatchObject({ kind: 'command', blocks: false, on: true }); expect(find(setup, 'req:tests')).toMatchObject({ kind: 'judged', on: false, blocks: true })
  })
  it('a workflow switches a sentence over the app, a project over both, and says who did', () => {
    expect(find({}, 'req:adr', { adr: true })).toMatchObject({ on: true, by: 'workflow' })
    expect(find({}, 'req:adr', { adr: true }, { adr: false })).toMatchObject({ on: false, by: 'project' }); expect(find({}, 'req:docs', { adr: true }).by).toBeUndefined()
  })
  it('what is saved is tidied: nothing to run, a name twice and an unknown kind are dropped', () => {
    expect(cleanHeld([{ name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { name: 'No command', kind: 'command', runs: ' ' }, { name: 'Lint', kind: 'command', runs: 'again' }, { name: 'Odd', kind: 'other', runs: 'x' }, { key: 'break', name: 'Renamed', runs: 'other' }]).map((d) => d.key)).toEqual(['lint'])
    expect(cleanHeld('x')).toEqual([])
  })
})

describe('the two stores there were', () => {
  const old = { requirements_added: ['adr', 'risks'], probes: [{ name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { key: 'comments', on: false }], requirements: [
    { key: 'telemetry', name: 'Telemetry', what: 'Anything new that a person does, or that can fail, can be seen with OpenTelemetry: a span or an event where the prototype analysis says one belongs.', on: true },
    { key: 'tests', name: 'Tests', what: JUDGED[1].runs, on: true }, { key: 'docs', name: 'Docs', what: 'The README is updated (sample).', on: true },
    { key: 'privacy', name: 'Privacy', what: 'No personal data in analytics events (sample).', on: true }, { key: 'adr', name: 'Decision record', what: JUDGED[4].runs, on: false },
  ] }
  it('are read as differences: a copy of a default is the default (the old wording too), a rewording is kept, one left out is off', () => {
    expect(hasLegacy(old)).toBe(true); expect(hasLegacy({ held: [] })).toBe(false)
    expect(diffsOf(old)).toEqual([
      { key: 'docs', kind: 'judged', runs: 'The README is updated (sample).' }, { key: 'privacy', name: 'Privacy', kind: 'judged', runs: 'No personal data in analytics events (sample).' },
      { key: 'test_plan', kind: 'judged', on: false }, { key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint' }, { key: 'comments', on: false },
    ])
    expect(find(old, 'req:telemetry')).toMatchObject({ runs: JUDGED[0].runs, changed: false }) // the app never reworded it: it gets the engine's new wording
  })
  it('the first change leaves only the one list', () => {
    const next = after(old, { op: 'on', key: 'req:risks', on: true })
    expect(Object.keys(next)).toEqual(['held']); expect(heldOf(next).filter((h) => h.on).map((h) => h.id)).toEqual(['break', 'req:telemetry', 'req:tests', 'req:docs', 'req:risks', 'req:privacy', 'lint'])
  })
})

describe('a change to the list', () => {
  const setup = { test_cmd: 'pnpm test', held: [{ key: 'lint', name: 'Lint', kind: 'command', runs: 'pnpm lint' }] }
  it('adds the app\'s own: a command, a skill, a sentence; not a name that is there, nor one with nothing to run', () => {
    expect(find(after(setup, { op: 'add', name: 'Types', kind: 'command', runs: 'pnpm typecheck', blocks: false }), 'types')).toMatchObject({ own: true, blocks: false })
    expect(find(after(setup, { op: 'add', name: 'Audit log', kind: 'judged', runs: 'Every admin action is logged (sample).' }), 'req:audit_log')).toMatchObject({ kind: 'judged', own: true, on: true })
    for (const c of [{ op: 'add', name: 'Lint', kind: 'command', runs: 'x' }, { op: 'add', name: ' ', kind: 'command', runs: 'x' }, { op: 'add', name: 'Docs', kind: 'judged', runs: 'x' }, { op: 'add', name: 'Tests', kind: 'command', runs: 'x' }] as HeldChange[]) expect(applyHeldChange(setup, c)).toBeNull()
  })
  it('switches any of them, and sets any to report only', () => {
    expect(find(after(setup, { op: 'on', key: 'break', on: false }), 'break')).toMatchObject({ on: false, changed: true })
    expect(find(after(setup, { op: 'blocks', key: 'req:docs', blocks: false }), 'req:docs')).toMatchObject({ blocks: false, changed: true })
    expect(find(after(setup, { op: 'blocks', key: 'lint', blocks: false }), 'lint')).toMatchObject({ blocks: false, runs: 'pnpm lint' })
    expect(after(setup, { op: 'on', key: 'break', on: false }, { op: 'on', key: 'break', on: true }).held).toEqual(setup.held) // back to the default: no difference kept
  })
  it('rewords a sentence the engine ships and the app\'s own; never one of the engine\'s probes', () => {
    expect(find(after(setup, { op: 'edit', key: 'req:telemetry', name: 'Telemetry', runs: 'A log line Datadog can read (sample).' }), 'req:telemetry')).toMatchObject({ runs: 'A log line Datadog can read (sample).', changed: true })
    expect(find(after(setup, { op: 'edit', key: 'lint', name: 'Lint and format', runs: 'pnpm lint --max-warnings 0', blocks: false }), 'lint')).toMatchObject({ key: 'lint', name: 'Lint and format', runs: 'pnpm lint --max-warnings 0', blocks: false })
    expect(applyHeldChange(setup, { op: 'edit', key: 'break', name: 'x', runs: 'y' })).toBeNull(); expect(applyHeldChange(setup, { op: 'edit', key: 'lint', name: ' ', runs: 'y' })).toBeNull()
  })
  it('the test command is edited, set and cleared on the list', () => {
    expect(after(setup, { op: 'edit', key: 'tests', name: 'Tests', runs: 'pnpm test --run', blocks: false })).toMatchObject({ test_cmd: 'pnpm test --run', held: [{ key: 'lint' }, { key: 'tests', blocks: false }] })
    expect(after({}, { op: 'edit', key: 'tests', name: 'Tests', runs: 'make test' })).toEqual({ test_cmd: 'make test' })
    expect(after(setup, { op: 'remove', key: 'tests' })).toEqual({ held: setup.held })
  })
  it('removes the app\'s own, and puts one the engine ships back as shipped', () => {
    expect(after(setup, { op: 'remove', key: 'lint' })).toEqual({ test_cmd: 'pnpm test' }); expect(applyHeldChange(setup, { op: 'remove', key: 'req:docs' })).toBeNull()
    const reworded = after(setup, { op: 'edit', key: 'req:docs', name: 'Docs', runs: 'Sample.' }, { op: 'on', key: 'req:docs', on: false })
    expect(find(after(reworded, { op: 'reset', key: 'req:docs' }), 'req:docs')).toMatchObject({ runs: JUDGED[3].runs, on: true, changed: false })
    expect(applyHeldChange(setup, { op: 'reset', key: 'lint' })).toBeNull(); expect(applyHeldChange(setup, { op: 'on', key: 'nope', on: true })).toBeNull()
  })
})
