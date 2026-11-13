/**
 * Sharing what a task is looked at through, with someone outside: "take a look at this prototype and tell me what you
 * think" (Sandy, 2026-11-13: "we need to have a tunnel system built in, ready to go … I think it's critical"; "same
 * with mockups and sketches as well"). A share is a public address that reaches one local thing and nothing else:
 *
 * - a **prototype**: its server, on its port;
 * - **mockups**: the Storybook of a conversation's worktree (or the app's);
 * - **sketches**: the HTML files under sketches/, served by a small server of their own that reads only that folder.
 *   The engine's own port is never tunnelled: it holds everything.
 *
 * The tunnel is a Cloudflare quick tunnel (`cloudflared tunnel --url`): no account, no configuration, a random
 * `trycloudflare.com` address that lasts as long as the process does. Chosen over ngrok, which needs an account and
 * a token before the first link. Anyone with the address can open it, so a share is always a person's decision (the
 * agent's tool is rated expensive, which always asks), it ends by itself after a few hours, and it ends with the
 * thing it shows. Nothing about a share is kept: after an engine restart there are none.
 *
 * After Vercel's preview links (a link per piece of work, to send to someone for a look) and VS Code's port
 * forwarding (a local port made public, with a visible list and a way to stop each).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, session } from './db/schema.js'
import { appendEvent } from './events.js'
import { PlanError } from './projects.js'
import { onPrototypeStopped, prototypeStatus } from './prototype.js'
import { listSketches, readSketch } from './sketches.js'
import { storybookStatus } from './storybook.js'

export const SHARE_KINDS = ['prototype', 'storybook', 'sketch'] as const
export type ShareKind = (typeof SHARE_KINDS)[number]
export interface Shared { kind: ShareKind; id: string; url: string; since: string; expiresAt: string; by: string }
interface Live extends Shared { appId: string; proc: ChildProcess; server?: Server; timer: NodeJS.Timeout }

const live = new Map<string, Live>()
const starting = new Map<string, Promise<Shared>>()
const keyOf = (kind: ShareKind, id: string) => `${kind}:${id}`
const hours = () => Math.min(Math.max(Number(process.env.SHARE_HOURS ?? 8) || 8, 0.00001), 72)
const bin = () => process.env.CLOUDFLARED_BIN ?? 'cloudflared'
const WHAT = { prototype: 'The prototype', storybook: 'The mockups', sketch: 'The sketches' } as const
const view = (s: Live): Shared => ({ kind: s.kind, id: s.id, url: s.url, since: s.since, expiresAt: s.expiresAt, by: s.by })

/** The app a conversation or an app id belongs to: mockups and sketches are shared by where they live. */
async function scopeApp(id: string): Promise<string> {
  if (id.startsWith('sess_')) { const [s] = await db.select({ appId: session.appId }).from(session).where(eq(session.id, id)); if (!s?.appId) throw new PlanError(`no conversation ${id}`); return s.appId }
  const [a] = await db.select({ id: app.id }).from(app).where(eq(app.id, id))
  if (!a) throw new PlanError(`no app ${id}`)
  return a.id
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Sketches, for someone outside: a server that reads only the sketches folder of one place. Its front page lists them. */
export async function sketchServer(scope: string): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(/^\/+/, '')
      if (!path) {
        const l = await listSketches(scope)
        const items = l.sketches.map((s) => `<li><a href="/${s.file.split('/').map(encodeURIComponent).join('/')}">${esc(s.file)}</a></li>`).join('')
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sketches</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px"><h1 style="font-size:20px">Sketches</h1>${items ? `<ul>${items}</ul>` : '<p>No sketches here yet.</p>'}</body>`)
        return
      }
      const found = await readSketch(scope, path).catch(() => null)
      if (!found) { res.writeHead(404, { 'content-type': 'text/plain' }).end('No such sketch.'); return }
      res.writeHead(200, found.headers).end(found.body)
    })().catch(() => { if (!res.headersSent) res.writeHead(500); res.end() })
  })
  await new Promise<void>((ok, bad) => { server.once('error', bad); server.listen(0, '127.0.0.1', () => ok()) })
  return { server, port: (server.address() as AddressInfo).port }
}

/** What a share reaches: a local address, checked to be answering, and the app it belongs to. */
async function targetOf(kind: ShareKind, id: string): Promise<{ appId: string; url: string; server?: Server }> {
  if (kind === 'prototype') {
    const p = await prototypeStatus(id)
    if (p.status !== 'running' || !p.up || !p.url) throw new PlanError('the prototype is not running: start it, then share it')
    return { appId: p.appId, url: p.url }
  }
  const appId = await scopeApp(id)
  if (kind === 'storybook') {
    const s = await storybookStatus(appId, id.startsWith('sess_') ? id : null)
    if (!s.url || !s.up) throw new PlanError('the mockups are not running: start Storybook on the Mockups page, then share them')
    return { appId, url: s.url }
  }
  if (!(await listSketches(id)).sketches.length) throw new PlanError('there are no sketches to share yet')
  const { server, port } = await sketchServer(id)
  return { appId, url: `http://127.0.0.1:${port}`, server }
}

const ADDRESS = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const CONNECTED = /Registered tunnel connection/ // cloudflared prints the address first and connects after: until this line the address answers with Cloudflare's error page

/** Start the tunnel and wait for its address and for it to be connected, so the link works when it is handed over. The origin is told it is asked for as itself, so a dev server that checks the host still answers. */
function tunnel(target: string, timeoutMs = Number(process.env.SHARE_START_TIMEOUT_MS ?? 45_000)): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((ok, bad) => {
    const host = new URL(target).host
    const proc = spawn(bin(), ['tunnel', '--no-autoupdate', '--url', target, '--http-host-header', host], { stdio: ['ignore', 'pipe', 'pipe'] })
    const said: string[] = []
    let done = false
    let url: string | null = null
    let all = ''
    const fail = (why: string) => { if (done) return; done = true; clearTimeout(timer); try { proc.kill('SIGTERM') } catch { /* gone */ } bad(new PlanError(why)) }
    const timer = setTimeout(() => fail(url ? `the tunnel got an address but did not connect to Cloudflare in ${Math.round(timeoutMs / 1000)} seconds, so the link would not work. This network may block it. Its last lines: ${said.slice(-3).join(' | ')}` : `the tunnel gave no address in ${Math.round(timeoutMs / 1000)} seconds. Its last lines: ${said.slice(-3).join(' | ') || '(nothing)'}`), timeoutMs)
    const read = (b: Buffer) => {
      for (const line of b.toString().split('\n')) if (line.trim()) said.push(line.trim().slice(0, 200))
      all = (all + b.toString()).slice(-20_000)
      url ??= ADDRESS.exec(all)?.[0] ?? null
      if (url && CONNECTED.test(all) && !done) { done = true; clearTimeout(timer); ok({ proc, url }) }
    }
    proc.stdout?.on('data', read); proc.stderr?.on('data', read)
    proc.on('error', (e: NodeJS.ErrnoException) => fail(e.code === 'ENOENT' ? 'cloudflared is not installed on this computer: sharing uses a Cloudflare quick tunnel. Install it (brew install cloudflared), then share again. No account is needed.' : `the tunnel could not start: ${e.message}`))
    proc.on('exit', (code) => fail(`the tunnel stopped before giving an address (exit ${code}). Its last lines: ${said.slice(-3).join(' | ') || '(nothing)'}`))
  })
}

async function tell(appId: string, actor: string, type: 'share.started' | 'share.stopped', payload: Record<string, unknown>) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a?.workspaceId ?? 'ws_none', appId, actor, type, payload }))
}

// A prototype that is stopped or thrown away is no longer shown to anyone (both say so before they stop it); a restart keeps
// its port, so its address goes on working. Hooked up at the first share, since this module and prototype.ts load each other.
let wired = false
function wire() { if (wired) return; wired = true; onPrototypeStopped((id) => { void unshare('prototype', id, 'engine', 'the prototype was stopped') }) }

/** Make a public address for one thing. Sharing what is already shared gives the same address. */
export async function share(kind: ShareKind, id: string, actor = 'person'): Promise<Shared> {
  if (!SHARE_KINDS.includes(kind)) throw new PlanError(`share a prototype, mockups (storybook) or sketches (sketch), not ${kind}`)
  wire()
  const key = keyOf(kind, id)
  const there = live.get(key)
  if (there) return view(there)
  const pending = starting.get(key)
  if (pending) return pending
  const p = (async () => {
    const target = await targetOf(kind, id)
    let t: { proc: ChildProcess; url: string }
    try { t = await tunnel(target.url) } catch (err) { target.server?.close(); throw err }
    const now = Date.now()
    const s: Live = {
      kind, id, appId: target.appId, url: t.url, since: new Date(now).toISOString(), expiresAt: new Date(now + hours() * 3_600_000).toISOString(), by: actor,
      proc: t.proc, server: target.server, timer: setTimeout(() => void unshare(kind, id, 'engine', 'its time was up'), hours() * 3_600_000),
    }
    s.timer.unref?.()
    live.set(key, s)
    t.proc.on('exit', () => { if (live.get(key) === s) void unshare(kind, id, 'engine', 'the tunnel stopped') }) // it died by itself: the address is dead, so say so
    await tell(target.appId, actor, 'share.started', { kind, id, url: s.url, expiresAt: s.expiresAt })
    return view(s)
  })().finally(() => starting.delete(key))
  starting.set(key, p)
  return p
}

/** End a share: the address stops answering at once. */
export async function unshare(kind: ShareKind, id: string, actor = 'person', why?: string): Promise<{ stopped: boolean }> {
  const key = keyOf(kind, id)
  const s = live.get(key)
  if (!s) return { stopped: false }
  live.delete(key)
  clearTimeout(s.timer)
  try { s.proc.kill('SIGTERM') } catch { /* gone */ }
  s.server?.close()
  await tell(s.appId, actor, 'share.stopped', { kind, id, url: s.url, ...(why ? { why } : {}) }).catch(() => {})
  return { stopped: true }
}

export const shared = (kind: ShareKind, id: string): Shared | null => { const s = live.get(keyOf(kind, id)); return s ? view(s) : null }
/** Everything of one app that is public right now. */
export const sharesOf = (appId: string): (Shared & { what: string })[] => [...live.values()].filter((s) => s.appId === appId).map((s) => ({ ...view(s), what: WHAT[s.kind] }))
/** The engine is going down: every address with it. */
export function stopShares() { for (const s of live.values()) { clearTimeout(s.timer); try { s.proc.kill('SIGTERM') } catch { /* gone */ } s.server?.close() } live.clear() }
