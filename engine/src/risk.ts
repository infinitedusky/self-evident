/**
 * Risk: what a tool call could cost if it is wrong, judged by the engine, never by the agent. The planner's rule
 * for questions (cheap / moderate / expensive, set by the server) applied to the agent's hands. A conversation
 * auto-approves up to a threshold and asks above it; expensive always asks.
 *
 *   free      reading, searching, the engine's read-only tools
 *   cheap     easy to undo: edits on a branch, tests, builds, keeping an idea
 *   moderate  leaves a mark: commits, branches, pushes, PRs, edits in a checkout that is on main, spending money
 *   expensive hard to undo or outward-facing: main, force, deletes, merges, publishing, anything outside the checkout
 */
import { resolve, sep } from 'node:path'
import { reaRisk } from './skills.js'

export type Risk = 'free' | 'cheap' | 'moderate' | 'expensive'
export const RISKS: Risk[] = ['free', 'cheap', 'moderate', 'expensive']
export const rank = (r: Risk) => RISKS.indexOf(r)

export interface RiskContext { cwd: string; branch?: string | null } // branch: what the checkout at cwd has checked out

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'WebFetch', 'WebSearch', 'Skill']) // Skill loads instructions; what they lead to is rated on its own
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const ENGINE_FREE = new Set(['now', 'projects', 'project_graph', 'issue', 'issues', 'ideas', 'events', 'todos', 'initiatives', 'cycles'])
const ENGINE: Record<string, [Risk, string]> = {
  create_idea: ['cheap', 'keeps an idea; easy to drop'],
  create_project: ['cheap', 'a draft project; nothing runs'],
  create_issue: ['cheap', 'an issue; easy to cancel'],
  update_issue: ['cheap', 'edits an issue; easy to change back'],
  set_issue_state: ['cheap', 'moves an issue; moving it back undoes it'],
  reorder_issues: ['cheap', 'changes the order; reorder undoes it'],
  plan_issue: ['moderate', 'runs the planner: minutes and money'],
  answer_question: ['moderate', "answers a question on the person's behalf"],
  cancel_project: ['moderate', 'stops running agents'],
  retry_build: ['moderate', 'runs an agent again: minutes and money'],
  pause_project: ['cheap', 'stops agents, keeps their place; resume undoes it'],
  resume_project: ['moderate', 'runs agents again: minutes and money'],
  backlog_add: ['cheap', 'an issue in a project\'s backlog; easy to drop'],
  backlog_duplicate: ['cheap', 'marks a backlog issue covered by another; reopen undoes it'],
  backlog_drop: ['cheap', 'cancels a backlog issue with a reason; reopen undoes it'],
  backlog_take: ['moderate', 'takes a backlog issue on; in a running project the planner runs on it'],
  create_todo: ['cheap', 'a to-do with a checklist; easy to drop'],
  update_todo: ['cheap', 'edits a to-do; easy to change back'],
  check_item: ['cheap', 'checks a line off; uncheck undoes it'],
  finish_todo: ['cheap', 'closes a to-do; reopen undoes it'],
  backlog_todo: ['cheap', 'makes a backlog issue a to-do; easy to change back'],
  create_initiative: ['cheap', 'states a goal; easy to change'],
  update_initiative: ['cheap', 'edits a goal; easy to change back'],
  create_cycle: ['cheap', 'a stretch of time with its issues; easy to change'],
  sync_github: ['cheap', 'reads GitHub; merges main into open project branches, conflicts only reported'],
  start_project: ['expensive', 'runs agents, spends money, opens a pull request'],
}

const RO = /^\s*(git\s+(status|log|diff|show|blame|ls-files|rev-parse|branch(\s+(-a|-r|--list|-v+))?|remote\s+-v|worktree\s+list|stash\s+list)|ls|cat|head|tail|wc|grep|rg|find|tree|pwd|echo|which|env|printenv|node\s+-v|pnpm\s+-v|npm\s+-v|python3?\s+--version|uname|date|whoami|du|df|stat|file|jq|sed\s+-n|awk|sort|uniq|cut|tr|diff|curl\s+-s\S*\s+(https?:\/\/)?(localhost|127\.0\.0\.1))\b/
const BUILD = /^\s*(pnpm|npm|yarn|npx|bun)\s+(test|run\s+test|typecheck|run\s+typecheck|build|run\s+build|lint|run\s+lint|exec\s+(tsc|vitest|eslint|oxlint|prettier)|-s\s+(test|typecheck|build|lint)|-r\s+(test|typecheck|build))\b|^\s*(pytest|vitest|tsc|cargo\s+(test|check|build)|go\s+(test|build|vet)|make\s+(test|check|build))\b|^\s*pnpm\s+install\b/
const EXPENSIVE = /\b(git\s+push\s+.*(\bmain\b|\bmaster\b|--force|-f\b)|git\s+push\s+--force|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|git\s+branch\s+-D\s+(main|master)\b|git\s+rebase|rm\s+-rf?\s|rm\s+-fr?\s|gh\s+pr\s+merge|gh\s+repo\s+(delete|rename|edit|archive)|gh\s+release|pnpm\s+publish|npm\s+publish|docker\s+(rm|rmi|volume\s+rm|system\s+prune)|dropdb|DROP\s+(TABLE|DATABASE)|truncate|sudo\s|chmod\s+-R|chown\s+-R|kill\s+-9|pkill|mkfs|dd\s+if=|curl\s+.*-X\s*(POST|PUT|PATCH|DELETE)\s+(?!.*(localhost|127\.0\.0\.1))|ssh\s|scp\s)/i
const MODERATE = /\b(git\s+(add|commit|checkout|switch|branch|merge|cherry-pick|stash|worktree|push|fetch|pull|tag|mv|rm|restore)|gh\s+(pr|issue|api|repo\s+clone)|pnpm\s+(add|remove|up|update|link)|npm\s+(install|i|add|remove|uninstall|update)|docker\s|docker-compose|mkdir|mv\s|cp\s|touch|curl\s+.*-X\s*(POST|PUT|PATCH|DELETE)|psql|createdb|tsx\s|node\s|python3?\s|uvicorn|open\s)\b/

export function riskOf(tool: string, input: Record<string, unknown>, ctx: RiskContext): { risk: Risk; why: string } {
  if (READ_TOOLS.has(tool)) return { risk: 'free', why: 'reads' }
  if (tool.startsWith('mcp__engine__')) {
    const name = tool.slice('mcp__engine__'.length)
    if (ENGINE_FREE.has(name)) return { risk: 'free', why: 'reads the engine' }
    const e = ENGINE[name]
    return e ? { risk: e[0], why: e[1] } : { risk: 'moderate', why: 'an engine action' }
  }
  if (tool.startsWith('mcp__rea__')) return reaRisk(tool.slice('mcp__rea__'.length))
  if (EDIT_TOOLS.has(tool)) {
    const file = String(input.file_path ?? input.notebook_path ?? '')
    const root = resolve(ctx.cwd) + sep
    if (!file || !(resolve(ctx.cwd, file) + sep).startsWith(root)) return { risk: 'expensive', why: 'edits outside the checkout' }
    if (!ctx.branch || ctx.branch === 'main' || ctx.branch === 'master') return { risk: 'moderate', why: `edits a checkout that is on ${ctx.branch ?? 'an unknown branch'}; main is production` }
    return { risk: 'cheap', why: `edits on branch ${ctx.branch}` }
  }
  if (tool === 'Bash') return rateShell(String(input.command ?? ''))
  return { risk: 'expensive', why: `${tool} is not a tool this agent has` }
}

/**
 * A shell line is rated by its parts: split on && ; || and |, rate each, take the worst. `cd` and other readers
 * are free, so `cd engine && pnpm test` is cheap, and `cd x && rm -rf y` is expensive. A redirect that writes is
 * moderate unless it only discards.
 */
export function rateShell(cmd: string): { risk: Risk; why: string } {
  if (EXPENSIVE.test(cmd)) return { risk: 'expensive', why: 'hard to undo, or outward-facing' }
  const parts = cmd.replace(/2>&1/g, '').split(/\|\||&&|;|\|/).map((p) => p.trim()).filter(Boolean)
  let worst: { risk: Risk; why: string } = { risk: 'free', why: 'a read-only command' }
  for (const part of parts) {
    const r = ratePart(part)
    if (rank(r.risk) > rank(worst.risk)) worst = r
  }
  return worst
}

function ratePart(part: string): { risk: Risk; why: string } {
  if (/^(cd|pushd|popd|true|false|exit|set|export)\b/.test(part) || /^\s*\$\?\s*$/.test(part)) return { risk: 'free', why: 'shell plumbing' }
  if (/(^|[^2&])>(?!\s*\/dev\/null)/.test(part)) return { risk: 'moderate', why: 'writes a file through a redirect' }
  if (RO.test(part)) return { risk: 'free', why: 'a read-only command' }
  if (BUILD.test(part)) return { risk: 'cheap', why: 'tests, typecheck or build; changes nothing of record' }
  if (MODERATE.test(part)) return { risk: 'moderate', why: 'leaves a mark: commits, branches, pushes, installs or runs a process' }
  return { risk: 'moderate', why: `a command the engine does not recognise: ${part.slice(0, 40)}` }
}
