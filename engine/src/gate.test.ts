import { describe, expect, it } from 'vitest'
import { gate } from './gate.js'

const wt = '/code/shop-worktrees/talk-abc', own = '/code/shop'
const base = { tool: 'Bash', always: false, level: 'cheap' as const, cwd: wt, whole: false, check: false }

describe('whether an agent\'s action runs, is asked, or is refused', () => {
  it('in a worktree nothing below expensive is put to the person, whatever the conversation\'s level', () => {
    expect(gate({ ...base, risk: 'cheap' })).toBe('allow')
    expect(gate({ ...base, risk: 'moderate' })).toBe('allow') // a command the engine does not recognise, an install, a commit
    expect(gate({ ...base, risk: 'moderate', tool: 'Edit' })).toBe('allow')
    expect(gate({ ...base, risk: 'expensive' })).toBe('ask') // hard to undo, or outward-facing: always the person's
    expect(gate({ ...base, risk: 'moderate', level: 'free' })).toBe('ask') // a person who chose to be asked everything is asked
  })

  it('a check\'s agent is never left waiting on a yes below expensive', () => {
    expect(gate({ ...base, check: true, level: 'cheap', risk: 'moderate' })).toBe('allow')
    expect(gate({ ...base, check: true, level: 'free', risk: 'moderate' })).toBe('allow')
    expect(gate({ ...base, check: true, cwd: own, risk: 'cheap' })).toBe('allow') // tests, a build
    expect(gate({ ...base, check: true, cwd: own, risk: 'moderate' })).toBe('deny') // a mark on the app's own checkout: refused with the reason, not asked
    expect(gate({ ...base, check: true, cwd: own, risk: 'moderate', tool: 'Write' })).toBe('allow')
    expect(gate({ ...base, check: true, risk: 'expensive' })).toBe('ask')
  })

  it('a conversation about the app as a whole keeps its level, and a command that leaves a mark there is asked', () => {
    expect(gate({ ...base, cwd: own, whole: true, level: 'moderate', risk: 'moderate' })).toBe('ask')
    expect(gate({ ...base, cwd: own, whole: true, level: 'moderate', risk: 'cheap' })).toBe('allow')
    expect(gate({ ...base, cwd: own, whole: true, level: 'cheap', risk: 'moderate', tool: 'Edit' })).toBe('ask')
    expect(gate({ ...base, cwd: own, whole: true, level: 'moderate', risk: 'moderate', tool: 'Edit' })).toBe('allow')
  })

  it('what is free, or allowed for the conversation, always runs', () => {
    expect(gate({ ...base, cwd: own, whole: true, level: 'free', risk: 'free' })).toBe('allow')
    expect(gate({ ...base, cwd: own, whole: true, level: 'free', risk: 'moderate', always: true })).toBe('allow')
  })
})
