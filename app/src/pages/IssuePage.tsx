/**
 * One issue: what it says, where it sits, and its sub-issues as a list, not a graph (Sandy, 2026-10-27: "see a single
 * task and look at all of its phases, not in a graph but just in a list"). Under code, each sub-issue with its build;
 * under a to-do, its checklist. A task (a top-level code issue) also has its brief's approval and its steps (LOG.md,
 * 2026-10-29). Live on the app's events.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, type Tone } from '../components/Badge'
import { Brief } from '../components/Brief'
import { StepsPanel } from '../components/StepsPanel'
import { STATUS_TONE } from '../components/PlanGraphView'
import { API, engine, EVENT_TYPES, STATE_LABEL, type IssueDetail, type IssueState } from '../engine'

export const STATE_TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }

export function IssuePage() {
  const { id } = useParams()
  const [i, setI] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const briefRef = useRef<HTMLElement>(null)
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
  const task = code && !i.parentId // a task: it has a brief to approve and steps
  const planned = i.subIssues.length > 0
  return (
    <>
      <div className="page-head">
        <div>
          <div className="faint" style={{ fontSize: 13, marginBottom: 4 }}>
            {i.project ? <Link to={`/projects/${i.project.id}`}>{i.project.name}</Link> : <Link to="/tasks">In no project</Link>}
            {i.parent && <> · sub-task of <Link to={`/tasks/${i.parent.id}`}>{i.parent.identifier} {i.parent.title}</Link></>}
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
          {code && !i.parentId && !planned && i.project && i.state === 'todo' && <button className="btn" disabled={busy || !i.briefApprovedBy} title={i.briefApprovedBy ? undefined : 'Approve the brief first'} onClick={() => act(() => engine.planIssue(i.id))}>Plan</button>}
          {i.build && ['failed', 'cancelled'].includes(i.build.status) && <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(i.id))}>Retry</button>}
        </div>
      </div>

      {i.reason && <div className="empty" style={{ marginBottom: 16 }}>{STATE_LABEL[i.state]}: {i.reason}</div>}
      {i.build?.heldReason && i.build.status !== 'done' && <div className="empty" style={{ marginBottom: 16 }}>{i.build.heldReason}</div>}
      <section className="panel" ref={briefRef}>
        <Brief description={i.description} brief={i.brief} open={!i.description} />
        {task && (
          <div className="brief-approval">
            {!i.brief?.trim()
              ? <span className="faint">No brief yet. A task is built from an approved brief: ask the agent to write it.</span>
              : i.briefApprovedBy
                ? <><Badge tone="ok">brief approved</Badge><span className="faint">by {i.briefApprovedBy}{i.briefApprovedAt ? `, ${new Date(i.briefApprovedAt).toLocaleDateString()}` : ''}</span>
                  <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id, false))}>Withdraw</button></>
                : <><Badge tone="warn">waiting for your approval</Badge><span className="faint">Planning and building wait for it.</span>
                  <button className="btn small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id))}>Approve the brief</button></>}
          </div>
        )}
      </section>

      {task && <StepsPanel subject={{ kind: 'issues', id: i.id }} appId={i.appId} name={i.title} onBrief={() => briefRef.current?.scrollIntoView({ behavior: 'smooth' })} />}

      {i.parentId && code && <Steps i={i} />}

      {(planned || !i.parentId) && (
        <section className="panel">
          <h2>{code ? 'Sub-tasks' : 'Checklist'} {planned && <Badge>{i.subIssues.filter((s) => s.state === 'done').length}/{i.subIssues.length}</Badge>}</h2>
          {!planned && <p className="faint" style={{ margin: 0 }}>{code ? 'Not planned yet: the planner reads the code and the brief, and cuts it into sub-tasks, one agent each.' : 'No lines yet.'}</p>}
          {planned && (
            <ol className="list sub-issues">
              {i.subIssues.map((s) => (
                <li key={s.id} className={`sub-issue ${s.state}`}>
                  <span className="mono faint">{s.identifier}</span>
                  <div>
                    <Link to={`/tasks/${s.id}`} style={{ textDecoration: 'none' }}>{s.title}</Link>
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

/** The steps in a sub-issue's brief, as the planner wrote them: "### Steps", numbered, each with its technical note under it. */
function plannedSteps(brief: string | null): { text: string; technical: string }[] {
  const section = brief?.split(/^### Steps\s*$/m)[1]?.split(/^(?:### |\*\*Done when)/m)[0] ?? ''
  const steps: { text: string; technical: string }[] = []
  for (const line of section.split('\n')) {
    const item = line.match(/^\d+\.\s+(.*)/)
    if (item) steps.push({ text: item[1], technical: '' })
    else if (steps.length && /^\s+-\s+/.test(line)) steps[steps.length - 1].technical = line.replace(/^\s+-\s+/, '')
  }
  return steps
}

/** A sub-issue's steps: the planner's, until the builder starts and keeps its own list; then the builder's, live, with the plan folded under it. */
function Steps({ i }: { i: IssueDetail }) {
  const plan = plannedSteps(i.brief)
  const built = i.steps ?? []
  const [technical, setTechnical] = useState(false)
  const md = (text: string) => <Markdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{text}</Markdown>
  const planList = (
    <>
      <ol className="planned-steps">
        {plan.map((s, n) => <li key={n}>{md(s.text)}{technical && s.technical && <div className="faint md" style={{ fontSize: 13 }}>{md(s.technical)}</div>}</li>)}
      </ol>
      {plan.some((s) => s.technical) && <button className="btn quiet" style={{ marginTop: 6 }} onClick={() => setTechnical(!technical)}>{technical ? 'Hide' : 'Show'} the technical notes</button>}
    </>
  )
  return (
    <section className="panel">
      <h2>Steps {built.length > 0 && <Badge>{built.filter((s) => s.status === 'completed').length}/{built.length}</Badge>}</h2>
      {built.length > 0 ? (
        <>
          <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>The builder's list, attempt {i.stepsAttempt}.</p>
          <ul className="steps">{built.map((s) => <li key={s.id} className={s.status}><span className="mono">{s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'}</span> {s.text}</li>)}</ul>
          {plan.length > 0 && <details style={{ marginTop: 10 }}><summary className="faint">As planned</summary>{planList}</details>}
        </>
      ) : plan.length > 0 ? (
        <>
          <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>As planned. The builder keeps its own list once it starts.</p>
          {planList}
        </>
      ) : <p className="faint" style={{ margin: 0 }}>No steps yet: the builder writes its list when it starts.</p>}
    </section>
  )
}
