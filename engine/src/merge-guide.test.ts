/** The merge guide: what the pull request opens with, put together from what the task holds. */
import { describe, expect, it } from 'vitest'
import { GUIDE_MAX, mergeGuide, mergeRecord, taskGuide, taskRecord, undoOf, type GuideTask } from './merge-guide.js'
import { coveredLines, notYet } from './requirements.js'
import { requirementsChecked } from './verify.js'
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

  it('says how the change is taken back in the task\'s own words, never a default that may contradict them', () => {
    // The blast radius says it: its line, word for word.
    const never = { ...task, riskAll: 'It changes the scan table (sample).\n- **To undo:** never revert after the first scan; fix forward with a new migration (sample).' }
    expect(undoOf(never)).toBe('never revert after the first scan; fix forward with a new migration (sample).')
    expect(mergeGuide([never])).toMatch(/\*\*To undo:\*\* never revert after the first scan; fix forward with a new migration \(sample\)\.$/)
    expect(mergeGuide([never])).not.toContain('revert this pull request')
    // It speaks of rolling back without that heading: still its line.
    expect(undoOf({ ...task, riskAll: 'The flag can be turned off, and the change rolled back by reverting the pull request (sample).' })).toMatch(/rolled back by reverting/)
    // A blast radius that does not say: said, and nobody is told to revert.
    expect(undoOf(task)).toBeNull()
    expect(mergeGuide([task])).toMatch(/\*\*To undo:\*\* its blast radius does not say how\. Ask before reverting\.$/)
    // No blast radius at all: the default, as a default.
    expect(mergeGuide([{ ...task, risk: null }])).toMatch(/nothing on this task says how\. Reverting this pull request is the default; check that it is safe first\.$/)
  })

  it('never shows a requirement as met when its evidence says it is still to come', () => {
    expect(notYet('No PR yet: it needs the pull request to exist (sample)')).toBe(true); expect(notYet('to be written with the pull request')).toBe(true)
    expect(notYet('RISKS.md lists three, each with how we would know (sample)')).toBe(false); expect(notYet(null)).toBe(false)
    const reqs = [{ key: 'risks', name: 'Risks', applies: true, how: 'No PR yet: it needs the pull request to exist (sample)', built: true }, { key: 'tests', name: 'Tests', applies: true, how: 'export.test.ts (sample)', built: true }]
    expect(taskGuide({ ...task, requirements: reqs })).toContain('⬜ Risks · ✅ Tests')
    expect(coveredLines(reqs)).toContain('- ⬜ **Risks**: not yet. No PR yet'); expect(coveredLines(reqs)).toContain('- ✅ **Tests**: export.test.ts (sample)')
    // And the check's own mark is not kept as met in the first place.
    const required = [{ key: 'risks', name: 'Risks', what: 'x', on: true }, { key: 'tests', name: 'Tests', what: 'y', on: true }]
    const checked = requirementsChecked(required, null, [{ id: 'req_risks', met: true, evidence: 'No PR yet: it needs the pull request (sample)' }, { id: 'req_tests', met: true, evidence: 'export.test.ts (sample)' }])
    expect(checked[0].built).toBeUndefined(); expect(checked[1].built).toBe(true)
  })

  it('a description written for the team leads the pull request; everything of ours is folded at the bottom', () => {
    const written = '## What changed and why\n\nPeople can download their orders (sample).\n\n## Rollback\n\nRevert; no data is written (sample).'
    const body = prBody({ id: 'proj_x', name: 'Orders (sample)' }, [{ identifier: 'XX-3', title: 'Stream it', summary: 'Done.' }], [], [], mergeGuide([task]), mergeRecord([task]), written)
    expect(body.startsWith(written)).toBe(true)
    const fold = body.indexOf('<details>')
    for (const ours of ['Built by Evident', '## Merge guide', 'XX-3 Stream it', '**Every acceptance criterion**']) expect(body.indexOf(ours)).toBeGreaterThan(fold)
    expect(body.slice(0, fold)).not.toMatch(/XX-\d|proj_x|Evident/) // nothing of ours above the fold
    expect(body.trimEnd().endsWith('via Evident')).toBe(true)
  })

  it('heads each task when a pull request carries several; the pull request opens with it and folds the rest away', () => {
    const g = mergeGuide([task, { ...task, identifier: 'XX-2', title: 'Import (sample)' }])
    expect(g).toMatch(/^## Merge guide\n\n### XX-1 Export \(sample\)/); expect(g).toContain('### XX-2 Import (sample)'); expect(g).toMatch(/\*\*To undo:\*\* \n\n- XX-1: its blast radius does not say how\. Ask before reverting\.\n- XX-2: its blast radius does not say how\. Ask before reverting\.$/)
    expect(mergeGuide([])).toBe('')
    const body = prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [{ identifier: 'XX-3', title: 'Stream it', summary: 'Done.' }], [], [], mergeGuide([task]), mergeRecord([task]))
    expect(body).not.toContain('Long project text.')
    const fold = body.indexOf('<details>')
    expect(body.indexOf('## Merge guide')).toBeLessThan(fold)
    for (const inside of ['**Every acceptance criterion**', 'Opens everywhere.', '## What landed, sub-task by sub-task', '### XX-3 Stream it']) { expect(body.indexOf(inside)).toBeGreaterThan(fold); expect(body.indexOf(inside)).toBeLessThan(body.indexOf('</details>')) }
    expect(body).toContain('whole test run is once per task'); expect(body).not.toContain('tested on the merged commit')
    expect(body).not.toMatch(/^Built by Evident/); expect(body.indexOf('Built by Evident from project `proj_x`')).toBeGreaterThan(fold) // which project of ours it is belongs to our record, not the top
    expect(prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [], [])).toMatch(/^Long project text\./) // without a guide the project's own words lead
    expect(prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [], [])).toContain('<details>') // our record is folded whatever leads
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
