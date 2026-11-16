/** How a pull request is titled and opened. That none is opened until the person submits it is tested with the runner (runner.test.ts). */
import { describe, expect, it } from 'vitest'
import { prAuto, prBody, prDraft, prTitle } from './pr.js'

describe('how a pull request is titled and opened', () => {
  it('is opened by the person unless the app is set to open them by itself', () => { expect(prAuto({})).toBe(false); expect(prAuto({ pr_open: 'manual' })).toBe(false); expect(prAuto({ pr_open: 'auto' })).toBe(true) })
  it('is a draft unless the app says otherwise', () => { expect(prDraft(null)).toBe(true); expect(prDraft({})).toBe(true); expect(prDraft({ pr_draft: false })).toBe(false) })
  it('takes its title from the app\'s template, by the team\'s ticket id when there is one; a task\'s exact title wins', () => {
    const v = { ticket: 'SHOP-12', id: 'SH-3', title: 'Export orders (sample)', project: 'Orders', n: 1, of: 2 }
    expect(prTitle({ pr_title: 'feat[{ticket}]: {title}' }, v)).toBe('feat[SHOP-12]: Export orders (sample)')
    expect(prTitle({ pr_title: '{id} {title} ({n} of {of}, {project})' }, { ...v, ticket: null })).toBe('SH-3 Export orders (sample) (1 of 2, Orders)')
    expect(prTitle({ pr_title: '[{ticket}] {title}' }, { ...v, ticket: null })).toBe('[SH-3] Export orders (sample)') // no ticket of theirs: ours
    expect(prTitle({ pr_title: 'feat[{ticket}]: {title}' }, v, 'fix(T12)[SHOP-12]: orders export (sample)')).toBe('fix(T12)[SHOP-12]: orders export (sample)')
    expect(prTitle({}, v)).toBeNull() // no template: the engine's own title
  })
  it('says in its text how many sub-tasks have landed, and that it is not ready while some have not', () => {
    const p = { id: 'proj_x', name: 'Orders (sample)' }
    expect(prBody(p, [{ identifier: 'SH-4', title: 'A' }], [{ identifier: 'SH-5', title: 'B' }, { identifier: 'SH-6', title: 'C' }])).toContain('**1 of 3 sub-tasks have landed: this pull request is still being built, and is not ready to review until they all have.**')
    expect(prBody(p, [{ identifier: 'SH-4', title: 'A' }, { identifier: 'SH-5', title: 'B' }], [])).toContain('**2 of 2 sub-tasks have landed.**')
  })
})
