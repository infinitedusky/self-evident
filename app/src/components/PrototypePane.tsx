/**
 * A prototype, in a tab: the actual thing, built fast in a worktree of its own to use, change in moments and show
 * people, then analysed into the plan and built again from scratch. With an id, its server in a frame with an
 * address bar, reload, device widths and a way out to a browser tab (after Replit's preview pane); without, the
 * app's prototypes. The agent starts them (start_prototype); the engine runs their servers; each has a conversation
 * of its own that builds it, which 💬 brings to the agent's column.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge } from './Badge'
import { openEvents, API, engine, type Prototype } from '../engine'
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
  // Started, stopped or restarted by anyone (the agent, after a change): show it as it is now.
  const appId = p?.appId
  useEffect(() => {
    if (!appId) return
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const onEvent = (ev: MessageEvent) => { if ((JSON.parse(ev.data) as { payload?: { prototypeId?: string } }).payload?.prototypeId === id) void refresh() }
    for (const type of ['prototype.started', 'prototype.stopped', 'prototype.discarded']) es.addEventListener(type, onEvent as EventListener)
    return () => es.close()
  }, [appId, id, refresh])
  // While its server comes up, ask again every second or so.
  const waiting = p?.status === 'running' && !p.up
  useEffect(() => { if (!waiting) return; const t = window.setInterval(() => void refresh(), 1200); return () => window.clearInterval(t) }, [waiting, refresh])
  const act = (fn: (id: string) => Promise<unknown>) => () => fn(id).then(refresh).catch((e) => setError(String(e.message ?? e)))
  const talk = () => void engine.prototypeTalk(id).catch((e) => setError(String(e.message ?? e)))

  if (!p) return <div className="tab-page" data-component="PrototypePane">{error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>}</div>
  if (p.status === 'running' && p.up && p.url) return <Frame p={p} path={path} onNavigate={onNavigate} onStop={act(engine.stopPrototype)} onRestart={act(engine.restartPrototype)} onTalk={talk} data={<Data p={p} onDone={refresh} />} />
  return (
    <div className="preview-empty" data-component="PrototypePane">
      <h3>{p.title}</h3>
      <p className="muted">{p.status === 'discarded' ? 'Discarded.' : p.status === 'running' ? 'Starting its server…' : 'Stopped.'} <span className="mono faint">{p.branch}</span></p>
      <div style={{ display: 'flex', gap: 6 }}>
        {p.status === 'stopped' && <button className="btn" onClick={act(engine.runPrototype)}>Start it</button>}
        {p.status !== 'discarded' && <button className="btn quiet" onClick={talk}>Talk about it</button>}
      </div>
      {error && <p className="bad">{error}</p>}
      {!!p.log?.length && <pre className="proto-log mono">{p.log.slice(-12).join('\n')}</pre>}
    </div>
  )
}

function Frame({ p, path, onNavigate, onStop, onRestart, onTalk, data }: { p: Prototype; path: string; onNavigate?: (path: string) => void; onStop: () => void; onRestart: () => void; onTalk: () => void; data: React.ReactNode }) {
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
        {data}
        <a className="icon-btn" href={base + at} target="_blank" rel="noreferrer" title="Open in a browser tab" aria-label="Open in a browser tab">↗</a>
        <button className="icon-btn" onClick={onTalk} title="Its conversation, in the agent's column" aria-label="Talk about it">💬</button>
        <button className="icon-btn" onClick={onRestart} title="Restart its server" aria-label="Restart its server">⟲</button>
        <button className="icon-btn" onClick={onStop} title="Stop its server" aria-label="Stop its server">■</button>
      </div>
      <div className="preview-stage">
        <iframe key={`${at}#${reloads}#${p.updatedAt ?? ''}`} /* a restart reloads it */ src={base + at} title={p.title} style={width ? { width, maxWidth: '100%' } : undefined} />
      </div>
    </div>
  )
}

/**
 * Its made-up data: which scenario its throwaway database was built from, a way to build it again from another (or
 * the same, to undo what was done in it), and to keep the data as it is now as a new scenario.
 */
function Data({ p, onDone }: { p: Prototype; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (!p.database) return null
  const run = (label: string, fn: () => Promise<unknown>) => { setBusy(label); setProblem(null); fn().then(onDone).catch((e) => setProblem(String(e.message ?? e))).finally(() => setBusy(null)) }
  const reset = (scenario: string | null) => run('Rebuilding…', () => engine.resetPrototypeData(p.id, scenario))
  const save = (name: string) => { setNaming(false); if (name.trim()) run('Saving…', () => engine.savePrototypeData(p.id, name.trim())) }
  return (
    <div className="proto-data" title={problem ?? `Its own database, ${p.database}, with made-up data`}>
      <span className="faint">Made-up data</span>
      {naming
        ? <input autoFocus className="mono" placeholder="name, like empty-cart" aria-label="Scenario name" onBlur={(e) => save(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save((e.target as HTMLInputElement).value); if (e.key === 'Escape') setNaming(false) }} />
        : <select value={p.scenario ?? ''} disabled={!!busy} onChange={(e) => reset(e.target.value || null)} aria-label="Scenario">
            {(p.scenarios ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="">empty</option>
          </select>}
      <button className="icon-btn" disabled={!!busy} onClick={() => reset(p.scenario)} title="Build it again from this scenario" aria-label="Reset the data">↺</button>
      <button className="icon-btn" disabled={!!busy} onClick={() => setNaming(true)} title="Keep the data as it is now, as a scenario" aria-label="Save the data">⤓</button>
      {busy && <span className="faint">{busy}</span>}
      {problem && <span className="bad" role="alert">!</span>}
    </div>
  )
}
