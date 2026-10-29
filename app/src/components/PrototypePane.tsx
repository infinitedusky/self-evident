/**
 * A prototype, in a tab: the actual thing, built fast in a worktree of its own to use, change in moments and show
 * people, then analysed into the plan and built again from scratch. With an id, its server in a frame with an
 * address bar, reload, device widths and a way out to a browser tab (after Replit's preview pane); without, the
 * app's prototypes. The agent starts them (start_prototype); the engine runs their servers.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type Prototype } from '../engine'
import { useCurrentApp } from '../current-app'
import { useWorkspace } from '../workspace'

const DEVICES = [{ id: 'desktop', label: 'Desktop', width: null }, { id: 'tablet', label: 'Tablet', width: 768 }, { id: 'phone', label: 'Phone', width: 390 }] as const

export function PrototypePane({ id, path = '/', onNavigate }: { id?: string; path?: string; onNavigate?: (path: string) => void }) {
  return id ? <OnePrototype id={id} path={path} onNavigate={onNavigate} /> : <Prototypes />
}

function Prototypes() {
  const { app } = useCurrentApp()
  const ws = useWorkspace()
  const [list, setList] = useState<Prototype[] | null>(null)
  useEffect(() => { if (app) void engine.prototypes(app.id).then(setList).catch(() => setList([])) }, [app?.id])
  if (!list) return <div className="tab-page" data-component="PrototypePane"><p className="muted">Loading…</p></div>
  if (!list.length) return (
    <div className="preview-empty" data-component="PrototypePane">
      <div className="big" aria-hidden="true">🛠️</div>
      <h3>No prototype yet</h3>
      <p className="muted">Ask the agent to prototype an idea. It builds the actual thing fast, in a worktree of its own, with made-up data, so you can use it, change it and show people before anything is planned.</p>
      {!app?.setup?.prototype_cmd && <p className="muted">It works out how {app?.name ?? 'this app'} starts the first time, and asks you to confirm.</p>}
    </div>
  )
  return (
    <div className="tab-page" data-component="PrototypePane">
      <h2>Prototypes</h2>
      <ul className="proto-list">
        {list.map((p) => (
          <li key={p.id}>
            <button className="proto-row" onClick={() => ws?.open({ kind: 'prototype', id: p.id })}>
              <span className="proto-title">{p.title}</span>
              <Badge tone={p.status === 'running' ? 'ok' : 'neutral'} dot={p.status === 'running'}>{p.status === 'running' ? 'Running' : 'Stopped'}</Badge>
              <span className="faint mono">{p.branch}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OnePrototype({ id, path, onNavigate }: { id: string; path: string; onNavigate?: (path: string) => void }) {
  const [p, setP] = useState<Prototype | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => engine.prototype(id).then((x) => { setP(x); setError(null) }).catch((e) => setError(String(e.message ?? e))), [id])
  useEffect(() => { void refresh() }, [refresh])
  // While its server comes up, ask again every second or so.
  const waiting = p?.status === 'running' && !p.up
  useEffect(() => { if (!waiting) return; const t = window.setInterval(() => void refresh(), 1200); return () => window.clearInterval(t) }, [waiting, refresh])
  const act = (fn: (id: string) => Promise<unknown>) => () => fn(id).then(refresh).catch((e) => setError(String(e.message ?? e)))

  if (!p) return <div className="tab-page" data-component="PrototypePane">{error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>}</div>
  if (p.status === 'running' && p.up && p.url) return <Frame p={p} path={path} onNavigate={onNavigate} onStop={act(engine.stopPrototype)} />
  return (
    <div className="preview-empty" data-component="PrototypePane">
      <h3>{p.title}</h3>
      <p className="muted">{p.status === 'discarded' ? 'Discarded.' : p.status === 'running' ? 'Starting its server…' : 'Stopped.'} <span className="mono faint">{p.branch}</span></p>
      {p.status === 'stopped' && <button className="btn" onClick={act(engine.runPrototype)}>Start it</button>}
      {error && <p className="bad">{error}</p>}
      {!!p.log?.length && <pre className="proto-log mono">{p.log.slice(-12).join('\n')}</pre>}
    </div>
  )
}

function Frame({ p, path, onNavigate, onStop }: { p: Prototype; path: string; onNavigate?: (path: string) => void; onStop: () => void }) {
  const base = p.url!.replace(/\/$/, '')
  const [at, setAt] = useState(path)
  const [typed, setTyped] = useState(path)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const [reloads, setReloads] = useState(0)
  const go = (to: string) => { const next = to.startsWith('/') ? to : `/${to}`; setAt(next); setTyped(next); onNavigate?.(next) }
  const width = DEVICES.find((d) => d.id === device)?.width
  return (
    <div className="preview" data-component="PrototypePane">
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
        <button className="icon-btn" onClick={onStop} title="Stop its server" aria-label="Stop its server">■</button>
      </div>
      <div className="preview-stage">
        <iframe key={`${at}#${reloads}`} src={base + at} title={p.title} style={width ? { width, maxWidth: '100%' } : undefined} />
      </div>
    </div>
  )
}
