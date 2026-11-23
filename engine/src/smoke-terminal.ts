/**
 * A terminal in a task's smoke test (Sandy, 2026-11-18: "we need to have a way to do tests of things like installing
 * … the smoke env would be a temp folder on the machine and a terminal where it runs commands and you see it
 * working"). Some checks are commands, not pages: that the docs install the packed package and not the source, that
 * `npm i` of the library works in a new app.
 *
 * It is a real shell (node-pty), shown in the page (xterm.js), one per task and set-up. Where it opens:
 * - a set-up tested here (local): the smoke test's own checkout of the build, to look at what was built;
 * - a set-up that is a terminal (where: terminal): that same checkout, or a new empty folder outside every
 *   repository, thrown away when it is closed (folder: temp), to install the thing the way a user would. Its script,
 *   when it has one, is typed in at the start, so you see it work.
 *
 * It is a shell on this computer that a browser can reach, so the routes that feed it take requests from Self
 * Evident's own page only (server.ts, ownPage). It does not get the engine's own secrets: its database address and
 * its keys are taken out of the environment it starts with.
 */
import { chmodSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as pty from 'node-pty'
import { PlanError } from './issues.js'
import { smokePlace } from './smoke.js'

interface Term { proc: pty.IPty; buf: string; subs: Set<(data: string) => void>; ends: Set<(code: number) => void>; cwd: string; temp: string | null; exited: number | null }
const terms = new Map<string, Term>() // by task and set-up
const tKey = (issueId: string, setup: string) => `${issueId}:${setup}`
/** A set-up's throwaway terminal is kept beside its own, under its key with this after it; a set-up's key never has an "@". */
export const scratchKey = (setup: string) => `${setup}@temp`
/** What a page that connects late is shown first: the last of what was said. */
export const SCROLLBACK = 200_000

/** The engine's own, never the shell's: where its data is and the keys it holds. */
const OWN = /^(DATABASE_URL|LINEAR_API_KEY|POSTHOG_|DOPPLER_|FLY_API_TOKEN|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN)/
export const shellEnv = (from: NodeJS.ProcessEnv, more: Record<string, string> = {}): Record<string, string> =>
  ({ ...Object.fromEntries(Object.entries(from).filter(([k, v]) => v !== undefined && !OWN.test(k)) as [string, string][]), ...more, TERM: 'xterm-256color' })

/**
 * Whether a request comes from Evident's own page. A shell must not be reachable from any other site open in
 * the same browser: a page elsewhere can send a request to localhost, and its Origin says so. JSON is asked for on
 * anything that changes something, since another site cannot send that without asking first.
 */
export function ownPage(h: { origin?: string | null; site?: string | null; contentType?: string | null; method: string }, uiUrl = process.env.UI_URL) {
  if (h.site && h.site !== 'same-origin' && h.site !== 'none') return false
  if (h.origin) {
    let host: string
    try { host = new URL(h.origin).hostname } catch { return false }
    const ours = ['localhost', '127.0.0.1', '[::1]']
    try { if (uiUrl) ours.push(new URL(uiUrl).hostname) } catch { /* not an address: only this computer's names */ }
    if (!ours.includes(host)) return false
  }
  return h.method === 'GET' || /^application\/json\b/i.test(h.contentType ?? '')
}

/** node-pty's helper arrives without its execute bit when its install script is not run (pnpm asks first): set it. */
let helped = false
function helper() {
  if (helped) return
  helped = true
  try {
    const dir = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
    for (const p of [join(dir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'), join(dir, 'build', 'Release', 'spawn-helper')]) if (existsSync(p)) chmodSync(p, 0o755)
  } catch { /* built from source: nothing to do */ }
}

export const terminalOpen = (issueId: string, setup: string) => { const t = terms.get(tKey(issueId, setup)); return !!t && t.exited === null }

/** Open the task's terminal for a set-up, or say where the one already open is. */
export async function openTerminal(issueId: string, setup?: string, size: { cols?: number; rows?: number } = {}, /** The throwaway one, in a new empty folder, whatever the set-up is. */ scratch = false) {
  const place = await smokePlace(issueId, setup, scratch)
  const k = tKey(issueId, place.key)
  const had = terms.get(k)
  if (had && had.exited === null) return { setup: place.key, cwd: had.cwd, folder: had.temp ? 'temp' as const : 'build' as const, fresh: false }
  if (had) await closeTerminal(issueId, place.key)
  const temp = place.folder === 'temp' ? await mkdtemp(join(tmpdir(), `smoke-${place.task.toLowerCase()}-`)) : null
  const cwd = temp ?? place.checkout
  if (!cwd) throw new PlanError(`${place.task} is not built yet: there is no checkout to open a terminal in`)
  helper()
  const proc = pty.spawn(process.env.SHELL ?? '/bin/zsh', [], {
    name: 'xterm-256color', cols: size.cols ?? 100, rows: size.rows ?? 28, cwd,
    env: shellEnv(process.env, { ...(place.checkout ? { SMOKE_BUILD: place.checkout } : {}), ...(place.url ? { SMOKE_URL: place.url } : {}) }),
  })
  const t: Term = { proc, buf: '', subs: new Set(), ends: new Set(), cwd, temp, exited: null }
  proc.onData((d) => { t.buf = (t.buf + d).slice(-SCROLLBACK); for (const s of t.subs) s(d) })
  proc.onExit(({ exitCode }) => { t.exited = exitCode; for (const e of t.ends) e(exitCode) })
  terms.set(k, t)
  if (place.script) proc.write(`${place.script.replace(/\r?\n/g, '\r')}\r`) // the set-up's script, typed in so it is seen working
  return { setup: place.key, cwd, folder: temp ? 'temp' as const : 'build' as const, fresh: true }
}

const need = (issueId: string, setup: string) => { const t = terms.get(tKey(issueId, setup)); if (!t) throw new PlanError('that terminal is not open'); return t }

/** What it has said so far, then each thing it says, until it ends. Returns how to stop listening. */
export function watchTerminal(issueId: string, setup: string, onData: (data: string) => void, onEnd: (code: number) => void) {
  const t = need(issueId, setup)
  if (t.buf) onData(t.buf)
  if (t.exited !== null) { onEnd(t.exited); return () => {} }
  t.subs.add(onData); t.ends.add(onEnd)
  return () => { t.subs.delete(onData); t.ends.delete(onEnd) }
}
export function typeInTerminal(issueId: string, setup: string, data: string) { const t = need(issueId, setup); if (t.exited === null) t.proc.write(data) }
export function resizeTerminal(issueId: string, setup: string, cols: number, rows: number) {
  const t = need(issueId, setup)
  if (t.exited === null && cols > 1 && rows > 1) t.proc.resize(Math.min(Math.floor(cols), 400), Math.min(Math.floor(rows), 200))
}
/** Close it: the shell and what it started end, and a folder made for it is thrown away. */
export async function closeTerminal(issueId: string, setup: string) {
  const k = tKey(issueId, setup), t = terms.get(k)
  if (!t) return
  terms.delete(k)
  if (t.exited === null) { try { t.proc.kill() } catch { /* already gone */ } }
  for (const e of t.ends) e(t.exited ?? 0)
  if (t.temp) await rm(t.temp, { recursive: true, force: true }).catch(() => {})
}
export async function closeTerminals() { await Promise.all([...terms.keys()].map((k) => { const at = k.lastIndexOf(':'); return closeTerminal(k.slice(0, at), k.slice(at + 1)) })) }
