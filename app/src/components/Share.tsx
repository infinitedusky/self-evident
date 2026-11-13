/**
 * Share what is in the viewer with someone outside: "take a look at this and tell me what you think" (Sandy,
 * 2026-11-13). One button beside Detach; it opens a small panel that says what sharing does before it does it, makes
 * the public address, and then holds the link to copy and the way to stop. While something is shared the button says
 * so, in the warning colour, so a public address is never out of sight.
 *
 * After Vercel's preview link (a link to send for a look) and VS Code's forwarded ports (public, listed, each with a stop).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API, engine, openEvents, type Guide, type NgrokHolder, type ShareKind, type Shared } from '../engine'

const NAME: Record<ShareKind, { it: string; ends: string }> = {
  prototype: { it: 'this prototype', ends: 'the prototype is stopped' },
  storybook: { it: 'these mockups', ends: 'Storybook stops' },
  sketch: { it: 'these sketches', ends: 'you stop it' },
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
type Problem = { error: string; code?: string; holders?: NgrokHolder[] }
const problemOf = (e: any): Problem => { const m = String(e?.message ?? e); try { const j = JSON.parse(m); return { error: String(j.error ?? m), code: j.code, holders: j.holders } } catch { return { error: m } } }
const said = (e: any) => problemOf(e).error

export function Share({ kind, id, appId, open: startOpen = false }: { kind: ShareKind; /** The prototype's id, or the conversation's (or app's) whose mockups or sketches these are. */ id: string; appId?: string; /** For a story: start with the panel open. */ open?: boolean }) {
  const [share, setShare] = useState<Shared | null>(null)
  const [open, setOpen] = useState(startOpen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [held, setHeld] = useState<NgrokHolder[] | null>(null) // ngrok's one address is taken, by these on this computer
  const [guide, setGuide] = useState<Guide | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const refresh = useCallback(() => engine.shared(kind, id).then(setShare).catch(() => {}), [kind, id])
  useEffect(() => { void refresh() }, [refresh])
  // A shared prototype shows whoever opens it a small guide: what the agent wrote for them, if anything yet.
  useEffect(() => { if (kind === 'prototype' && open) engine.prototype(id).then((p) => setGuide(p.guide ?? null)).catch(() => setGuide(null)) }, [kind, id, open])
  // It ends by itself (its time is up, the thing it shows stopped) or someone starts it elsewhere: say so here too.
  useEffect(() => {
    if (!appId) return
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const on = (ev: MessageEvent) => { const p = (JSON.parse(ev.data) as { payload?: { kind?: string; id?: string } }).payload; if (p?.kind === kind && p.id === id) void refresh() }
    es.addEventListener('share.started', on as EventListener); es.addEventListener('share.stopped', on as EventListener)
    return () => es.close()
  }, [appId, kind, id, refresh])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); setHeld(null); try { await fn() } catch (e) { const p = problemOf(e); setError(p.error); if (p.code === 'ngrok_busy') setHeld(p.holders ?? []) } finally { setBusy(false) } }
  const make = (freeNgrok = false) => act(async () => setShare(await engine.share(kind, id, freeNgrok ? { freeNgrok: true } : {})))
  const steps = guide?.steps ?? []
  const guideLine = kind !== 'prototype' || guide === undefined ? null : (
    <div className="share-guide">
      <strong>What they are shown</strong>
      {steps.length || guide?.intro
        ? <><p className="faint">A tab at the bottom right of the prototype, with a box for what they think (it comes back as a comment on the task).{guide?.intro ? ` It opens with: “${guide.intro}”` : ''}</p>{steps.length > 0 && <ol>{steps.map((s, n) => <li key={n}>{s.title}{s.path && <span className="faint mono"> {s.path}</span>}</li>)}</ol>}</>
        : <p className="faint">A tab at the bottom right with a box for what they think, but no guide yet. Ask the agent to write one: where to go and what to try.</p>}
    </div>
  )
  const copy = () => { if (!share) return; void navigator.clipboard?.writeText(share.url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => setError('Could not copy it: select the link and copy it by hand.')) }
  return (
    <div className="share" ref={box} data-component="Share">
      <button className={`btn quiet small ${share ? 'share-on' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title={share ? `Public at ${share.url} until ${clock(share.expiresAt)}` : 'Make a public link to send to someone for a look'}>{share ? '● Shared' : 'Share…'}</button>
      {open && (
        <div className="share-panel" role="dialog" aria-label="Share">
          {share ? <>
            <strong>Anyone with this link can open {NAME[kind].it}</strong>
            <div className="share-link"><input className="mono" readOnly value={share.url} aria-label="The public link" onFocus={(e) => e.target.select()} /><button className="btn small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
            <p className="faint">Public since {clock(share.since)}. It ends at {clock(share.expiresAt)}, or sooner when {NAME[kind].ends}.{kind === 'prototype' ? ' They use it with the sample data that is in it now, and what they do there changes it for everyone.' : ''}</p>
            {share.via === 'ngrok' && <p className="faint">Through ngrok, since this network blocks Cloudflare's tunnel. On a free ngrok account the visitor sees ngrok's notice first and presses Visit Site, and only one thing can be shared at a time.</p>}
            <button className="btn quiet small" disabled={busy} onClick={() => void act(async () => { await engine.unshare(kind, id); setShare(null) })}>Stop sharing</button>
          </> : <>
            <strong>Share {NAME[kind].it} for a look</strong>
            <p className="faint">This makes a public link to it, running on this computer. Anyone who has the link can open it{kind === 'prototype' ? ', with the sample data in it' : ''}; no sign-in. It ends when you stop it, when {NAME[kind].ends}, or after 8 hours. This computer has to stay on and awake.</p>
            <button className="btn small" disabled={busy} onClick={() => void make()}>{busy ? 'Making the link…' : 'Make the link'}</button>
            {busy && <span className="faint"> It takes a few seconds; longer the first time on a network that blocks one tunnel, while it tries the other.</span>}
          </>}
          {guideLine}
          {error && <div className="empty bad" role="alert">{error}</div>}
          {held && !share && (held.length > 0 ? (
            <div className="share-free">
              <p>On this computer, ngrok is in use by: {held.map((h, n) => <span key={h.pid}>{n ? '; ' : ''}<span className="mono">ngrok {h.what}</span>{h.service ? <> (the service <span className="mono">{h.service}</span>)</> : null}</span>)}.</p>
              <p className="faint">Freeing it stops {held.length === 1 ? 'that tunnel' : 'those tunnels'}: whatever {held.length === 1 ? 'it serves' : 'they serve'} stops being reachable from outside. {held.some((h) => h.service) ? 'A service is put back when you stop sharing; ' : ''}{held.some((h) => !h.service) ? 'a tunnel started by hand is not started again.' : ''}</p>
              <button className="btn small" disabled={busy} onClick={() => void make(true)}>{busy ? 'Freeing ngrok…' : 'Free up ngrok and make the link'}</button>
            </div>
          ) : <p className="faint">Nothing on this computer is using ngrok, so the tunnel holding its address is on another one. Stop it there, then make the link.</p>)}
        </div>
      )}
    </div>
  )
}
