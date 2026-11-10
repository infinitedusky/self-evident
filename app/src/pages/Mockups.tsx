/**
 * Mockups: the current app's Storybook, inside Self Evident. It is Storybook and says so; the point is not leaving
 * the app to see a page in every state. It is the Storybook of the conversation in front: started in that
 * conversation's worktree, so a story the agent just wrote is there before anything merges (Sandy, 2026-11-09: "we
 * need the screens to match the worktree"); with no conversation, or a branch without a Storybook, the app's own.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCurrentApp } from '../current-app'
import { engine } from '../engine'
import { useCurrentTalk } from '../workspace'

type Status = Awaited<ReturnType<typeof engine.storybook>>

/** `story`: open at this story (its id, like pages-taskpage--sub-task-building) instead of Storybook's front page; `session`: the conversation whose worktree to show (else the one in front). */
export function Mockups({ story, session }: { story?: string; session?: string }) {
  const { app } = useCurrentApp()
  const inFront = useCurrentTalk()
  const talk = session ?? inFront
  const [s, setS] = useState<Status | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setS(null); setError(null)
    if (!app) return
    let gone = false
    const poll = () => engine.storybook(app.id, talk).then((x) => { if (!gone) { setS(x); setError(null) } }).catch((e) => { if (!gone) setError(String(e.message ?? e)) }) // an engine restarting mid-poll is not the page's last word
    void poll()
    const t = window.setInterval(poll, 2000) // until it answers: Storybook takes a few seconds to come up
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id, talk])
  const at = s?.url ? (story ? `${s.url.replace(/\/$/, '')}/?path=/story/${encodeURIComponent(story)}` : s.url) : null
  const start = async () => { if (!app) return; setStarting(true); try { await engine.startStorybook(app.id, talk) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) } }

  return (
    <div className="mockups" data-component="Mockups">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <h1>✏️ Mockups{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every page in every state, from {s?.branch ? <>the Storybook on <code>{s.branch}</code>{s.main ? '' : ', this conversation\'s branch'}</> : 'the app\'s own Storybook'}.</p>
        </div>
        {s?.up && at && <a className="btn quiet" href={at} target="_blank" rel="noreferrer">Open Storybook on its own ↗</a>}
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}
      {s && !s.configured && <div className="empty">{app?.name} has no Storybook set. Add the command that starts it and its URL under <Link to={`/settings/apps/${app?.id}/integrations/storybook`}>Integrations › Storybook</Link>.</div>}
      {s?.configured && !s.up && (
        <div className="empty">
          {s.startable ? <>
            <p style={{ marginTop: 0 }}>Storybook isn't running{s.branch && !s.main ? <> for <code>{s.branch}</code></> : ''}. {s.startedHere ? 'Starting it…' : ''}</p>
            {!s.startedHere && <button className="btn" disabled={starting} onClick={start}>Start Storybook</button>}
            {s.log.length > 0 && <pre className="sb-log">{s.log.slice(-8).join('\n')}</pre>}
          </> : <>Storybook isn't answering at <code>{s.url}</code>, and there's no command to start it. Add one under <Link to={`/settings/apps/${app?.id}/integrations/storybook`}>Integrations › Storybook</Link>.</>}
        </div>
      )}
      {s?.up && at && <iframe className="sb-frame" src={at} title={`${app?.name} Storybook`} />}
    </div>
  )
}
