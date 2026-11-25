import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bringSession } from './session-move.js'
import { sessionFile } from './terminal.js'

const CWD = '/work/shop (sample)'
const ID = '00000000-0000-4000-8000-000000000001'
const login = () => mkdtempSync(join(tmpdir(), 'login-'))
const write = (folder: string, text: string, at: number) => {
  const f = sessionFile(CWD, ID, folder)
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); utimesSync(f, at, at)
  return f
}

describe('a conversation follows its app to another login', () => {
  it('copies the session, and what is kept beside it, to the login it is about to run on', () => {
    const [was, now] = [login(), login()]
    const f = write(was, 'said before\n', 1000)
    const beside = join(f.replace(/\.jsonl$/, ''), 'tool-results'); mkdirSync(beside, { recursive: true }); writeFileSync(join(beside, 'one.txt'), 'a result')
    expect(bringSession(CWD, ID, now, [was])).toEqual({ from: was })
    expect(readFileSync(sessionFile(CWD, ID, now), 'utf8')).toBe('said before\n')
    expect(readFileSync(join(sessionFile(CWD, ID, now).replace(/\.jsonl$/, ''), 'tool-results', 'one.txt'), 'utf8')).toBe('a result')
    expect(readFileSync(f, 'utf8')).toBe('said before\n') // the login it came from keeps its own
  })
  it('does nothing when the session is already there and nothing newer is elsewhere', () => {
    const [was, now] = [login(), login()]
    write(was, 'said before\n', 1000); write(now, 'said before\nand since\n', 2000)
    expect(bringSession(CWD, ID, now, [was, now])).toBeNull()
    expect(readFileSync(sessionFile(CWD, ID, now), 'utf8')).toBe('said before\nand since\n')
  })
  it('brings what was said since, on going back to an earlier login', () => {
    const [first, second] = [login(), login()]
    write(first, 'said before\n', 1000); write(second, 'said before\nand since\n', 2000)
    expect(bringSession(CWD, ID, first, [second])).toEqual({ from: second })
    expect(readFileSync(sessionFile(CWD, ID, first), 'utf8')).toBe('said before\nand since\n')
  })
  it('does nothing when no login has the session', () => {
    expect(bringSession(CWD, ID, login(), [login()])).toBeNull()
  })
})
