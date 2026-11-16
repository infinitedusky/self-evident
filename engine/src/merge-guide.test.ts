/** The merge guide: what the pull request opens with, put together from what the task holds. */
import { describe, expect, it } from 'vitest'
import { GUIDE_MAX, mergeGuide, mergeRecord, taskGuide, taskRecord, type GuideTask } from './merge-guide.js'
import { prBody } from './pr.js'
import { checkBrief, finalizeBrief, SUMMARY } from './checks.js'

const at = '2026-11-13T00:00:00.000Z'
const task: GuideTask = {
  identifier: 'XX-1', title: 'Export (sample)', description: 'People can download their orders as a file (sample).',
  acceptance: [
    { id: 'ac_1', text: 'The file has every order (sample)', check: 'export as Ada', built: true, builtEvidence: 'export.test.ts passes (sample)', by: 'agent', at },
    { id: 'ac_2', text: 'Running it twice makes no duplicates (sample)', built: false, builtEvidence: 'the second run adds a row', by: 'agent', at },
    { id: 'ac_3', text: 'Works on a phone (sample)', check: 'open /export at 390px', by: 'user', at },
  ],
  adr: '- Stream the file, do not build it in memory (sample).', risk: 'The orders query is shared with the dashboard: watch its p95 (sample).',
  decisions: [{ question: 'CSV or spreadsheet? (sample)', chosen: 'CSV', why: 'Opens everywhere.' }], pending: ['XX-4'],
}

describe('the merge guide', () => {
  it('opens with what to act on, then lists only what is not met or left for the person: what the build met is a count', () => {
    const g = taskGuide(task)
    expect(g.indexOf('**Not finished:** 1 sub-task still to land (XX-4). **1 of 3 acceptance criteria are not met.** 1 of 3 acceptance criteria were checked against the build and met. 1 is left for you.')).toBe(0)
    expect(g).toContain('**What it does:** People can download their orders as a file (sample).')
    const check = g.slice(g.indexOf('**For you to check**'))
    expect(check.indexOf('❌ Running it twice')).toBeLessThan(check.indexOf('⬜ Works on a phone'))
    expect(check).toContain('Missing: the second run adds a row'); expect(check).toContain('How: open /export at 390px')
    expect(g).not.toContain('The file has every order') // met: counted, not listed
    expect(g).toContain('**Decisions**\n\n- CSV or spreadsheet? (sample) → **CSV**'); expect(g).not.toContain('Opens everywhere') // the reason is in the record
    expect(g).toContain('**Risk:** The orders query is shared with the dashboard')
  })

  it('says so when everything is met, when nothing was checked, and when a task has no criteria', () => {
    const done = taskGuide({ ...task, pending: [], acceptance: task.acceptance.map((c) => ({ ...c, built: true })) })
    expect(done.indexOf('All 3 acceptance criteria were checked against the build and met.')).toBe(0); expect(done).not.toContain('For you to check')
    expect(taskGuide({ ...task, pending: [], acceptance: task.acceptance.map(({ built: _b, builtEvidence: _e, ...c }) => c) }).indexOf('The 3 acceptance criteria have not been checked against the build yet.')).toBe(0)
    expect(taskGuide({ ...task, acceptance: [], pending: [] })).toContain('no acceptance criteria, so nothing was checked against a list')
  })

  it('is never over its size, however much the task holds; the record keeps all of it', () => {
    const long = 'A long sentence about a diagram, its toolbar, its controls and what the reader sees when each is switched off (sample). '
    const big: GuideTask = {
      identifier: 'XX-9', title: `Public API (sample) ${long}`, description: long.repeat(12), pending: [],
      acceptance: Array.from({ length: 18 }, (_, n) => ({ id: `ac_${n}`, text: `${n}: ${long}`, check: long.repeat(3), ...(n < 4 ? { built: false as const, builtEvidence: long.repeat(2) } : {}), by: 'agent', at })),
      adr: long.repeat(6), risk: `${long.repeat(4)}\n${long}`, checklist: Array.from({ length: 9 }, () => `- ${long}`).join('\n'),
      decisions: Array.from({ length: 14 }, (_, n) => ({ question: `${n}? ${long}`, chosen: long, why: long.repeat(3) })),
      requirements: ['Telemetry', 'Tests', 'Test plan', 'Docs', 'Stories'].map((name) => ({ key: name, name, applies: true, how: long.repeat(4) })),
    }
    const g = taskGuide(big, { heading: true })
    expect(g.length).toBeLessThanOrEqual(GUIDE_MAX)
    expect(g).toContain('**4 of 18 acceptance criteria are not met.**'); expect(g).toMatch(/and \d+ more in the record below/)
    expect(taskGuide(task).length).toBeLessThan(GUIDE_MAX)
    const r = taskRecord(big)
    for (let n = 0; n < 18; n++) expect(r).toContain(`${n}: A long sentence`)
    expect(r).toContain('13? A long sentence'); expect(r).toContain('**Risks, and how we would know**'); expect(r).toContain('✅ **Stories**')
    expect(taskRecord(task)).toContain('✅ The file has every order (sample). Seen: export.test.ts passes (sample)')
  })

  it('heads each task when a pull request carries several; the pull request opens with it and folds the rest away', () => {
    const g = mergeGuide([task, { ...task, identifier: 'XX-2', title: 'Import (sample)' }])
    expect(g).toMatch(/^## Merge guide\n\n### XX-1 Export \(sample\)/); expect(g).toContain('### XX-2 Import (sample)'); expect(g).toMatch(/\*\*To undo:\*\* revert this pull request\.$/)
    expect(mergeGuide([])).toBe('')
    const body = prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [{ identifier: 'XX-3', title: 'Stream it', summary: 'Done.' }], [], [], mergeGuide([task]), mergeRecord([task]))
    expect(body).not.toContain('Long project text.')
    const fold = body.indexOf('<details>')
    expect(body.indexOf('## Merge guide')).toBeLessThan(fold)
    for (const inside of ['**Every acceptance criterion**', 'Opens everywhere.', '## What landed, sub-task by sub-task', '### XX-3 Stream it']) { expect(body.indexOf(inside)).toBeGreaterThan(fold); expect(body.indexOf(inside)).toBeLessThan(body.indexOf('</details>')) }
    expect(body).toContain('whole test run is once per task'); expect(body).not.toContain('tested on the merged commit')
    expect(prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [], [])).toContain('## Landed') // without a guide, as before
    expect(prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [], [])).not.toContain('<details>')
  })

  it('every check is asked for a summary for the person, apart from the report for the next agent', () => {
    const f = { identifier: 'XX-1', title: 'Export', issueId: 'iss_x', base: 'main', prototype: null, before: [] }
    for (const key of ['analysis', 'adr', 'risk', 'audit'] as const) { expect(checkBrief(key, f)).toContain(SUMMARY); expect(checkBrief(key, f)).toContain('written for the next agent') }
    expect(SUMMARY).toMatch(/At most eight bullets/)
    expect(checkBrief('analysis', f)).toMatch(/\*\*Telemetry hook points\*\*[\s\S]*never names, links or other personal data[\s\S]*which failure would otherwise be silent/)
    expect(finalizeBrief(['analysis'], f)).toMatch(/the telemetry has criteria of its own/)
    expect(checkBrief('audit', f)).toMatch(/telemetry: whether the plan's sub-tasks put in every hook point/)
  })
})

describe('the merge checklist', () => {
  it('is on the pull request first, as boxes to tick, from what the last step before the build wrote', () => {
    const guide = taskGuide({ identifier: 'SS-1', title: 'T', acceptance: [], decisions: [], pending: [], checklist: '- Open /checkout and pay with a saved card: one page\n2. `pnpm test` passes\n* [ ] The declined-card span shows in the trace' })
    expect(guide).toContain('**Before you merge**\n\n- [ ] Open /checkout and pay with a saved card: one page\n- [ ] `pnpm test` passes\n- [ ] The declined-card span shows in the trace')
    expect(guide.indexOf('**Before you merge**')).toBeGreaterThan(0)
    expect(taskGuide({ identifier: 'SS-1', title: 'T', acceptance: [], decisions: [], pending: [] })).not.toContain('Before you merge')
  })
})
