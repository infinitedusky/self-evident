/**
 * The guard: what an agent run may do, decided by the engine and not by whatever settings the session loads.
 * Applied twice: as a PreToolUse hook, which the SDK consults for every tool call before any allow rule (from a
 * settings file or from allowedTools) can auto-approve it, and as canUseTool, the fallback for calls nothing
 * auto-approved. Found the hard way: a bare name in allowedTools never reaches canUseTool, and a settings allow
 * rule (an operator's own `Bash(git push:*)`) shadows it too. The hook sees everything.
 */
import type { CanUseTool, HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk'
import { resolve, sep } from 'node:path'

export type Verdict = { allow: true } | { allow: false; reason: string }
export type Guard = (tool: string, input: Record<string, unknown>) => Verdict

export function guardOptions(guard: Guard): { hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>; canUseTool: CanUseTool } {
  return {
    hooks: {
      PreToolUse: [{ hooks: [async (input) => {
        if (input.hook_event_name !== 'PreToolUse') return { continue: true }
        const v = guard(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>)
        // An allow here means "not refused": the usual flow (allowedTools, then canUseTool) still decides.
        return v.allow ? { continue: true } : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: v.reason } }
      }] }],
    },
    canUseTool: async (tool, input) => {
      const v = guard(tool, input)
      return v.allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: v.reason }
    },
  }
}

const DENIED_BASH = /\b(git\s+(push|checkout|switch|rebase|reset\s+--hard|worktree)|gh\s+pr)\b/
export const READ_ONLY_BASH = /^\s*(git\s+(log|ls-files|show|blame|status|diff)|ls|cat|head|tail|wc|find|tree)\b[^|;&>`$]*$/

/**
 * Stopping processes by name or by port, which no agent may do: other things run on this computer, the engine that is
 * running the agent among them. Found the hard way (2026-11-14, BON-71): a builder tidying up its own dev servers ran
 * `pkill -f "pnpm dev"; pkill -f "vite"`, which matched Self Evident's own processes. The engine restarted, the
 * build was interrupted and started again, and four minutes later it did the same, three times over.
 * Stopping what it started, by the pid it kept, is fine: `kill 4321`, `kill $!`, `kill %1`, `kill $(cat x.pid)`.
 */
const BY_NAME = /(?:^|[;&|(`\n]|\bsudo\s|\bnpx\s|\bxargs\s)\s*(?:pkill|killall|fkill|kill-port)\b/ // as a command, not as a word inside a message or a search
const SUBSTITUTED = /\bkill\b[^;&|\n]*(\$\(|`)[^)`]*\b(pgrep|lsof|ps|pidof|fuser|netstat|ss)\b/ // kill $(lsof -ti:5173), kill `pgrep vite`
const PIPED = /\b(pgrep|lsof|ps|pidof|fuser)\b[^;&\n]*\|[^;&\n]*\bkill\b/ // lsof -ti:5173 | xargs kill
export const STOP_ONLY_YOURS = 'Do not stop processes by name or by port (pkill, killall, or kill fed from pgrep, lsof or ps): other things run on this computer and match the same names and ports, the engine running you among them. Stop only what you started, by its pid: start it with `your-command & echo $! > /tmp/yours.pid` and stop it with `kill $(cat /tmp/yours.pid)`. Use a port of your own choosing above 6200 so you never meet one that is taken; if a port is taken, pick another, do not free it.'
/** Whether a shell command stops processes it cannot know are its own. */
export const stopsOthers = (command: string) => BY_NAME.test(command) || SUBSTITUTED.test(command) || PIPED.test(command)

/** A builder in its worktree: reads, edits inside the worktree only, shell without branch/push/PR commands. */
export function builderGuard(worktreePath: string, readTools: string[], editTools: string[]): Guard {
  const root = resolve(worktreePath) + sep
  const inside = (p: unknown) => typeof p === 'string' && (resolve(worktreePath, p) + sep).startsWith(root)
  return (tool, input) => {
    if (readTools.includes(tool)) return { allow: true }
    if (editTools.includes(tool)) return inside(input.file_path) ? { allow: true } : { allow: false, reason: `Only files inside ${worktreePath} may be changed.` }
    if (tool === 'Bash' && stopsOthers(String(input.command ?? ''))) return { allow: false, reason: STOP_ONLY_YOURS }
    if (tool === 'Bash') return DENIED_BASH.test(String(input.command ?? '')) ? { allow: false, reason: 'The engine handles branches, pushes and pull requests.' } : { allow: true }
    return { allow: false, reason: `${tool} is not available in a phase run.` }
  }
}

/** A planner: reads, and runs only shell commands that read. `reads` admits other tools that only read (REA's free ones). */
export function readerGuard(readTools: string[], reads: (tool: string) => boolean = () => false): Guard {
  return (tool, input) => {
    if (readTools.includes(tool) || reads(tool)) return { allow: true }
    if (tool === 'StructuredOutput') return { allow: true } // how the SDK hands in the planner's answer (outputFormat); it changes nothing
    if (tool === 'Bash' && READ_ONLY_BASH.test(String(input.command ?? ''))) return { allow: true }
    return { allow: false, reason: 'The planner reads; it changes nothing. Use Read, Glob, Grep, or a read-only git, ls, cat, head, tail, wc, find or tree command.' }
  }
}
