/** The test trajectory: what a plan must say, what a run was, and what the engine holds each sub-task to. Pure, made-up plans. */
import { describe, expect, it } from 'vitest'
import type { Criterion } from './acceptance.js'
import { classifyRun, cleanPlan, gateAt, holds, placeOf, planMarkdown, redTitle, rowCommand, rowsDue, rowState, strayTests, TEST_PHASE_TITLE, TESTS, trajectoryProposal, validatePlan, type RowRun, type TestPlan } from './trajectory.js'

const at = '2026-11-23T00:00:00.000Z'
const criteria: Criterion[] = [
  { id: 'ac_1', text: 'The file has every order (sample)', by: 'agent', at },
  { id: 'ac_2', text: 'Running it twice makes no duplicates (sample)', by: 'agent', at },
  { id: 'ac_3', text: 'A real export opens in a spreadsheet (sample)', kind: 'smoke', by: 'agent', at },
  { id: 'ac_4', text: 'EXPORT_BUCKET is set in each environment (sample)', kind: 'release', by: 'agent', at },
]
const plan: TestPlan = {
  slices: [{ key: 'query', title: 'The orders query (sample)', what: 'Read every order of a customer, newest first.' }, { key: 'file', title: 'The export file (sample)', what: 'Write the rows as CSV and serve it.' }],
  rows: [
    { id: 'T1', asserts: 'GET /export returns every order of the customer', level: 'integration', criteria: ['ac_1'], test: 'tests/export.test.ts', writableAt: TESTS, passesAt: 'file' },
    { id: 'T2', asserts: 'the query returns orders newest first', level: 'unit', criteria: ['ac_1'], test: 'tests/orders-query.test.ts', writableAt: TESTS, passesAt: 'query' },
    { id: 'T3', asserts: 'a second export adds no rows', level: 'integration', criteria: ['ac_2'], test: 'tests/export-twice.test.ts', writableAt: 'file', passesAt: 'file', deferred: { why: 'it calls the writer the query slice introduces', code: 'it("adds no rows", () => { expect(writeTwice()).toBe(0) })' } },
    { id: 'T4', asserts: 'the orders page still lists orders', level: 'component', criteria: [], test: 'tests/orders-page.test.tsx', writableAt: TESTS, passesAt: TESTS, guard: 'the query it reads is being changed' },
  ],
}
const run = (row: string, outcome: RowRun['outcome'], where = TESTS): RowRun => ({ row, outcome, at: where, ts: at })

describe('what a test plan must say', () => {
  it('a plan that names its slices, its rows and how each criterion is proven can be approved', () => {
    expect(validatePlan(plan, criteria)).toEqual([])
  })
  it('every criterion names its tests, or is proven another way (smoke, release, watch)', () => {
    const untagged = criteria.map((c) => (c.id === 'ac_3' ? { ...c, kind: undefined } : c))
    expect(validatePlan(plan, untagged)).toEqual(['No row proves the criterion ac_3 ("A real export opens in a spreadsheet (sample)"). Give it a test, or say on the criterion how else it is proven (smoke, release or watch).'])
    expect(validatePlan({ ...plan, rows: plan.rows.map((r) => (r.id === 'T1' ? { ...r, criteria: ['ac_9'] } : r)) }, criteria)).toContain('T1 names the criterion ac_9, which this task does not have.')
  })
  it('a test not written up front gives its reason; one that passes when written says why it is a guard', () => {
    const [, , t3, t4] = plan.rows
    expect(validatePlan({ ...plan, rows: [...plan.rows.slice(0, 2), { ...t3, deferred: undefined }, t4] }, criteria).join(' ')).toContain('T3 is not written in the test phase and does not say why')
    expect(validatePlan({ ...plan, rows: [...plan.rows.slice(0, 3), { ...t4, guard: undefined, criteria: ['ac_1'] }] }, criteria).join(' ')).toContain('T4 passes in the test phase, where nothing is built: only a regression guard is green when written')
    expect(validatePlan({ ...plan, rows: [...plan.rows.slice(0, 3), { ...t4, passesAt: 'file' }] }, criteria).join(' ')).toContain('T4 is a regression guard, so it is green where it is written')
  })
  it('a row cannot pass before it can be written, names a file, and a slice has a test or says why not', () => {
    const wrong = validatePlan({ slices: [...plan.slices, { key: 'tidy', title: 'Tidy up (sample)', what: 'Delete the old exporter.' }], rows: [{ ...plan.rows[0], writableAt: 'file', passesAt: 'query', deferred: { why: 'x' } }, { ...plan.rows[1], test: '' }, { ...plan.rows[1], id: 'T9', passesAt: 'nowhere' }] }, []).join('\n')
    expect(wrong).toContain('T1 passes (query) before it can be written (file)'); expect(wrong).toContain('T2 names no test file'); expect(wrong).toContain('T9 passes at "nowhere", which is not a slice')
    expect(wrong).toContain('No test turns green at the slice "Tidy up (sample)"')
    expect(validatePlan({ slices: [...plan.slices, { key: 'tidy', title: 'Tidy up (sample)', what: 'Delete the old exporter.', none: 'a deletion' }], rows: plan.rows }, criteria)).toEqual([])
    expect(validatePlan({ slices: [], rows: [] })).toHaveLength(2)
  })
  it('rows that share a file and turn green at different times each name their test, so the engine can run one alone', () => {
    const shared = { ...plan, rows: plan.rows.map((r) => (r.id === 'T2' ? { ...r, test: 'tests/export.test.ts' } : r)) }
    expect(validatePlan(shared, criteria).join(' ')).toContain('T1, T2 share tests/export.test.ts and are written or turn green at different times')
    expect(validatePlan({ ...shared, rows: shared.rows.map((r) => (r.id === 'T1' ? { ...r, name: 'every order' } : r.id === 'T2' ? { ...r, name: 'newest first' } : r)) }, criteria)).toEqual([])
  })
  it('what an agent gives is tidied, never invented: ids, the test phase by any name, a single criterion', () => {
    const c = cleanPlan({ slices: [{ title: 'The Orders Query', what: ' x ' }], rows: [{ asserts: ' a  b ', level: 'nonsense', criterion: 'ac_1', test: './tests/a.test.ts', writableAt: 'Test phase', passesAt: 'The Orders Query' }] })
    expect(c).toEqual({ slices: [{ key: 'the-orders-query', title: 'The Orders Query', what: 'x' }], rows: [{ id: 'T1', asserts: 'a b', level: 'unit', criteria: ['ac_1'], test: 'tests/a.test.ts', writableAt: TESTS, passesAt: 'the-orders-query' }] })
  })
  it('reads as a table a reviewer can follow, with the register, the guards and what is proven another way', () => {
    const md = planMarkdown(plan, criteria)
    expect(md).toContain('| T1 | GET /export returns every order of the customer | integration | ac_1 | `tests/export.test.ts` | Test phase | The export file (sample) |')
    expect(md).toContain('### Deferred: not written in the test phase'); expect(md).toContain('**T3**, written at The export file (sample): it calls the writer the query slice introduces'); expect(md).toContain('expect(writeTwice()).toBe(0)')
    expect(md).toContain('### Regression guards: green when written'); expect(md).toContain('- ac_3 A real export opens in a spreadsheet (sample): **smoke**'); expect(md).toContain('1. **Test phase**: every test writable now, written and seen to fail (3 of 4).')
  })
})

describe('what a run was: real red, fake red, green', () => {
  it('a test that ran and failed on its assertion is red, in each runner we know', () => {
    expect(classifyRun(1, ' FAIL  tests/export.test.ts > every order\nAssertionError: expected 404 to be 200\n Test Files  1 failed (1)\n      Tests  1 failed (1)')).toBe('red') // vitest
    expect(classifyRun(1, 'FAIL tests/export.test.js\n  ● every order\n    expect(received).toBe(expected)\nTest Suites: 1 failed, 1 total\nTests:       1 failed, 2 passed, 3 total')).toBe('red') // jest
    expect(classifyRun(1, 'E       assert 404 == 200\ntests/test_export.py:9: AssertionError\n=========== 1 failed, 2 passed in 0.31s ===========')).toBe('red') // pytest
    expect(classifyRun(1, '--- FAIL: TestExport (0.00s)\n    export_test.go:12: got 404, want 200\nFAIL')).toBe('red') // go
    expect(classifyRun(1, 'not ok 1 - every order\n# tests 1\n# pass 0\n# fail 1')).toBe('red') // node:test
  })
  it('a file that could not load is a fake red: its assertion never ran', () => {
    expect(classifyRun(1, ' FAIL  tests/export.test.ts [ tests/export.test.ts ]\nError: Failed to resolve import "../src/export" from "tests/export.test.ts". Does the file exist?\n Test Files  1 failed (1)\n      Tests  no tests')).toBe('fake') // vitest
    expect(classifyRun(1, 'FAIL tests/export.test.js\n  ● Test suite failed to run\n    Cannot find module \'../src/export\' from \'tests/export.test.js\'\nTest Suites: 1 failed, 1 total\nTests:       0 total')).toBe('fake') // jest
    expect(classifyRun(2, '==================== ERRORS ====================\n___ ERROR collecting tests/test_export.py ___\nImportError while importing test module\nE   ModuleNotFoundError: No module named \'app.export\'\n!!!!! Interrupted: 1 error during collection !!!!!\n=========== 1 error in 0.12s ===========')).toBe('fake') // pytest
    expect(classifyRun(2, '# shop/export [shop/export.test]\n./export_test.go:10:9: undefined: Export\nFAIL\tshop/export [build failed]')).toBe('fake') // go
    expect(classifyRun(1, 'tests/export.test.ts(3,10): error TS2305: Module \'"../src/export"\' has no exported member \'exportOrders\'.')).toBe('fake')
  })
  it('green is green; a run that found no test is not; and a failure that does not say how is not taken as red', () => {
    expect(classifyRun(0, ' Test Files  1 passed (1)\n      Tests  3 passed (3)')).toBe('green')
    expect(classifyRun(0, '\x1b[32m3 passed\x1b[0m in 0.2s')).toBe('green')
    expect(classifyRun(1, 'No test files found, exiting with code 1')).toBe('none')
    expect(classifyRun(5, 'collected 0 items\n=========== no tests ran in 0.01s ===========')).toBe('none')
    expect(classifyRun(0, 'No tests found, exiting with code 0')).toBe('none')
    expect(classifyRun(1, 'Killed')).toBe('unclear')
    expect(classifyRun(1, 'thread main panicked: assertion failed: left == right')).toBe('red') // an unknown runner that says it was an assertion
  })
  it('one row is run by the app\'s own command for it, else its test command with the file, as each runner takes it', () => {
    const row = { test: 'tests/export.test.ts', name: 'every order' }
    expect(rowCommand({ test_cmd: 'pnpm test' }, { test: row.test })).toBe("pnpm test 'tests/export.test.ts'")
    expect(rowCommand({ test_cmd: 'pnpm test' }, row)).toBe("pnpm test 'tests/export.test.ts' -t 'every order'")
    expect(rowCommand({ test_cmd: 'npm test' }, row)).toBe("npm test -- 'tests/export.test.ts' -t 'every order'")
    expect(rowCommand({ test_cmd: 'uv run pytest -q' }, { test: 'tests/test_export.py', name: 'test_every_order' })).toBe("uv run pytest -q 'tests/test_export.py' -k 'test_every_order'")
    expect(rowCommand({ test_cmd: 'go test ./...' }, { test: 'shop/export/export_test.go', name: 'TestExport' })).toBe("go test './shop/export' -run 'TestExport'")
    expect(rowCommand({ test_cmd: 'make test', test_row_cmd: 'bin/t {file} --only {name}' }, row)).toBe("bin/t 'tests/export.test.ts' --only 'every order'")
    expect(rowCommand({}, row)).toBeNull(); expect(rowCommand({ test_cmd: 'pnpm test' }, { test: "it's.test.ts" })).toBe("pnpm test 'it'\\''s.test.ts'")
  })
})

describe('what the engine holds each sub-task to', () => {
  const now = (o: Record<string, RowRun['outcome']>) => new Map(Object.entries(o).map(([k, outcome]) => [k, { outcome, tail: `output of ${k}` }]))
  it('knows which sub-task is which: the test phase, a slice\'s tests first, a slice; and nothing else', () => {
    expect(placeOf(plan, TEST_PHASE_TITLE)).toEqual({ at: TESTS, half: 'red' })
    expect(placeOf(plan, redTitle('The export file (sample)'))).toEqual({ at: 'file', half: 'red' }); expect(placeOf(plan, 'The export file (sample)')).toEqual({ at: 'file', half: 'green' })
    expect(placeOf(plan, 'Check it against its acceptance criteria')).toBeNull()
    expect(rowsDue(plan, { at: TESTS, half: 'red' }).written.map((r) => r.id)).toEqual(['T1', 'T2', 'T4'])
    expect(rowsDue(plan, { at: 'file', half: 'red' }).written.map((r) => r.id)).toEqual(['T3'])
    expect(rowsDue(plan, { at: 'query', half: 'green' }).green.map((r) => r.id)).toEqual(['T2', 'T4']) // what is due by then, the guard among them
    expect(rowsDue(plan, { at: 'file', half: 'green' }).green.map((r) => r.id)).toEqual(['T1', 'T2', 'T3', 'T4'])
  })
  it('the test phase: each test fails on its assertion, and each guard passes', () => {
    expect(gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'red', T2: 'red', T4: 'green' }), [])).toEqual([])
  })
  it('an import-only failure is refused as a fake red, with what the run printed', () => {
    const [why] = gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'fake', T2: 'red', T4: 'green' }), [])
    expect(why).toContain('T1 (tests/export.test.ts) failed to load, which is not a failing test: its assertion never ran'); expect(why).toContain('output of T1')
  })
  it('a first-run green is refused unless the plan declares the row a guard', () => {
    const [why, ...rest] = gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'red', T2: 'green', T4: 'green' }), [])
    expect(why).toContain('T2 (tests/orders-query.test.ts) passed the first time it ran. A test that has never failed proves nothing'); expect(rest).toEqual([]) // T4, the guard, is green and that is right
    expect(gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'red', T2: 'red', T4: 'red' }), [])[0]).toContain('T4 (tests/orders-page.test.tsx) is a regression guard, green when written, and it failed on an assertion')
  })
  it('a test that was never written, or fails in a way the engine cannot read, is not taken as red', () => {
    expect(gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'none', T2: 'red', T4: 'green' }), [])[0]).toContain('T1: no test was found at tests/export.test.ts')
    expect(gateAt(plan, { at: TESTS, half: 'red' }, now({ T1: 'unclear', T2: 'red', T4: 'green' }), [])[0]).toContain('the engine cannot tell an assertion from a load error')
    expect(gateAt(plan, { at: TESTS, half: 'red' }, now({ T2: 'red', T4: 'green' }), [])[0]).toContain('T1: no test was found')
  })
  it('a slice: every row due by then is green, and each was seen red before its code', () => {
    const before = [run('T1', 'red'), run('T2', 'red'), run('T4', 'green')]
    expect(gateAt(plan, { at: 'query', half: 'green' }, now({ T2: 'green', T4: 'green' }), before)).toEqual([])
    expect(gateAt(plan, { at: 'query', half: 'green' }, now({ T2: 'red', T4: 'green' }), before)[0]).toContain('T2 (tests/orders-query.test.ts) is due green here, and it failed on an assertion')
    expect(gateAt(plan, { at: 'query', half: 'green' }, now({ T2: 'green', T4: 'red' }), before)[0]).toContain('T4 (tests/orders-page.test.tsx) is due green since tests') // a slice that breaks what was pinned does not land
    expect(gateAt(plan, { at: 'query', half: 'green' }, now({ T2: 'green', T4: 'green' }), [run('T4', 'green')])[0]).toContain('T2 (tests/orders-query.test.ts) is green and was never seen red')
    // The slice with a test deferred to it: its tests first, red; then its code, everything green.
    expect(gateAt(plan, { at: 'file', half: 'red' }, now({ T3: 'red' }), before)).toEqual([])
    expect(gateAt(plan, { at: 'file', half: 'green' }, now({ T1: 'green', T2: 'green', T3: 'green', T4: 'green' }), [...before, run('T3', 'red', 'file:red')])).toEqual([])
  })
  it('a row is proven only when the engine saw it red and then green; a guard, when it saw it green', () => {
    const [t1, , , t4] = plan.rows
    expect(rowState(t1, [])).toBe('planned'); expect(rowState(t1, [run('T1', 'red')])).toBe('red'); expect(rowState(t1, [run('T1', 'red'), run('T1', 'green')])).toBe('green')
    expect(rowState(t1, [run('T1', 'green')])).toBe('never-red'); expect(rowState(t1, [run('T1', 'fake')])).toBe('fake'); expect(rowState(t1, [run('T1', 'none')])).toBe('unwritten')
    expect(rowState(t1, [run('T1', 'red'), run('T1', 'green'), run('T1', 'red')])).toBe('failing'); expect(rowState(t4, [run('T4', 'green')])).toBe('green'); expect(rowState(t4, [run('T4', 'red')])).toBe('failing')
    expect(holds(plan, [run('T1', 'red'), run('T2', 'red'), run('T4', 'green'), run('T2', 'green'), run('T3', 'red'), run('T1', 'green'), run('T3', 'green')])).toEqual({ ok: true, open: [] })
    expect(holds(plan, [run('T1', 'red'), run('T2', 'green'), run('T4', 'green')]).open).toEqual([{ id: 'T1', state: 'red' }, { id: 'T2', state: 'never-red' }, { id: 'T3', state: 'planned' }])
  })
})

describe('the build an approved plan is', () => {
  const p = trajectoryProposal(plan, { criteria, base: 'main', prototype: { branch: 'proto/export', path: '/sample/proto' }, rowCmd: (r) => `pnpm test '${r.test}'` })
  it('is a test phase, then each slice in order, each waiting on the one before; a slice with deferred tests writes them first', () => {
    expect(p.phases.map((x) => [x.title, x.depends_on])).toEqual([[TEST_PHASE_TITLE, []], ['The orders query (sample)', [TESTS]], [redTitle('The export file (sample)'), ['query']], ['The export file (sample)', ['file-tests']]])
    expect(p.notes).toContain('a test phase, then 2 slices')
  })
  it('the test phase is told its tests, how to run each, and what the engine will refuse', () => {
    const tests = p.phases[0].summary
    expect(tests).toContain('Write these 3 tests, and nothing else'); expect(tests).toContain('**T1** GET /export returns every order'); expect(tests).toContain("Run it: `pnpm test 'tests/export.test.ts'`")
    expect(tests).toContain('a regression guard: the query it reads is being changed'); expect(tests).not.toContain('**T3**')
    expect(tests).toContain('fail on its own assertion'); expect(tests).toContain('fake red'); expect(tests).toContain('passes the first time')
  })
  it('a slice is told which failing tests it makes pass, not to change them, and carries a deferred test\'s code to where it is written', () => {
    expect(p.phases[1].summary).toContain('**T2**'); expect(p.phases[1].summary).toContain('Change the code, not the tests'); expect(p.phases[1].summary).toContain('proto/export')
    expect(p.phases[2].summary).toContain('**T3**'); expect(p.phases[2].summary).toContain('expect(writeTwice()).toBe(0)')
    expect(p.phases[3].summary).toContain('**T1**'); expect(p.phases[3].summary).toContain('**T3**'); expect(p.phases[3].done_when).toBe('T1, T3 pass, and every test that passed before still does.')
  })
})

describe('a test in the diff that is not in the trajectory', () => {
  it('is flagged; a fixture, a helper or a snapshot is not', () => {
    expect(strayTests(plan, ['src/export.ts', 'tests/export.test.ts', 'tests/extra.test.ts', 'tests/fixtures/orders.json', 'tests/helpers/db.ts', 'src/__tests__/thing.spec.tsx', 'app/tests/test_more.py', 'tests/__snapshots__/x.snap', 'tests/conftest.py'])).toEqual(['tests/extra.test.ts', 'src/__tests__/thing.spec.tsx', 'app/tests/test_more.py'])
  })
})
