/**
 * The executor: one Claude Code run on one sub-issue, in its worktree, through the Agent SDK. Every message becomes an
 * event (trimmed: no file contents); the builder's own todo list becomes the sub-issue's steps. The agent never writes
 * status; it works, commits, and summarises.
 * Development runs on the operator's own Claude Code login; a product deployment sets ANTHROPIC_API_KEY.
 */
import { accountEnv } from './account.js'
import { agentFor, type Agent, type AppRef, type ModelJob } from './models.js'
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { builderGuard, guardOptions, STOP_ONLY_YOURS } from './guard.js'
import { StepTracker } from './step-track.js'
import { referencePrompt, type Reference } from './references.js'
import { LEAVE_LONG_RUNS } from './verify.js'
import { hookEnv } from './conventions.js'
import { limitOf } from './reply-cost.js'

export interface RunInput {
  subIssue: { id: string; identifier: string; title: string; brief: string | null }
  issue: { identifier: string; title: string; brief: string | null }
  /** Where the task came from, word for word (origins.ts, `originPrompt`): the ticket, not the brief's account of it. */
  origin?: string
  /** The ticket this work is named by outside Evident: the team's, else our task id; never the sub-task's (conventions.ts). */
  ticket?: string
  /** The repository's format for a commit's first line, when the app has one. */
  commitFormat?: string
  /** A hooks folder for this agent's git: its commits are held to the app's pattern as they are made. */
  hooksPath?: string
  /** A check or a probe: it reads and runs, and has no tool that edits. */
  readOnly?: boolean
  /** For a builder: what its work is held to once it is built (probes.ts, `builderHeld`). */
  heldTo?: string
  /** The skills this run must use, with what its session needs to have them: the app's skills for the build (Settings › Skills, Build › Do), or the one a probe runs as a reviewer. It gets these and no other. */
  skills?: { names: string[]; plugins?: unknown[]; mcpServers?: Record<string, unknown> }
  worktreePath: string
  branch: string
  files: string[]
  testCmd?: string
  storybook?: boolean // the app keeps a Storybook: stories lead its UI
  references?: Reference[] // other apps' checkouts to read, never change (references.ts)
  previousFailure?: string
  model?: string
  /** The app's settings, for the Claude account its agents run on (account.ts). */
  setup?: unknown
  /** The app and the kind of job this is: the model and the account or proxy come from them (models.ts), over `model` and `setup`. */
  on?: { app: AppRef; job: ModelJob }
  maxTurns?: number
  maxBudgetUsd?: number
  resumeSessionId?: string // continue an interrupted run's conversation in the same worktree
  /** Why it is resumed: it ran out of turns (runner.ts, carryOn), or the engine restarted or was paused under it. */
  resumeWhy?: 'turns'
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
  const files = i.files.length ? i.files.map((f) => `  - ${f}`).join('\n') : '  (none declared: keep the change as small as the sub-task allows)'
  return [
    `You are building ${i.subIssue.identifier}: ${i.subIssue.title}`,
    `It is a sub-task of ${i.issue.identifier}: ${i.issue.title}`,
    '',
    i.subIssue.brief ?? '',
    i.issue.brief ? `\nThe task's brief, for context:\n${i.issue.brief}` : '',
    i.origin ?? '',
    '',
    'How to work:',
    `- Work only inside this directory. It is a git worktree on branch ${i.branch}. Do not change branches, do not push, do not open pull requests.`,
    '- These paths are yours to change:', files,
    '  Touch other files only if the sub-task cannot be done without it, and say so in your summary.',
    i.storybook ? '- Stories lead the UI: this app keeps a Storybook. Every new or changed page, component and state gets its story first, with made-up sample data labelled as such, and the screen is built to match it. A screen without a story is not done.' : '',
    '- Before you change anything, list the steps you will take with your task tool (TaskCreate, or TodoWrite if that is the one you have), one for each step of this sub-task. Mark each in progress when you begin it and completed when it is done. The people watching this sub-task see that list live, and nothing else tells them where you are.',
    `- ${STOP_ONLY_YOURS}`,
    i.testCmd ? `- Test what you built: add or adjust tests for what you change, and run the tests of the parts you touched. They must pass before you finish. Do not run the whole suite unless your brief says to: it runs once, when every sub-task of this task is merged. For reference, the whole suite is: ${i.testCmd}` : '- There is no test command configured; verify your change by running it.',
    `- ${LEAVE_LONG_RUNS}`,
    !i.readOnly && i.skills?.names.length ? `- This app has ${i.skills.names.length > 1 ? 'skills' : 'a skill'} for building: ${i.skills.names.map((n) => `\`${n}\``).join(', ')}. Invoke ${i.skills.names.length > 1 ? 'each' : 'it'} with the Skill tool before you change anything, and follow ${i.skills.names.length > 1 ? 'them' : 'it'}: it is this app's own way of working, and wins over the general way where they differ.` : '',
    !i.readOnly && i.heldTo ? `\n${i.heldTo}\n` : '',
    i.readOnly ? '- You change nothing: you have no tool that edits, and anything you leave in this directory is thrown away. Commit nothing.' : commitLine(i),
    '- Finish with a short summary for the reviewer: what changed, why, how you verified it, and anything you were unsure of.',
    '- The brief is settled: build what it says, the way it says. Do not propose follow-ups, improvements or things to consider; nothing collects them. A small slip inside the files that are yours (a stray file, a typo) is simply fixed. If the sub-task cannot be built as written, stop and say exactly what is wrong and where, in your summary.',
    referencePrompt(i.references ?? []),
    i.previousFailure ? `\nYour previous attempt did not land. The reason:\n${i.previousFailure}\nFix that first.` : '',
    i.resumeSessionId ? (i.resumeWhy === 'turns'
      ? '\nYou ran out of turns in the middle of this, and your conversation is resumed with more. Nothing is lost: what you changed is in the worktree, and what you worked out is above. Carry on from where you were: look at git status and your list of steps, and do not start again.'
      : '\nThe engine restarted while you were working; your earlier conversation is resumed. Check the worktree state (git status, git log) before continuing.') : '',
  ].join('\n')
}

/** How to commit: in the repository's format when the app has one, and always by the task's ticket, never the sub-task's number. */
export function commitLine(i: Pick<RunInput, 'ticket' | 'commitFormat' | 'hooksPath' | 'subIssue' | 'issue'>): string {
  const ticket = i.ticket ?? i.issue.identifier
  const ours = ticket === i.subIssue.identifier ? '' : ` ${i.subIssue.identifier} is a number of ours for this sub-task and means nothing outside: never put it in a commit, a branch or a file.`
  return i.commitFormat
    ? `- Commit your work when it is done (git add -A && git commit), every commit's first line in this repository's format: \`${i.commitFormat}\`. The ticket is ${ticket}.${ours}${i.hooksPath ? ' A commit whose first line does not fit is refused: reword it and commit again.' : ''} Leave nothing uncommitted.`
    : `- Commit your work with a clear message when it is done (git add -A && git commit), in the way this repository's own commits are written (git log shows it; CLAUDE.md or AGENTS.md may say). Where a commit names a ticket, it is ${ticket}.${ours} Leave nothing uncommitted.`
}

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'] // its own list of steps is kept with whichever task tool it has (step-track.ts)
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit']

export async function runTask(i: RunInput): Promise<RunOutput> {
  let out: RunOutput = { status: 'failed', error: 'no result message' }
  const steps = new StepTracker() // where this builder is, from its own list
  const used = new Set<string>()
  const has = (set: Set<string>, name: string) => set.has(name) || set.has(name.split(':').pop()!) // a session may call a plugin's skill by its short name
  try {
    const account: Agent = i.on ? await agentFor(i.on.app, i.on.job) : { model: i.model, ...accountEnv(i.setup) }
    for await (const m of query({
      prompt: prompt(i),
      options: {
        cwd: i.worktreePath,
        ...(i.hooksPath ? { env: hookEnv(i.hooksPath, account.env ?? process.env) } : account.env ? { env: account.env } : {}),
        ...(i.references?.length ? { additionalDirectories: i.references.map((r) => r.path) } : {}), // readable; the guard keeps edits inside the worktree
        resume: i.resumeSessionId,
        abortController: i.abort,
        model: account.model,
        maxTurns: i.maxTurns ?? 60,
        maxBudgetUsd: i.maxBudgetUsd,
        settingSources: ['project'], // the repo's CLAUDE.md, not the operator's personal settings
        tools: [...READ_TOOLS, ...(i.readOnly ? [] : EDIT_TOOLS), 'Bash', ...(i.skills ? ['Skill'] : [])], // the whole tool set
        ...(i.skills ? { skills: i.skills.names, plugins: i.skills.plugins as never, mcpServers: i.skills.mcpServers as never } : {}), // those skills, and no other
        allowedTools: i.skills ? [...READ_TOOLS, 'Skill'] : READ_TOOLS, // auto-approved; the guard decides the rest (see guard.ts for why both hook and callback)
        permissionMode: 'default',
        ...guardOptions(builderGuard(i.worktreePath, i.skills ? [...READ_TOOLS, 'Skill'] : READ_TOOLS, i.readOnly ? [] : EDIT_TOOLS)),
      },
    })) {
      await handle(m, async (type, payload) => { if (type === 'run.tool_call' && payload.tool === 'Skill') used.add(String((payload.input as { skill?: unknown } | undefined)?.skill ?? '')); await i.onEvent(type, payload) }, (o) => { out = o }, steps)
    }
    // The run's record of the skills it was given: which it used, and which it did not.
    if (i.skills?.names.length) await i.onEvent('run.skills', { attached: i.skills.names, used: i.skills.names.filter((n) => has(used, n)), unused: i.skills.names.filter((n) => !has(used, n)) })
  } catch (err: any) {
    await i.onEvent('run.error', { error: clip(err?.message ?? String(err)) })
    return { ...out, status: 'failed', error: clip(err?.message ?? String(err), 1000) }
  }
  return out
}

/** One SDK message → events (and, for the result, the run's outcome). Shared with the planner. */
export async function handle(m: SDKMessage, emit: RunInput['onEvent'], setOut: (o: RunOutput) => void, steps?: StepTracker) {
  const a = m as any
  switch (m.type) {
    case 'system':
      if (a.subtype === 'init') await emit('run.started', { model: a.model, agentSessionId: a.session_id, apiKeySource: a.apiKeySource })
      return
    case 'assistant':
      for (const block of a.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) await emit('run.message', { text: clip(block.text, 2000) })
        else if (block.type === 'tool_use' && ['TodoWrite', 'TaskCreate', 'TaskUpdate'].includes(block.name)) {
          const list = (steps ?? new StepTracker()).use(block) // the builder's own list of steps, whichever task tool it keeps it with
          if (list) await emit('run.steps', { steps: list })
        }
        else if (block.type === 'tool_use') await emit('run.tool_call', { tool: block.name, input: summariseInput(block.name, block.input) })
      }
      return
    case 'user':
      for (const block of a.message?.content ?? []) {
        if (block?.type === 'tool_result') {
          const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('\n') : String(block.content ?? '')
          steps?.result(block.tool_use_id, text) // a step just made learns its id
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
      if ((m as any).type === 'rate_limit_event') { const got = limitOf(a.rate_limit_info); await emit('run.rate_limit', { status: a.rate_limit_info?.status, ...(got ? { limit: got[0], ...got[1] } : {}) }) } // which limit, how much of it is used and when it resets (reply-cost.ts)
  }
}

function summariseInput(tool: string, input: any): Record<string, unknown> {
  switch (tool) {
    case 'Bash': return { command: clip(input?.command, 300) }
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': return { file: input?.file_path }
    case 'Skill': return { skill: input?.skill } // which one: the run's record that it was used
    case 'Glob': case 'Grep': return { pattern: input?.pattern, path: input?.path }
    default: return { keys: Object.keys(input ?? {}) }
  }
}
