/** The merge guide: what the pull request opens with, put together from what the task holds. */
import { describe, expect, it } from 'vitest'
import { mergeGuide, taskGuide, type GuideTask } from './merge-guide.js'
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
  it('opens with what to act on, then what it does, each criterion with the build\'s mark (not met first), decisions, risks', () => {
    const g = taskGuide(task)
    expect(g.indexOf('**1 acceptance criterion is not met.**')).toBe(0)
    expect(g).toContain('**Not finished:** 1 sub-task still to land (XX-4).')
    expect(g).toContain('**What it does**\n\nPeople can download their orders as a file (sample).')
    const check = g.slice(g.indexOf('**How to check it**'))
    expect(check.indexOf('❌ Running it twice')).toBeLessThan(check.indexOf('⬜ Works on a phone')); expect(check.indexOf('⬜ Works on a phone')).toBeLessThan(check.indexOf('✅ The file has every order'))
    expect(check).toContain('Missing: the second run adds a row'); expect(check).toContain('How to check: open /export at 390px'); expect(check).toContain('Seen: export.test.ts passes (sample)')
    expect(g).toContain('**Decisions made**\n\n- Stream the file, do not build it in memory (sample).\n- CSV or spreadsheet? (sample) → **CSV**. Opens everywhere.')
    expect(g).toContain('**Risks, and how we would know**\n\n- The orders query is shared with the dashboard')
  })

  it('says so when everything is met, and when a task has no criteria to check it against', () => {
    const done = taskGuide({ ...task, pending: [], acceptance: task.acceptance.map((c) => ({ ...c, built: true })) })
    expect(done.indexOf('All 3 acceptance criteria are met.')).toBe(0)
    expect(taskGuide({ ...task, acceptance: [], pending: [] })).toContain('no acceptance criteria, so there is no list to check it against')
  })

  it('heads each task when a pull request carries several, and is the first thing in the pull request', () => {
    const g = mergeGuide([task, { ...task, identifier: 'XX-2', title: 'Import (sample)' }])
    expect(g).toMatch(/^## Merge guide\n\n### XX-1 Export \(sample\)/); expect(g).toContain('### XX-2 Import (sample)'); expect(g).toMatch(/\*\*To undo:\*\* revert this pull request\.$/)
    expect(mergeGuide([])).toBe('')
    const body = prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [{ identifier: 'XX-3', title: 'Stream it', summary: 'Done.' }], [], [], mergeGuide([task]))
    expect(body.indexOf('## Merge guide')).toBeLessThan(body.indexOf('## What landed, sub-task by sub-task')); expect(body).not.toContain('Long project text.')
    expect(prBody({ id: 'proj_x', name: 'Orders (sample)', content: 'Long project text.' }, [], [])).toContain('## Landed') // without a guide, as before
  })

  it('every check is asked for a summary for the person, apart from the report for the next agent', () => {
    const f = { identifier: 'XX-1', title: 'Export', issueId: 'iss_x', base: 'main', prototype: null, before: [] }
    for (const key of ['analysis', 'adr', 'risk', 'audit'] as const) { expect(checkBrief(key, f)).toContain(SUMMARY); expect(checkBrief(key, f)).toContain('written for the next agent') }
    expect(SUMMARY).toMatch(/At most eight bullets/)
    expect(checkBrief('analysis', f)).toMatch(/\*\*Telemetry hook points\*\*[\s\S]*never names, links or other personal data[\s\S]*which failure would otherwise be silent/)
    expect(finalizeBrief(['analysis'], f)).toMatch(/a \*\*Telemetry\*\* section[\s\S]*the telemetry has criteria of its own/)
    expect(checkBrief('audit', f)).toMatch(/telemetry: whether the brief's Telemetry section has every hook point/)
  })
})
