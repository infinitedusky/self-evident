/**
 * The app running, in a tab: its dev server in a frame with an address bar, reload, device widths and a way out to
 * a real browser tab. After Replit's preview pane. Where it runs is the app's preview address in Settings.
 */
import { useState } from 'react'
import { useCurrentApp } from '../current-app'
import { useWorkspace } from '../workspace'

const DEVICES = [{ id: 'desktop', label: 'Desktop', width: null }, { id: 'tablet', label: 'Tablet', width: 768 }, { id: 'phone', label: 'Phone', width: 390 }] as const

export function PreviewPane({ path = '/', onNavigate }: { path?: string; onNavigate?: (path: string) => void }) {
  const { app } = useCurrentApp()
  const ws = useWorkspace()
  const base = app?.setup?.preview_url?.replace(/\/$/, '')
  const [at, setAt] = useState(path)
  const [typed, setTyped] = useState(path)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const [reloads, setReloads] = useState(0)
  if (!base) return (
    <div className="preview-empty" data-component="PreviewPane">
      <div className="big" aria-hidden="true">🖥️</div>
      <h3>Nothing to preview yet</h3>
      <p className="muted">Give the address {app?.name ?? 'this app'}'s dev server runs on (like http://localhost:3000) in its settings, and it shows here.</p>
      {app && ws && <button className="btn quiet" onClick={() => ws.open({ kind: 'page', path: `/settings/apps/${app.id}` })}>Open its settings</button>}
    </div>
  )
  const go = (p: string) => { const next = p.startsWith('/') ? p : `/${p}`; setAt(next); setTyped(next); onNavigate?.(next) }
  const width = DEVICES.find((d) => d.id === device)?.width
  return (
    <div className="preview" data-component="PreviewPane">
      <div className="preview-bar">
        <button className="icon-btn" onClick={() => setReloads((n) => n + 1)} title="Reload" aria-label="Reload">↻</button>
        <form className="preview-address" onSubmit={(e) => { e.preventDefault(); go(typed) }}>
          <span className="faint mono">{base}</span>
          <input className="mono" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Path" />
        </form>
        <div className="seg" role="group" aria-label="Device">
          {DEVICES.map((d) => <button key={d.id} className={device === d.id ? 'on' : ''} onClick={() => setDevice(d.id)} title={d.width ? `${d.width}px wide` : 'Full width'}>{d.label}</button>)}
        </div>
        <a className="icon-btn" href={base + at} target="_blank" rel="noreferrer" title="Open in a browser tab" aria-label="Open in a browser tab">↗</a>
      </div>
      <div className="preview-stage">
        <iframe key={`${at}#${reloads}`} src={base + at} title={`${app?.name} preview`} style={width ? { width, maxWidth: '100%' } : undefined} />
      </div>
    </div>
  )
}
