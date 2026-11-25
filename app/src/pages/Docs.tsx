/**
 * Docs: the current app's docs site, inside Evident (Sandy, 2026-11-24: "the docs would just be in the left nav near my
 * stuff, and … we would just be showing the VitePress page"). The docs are files in the app's workbench folder (a
 * VitePress site under its docs/), so they have their own sidebar, search and diagrams, and they are versioned there.
 * This page starts the site when it is not running and frames it, as Mockups does the app's Storybook; it is the site
 * and nothing is drawn over it.
 *
 * The docs are written by one agent, the app's docs agent (Sandy, 2026-11-25: "we should have a subagent manages the
 * docs"; engine docs-agent.ts), in two sections: How the system works, and Our work. The page says how much is in
 * each and what the agent last did; its conversation opens beside the docs, to ask for a page or a correction.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCurrentApp } from '../current-app'
import { Conversation } from '../components/Conversation'
import { engine, type DocsAgent, type DocsSite } from '../engine'

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
const when = (at: string) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** What the docs hold and what their agent last did, in a line; and what its check refused, when it did. */
function AgentLine({ d }: { d: DocsAgent }) {
  const none = !d.pages.system && !d.pages.work
  return (
    <div data-component="DocsAgentLine">
      <p className="muted" style={{ margin: '4px 0 0' }}>
        {none ? 'Nothing is written yet in How the system works or Our work. ' : `${n(d.pages.system, 'page')} in How the system works, ${d.pages.work} in Our work. `}
        {d.busy ? <>The docs agent is writing{d.asked?.label ? <>: {d.asked.label}</> : null}.</>
          : d.wrote && !d.wrote.problems.length ? <>The docs agent last wrote {when(d.wrote.at)}{d.asked?.label ? <> ({d.asked.label})</> : null}: {n(d.wrote.files.length, 'page')}{d.wrote.commit ? <>, committed as <code>{d.wrote.commit}</code></> : ', not committed: the folder is not a git repository'}.</>
          : !d.wrote && d.asked ? <>The docs agent was last asked {when(d.asked.at)} ({d.asked.label}).</>
          : !d.wrote ? 'They are added to when the codebase is learned and when a task is closed, or ask the docs agent.' : null}
      </p>
      {!d.busy && d.wrote && d.wrote.problems.length > 0 && (
        <div className="empty bad" style={{ marginTop: 8, textAlign: 'left' }}>
          <p style={{ margin: 0 }}>The docs agent's last pages did not pass their check and are not committed. They are in the folder as it left them; ask it to put this right:</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{d.wrote.problems.map((p, i) => <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

/** The docs agent, beside the docs: its conversation, or one box when it has never been asked. */
function AgentPanel({ appId, d, onChanged }: { appId: string; d: DocsAgent; onChanged: (d?: DocsAgent) => void }) {
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ask = async () => { setAsking(true); setError(null); try { onChanged(await engine.askDocsAgent(appId, text)); setText('') } catch (e) { setError(said(e)) } finally { setAsking(false) } }
  return (
    <aside className="panel docs-agent" data-component="DocsAgent" aria-label="The docs agent">
      <h2>📚 Docs agent <span className="faint">It alone writes these docs; ask it</span></h2>
      {d.sessionId ? <Conversation sessionId={d.sessionId} compact context={{ path: '/docs', label: 'the docs' }} onChanged={() => onChanged()} /> : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Say what the docs should say, or what to check: "write down how sign-in works", "is the page on the queue still true?". It reads the code, writes the page in the right section, and its pages are checked and committed.</p>
          <textarea aria-label="What to ask the docs agent" rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }} />
          {error && <div className="empty bad">{error}</div>}
          <div style={{ marginTop: 8 }}><button className="btn" disabled={asking || !text.trim()} onClick={() => void ask()}>Ask</button></div>
        </>
      )}
    </aside>
  )
}

const said = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }

export function Docs() {
  const { app } = useCurrentApp()
  const [s, setS] = useState<DocsSite | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [d, setD] = useState<DocsAgent | null>(null)
  const [open, setOpen] = useState(false)
  const loadAgent = (now?: DocsAgent) => { if (now) return setD(now); if (app) void engine.docsAgent(app.id).then(setD).catch(() => {}) }
  useEffect(() => { // the agent, looked at again while it writes
    setD(null); setOpen(false)
    if (!app) return
    let gone = false
    const poll = () => engine.docsAgent(app.id).then((x) => { if (!gone) setD(x) }).catch(() => {})
    void poll()
    const t = window.setInterval(poll, 5000)
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id])
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
          <p className="muted" style={{ margin: '4px 0 0' }}>How this app works and what we built, as we understand it: the docs site in its workbench folder{s?.dir ? <>, <code>{s.dir}/docs</code></> : ''}.</p>
          {d?.ready && <AgentLine d={d} />}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {d?.ready && <button className={`btn ${open ? '' : 'quiet'}`} aria-pressed={open} onClick={() => setOpen(!open)}>{d.busy ? 'Docs agent · writing…' : 'Docs agent'}</button>}
          {at && s?.url && <a className="btn quiet" href={s.url} target="_blank" rel="noreferrer">Open the docs on their own ↗</a>}
        </div>
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}
      {s && !s.dir && <div className="empty">{app?.name} has no workbench folder. Make one under {bench}: the docs site in it shows here.</div>}
      {s?.dir && !s.found && <div className="empty">There is no folder at <code>{s.dir}</code> on this computer. Change it under {bench}.</div>}
      {s?.found && !s.has && <div className="empty">There is no docs site in <code>{s.dir}</code> yet: a <code>docs/</code> folder with VitePress in it. Add one under {bench} ("Add what is missing"), and it shows here.</div>}
      {s?.has && !s.up && (
        <div className="empty">
          {s.problem ? <p style={{ margin: 0 }}>{s.problem}</p> : <>
            <p style={{ marginTop: 0 }}>The docs site isn't running. {s.startedHere ? 'Starting it…' : ''}</p>
            {!s.startedHere && <button className="btn" disabled={starting} onClick={() => void start()}>Start the docs</button>}
          </>}
          {s.log.length > 0 && <pre className="sb-log">{s.log.slice(-8).join('\n')}</pre>}
        </div>
      )}
      {(at || (open && d?.ready)) && (
        <div className={`docs-layout ${open && d?.ready ? 'with-agent' : ''}`}>
          {at && <iframe className="sb-frame" src={at} title={`${app?.name} docs`} />}
          {open && d?.ready && app && <AgentPanel appId={app.id} d={d} onChanged={loadAgent} />}
        </div>
      )}
    </div>
  )
}
