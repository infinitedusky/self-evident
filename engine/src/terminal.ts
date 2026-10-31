/**
 * One conversation, in the UI or the terminal (Sandy, 2026-10-31: "share sessions … so I can talk to the same agent
 * here and in the UI"). The UI's agent is a Claude Code session (the Agent SDK), kept where Claude Code keeps every
 * session: `~/.claude/projects/<cwd, non-alphanumerics as '-'>/<session id>.jsonl`. `claude --resume <id>` in that
 * folder continues the same session, in the same file. So the file is the conversation; this module reads it.
 *
 * Which process wrote a turn can't be told from the file (its markers depend on how each process was started), so the
 * engine copies turns in only while the conversation is handed to the terminal, from the line it was handed over at.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const projectsDir = () => join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
export const sessionDir = (cwd: string) => join(projectsDir(), cwd.replace(/[^A-Za-z0-9]/g, '-'))
export const sessionFile = (cwd: string, sessionId: string) => join(sessionDir(cwd), `${sessionId}.jsonl`)

/** The session most recently written in a folder: the one a terminal or editor there is using now. */
export function latestSession(cwd: string): string | null {
  const dir = sessionDir(cwd)
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  files.sort((a, b) => b.t - a.t)
  return files[0]?.f.replace(/\.jsonl$/, '') ?? null
}

export interface Turn {
  uuid: string; at: string
  author: 'user' | 'agent' | 'tool'
  kind: 'text' | 'tool_call' | 'tool_result'
  body: string
  payload?: Record<string, unknown>
}

interface Entry {
  type?: string; uuid?: string; timestamp?: string; isSidechain?: boolean; isMeta?: boolean; promptSource?: string
  message?: { role?: string; content?: string | Block[] }
}
interface Block { type: string; text?: string; name?: string; id?: string; input?: unknown; tool_use_id?: string; content?: string | { type: string; text?: string }[]; is_error?: boolean }

const lines = (file: string): Entry[] => readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as Entry] } catch { return [] } })
/** Claude Code's own wrappers (reminders, slash-command echoes) are not something a person said. */
const machine = (t: string) => /^\s*<(system-reminder|command-|local-command|bash-|user-prompt-submit-hook)/.test(t)

/** The id of the file's last line: where a hand-off starts copying from. */
export function lastUuid(file: string): string | null {
  if (!existsSync(file)) return null
  const all = lines(file)
  for (let i = all.length - 1; i >= 0; i--) if (all[i].uuid) return all[i].uuid!
  return null
}

/** The conversation's title, as Claude Code named it. */
export function sessionTitle(file: string): string | null {
  if (!existsSync(file)) return null
  let title: string | null = null
  for (const e of lines(file)) if (e.type === 'ai-title' && typeof (e as { title?: unknown }).title === 'string') title = (e as { title: string }).title
  return title
}

/**
 * What was said and done after `after` (a line's uuid; null for everything): a person's words, the agent's words, its
 * tool calls and their results. Subagents' turns and Claude Code's own wrappers are left out.
 */
export function readTurns(file: string, after: string | null): Turn[] {
  if (!existsSync(file)) return []
  const all = lines(file)
  const from = after ? all.findIndex((e) => e.uuid === after) + 1 : 0
  const out: Turn[] = []
  for (const e of all.slice(from)) {
    if ((e.type !== 'user' && e.type !== 'assistant') || e.isSidechain || e.isMeta || e.promptSource === 'system' || !e.uuid || !e.message) continue
    const base = { uuid: e.uuid, at: e.timestamp ?? new Date().toISOString() }
    const content = e.message.content
    if (typeof content === 'string') { if (e.type === 'user' && content.trim() && !machine(content)) out.push({ ...base, author: 'user', kind: 'text', body: content.trim() }); continue }
    for (const b of content ?? []) {
      if (b.type === 'text' && b.text?.trim() && !machine(b.text)) out.push({ ...base, author: e.type === 'user' ? 'user' : 'agent', kind: 'text', body: b.text.trim() })
      else if (b.type === 'tool_use' && b.name) out.push({ ...base, author: 'tool', kind: 'tool_call', body: b.name, payload: { tool: b.name, input: b.input, toolUseId: b.id } })
      else if (b.type === 'tool_result') {
        const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((c) => c.text ?? '').join('\n')
        out.push({ ...base, author: 'tool', kind: 'tool_result', body: text.slice(0, 1500), payload: { ok: !b.is_error, toolUseId: b.tool_use_id } })
      }
    }
  }
  return out
}
