/** Stacked PRs: where an issue's branch starts and what its PR is against. */
import { describe, expect, it } from 'vitest'
import { issueStart, landingBranch, prMode, stackBase } from './branches.js'

const issues = [{ id: 'a', identifier: 'HG-4', sortOrder: 0 }, { id: 'b', identifier: 'HG-5', sortOrder: 1 }, { id: 'c', identifier: 'HG-6', sortOrder: 2 }]

describe('stacked PRs', () => {
  it('lands on the project branch by default, on the issue branch (named for Linear) in issue mode', () => {
    expect(prMode({})).toBe('project'); expect(prMode({ pr_mode: 'issue' })).toBe('issue'); expect(prMode({ pr_mode: 'task' })).toBe('issue')
    expect(landingBranch('project', 'project/p1', issues[1])).toBe('project/p1')
    expect(landingBranch('issue', 'project/p1', issues[1])).toBe('project/p1--hg-5')
  })
  it('an issue branch starts from the nearest earlier issue branch, else the project branch', () => {
    expect(issueStart('project/p1', issues[0], issues, new Set())).toBe('project/p1')
    expect(issueStart('project/p1', issues[2], issues, new Set(['project/p1--hg-4']))).toBe('project/p1--hg-4')
    expect(issueStart('project/p1', issues[2], issues, new Set(['project/p1--hg-4', 'project/p1--hg-5']))).toBe('project/p1--hg-5')
  })
  it('an issue PR is against the nearest earlier open PR, else main', () => {
    const prs = [{ issueId: 'a', status: 'merged', headBranch: 'project/p1--hg-4', number: 1 }, { issueId: 'b', status: 'open', headBranch: 'project/p1--hg-5', number: 2 }]
    expect(stackBase('main', issues[0], issues, prs)).toEqual({ base: 'main', on: null })
    expect(stackBase('main', issues[1], issues, prs)).toEqual({ base: 'main', on: null }) // the one below merged
    expect(stackBase('main', issues[2], issues, prs)).toEqual({ base: 'project/p1--hg-5', on: 2 })
  })
})
