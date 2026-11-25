/**
 * Docs: the current app's docs site, inside Evident (Sandy, 2026-11-24: "the docs would just be in the left nav near my
 * stuff, and … we would just be showing the VitePress page"). The docs are files in the app's workbench folder (a
 * VitePress site under its docs/), so they have their own sidebar, search and diagrams, and they are versioned there.
 * This page starts the site when it is not running and frames it, as Mockups does the app's Storybook; it is the site
 * and nothing is drawn over it.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCurrentApp } from '../current-app'
import { engine, type DocsSite } from '../engine'

const said = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }

export function Docs() {
  const { app } = useCurrentApp()
  const [s, setS] = useState<DocsSite | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setS(null); setError(null)
    if (!app) return
    let gone = false
    const poll = () => engine.docsSite(app.id).then((x) => { if (!gone) setS(x) }).catch((e) => { if (!gone) setError(said(e)) }) // an engine restarting mid-poll is not the page's last word
    void poll()
    const t = window.setInterval(poll, 2000) // until it answers: the site takes a few seconds to come up
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id])
  const start = async () => { if (!app) return; setStarting(true); setError(null); try { setS(await engine.startDocsSite(app.id)) } catch (e) { setError(said(e)) } finally { setStarting(false) } }
  const at = s?.up ? s.frame ?? s.url : null
  const bench = app ? <Link to={`/settings/apps/${app.id}/workbench`}>Settings › Workbench</Link> : null

  return (
    <div className="mockups" data-component="Docs">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <h1>📚 Docs{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>How this app works, as we understand it: the docs site in its workbench folder{s?.dir ? <>, <code>{s.dir}/docs</code></> : ''}.</p>
        </div>
        {at && s?.url && <a className="btn quiet" href={s.url} target="_blank" rel="noreferrer">Open the docs on their own ↗</a>}
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}
      {s && !s.dir && <div className="empty">{app?.name} has no workbench folder. Name one under {bench}: the docs site in it shows here.</div>}
      {s?.dir && !s.found && <div className="empty">There is no folder at <code>{s.dir}</code> on this computer. Change it under {bench}.</div>}
      {s?.found && !s.has && <div className="empty">There is no docs site in <code>{s.dir}</code> yet: a <code>docs/</code> folder with VitePress in it. Make one from the docs template, and it shows here.</div>}
      {s?.has && !s.up && (
        <div className="empty">
          {s.problem ? <p style={{ margin: 0 }}>{s.problem}</p> : <>
            <p style={{ marginTop: 0 }}>The docs site isn't running. {s.startedHere ? 'Starting it…' : ''}</p>
            {!s.startedHere && <button className="btn" disabled={starting} onClick={() => void start()}>Start the docs</button>}
          </>}
          {s.log.length > 0 && <pre className="sb-log">{s.log.slice(-8).join('\n')}</pre>}
        </div>
      )}
      {at && <iframe className="sb-frame" src={at} title={`${app?.name} docs`} />}
    </div>
  )
}
