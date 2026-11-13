/**
 * One issue: what it says, where it sits, and its sub-issues as a list, not a graph (Sandy, 2026-10-27: "see a single
 * task and look at all of its phases, not in a graph but just in a list"). Under code, each sub-issue with its build;
 * under a to-do, its checklist. Live on the app's events.
 *
 * A task (a top-level code issue) is laid out like Settings: its own nav down the left (TaskNav), its overview first,
 * then a page per step in its workflow's order, then the build, each at its own address: /tasks/:id/:section.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge, type Tone } from '../components/Badge'
import { Brief } from '../components/Brief'
import { askStep, useSteps } from '../components/StepsPanel'
import { StepSection } from '../components/StepSection'
import { Acceptance } from '../components/Acceptance'
import { TaskBranches } from '../components/TaskBranches'
import { MergeGuide } from '../components/MergeGuide'
import { mark, TaskNav } from '../components/TaskNav'
import { TASK_AGENT_ASKED, TaskAgent, useTaskAgent } from '../components/TaskAgent'
import { finished, label, ready, step, type Row, type StepKey } from '@self-evident/engine/steps'
import { STATUS_TONE } from '../components/PlanGraphView'
import { openEvents, type Events, API, engine, EVENT_TYPES, STATE_LABEL, type IssueDetail, type IssueState, type TaskBranches as TaskBranchesView } from '../engine'
import { Md } from '../components/Md'

/** Where a task's workflow comes from, after its name. */
const FROM = { task: ', its own', project: ', from its project', app: ', the app\'s default' }

export const STATE_TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }

export function IssuePage() {
  const { id, section } = useParams()
  const [i, setI] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null) // why the engine wouldn't delete it
  const nav = useNavigate()
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

  /** Delete: for a task made by mistake. The engine refuses one with work on it (runs, a pull request, checks, a prototype) and says to cancel it. */
  const remove = async () => {
    if (!i) return
    const subs = i.subIssues?.length ?? 0
    if (!window.confirm(`Delete ${i.identifier} "${i.title}"?${subs ? ` Its ${subs} sub-task${subs === 1 ? '' : 's'} go with it.` : ''} What was written on it goes too, and its conversation is ended. This can't be undone.`)) return
    setBusy(true); setRefused(null)
    try { await engine.deleteIssue(i.id); nav(i.parent ? `/tasks/${i.parent.id}` : '/tasks') }
    catch (e: any) { const m = String(e.message ?? e); try { setRefused(JSON.parse(m).error ?? m) } catch { setRefused(m) } } finally { setBusy(false) }
  }

  if (error && !i) return <div className="empty">{error}</div>
  if (!i) return <p className="muted">Loading…</p>
  const code = i.kind === 'code'
  const task = code && !i.parentId // a task: it has a brief to approve and steps
  return (
    <>
      <div className="page-head">
        <div>
          <div className="faint" style={{ fontSize: 13, marginBottom: 4 }}>
            {i.project && !i.project.solo ? <Link to={`/projects/${i.project.id}`}>{i.project.name}</Link> : <Link to="/tasks">In no project</Link>}
            {i.parent && <> · sub-task of <Link to={`/tasks/${i.parent.id}`}>{i.parent.identifier} {i.parent.title}</Link></>}
          </div>
          <h1><span className="mono faint" style={{ fontWeight: 400 }}>{i.identifier}</span> {i.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge tone={STATE_TONE[i.state]} dot={i.state === 'in_progress'}>{STATE_LABEL[i.state]}</Badge>
            <Badge>{code ? 'code' : 'to-do'}</Badge>
            {i.delegate && <Badge>with the {i.delegate}</Badge>}
            {i.runner === 'tkt' && <Badge tone="accent">run by tkt</Badge>}
            {i.build && <Badge tone={STATUS_TONE[i.build.status]}>build: {i.build.status.replace('_', ' ')}{i.build.attempt ? ` · attempt ${i.build.attempt}` : ''}</Badge>}
            {i.waitingOn && <Badge tone="warn">waiting on {i.waitingOn}</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {error && <Badge tone="warn" dot>{error}</Badge>}
          {i.build && ['failed', 'cancelled'].includes(i.build.status) && <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(i.id))}>Retry</button>}
          <button className="btn quiet" disabled={busy} onClick={() => void remove()} title="For a task made by mistake: it leaves nothing behind. One with work on it is canceled instead.">Delete</button>
        </div>
      </div>
      {refused && <div className="empty bad" style={{ marginBottom: 16 }}>{refused}</div>}

      {i.reason && <div className="empty" style={{ marginBottom: 16 }}>{STATE_LABEL[i.state]}: <Md text={i.reason} inline /></div>}
      {i.build?.heldReason && i.build.status !== 'done' && <div className="empty" style={{ marginBottom: 16 }}>{i.build.heldReason}</div>}

      {task ? <Task i={i} section={section} busy={busy} act={act} /> : (
        <>
          <section className="panel"><Brief description={i.description} brief={i.brief} open={!i.description} /></section>
          {code && <Steps i={i} />}
          <SubTasks i={i} />
          <Comments i={i} />
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
  const agent = useTaskAgent(i.id, i.appId)
  const [navOpen, setNavOpen] = useState(() => { try { return localStorage.getItem('se.task-nav.open') !== '0' } catch { return true } })
  const toggleNav = () => setNavOpen((o) => { try { localStorage.setItem('se.task-nav.open', o ? '0' : '1') } catch { /* fine */ } return !o })
  const base = `/tasks/${i.id}`
  // Its save points, for the nav: read again when one is made, deleted or gone back to.
  const [saved, setSaved] = useState<TaskBranchesView | null>(null)
  const [savesStamp, setSavesStamp] = useState(0)
  const readSaves = useCallback(() => { void engine.taskBranches(i.id).then(setSaved).catch(() => {}) }, [i.id])
  useEffect(() => { readSaves() }, [readSaves, section, i.updatedAt]) // an agent may have saved or moved it: read on each page of the task and when the task changes
  const navSaves = saved ? { current: saved.branches.find((b) => b.current)?.name ?? null, points: saved.saves.map((s) => ({ id: s.id, name: s.name })), aside: saved.branches.filter((b) => !b.current).map((b) => ({ id: b.id, name: b.name })) } : undefined
  const saveHere = async (name: string) => { await engine.saveHere(i.id, name).catch(() => {}); readSaves(); setSavesStamp((n) => n + 1) }
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const rows = v.rows
  const here = section === 'build' || section === 'saves' || rows.some((r) => r.key === section) ? section! : 'overview'
  if (section && here === 'overview') return <Navigate to={base} replace />
  const done = i.subIssues.filter((s) => s.state === 'done').length
  const buildWaits = i.briefApprovedBy ? null : 'the brief\'s approval'
  const row = rows.find((r) => r.key === here)
  const next = rows.find((r) => !r.waitingOn && r.state.status !== 'done' && r.key !== 'idea')
  const wf = v.resolved.workflow
  return (
    <div className={`task-layout with-agent ${agent.open ? '' : 'agent-folded'} ${navOpen ? '' : 'nav-folded'}`}>
      <TaskNav folded={!navOpen} onToggle={toggleNav} base={base} here={here} rows={rows} saves={navSaves} onSave={saveHere} workflow={wf && { name: wf.name, from: FROM[v.resolved.from!] }} build={{ done, total: i.subIssues.length, waitingOn: buildWaits }} />
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
            <Comments i={i} />
            <Planner i={i} />
          </>
        )}
        {row && (
          <StepSection subject={subject} appId={i.appId} name={i.title} row={row} base={base} fromIdea={v.fromIdea} waitingState={rows.find((r) => r.key === row.waitingOn)?.state} session={agent.session?.id}>
            {row.key === 'brief' ? <BriefStep i={i} busy={busy} act={act} feeds={rows.filter((r) => r.key !== 'brief')} base={base} /> : undefined}
          </StepSection>
        )}
        {here === 'saves' && <TaskBranches issueId={i.id} at={new URLSearchParams(window.location.search).get('at')} stamp={savesStamp} onMoved={() => void act(async () => {})} onChanged={readSaves} />}
        {here === 'build' && (buildWaits
          ? <section className="panel"><h2>🏗️ Sub-tasks</h2><div className="empty">Planning and building wait for the brief's approval. <Link to={`${base}/brief`}>Go to the brief →</Link></div></section>
          : <>
              <SubTasks i={i} plan={!i.subIssues.length && i.state === 'todo' ? <button className="btn" disabled={busy} onClick={() => act(() => engine.planIssue(i.id))}>Plan it</button> : null} />
              <Planner i={i} />
              {i.subIssues.length > 0 && <MergeGuide issueId={i.id} stamp={i.updatedAt} />}
            </>)}
      </div>
      {agent.session !== undefined && (
        <TaskAgent sessionId={agent.session?.id ?? null} taskId={i.id} stage={here === 'build' ? 'Build' : 'Brief'} state={agent.out.some((a) => a.asking) ? 'waiting' : agent.session?.busy ? 'working' : 'idle'}
          deployed={agent.out.map((a) => ({ what: a.what, icon: a.icon ?? '🛠️', title: a.title, sessionId: a.sessionId, runId: a.runId, detail: a.detail, failed: a.failed, state: a.busy ? 'out' as const : 'back' as const, asking: a.asking ? `${a.asking.tool}: ${a.asking.what}` : undefined }))}
          open={agent.open} onToggle={agent.toggle} onStart={agent.start} starting={agent.starting} error={agent.error} />
      )}
    </div>
  )
}

/**
 * What the brief stands on: the steps that feed it, each with what it has so far and a way to it. The brief is their
 * parent (Sandy, 2026-11-10: "the brief would include references to assets that we produce").
 */
function StandsOn({ feeds, base }: { feeds: Row[]; base: string }) {
  if (!feeds.length) return null
  return (
    <div className="brief-stands" data-component="BriefStandsOn">
      <h3>What it stands on</h3>
      <ul className="list">
        {feeds.map((r) => (
          <li key={r.key} className="brief-stands-row">
            <span className={`task-nav-mark ${finished(r.state, 'task') ? 'ok' : ''}`}>{mark(r, 'task')}</span>
            <Link to={`${base}/${r.key}`}>{step(r.key).icon} {label(r.key, 'task')}</Link>
            <span className="faint">{r.state.status === 'none' ? 'not started' : r.state.detail ?? (r.state.status === 'done' ? 'done' : 'started')}</span>
            {ready(r.state, 'task') && <Badge tone="warn">ready for you</Badge>}
            {r.required && !finished(r.state, 'task') && <Badge tone="warn">required</Badge>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The brief's page: the brief, what it stands on, and its approval, which waits for the required steps. */
function BriefStep({ i, busy, act, feeds, base }: { i: IssueDetail; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void>; feeds: Row[]; base: string }) {
  const [asked, setAsked] = useState(false)
  const owed = feeds.filter((r) => r.required && !finished(r.state, 'task'))
  const criteria = i.acceptance?.length ?? 0
  const unshown = (i.acceptance ?? []).filter((c) => !c.buildOnly && c.shown === false).length
  const left = (i.acceptance ?? []).filter((c) => c.buildOnly).length
  if (!i.brief?.trim()) return (
    <div>
      <p className="faint">No brief yet. Every step here feeds it, and the task is built from it once it's approved.</p>
      <div className="step-actions">
        <button className="btn" disabled={busy || asked} onClick={() => act(async () => { await askStep({ kind: 'issues', id: i.id }, i.appId, i.title, 'brief', 'task'); window.dispatchEvent(new Event(TASK_AGENT_ASKED)); setAsked(true) })}>Write it with the agent</button>
        {asked && <span className="faint">Handed to this task's agent, on the right.</span>}
      </div>
      <Acceptance issueId={i.id} items={i.acceptance ?? []} onChanged={() => void act(async () => {})} />
      <StandsOn feeds={feeds} base={base} />
    </div>
  )
  return (
    <>
      <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{i.brief}</Markdown></div>
      <Acceptance issueId={i.id} items={i.acceptance ?? []} approved={!!i.briefApprovedBy} onChanged={() => void act(async () => {})} />
      <StandsOn feeds={feeds} base={base} />
      <div className="brief-approval">
        {i.briefApprovedBy
          ? <><Badge tone="ok">brief approved</Badge><span className="faint">by {i.briefApprovedBy}{i.briefApprovedAt ? `, ${new Date(i.briefApprovedAt).toLocaleDateString()}` : ''}</span>
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id, false))}>Withdraw</button></>
          : owed.length
          ? <span className="faint">It can be approved once {owed.map((r, n) => <span key={r.key}>{n ? ', ' : ''}<Link to={`${base}/${r.key}`}>{label(r.key, 'task')}</Link></span>)} {owed.length === 1 ? 'is' : 'are'} done.</span>
          : <><Badge tone="warn">waiting for your approval</Badge><span className="faint">Planning and building wait for it. {criteria ? `Approving it approves its ${criteria === 1 ? 'acceptance criterion' : `${criteria} acceptance criteria`} as enough${unshown ? `; ${unshown} ${unshown === 1 ? 'was' : 'were'} not shown in the prototype` : ''}${left ? `; ${left} ${left === 1 ? 'is' : 'are'} left to the final build, unproven` : ''}.` : 'It has no acceptance criteria yet.'}</span>
            <button className="btn small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id))}>{criteria ? `Approve the brief and its ${criteria === 1 ? 'criterion' : `${criteria} criteria`}` : 'Approve the brief'}</button></>}
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
                {s.description && <div className="muted" style={{ fontSize: 14 }}><Md text={s.description} /></div>}
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

/**
 * What was written on the ticket as it moved: the plan, the handoff, the review's verdict, the completion, by whoever
 * worked it (a skill in tkt, our agent, a person). One per heading, the latest write of each, oldest first. A body
 * that starts with its own heading shows it once.
 */
function Comments({ i }: { i: IssueDetail }) {
  if (!i.comments?.length) return null
  const bodyOf = (c: IssueDetail['comments'][number]) => {
    const [first, ...rest] = c.body.split('\n')
    return first.replace(/^#+\s*/, '').trim() === c.heading ? rest.join('\n').trim() : c.body
  }
  return (
    <section className="panel">
      <h2>On the ticket <Badge>{i.comments.length}</Badge></h2>
      <ol className="list comments">
        {i.comments.map((c) => (
          <li key={c.id} className="comment">
            <div className="comment-head"><b>{c.heading}</b><span className="faint"> · {c.author}, {new Date(c.updatedAt).toLocaleString()}</span></div>
            <div className="md comment-body"><Markdown remarkPlugins={[remarkGfm]}>{bodyOf(c)}</Markdown></div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** What the planner asked and decided about it. */
function Planner({ i }: { i: IssueDetail }) {
  if (!i.questions.length && !i.decisions.length && !(i.project?.solo && i.subIssues.length)) return null // a task planned on its own always has the way to its plan and build
  return (
    <section className="panel">
      <h2>The planner</h2>
      {i.questions.filter((q) => q.status === 'open').map((q) => <p key={q.id} style={{ margin: '0 0 8px' }}><Badge tone="warn">asks</Badge> <Md text={q.text} inline /></p>)}
      {i.decisions.map((d) => <p key={d.id} className="muted" style={{ margin: '0 0 6px' }}>Decided: <Md text={d.question} inline />: <Md text={d.options.find((o) => o.key === d.chosen)?.text} inline />{d.provisional ? ' (provisional)' : ''}</p>)}
      {i.project && <Link to={`/projects/${i.project.id}`}>{i.project.solo ? 'Its plan and build: answer and run it there →' : 'Answer on the project →'}</Link>}
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
