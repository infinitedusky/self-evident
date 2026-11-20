/**
 * A view's way of telling where it is (Sandy, 2026-11-20: "the address doesn't update with the site like a real
 * browser. This makes the back and forward useless"). What a prototype or a smoke test shows runs on a port of its
 * own, another origin, so the page around it cannot read where it went. In front of each one the engine puts a small
 * proxy, on a port of its own on this computer, that passes everything through and adds one script to each HTML page.
 * The script tells the page around it its address on every load and every pushState, replaceState and popstate.
 * Websockets (a dev server's hot reload) pass through untouched.
 *
 * Only addresses on this computer are proxied, and the proxy listens only here, so it reaches nothing the page could
 * not already reach.
 */
import http from 'node:http'
import net from 'node:net'

export const FRAME_SCRIPT_PATH = '/__self-evident/frame.js'

/** Runs in the view, before its own code: says where it is to the page around it. Nothing when it is not in a frame. */
export const FRAME_SCRIPT = `(function () {
  if (window.parent === window || window.__selfEvidentFrame) return
  window.__selfEvidentFrame = true
  var last = null
  function tell(kind) {
    var href = location.href
    if (href === last && kind !== 'load') return
    last = href
    try { window.parent.postMessage({ selfEvident: 'at', href: href, kind: kind }, '*') } catch (e) {}
  }
  ;['pushState', 'replaceState'].forEach(function (m) {
    var was = history[m]
    history[m] = function () { var r = was.apply(this, arguments); tell(m === 'pushState' ? 'push' : 'replace'); return r }
  })
  addEventListener('popstate', function () { tell('pop') })
  addEventListener('hashchange', function () { tell('push') })
  tell('load')
})()
`

const TAG = `<script src="${FRAME_SCRIPT_PATH}"></script>`
/** The script, first in the page's head, so it is there before the page's own code moves anything. */
export const withScript = (html: string) => {
  if (html.includes(FRAME_SCRIPT_PATH)) return html
  const head = html.match(/<head(\s[^>]*)?>/i)
  if (head) { const at = head.index! + head[0].length; return html.slice(0, at) + TAG + html.slice(at) }
  const doc = html.match(/<html(\s[^>]*)?>/i)
  if (doc) { const at = doc.index! + doc[0].length; return html.slice(0, at) + TAG + html.slice(at) }
  return TAG + html
}

/** A local address the proxy will stand in front of: its port, or null for anywhere else. */
export const localPort = (url: string): number | null => {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return null
    const port = Number(u.port || 80)
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
  } catch { return null }
}

const proxies = new Map<number, Promise<number>>()

/** The proxy's address for what runs on `url`, started the first time it is asked for. Null when `url` is not on this computer. */
export async function frameFor(url: string): Promise<string | null> {
  const target = localPort(url)
  if (!target) return null
  let p = proxies.get(target)
  if (!p) { p = start(target); proxies.set(target, p); p.catch(() => proxies.delete(target)) }
  return `http://localhost:${await p}`
}

export function stopFrames() { proxies.clear(); for (const s of servers) s.close(); servers.length = 0 }
const servers: http.Server[] = []

function start(target: number): Promise<number> {
  const handle = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url === FRAME_SCRIPT_PATH) { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); res.end(FRAME_SCRIPT); return }
    const headers = { ...req.headers }
    delete headers['accept-encoding'] // plain bodies back, so a page can have the script put in
    const up = http.request({ host: 'localhost', port: target, method: req.method, path: req.url, headers, autoSelectFamily: true } as http.RequestOptions, (r) => {
      const out = { ...r.headers }
      const here = `http://${req.headers.host ?? ''}`
      if (typeof out.location === 'string') out.location = out.location.replace(new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${target}(?=/|$)`), here)
      const html = /text\/html/i.test(String(out['content-type'] ?? '')) && req.method !== 'HEAD' && r.statusCode !== 204 && r.statusCode !== 304
      if (!html) { res.writeHead(r.statusCode ?? 502, out); r.pipe(res); return }
      const chunks: Buffer[] = []
      r.on('data', (c: Buffer) => chunks.push(c))
      r.on('end', () => {
        const body = Buffer.from(withScript(Buffer.concat(chunks).toString('utf8')), 'utf8')
        delete out['content-length']; delete out['transfer-encoding']
        res.writeHead(r.statusCode ?? 200, { ...out, 'content-length': body.length })
        res.end(body)
      })
      r.on('error', () => res.destroy())
    })
    up.on('error', (e) => { if (!res.headersSent) { res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`Nothing answers on port ${target}: ${e.message}`) } else res.destroy() })
    req.pipe(up)
  }
  const upgrade = (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    const up = net.connect({ host: 'localhost', port: target, autoSelectFamily: true })
    up.on('connect', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      up.write(lines.join('\r\n') + '\r\n\r\n')
      if (head.length) up.write(head)
      socket.pipe(up).pipe(socket)
    })
    up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy())
  }
  return new Promise((resolve, reject) => {
    const v4 = http.createServer(handle)
    v4.on('upgrade', upgrade)
    v4.once('error', reject)
    v4.listen(0, '127.0.0.1', () => {
      const port = (v4.address() as net.AddressInfo).port
      servers.push(v4)
      // The same port on ::1 too, for a browser that takes localhost to mean that; it is fine when it cannot.
      const v6 = http.createServer(handle)
      v6.on('upgrade', upgrade)
      v6.once('error', () => {})
      v6.listen(port, '::1', () => servers.push(v6))
      resolve(port)
    })
  })
}
