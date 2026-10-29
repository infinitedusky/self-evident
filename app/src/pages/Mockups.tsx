/**
 * Mockups: the current app's Storybook, inside Self Evident. It is Storybook and says so; the point is not leaving
 * the app to see a page in every state. The engine starts it from the app's checkout when it isn't running.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCurrentApp } from '../current-app'
import { engine } from '../engine'

type Status = Awaited<ReturnType<typeof engine.storybook>>

/** `story`: open at this story (its id, like pages-taskpage--sub-task-building) instead of Storybook's front page. */
export function Mockups({ story }: { story?: string }) {
  const { app } = useCurrentApp()
  const [s, setS] = useState<Status | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setS(null); setError(null)
    if (!app) return
    let gone = false
    const poll = () => engine.storybook(app.id).then((x) => { if (!gone) setS(x) }).catch((e) => setError(String(e.message ?? e)))
    void poll()
    const t = window.setInterval(poll, 2000) // until it answers: Storybook takes a few seconds to come up
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id])
  const at = s?.url ? (story ? `${s.url.replace(/\/$/, '')}/?path=/story/${encodeURIComponent(story)}` : s.url) : null
  const start = async () => { if (!app) return; setStarting(true); try { await engine.startStorybook(app.id) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) } }

  return (
    <div className="mockups" data-component="Mockups">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <h1>✏️ Mockups{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every page in every state, from the app's own Storybook.</p>
        </div>
        {s?.up && at && <a className="btn quiet" href={at} target="_blank" rel="noreferrer">Open Storybook on its own ↗</a>}
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}
      {s && !s.configured && <div className="empty">{app?.name} has no Storybook set. Add its URL and the command that starts it in <Link to="/settings">Settings</Link>.</div>}
      {s?.configured && !s.up && (
        <div className="empty">
          {s.startable ? <>
            <p style={{ marginTop: 0 }}>Storybook isn't running. {s.startedHere ? 'Starting it…' : ''}</p>
            {!s.startedHere && <button className="btn" disabled={starting} onClick={start}>Start Storybook</button>}
            {s.log.length > 0 && <pre className="sb-log">{s.log.slice(-8).join('\n')}</pre>}
          </> : <>Storybook isn't answering at <code>{s.url}</code>, and there's no command to start it. Add one in <Link to="/settings">Settings</Link>.</>}
        </div>
      )}
      {s?.up && at && <iframe className="sb-frame" src={at} title={`${app?.name} Storybook`} />}
    </div>
  )
}
