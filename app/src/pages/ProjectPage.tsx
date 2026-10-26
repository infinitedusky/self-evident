/**
 * One project, live: its tasks in order (project one with a click), the phase graph, the planner's questions and
 * decisions, the selected phase's detail and steps, the event ticker, the PR.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView, STATUS_TONE } from '../components/PlanGraphView'
import { Brief } from '../components/Brief'
import { engine, useLiveProject, type BacklogItem, type Graph, type IdeaRow, type Decision, type Event, type GraphPhase, type GraphTask, type Question } from '../engine'
import { useCurrentApp } from '../current-app'
import { TodoCard } from './Todos'

const PROJECT_TONE: Record<string, Tone> = { paused: 'warn', drafting: 'neutral', proposed: 'neutral', approved: 'neutral', running: 'accent', landed: 'ok', stopped: 'warn', superseded: 'neutral' }
const COST_TONE: Record<string, Tone> = { cheap: 'neutral', moderate: 'warn', expensive: 'bad' }
const short = (t: string) => (t.length > 28 ? t.slice(0, 26).trimEnd() + '…' : t)

export function ProjectPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { graph, events, error } = useLiveProject(id)
  const { app, setAppId } = useCurrentApp()
  const synced = useRef(false) // one app at a time: the app follows the project you open; switching apps leaves this project
  useEffect(() => {
    if (!graph || !app) return
    if (app.id === graph.app.id) { synced.current = true; return }
    if (!synced.current) setAppId(graph.app.id)
    else nav('/projects')
  }, [graph?.app.id, app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedId, setSelectedId] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (error && !graph) return <p className="muted">{error}</p>
  if (!graph) return <p className="muted">Loading…</p>
  const selected = graph.phases.find((p) => p.id === selectedId) ?? null
  const taskOf = (p: GraphPhase) => graph.tasks.find((t) => t.id === p.taskId)
  const draft = ['drafting', 'proposed', 'approved'].includes(graph.project.status)
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  // A task is being planned from its last planning event until the planner reports back.
  const lastPlanEvent = (taskId: string) => events.filter((e) => e.taskId === taskId && e.type.startsWith('task.plan')).at(-1)?.type
  const planning = (taskId: string) => ['task.planning', 'task.plan_waiting'].includes(lastPlanEvent(taskId) ?? '')
  const waitingForModel = (taskId: string) => lastPlanEvent(taskId) === 'task.plan_waiting'
  const open = graph.questions.filter((q) => q.status === 'open')
  return (
    <>
      <p className="mono"><Link to="/projects">← Projects</Link></p>
      <div className="page-head">
        <div>
          <h1>{graph.project.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Badge tone={PROJECT_TONE[graph.project.status] ?? 'neutral'} dot={graph.project.status === 'running'}>{graph.project.status}</Badge>
            <Badge>{graph.app.name}</Badge>
            {graph.project.integrationBranch && <Badge><span className="mono">{graph.project.integrationBranch}</span></Badge>}
            {graph.pr && <a className="badge accent" href={graph.pr.url} target="_blank" rel="noreferrer">PR #{graph.pr.number} · {graph.pr.status}</a>}
            {error && <Badge tone="warn" dot>{error}</Badge>}
          </div>
          {graph.project.spec && <p className="muted" style={{ margin: '8px 0 0', maxWidth: 720 }}>{graph.project.spec}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draft && (
            <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm('Discard this draft? Its tasks, phases, questions and decisions go with it.')) void act(async () => { await engine.cancelProject(graph.project.id); nav('/projects') }) }}>Discard draft</button>
          )}
          {graph.project.status === 'running' && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.pause(graph.project.id))} title="Nothing new starts; running agents stop and resume where they were">Pause</button>}
          {graph.project.status === 'paused' && <button className="btn" disabled={busy} onClick={() => act(() => engine.resume(graph.project.id))}>Resume</button>}
          {['running', 'paused'].includes(graph.project.status) && (
            <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm('Cancel this project? Running agents are stopped; what has landed stays on its branch.')) void act(() => engine.cancelProject(graph.project.id)) }}>Cancel project</button>
          )}
          {draft && graph.phases.length > 0 && (
            <button className="btn" disabled={busy} onClick={() => act(() => engine.start(graph.project.id))}>Run this project</button>
          )}
        </div>
      </div>

      <BacklogPanel graph={graph} busy={busy} act={act} />

      {graph.todos?.length > 0 && (
        <section className="panel" data-component="ProjectTodos">
          <h2>To-dos it waits on {graph.todos.filter((t) => t.status === 'open').length > 0 && <Badge tone="warn">{graph.todos.filter((t) => t.status === 'open').length} open</Badge>}</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>Work outside the code this project needs. They belong to the app; <Link to="/todos">all to-dos</Link>.</p>
          <div className="todo-list">{graph.todos.map((t) => <TodoCard key={t.id} todo={t} compact onChange={() => undefined} onError={(e) => window.alert(e)} />)}</div>
        </section>
      )}

      <ol className="task-strip">
        {graph.tasks.map((t) => (
          <TaskChip key={t.id} task={t} phases={graph.phases.filter((p) => p.taskId === t.id)} planning={planning(t.id)} waiting={waitingForModel(t.id)}
            onPlan={!['landed', 'stopped', 'superseded'].includes(graph.project.status) && !planning(t.id) ? () => act(() => engine.planTask(t.id)) : undefined}
            onReplan={draft && !planning(t.id) ? () => { if (window.confirm('Remove this task\'s phases, decisions and questions and plan it again?')) void act(async () => { await engine.clearPhases(t.id); await engine.planTask(t.id) }) } : undefined}
            busy={busy} />
        ))}
      </ol>

      {graph.phases.length
        ? <PlanGraphView phases={graph.phases} files={graph.files} storageKey={graph.project.id} labels={Object.fromEntries(graph.phases.map((p) => [p.id, short(taskOf(p)?.title ?? '')]))} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} />
        : <div className="empty">No phases yet. <strong>Plan</strong> a task above: the planner reads the repo and the task's brief and proposes phases, decisions and questions. Or write phases by hand with <code>pnpm if task phases</code>.</div>}

      {(graph.questions.length > 0 || graph.decisions.length > 0) && (
        <div className="project-lower">
          <section className="panel">
            <h2>Questions {open.length > 0 && <Badge tone="warn">{open.length} open</Badge>}</h2>
            {graph.questions.length ? <div className="cards">{graph.questions.map((q) => <QuestionCard key={q.id} q={q} task={graph.tasks.find((t) => t.id === q.taskId)} busy={busy} act={act} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>The planner had nothing to ask.</p>}
          </section>
          <section className="panel">
            <h2>Decisions</h2>
            {graph.decisions.length ? <div className="cards">{graph.decisions.map((d) => <DecisionCard key={d.id} d={d} task={graph.tasks.find((t) => t.id === d.taskId)} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>Nothing settled yet.</p>}
          </section>
        </div>
      )}

      <div className="project-lower">
        <section className="panel">
          {selected ? <PhaseDetail phase={selected} task={taskOf(selected)} planStatus={graph.project.status} busy={busy} act={act} />
            : <p className="muted" style={{ margin: 0 }}>Click a phase to see its brief, files, dependencies, steps and last run.</p>}
        </section>
        <section className="panel">
          <h2>Events</h2>
          <Ticker events={events} phases={graph.phases} />
        </section>
      </div>
    </>
  )
}

const SOURCE_LABEL: Record<BacklogItem['source'], string> = { person: 'you', agent: 'agent', idea: 'idea', planner: 'planner', builder: 'builder' }

/**
 * Everything the project has to cover, so nobody has to remember it. Each item becomes a task, is covered by one the
 * project has, or is dropped with a reason; the project lands only when nothing here is open.
 */
function BacklogPanel({ graph, busy, act }: { graph: Graph; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [text, setText] = useState('')
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [showDone, setShowDone] = useState(false)
  const closed = ['landed', 'stopped', 'superseded'].includes(graph.project.status)
  useEffect(() => { if (!closed) engine.ideas(graph.app.id).then(setIdeas).catch(() => setIdeas([])) }, [graph.app.id, closed, graph.backlog.length])
  const items = graph.backlog ?? []
  const open = items.filter((i) => i.state === 'open')
  const done = items.filter((i) => i.state !== 'open')
  const inBacklog = new Set(items.filter((i) => i.state !== 'dropped').map((i) => i.ideaId))
  const addable = ideas.filter((i) => i.lane === 'inbox' && !inBacklog.has(i.id))
  const workDone = graph.phases.length > 0 && graph.phases.every((p) => p.status === 'done') && graph.tasks.every((t) => t.phaseIds.length)
  const add = () => { const t = text.trim(); if (!t) return; void act(async () => { await engine.addBacklog(graph.project.id, t); setText('') }) }
  const taskLabel = (id: string | null) => { const t = graph.tasks.find((x) => x.id === id); return t ? `task #${t.number} ${t.title}` : 'a task' }
  return (
    <section className="panel backlog" data-component="BacklogPanel">
      <h2>Backlog {open.length > 0 && <Badge tone={workDone && graph.project.status === 'running' ? 'warn' : 'neutral'}>{open.length} open</Badge>}
        {workDone && open.length > 0 && graph.project.status === 'running' && <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}> · the work has landed; the project lands when these are covered or dropped</span>}</h2>
      {!items.length && <p className="muted" style={{ margin: '0 0 10px' }}>Everything this project has to cover. Add what you don't want to forget; the planner and builders add what they notice. Each item becomes a task, is covered by one, or is dropped with a reason, and the project lands only when nothing here is open.</p>}
      {open.length > 0 && <ul className="backlog-items">{open.map((i) => (
        <li key={i.id}>
          <div><span>{i.text}</span> <Badge>{SOURCE_LABEL[i.source]}</Badge>{i.body && <div className="faint" style={{ fontSize: 13 }}>{i.body}</div>}</div>
          {!closed && <span className="backlog-actions">
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.itemToTask(i.id))} title="A new task at the end of the project">Make a task</button>
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.itemToTodo(i.id))} title="Work outside the code: a to-do of the app, with a checklist">To-do</button>
            {graph.tasks.length > 0 && <select className="small" disabled={busy} value="" onChange={(e) => { const id = e.target.value; if (id) void act(() => engine.coverItem(i.id, id)) }} title="A task the project already has does this">
              <option value="">Covered by…</option>
              {graph.tasks.map((t) => <option key={t.id} value={t.id}>task #{t.number} {t.title}</option>)}
            </select>}
            <button className="btn quiet small" disabled={busy} onClick={() => { const why = window.prompt(`Drop "${i.text}"? Say why, so the backlog remembers.`); if (why?.trim()) void act(() => engine.dropItem(i.id, why.trim())) }}>Drop</button>
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
          <button className="linkish faint" onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} {done.filter((i) => i.state === 'covered').length} covered, {done.filter((i) => i.state === 'dropped').length} dropped</button>
          {showDone && <ul className="backlog-items done">{done.map((i) => (
            <li key={i.id}>
              <div><span>{i.text}</span> <Badge>{SOURCE_LABEL[i.source]}</Badge>
                <div className="faint" style={{ fontSize: 13 }}>{i.state === 'covered' ? `→ ${i.todoId ? 'a to-do' : taskLabel(i.taskId)}${i.reason ? ` (${i.reason})` : ''}` : `dropped: ${i.reason}`}</div></div>
              {!closed && <span className="backlog-actions"><button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.reopenItem(i.id))}>Reopen</button></span>}
            </li>))}</ul>}
        </div>
      )}
    </section>
  )
}

function TaskChip({ task, phases, planning, waiting, onPlan, onReplan, busy }: { task: GraphTask; phases: GraphPhase[]; planning: boolean; waiting?: boolean; onPlan?: () => void; onReplan?: () => void; busy: boolean }) {
  const done = phases.filter((p) => p.status === 'done').length
  const live = phases.some((p) => ['running', 'merging', 'testing'].includes(p.status))
  const tone: Tone = phases.length && done === phases.length ? 'ok' : live ? 'accent' : 'neutral'
  return (
    <li className="task-chip" data-component="TaskChip" title={task.description ?? task.brief?.slice(0, 300) ?? undefined}>
      <span className="mono faint">task #{task.number}</span>
      <strong>{task.title}</strong>
      {planning ? <Badge tone={waiting ? 'warn' : 'accent'} dot>{waiting ? 'waiting for the model' : 'planning…'}</Badge>
        : phases.length ? <><Badge tone={tone} dot={live}>{done}/{phases.length} phases</Badge>{onReplan && <button className="btn quiet small" disabled={busy} onClick={onReplan} title="Remove the phases and plan this task again">Plan again</button>}</>
        : onPlan ? <button className="btn quiet small" disabled={busy} onClick={onPlan}>Plan</button> : <Badge>no phases</Badge>}
    </li>
  )
}

function QuestionCard({ q, task, busy, act }: { q: Question; task?: GraphTask; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const rec = q.options.find((o) => o.recommended)
  return (
    <div className={`card ${q.status}`} data-component="QuestionCard">
      <div className="card-head">
        <span className="mono faint">{task ? `task #${task.number}` : ''}</span>
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
      ) : <div style={{ marginTop: 6 }}>Answer: <strong>{q.answer}</strong>{rec && q.answer !== rec.label ? <span className="faint"> (the planner recommended {rec.label}; the phases assume it)</span> : null}</div>}
    </div>
  )
}

function DecisionCard({ d, task }: { d: Decision; task?: GraphTask }) {
  const chosen = d.options.find((o) => o.key === d.chosen) ?? d.options[0]
  const rejected = d.options.filter((o) => o !== chosen)
  return (
    <div className="card" data-component="DecisionCard">
      <div className="card-head">
        <span className="mono faint">{task ? `task #${task.number}` : ''}</span>
        {d.provisional && <Badge>provisional</Badge>}
      </div>
      <div className="card-title">{d.question}</div>
      <div style={{ marginTop: 4 }}>{chosen?.text}</div>
      {d.rationale && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>{d.rationale}</div>}
      {rejected.length > 0 && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>Rejected: {rejected.map((o) => o.text).join('; ')}</div>}
    </div>
  )
}

function PhaseDetail({ phase, task, planStatus, busy, act }: { phase: GraphPhase; task?: GraphTask; planStatus: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const manual = planStatus !== 'running' // the executor owns running projects; by hand only for drafts and demos
  const steps = phase.steps ?? []
  return (
    <>
      <h2>#{phase.number} {phase.title} <Badge tone={STATUS_TONE[phase.status]}>{phase.status.replace('_', ' ')}</Badge></h2>
      <dl className="fields">
        <dt>Task</dt><dd>{task ? <>#{task.number} {task.title}{task.description && <div className="faint" style={{ fontSize: 13 }}>{task.description}</div>}</> : '—'}</dd>
        <dt>What</dt><dd><Brief description={phase.description} brief={phase.brief} /></dd>
        <dt>Files</dt><dd>{phase.files.length ? <span className="mono">{phase.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
        <dt>Depends on</dt><dd>
          {phase.dependsOn.length ? `${phase.dependsOn.length} phase${phase.dependsOn.length > 1 ? 's' : ''}` : <span className="faint">Nothing explicit.</span>}
          {phase.orderedAfter?.length ? <span className="faint"> Task order: after {phase.orderedAfter.length} phase{phase.orderedAfter.length > 1 ? 's' : ''} of the task before.</span> : null}
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
          <button className="btn quiet" disabled={busy} onClick={() => { if (window.confirm(`Start #${phase.number} over from the project's branch? What the last attempt left in its worktree is thrown away.`)) void act(() => engine.retry(phase.id, true)) }}>Retry from scratch</button>
          {planStatus === 'stopped' && <span className="faint" style={{ fontSize: 13 }}>The project is stopped; retrying resumes it, with its other cancelled phases.</span>}
        </div>
      )}
      {manual && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="faint mono" style={{ alignSelf: 'center' }}>by hand:</span>
          {(['running', 'done', 'failed', 'queued'] as const).map((s) => (
            <button key={s} className="btn quiet" disabled={busy || phase.status === s} onClick={() => act(() => engine.setStatus(phase.id, s))}>{s}</button>
          ))}
        </div>
      )}
    </>
  )
}

function Ticker({ events, phases }: { events: Event[]; phases: GraphPhase[] }) {
  const num = (id: string | null) => { const p = phases.find((x) => x.id === id); return p ? `#${p.number}` : '' }
  const shown = events.filter((e) => !['run.tool_result', 'run.rate_limit'].includes(e.type)).slice(-40).reverse()
  if (!shown.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
  return (
    <ul className="ticker">
      {shown.map((e) => (
        <li key={e.seq}>
          <span className="mono faint">{e.ts.slice(11, 19)}</span>
          <span className="mono">{num(e.phaseId)}</span>
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
    case 'phase.status': return `${p.from} → ${p.to}${p.why ? ` (${p.why})` : ''}`
    case 'phase.held': return p.reason
    case 'phase.retry': return `attempt ${p.attempt} of ${p.max}: ${String(p.why).slice(0, 120)}`
    case 'task.planning': return `the planner is reading the repo (attempt ${p.attempt})`
    case 'task.planned': return `${(p.phases ?? []).length} phases · ${p.decisions} decisions · ${p.questions} questions${p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)} est.` : ''}`
    case 'task.plan_failed': return String(p.error).slice(0, 160)
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
