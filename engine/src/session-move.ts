/**
 * A conversation follows its app to another Claude login (Sandy, 2026-11-25: "I changed the user claude and lost the
 * conversation. We should have some way to migrate").
 *
 * Claude Code keeps a session under the config folder of the login it ran on (terminal.ts). When an app's account
 * changes (account.ts), `--resume` looks under the new folder, finds nothing and says "No conversation found". The
 * session is still under the folder it was written in, so before a conversation is resumed its session is copied to
 * the folder it is about to run on: the `.jsonl` and, beside it, the folder of the same name (tool results, sub-agents).
 *
 * Copied, never moved: the login it came from keeps its own. Where more than one folder has the session, the one
 * written to last is the conversation, so going back to an earlier login brings what was said since.
 */
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { configDirOf } from './account.js'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { sessionFile } from './terminal.js'

/**
 * The same, for an app: its session is looked for under the engine's own login, `~/.claude`, and every login any app
 * here runs on (a login an app used to run on and no app names now is not known, unless it is one of the first two).
 */
export async function bringSessionFor(cwd: string, sessionId: string, setup: unknown): Promise<{ from: string } | null> {
  const apps = await db.select({ setup: app.setup }).from(app)
  return bringSession(cwd, sessionId, configDirOf(setup), [undefined, join(homedir(), '.claude'), ...apps.map((x) => configDirOf(x.setup))])
}

/** The config folder a login is kept in: an app's own, else the engine's. */
export const loginFolder = (home?: string) => resolve(home ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'))

/**
 * Make sure the session is where `to` (the folder it is about to run on) will find it, bringing it from one of
 * `others` when it is missing or older there. Says where it came from, or null when nothing needed copying.
 */
export function bringSession(cwd: string, sessionId: string, to: string | undefined, others: (string | undefined)[]): { from: string } | null {
  const target = loginFolder(to)
  const written = (folder: string) => { const f = sessionFile(cwd, sessionId, folder); return existsSync(f) ? statSync(f).mtimeMs : 0 }
  const here = written(target)
  let from: string | null = null
  let newest = here
  for (const folder of new Set(others.map(loginFolder))) {
    if (folder === target) continue
    const at = written(folder)
    if (at > newest) { newest = at; from = folder }
  }
  if (!from) return null
  const file = sessionFile(cwd, sessionId, from)
  const dest = sessionFile(cwd, sessionId, target)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(file, dest, { preserveTimestamps: true })
  const beside = file.replace(/\.jsonl$/, '')
  if (existsSync(beside)) cpSync(beside, dest.replace(/\.jsonl$/, ''), { recursive: true, preserveTimestamps: true })
  return { from }
}
