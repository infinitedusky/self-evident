/** The risk classes the engine assigns to an agent's tool calls; the person's threshold decides what asks. */
import { describe, expect, it } from 'vitest'
import { riskOf } from './risk.js'

const onBranch = { cwd: '/repo', branch: 'fix/thing' }
const onMain = { cwd: '/repo', branch: 'main' }
const r = (tool: string, input: Record<string, unknown>, ctx = onBranch) => riskOf(tool, input, ctx).risk

describe('riskOf', () => {
  it('reads are free, including the read-only engine tools and read-only shell', () => {
    expect(r('Read', { file_path: '/repo/a.ts' })).toBe('free')
    expect(r('mcp__engine__now', {})).toBe('free')
    expect(r('Bash', { command: 'git status --short' })).toBe('free')
    expect(r('Bash', { command: 'git log --oneline | head -5' })).toBe('free')
    expect(r('Bash', { command: 'curl -s localhost:4000/api/health' })).toBe('free')
  })
  it('edits are cheap on a branch, moderate on main, expensive outside the checkout', () => {
    expect(r('Edit', { file_path: '/repo/src/a.ts' })).toBe('cheap')
    expect(r('Write', { file_path: '/repo/src/a.ts' }, onMain)).toBe('moderate')
    expect(r('Write', { file_path: '/etc/hosts' })).toBe('expensive')
    expect(r('Edit', { file_path: '../other/a.ts' })).toBe('expensive')
  })
  it('tests and builds are cheap; commits, pushes and PRs are moderate', () => {
    expect(r('Bash', { command: 'pnpm test' })).toBe('cheap')
    expect(r('Bash', { command: 'pnpm -s typecheck && pnpm build' })).toBe('cheap')
    expect(r('Bash', { command: 'git add -A && git commit -m x' })).toBe('moderate')
    expect(r('Bash', { command: 'git push -u origin fix/thing' })).toBe('moderate')
    expect(r('Bash', { command: 'gh pr create --title x' })).toBe('moderate')
    expect(r('Bash', { command: 'echo hi > notes.txt' })).toBe('moderate')
  })
  it('main, force, deletes, merges, publishing and remote writes are expensive', () => {
    expect(r('Bash', { command: 'git push origin main' })).toBe('expensive')
    expect(r('Bash', { command: 'git push --force' })).toBe('expensive')
    expect(r('Bash', { command: 'git reset --hard HEAD~1' })).toBe('expensive')
    expect(r('Bash', { command: 'rm -rf node_modules' })).toBe('expensive')
    expect(r('Bash', { command: 'gh pr merge 12' })).toBe('expensive')
    expect(r('Bash', { command: 'curl -X POST https://api.example.com/x' })).toBe('expensive')
    expect(r('Bash', { command: 'curl -s -X POST localhost:4000/api/ideas' })).toBe('moderate')
  })
  it('engine actions carry the planner\'s costs', () => {
    expect(r('mcp__engine__create_idea', {})).toBe('cheap')
    expect(r('mcp__engine__plan_task', {})).toBe('moderate')
    expect(r('mcp__engine__start_project', {})).toBe('expensive')
    expect(r('mcp__engine__backlog_add', {})).toBe('cheap')
    expect(r('mcp__engine__todos', {})).toBe('free')
    expect(r('mcp__engine__check_item', {})).toBe('cheap')
    expect(r('mcp__engine__backlog_task', {})).toBe('moderate')
  })
  it('rates a compound command by its worst part; cd and echo are plumbing', () => {
    expect(r('Bash', { command: 'cd engine && pnpm -s typecheck; echo $?' })).toBe('cheap')
    expect(r('Bash', { command: 'cd engine && pnpm test && git commit -am ok' })).toBe('moderate')
    expect(r('Bash', { command: 'cd x && rm -rf y' })).toBe('expensive')
    expect(r('Bash', { command: 'git status && git log --oneline -3' })).toBe('free')
    expect(r('Bash', { command: 'pnpm test 2>&1 | tail -20' })).toBe('cheap')
    expect(r('Bash', { command: 'pnpm test > out.txt' })).toBe('moderate')
  })
  it('unknown commands and tools do not pass silently', () => {
    expect(r('Bash', { command: 'mystery --do-things' })).toBe('moderate')
    expect(r('Task', {})).toBe('expensive')
  })
})
