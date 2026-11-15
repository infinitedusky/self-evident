/**
 * Whether an agent's action runs, is put to the person, or is refused (Sandy, 2026-11-15: "we can't have this thing
 * stopping to ask us if I can do bash … that's a cheap yes or no … this is on a worktree … I got caught three times
 * now waiting for a really long time, not realizing something was stuck … if they're questions, stop").
 *
 * - Expensive (hard to undo, or outward-facing) is always put to the person.
 * - In a worktree, everything below expensive runs: the work is on a branch of its own and nothing of record is
 *   touched. Only a person who set the conversation to ask for everything is asked.
 * - A check's agent (the analysis, the ADR, the blast radius, the audit, the final step) is started by the engine
 *   and nobody is watching it: it is never left waiting on a yes for something below expensive. In a worktree it
 *   runs; in the app's own checkout a command that leaves a mark is refused, with the reason, so it carries on.
 * - A conversation about the app as a whole, in the app's own checkout, keeps its level, and a command that leaves a
 *   mark there is put to the person: someone is in that conversation.
 */
import type { Risk } from './risk.js'

const RANK: Record<Risk, number> = { free: 0, cheap: 1, moderate: 2, expensive: 3 }
export const inWorktree = (cwd: string) => /-worktrees\//.test(cwd)
export const NOT_IN_THE_CHECKOUT = 'You are in the app\'s own checkout, not a worktree, and nobody is here to allow this: read, and write your report with your tools. If you cannot do the step without it, say what you need and why in your report.'

export function gate(i: { risk: Risk; tool: string; /** The person allowed this tool for the conversation. */ always: boolean; /** The conversation's level. */ level: Risk; cwd: string; /** About the app as a whole, in its own checkout. */ whole: boolean; /** A check's agent: started by the engine, nobody watching. */ check: boolean }): 'allow' | 'ask' | 'deny' {
  if (i.risk === 'free' || i.always) return 'allow'
  if (i.risk === 'expensive') return 'ask'
  const marks = i.tool === 'Bash' && i.risk === 'moderate' // a command that leaves a mark
  if (i.check) return inWorktree(i.cwd) || !marks ? 'allow' : 'deny'
  if (inWorktree(i.cwd)) return i.level === 'free' ? 'ask' : 'allow'
  if (i.whole && marks) return 'ask'
  return RANK[i.risk] <= RANK[i.level] ? 'allow' : 'ask'
}
