import { describe, expect, it } from 'vitest'
import type { Criterion } from './acceptance.js'
import { evidenceText, withEvidence } from './evidence.js'
import { commandsCheck, descriptionCheck, gateWaits, githubCheck, rollbackCheck, smokeCheck, titleCheck } from './pr-gate.js'
import { editsThere, markOf, prBody, writtenFrom } from './pr.js'
import type { RowRun, TestPlan } from './trajectory.js'

describe('the title', () => {
  const rule = '{type}{scope}[{ticket}]: {title}'
  it('fits the app\'s rule and carries the team\'s ticket', () => {
    expect(titleCheck({ template: rule, title: 'feat(scan)[ENT-322]: Person findings from SixtyFour', ticket: 'ENT-322', ticketRequired: true, ours: 'CEB-90' }).state).toBe('pass')
    expect(titleCheck({ template: rule, title: 'feat[ENT-322]: Person findings', ticket: 'ENT-322', ticketRequired: true, ours: 'CEB-90' }).state).toBe('pass')
  })
  it('fails without the ticket, with ours in its place, or off the rule', () => {
    expect(titleCheck({ template: rule, title: 'feat(scan): Person findings', ticket: 'ENT-322', ticketRequired: true, ours: 'CEB-90' })).toMatchObject({ state: 'fail', says: expect.stringMatching(/does not carry the team's ticket, ENT-322/) })
    expect(titleCheck({ template: null, title: 'CEB-90 Person findings ENT-322', ticket: 'ENT-322', ticketRequired: false, ours: 'CEB-90' })).toMatchObject({ state: 'fail', says: expect.stringMatching(/our own id, CEB-90/) })
    expect(titleCheck({ template: rule, title: 'Person findings [ENT-322]', ticket: 'ENT-322', ticketRequired: false, ours: 'CEB-90' })).toMatchObject({ state: 'fail', says: expect.stringMatching(/does not fit the app's rule/) })
    expect(titleCheck({ template: null, title: 'Person findings', ticket: null, ticketRequired: true, ours: 'CEB-90' })).toMatchObject({ state: 'fail', says: expect.stringMatching(/this task has none/) })
  })
  it('passes an app with no rule, saying so', () => {
    expect(titleCheck({ template: null, title: 'Person findings', ticket: null, ticketRequired: false, ours: 'CEB-90' })).toMatchObject({ state: 'pass', says: expect.stringMatching(/no rule for titles/) })
  })
})

describe('the description', () => {
  const template = '## What changed and why\n\n## How it works\n\n## Merge Danger\n\n## Test plan\n'
  const good = '## What changed and why\nScans read person findings.\n\n## How it works\nA new workflow id.\n\n## Merge Danger\n### Deploy\nSet the workflow id.\n\n## Test plan\n- import a person'
  it('passes when every section of the app\'s form is there, in order, and filled', () => {
    expect(descriptionCheck({ template, written: good, ours: ['CEB-90', 'CEB-91'], ticket: 'ENT-322' }).state).toBe('pass')
  })
  it('names a section missing, empty or out of order', () => {
    const r = descriptionCheck({ template, written: '## How it works\nx\n\n## What changed and why\ny\n\n## Merge Danger\n<!-- say what a deploy needs -->\n', ours: [] })
    expect(r.state).toBe('fail')
    expect(r.details).toEqual(['"Merge Danger" has nothing under it.', 'It has no "Test plan" section.', 'Its sections are not in the order of the app\'s form.'])
  })
  it('fails one that was never written, and one that speaks of us', () => {
    expect(descriptionCheck({ template: null, written: null, ours: [] })).toMatchObject({ state: 'fail', says: expect.stringMatching(/has not been written for the team/) })
    expect(descriptionCheck({ template: null, written: 'Built by Evident. See CEB-91 and ENT-322.', ours: ['CEB-90', 'CEB-91'], ticket: 'ENT-322' })).toMatchObject({ state: 'fail', says: expect.stringMatching(/our name \(Evident\), our id CEB-91/) })
  })
  it('does not read the engine\'s own blocks as the writer\'s', () => {
    const withOurs = withEvidence(good, '**Mutation testing:** of 4 meaningful breaks, the tests catch 4 (100%).')
    expect(descriptionCheck({ template, written: withOurs, ours: [] }).state).toBe('pass')
    expect(descriptionCheck({ template: null, written: '<!-- evident:evidence -->\nx\n<!-- /evident:evidence -->', ours: [] }).state).toBe('fail')
  })
})

describe('the rollback', () => {
  const door = 'Rollback: never revert after the first scan has run; fix forward.'
  it('never lets a one-way door be called revertable', () => {
    expect(rollbackCheck({ written: '## Rollback\nSafe to revert this PR.', risk: door })).toMatchObject({ state: 'fail', says: expect.stringMatching(/one-way door is never called revertable/) })
    expect(rollbackCheck({ written: '## Rollback\nNothing special.', risk: door })).toMatchObject({ state: 'fail', says: expect.stringMatching(/the description does not say so/) })
    expect(rollbackCheck({ written: '## Rollback\nDo not revert after the first scan: fix forward.', risk: door }).state).toBe('pass')
  })
  it('passes a revertable change, and has nothing to say without a blast radius', () => {
    expect(rollbackCheck({ written: 'Safe to revert.', risk: 'Touches the list endpoint only. To undo: revert this pull request.' }).state).toBe('pass')
    expect(rollbackCheck({ written: 'Safe to revert.', risk: null }).state).toBe('none')
  })
})

describe('the rest of the gate', () => {
  it('reads GitHub\'s checks', () => {
    expect(githubCheck(null).state).toBe('none')
    expect(githubCheck({ status: 'draft', checks: [{ name: 'ci', state: 'pass' }, { name: 'lint', state: 'skipped' }] }).state).toBe('pass')
    expect(githubCheck({ status: 'draft', checks: [{ name: 'ci', state: 'pending' }] }).state).toBe('wait')
    expect(githubCheck({ status: 'draft', checks: [{ name: 'ci', state: 'fail' }, { name: 'lint', state: 'pass' }] })).toMatchObject({ state: 'fail', says: '1 of 2 failing: ci.', fix: expect.stringMatching(/Do not change the check/) })
    expect(githubCheck({ status: 'draft', checks: [] }, 'GitHub could not be asked just now').state).toBe('wait')
  })
  it('holds the app\'s commands to the head', () => {
    expect(commandsCheck({ head: 'abc', ran: [] }).state).toBe('none')
    expect(commandsCheck({ head: 'abc', ran: [{ name: 'Tests', runs: 'pytest', pass: true, sha: 'abc' }] }).state).toBe('pass')
    expect(commandsCheck({ head: 'abc', ran: [{ name: 'Tests', runs: 'pytest', pass: true, sha: 'old1234' }] })).toMatchObject({ state: 'wait', says: expect.stringMatching(/earlier commit \(old1234\)/) })
    expect(commandsCheck({ head: 'abc', ran: [{ name: 'Lint', runs: 'ruff check', pass: false, sha: 'abc', detail: 'E501 line too long' }] })).toMatchObject({ state: 'fail', fix: expect.stringMatching(/ruff check[\s\S]*E501/) })
  })
  it('wants the smoke test accepted, with none of the person\'s checks open', () => {
    expect(smokeCheck({ owed: 2, failed: 0, accepted: null, head: 'abc' }).state).toBe('fail')
    expect(smokeCheck({ owed: 0, failed: 0, accepted: null, head: 'abc' })).toMatchObject({ state: 'fail', says: 'The smoke test has not been accepted.' })
    expect(smokeCheck({ owed: 0, failed: 0, accepted: { sha: 'abc' }, head: 'abc' })).toMatchObject({ state: 'pass', says: 'Accepted, on this commit.' })
    expect(smokeCheck({ owed: 0, failed: 0, accepted: { sha: 'old1234' }, head: 'abc' })).toMatchObject({ state: 'pass', says: expect.stringMatching(/the branch has moved since/) })
  })
  it('is held by what fails or cannot be told, never by what has nothing to check', () => {
    expect(gateWaits([githubCheck(null), commandsCheck({ head: 'a', ran: [] }), smokeCheck({ owed: 0, failed: 0, accepted: { sha: 'a' }, head: 'a' })])).toEqual([])
    expect(gateWaits([githubCheck({ status: 'draft', checks: [{ name: 'ci', state: 'pending' }] })])).toHaveLength(1)
  })
})

describe('the evidence', () => {
  const plan: TestPlan = { slices: [{ key: 'decode', title: 'Decode the findings', what: '' }], rows: [
    { id: 'T1', asserts: 'a decoded row has the findings columns', level: 'integration', criteria: ['c1'], test: 'tests/test_decode.py', writableAt: 'tests', passesAt: 'decode' },
    { id: 'T2', asserts: 'the list sorts by found date', level: 'unit', criteria: ['c1'], test: 'tests/test_sort.py', writableAt: 'decode', passesAt: 'decode', deferred: { why: 'It imports the decoder, which does not exist until this slice.' } },
    { id: 'T3', asserts: 'the old columns are still served', level: 'unit', criteria: [], test: 'tests/test_old.py', writableAt: 'tests', passesAt: 'tests', guard: 'Pins the response the dashboard reads today.' },
  ] }
  const run = (row: string, outcome: RowRun['outcome'], at: string): RowRun => ({ row, outcome, at, ts: '2026-11-23T10:00:00Z' })
  const runs = [run('T1', 'red', 'tests'), run('T3', 'green', 'tests'), run('T2', 'red', 'decode:red'), run('T1', 'green', 'decode'), run('T2', 'green', 'decode')]
  const criteria: Criterion[] = [{ id: 'c1', text: 'Decoded rows carry the findings columns', by: 'agent', at: '2026-11-23T09:00:00Z' }, { id: 'c2', text: 'SIXTYFOUR_WORKFLOW_ID is set in each environment', kind: 'release', by: 'agent', at: '2026-11-23T09:00:00Z' }]
  const survivor = { id: 's1', file: 'app/decode.py', line: 41, col: 4, op: 'boundary' as const, from: '<=', to: '<', means: 'no test checks the value exactly at this limit', code: 'if skipped <= limit:' }
  const facts = { plan, runs, criteria, testFiles: [], mutation: { tool: 'evident' as const, found: 12, tried: 12, caught: 10, survivors: [survivor, { ...survivor, id: 's2', line: 7, equivalent: 'a flag on a decorator' }], invalid: 1, files: 2, tests: ['tests/test_decode.py'] }, accepted: {}, commands: [{ name: 'Tests', pass: true }, { name: 'Lint', pass: true }] }

  it('leads with the tests this change wrote, and says each was red before green', () => {
    const text = evidenceText(facts)
    expect(text).toMatch(/\*\*Tests written by this pull request:\*\* 2 unit, 1 integration\. All pass\./)
    expect(text).toMatch(/\*\*Red before green:\*\* 2 of 2 were run and seen to fail on an assertion[\s\S]*1 more is a regression guard/)
    expect(text).toMatch(/\| T2 `tests\/test_sort.py` \| the list sorts by found date \| unit \| Decode the findings \| Decode the findings \|/)
    expect(text).toMatch(/\| T1 [^\n]* \| before any code \| Decode the findings \|/)
    expect(text).toMatch(/- Decoded rows carry the findings columns: T1, T2\n- SIXTYFOUR_WORKFLOW_ID is set in each environment: done at deploy/)
    expect(text).toMatch(/\*\*Deferred tests\*\*[\s\S]*- T2: It imports the decoder[\s\S]*Written with "Decode the findings"\./)
    expect(text).toMatch(/\*\*Regression guards\*\*[\s\S]*- T3: Pins the response/)
  })
  it('says what mutation testing caught, names what it did not, and keeps the suite to a last line', () => {
    const text = evidenceText(facts)
    expect(text).toMatch(/\*\*Mutation testing:\*\* of 11 meaningful breaks made to the lines this pull request changed, the tests catch 10 \(91%\)\. \(1 more would not load and is not counted\.\)/)
    expect(text).toMatch(/Not caught:\n- `app\/decode.py:41`: `<=` became `<`\. No test checks the value exactly at this limit\./)
    expect(text).toMatch(/Left out of the score, because no test could tell:\n- `app\/decode.py:7`[^\n]*a flag on a decorator/)
    expect(text.trim().split('\n').pop()).toBe('**Everything else:** Tests, Lint all pass on this branch: nothing else broke.')
    expect(text).not.toMatch(/Evident|CEB-/)
  })
  it('carries the person\'s reason for a survivor left as it is, and takes one they call equivalent out of the score', () => {
    expect(evidenceText({ ...facts, accepted: { s1: { reason: 'The limit is checked upstream, in the importer.' } } })).toMatch(/Left as it is: The limit is checked upstream, in the importer\./)
    const out = evidenceText({ ...facts, accepted: { s1: { reason: 'Both sides skip the same rows.', equivalent: true } } })
    expect(out).toMatch(/of 10 meaningful breaks[^\n]*catch 10 \(100%\)/)
    expect(out).not.toMatch(/Not caught:/)
  })
  it('names a planned test that is not proven, and says plainly when there was no plan', () => {
    expect(evidenceText({ ...facts, runs: runs.filter((r) => !(r.row === 'T2' && r.outcome === 'red')) })).toMatch(/1 of 2 were run[\s\S]*Not proven:\n- T2 \(`tests\/test_sort.py`\): passes, and was never seen to fail\./)
    expect(evidenceText({ ...facts, plan: null, runs: [], testFiles: ['a.test.ts'], mutation: null, mutationSays: 'This app has no test command.' })).toMatch(/built without a test plan[\s\S]*1 test file[\s\S]*\*\*Mutation testing:\*\* not run\. This app has no test command\./)
  })
  it('goes under the writer\'s own heading for it, else in a section at the end, and is replaced whole', () => {
    expect(withEvidence('## What\nx\n\n## Testing\nI ran it.\n\n## Risks\ny', 'E1')).toBe('## What\nx\n\n## Testing\n\n<!-- evident:evidence -->\nE1\n<!-- /evident:evidence -->\n\nI ran it.\n\n## Risks\ny')
    const once = withEvidence('## What\nx\n\n## Test plan\ntry it', 'E1')
    expect(once).toBe('## What\nx\n\n## Test plan\ntry it\n\n## Evidence\n\n<!-- evident:evidence -->\nE1\n<!-- /evident:evidence -->')
    expect(withEvidence(once, 'E2')).toBe(once.replace('E1', 'E2'))
    expect(withEvidence(once, '')).toBe('## What\nx\n\n## Test plan\ntry it')
  })
  it('is in the pull request only when it was sent', () => {
    const p = { id: 'p1', name: 'P' }
    expect(prBody(p, [], [], [], '', '', '## What\nx')).not.toMatch(/Evidence/)
    const body = prBody(p, [], [], [], '', '', '## What\nx', null, '', 'E1')
    expect(body.indexOf('## Evidence')).toBeGreaterThan(0)
    expect(body.indexOf('## Evidence')).toBeLessThan(body.indexOf('## Fine print'))
  })
})

describe('edits made on GitHub', () => {
  const p = { id: 'p1', name: 'P' }
  const written = '## What\nx\n\n## Merge Danger\nwatch the id'
  const sent = prBody(p, [{ identifier: 'A-2', title: 'one' }], [{ identifier: 'A-3', title: 'two' }], [], '', '', written, '## Review\n\nRun it: `./review/start.sh`', '<!-- evident:deploy -->\n1. Set the id\n<!-- /evident:deploy -->', 'E1')
  const last = { body: markOf(sent), written: markOf(written) }
  it('tells none, theirs and both apart, and cannot tell without a record', () => {
    expect(editsThere(last, `${sent}\r\n`, written)).toBe('none')
    expect(editsThere(last, sent.replace('## What\nx', '## What\nx, and y'), written)).toBe('theirs')
    expect(editsThere(last, sent.replace('## What\nx', '## What\nx, and y'), `${written}\nmore`)).toBe('both')
    expect(editsThere(null, 'anything', written)).toBe('none')
  })
  it('reads the writer\'s words back without the engine\'s blocks or its fine print', () => {
    expect(writtenFrom(sent)).toBe(written)
    expect(writtenFrom(sent.replace('## What\nx', '## What\nx, and y'))).toBe(written.replace('x', 'x, and y'))
  })
})
