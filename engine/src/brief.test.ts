/** A task's brief: what and why, short, and held to it for agents. */
import { describe, expect, it } from 'vitest'
import { BRIEF_FORM, BRIEF_HARD, BRIEF_WORDS, briefTooLong, briefWords } from './brief.js'
import { prompt } from './planner.js'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('a task\'s brief', () => {
  it('is counted in words, and an agent is refused past the hard limit with the form it should have', () => {
    expect(briefWords('  What it does.\n\nWhy.  ')).toBe(4)
    expect(briefWords(null)).toBe(0)
    expect(briefTooLong(words(BRIEF_WORDS))).toBeNull()
    expect(briefTooLong(words(BRIEF_HARD))).toBeNull() // a little over is not worth a round trip
    expect(briefTooLong(words(BRIEF_HARD + 1))).toMatch(new RegExp(`^this brief is ${BRIEF_HARD + 1} words\\. A task's brief is for the person who approves it`))
    expect(briefTooLong(undefined)).toBeNull()
  })
  it('the form names its three parts and what does not belong in it', () => {
    expect(BRIEF_FORM).toMatch(/\*\*What\*\*[\s\S]*\*\*Why\*\*[\s\S]*\*\*Not in this task\*\*/)
    expect(BRIEF_FORM).toMatch(/No file names, functions, tables, libraries, steps or instructions to a builder/)
    expect(BRIEF_FORM.split(/\s+/).length).toBeLessThan(140) // the rule itself is short
  })
  it('the planner is given what the prototype taught directly, since the brief no longer carries it', () => {
    const base = { repoPath: '/tmp/x', appId: 'a', issue: { identifier: 'SS-1', title: 'T', brief: 'What. Why.' }, acceptance: null, project: { name: 'P', content: null }, earlier: [], onEvent: async () => {} } as never as Parameters<typeof prompt>[0]
    const text = prompt({ ...base, analysis: '## Cleaner\n- one function for totals' })
    expect(text).toContain('The prototype analysis (the brief says what and why')
    expect(text).toContain('one function for totals')
    expect(prompt(base)).not.toContain('The prototype analysis')
  })
})
