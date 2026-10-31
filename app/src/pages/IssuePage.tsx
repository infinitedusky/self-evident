/**
 * One issue: what it says, where it sits, and its sub-issues as a list, not a graph (Sandy, 2026-10-27: "see a single
 * task and look at all of its phases, not in a graph but just in a list"). Under code, each sub-issue with its build;
 * under a to-do, its checklist. Live on the app's events.
 *
 * A task (a top-level code issue) is laid out like Settings: its own nav down the left (TaskNav), its overview first,
 * then a page per step in its workflow's order, then the build, each at its own address: /tasks/:id/:section.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, type Tone } from '../components/Badge'
import { Brief } from '../components/Brief'
import { askStep, useSteps } from '../components/StepsPanel'
import { StepSection } from '../components/StepSection'
import { TaskNav } from '../components/TaskNav'
import { label, type StepKey } from '@self-evident/engine/steps'
import { STATUS_TONE } from '../components/PlanGraphView'
import { openEvents, type Events, API, engine, EVENT_TYPES, STATE_LABEL, type IssueDetail, type IssueState } from '../engine'

/** Where a task's workflow comes from, after its name. */
const FROM = { task: ', its own', project: ', from its project', app: ', the app\'s default' }

export const STATE_TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }

export function IssuePage() {
  const { id, section } = useParams()
  const [i, setI] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!id) return
    let closed = false
    const refresh = () => engine.issue(id).then((d) => { if (!closed) { setI(d); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    let es: Events | null = null
    engine.issue(id).then((d) => {
      if (closed) return
      es = openEvents(`${API}/events?since=now&app=${d.appId}`)
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
          {i.build && ['failed', 'cancelled'].includes(i.build.status) && <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(i.id))}>Retry</button>}
        </div>
      </div>

      {i.reason && <div className="empty" style={{ marginBottom: 16 }}>{STATE_LABEL[i.state]}: {i.reason}</div>}
      {i.build?.heldReason && i.build.status !== 'done' && <div className="empty" style={{ marginBottom: 16 }}>{i.build.heldReason}</div>}

      {task ? <Task i={i} section={section} busy={busy} act={act} /> : (
        <>
          <section className="panel"><Brief description={i.description} brief={i.brief} open={!i.description} /></section>
          {code && <Steps i={i} />}
          <SubTasks i={i} />
          <Planner i={i} />
        </>
      )}
    </>
  )
}

/** A task: its nav, and the section the address names. */
function Task({ i, section, busy, act }: { i: IssueDetail; section?: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const subject = { kind: 'issues' as const, id: i.id }
  const { v, error } = useSteps(subject, i.appId)
  const base = `/tasks/${i.id}`
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const rows = v.rows
  const here = section === 'build' || rows.some((r) => r.key === section) ? section! : 'overview'
  if (section && here === 'overview') return <Navigate to={base} replace />
  const done = i.subIssues.filter((s) => s.state === 'done').length
  const buildWaits = i.briefApprovedBy ? null : 'the brief\'s approval'
  const row = rows.find((r) => r.key === here)
  const next = rows.find((r) => !r.waitingOn && r.state.status !== 'done' && r.key !== 'idea')
  const wf = v.resolved.workflow
  return (
    <div className="task-layout">
      <TaskNav base={base} here={here} rows={rows} workflow={wf && { name: wf.name, from: FROM[v.resolved.from!] }} build={{ done, total: i.subIssues.length, waitingOn: buildWaits }} />
      <div className="task-main">
        {here === 'overview' && (
          <>
            <section className="panel"><Brief description={i.description} brief={null} /></section>
            <section className="panel">
              <h2>Where it stands</h2>
              <p style={{ margin: '0 0 8px' }}>
                {v.blocking.length
                  ? <>It can be completed once these are done: {v.blocking.map((k, n) => <span key={k}>{n ? ', ' : ''}<Link to={`${base}/${k}`}>{label(k as StepKey, 'task')}{k === 'brief' && i.brief?.trim() ? ' (approval)' : ''}</Link></span>)}.</>
                  : 'Every required step is done.'}
              </p>
              {next && <p style={{ margin: '0 0 8px' }}>Next: <Link to={`${base}/${next.key}`}>{label(next.key, 'task')}</Link>{next.required ? '' : ' (optional)'}.</p>}
              <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                {wf && <>Workflow <b>{wf.name}</b>{FROM[v.resolved.from!]}{wf.ordered ? ', in order' : ''}. </>}
                <Link to={`/settings/apps/${i.appId}/workflows`}>Configure the rules</Link>
              </p>
            </section>
            <Planner i={i} />
          </>
        )}
        {row && (
          <StepSection subject={subject} appId={i.appId} name={i.title} row={row} base={base} fromIdea={v.fromIdea} waitingState={rows.find((r) => r.key === row.waitingOn)?.state}>
            {row.key === 'brief' ? <BriefStep i={i} busy={busy} act={act} locked={!!row.waitingOn} /> : undefined}
          </StepSection>
        )}
        {here === 'build' && (buildWaits
          ? <section className="panel"><h2>🏗️ Sub-tasks</h2><div className="empty">Planning and building wait for the brief's approval. <Link to={`${base}/brief`}>Go to the brief →</Link></div></section>
          : <>
              <SubTasks i={i} plan={!i.subIssues.length && i.project && i.state === 'todo' ? <button className="btn" disabled={busy} onClick={() => act(() => engine.planIssue(i.id))}>Plan it</button> : null} />
              <Planner i={i} />
            </>)}
      </div>
    </div>
  )
}

/** The brief's page: the brief, and its approval. */
function BriefStep({ i, busy, act, locked }: { i: IssueDetail; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void>; locked: boolean }) {
  const [asked, setAsked] = useState(false)
  if (!i.brief?.trim()) return (
    <div>
      <p className="faint">No brief yet. A task is built from an approved brief.</p>
      {!locked && <div className="step-actions">
        <button className="btn" disabled={busy || asked} onClick={() => act(async () => { await askStep({ kind: 'issues', id: i.id }, i.appId, i.title, 'brief', 'task'); setAsked(true) })}>Write it with the agent</button>
        {asked && <span className="faint">Handed to the agent: it's in the agent panel.</span>}
      </div>}
    </div>
  )
  return (
    <>
      <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{i.brief}</Markdown></div>
      <div className="brief-approval">
        {i.briefApprovedBy
          ? <><Badge tone="ok">brief approved</Badge><span className="faint">by {i.briefApprovedBy}{i.briefApprovedAt ? `, ${new Date(i.briefApprovedAt).toLocaleDateString()}` : ''}</span>
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id, false))}>Withdraw</button></>
          : locked
          ? <span className="faint">Approval waits for the steps before it.</span>
          : <><Badge tone="warn">waiting for your approval</Badge><span className="faint">Planning and building wait for it.</span>
            <button className="btn small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id))}>Approve the brief</button></>}
      </div>
    </>
  )
}

/** Sub-tasks under code, a checklist under a to-do. */
function SubTasks({ i, plan }: { i: IssueDetail; plan?: React.ReactNode }) {
  const code = i.kind === 'code'
  const planned = i.subIssues.length > 0
  if (!planned && i.parentId) return null
  return (
    <section className="panel">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{code ? 'Sub-tasks' : 'Checklist'} {planned && <Badge>{i.subIssues.filter((s) => s.state === 'done').length}/{i.subIssues.length}</Badge>}</h2>
        {plan}
      </div>
      {!planned && <p className="faint" style={{ margin: '8px 0 0' }}>{code ? 'Not planned yet: the planner reads the code and the brief, and cuts it into sub-tasks, one agent each.' : 'No lines yet.'}</p>}
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
  )
}

/** What the planner asked and decided about it. */
function Planner({ i }: { i: IssueDetail }) {
  if (!i.questions.length && !i.decisions.length) return null
  return (
    <section className="panel">
      <h2>The planner</h2>
      {i.questions.filter((q) => q.status === 'open').map((q) => <p key={q.id} style={{ margin: '0 0 8px' }}><Badge tone="warn">asks</Badge> {q.text}</p>)}
      {i.decisions.map((d) => <p key={d.id} className="muted" style={{ margin: '0 0 6px' }}>Decided: {d.question}: {d.options.find((o) => o.key === d.chosen)?.text}{d.provisional ? ' (provisional)' : ''}</p>)}
      {i.project && <Link to={`/projects/${i.project.id}`}>Answer on the project →</Link>}
    </section>
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
