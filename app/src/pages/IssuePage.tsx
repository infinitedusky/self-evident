/**
 * One issue: what it says, where it sits, and its sub-issues as a list, not a graph (Sandy, 2026-10-27: "see a single
 * task and look at all of its phases, not in a graph but just in a list"). Under code, each sub-issue with its build;
 * under a to-do, its checklist. Live on the app's events.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { Brief } from '../components/Brief'
import { STATUS_TONE } from '../components/PlanGraphView'
import { API, engine, EVENT_TYPES, STATE_LABEL, type IssueDetail, type IssueState } from '../engine'

export const STATE_TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }

export function IssuePage() {
  const { id } = useParams()
  const [i, setI] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    let closed = false
    const refresh = () => engine.issue(id).then((d) => { if (!closed) { setI(d); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    let es: EventSource | null = null
    engine.issue(id).then((d) => {
      if (closed) return
      es = new EventSource(`${API}/events?since=-1&app=${d.appId}`)
      const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
      for (const t of EVENT_TYPES) if (!t.startsWith('run.') && !t.startsWith('talk.')) es.addEventListener(t, bump)
    }).catch(() => {})
    return () => { closed = true; es?.close(); window.clearTimeout(timer.current) }
  }, [id])
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); setI(await engine.issue(id!)) } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) } }

  if (error && !i) return <div className="empty">{error}</div>
  if (!i) return <p className="muted">Loading…</p>
  const code = i.kind === 'code'
  const planned = i.subIssues.length > 0
  return (
    <>
      <div className="page-head">
        <div>
          <div className="faint" style={{ fontSize: 13, marginBottom: 4 }}>
            {i.project ? <Link to={`/projects/${i.project.id}`}>{i.project.name}</Link> : <Link to="/issues">In no project</Link>}
            {i.parent && <> · sub-issue of <Link to={`/issues/${i.parent.id}`}>{i.parent.identifier} {i.parent.title}</Link></>}
          </div>
          <h1><span className="mono faint" style={{ fontWeight: 400 }}>{i.identifier}</span> {i.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge tone={STATE_TONE[i.state]} dot={i.state === 'in_progress'}>{STATE_LABEL[i.state]}</Badge>
            <Badge>{code ? 'code' : 'to-do'}</Badge>
            {i.delegate && <Badge>with the {i.delegate}</Badge>}
            {i.build && <Badge tone={STATUS_TONE[i.build.status]}>build: {i.build.status.replace('_', ' ')}{i.build.attempt ? ` · attempt ${i.build.attempt}` : ''}</Badge>}
            {i.waitingOn && <Badge tone="warn">waiting on {i.waitingOn}</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {error && <Badge tone="warn" dot>{error}</Badge>}
          {code && !i.parentId && !planned && i.project && i.state === 'todo' && <button className="btn" disabled={busy} onClick={() => act(() => engine.planIssue(i.id))}>Plan</button>}
          {i.build && ['failed', 'cancelled'].includes(i.build.status) && <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(i.id))}>Retry</button>}
        </div>
      </div>

      {i.reason && <div className="empty" style={{ marginBottom: 16 }}>{STATE_LABEL[i.state]}: {i.reason}</div>}
      {i.build?.heldReason && i.build.status !== 'done' && <div className="empty" style={{ marginBottom: 16 }}>{i.build.heldReason}</div>}
      <section className="panel"><Brief description={i.description} brief={i.brief} open={!i.description} /></section>

      {(planned || !i.parentId) && (
        <section className="panel">
          <h2>{code ? 'Sub-issues' : 'Checklist'} {planned && <Badge>{i.subIssues.filter((s) => s.state === 'done').length}/{i.subIssues.length}</Badge>}</h2>
          {!planned && <p className="faint" style={{ margin: 0 }}>{code ? 'Not planned yet: the planner reads the code and the brief, and cuts it into sub-issues, one agent each.' : 'No lines yet.'}</p>}
          {planned && (
            <ol className="list sub-issues">
              {i.subIssues.map((s) => (
                <li key={s.id} className={`sub-issue ${s.state}`}>
                  <span className="mono faint">{s.identifier}</span>
                  <div>
                    <Link to={`/issues/${s.id}`} style={{ textDecoration: 'none' }}>{s.title}</Link>
                    {s.description && <div className="muted" style={{ fontSize: 14 }}>{s.description}</div>}
                    {s.build?.heldReason && s.build.status !== 'done' && <div className="faint" style={{ fontSize: 13 }}>{s.build.heldReason}</div>}
                    {s.waitingOn && s.state !== 'done' && <div className="faint" style={{ fontSize: 13 }}>waiting on {s.waitingOn}</div>}
                  </div>
                  {s.build ? <Badge tone={STATUS_TONE[s.build.status]}>{s.build.status.replace('_', ' ')}</Badge> : <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {(i.questions.length > 0 || i.decisions.length > 0) && (
        <section className="panel">
          <h2>The planner</h2>
          {i.questions.filter((q) => q.status === 'open').map((q) => <p key={q.id} style={{ margin: '0 0 8px' }}><Badge tone="warn">asks</Badge> {q.text}</p>)}
          {i.decisions.map((d) => <p key={d.id} className="muted" style={{ margin: '0 0 6px' }}>Decided: {d.question}: {d.options.find((o) => o.key === d.chosen)?.text}{d.provisional ? ' (provisional)' : ''}</p>)}
          {i.project && <Link to={`/projects/${i.project.id}`}>Answer on the project →</Link>}
        </section>
      )}
    </>
  )
}
