/**
 * The front door: what needs you, what's running, what just happened. Everything is a click from here. Refreshes
 * on every event the engine logs (one refetch per burst), so it is never stale by more than a moment.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { API, engine, EVENT_TYPES, type Attention, type Event, type Now as NowData, type RunningPlan } from '../engine'
import { useCurrentApp } from '../current-app'

const COST_TONE: Record<string, Tone> = { cheap: 'neutral', moderate: 'warn', expensive: 'bad' }

export function Now() {
  const { app } = useCurrentApp()
  const [data, setData] = useState<NowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    setData(null) // never show the last app's picture while the next one loads
    if (!app) return
    let closed = false
    const refresh = () => engine.now(app.id).then((d) => { if (!closed) { setData(d); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?since=-1&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, bump)
    es.onerror = () => setError('event stream disconnected; retrying')
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [app?.id])
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); try { await fn() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(null) } }

  if (error && !data) return <div className="empty">The engine isn't reachable: {error}. Run <code>pnpm dev</code> at the repo root.</div>
  if (!app) return <div className="empty">No app yet. Add one in Settings: a repo with a local checkout, a test command, a model.</div>
  if (!data) return <p className="muted">Loading…</p>
  return (
    <>
      <div className="page-head">
        <div>
          <h1>🔭 Observe{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>{data.counts.running} running · {data.counts.needsYou} need{data.counts.needsYou === 1 ? 's' : ''} you · {data.counts.projects} project{data.counts.projects === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {error && <Badge tone="warn" dot>{error}</Badge>}
          <Link to="/projects/new" className="btn">New project</Link>
        </div>
      </div>

      {data.hold && (
        <div className="hold-banner">
          <strong>Waiting for the model.</strong> {data.hold.reason} <span className="faint">Nothing has failed; the phases it stopped will resume. Trying again at {new Date(data.hold.until).toTimeString().slice(0, 5)}.</span>
          <button className="btn small" onClick={() => void engine.releaseHold()}>Try now</button>
        </div>
      )}

      <section className="panel">
        <h2>Needs you {data.needsYou.length > 0 && <Badge tone="warn">{data.needsYou.length}</Badge>}</h2>
        {data.needsYou.length === 0
          ? <p className="muted" style={{ margin: 0 }}>Nothing. The engine has what it needs.</p>
          : <ul className="attention">{data.needsYou.map((a, i) => <AttentionRow key={i} a={a} busy={busy} act={act} />)}</ul>}
      </section>

      <section className="panel">
        <h2>Running {data.running.length > 0 && <Badge tone="accent" dot>{data.running.length}</Badge>}</h2>
        {data.running.length === 0
          ? <p className="muted" style={{ margin: 0 }}>Nothing is running.</p>
          : <div className="cards">{data.running.map((r) => <RunningCard key={r.projectId} r={r} />)}</div>}
      </section>

      <section className="panel">
        <h2>Just happened</h2>
        <Recent events={data.recent} />
      </section>
    </>
  )
}

function AttentionRow({ a, busy, act }: { a: Attention; busy: string | null; act: (key: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const where = <span className="faint">{a.appName} · <Link to={`/projects/${a.projectId}`}>{a.planTitle}</Link></span>
  switch (a.kind) {
    case 'failed_phase': return (
      <li><Badge tone="bad">failed</Badge><div><strong>#{a.number} {a.title}</strong> {where}{a.error && <div className="muted" style={{ fontSize: 13 }}>{a.error.slice(0, 200)}</div>}</div>
        <span style={{ display: 'flex', gap: 6 }}><button className="btn small" disabled={busy === a.phaseId} onClick={() => act(a.phaseId, () => engine.retry(a.phaseId))}>Retry</button><Link className="btn quiet small" to={`/projects/${a.projectId}`}>Look</Link></span></li>)
    case 'question': return (
      <li><Badge tone={COST_TONE[a.cost ?? ''] ?? 'neutral'}>question</Badge><div><strong>{a.text}</strong> {where}{a.taskNumber != null && <span className="faint"> · task #{a.taskNumber}</span>}</div>
        <Link className="btn quiet small" to={`/projects/${a.projectId}`}>Answer</Link></li>)
    case 'run_project': return (
      <li><Badge tone="ok">ready</Badge><div><strong>{a.planTitle}</strong> <span className="faint">{a.appName} · {a.phases} phase{a.phases === 1 ? '' : 's'} planned, nothing open</span></div>
        <button className="btn small" disabled={busy === a.projectId} onClick={() => act(a.projectId, () => engine.start(a.projectId))}>Run it</button></li>)
    case 'plan_task': return (
      <li><Badge>draft</Badge><div><strong>task #{a.taskNumber} {a.taskTitle}</strong> {where} <span className="faint">· no phases yet</span></div>
        <button className="btn small" disabled={busy === a.taskId} onClick={() => act(a.taskId, () => engine.planTask(a.taskId))}>Plan it</button></li>)
    case 'todo': return (
      <li><Badge tone={a.next ? (a.owner === 'agent' ? 'accent' : 'warn') : 'neutral'}>{a.next ? (a.owner === 'agent' ? 'agent to-do' : 'to-do') : 'waiting'}</Badge>
        <div><strong><Link to={`/todos#${a.todoId}`}>{a.title}</Link></strong> <span className="faint">{a.appName}{a.planTitle && a.projectId ? <> · unblocks <Link to={`/projects/${a.projectId}`}>{a.planTitle}</Link></> : null}{a.total ? ` · ${a.done}/${a.total}` : ''}</span>
          {a.next ? <div className="muted" style={{ fontSize: 13 }}>Next: {a.next}</div> : a.waitingOn.length ? <div className="muted" style={{ fontSize: 13 }}>Waiting on {a.waitingOn.join(', ')}</div> : !a.total ? <div className="muted" style={{ fontSize: 13 }}>No checklist yet</div> : null}</div>
        <Link className="btn quiet small" to={`/todos#${a.todoId}`}>Open</Link></li>)
    case 'backlog': return (
      <li><Badge tone="warn">backlog</Badge><div><strong>{a.planTitle}</strong> <span className="faint">{a.appName} · the work has landed; {a.open} backlog item{a.open === 1 ? '' : 's'} still open: {a.items.join('; ')}</span></div>
        <Link className="btn quiet small" to={`/projects/${a.projectId}`}>Settle them</Link></li>)
    case 'merge_pr': return (
      <li><Badge tone="ok">landed</Badge><div><strong>{a.planTitle}</strong> <span className="faint">{a.appName} · every phase landed; the PR is waiting</span></div>
        {a.url ? <a className="btn quiet small" href={a.url} target="_blank" rel="noreferrer">PR #{a.prNumber}</a> : null}</li>)
  }
}

function RunningCard({ r }: { r: RunningPlan }) {
  return (
    <div className="card" data-component="RunningCard">
      <div className="card-head">
        <span className="faint">{r.appName}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <Badge tone="accent" dot>{r.phases.done}/{r.phases.total} landed</Badge>
          {r.phases.failed > 0 && <Badge tone="bad">{r.phases.failed} failed</Badge>}
          {r.pr && <a className="badge accent" href={r.pr.url ?? '#'} target="_blank" rel="noreferrer">PR #{r.pr.number}</a>}
        </span>
      </div>
      <div className="card-title"><Link to={`/projects/${r.projectId}`}>{r.planTitle}</Link></div>
      {r.live.map((x) => (
        <div key={x.id} style={{ marginTop: 6 }}><span className="mono faint">#{x.number}</span> {x.title} <Badge tone="accent" dot>{x.status}</Badge>
          {x.step && <div className="muted" style={{ fontSize: 13 }}>→ {x.step}</div>}</div>
      ))}
      {r.held.length > 0 && <div className="faint" style={{ marginTop: 6, fontSize: 13 }}>Waiting: {r.held.map((h) => `#${h.number} (${h.reason})`).join('; ')}</div>}
    </div>
  )
}

function Recent({ events }: { events: Event[] }) {
  if (!events.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
  return (
    <ul className="ticker">
      {[...events].reverse().slice(0, 20).map((e) => (
        <li key={e.seq}>
          <span className="mono faint">{e.ts.slice(5, 16).replace('T', ' ')}</span>
          <span className="mono">{e.projectId ? <Link to={`/projects/${e.projectId}`}>project</Link> : ''}</span>
          <span className="mono">{e.type}</span>
          <span className="muted">{describe(e)}</span>
        </li>
      ))}
    </ul>
  )
}

function describe(e: Event): string {
  const p = e.payload as any
  switch (e.type) {
    case 'project.created': return `${p.title} · ${p.tasks} task(s)`
    case 'task.created': return `#${p.number} ${p.title}`
    case 'phase.created': return `#${p.number} ${p.title}`
    case 'phase.status': return `${p.from} → ${p.to}`
    case 'phase.held': return p.reason
    case 'task.planning': return `planning task #${p.number}`
    case 'task.planned': return `${(p.phases ?? []).length} phases · ${p.decisions} decisions · ${p.questions} questions`
    case 'task.plan_failed': return String(p.error).slice(0, 120)
    case 'question.asked': return `[${p.cost}] ${p.text}`
    case 'question.answered': return String(p.answer)
    case 'run.result': return `${p.subtype} · $${Number(p.costUsd ?? 0).toFixed(2)}`
    case 'land.landed': return `landed ${String(p.sha).slice(0, 7)}`
    case 'pr.opened': case 'pr.updated': return `#${p.number}`
    default: return Object.keys(p).length ? JSON.stringify(p).slice(0, 100) : ''
  }
}
