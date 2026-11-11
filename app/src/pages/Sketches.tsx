/**
 * Sketches: the first look at a screen, fast, right beside the conversation that is making it (Sandy, 2026-11-09:
 * "It has to be right there when we're prompting"). A sketch is a plain HTML file under sketches/ in the
 * conversation's worktree; this frames it from there and reloads it the moment the agent changes the file, so
 * nobody opens a link or switches screens. Widths after the device toolbar in browser dev tools and Storybook's
 * viewport switch: phone, tablet, the whole pane. The way on is the story: Mockups.
 */
import { useEffect, useState } from 'react'
import { useCurrentApp } from '../current-app'
import { API, engine } from '../engine'
import { useCurrentTalk, useWorkspace } from '../workspace'

type List = Awaited<ReturnType<typeof engine.sketches>>
const WIDTHS = [{ key: 'phone', label: 'Phone', px: 390 }, { key: 'tablet', label: 'Tablet', px: 820 }, { key: 'full', label: 'Full', px: null }] as const

/** `file`: the sketch to show (else the one changed last); `session`: the conversation whose worktree to read (else the one in front). */
export function Sketches({ file, session, embedded }: { file?: string; session?: string; /** Inside a page with its own heading: only the controls. */ embedded?: boolean }) {
  const { app } = useCurrentApp()
  const ws = useWorkspace()
  const talk = useCurrentTalk()
  const scope = session ?? talk ?? app?.id ?? null
  const [list, setList] = useState<List | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(file ?? null)
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['key']>('full') // the whole pane first (Sandy, 2026-11-10: "make the full the default"); Phone and Tablet narrow it
  useEffect(() => { if (file) setPicked(file) }, [file])
  useEffect(() => {
    setList(null); setError(null)
    if (!scope) return
    let gone = false
    const poll = () => engine.sketches(scope).then((x) => { if (!gone) { setList(x); setError(null) } }).catch((e) => { if (!gone) setError(String(e.message ?? e)) })
    void poll()
    const t = window.setInterval(poll, 1500) // a changed file shows by itself
    return () => { gone = true; window.clearInterval(t) }
  }, [scope])
  const shown = list?.sketches.find((s) => s.file === picked) ?? list?.sketches[0] ?? null
  const px = WIDTHS.find((w) => w.key === width)!.px
  const src = shown && scope ? `${API}/sketches/${scope}/file/${shown.file.split('/').map(encodeURIComponent).join('/')}` : null

  return (
    <div className="mockups sketches" data-component="Sketches">
      <div className="page-head" style={{ marginBottom: 10 }}>
        {embedded ? <span /> : <div>
          <h1>✏️ Sketches{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            The first look, fast: plain HTML from <code>sketches/</code>{list?.branch && <> on <code>{list.branch}</code>{list.main ? '' : ', this conversation\'s branch'}</>}. It reloads when the file changes.
          </p>
        </div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {shown && <div className="seg" role="group" aria-label="Width">{WIDTHS.map((w) => <button key={w.key} className={w.key === width ? 'on' : ''} onClick={() => setWidth(w.key)}>{w.label}</button>)}</div>}
          {!embedded && ws && <button className="btn quiet" onClick={() => ws.open({ kind: 'storybook', session })}>Mockups →</button>}
        </div>
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!scope && <div className="empty">Pick an app in the nav.</div>}
      {list && list.sketches.length > 1 && (
        <div className="filters">{list.sketches.map((s) => <button key={s.file} className={`filter ${s.file === shown?.file ? 'active' : ''}`} onClick={() => setPicked(s.file)}>{s.file}</button>)}</div>
      )}
      {list && !list.sketches.length && (
        <div className="empty">
          <p style={{ marginTop: 0 }}>No sketches{list.branch ? <> on <code>{list.branch}</code></> : ''} yet.</p>
          <p className="muted" style={{ marginBottom: 0 }}>Ask the agent to sketch a screen: it writes one HTML file per screen and shows it here. When you like it, it becomes a story under Mockups.</p>
        </div>
      )}
      {src && shown && (
        <div className="sketch-stage">
          <iframe key={`${shown.file}:${shown.changedAt}`} className="sb-frame sketch-frame" style={px ? { width: px, maxWidth: '100%' } : undefined} src={src} title={`Sketch ${shown.file}`} sandbox="allow-scripts allow-forms" />
        </div>
      )}
    </div>
  )
}
