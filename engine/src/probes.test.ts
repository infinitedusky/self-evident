/** Probes: an app's list, what runs next, and what a probe's agent is told and reports. Sample data throughout. */
import { describe, expect, it } from 'vitest'
import { agentProbes, cleanProbes, commandProbes, nextProbe, probeBrief, probeFixBrief, probeOfTitle, probesOf, probeTitle, readProbe, resultOf, withResult, type ProbeResult } from './probes.js'

const setup = { test_cmd: 'pnpm test', probes: [
  { name: 'Lint', kind: 'command', runs: 'pnpm lint' },
  { name: 'Security review', kind: 'skill', runs: 'backend-core:security-review' },
  { key: 'comments', on: false }, { key: 'break', blocks: false },
  { name: 'No command', kind: 'command', runs: ' ' }, { name: 'Lint', kind: 'command', runs: 'again' }, { name: 'Odd', kind: 'judged', runs: 'x' },
] }

describe('an app\'s probes', () => {
  it('are the engine\'s own, the test command, then the app\'s, each switched by its key', () => {
    expect(probesOf(setup).map((p) => [p.key, p.kind, p.runs.slice(0, 12), p.blocks, p.on])).toEqual([
      ['break', 'built-in', 'used the way', false, true], ['comments', 'built-in', 'no debug out', false, false],
      ['tests', 'command', 'pnpm test', true, true], ['lint', 'command', 'pnpm lint', true, true], ['security_review', 'skill', 'backend-core', true, true],
    ])
    expect(agentProbes(setup).map((p) => p.key)).toEqual(['break', 'security_review']); expect(commandProbes(setup).map((p) => p.key)).toEqual(['tests', 'lint'])
  })
  it('with nothing set are the two built in, and no command', () => {
    expect(probesOf({}).map((p) => p.key)).toEqual(['break', 'comments']); expect(commandProbes(null)).toEqual([])
  })
  it('what is saved is tidied: nothing to run, a name twice and an unknown kind are dropped', () => {
    expect(cleanProbes(setup.probes).map((p) => p.key)).toEqual(['lint', 'security_review', 'comments', 'break']); expect(cleanProbes('x')).toEqual([])
  })
})

describe('what the agents\' probes do next', () => {
  const [brk, sec] = agentProbes(setup).map((p) => ({ ...p, blocks: true }))
  const res = (key: string, pass: boolean | null, fixes = 0, blocks = true): ProbeResult => ({ key, name: key, kind: 'built-in', pass, evidence: '', findings: pass === false ? ['it breaks (sample)'] : [], blocks, fixes, at: '' })
  it('each runs once, in order', () => {
    expect(nextProbe([brk, sec], [], 0)).toMatchObject({ do: 'run', probe: { key: 'break' }, run: 1 })
    expect(nextProbe([brk, sec], [res('break', true)], 0)).toMatchObject({ do: 'run', probe: { key: 'security_review' } })
    expect(nextProbe([brk, sec], [res('break', true), res('security_review', true)], 0)).toEqual({ do: 'done' })
    expect(nextProbe([], [], 0)).toEqual({ do: 'done' })
  })
  it('what the blocking ones found is sent back together, once all have run, and only those are run again', () => {
    const both = [res('break', false), res('security_review', false)]
    expect(nextProbe([brk, sec], [both[0]], 0)).toMatchObject({ do: 'run', probe: { key: 'security_review' } }) // not sent back one at a time
    expect(nextProbe([brk, sec], both, 0)).toMatchObject({ do: 'fix', round: 1, failing: [{ key: 'break' }, { key: 'security_review' }] })
    expect(nextProbe([brk, sec], [res('break', false), res('security_review', true)], 1)).toMatchObject({ do: 'run', probe: { key: 'break' }, run: 2 })
    expect(nextProbe([brk, sec], [res('break', true, 1), res('security_review', true)], 1)).toEqual({ do: 'done' })
  })
  it('three rounds, then a person; one that only reports, or could not be run, holds nothing', () => {
    expect(nextProbe([brk], [res('break', false, 3)], 3)).toMatchObject({ do: 'stuck', failing: [{ key: 'break' }] })
    expect(nextProbe([brk], [res('break', false, 0, false)], 0)).toEqual({ do: 'done' })
    expect(nextProbe([brk], [res('break', null)], 0)).toEqual({ do: 'done' })
  })
})

describe('a probe\'s agent', () => {
  const criteria = [{ id: 'ac_1', text: 'The file has every order (sample)', by: 'user', at: '' }]
  it('is told it changes nothing and how to report, whatever it runs', () => {
    for (const p of probesOf(setup).filter((x) => x.kind !== 'command')) {
      const b = probeBrief(p, criteria as never, 'main')
      expect(b).toContain('You did not build this'); expect(b).toContain('You change nothing'); expect(b).toContain('```probe')
    }
    expect(probeBrief(probesOf(setup)[0], criteria as never, 'main')).toContain('[ac_1]')
    // Trying to break it is using it, never running the repository's suites: those are CI's, and what is judged by eye is the person's.
    const brk = probeBrief(probesOf(setup)[0], criteria as never, 'main')
    expect(brk).toContain('is not a scenario: leave it'); expect(brk).toContain('Do not run those suites or their scripts here'); expect(brk).not.toContain('start to finish')
    expect(probeBrief(probesOf(setup)[1], criteria as never, 'main')).toContain('git diff main...HEAD')
    expect(probeBrief(probesOf(setup)[4], criteria as never, 'main')).toContain('Invoke `backend-core:security-review` with the Skill tool')
  })
  it('its verdict is read from the end of its summary; findings make it a fail whatever it says', () => {
    expect(readProbe('Looked.\n```probe\n{"pass":true,"evidence":"tried five things","findings":[]}\n```')).toEqual({ pass: true, evidence: 'tried five things', findings: [] })
    expect(readProbe('```probe\n{"pass":true,"evidence":"x","findings":["an empty export crashes"]}\n```')?.pass).toBe(false)
    expect(readProbe('no block')).toBeNull(); expect(readProbe('```probe\nnot json\n```')).toBeNull()
    expect(resultOf(probesOf(setup)[0], 'nothing', 2, 'now')).toMatchObject({ key: 'break', pass: null, evidence: 'Its agent gave no verdict.', fixes: 2 })
  })
  it('is known by its sub-task\'s title, and its latest result replaces the one before', () => {
    const all = probesOf(setup)
    expect(probeTitle(all[0])).toBe('Probe: Try to break it'); expect(probeTitle(all[0], 2)).toBe('Probe: Try to break it (2)')
    expect(probeOfTitle('Probe: Try to break it (2)', all)?.key).toBe('break'); expect(probeOfTitle('Build it', all)).toBeNull(); expect(probeOfTitle('Probe: Gone', all)).toBeNull()
    const a = resultOf(all[0], null, 0, 'a'), b = { ...a, pass: true, at: 'b' }
    expect(withResult([a], b)).toEqual([b]); expect(withResult(null, a)).toEqual([a])
  })
  it('what they found goes back to a builder in one brief', () => {
    const b = probeFixBrief([{ key: 'break', name: 'Try to break it', kind: 'built-in', pass: false, evidence: '', findings: ['an empty export crashes (sample)'], blocks: true, fixes: 0, at: '' }, { key: 's', name: 'Security review', kind: 'skill', pass: false, evidence: 'the token is logged (sample)', findings: [], blocks: true, fixes: 0, at: '' }], 2)
    expect(b).toContain('round 2 of 3'); expect(b).toContain('- an empty export crashes (sample)'); expect(b).toContain('Security review:\n- the token is logged (sample)'); expect(b).toContain('run again')
  })
})
