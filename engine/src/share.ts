/**
 * Sharing what a task is looked at through, with someone outside: "take a look at this prototype and tell me what you
 * think" (Sandy, 2026-11-13: "we need to have a tunnel system built in, ready to go … I think it's critical"; "same
 * with mockups and sketches as well"). A share is a public address that reaches one local thing and nothing else:
 *
 * - a **prototype**: its server, through a small proxy of ours that adds the tester's guide tab (share-guide.ts);
 * - **mockups**: the Storybook of a conversation's worktree (or the app's);
 * - **sketches**: the HTML files under sketches/, served by a small server of their own that reads only that folder.
 *   The engine's own port is never tunnelled: it holds everything.
 *
 * The tunnel is a Cloudflare quick tunnel (`cloudflared tunnel --url`): no account, no configuration, a random
 * `trycloudflare.com` address that lasts as long as the process does. Where a network will not let that connect
 * (it uses port 7844, which managed laptops block), ngrok is used instead: it needs an account's token, and gets
 * through on the ordinary HTTPS port. Anyone with the address can open it, so a share is always a person's decision (the
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
import { freeNgrok, ngrokHolders, pausedServices, restoreNgrok, restoreNgrokNow, type Holder } from './ngrok-holders.js'
import { onPrototypeStopped, prototypeStatus } from './prototype.js'
import { guideOf, guideProxy, takeFeedback } from './share-guide.js'
import { listSketches, readSketch } from './sketches.js'
import { storybookStatus } from './storybook.js'

export const SHARE_KINDS = ['prototype', 'storybook', 'sketch'] as const
export type ShareKind = (typeof SHARE_KINDS)[number]
export interface Shared { kind: ShareKind; id: string; url: string; since: string; expiresAt: string; by: string; /** Which tunnel it goes through. */ via: 'cloudflare' | 'ngrok' }
interface Live extends Shared { appId: string; proc: ChildProcess; server?: Server; timer: NodeJS.Timeout }

const live = new Map<string, Live>()
const starting = new Map<string, Promise<Shared>>()
const keyOf = (kind: ShareKind, id: string) => `${kind}:${id}`
const hours = () => Math.min(Math.max(Number(process.env.SHARE_HOURS ?? 8) || 8, 0.00001), 72)
const bin = () => process.env.CLOUDFLARED_BIN ?? 'cloudflared'
const WHAT = { prototype: 'The prototype', storybook: 'The mockups', sketch: 'The sketches' } as const
const view = (s: Live): Shared => ({ kind: s.kind, id: s.id, url: s.url, since: s.since, expiresAt: s.expiresAt, by: s.by, via: s.via })

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
    // Reached through a proxy of ours that adds the tester's guide tab to its pages and takes what they say (share-guide.ts).
    const { server, port } = await guideProxy(p.url, { title: p.title, guide: async () => guideOf(await prototypeStatus(id)), onFeedback: (f) => takeFeedback(id, f) })
    return { appId: p.appId, url: `http://127.0.0.1:${port}`, server }
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

export type Via = 'cloudflare' | 'ngrok'
type Tunnel = { proc: ChildProcess; url: string; via: Via }
/** Why a tunnel did not come up, in a form the next step can act on: `blocked` means this network, so another provider may work. */
class TunnelError extends PlanError { constructor(message: string, readonly blocked = false, readonly busy = false) { super(message) } }
/** A share that could not be made, with what the person can do about it: ngrok's address held by tunnels on this computer, which can be stopped for them. */
export class ShareError extends PlanError { constructor(message: string, readonly code: 'ngrok_busy', readonly holders: Holder[]) { super(message) } }

const ADDRESS = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const CONNECTED = /Registered tunnel connection/ // cloudflared prints the address first and connects after: until this line the address answers with Cloudflare's error page
const EDGE_REFUSED = /Unable to establish connection with Cloudflare edge|Failed to dial a quic connection|dial tcp [^ ]+:7844: i\/o timeout/g
const startTimeout = () => Number(process.env.SHARE_START_TIMEOUT_MS ?? 45_000)
const ngrokBin = () => process.env.NGROK_BIN ?? 'ngrok'

/** Run a tunnel program and settle on the first of: `ready` says it has an address and is connected, `broken` says why it will not, it exits, or time is up. */
function run(cmd: string, args: string[], o: { via: Via; ready: (all: string) => string | null; broken: (all: string, final?: boolean) => TunnelError | null; missing: string; timeoutMs: number }): Promise<Tunnel> {
  return new Promise((ok, bad) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let done = false
    let all = ''
    const last = () => all.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3).map((l) => l.slice(0, 200)).join(' | ') || '(nothing)'
    const fail = (e: TunnelError) => { if (done) return; done = true; clearTimeout(timer); try { proc.kill('SIGTERM') } catch { /* gone */ } bad(e) }
    const timer = setTimeout(() => fail(o.broken(all, true) ?? new TunnelError(`the tunnel was not ready in ${Math.round(o.timeoutMs / 1000)} seconds. Its last lines: ${last()}`)), o.timeoutMs)
    const read = (b: Buffer) => {
      all = (all + b.toString()).slice(-40_000)
      const url = o.ready(all)
      if (url && !done) { done = true; clearTimeout(timer); ok({ proc, url, via: o.via }); return }
      const why = o.broken(all)
      if (why) fail(why)
    }
    proc.stdout?.on('data', read); proc.stderr?.on('data', read)
    proc.on('error', (e: NodeJS.ErrnoException) => fail(new TunnelError(e.code === 'ENOENT' ? o.missing : `the tunnel could not start: ${e.message}`)))
    proc.on('exit', (code) => fail(o.broken(all) ?? new TunnelError(`the tunnel stopped before it was ready (exit ${code}). Its last lines: ${last()}`)))
  })
}

/**
 * A Cloudflare quick tunnel: no account. The origin is told it is asked for as itself, so a dev server that checks the
 * host still answers. It connects out on port 7844, which some managed networks block (Sandy's work laptop, 2026-11-13):
 * two refusals from the edge and no connection is that, said after seconds, not the whole wait.
 */
const cloudflare = (target: string, timeoutMs = startTimeout()) => run(bin(), ['tunnel', '--no-autoupdate', '--url', target, '--http-host-header', new URL(target).host], {
  via: 'cloudflare', timeoutMs,
  ready: (all) => (CONNECTED.test(all) ? ADDRESS.exec(all)?.[0] ?? null : null),
  broken: (all, final) => (!CONNECTED.test(all) && (all.match(EDGE_REFUSED)?.length ?? 0) >= (final ? 1 : 2) ? new TunnelError('this network does not let the Cloudflare tunnel connect: it blocks outbound port 7844, which the tunnel uses. A managed laptop or a work network often does. Another network works, or ask for that port to be allowed.', true) : null),
  missing: 'cloudflared is not installed on this computer: sharing uses a Cloudflare quick tunnel. Install it (brew install cloudflared), then share again. No account is needed.',
})

/**
 * ngrok: connects out on the ordinary HTTPS port, so it gets through where Cloudflare's does not. It needs an account's
 * token (`ngrok config add-authtoken`), and a free account has one address: a second tunnel is refused while one is up.
 * Its JSON log says "started tunnel" with the address once it is live.
 */
function ngrokUrl(all: string): string | null {
  for (const line of all.split('\n')) { if (!line.includes('"url"')) continue; try { const j = JSON.parse(line) as { url?: string; msg?: string }; if (j.url && /^https:\/\//.test(j.url) && j.msg === 'started tunnel') return j.url } catch { /* a partial line */ } }
  return null
}
const ngrok = (target: string, timeoutMs = startTimeout()) => run(ngrokBin(), ['http', target.replace(/^http:\/\//, ''), '--host-header', new URL(target).host, '--log', 'stdout', '--log-format', 'json'], {
  via: 'ngrok', timeoutMs, ready: ngrokUrl,
  broken: (all) => /ERR_NGROK_334|is already online/.test(all) ? new TunnelError('ngrok\'s address is already in use: another ngrok tunnel is running on this account, and a free account has one address. Stop that tunnel (or what is shared now), or use a paid ngrok plan, then share again.', false, true)
    : /ERR_NGROK_(4018|105|107)|authtoken/i.test(all) && /ERR_NGROK_/.test(all) ? new TunnelError('ngrok has no working token on this computer: sign in at ngrok.com, then run "ngrok config add-authtoken <token>" and share again.')
    : /ERR_NGROK_\d+/.test(all) ? new TunnelError(`ngrok would not start the tunnel (${/ERR_NGROK_\d+/.exec(all)![0]}): ${(/failed to start tunnel: ([^\\"\n]+)/.exec(all)?.[1] ?? 'see ngrok.com/docs/errors').slice(0, 200)}`) : null,
  missing: 'ngrok is not installed on this computer (brew install ngrok), and it needs an account\'s token.',
})

/**
 * Which tunnel a share goes through. `SHARE_TUNNEL`: cloudflare, ngrok, or auto (the default): Cloudflare first, since
 * it needs no account, and ngrok when this network will not let Cloudflare connect. A network that blocked it once is
 * not asked again for an hour, so the next share does not wait to find out.
 */
let cloudflareBlockedAt = 0
export const forgetBlocked = () => { cloudflareBlockedAt = 0 } // for tests
const ownNgrok = () => [...live.values()].filter((s) => s.via === 'ngrok' && s.proc.pid).map((s) => s.proc.pid!)
async function tunnel(target: string): Promise<Tunnel> {
  const want = (process.env.SHARE_TUNNEL ?? 'auto').toLowerCase()
  if (want === 'ngrok') return ngrok(target)
  if (want === 'cloudflare' || want === 'cloudflared') return cloudflare(target)
  let first: TunnelError | null = null
  if (Date.now() - cloudflareBlockedAt > 3_600_000) {
    try { return await cloudflare(target) } catch (err) {
      if (!(err instanceof TunnelError) || !err.blocked) throw err
      first = err; cloudflareBlockedAt = Date.now()
    }
  }
  try { return await ngrok(target) } catch (err) {
    const why = `${first ? first.message : 'This network does not let the Cloudflare tunnel connect (found earlier).'} Tried ngrok instead: ${(err as Error).message}`
    if (err instanceof TunnelError && err.busy) {
      const holders = await ngrokHolders(ownNgrok()).catch(() => [])
      throw new ShareError(holders.length ? `${why} On this computer: ${holders.map((h) => `ngrok ${h.what}${h.service ? ` (the service ${h.service})` : ''}`).join('; ')}.` : `${why} None is running on this computer, so it is on another one.`, 'ngrok_busy', holders)
    }
    throw new PlanError(why)
  }
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
export async function share(kind: ShareKind, id: string, actor = 'person', opts: { /** Stop the other ngrok tunnels on this computer first; services among them are put back when sharing ends. */ freeNgrok?: boolean } = {}): Promise<Shared> {
  if (!SHARE_KINDS.includes(kind)) throw new PlanError(`share a prototype, mockups (storybook) or sketches (sketch), not ${kind}`)
  wire()
  const key = keyOf(kind, id)
  const there = live.get(key)
  if (there) return view(there)
  const pending = starting.get(key)
  if (pending) return pending
  const p = (async () => {
    const target = await targetOf(kind, id)
    if (opts.freeNgrok) await freeNgrok(ownNgrok()).catch(() => [])
    let t: Tunnel
    try { t = await tunnel(target.url) } catch (err) { target.server?.close(); throw err }
    const now = Date.now()
    const s: Live = {
      kind, id, appId: target.appId, url: t.url, via: t.via, since: new Date(now).toISOString(), expiresAt: new Date(now + hours() * 3_600_000).toISOString(), by: actor,
      proc: t.proc, server: target.server, timer: setTimeout(() => void unshare(kind, id, 'engine', 'its time was up'), hours() * 3_600_000),
    }
    s.timer.unref?.()
    live.set(key, s)
    t.proc.on('exit', () => { if (live.get(key) === s) void unshare(kind, id, 'engine', 'the tunnel stopped') }) // it died by itself: the address is dead, so say so
    await tell(target.appId, actor, 'share.started', { kind, id, url: s.url, via: s.via, expiresAt: s.expiresAt })
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
  if (pausedServices().length && ![...live.values()].some((x) => x.via === 'ngrok')) { await new Promise((r) => setTimeout(r, 500)); await restoreNgrok().catch(() => {}) } // the address is free again: what was stopped for it comes back
  return { stopped: true }
}

export const shared = (kind: ShareKind, id: string): Shared | null => { const s = live.get(keyOf(kind, id)); return s ? view(s) : null }
/** Everything of one app that is public right now. */
export const sharesOf = (appId: string): (Shared & { what: string })[] => [...live.values()].filter((s) => s.appId === appId).map((s) => ({ ...view(s), what: WHAT[s.kind] }))
/** The engine has just started: no share outlives it, so a service left stopped for one (the engine was killed mid-share) is put back now. */
export const restoreAfterRestart = () => restoreNgrok().catch(() => [] as string[])
/** The engine is going down: every address with it. */
export function stopShares() { for (const s of live.values()) { clearTimeout(s.timer); try { s.proc.kill('SIGTERM') } catch { /* gone */ } s.server?.close() } live.clear(); restoreNgrokNow() }
