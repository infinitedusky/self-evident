/**
 * Summary: the page a person reads walking in. Written by the agent from everything Self Evident knows about the app,
 * rewritten daily when something has moved, or on asking. Sections in order of building: what we are focused on
 * (who is on what, goals near, mid, long) first; the state of the app, observability highlights, learnings and open
 * questions to come. Every line links the rows it was written from.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../components/Badge'
import { openEvents, API, engine, type FocusLine, type FocusRef, type SummaryState } from '../engine'
import { useCurrentApp } from '../current-app'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

function RefLink({ id, r }: { id: string; r: FocusRef }) {
  const style = { fontSize: 12 }
  if (r.kind === 'pr' || r.kind === 'teammate_pr') return r.url ? <a className="ref" style={style} href={r.url} target="_blank" rel="noreferrer">{r.label}</a> : <span className="ref" style={style}>{r.label}</span>
  const to = r.kind === 'todo' ? `/todos#${id}` : r.kind === 'issue' || r.kind === 'task' ? `/tasks/${id}` : r.kind === 'idea' ? '/ideas' : r.kind === 'project' ? `/projects/${id}` : r.projectId ? `/projects/${r.projectId}` : null
  return to ? <Link className="ref" style={style} to={to}>{r.label}</Link> : <span className="ref" style={style}>{r.label}</span>
}

function Lines({ lines, links }: { lines: FocusLine[]; links: Record<string, FocusRef> }) {
  if (!lines.length) return <p className="faint" style={{ margin: 0 }}>Nothing here.</p>
  return (
    <ul className="summary-lines">
      {lines.map((l, i) => (
        <li key={i}>
          <div>{l.text}</div>
          <div className="summary-refs">{l.refs.filter((r) => links[r]).map((r) => <RefLink key={r} id={r} r={links[r]} />)}</div>
        </li>
      ))}
    </ul>
  )
}

export function Summary() {
  const { app } = useCurrentApp()
  const [data, setData] = useState<SummaryState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    setData(null)
    if (!app) return
    let closed = false
    const refresh = () => engine.summary(app.id).then((d) => { if (!closed) { setData(d); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    es.addEventListener('summary.writing', () => void refresh())
    es.addEventListener('summary.written', () => void refresh())
    es.addEventListener('summary.failed', (ev) => { setError(String(JSON.parse((ev as MessageEvent).data).payload?.error ?? 'writing failed')); void refresh() })
    const moved = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 1000) } // only to learn it went stale
    for (const t of ['project.landed', 'issue.planned', 'issue.created', 'issue.state', 'pr.merged', 'question.asked', 'initiative.created', 'cycle.created']) es.addEventListener(t, moved)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [app?.id])

  if (!app) return <div className="empty">No app yet. Add one in Settings.</div>
  const f = data?.focus
  const rewrite = () => { setError(null); void engine.writeSummary(app.id).then(() => setData((d) => d && { ...d, writing: true })).catch((e) => setError(String(e.message ?? e))) }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>📰 Summary<span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span></h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>
            Written by the agent from what Self Evident knows: goals, projects, tasks, to-dos, pull requests, the last week.
            {f ? <> Written {ago(f.createdAt)}{f.trigger === 'schedule' ? ' on schedule' : ''}.</> : null}
            {f && data?.stale && !data.writing ? <> Things have moved since.</> : null} It rewrites itself daily when something has moved.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <Badge tone="warn" dot>{error}</Badge>}
          <button className="btn quiet" disabled={!data || data.writing} onClick={rewrite}>{data?.writing ? 'Writing…' : f ? 'Rewrite now' : 'Write it'}</button>
        </div>
      </div>

      <section className="panel">
        <h2>What we're focused on</h2>
        {!data ? <p className="muted">Loading…</p>
          : !f ? <div className="empty">{data.writing ? 'Writing it now; this takes a minute.' : 'Not written yet. Write it, or wait for the daily pass.'}</div>
          : <>
            {f.body.headline && <p className="summary-headline">{f.body.headline}</p>}
            <div className="summary-people">
              {f.body.people.map((p) => <div key={p.who} className="summary-person"><h3>{p.who}</h3><Lines lines={p.doing} links={f.body.links} /></div>)}
            </div>
            <h3 style={{ marginTop: 18 }}>Where we're headed <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>· {f.body.stated ? 'from the goals you stated, and the work' : 'inferred from the work; ask the agent to state goals (initiatives) and this week (a cycle)'}</span></h3>
            <div className="summary-goals">
              <div><h4>This week</h4><Lines lines={f.body.goals.near} links={f.body.links} /></div>
              <div><h4>Next few weeks</h4><Lines lines={f.body.goals.mid} links={f.body.links} /></div>
              <div><h4>Long term</h4><Lines lines={f.body.goals.long} links={f.body.links} /></div>
            </div>
          </>}
      </section>

      {[['State of the app', 'What is live, what changed, what is broken.'], ['Observability highlights', 'What the app\'s metrics and promises say, from Observe.'], ['Learnings', 'Hypotheses tested and what they showed, from Learn.'], ['Open questions', 'Every question still open, where it was asked, when and why.']].map(([h, p]) => (
        <section key={h} className="panel"><h2 className="muted">{h}</h2><p className="faint" style={{ margin: 0 }}>Coming. {p}</p></section>
      ))}
    </>
  )
}
