/**
 * One view's own way around: where it was sent, in order, with back, forward, reload and an address bar (after a
 * browser's own). The smoke test and the prototype each give one to the build and one to main beside it.
 */
import { useState } from 'react'

/** Where one view was sent, in order: back, forward, reload and what is typed in its address bar. */
export function useTrail() {
  const [trail, setTrail] = useState<{ list: string[]; i: number }>({ list: [], i: -1 })
  const [typed, setTyped] = useState<string | null>(null) // what is in the address bar while it is being typed
  const [reloads, setReloads] = useState(0)
  const setAt = (to: string | null) => { setTyped(null); setTrail((t) => (to === null ? { list: [], i: -1 } : t.list[t.i] === to ? t : { list: [...t.list.slice(0, t.i + 1), to], i: t.i + 1 })) }
  const step = (by: number) => { setTyped(null); setTrail((t) => ({ ...t, i: Math.max(-1, Math.min(t.list.length - 1, t.i + by)) })) }
  return { at: trail.list[trail.i] ?? null, canBack: trail.i >= 0, canForward: trail.i < trail.list.length - 1, typed, setTyped, reloads, reload: () => setReloads((n) => n + 1), setAt, step }
}
export type Trail = ReturnType<typeof useTrail>
/** Back, forward, reload and an address, for one view. `of` names it when there are two ("main"). */
export function Nav({ t, home, src, of }: { t: Trail; home: string; src: string; of?: string }) {
  const path = src.startsWith(home) ? src.slice(home.length) || '/' : src // somewhere else entirely: the whole address
  const go = (to: string) => { const x = to.trim(); if (x) t.setAt(/^https?:\/\//.test(x) ? x : `${home}${x.startsWith('/') ? x : `/${x}`}`) }
  const n = (what: string) => (of ? `${what} (${of})` : what)
  return (
    <>
      <button className="icon-btn" disabled={!t.canBack} onClick={() => t.step(-1)} title={n('Back')} aria-label={n('Back')}>←</button>
      <button className="icon-btn" disabled={!t.canForward} onClick={() => t.step(1)} title={n('Forward')} aria-label={n('Forward')}>→</button>
      <button className="icon-btn" onClick={t.reload} title={n('Reload')} aria-label={n('Reload')}>↻</button>
      <form className="preview-address smoke-address" onSubmit={(e) => { e.preventDefault(); go(t.typed ?? path) }}>
        {src.startsWith(home) && <span className="faint mono">{home}</span>}
        <input className="mono" value={t.typed ?? path} onChange={(e) => t.setTyped(e.target.value)} aria-label={n('Address')} title="A path, or a whole address. Enter goes there." />
      </form>
    </>
  )
}
