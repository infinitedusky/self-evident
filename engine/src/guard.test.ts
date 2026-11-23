/** The planner's guard: it reads, it may hand in its answer, it changes nothing. */
import { describe, expect, it } from 'vitest'
import { readerGuard, builderGuard, STOP_ONLY_YOURS, stopsOthers } from './guard.js'
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
    expect(p('Skill', { skill: 'unknown:reverse-engineer-anything' })).toEqual({ allow: true })
    expect(p('mcp__rea__procedure_pseudo_code', {})).toEqual({ allow: true })
    expect(p('mcp__rea__capture_browser_scenario', {}).allow).toBe(false)
    expect(p('mcp__rea__inspect_web_page', {}).allow).toBe(false)
  })
})

describe('stopping processes', () => {
  // The four commands BON-71's builder really ran on 2026-11-14, each of which took Evident down with it.
  const ran = ['grep -c labelz apps/playground/src/App.tsx; pkill -f "pnpm dev" ; pkill -f "vite" ; sleep 1', 'pkill -f "vite --port 5180"; cat > /tmp/x.mjs', 'pkill -f "pnpm --parallel" ; pkill -f "node.*vite" ; (pnpm preview > /tmp/p.log 2>&1 &)']
  it('by name or by port is refused, however it is spelled', () => {
    for (const c of [...ran, 'killall node', 'kill -9 $(lsof -ti:5173)', 'kill `pgrep -f vite`', 'lsof -ti:4173 | xargs kill -9', 'pgrep -f storybook | xargs kill', 'npx kill-port 5173', 'ps aux | grep vite | awk \'{print $2}\' | xargs kill'])
      expect(stopsOthers(c), c).toBe(true)
  })
  it('of what it started, by the pid it kept, is fine; so is everything that only mentions the words', () => {
    for (const c of ['kill 4321', 'kill $!', 'kill %1', 'kill $(cat /tmp/yours.pid)', 'pnpm preview & echo $! > /tmp/yours.pid', 'lsof -ti:6300', 'pgrep -f vite', 'ps aux | grep vite', 'git log --grep "killall the bugs"; echo skill', 'pnpm test'])
      expect(stopsOthers(c), c).toBe(false)
  })
  it('a builder is refused it and told what to do instead; its other commands go on as before', () => {
    const guard = builderGuard('/tmp/wt', ['Read'], ['Edit'])
    for (const c of ran) expect(guard('Bash', { command: c })).toEqual({ allow: false, reason: STOP_ONLY_YOURS })
    expect(STOP_ONLY_YOURS).toMatch(/Stop only what you started, by its pid/)
    expect(guard('Bash', { command: 'pnpm test && kill $(cat /tmp/yours.pid)' })).toEqual({ allow: true })
    expect(guard('Bash', { command: 'git push' })).toMatchObject({ allow: false, reason: 'The engine handles branches, pushes and pull requests.' })
  })
})
