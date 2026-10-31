/** Reading a Claude Code session file: what was said and done, from a line on. */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lastUuid, readTurns, sessionDir, sessionTitle } from './terminal.js'

const file = (entries: object[]) => {
  const f = join(mkdtempSync(join(tmpdir(), 'se-terminal-')), 's.jsonl')
  writeFileSync(f, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return f
}
const T = '2026-10-31T10:00:00.000Z'
const sample = file([
  { type: 'user', uuid: 'u1', timestamp: T, message: { role: 'user', content: 'In the UI: what needs me?' } },
  { type: 'assistant', uuid: 'a1', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: 'Three things.' }] } },
  { type: 'ai-title', title: 'What needs me' },
  { type: 'user', uuid: 'u2', timestamp: T, message: { role: 'user', content: 'From the terminal: start the first' } },
  { type: 'user', uuid: 'm1', timestamp: T, isMeta: true, message: { role: 'user', content: 'caveat' } },
  { type: 'user', uuid: 'r1', timestamp: T, message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>ignore</system-reminder>' }] } },
  { type: 'assistant', uuid: 'a2', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } },
  { type: 'user', uuid: 'u3', timestamp: T, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.ts' }] }] } },
  { type: 'assistant', uuid: 's1', timestamp: T, isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'a subagent' }] } },
  { type: 'assistant', uuid: 'a3', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: 'Started.' }] } },
])

describe('readTurns', () => {
  it('reads words, tool calls and results, leaving out meta lines, reminders and subagents', () => {
    expect(readTurns(sample, null).map((t) => [t.author, t.kind, t.body])).toEqual([
      ['user', 'text', 'In the UI: what needs me?'], ['agent', 'text', 'Three things.'], ['user', 'text', 'From the terminal: start the first'],
      ['tool', 'tool_call', 'Bash'], ['tool', 'tool_result', 'a.ts'], ['agent', 'text', 'Started.'],
    ])
  })
  it('starts after the line it is given: the hand-off point', () => {
    expect(readTurns(sample, 'a1').map((t) => t.body)).toEqual(['From the terminal: start the first', 'Bash', 'a.ts', 'Started.'])
    expect(readTurns(sample, 'a3')).toEqual([])
  })
  it('keeps each turn\'s line, so the next read starts after it', () => {
    expect(readTurns(sample, 'u2')[0]).toMatchObject({ uuid: 'a2', payload: { tool: 'Bash', toolUseId: 't1' } })
  })
  it('has nothing for a file that is not there', () => expect(readTurns('/nope/x.jsonl', null)).toEqual([]))
})

describe('the file', () => {
  it('knows its last line and its title', () => {
    expect(lastUuid(sample)).toBe('a3')
    expect(sessionTitle(sample)).toBe('What needs me')
  })
  it('lives where Claude Code keeps a folder\'s sessions', () => {
    expect(sessionDir('/Users/x/code/my_app')).toMatch(/\/projects\/-Users-x-code-my-app$/)
  })
})
