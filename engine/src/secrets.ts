/**
 * Keys that persist (Sandy, 2026-11-17: "We can't have them having to keep readding them over and over again. I'm
 * fine with only saving the name of the key, but the key needs to be somewhere that persists in a dot file within
 * .self-evident, the name of the app"). Settings and the database keep only the NAME of a key's variable
 * (`key_env`), as before. The key itself is kept in a file on this computer:
 *
 *   ~/.self-evident/apps/<the app's key, lower case>/secrets.env    one app's
 *   ~/.self-evident/secrets.env                                      every app's (the workspace's integrations)
 *
 * Plain `NAME=value` lines, readable by this user only (0600, its folder 0700). Where an integration reads a key, it
 * looks there first, the app's file over the shared one, then in the engine's environment, which still works. A key
 * is written here and never read back out: the engine says only whether one is set, where, and its last four
 * characters. It is not in the database, not in an event, not in anything an agent is given, and it is not put in the
 * environment of what the engine starts.
 *
 * After a `.env` file for the format, and `~/.aws/credentials` and `~/.netrc` for a per-user file of keys kept out of
 * every repository.
 */
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export class SecretError extends Error {}
export const secretsHome = () => process.env.SECRETS_HOME ?? join(homedir(), '.self-evident')
const slug = (appKey: string) => appKey.toLowerCase().replace(/[^a-z0-9_-]/g, '')
/** Where one app's keys are kept; with no app, the shared file. */
export const secretsFile = (appKey?: string | null) => (appKey && slug(appKey) ? join(secretsHome(), 'apps', slug(appKey), 'secrets.env') : join(secretsHome(), 'secrets.env'))
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/

export function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m || line.trimStart().startsWith('#')) continue
    const v = m[2].trim()
    out[m[1]] = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v
  }
  return out
}

async function read(file: string): Promise<Record<string, string>> {
  try { return parse(await readFile(file, 'utf8')) } catch { return {} }
}

async function write(file: string, all: Record<string, string>) {
  const names = Object.keys(all).sort()
  if (!names.length) { await rm(file, { force: true }); return }
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const text = `# Keys kept by Self Evident for this computer only. One NAME=value a line. Not in any repository or database.\n${names.map((n) => `${n}=${all[n]}`).join('\n')}\n`
  await writeFile(file, text, { mode: 0o600 })
  await chmod(file, 0o600) // an existing file keeps its mode on write: set it every time
}

/**
 * The environment an integration reads its key from: the engine's own, with the shared file's keys over it and the
 * app's file over that. Only for the engine's own calls: never handed to anything it starts.
 */
export async function envFor(appKey?: string | null, env: Record<string, string | undefined> = process.env): Promise<Record<string, string | undefined>> {
  return { ...env, ...(await read(secretsFile())), ...(appKey ? await read(secretsFile(appKey)) : {}) }
}

export interface Kept { name: string; set: boolean; /** Where the key in force comes from. */ from: 'app' | 'shared' | 'environment' | null; last4: string | null }
/** Whether a key is set and where from, never the key: its last four characters, to tell two apart. */
export async function keptAs(name: string | null | undefined, appKey?: string | null, env: Record<string, string | undefined> = process.env): Promise<Kept | null> {
  const n = name?.trim()
  if (!n) return null
  const own = appKey ? (await read(secretsFile(appKey)))[n] : undefined
  const shared = (await read(secretsFile()))[n]
  const v = own ?? shared ?? env[n]
  return { name: n, set: !!v, from: own ? 'app' : shared ? 'shared' : v ? 'environment' : null, last4: v && v.length >= 12 ? v.slice(-4) : null }
}

/** Keep a key: in the app's file, or the shared one with no app. Replaces one of the same name. */
export async function keepSecret(name: string, value: string, appKey?: string | null) {
  const n = name.trim(), v = value.trim()
  if (!NAME.test(n)) throw new SecretError('a key is kept under its variable\'s name: letters, digits and _, like LINEAR_API_KEY')
  if (!v) throw new SecretError('paste the key; to take one away, remove it')
  if (/[\r\n]/.test(v) || v.length > 8000) throw new SecretError('a key is one line')
  const file = secretsFile(appKey)
  await write(file, { ...(await read(file)), [n]: v })
  return keptAs(n, appKey)
}

/** Take a kept key away from the app's file (or the shared one). What is in the engine's environment is not touched. */
export async function dropSecret(name: string, appKey?: string | null) {
  const file = secretsFile(appKey)
  const all = await read(file)
  delete all[name.trim()]
  await write(file, all)
  return keptAs(name, appKey)
}

/** An app's key changed (HG to GATE): its file goes with it. */
export async function moveSecrets(fromKey: string, toKey: string) {
  const from = dirname(secretsFile(fromKey)), to = dirname(secretsFile(toKey))
  if (from === to || !existsSync(from) || existsSync(to)) return
  await mkdir(dirname(to), { recursive: true, mode: 0o700 })
  await rename(from, to)
}
