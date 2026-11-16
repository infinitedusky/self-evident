/** A built task is checked against its acceptance criteria: the brief the checking agent gets, and the verdicts read from what it reports. */
import { describe, expect, it } from 'vitest'
import { applyAcceptance, type Criterion } from './acceptance.js'
import { CHECK_TITLE, checkTaskBrief, readVerdicts, unchecked, verdictChange } from './verify.js'

const at = '2026-11-16T00:00:00.000Z'
const criteria: Criterion[] = [
  { id: 'ac_1', text: 'The file has every order (sample)', check: 'export.test.ts', by: 'user', at },
  { id: 'ac_2', text: 'Running it twice makes no duplicates (sample)', by: 'user', at },
  { id: 'ac_3', text: 'The page looks right on a phone (sample)', check: 'open /export at 390px', by: 'user', at },
]

describe('checking a built task against its criteria', () => {
  it('the agent is told to check and not build, and how to report', () => {
    const b = checkTaskBrief(criteria)
    expect(CHECK_TITLE).toBe('Check it against its acceptance criteria')
    for (const id of ['ac_1', 'ac_2', 'ac_3']) expect(b).toContain(`[${id}]`)
    expect(b).toContain('Check, do not build'); expect(b).toContain('```acceptance'); expect(b).toContain('not the whole suite')
  })

  it('reads the verdicts from the summary, for this task\'s criteria only, and marks them', () => {
    const summary = 'Checked all three.\n\n```acceptance\n[{"id":"ac_1","met":true,"evidence":"export.test.ts passes"},{"id":"ac_2","met":false,"evidence":"the second run adds a row"},{"id":"ac_3","met":null,"evidence":"needs a person: open /export at 390px"},{"id":"ac_other","met":true,"evidence":"x"},{"id":"ac_1","met":false,"evidence":"said twice"}]\n```'
    const v = readVerdicts(summary, criteria.map((c) => c.id))
    expect(v).toEqual([{ id: 'ac_1', met: true, evidence: 'export.test.ts passes' }, { id: 'ac_2', met: false, evidence: 'the second run adds a row' }, { id: 'ac_3', met: null, evidence: 'needs a person: open /export at 390px' }])
    const { list, changed } = applyAcceptance(criteria, verdictChange(v), 'engine')
    expect(changed).toBe(false) // a mark is not a change to what was approved: the brief stays approved
    expect(list.map((c) => [c.built, c.builtEvidence])).toEqual([[true, 'export.test.ts passes'], [false, 'the second run adds a row'], [undefined, 'needs a person: open /export at 390px']])
    expect(list.map(unchecked)).toEqual([false, false, false]) // left for a person is not asked for again
    expect(criteria.map(unchecked)).toEqual([true, true, true])
  })

  it('reads a bare list when the fence is missing, and nothing when there is no list', () => {
    expect(readVerdicts('Done. [{"id":"ac_2","met":true,"evidence":"dedupe.test.ts"}]', ['ac_2'])).toEqual([{ id: 'ac_2', met: true, evidence: 'dedupe.test.ts' }])
    expect(readVerdicts('I could not start the app.', ['ac_1'])).toEqual([])
    expect(readVerdicts('```acceptance\nnot json\n```', ['ac_1'])).toEqual([])
    expect(readVerdicts(null, ['ac_1'])).toEqual([])
  })
})
