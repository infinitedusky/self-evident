/** An app's hooks as files: which file is hooked at a point, and what a before-start hook gives. Everything here is made up. */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findHook, gaveOf, POINTS, workbenchDirOf } from './hooks.js'

describe('an app\'s hooks', () => {
  it('the folder is named in the app\'s settings', () => {
    expect(workbenchDirOf({ workbench: { dir: ' /somewhere/bench ' } })).toBe('/somewhere/bench')
    expect(workbenchDirOf({})).toBeNull()
    expect(workbenchDirOf(null)).toBeNull()
  })
  it('a hook is the file in hooks/ named for its point, with any extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-'))
    try {
      expect(findHook(dir, 'before-start')).toBeNull() // no hooks folder
      mkdirSync(join(dir, 'hooks', 'before-start.d'), { recursive: true }) // a folder is not a hook
      writeFileSync(join(dir, 'hooks', 'before-starting.sh'), '') // nor a file that only begins alike
      expect(findHook(dir, 'before-start')).toBeNull()
      writeFileSync(join(dir, 'hooks', 'before-start.sh'), 'echo A=1\n'); chmodSync(join(dir, 'hooks', 'before-start.sh'), 0o755)
      writeFileSync(join(dir, 'hooks', 'task-closed'), '')
      expect(findHook(dir, 'before-start')).toBe('hooks/before-start.sh')
      expect(findHook(dir, 'task-closed')).toBe('hooks/task-closed')
      expect(findHook(dir, 'after-stop')).toBeNull()
      expect(findHook(null, 'after-stop')).toBeNull()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('what a before-start hook prints as NAME=value is given on; the rest is talk', () => {
    expect(gaveOf('looking…\nSAMPLE_COMPANY_ID=c-1\nexport MODE="made up"\n  QUOTED=\'x y\'  \nnot one = this\n1BAD=no\nEMPTY=\n')).toEqual({ SAMPLE_COMPANY_ID: 'c-1', MODE: 'made up', QUOTED: 'x y', EMPTY: '' })
    expect(gaveOf('')).toEqual({})
  })
  it('every point says when it runs, what it is given and what follows', () => {
    expect(POINTS.map((p) => p.point)).toEqual(['before-start', 'after-stop', 'task-closed'])
    for (const p of POINTS) { expect(p.when).toBeTruthy(); expect(p.given.length).toBeGreaterThan(0); expect(p.then).toBeTruthy() }
  })
})
