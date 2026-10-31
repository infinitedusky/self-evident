/**
 * One project, live: its issues in order (plan one with a click; a draft's can be reordered), the graph of their
 * sub-issues, the planner's questions and decisions, the selected sub-issue's detail and steps, the event ticker, the PR.
 * Its own steps (research, mockups, a prototype; no brief) sit at the top.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView, STATUS_TONE } from '../components/PlanGraphView'
import { Brief } from '../components/Brief'
import { StepsPanel } from '../components/StepsPanel'
import { engine, STATE_LABEL, useLiveProject, type BacklogIssue, type Graph, type IdeaRow, type Decision, type Event, type GraphSubIssue, type GraphIssue, type Question } from '../engine'
import { useCurrentApp } from '../current-app'
import { pendingOpen } from '../workspace'
import { TodoCard } from './Todos'

const PROJECT_TONE: Record<string, Tone> = { paused: 'warn', drafting: 'neutral', proposed: 'neutral', approved: 'neutral', running: 'accent', landed: 'ok', stopped: 'warn', superseded: 'neutral' }
const COST_TONE: Record<string, Tone> = { cheap: 'neutral', moderate: 'warn', expensive: 'bad' }
const short = (t: string) => (t.length > 28 ? t.slice(0, 26).trimEnd() + '…' : t)

export function ProjectPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { graph, events, error } = useLiveProject(id)
  const { app, setAppId } = useCurrentApp()
  const [selectedId, setSelectedId] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (error && !graph) return <p className="muted">{error}</p>
  if (!graph) return <p className="muted">Loading…</p>
  // A project belongs to its app. Saved among another app's tabs, it says so rather than switching the app itself.
  if (app && graph.app.id !== app.id) return (
    <div className="empty" data-component="OtherAppProject">
      <p><strong>{graph.project.name}</strong> is in {graph.app.name}, and you're in {app.name}.</p>
      <button className="btn" onClick={() => { pendingOpen.tab = { kind: 'page', path: `/projects/${graph.project.id}` }; setAppId(graph.app.id) }}>Open it in {graph.app.name}</button>
    </div>
  )
  const selected = graph.subIssues.find((p) => p.id === selectedId) ?? null
  const issueOf = (p: GraphSubIssue) => graph.issues.find((t) => t.id === p.parentId)
  const draft = ['drafting', 'proposed', 'approved'].includes(graph.project.status)
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  // An issue is being planned from its last planning event until the planner reports back.
  const lastPlanEvent = (issueId: string) => events.filter((e) => e.issueId === issueId && e.type.startsWith('issue.plan')).at(-1)?.type
  const planning = (issueId: string) => ['issue.planning', 'issue.plan_waiting'].includes(lastPlanEvent(issueId) ?? '')
  const waitingForModel = (issueId: string) => lastPlanEvent(issueId) === 'issue.plan_waiting'
  const move = (from: number, to: number) => { const ids = graph.issues.map((t) => t.id); const [x] = ids.splice(from, 1); ids.splice(to, 0, x); return act(() => engine.reorder(ids)) }
  const open = graph.questions.filter((q) => q.status === 'open')
  return (
    <>
      <p className="mono"><Link to="/projects">← Projects</Link></p>
      <div className="page-head">
        <div>
          <h1>{graph.project.name}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Badge tone={PROJECT_TONE[graph.project.status] ?? 'neutral'} dot={graph.project.status === 'running'}>{graph.project.status}</Badge>
            <Badge>{graph.app.name}</Badge>
            {graph.project.integrationBranch && <Badge><span className="mono">{graph.project.integrationBranch}</span></Badge>}
            {graph.pr && <a className="badge accent" href={graph.pr.url ?? '#'} target="_blank" rel="noreferrer">PR #{graph.pr.number} · {graph.pr.status}</a>}
            {error && <Badge tone="warn" dot>{error}</Badge>}
          </div>
          {graph.project.content && <p className="muted" style={{ margin: '8px 0 0', maxWidth: 720 }}>{graph.project.content}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draft && (
            <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm('Discard this draft? Its tasks, sub-tasks, questions and decisions go with it.')) void act(async () => { await engine.cancelProject(graph.project.id); nav('/projects') }) }}>Discard draft</button>
          )}
          {graph.project.status === 'running' && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.pause(graph.project.id))} title="Nothing new starts; running agents stop and resume where they were">Pause</button>}
          {graph.project.status === 'paused' && <button className="btn" disabled={busy} onClick={() => act(() => engine.resume(graph.project.id))}>Resume</button>}
          {['running', 'paused'].includes(graph.project.status) && (
            <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm('Cancel this project? Running agents are stopped; what has landed stays on its branch.')) void act(() => engine.cancelProject(graph.project.id)) }}>Cancel project</button>
          )}
          {draft && graph.subIssues.length > 0 && (
            <button className="btn" disabled={busy} onClick={() => act(() => engine.start(graph.project.id))}>Run this project</button>
          )}
        </div>
      </div>

      <StepsPanel subject={{ kind: 'projects', id: graph.project.id }} appId={graph.app.id} name={graph.project.name} />

      <BacklogPanel graph={graph} busy={busy} act={act} />

      {graph.todos?.length > 0 && (
        <section className="panel" data-component="ProjectTodos">
          <h2>To-dos it waits on {graph.todos.filter((t) => t.status === 'open').length > 0 && <Badge tone="warn">{graph.todos.filter((t) => t.status === 'open').length} open</Badge>}</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>Work outside the code this project needs. They belong to the app; <Link to="/todos">all to-dos</Link>.</p>
          <div className="todo-list">{graph.todos.map((t) => <TodoCard key={t.id} todo={t} compact onChange={() => undefined} onError={(e) => window.alert(e)} />)}</div>
        </section>
      )}

      <ol className="task-strip">
        {graph.issues.map((t, n) => (
          <IssueChip key={t.id} issue={t} subIssues={graph.subIssues.filter((p) => p.parentId === t.id)} planning={planning(t.id)} waiting={waitingForModel(t.id)}
            onPlan={!['landed', 'stopped', 'superseded'].includes(graph.project.status) && !planning(t.id) && t.state === 'todo' ? () => act(() => engine.planIssue(t.id)) : undefined}
            onReplan={draft && !planning(t.id) ? () => { if (window.confirm('Remove this task\'s sub-tasks, decisions and questions and plan it again?')) void act(async () => { await engine.clearSubIssues(t.id); await engine.planIssue(t.id) }) } : undefined}
            onEarlier={draft && n > 0 ? () => move(n, n - 1) : undefined} onLater={draft && n < graph.issues.length - 1 ? () => move(n, n + 1) : undefined}
            busy={busy} />
        ))}
      </ol>

      {graph.subIssues.length
        ? <PlanGraphView subIssues={graph.subIssues} files={graph.files} storageKey={graph.project.id} labels={Object.fromEntries(graph.subIssues.map((p) => [p.id, short(issueOf(p)?.title ?? '')]))} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} />
        : <div className="empty">Nothing planned yet. <strong>Plan</strong> a task above: the planner reads the repo and the task's brief and proposes sub-tasks, decisions and questions. Or write them by hand with <code>pnpm se issue sub-issues</code>.</div>}

      {(graph.questions.length > 0 || graph.decisions.length > 0) && (
        <div className="project-lower">
          <section className="panel">
            <h2>Questions {open.length > 0 && <Badge tone="warn">{open.length} open</Badge>}</h2>
            {graph.questions.length ? <div className="cards">{graph.questions.map((q) => <QuestionCard key={q.id} q={q} issue={graph.issues.find((t) => t.id === q.issueId)} busy={busy} act={act} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>The planner had nothing to ask.</p>}
          </section>
          <section className="panel">
            <h2>Decisions</h2>
            {graph.decisions.length ? <div className="cards">{graph.decisions.map((d) => <DecisionCard key={d.id} d={d} issue={graph.issues.find((t) => t.id === d.issueId)} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>Nothing settled yet.</p>}
          </section>
        </div>
      )}

      <div className="project-lower">
        <section className="panel">
          {selected ? <SubIssueDetail phase={selected} issue={issueOf(selected)} planStatus={graph.project.status} busy={busy} act={act} />
            : <p className="muted" style={{ margin: 0 }}>Click a sub-task to see its brief, files, dependencies, steps and last run.</p>}
        </section>
        <section className="panel">
          <h2>Events</h2>
          <Ticker events={events} subIssues={graph.subIssues} />
        </section>
      </div>
    </>
  )
}

const SOURCE_LABEL: Record<BacklogIssue['source'], string> = { person: 'you', agent: 'agent', idea: 'idea', planner: 'planner', builder: 'builder' }

/**
 * Everything the project has to cover, so nobody has to remember it: its issues in Backlog. Each is taken on (it joins
 * the work, at the end), made a to-do, marked a duplicate of an issue that covers it, or dropped with a reason; the
 * project lands only when nothing is left here.
 */
function BacklogPanel({ graph, busy, act }: { graph: Graph; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [text, setText] = useState('')
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [showDone, setShowDone] = useState(false)
  const closed = ['landed', 'stopped', 'superseded'].includes(graph.project.status)
  useEffect(() => { if (!closed) engine.ideas(graph.app.id).then(setIdeas).catch(() => setIdeas([])) }, [graph.app.id, closed, graph.backlog.length])
  const items = graph.backlog ?? []
  const open = items.filter((i) => i.state === 'backlog' || i.state === 'triage')
  const done = items.filter((i) => !open.includes(i))
  const inBacklog = new Set(items.filter((i) => i.state !== 'canceled').map((i) => i.ideaId))
  const addable = ideas.filter((i) => i.lane === 'inbox' && !inBacklog.has(i.id))
  const workDone = graph.subIssues.length > 0 && graph.subIssues.every((p) => p.status === 'done') && graph.issues.every((t) => t.subIssueIds.length)
  const add = () => { const t = text.trim(); if (!t) return; void act(async () => { await engine.addBacklog(graph.project.id, t); setText('') }) }
  const issueLabel = (id: string | null) => { const t = graph.issues.find((x) => x.id === id); return t ? `${t.identifier} ${t.title}` : 'a task' }
  return (
    <section className="panel backlog" data-component="BacklogPanel">
      <h2>Backlog {open.length > 0 && <Badge tone={workDone && graph.project.status === 'running' ? 'warn' : 'neutral'}>{open.length} open</Badge>}
        {workDone && open.length > 0 && graph.project.status === 'running' && <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}> · the work has landed; the project lands when these are taken on or dropped</span>}</h2>
      {!items.length && <p className="muted" style={{ margin: '0 0 10px' }}>Everything this project has to cover. Add what you don't want to forget; the planner and builders add what they notice. Each is taken on, covered by a task the project has, or dropped with a reason, and the project lands only when nothing is left here.</p>}
      {open.length > 0 && <ul className="backlog-items">{open.map((i) => (
        <li key={i.id}>
          <div><span className="mono faint">{i.identifier}</span> <span>{i.title}</span> <Badge>{SOURCE_LABEL[i.source]}</Badge>{i.description && <div className="faint" style={{ fontSize: 13 }}>{i.description}</div>}</div>
          {!closed && <span className="backlog-actions">
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.takeOn(i.id))} title="It joins the work, at the end of the project">Take on</button>
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.itemToTodo(i.id))} title="Work outside the code: a to-do of the app, with a checklist">To-do</button>
            {graph.issues.length > 0 && <select className="small" disabled={busy} value="" onChange={(e) => { const id = e.target.value; if (id) void act(() => engine.markDuplicate(i.id, id)) }} title="A task the project already has does this: this one is a duplicate of it">
              <option value="">Covered by…</option>
              {graph.issues.map((t) => <option key={t.id} value={t.id}>{t.identifier} {t.title}</option>)}
            </select>}
            <button className="btn quiet small" disabled={busy} onClick={() => { const why = window.prompt(`Drop "${i.title}"? Say why, so the backlog remembers.`); if (why?.trim()) void act(() => engine.dropItem(i.id, why.trim())) }}>Drop</button>
          </span>}
        </li>))}</ul>}
      {!closed && (
        <div className="backlog-add">
          <input value={text} placeholder="Something this project must not forget" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button className="btn small" disabled={busy || !text.trim()} onClick={add}>Add</button>
          {addable.length > 0 && <select className="small" disabled={busy} value="" onChange={(e) => { const id = e.target.value; if (id) void act(() => engine.addIdeaToBacklog(graph.project.id, id)) }}>
            <option value="">Add an idea…</option>
            {addable.map((i) => <option key={i.id} value={i.id}>#{i.number} {i.title}</option>)}
          </select>}
        </div>
      )}
      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="linkish faint" onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} {done.filter((i) => i.state === 'duplicate').length} covered, {done.filter((i) => i.state === 'canceled').length} dropped</button>
          {showDone && <ul className="backlog-items done">{done.map((i) => (
            <li key={i.id}>
              <div><span className="mono faint">{i.identifier}</span> <span>{i.title}</span> <Badge>{SOURCE_LABEL[i.source]}</Badge>
                <div className="faint" style={{ fontSize: 13 }}>{i.state === 'duplicate' ? `→ ${issueLabel(i.duplicateOf)}${i.reason && !i.reason.startsWith('covered by') ? ` (${i.reason})` : ''}` : `dropped: ${i.reason}`}</div></div>
              {!closed && <span className="backlog-actions"><button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.reopenItem(i.id))}>Reopen</button></span>}
            </li>))}</ul>}
        </div>
      )}
    </section>
  )
}

function IssueChip({ issue: task, subIssues: phases, planning, waiting, onPlan, onReplan, onEarlier, onLater, busy }: { issue: GraphIssue; subIssues: GraphSubIssue[]; planning: boolean; waiting?: boolean; onPlan?: () => void; onReplan?: () => void; onEarlier?: () => void; onLater?: () => void; busy: boolean }) {
  const done = phases.filter((p) => p.status === 'done').length
  const live = phases.some((p) => ['running', 'merging', 'testing'].includes(p.status))
  const tone: Tone = phases.length && done === phases.length ? 'ok' : live ? 'accent' : 'neutral'
  return (
    <li className="task-chip" data-component="IssueChip" title={task.description ?? task.brief?.slice(0, 300) ?? undefined}>
      <span className="mono faint"><Link to={`/tasks/${task.id}`}>{task.identifier}</Link>{['done', 'in_review', 'canceled'].includes(task.state) ? ` · ${STATE_LABEL[task.state]}` : ''}</span>
      <strong>{task.title}</strong>
      {(onEarlier || onLater) && <span className="chip-order"><button className="linkish" disabled={busy || !onEarlier} onClick={onEarlier} title="Earlier">←</button><button className="linkish" disabled={busy || !onLater} onClick={onLater} title="Later">→</button></span>}
      {planning ? <Badge tone={waiting ? 'warn' : 'accent'} dot>{waiting ? 'waiting for the model' : 'planning…'}</Badge>
        : phases.length ? <><Badge tone={tone} dot={live}>{done}/{phases.length} sub-tasks</Badge>{onReplan && <button className="btn quiet small" disabled={busy} onClick={onReplan} title="Remove the sub-tasks and plan this task again">Plan again</button>}</>
        : onPlan ? <button className="btn quiet small" disabled={busy} onClick={onPlan}>Plan</button> : <Badge>not planned</Badge>}
    </li>
  )
}

function QuestionCard({ q, issue, busy, act }: { q: Question; issue?: GraphIssue; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const rec = q.options.find((o) => o.recommended)
  return (
    <div className={`card ${q.status}`} data-component="QuestionCard">
      <div className="card-head">
        <span className="mono faint">{issue?.identifier ?? ''}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          {q.cost && <Badge tone={COST_TONE[q.cost]}>{q.cost}</Badge>}
          <Badge tone={q.status === 'open' ? 'warn' : 'ok'}>{q.status}</Badge>
        </span>
      </div>
      <div className="card-title">{q.text}</div>
      {q.status === 'open' ? (
        <>
          <div className="opts">
            {q.options.map((o) => (
              <button key={o.label} className={`btn quiet ${o.recommended ? 'rec' : ''}`} disabled={busy} title={o.description} onClick={() => act(() => engine.answer(q.id, o.label))}>
                {o.label}{o.recommended ? ' · recommended' : ''}{o.changes?.length ? ` · changes ${o.changes.join(', ')}` : ''}
              </button>
            ))}
          </div>
          {rec && q.reason && <div className="faint" style={{ marginTop: 6, fontSize: 13 }}>Why {rec.label}: {q.reason}</div>}
          {q.options.some((o) => o.description) && <ul className="faint" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{q.options.filter((o) => o.description).map((o) => <li key={o.label}><strong>{o.label}</strong>: {o.description}</li>)}</ul>}
        </>
      ) : <div style={{ marginTop: 6 }}>Answer: <strong>{q.answer}</strong>{rec && q.answer !== rec.label ? <span className="faint"> (the planner recommended {rec.label}; the sub-tasks assume it)</span> : null}</div>}
    </div>
  )
}

function DecisionCard({ d, issue }: { d: Decision; issue?: GraphIssue }) {
  const chosen = d.options.find((o) => o.key === d.chosen) ?? d.options[0]
  const rejected = d.options.filter((o) => o !== chosen)
  return (
    <div className="card" data-component="DecisionCard">
      <div className="card-head">
        <span className="mono faint">{issue?.identifier ?? ''}</span>
        {d.provisional && <Badge>provisional</Badge>}
      </div>
      <div className="card-title">{d.question}</div>
      <div style={{ marginTop: 4 }}>{chosen?.text}</div>
      {d.rationale && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>{d.rationale}</div>}
      {rejected.length > 0 && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>Rejected: {rejected.map((o) => o.text).join('; ')}</div>}
    </div>
  )
}

function SubIssueDetail({ phase, issue: task, planStatus, busy, act }: { phase: GraphSubIssue; issue?: GraphIssue; planStatus: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const manual = planStatus !== 'running' // the executor owns running projects; by hand only for drafts and demos
  const steps = phase.steps ?? []
  return (
    <>
      <h2><Link to={`/tasks/${phase.id}`}>{phase.identifier}</Link> {phase.title} <Badge tone={STATUS_TONE[phase.status]}>{phase.status.replace('_', ' ')}</Badge></h2>
      <dl className="fields">
        <dt>Task</dt><dd>{task ? <><Link to={`/tasks/${task.id}`}>{task.identifier}</Link> {task.title}{task.description && <div className="faint" style={{ fontSize: 13 }}>{task.description}</div>}</> : '—'}</dd>
        <dt>What</dt><dd><Brief description={phase.description} brief={phase.brief} /></dd>
        <dt>Files</dt><dd>{phase.files.length ? <span className="mono">{phase.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
        <dt>Depends on</dt><dd>
          {phase.dependsOn.length ? `${phase.dependsOn.length} sub-task${phase.dependsOn.length > 1 ? 's' : ''}` : <span className="faint">Nothing explicit.</span>}
          {phase.orderedAfter?.length ? <span className="faint"> Task order: after {phase.orderedAfter.length} sub-task{phase.orderedAfter.length > 1 ? 's' : ''} of the task before.</span> : null}
        </dd>
        <dt>Held</dt><dd>{phase.heldReason ?? <span className="faint">Not held.</span>}</dd>
        <dt>Branch</dt><dd>{phase.branch ? <span className="mono">{phase.branch}</span> : <span className="faint">Not started.</span>}</dd>
        <dt>Attempts</dt><dd>{phase.attempt} of {phase.maxAttempts}</dd>
        {steps.length > 0 && <><dt>Steps</dt><dd>
          <ul className="steps">{steps.map((s) => <li key={s.id} className={s.status}><span className="mono">{s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'}</span> {s.text}</li>)}</ul>
        </dd></>}
        {phase.lastRun && <><dt>Last run</dt><dd>{phase.lastRun.status}{phase.lastRun.model ? ` · ${phase.lastRun.model}` : ''}{phase.lastRun.costUsd ? ` · $${Number(phase.lastRun.costUsd).toFixed(2)} est.` : ''}
          {phase.lastRun.summary && <div className="summary">{phase.lastRun.summary}</div>}
          {phase.lastRun.error && <div className="summary bad">{phase.lastRun.error}</div>}</dd></>}
      </dl>
      {['failed', 'cancelled'].includes(phase.status) && (
        <div className="retry-row">
          <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(phase.id))} title="Three more attempts in the same worktree; the builder is told why the last one failed">Retry</button>
          <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm(`Start ${phase.identifier} over from the project's branch? What the last attempt left in its worktree is thrown away.`)) void act(() => engine.retry(phase.id, true)) }}>Retry from scratch</button>
          {planStatus === 'stopped' && <span className="faint" style={{ fontSize: 13 }}>The project is stopped; retrying resumes it, with its other cancelled sub-tasks.</span>}
        </div>
      )}
      {manual && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="faint mono" style={{ alignSelf: 'center' }}>by hand:</span>
          {(['running', 'done', 'failed', 'queued'] as const).map((s) => (
            <button key={s} className="btn quiet" disabled={busy || phase.status === s} onClick={() => act(() => engine.setBuild(phase.id, s))}>{s}</button>
          ))}
        </div>
      )}
    </>
  )
}

function Ticker({ events, subIssues }: { events: Event[]; subIssues: GraphSubIssue[] }) {
  const num = (id: string | null) => subIssues.find((x) => x.id === id)?.identifier ?? ''
  const shown = events.filter((e) => !['run.tool_result', 'run.rate_limit'].includes(e.type)).slice(-40).reverse()
  if (!shown.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
  return (
    <ul className="ticker">
      {shown.map((e) => (
        <li key={e.seq}>
          <span className="mono faint">{e.ts.slice(11, 19)}</span>
          <span className="mono">{num(e.issueId)}</span>
          <span className="mono">{e.type}</span>
          <span className="muted">{summarise(e)}</span>
        </li>
      ))}
    </ul>
  )
}

function summarise(e: Event): string {
  const p = e.payload as any
  switch (e.type) {
    case 'build.status': return `${p.from} → ${p.to}${p.why ? ` (${p.why})` : ''}`
    case 'build.held': return p.reason
    case 'build.retry': return `attempt ${p.attempt} of ${p.max}: ${String(p.why).slice(0, 120)}`
    case 'issue.state': return `${p.identifier ?? ''} ${p.from} → ${p.to}${p.reason ? ` (${p.reason})` : ''}`
    case 'issue.created': return `${p.identifier ?? ''} ${p.title}`
    case 'issue.planning': return `the planner is reading the repo (attempt ${p.attempt})`
    case 'issue.planned': return `${(p.subIssues ?? p.phases ?? []).length} sub-tasks · ${p.decisions} decisions · ${p.questions} questions${p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)} est.` : ''}`
    case 'issue.plan_failed': return String(p.error).slice(0, 160)
    case 'question.asked': return `[${p.cost}] ${p.text}`
    case 'question.answered': return String(p.answer)
    case 'run.steps': return `${(p.steps ?? []).filter((s: any) => s.status === 'completed').length}/${(p.steps ?? []).length} steps`
    case 'run.tool_call': return `${p.tool} ${p.input?.command ?? p.input?.file ?? p.input?.pattern ?? ''}`.slice(0, 120)
    case 'run.message': return String(p.text).slice(0, 160)
    case 'run.result': return `${p.subtype} · ${p.turns} turns · $${Number(p.costUsd ?? 0).toFixed(2)} est.`
    case 'land.tested': return p.ok ? 'tests passed on the merged commit' : `tests failed (exit ${p.code})`
    case 'land.landed': return `fast-forwarded ${p.integrationBranch} to ${String(p.sha).slice(0, 7)}`
    case 'pr.opened': case 'pr.updated': return `#${p.number} · ${p.landed} landed`
    default: return Object.keys(p).length ? JSON.stringify(p).slice(0, 120) : ''
  }
}
