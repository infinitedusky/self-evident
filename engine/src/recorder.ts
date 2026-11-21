/**
 * The recorder: a live run's calls to an outside service go through the engine, and each one is kept raw in the
 * task's recordings folder (recordings.ts), so the response a mock is mined from is never lost (mocks.ts).
 *
 * Found on Cloaked (2026-11-20): the 18 Nov live run's response was not kept. The app's client buffers SixtyFour's
 * CSV, parses it into its own tables and drops the body, and the smoke test's output stayed out of git; so the
 * columns the parser leaves out (the vendor's own pipeline columns among them) were nowhere. An agent told to save
 * a response can forget; a proxy cannot.
 *
 * It stands where the app's base URL points (SIXTYFOUR_BASE_URL) and passes every request to the real service with
 * its own headers, the key among them. What it saves: the request's method, address and body, the response's
 * status and body, and their headers less anything secret (keys, tokens, cookies). A key never reaches a file.
 *
 * A service that answers with a link to fetch next (SixtyFour's download links, a signed storage address) would take
 * the app around the recorder. So in a JSON response, a string that is an address in full is rewritten to go through
 * the recorder (`/__via/<origin>/<path>`); what is saved is the response as it came. A CSV or other body is passed on
 * as it is.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordingsDir } from './recordings.js'

export const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-access-token)$|key|token|secret|password|signature/i
const HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding', 'te', 'trailer', 'proxy-connection'])
const VIA = '/__via/'

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString()
/** The headers as saved: secrets replaced by a mark that one was sent. Pure. */
export function redact(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) if (v !== undefined) out[k.toLowerCase()] = SECRET_HEADER.test(k) ? '(sent, not kept)' : Array.isArray(v) ? v.join(', ') : v
  return out
}
export const extOf = (type: string | null | undefined) => { const t = (type ?? '').toLowerCase(); return t.includes('json') ? 'json' : t.includes('csv') ? 'csv' : t.includes('html') ? 'html' : t.includes('xml') ? 'xml' : t.startsWith('text/') ? 'txt' : 'bin' }
/** Where a request to the recorder goes: through a rewritten link, or under the service's base URL. Pure. */
export function targetOf(upstream: string, path: string): string {
  if (path.startsWith(VIA)) { const rest = path.slice(VIA.length), at = rest.indexOf('/'); const origin = unb64(at < 0 ? rest : rest.slice(0, at)); return origin + (at < 0 ? '/' : rest.slice(at)) }
  const base = new URL(upstream)
  return base.origin + base.pathname.replace(/\/+$/, '') + path
}
/** A JSON body with each full address sent through the recorder at `self`. Pure. */
export function rewriteLinks(body: unknown, self: string): unknown {
  if (typeof body === 'string') { if (/^https?:\/\/[^\s]+$/i.test(body)) { try { const u = new URL(body); return `${self}${VIA}${b64(u.origin)}${u.pathname}${u.search}` } catch { return body } } return body }
  if (Array.isArray(body)) return body.map((x) => rewriteLinks(x, self))
  if (body && typeof body === 'object') return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, rewriteLinks(v, self)]))
  return body
}
const stamp = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
const slugOf = (p: string) => p.replace(/^\/+/, '').replace(/\?.*$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'root'

export interface Recording { key: string; port: number; dir: string; exchanges: () => number; stop: () => Promise<{ dir: string | null; exchanges: number }> }

/** Start one: listening on a port of its own, saving into <recordings of the task>/<key>/<when>/. */
export async function startRecorder(i: { appId: string; issueId?: string | null; key: string; upstream: string; port?: number; fetcher?: typeof fetch }): Promise<Recording> {
  new URL(i.upstream) // refuses an address that is not one
  const dir = join(recordingsDir(i.appId, { issueId: i.issueId ?? null }), i.key, stamp())
  const doFetch = i.fetcher ?? fetch
  let n = 0
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now(), no = String(++n).padStart(3, '0')
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks)
    const target = targetOf(i.upstream, req.url ?? '/')
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP.has(k.toLowerCase())) headers[k] = Array.isArray(v) ? v.join(', ') : v
    headers['accept-encoding'] = 'identity' // so what is saved is the body, not its compression
    mkdirSync(dir, { recursive: true })
    const meta: Record<string, unknown> = { method: req.method, address: target, at: new Date(started).toISOString(), request: { headers: redact(req.headers) } }
    if (body.length) writeFileSync(join(dir, `${no}.request.${extOf(req.headers['content-type'])}`), body)
    try {
      const r = await doFetch(target, { method: req.method, headers, body: body.length && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined, redirect: 'follow' })
      const got = Buffer.from(await r.arrayBuffer())
      const type = r.headers.get('content-type')
      writeFileSync(join(dir, `${no}.response.${extOf(type)}`), got)
      Object.assign(meta, { status: r.status, ms: Date.now() - started, response: { headers: redact(Object.fromEntries(r.headers)) } })
      let out: Buffer = got
      if (extOf(type) === 'json') { try { out = Buffer.from(JSON.stringify(rewriteLinks(JSON.parse(got.toString()), `http://${req.headers.host}`))) } catch { /* not JSON after all: as it came */ } }
      const back: Record<string, string> = {}
      r.headers.forEach((v, k) => { if (!HOP.has(k) && k !== 'content-encoding') back[k] = v })
      res.writeHead(r.status, { ...back, 'content-length': String(out.length) })
      res.end(out)
    } catch (err) {
      Object.assign(meta, { status: 502, ms: Date.now() - started, error: (err as Error).message })
      res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`Self Evident's recorder could not reach ${target}: ${(err as Error).message}`)
    }
    writeFileSync(join(dir, `${no}-${slugOf(req.url ?? '/')}.meta.json`), JSON.stringify(meta, null, 2))
  }
  const server: Server = createServer((req, res) => { handle(req, res).catch((err) => { if (!res.headersSent) res.writeHead(500); res.end(String(err)) }) })
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(i.port ?? 0, () => done()) })
  const port = (server.address() as AddressInfo).port
  return {
    key: i.key, port, dir, exchanges: () => n,
    stop: () => new Promise((done) => {
      server.close(() => {
        let files: string[] = []
        try { files = readdirSync(dir) } catch { /* nothing came through */ }
        if (!files.length) { rmSync(dir, { recursive: true, force: true }); return done({ dir: null, exchanges: 0 }) }
        done({ dir, exchanges: n })
      })
      server.closeAllConnections?.()
    }),
  }
}
