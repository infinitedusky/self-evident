/**
 * The executor: one Claude Code run on one sub-issue, in its worktree, through the Agent SDK. Every message becomes an
 * event (trimmed: no file contents); the builder's own todo list becomes the sub-issue's steps. The agent never writes
 * status; it works, commits, and summarises.
 * Development runs on the operator's own Claude Code login; a product deployment sets ANTHROPIC_API_KEY.
 */
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { builderGuard, guardOptions } from './guard.js'

export interface RunInput {
  subIssue: { id: string; identifier: string; title: string; brief: string | null }
  issue: { identifier: string; title: string; brief: string | null }
  worktreePath: string
  branch: string
  files: string[]
  testCmd?: string
  storybook?: boolean // the app keeps a Storybook: stories lead its UI
  previousFailure?: string
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  resumeSessionId?: string // continue an interrupted run's conversation in the same worktree
  abort?: AbortController
  onEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
}

export interface RunOutput {
  status: 'completed' | 'failed'
  agentSessionId?: string
  costUsd?: number
  numTurns?: number
  summary?: string
  error?: string
}

export type Execute = (i: RunInput) => Promise<RunOutput>

const clip = (s: unknown, n = 400) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? t.slice(0, n) + '…' : t }

function prompt(i: RunInput): string {
  const files = i.files.length ? i.files.map((f) => `  - ${f}`).join('\n') : '  (none declared: keep the change as small as the sub-issue allows)'
  return [
    `You are building ${i.subIssue.identifier}: ${i.subIssue.title}`,
    `It is a sub-issue of ${i.issue.identifier}: ${i.issue.title}`,
    '',
    i.subIssue.brief ?? '',
    i.issue.brief ? `\nThe issue's brief, for context:\n${i.issue.brief}` : '',
    '',
    'How to work:',
    `- Work only inside this directory. It is a git worktree on branch ${i.branch}. Do not change branches, do not push, do not open pull requests.`,
    '- These paths are yours to change:', files,
    '  Touch other files only if the sub-issue cannot be done without it, and say so in your summary.',
    i.storybook ? '- Stories lead the UI: this app keeps a Storybook. Every new or changed page, component and state gets its story first, with made-up sample data labelled as such, and the screen is built to match it. A screen without a story is not done.' : '',
    '- Keep your todo list current as you work; it is shown live to the people watching this sub-issue.',
    i.testCmd ? `- Run the tests with: ${i.testCmd}\n  They must pass before you finish. Add or adjust tests for what you change.` : '- There is no test command configured; verify your change by running it.',
    '- Commit your work with a clear message when it is done (git add -A && git commit). Leave nothing uncommitted.',
    '- Finish with a short summary for the reviewer: what changed, why, how you verified it, and anything you were unsure of.',
    '- If you noticed something this sub-issue should not do but someone should (a bug nearby, a follow-up, a missing test elsewhere), end the summary with a line `Later:` and one `- ` line for each. They go on the project\'s backlog so nothing is forgotten. Leave it out if there is nothing.',
    i.previousFailure ? `\nYour previous attempt did not land. The reason:\n${i.previousFailure}\nFix that first.` : '',
    i.resumeSessionId ? '\nThe engine restarted while you were working; your earlier conversation is resumed. Check the worktree state (git status, git log) before continuing.' : '',
  ].join('\n')
}

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite']
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit']

export async function runTask(i: RunInput): Promise<RunOutput> {
  let out: RunOutput = { status: 'failed', error: 'no result message' }
  try {
    for await (const m of query({
      prompt: prompt(i),
      options: {
        cwd: i.worktreePath,
        resume: i.resumeSessionId,
        abortController: i.abort,
        model: i.model,
        maxTurns: i.maxTurns ?? 60,
        maxBudgetUsd: i.maxBudgetUsd,
        settingSources: ['project'], // the repo's CLAUDE.md, not the operator's personal settings
        tools: [...READ_TOOLS, ...EDIT_TOOLS, 'Bash'], // the whole tool set
        allowedTools: READ_TOOLS, // auto-approved; the guard decides the rest (see guard.ts for why both hook and callback)
        permissionMode: 'default',
        ...guardOptions(builderGuard(i.worktreePath, READ_TOOLS, EDIT_TOOLS)),
      },
    })) {
      await handle(m, i.onEvent, (o) => { out = o })
    }
  } catch (err: any) {
    await i.onEvent('run.error', { error: clip(err?.message ?? String(err)) })
    return { ...out, status: 'failed', error: clip(err?.message ?? String(err), 1000) }
  }
  return out
}

/** One SDK message → events (and, for the result, the run's outcome). Shared with the planner. */
export async function handle(m: SDKMessage, emit: RunInput['onEvent'], setOut: (o: RunOutput) => void) {
  const a = m as any
  switch (m.type) {
    case 'system':
      if (a.subtype === 'init') await emit('run.started', { model: a.model, agentSessionId: a.session_id, apiKeySource: a.apiKeySource })
      return
    case 'assistant':
      for (const block of a.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) await emit('run.message', { text: clip(block.text, 2000) })
        else if (block.type === 'tool_use' && block.name === 'TodoWrite') {
          const todos = Array.isArray(block.input?.todos) ? block.input.todos : []
          await emit('run.steps', { steps: todos.map((t: any) => ({ text: String(t.content ?? t.activeForm ?? ''), status: t.status ?? 'pending' })) })
        }
        else if (block.type === 'tool_use') await emit('run.tool_call', { tool: block.name, input: summariseInput(block.name, block.input) })
      }
      return
    case 'user':
      for (const block of a.message?.content ?? []) {
        if (block?.type === 'tool_result') {
          const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('\n') : String(block.content ?? '')
          await emit('run.tool_result', { ok: !block.is_error, preview: clip(text, 300) })
        }
      }
      return
    case 'result':
      setOut({
        status: a.subtype === 'success' ? 'completed' : 'failed',
        agentSessionId: a.session_id, costUsd: a.total_cost_usd, numTurns: a.num_turns,
        summary: typeof a.result === 'string' ? a.result : undefined,
        error: a.subtype === 'success' ? undefined : `${a.subtype}: ${clip(a.result ?? a.errors ?? '', 800)}`,
      })
      await emit('run.result', { subtype: a.subtype, costUsd: a.total_cost_usd, turns: a.num_turns, durationMs: a.duration_ms })
      return
    default:
      if ((m as any).type === 'rate_limit_event') await emit('run.rate_limit', { status: a.rate_limit_info?.status })
  }
}

function summariseInput(tool: string, input: any): Record<string, unknown> {
  switch (tool) {
    case 'Bash': return { command: clip(input?.command, 300) }
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': return { file: input?.file_path }
    case 'Glob': case 'Grep': return { pattern: input?.pattern, path: input?.path }
    default: return { keys: Object.keys(input ?? {}) }
  }
}
