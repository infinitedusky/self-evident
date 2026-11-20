/**
 * A prototype, in a tab: the thing built the way we would ship it, in a worktree of its own, to show that it works;
 * then analysed into the plan (it is not merged). With an id, its server in a frame with an
 * address bar, reload, device widths and a way out to a browser tab (after Replit's preview pane); without, the
 * app's prototypes. The agent starts them (start_prototype); the engine runs their servers; each has a conversation
 * of its own that builds it, which 💬 brings to the agent's column.
 */
import { PrototypeGuide } from './PrototypeGuide'
import { GuideRuns } from './GuideRun'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from './Badge'
import { openEvents, API, engine, type Prototype } from '../engine'
import { useCurrentApp } from '../current-app'
import { useWorkspace } from '../workspace'
import { Nav, useTrail } from './Trail'
import { useMain } from '../main-running'

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
      <p className="muted">Ask the agent to prototype an idea. It builds it the way it would ship, in a worktree of its own, with only what is outside the app stood in for, so you can see it work end to end before anything is planned.</p>
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
              <span className="proto-title">{p.title}</span>{p.depth === 'rough' && <Badge>rough</Badge>}
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
  if (p.status === 'running' && p.up && p.url) return <Frame p={p} path={path} onNavigate={onNavigate} onStop={act(engine.stopPrototype)} onRestart={act(engine.restartPrototype)} onTalk={talk} data={<><StandIns p={p} /><Data p={p} onDone={refresh} />{error && <span className="bad" role="alert">{error}</span>}</>} />
  // Nothing to open, but its guide has commands: it is tried by running them, so they are the page.
  if (p.status !== 'discarded' && p.guide?.steps.some((s) => s.run)) return (
    <div className="tab-page preview-runs" data-component="PrototypePane">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{p.title}</h2>
        <span className="mono faint">{p.branch}</span>
        <button className="btn quiet small" style={{ marginLeft: 'auto' }} onClick={talk}>Talk about it</button>
        {p.status === 'stopped' && p.guide.steps.some((s) => s.path) && <button className="btn quiet small" onClick={act(engine.runPrototype)} title="Some steps are pages: they need its server">Start its server</button>}
      </div>
      <p className="faint" style={{ margin: '4px 0 14px' }}>{p.status === 'running' ? 'Starting its server…' : 'It has no screen to open: it is tried by running these.'}</p>
      {error && <div className="empty bad">{error}</div>}
      <GuideRuns id={p.id} guide={p.guide} />
    </div>
  )
  return (
    <div className="preview-empty" data-component="PrototypePane">
      <h3>{p.title}</h3>
      <p className="muted">{p.status === 'discarded' ? 'Discarded.' : p.status === 'running' ? 'Starting its server…' : p.notStarted ? 'Its agent is setting it up, and starts it when there is something to see.' : 'Stopped.'} <span className="mono faint">{p.branch}</span></p>
      <div style={{ display: 'flex', gap: 6 }}>
        {p.status === 'stopped' && <button className={p.notStarted ? 'btn quiet' : 'btn'} onClick={act(engine.runPrototype)}>{p.notStarted ? 'Start it now' : 'Start it'}</button>}
        {p.status !== 'discarded' && <button className="btn quiet" onClick={talk}>Talk about it</button>}
      </div>
      {error && <p className="bad">{error}</p>}
      {!!p.log?.length && <pre className="proto-log mono">{p.log.slice(-12).join('\n')}</pre>}
    </div>
  )
}

function Frame({ p, path, onNavigate, onStop, onRestart, onTalk, data }: { p: Prototype; path: string; onNavigate?: (path: string) => void; onStop: () => void; onRestart: () => void; onTalk: () => void; data: React.ReactNode }) {
  // Compare is a main of the task's own, on a port of its own, beside it at the same place (Sandy, 2026-11-20: "compare with main should
  // be a new port … there should only be one per task"). The task's smoke test shares it; the app's own main is left as it is.
  const [comparing, setComparing] = useState(false)
  const { main, error: mainError, busy: asking, start, stop: stopMain } = useMain(p.appId, comparing, p.issueId ?? p.id)
  const cmp = comparing && main?.running && main.url ? { url: main.url, up: main.up, sha: main.sha, log: main.log, branch: main.branch } : null
  const cmpBase = cmp?.url.replace(/\/$/, '') ?? ''
  useEffect(() => { if (comparing && main && !main.running && !asking) setComparing(false) }, [comparing, main?.running, asking]) // turned off elsewhere, or by itself
  const compare = () => { setComparing(true); void start().then((m) => { if (!m?.running) setComparing(false) }) }
  const base = p.url!.replace(/\/$/, '')
  // Each view goes its own way (Sandy, 2026-11-19: "we need the browser address and back forward and refresh for both the proto and the compared main").
  const mine = useTrail(), theirs = useTrail()
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const [away, setAway] = useState(false) // main is in a browser tab of its own
  const src = mine.at ?? base + path
  const at = src.startsWith(base) ? src.slice(base.length) || '/' : path // the prototype's own path, for its guide and its tab
  const mainSrc = theirs.at ?? cmpBase + path
  useEffect(() => { if (mine.at?.startsWith(base)) onNavigate?.(mine.at.slice(base.length) || '/') }, [mine.at])
  useEffect(() => { if (!cmp) { setAway(false); theirs.setAt(null) } }, [!!cmp])
  /** A step of its guide: both views go there. */
  const go = (to: string) => { const next = to.startsWith('/') ? to : `/${to}`; mine.setAt(base + next); if (cmp) theirs.setAt(cmpBase + next) }
  /** Main's own tab, detached: Self Evident's page around it, so it still counts as being looked at. */
  const detachMain = () => { window.open(`${window.location.origin}/view?tab=${encodeURIComponent(JSON.stringify({ kind: 'main', path: mainSrc.startsWith(cmpBase) ? mainSrc.slice(cmpBase.length) || '/' : '/' }))}`, '_blank'); setAway(true) }
  const width = DEVICES.find((d) => d.id === device)?.width
  const sized = width ? { width, maxWidth: '100%' } : undefined
  const pair = !!cmp && !away
  return (
    <div className="preview" data-component="PrototypePane">
      {p.guideNote ? <p className="smoke-stale" role="note" style={{ margin: '0 0 8px' }}>{p.guideNote}</p> : null}
      {p.strayPorts?.length ? <p className="smoke-stale" role="note" style={{ margin: '0 0 8px' }}>{p.strayNote ?? `It also listens on ${p.strayPorts.join(', ')}, which it chose itself.`}</p> : null}
      {/* Two rows (Sandy, 2026-11-13: "the header is too crowded… we need a second row"): where it is and its server, then how it is shown. */}
      <div className="preview-bar">
        {pair ? <span className="faint">Side by side with main</span> : <Nav t={mine} home={base} src={src} />}
        <div className="preview-actions">
          <a className="icon-btn" href={src} target="_blank" rel="noreferrer" title="Open in a browser tab" aria-label="Open in a browser tab">↗</a>
          <button className="icon-btn" onClick={onTalk} title="Its conversation, in the agent's column" aria-label="Talk about it">💬</button>
          <button className="icon-btn" onClick={onRestart} title="Restart its server" aria-label="Restart its server">⟲</button>
          <button className="icon-btn" onClick={onStop} title="Stop its server" aria-label="Stop its server">■</button>
        </div>
      </div>
      <div className="preview-bar second">
        <div className="seg" role="group" aria-label="Device">
          {DEVICES.map((d) => <button key={d.id} className={device === d.id ? 'on' : ''} onClick={() => setDevice(d.id)} title={d.width ? `${d.width}px wide` : 'Full width'}>{d.label}</button>)}
        </div>
        {/* Main beside it (after the smoke test's own Compare with main): two views, each with a bar of its own. */}
        {cmp ? <button className="btn quiet small" onClick={() => { setComparing(false); void stopMain() }} title="Turns this task's main off. The app's own main is not touched.">Stop comparing</button>
          : main && main.how !== 'none' ? <button className="btn quiet small" disabled={asking} title="Main beside it, at the same place: a copy of this task's own, on its own port. The app's main is left as it is." onClick={compare}>{asking ? 'Turning main on…' : 'Compare with main'}</button> : null}
        {mainError && <span className="bad" role="alert">{mainError}</span>}
        {cmp && away && <><span className="faint">main is in a browser tab of its own</span><button className="btn quiet small" onClick={() => setAway(false)}>Put main back</button></>}
        {data}
      </div>
      <div className="preview-stage">
        {pair
          ? <div className="preview-pair">
              <figure aria-label="This prototype">
                <figcaption><span>This prototype</span><Nav t={mine} home={base} src={src} of="prototype" /></figcaption>
                <iframe key={`${src}#${mine.reloads}#${p.updatedAt ?? ''}`} src={src} title={p.title} style={sized} />
              </figure>
              <figure aria-label="main">
                <figcaption><span>{cmp!.branch}{cmp!.sha ? <> <code>{cmp!.sha.slice(0, 7)}</code></> : null}</span>{cmp!.up && <><Nav t={theirs} home={cmpBase} src={mainSrc} of="main" /><button className="btn quiet small" onClick={detachMain} title="Open main in a browser tab of its own, and give the prototype the room">↗ Detach</button></>}</figcaption>
                {cmp!.up
                  ? <iframe key={`${mainSrc}#${theirs.reloads}`} src={mainSrc} title="main" style={sized} />
                  : <div className="empty">Turning main on… {cmp!.log.length > 0 && <pre className="proto-log mono">{cmp!.log.slice(-6).join('\n')}</pre>}</div>}
              </figure>
            </div>
          : <iframe key={`${src}#${mine.reloads}#${p.updatedAt ?? ''}`} /* a restart reloads it */ src={src} title={p.title} style={sized} />}
        <PrototypeGuide id={p.id} guide={p.guide} at={at} onGo={go} />
      </div>
    </div>
  )
}

/**
 * What it runs in place of what is outside the system (a vendor's API): each stand-in by name, and whether it is up.
 * They start and stop with the prototype; its agent sets them. A reading line: nothing to press. After a status page's
 * row of services, each with a dot.
 */
function StandIns({ p }: { p: Prototype }) {
  const list = p.standIns ?? []
  if (!list.length) return null
  return (
    <div className="proto-data" role="group" aria-label="Stand-ins">
      <span className="faint">Stands in</span>
      {list.map((s) => <span key={s.key} className={`badge ${s.running ? 'ok' : 'warn'}`} title={`${s.what ? `${s.what}. ` : ''}${s.running ? `Running at ${s.url}; the prototype is pointed at it.` : 'Not running: restart the prototype to bring it back.'}`}>{s.name}{s.running ? '' : ' · not running'}</span>)}
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
  // What ↺ builds from: the scenario it is on; with none, one that was kept ("default" first), since an empty rebuild makes new ids and the guide's links stop opening.
  const again = p.scenario ?? ((p.scenarios ?? []).includes('default') ? 'default' : (p.scenarios ?? [])[0]) ?? null
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
      <button className="icon-btn" disabled={!!busy} onClick={() => reset(again)} title={again ? `Build it again from the scenario "${again}"` : 'Build it again, empty: nothing has been kept as a scenario yet. Keep the data first (⤓) and its ids stay the same'} aria-label="Reset the data">↺</button>
      <button className="icon-btn" disabled={!!busy} onClick={() => setNaming(true)} title="Keep the data as it is now, as a scenario" aria-label="Save the data">⤓</button>
      {busy && <span className="faint">{busy}</span>}
      {problem && <span className="bad" role="alert">!</span>}
    </div>
  )
}
