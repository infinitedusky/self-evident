/**
 * Learn has two halves (Sandy, 2026-11-16): what the code says, and what the running app says. Both end in ideas.
 *
 * The codebase half is here: an agent reads the app's code and writes four short documents (what it is, the parts,
 * running and testing it, what is fragile). They are the app's workbench docs, and this page is where they are read.
 * Each shows the part written for a person; the part written for agents is folded under it. What the agent thinks
 * should change it keeps as ideas, so the way on from here is Ideas.
 *
 * Learn has its own agent, beside what it wrote (Sandy, 2026-11-16: "its own agent that's broken off from the
 * global"): its conversation is on this page and not in the app's column, as a task's agent is on the task's page.
 *
 * The other half, the running app, is still a statement of intent: nothing reads the telemetry back yet.
 *
 * The documents after an architecture decision record and a README's "getting started": a fixed, small set with the
 * same headings in every app, so a person and an agent both know where to look.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { API, engine, openEvents, type Learning } from '../engine'
import { useCurrentApp } from '../current-app'
import { Badge } from '../components/Badge'
import { Md } from '../components/Md'
import { Conversation } from '../components/Conversation'

export function Learn() {
  const { app } = useCurrentApp()
  const [l, setL] = useState<Learning | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => { if (app) void engine.learning(app.id).then((x) => { setL(x); setError(null) }).catch((e) => setError(String(e.message ?? e))) }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!app) return
    setL(null); load()
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 300) }
    for (const t of ['learn.written', 'talk.result', 'talk.message', 'idea.created']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [app?.id, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const learn = async () => {
    if (!app) return
    setBusy(true); setError(null)
    try { const r = await engine.learn(app.id); setL((now) => (now ? { ...now, working: { sessionId: r.sessionId }, sessionId: r.sessionId } : now)); load() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  const none = !!l && l.docs.length === 0
  return (
    <>
      <div className="page-head"><div>
        <h1>🧠 Learn{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>What is true about this app, from two places: its code, and what it does when it runs. Both end in ideas.</p>
      </div></div>

      <div className={`learn-layout ${l?.sessionId ? 'with-agent' : ''}`}>
      <div className="learn-main">
      <section className="panel" data-component="LearnCodebase" aria-label="The codebase">
        <h2>The codebase {l && l.docs.length > 0 && <span className="faint">{l.docs.length} of {l.docs.length + l.missing.length} written</span>}
          {l && !l.working && app && <button className={`btn small ${none ? '' : 'quiet'}`} style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void learn()}>{none ? 'Learn this codebase' : 'Learn it again'}</button>}
        </h2>
        {!app && <p className="muted" style={{ margin: 0 }}>Add an app in Settings, and its code can be learned here.</p>}
        {error && <p className="bad" style={{ margin: '0 0 8px' }}>{error}</p>}
        {l?.working && <p style={{ margin: '0 0 10px' }}><Badge tone="accent" dot>working</Badge> An agent is reading the code. What it writes shows here as it goes.</p>}
        {none && !l?.working && <p style={{ margin: 0 }}>An agent reads the code and writes four short documents: what the app is, its parts, how to run and test it, and what is fragile. It changes nothing. Where it sees something worth changing, it keeps an idea. Start here on a new app.</p>}
        {l && !l.working && l.stale > 0 && <p className="learn-stale" role="note">The code has changed since these were written. Learn it again to bring them up to date.</p>}
        {l?.docs.map((d) => (
          <article key={d.key} className="learn-doc">
            <h3>{d.title} <span className="faint">{new Date(d.updatedAt).toLocaleDateString()}</span></h3>
            <Md text={d.summary} />
            {d.body && <details><summary className="faint">For agents</summary><Md text={d.body} /></details>}
          </article>
        ))}
        {l && l.docs.length > 0 && l.missing.length > 0 && !l.working && <p className="faint" style={{ margin: '8px 0 0', fontSize: 13 }}>Not written yet: {l.missing.join(', ')}.</p>}
        {l && l.docs.length > 0 && <p style={{ margin: '12px 0 0' }}>What it thought should change is in <Link to="/ideas">Ideas</Link>.</p>}
      </section>

      <section className="panel" aria-label="The running app">
        <h2>The running app <span className="faint">not built yet</span></h2>
        <p style={{ margin: 0 }}>The other half: reading what the app reports when it runs (counts, timings, outcomes) and saying what is true. A baseline when an idea is kept, what changed after it shipped, a guard after a merge. Nothing reads the telemetry back yet.</p>
      </section>
      </div>
      {l?.sessionId && (
        <aside className="panel learn-agent" data-component="LearnAgent" aria-label="Learn's agent">
          <h2>🧠 Learn's agent <span className="faint">it read the code; ask it</span></h2>
          <Conversation sessionId={l.sessionId} compact context={{ path: '/learn', label: 'what it learned' }} onChanged={load} />
        </aside>
      )}
      </div>
    </>
  )
}
