/**
 * The app's main, running: what is there today, to look at beside what is being made (Sandy, 2026-11-19: "there's
 * always the current main that we need to see … really important to have as a comp when we're building"). One per
 * app, in a tab of its own; the person turns it on and off, and it turns itself off when nobody has looked for a
 * while. For an app that is deployed where the person can look, it is that address. The same frame as a prototype's
 * (after Replit's preview pane), with a browser's back, forward, reload and address.
 */
import { useEffect, useState } from 'react'
import { useCurrentApp } from '../current-app'
import { useMain } from '../main-running'
import { useWorkspace } from '../workspace'
import { Nav, useTrail } from './Trail'

const DEVICES = [{ id: 'desktop', label: 'Desktop', width: null }, { id: 'tablet', label: 'Tablet', width: 768 }, { id: 'phone', label: 'Phone', width: 390 }] as const

export function MainPane({ path = '/', onNavigate }: { path?: string; onNavigate?: (path: string) => void }) {
  const { app } = useCurrentApp()
  const ws = useWorkspace()
  const { main, error, busy, start, update, stop } = useMain(app?.id, true)
  const t = useTrail()
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const base = main?.url?.replace(/\/$/, '') ?? ''
  useEffect(() => { if (base && t.at?.startsWith(base)) onNavigate?.(t.at.slice(base.length) || '/') }, [t.at])
  const name = app?.name ?? 'This app'

  if (!main) return <div className="tab-page" data-component="MainPane">{error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>}</div>
  if (main.how === 'none') return (
    <div className="preview-empty" data-component="MainPane">
      <h3>{name}'s main</h3>
      <p className="muted">It can't be shown yet: {name} has no command to start it, and no address it is deployed at. Its agent works the command out the first time a prototype is made, or you can tell the agent where main is deployed.</p>
      {ws && <button className="btn quiet" onClick={() => ws.open({ kind: 'page', path: '/settings' })}>Settings →</button>}
    </div>
  )
  if (!main.running || !main.up || !main.url) return (
    <div className="preview-empty" data-component="MainPane">
      <h3>{name}'s main</h3>
      <p className="muted">{main.running ? 'Turning it on…' : `What is on ${main.branch} today, to look at beside what you are making. It is off.`}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {!main.running && <button className="btn" disabled={busy} onClick={() => void start()}>{busy ? 'Turning it on…' : 'Turn it on'}</button>}
        {main.running && <button className="btn quiet" disabled={busy} onClick={() => void stop()}>Turn it off</button>}
      </div>
      {!main.running && main.idleMinutes ? <p className="faint">It turns itself off after {main.idleMinutes} minutes with nobody looking.</p> : null}
      {error && <p className="bad" role="alert">{error}</p>}
      {!!main.log.length && <pre className="proto-log mono">{main.log.slice(-12).join('\n')}</pre>}
    </div>
  )
  const src = t.at ?? base + path
  const width = DEVICES.find((d) => d.id === device)?.width
  const local = main.how === 'local'
  return (
    <div className="preview" data-component="MainPane">
      {main.behind && <p className="smoke-stale" role="note" style={{ margin: '0 0 8px' }}>{main.branch} has moved on since this was turned on. <button className="btn quiet small" disabled={busy} onClick={() => void update()}>{busy ? 'Updating…' : 'Update'}</button></p>}
      {error && <p className="smoke-stale" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}
      <div className="preview-bar">
        <Nav t={t} home={base} src={src} />
        <div className="preview-actions">
          <a className="icon-btn" href={src} target="_blank" rel="noreferrer" title="Open in a browser tab" aria-label="Open in a browser tab">↗</a>
          {local && <button className="icon-btn" disabled={busy} onClick={() => void stop()} title={`Turn it off. It also turns itself off after ${main.idleMinutes} minutes with nobody looking.`} aria-label="Turn it off">■</button>}
        </div>
      </div>
      <div className="preview-bar second">
        <div className="seg" role="group" aria-label="Device">
          {DEVICES.map((d) => <button key={d.id} className={device === d.id ? 'on' : ''} onClick={() => setDevice(d.id)} title={d.width ? `${d.width}px wide` : 'Full width'}>{d.label}</button>)}
        </div>
        <span className="faint">{local ? <>{main.branch}{main.sha ? <> <code>{main.sha.slice(0, 7)}</code></> : null}, with made-up data</> : <>Deployed. If it stays blank, the site does not allow being shown inside another page: open it in a browser tab (↗).</>}</span>
        {main.standIns.length > 0 && (
          <div className="proto-data" role="group" aria-label="Stand-ins">
            <span className="faint">Stands in</span>
            {main.standIns.map((s) => <span key={s.key} className={`badge ${s.running ? 'ok' : 'warn'}`} title={`${s.what ? `${s.what}. ` : ''}${s.running ? `Running at ${s.url}; main is pointed at it.` : 'Not running: turn main off and on to bring it back.'}`}>{s.name}{s.running ? '' : ' · not running'}</span>)}
          </div>
        )}
      </div>
      <div className="preview-stage">
        <iframe key={`${src}#${t.reloads}#${main.sha ?? ''}`} src={src} title={`${name}'s main`} style={width ? { width, maxWidth: '100%' } : undefined} />
      </div>
    </div>
  )
}
