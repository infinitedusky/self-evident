/** The planner's guard: it reads, it may hand in its answer, it changes nothing. */
import { describe, expect, it } from 'vitest'
import { readerGuard } from './guard.js'
import { reaRisk } from './skills.js'

describe('readerGuard', () => {
  const g = readerGuard(['Read', 'Glob', 'Grep', 'LS'])
  it('lets the planner read and hand in its structured answer', () => {
    expect(g('Read', { file_path: 'a.ts' })).toEqual({ allow: true })
    expect(g('StructuredOutput', { phases: [] })).toEqual({ allow: true })
    expect(g('Bash', { command: 'git log --oneline -5' })).toEqual({ allow: true })
  })
  it('refuses anything that changes something', () => {
    expect(g('Edit', { file_path: 'a.ts' }).allow).toBe(false)
    expect(g('Bash', { command: 'rm -rf x' }).allow).toBe(false)
  })
  it('admits the extra reads it is given, and nothing else from that server', () => {
    const p = readerGuard(['Read', 'Skill'], (t) => t.startsWith('mcp__rea__') && reaRisk(t.slice(10)).risk === 'free')
    expect(p('Skill', { skill: 'rea-agents:reverse-engineer-anything' })).toEqual({ allow: true })
    expect(p('mcp__rea__procedure_pseudo_code', {})).toEqual({ allow: true })
    expect(p('mcp__rea__capture_browser_scenario', {}).allow).toBe(false)
    expect(p('mcp__rea__inspect_web_page', {}).allow).toBe(false)
  })
})
