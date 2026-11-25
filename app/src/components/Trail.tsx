/**
 * One view's own way around: where it went, in order, with back, forward, reload and an address bar (after a
 * browser's own). The smoke test and the prototype each give one to the build and one to main beside it.
 *
 * The view says where it is (Sandy, 2026-11-20: "the address doesn't update with the site like a real browser. This
 * makes the back and forward useless"): what runs on this computer is shown through the engine's proxy, which puts a
 * script in each of its pages that tells this page its address on every load and history change. A link pressed
 * inside it is a step in the trail, as in a browser, and the address bar follows. Somewhere the proxy cannot stand in
 * front of (a deployed site) is shown as it is, and only where this page sent it is known.
 */
import { useEffect, useRef, useState } from 'react'
import { API } from '../engine'

type Steps = { list: string[]; i: number; /** The lowest step back can reach: 0 once the first page has been taken over by where the view itself went. */ floor: number }

/** Where one view went, in order: back, forward, reload and what is typed in its address bar. */
export function useTrail() {
  const [trail, setTrail] = useState<Steps>({ list: [], i: -1, floor: -1 })
  const [typed, setTyped] = useState<string | null>(null) // what is in the address bar while it is being typed
  const [reloads, setReloads] = useState(0)
  /** Where the view itself last said it is: being there already, it is not loaded again. */
  const [frameAt, setFrameAt] = useState<string | null>(null)
  const setAt = (to: string | null) => { setTyped(null); setTrail((t) => (to === null ? { list: [], i: -1, floor: -1 } : t.list[t.i] === to ? t : { ...t, list: [...t.list.slice(0, t.i + 1), to], i: t.i + 1 })) }
  const step = (by: number) => { setTyped(null); setTrail((t) => ({ ...t, i: Math.max(t.floor, Math.min(t.list.length - 1, t.i + by)) })) }
  /** The view went somewhere on its own (a link in it): a new step, or, for a redirect or a replaceState, the step it is on. */
  const seen = (href: string, replace: boolean) => {
    setFrameAt(href); setTyped(null)
    setTrail((t) => {
      if (t.list[t.i] === href) return t
      if (replace) return t.i < 0 ? { list: [href], i: 0, floor: 0 } : { ...t, list: [...t.list.slice(0, t.i), href, ...t.list.slice(t.i + 1)] }
      if (t.i - 1 >= t.floor && t.i > 0 && t.list[t.i - 1] === href) return { ...t, i: t.i - 1 } // its own back (history.back() in its code)
      if (t.list[t.i + 1] === href) return { ...t, i: t.i + 1 }
      return { ...t, list: [...t.list.slice(0, t.i + 1), href], i: t.i + 1 }
    })
  }
  return { at: trail.list[trail.i] ?? null, canBack: trail.i > trail.floor, canForward: trail.i < trail.list.length - 1, typed, setTyped, reloads, reload: () => setReloads((n) => n + 1), setAt, step, seen, frameAt }
}
export type Trail = ReturnType<typeof useTrail>
/**
 * Back, forward, reload and an address, for one view. `of` names it when there are two ("main"). One group, so a bar
 * that wraps never parts the address from its buttons; where the address is short of room it shows the path alone
 * (app.css, `.view-nav` and `.preview-address`).
 */
export function Nav({ t, home, src, of }: { t: Trail; home: string; src: string; of?: string }) {
  const path = src.startsWith(home) ? src.slice(home.length) || '/' : src // somewhere else entirely: the whole address
  const go = (to: string) => { const x = to.trim(); if (x) t.setAt(/^https?:\/\//.test(x) ? x : `${home}${x.startsWith('/') ? x : `/${x}`}`) }
  const n = (what: string) => (of ? `${what} (${of})` : what)
  return (
    <div className="view-nav">
      <button className="icon-btn" disabled={!t.canBack} onClick={() => t.step(-1)} title={n('Back')} aria-label={n('Back')}>←</button>
      <button className="icon-btn" disabled={!t.canForward} onClick={() => t.step(1)} title={n('Forward')} aria-label={n('Forward')}>→</button>
      <button className="icon-btn" onClick={t.reload} title={n('Reload')} aria-label={n('Reload')}>↻</button>
      <form className="preview-address smoke-address" onSubmit={(e) => { e.preventDefault(); go(t.typed ?? path) }}>
        {src.startsWith(home) && <span className="faint mono" title={home}>{home}</span>}
        <input className="mono" value={t.typed ?? path} onChange={(e) => t.setTyped(e.target.value)} aria-label={n('Address')} title="A path, or a whole address. Enter goes there." />
      </form>
    </div>
  )
}

const frames = new Map<string, Promise<string | null>>()
const known = new Map<string, string | null>() // what the engine said, for a view opened again
/** The proxy in front of `origin`, asked of the engine once a page; null for an address it does not stand in front of. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
/**
 * The frame's address, by the name this page itself is open under. The engine says "localhost"; a page open at
 * 127.0.0.1 is then another site to the browser, which keeps no SameSite cookie for a frame of another site, so the
 * app in the frame loses the cookie it guards its uploads with and refuses them (found 2026-11-23: an import pressed
 * in the frame was refused, the same press in a tab of its own was not). Both names are this computer, so the frame
 * is asked for by the page's.
 */
export function onThisHost(frame: string | null, page: string = window.location.hostname): string | null {
  if (!frame) return frame
  try { const u = new URL(frame); if (LOOPBACK.has(u.hostname) && LOOPBACK.has(page) && u.hostname !== page) { u.hostname = page; return u.origin } } catch { /* as it was said */ }
  return frame
}
const frameOf = (origin: string) => {
  let p = frames.get(origin)
  if (!p) {
    p = fetch(`${API}/frame?url=${encodeURIComponent(origin)}`).then((r) => (r.ok ? r.json() : { frame: null })).then((x: { frame: string | null }) => onThisHost(x.frame)).catch(() => null)
    p.then((f) => known.set(origin, f))
    frames.set(origin, p)
  }
  return p
}
const originOf = (url: string) => { try { return new URL(url).origin } catch { return null } }

/**
 * The view itself: `src` is where the trail has it, `home` the address it runs at. When the engine can stand in front
 * of it, it is loaded through that, and says where it goes; the trail follows. It is loaded again only when the trail
 * sends it somewhere it is not (back, forward, an address typed, a check's "Go there"), on reload, or when `version`
 * changes (a restart).
 */
export function Framed({ t, src, home, version = '', ...rest }: { t: Trail; src: string; home: string; version?: string } & Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'src'>) {
  const homeOrigin = originOf(home)
  const [proxy, setProxy] = useState<{ for: string; frame: string | null } | null>(() => (homeOrigin && known.has(homeOrigin) ? { for: homeOrigin, frame: known.get(homeOrigin)! } : null))
  useEffect(() => {
    if (!homeOrigin || proxy?.for === homeOrigin) return
    let live = true
    void frameOf(homeOrigin).then((frame) => { if (live) setProxy({ for: homeOrigin, frame }) })
    return () => { live = false }
  }, [homeOrigin]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !homeOrigin || proxy?.for === homeOrigin
  const frame = ready && homeOrigin ? proxy?.frame ?? null : null
  /** Through the proxy, and back. */
  const toFrame = (u: string) => (frame && homeOrigin && u.startsWith(homeOrigin) ? frame + u.slice(homeOrigin.length) : u)
  const fromFrame = (u: string) => (frame && homeOrigin && u.startsWith(frame) ? homeOrigin + u.slice(frame.length) : u)

  // What the frame is loaded with, and how many times: it changes only when the trail sends it somewhere it is not.
  const [load, setLoad] = useState({ src, n: 0, last: src, reloads: t.reloads })
  if (load.last !== src || load.reloads !== t.reloads) { // worked out here, not after: the frame is where the bar says in the same render
    const go = load.reloads !== t.reloads || src !== t.frameAt
    setLoad({ src: go ? src : load.src, n: go ? load.n + 1 : load.n, last: src, reloads: t.reloads })
  }
  const fresh = useRef(true) // the next thing the view says is its first since it was loaded: a redirect is not a step
  useEffect(() => { fresh.current = true }, [load.n, version, frame])

  const ref = useRef<HTMLIFrameElement>(null)
  const seen = useRef(t.seen)
  seen.current = t.seen
  useEffect(() => {
    if (!frame) return
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.origin !== frame) return
      const d = e.data as { selfEvident?: string; href?: unknown; kind?: unknown }
      if (d?.selfEvident !== 'at' || typeof d.href !== 'string') return
      const first = fresh.current
      fresh.current = false
      seen.current(fromFrame(d.href), first || d.kind === 'replace')
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [frame]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className={rest.className} style={rest.style} aria-busy="true" />
  return <iframe {...rest} ref={ref} key={`${load.n}#${version}#${frame ?? ''}`} src={toFrame(load.src)} />
}
