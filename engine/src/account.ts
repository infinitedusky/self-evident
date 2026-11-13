/**
 * Which Claude account an app's agents run on (Sandy, 2026-11-13: "it uses the default or can override").
 *
 * The default is the engine's own: the Claude Code login on this machine, or ANTHROPIC_API_KEY when the engine's
 * environment has one. An app overrides it under Settings › Agents, one of two ways, kept in `setup.account`:
 *  - `key_env`: the NAME of an environment variable holding an API key. The key stays in the engine's environment,
 *    never in the database; that app's agents get it as ANTHROPIC_API_KEY.
 *  - `config_dir`: a Claude Code config folder with its own login (`CLAUDE_CONFIG_DIR=<folder> claude auth login`,
 *    once). That app's agents run on that login, and Claude Code keeps their sessions under that folder, so the
 *    terminal side of a conversation (terminal.ts) reads there too.
 * An override that can't be used (the variable unset, the folder missing) is an error said plainly, never a quiet
 * fall back to the default: the point of an override is that this app's code does not go through the other account.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { PlanError } from './issues.js'
import { claudeBinary } from './skills.js'

const execFileP = promisify(execFile)
type Env = Record<string, string | undefined>
export interface Account { key_env?: string; config_dir?: string }

/** Credentials the override replaces: left in, any of them would win over the one the app chose. */
const CREDENTIALS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']

/** What Settings saved, tidied: one way or the other, never both (a key wins), or nothing. */
export function cleanAccount(given: unknown): Account | undefined {
  const g = (given ?? {}) as Record<string, unknown>
  const key = typeof g.key_env === 'string' ? g.key_env.trim() : ''
  const dir = typeof g.config_dir === 'string' ? g.config_dir.trim() : ''
  if (key) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new PlanError(`"${key.slice(0, 40)}" isn't the name of an environment variable. Give the variable's name (say WORK_ANTHROPIC_KEY), never the key itself.`)
    return { key_env: key }
  }
  return dir ? { config_dir: dir } : undefined
}

export const accountOf = (setup: unknown): Account => ((setup ?? {}) as { account?: Account }).account ?? {}
const folder = (p: string) => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : resolve(p))

/** The config folder an app's login override names, absolute; undefined when it has none. */
export function configDirOf(setup: unknown): string | undefined {
  const a = accountOf(setup)
  return !a.key_env && a.config_dir ? folder(a.config_dir) : undefined
}
/** The same, by app id: where that app's Claude Code sessions are kept. */
export async function configDirFor(appId: string | null | undefined): Promise<string | undefined> {
  if (!appId) return undefined
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  return configDirOf(a?.setup)
}

/**
 * The SDK options that put an agent on the app's account: `{}` for the default (the engine's own environment), else
 * `{ env }` with the override in and every other credential out.
 */
export function accountEnv(setup: unknown, env: Env = process.env): { env?: Env } {
  const a = accountOf(setup)
  if (!a.key_env && !a.config_dir) return {}
  const rest = Object.fromEntries(Object.entries(env).filter(([k]) => !CREDENTIALS.includes(k)))
  if (a.key_env) {
    const key = env[a.key_env]
    if (!key) throw new PlanError(`This app's agents run on the API key in ${a.key_env}, and ${a.key_env} isn't set in the engine's environment. Export it where the engine starts and restart the engine, or change the account under Settings › Agents.`)
    return { env: { ...rest, ANTHROPIC_API_KEY: key } }
  }
  const dir = folder(a.config_dir!)
  if (!existsSync(dir)) throw new PlanError(`This app's agents run on the Claude login in ${dir}, and that folder doesn't exist. Log in there once (CLAUDE_CONFIG_DIR=${dir} claude auth login), or change the account under Settings › Agents.`)
  return { env: { ...rest, CLAUDE_CONFIG_DIR: dir } }
}

/** What a terminal needs in front of `claude` to be on the same account. */
export function accountPrefix(setup: unknown): string {
  const a = accountOf(setup)
  if (a.key_env) return `ANTHROPIC_API_KEY="$${a.key_env}" `
  return a.config_dir ? `CLAUDE_CONFIG_DIR=${JSON.stringify(folder(a.config_dir))} ` : ''
}

export interface AccountStatus {
  kind: 'default' | 'key' | 'login'; ok: boolean
  /** One line for Settings: who it is, or what is wrong. */
  note: string
}
type Asked = { loggedIn?: boolean; authMethod?: string; email?: string; orgName?: string; subscriptionType?: string }
export type AskLogin = (env: Env) => Promise<Asked | null>
const askClaude = (binary: string): AskLogin => async (env) => {
  try { return JSON.parse((await execFileP(binary, ['auth', 'status'], { env: env as NodeJS.ProcessEnv, timeout: 15_000 })).stdout) as Asked } catch (e: any) { try { return JSON.parse(e?.stdout ?? '') as Asked } catch { return null } }
}
const who = (s: Asked) => [s.email, s.orgName && !s.orgName.includes(s.email ?? '\0') ? s.orgName : null, s.subscriptionType].filter(Boolean).join(' · ')

/** Which account the app's agents are on right now, in words; asks Claude Code itself about a login. */
export async function accountStatus(setup: unknown, env: Env = process.env, ask: AskLogin = askClaude(claudeBinary())): Promise<AccountStatus> {
  const a = accountOf(setup)
  const kind = a.key_env ? 'key' : a.config_dir ? 'login' : 'default'
  let use: Env
  try { use = accountEnv(setup, env).env ?? env } catch (e: any) { return { kind, ok: false, note: String(e?.message ?? e) } }
  if (kind === 'key') return { kind, ok: true, note: `The API key in ${a.key_env}, which is set in the engine's environment.` }
  if (kind === 'default' && env.ANTHROPIC_API_KEY) return { kind, ok: true, note: "The engine's default: the API key in ANTHROPIC_API_KEY." }
  const s = await ask(use)
  const where = kind === 'login' ? `the Claude login in ${use.CLAUDE_CONFIG_DIR}` : "the engine's default, the Claude Code login on this machine"
  if (!s) return { kind, ok: false, note: `Couldn't ask Claude Code about ${where}.` }
  if (!s.loggedIn) return { kind, ok: false, note: kind === 'login' ? `Nobody is logged in in ${use.CLAUDE_CONFIG_DIR}. Log in there once: CLAUDE_CONFIG_DIR=${use.CLAUDE_CONFIG_DIR} claude auth login` : 'Nobody is logged in to Claude Code on this machine: run claude auth login.' }
  return { kind, ok: true, note: `${where[0].toUpperCase()}${where.slice(1)}: ${who(s) || 'logged in'}.` }
}
