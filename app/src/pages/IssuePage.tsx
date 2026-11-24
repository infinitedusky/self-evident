/**
 * One issue: what it says, where it sits, and its sub-issues as a list, not a graph (Sandy, 2026-10-27: "see a single
 * task and look at all of its phases, not in a graph but just in a list"). Under code, each sub-issue with its build;
 * under a to-do, its checklist. Live on the app's events.
 *
 * A task (a top-level code issue) is laid out like Settings: its own nav down the left (TaskNav), its overview first,
 * then a page per step in its workflow's order, then the build, each at its own address: /tasks/:id/:section.
 */
import { Context } from '../components/Context'
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
import { PrStep } from '../components/PrStep'
import { TeamNames } from '../components/TeamNames'
import { mark, TaskNav } from '../components/TaskNav'
import { WorkflowChoice } from '../components/WorkflowChoice'
import { Handover } from '../components/Handover'
import { plannedSteps } from '../planned-steps'
import { BRIEF_WORDS, briefWords } from '@self-evident/engine/brief'
import { QuestionAsk } from '../components/QuestionAsk'
import { PlanCovers } from '../components/Requirements'
import { TASK_AGENT_ASKED, TaskAgent, useTaskAgent } from '../components/TaskAgent'
import { canSkip, finished, label, ready, settled, skipped, step, type Row, type StepKey } from '@self-evident/engine/steps'
import { asked, flowGraph, PlanGraphView, STATUS_TONE } from '../components/PlanGraphView'
import { ChecklistView } from '../components/ChecklistView'
import { SmokeTest } from '../components/SmokeTest'
import { openEvents, useLiveProject, type Events, type Checklist, API, engine, useWorkflows, EVENT_TYPES, STATE_LABEL, type IssueDetail, type IssueState, type TaskBranches as TaskBranchesView } from '../engine'
import { Md } from '../components/Md'

/** Where a task's workflow comes from, after its name. */
const FROM = { task: ', its own', project: ', from its project', app: ', the app\'s default' }

export const STATE_TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }

/** Where a task's head being small is remembered, on this browser. */
export const TASK_HEAD = 'se.task.head'

export function IssuePage() {
  const { id, section } = useParams()
  const [i, setI] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null) // why the engine wouldn't delete it
  // A task's head, full or small (Sandy, 2026-11-20: "a toggle that's like verbose or just plain hidden … without losing the information that I need"): small is its id and title on one line, on every page of the task. Remembered on this browser.
  const [small, setSmall] = useState(() => { try { return localStorage.getItem(TASK_HEAD) === 'small' } catch { return false } })
  const toggleSmall = () => { const to = !small; setSmall(to); try { localStorage.setItem(TASK_HEAD, to ? 'small' : 'full') } catch { /* fine without it */ } }
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
      <div className={`page-head ${task && small ? 'compact' : ''}`}>
        <div>
          <div className="faint head-where" style={{ fontSize: 13, marginBottom: 4 }}>
            {i.project && !i.project.solo ? <Link to={`/projects/${i.project.id}`}>{i.project.name}</Link> : <Link to="/tasks">In no project</Link>}
            {i.parent && <> · sub-task of <Link to={`/tasks/${i.parent.id}`}>{i.parent.identifier} {i.parent.title}</Link></>}
          </div>
          <h1><span className="mono faint" style={{ fontWeight: 400 }}>{i.identifier}</span> {i.title}</h1>
          <div className="head-badges" style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge tone={STATE_TONE[i.state]} dot={i.state === 'in_progress'}>{STATE_LABEL[i.state]}</Badge>
            <Badge>{code ? 'code' : 'to-do'}</Badge>
            {i.delegate && <Badge>with the {i.delegate}</Badge>}
            {i.runner === 'tkt' && <Badge tone="accent">run by tkt</Badge>}
            {i.build && <Badge tone={STATUS_TONE[i.build.status]}>build: {i.build.status.replace('_', ' ')}{i.build.attempt ? ` · attempt ${i.build.attempt}` : ''}</Badge>}
            {i.waitingOn && <Badge tone="warn">waiting on {i.waitingOn}</Badge>}
            {task && <TeamNames issueId={i.id} ticket={i.ticket ?? null} from={i.ticketFrom ?? null} missing={i.ticketMissing} set={i.teamTicket ?? null} title={i.teamTitle ?? null} ourTitle={i.title} onSaved={() => void act(async () => {})} />}
            {i.pr?.url && <a className="badge accent" href={i.pr.url} target="_blank" rel="noreferrer">Pull request #{i.pr.number} · {i.pr.status}</a>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {error && <Badge tone="warn" dot>{error}</Badge>}
          {task && <button className="btn quiet task-head-size" aria-pressed={small} onClick={toggleSmall} title={small ? 'Show the whole head: its project, its state and badges, and what each page is' : 'Make the head one line, for room to look at things'}>{small ? '▾ Show all' : '▴ Less'}</button>}
          {/* Closing is the person's, and what makes a task Done: once its pull request is merged and every check of theirs is passed or skipped. Until then it says what it waits on. */}
          {i.close && <button className="btn" disabled={busy || !i.close.can} title={i.close.can ? 'Its pull request is merged and every check is passed or skipped. Closing it marks it done.' : i.close.waits.join(' ')} onClick={() => act(() => engine.closeTask(i.id))}>Close task</button>}
          {i.build && ['failed', 'cancelled'].includes(i.build.status) && <button className="btn" disabled={busy} onClick={() => act(() => engine.retry(i.id))}>Retry</button>}
          {!(task && small) && <button className="btn quiet" disabled={busy} onClick={() => void remove()} title="For a task made by mistake: it leaves nothing behind. One with work on it is canceled instead.">Delete</button>}
        </div>
      </div>
      {refused && <div className="empty bad" style={{ marginBottom: 16 }}>{refused}</div>}

      {i.close && !i.close.can && !(task && small) && <p className="muted" style={{ margin: '0 0 16px' }} data-component="CloseWaits">Before it can be closed: {i.close.waits.join(' ')}</p>}
      {i.reason && <div className="empty" style={{ marginBottom: 16 }}>{STATE_LABEL[i.state]}: <Md text={i.reason} inline /></div>}
      {i.build?.heldReason && i.build.status !== 'done' && <div className="empty" style={{ marginBottom: 16 }}>{i.build.heldReason}</div>}

      {task ? <Task i={i} section={section} busy={busy} act={act} small={small} /> : (
        <>
          <section className="panel"><Brief description={i.description} brief={i.brief} open={!i.description} /></section>
          {code && <Steps i={i} />}
          <SubTasks i={i} />
          <Comments i={i} />
          <Planner i={i} busy={busy} act={act} />
        </>
      )}
    </>
  )
}

/** A task: its nav, and the section the address names. */
function Task({ i, section, busy, act, small = false }: { i: IssueDetail; section?: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void>; small?: boolean }) {
  const subject = { kind: 'issues' as const, id: i.id }
  const { v, error } = useSteps(subject, i.appId)
  const agent = useTaskAgent(i.id, i.appId)
  const { workflows } = useWorkflows(i.appId)
  const [navOpen, setNavOpen] = useState(() => { try { return localStorage.getItem('se.task-nav.open') !== '0' } catch { return true } })
  const toggleNav = () => setNavOpen((o) => { try { localStorage.setItem('se.task-nav.open', o ? '0' : '1') } catch { /* fine */ } return !o })
  const base = `/tasks/${i.id}`
  // Its save points, for the nav: read again when one is made, deleted or gone back to.
  const [saved, setSaved] = useState<TaskBranchesView | null>(null)
  const [savesStamp, setSavesStamp] = useState(0)
  const readSaves = useCallback(() => { void engine.taskBranches(i.id).then(setSaved).catch(() => {}) }, [i.id])
  useEffect(() => { readSaves() }, [readSaves, section, i.updatedAt]) // an agent may have saved or moved it: read on each page of the task and when the task changes
  // A checklist task's stages and list: read with the task, and again whenever the task or its sub-tasks move.
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const subStamp = i ? i.subIssues.map((s) => `${s.id}:${s.build?.status ?? ''}:${s.state}`).join('|') : ''
  useEffect(() => { if (i) void engine.checklist(i.id).then(setChecklist).catch(() => setChecklist(null)) }, [i?.id, i?.updatedAt, subStamp, section]) // eslint-disable-line react-hooks/exhaustive-deps
  // While its whole test run is going, look again: its end moves nothing else on the task.
  const testing = !!checklist?.tests?.running
  useEffect(() => { if (!testing || !i) return; const id = setInterval(() => { void engine.checklist(i.id).then(setChecklist).catch(() => {}) }, 5000); return () => clearInterval(id) }, [testing, i?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A staged task's smoke test: every criterion no agent marked is the person's to check by hand. Read with the task, for the nav.
  const [smoke, setSmoke] = useState<{ owed: number; total: number; failed: number; built?: boolean } | null>(null)
  useEffect(() => { if (i && !i.parentId && i.kind === 'code') void engine.smoke(i.id).then((s) => setSmoke(s.staged ? { owed: s.owed, total: s.checks.length, failed: s.failed, built: !!s.head } : null)).catch(() => setSmoke(null)) }, [i?.id, i?.updatedAt, subStamp, section]) // eslint-disable-line react-hooks/exhaustive-deps
  // Its Context (Context.tsx): how much it holds and what waits for the person, for the nav. Read with the task, and when something in it changes.
  const [ctx, setCtx] = useState<{ count: number; proposed: number; waiting?: number } | null>(null)
  const readCtx = useCallback(() => { void engine.contextCount(subject).then(setCtx).catch(() => setCtx({ count: 0, proposed: 0 })) }, [i.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { readCtx() }, [readCtx, section, i.updatedAt])
  const navSaves = saved ? { current: saved.branches.find((b) => b.current)?.name ?? null, points: saved.saves.map((s) => ({ id: s.id, name: s.name })), aside: saved.branches.filter((b) => !b.current).map((b) => ({ id: b.id, name: b.name })) } : undefined
  const saveHere = async (name: string) => { await engine.saveHere(i.id, name).catch(() => {}); readSaves(); setSavesStamp((n) => n + 1) }
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const rows = v.rows
  const live0 = i.subIssues.filter((s) => !dropped(s)).length // something is planned: its pull request has a page
  const staged = !checklist && !!smoke && (smoke.total > 0 || !!smoke.built) // it stays once the task is built, with nothing left to check too: they may want to look anyway
  const here = section === 'context' || section === 'build' || section === 'saves' || (section === 'pr' && live0 > 0) || (section === 'checklist' && checklist) || (section === 'smoke' && (checklist || staged)) || rows.some((r) => r.key === section) ? section! : 'overview'
  if (section && here === 'overview') return <Navigate to={base} replace />
  const live = i.subIssues.filter((s) => !dropped(s)) // canceled sub-tasks are out of the plan
  const done = live.filter((s) => s.state === 'done').length
  const buildWaits = i.briefApprovedBy ? null : 'the brief\'s approval'
  const row = rows.find((r) => r.key === here)
  const next = rows.find((r) => !r.waitingOn && r.state.status !== 'done' && r.key !== 'idea')
  const wf = v.resolved.workflow
  const reading = rows.filter((r) => step(r.key).place === 'check' && r.state.status !== 'done') // after a prototype the plan is read before it is built
  return (
    <div className={`task-layout with-agent ${agent.open ? '' : 'agent-folded'} ${navOpen ? '' : 'nav-folded'}`}>
      <TaskNav folded={!navOpen} onToggle={toggleNav} base={base} here={here} rows={rows} context={ctx ?? { count: 0, proposed: 0 }} saves={navSaves} onSave={saveHere} workflow={wf && { name: wf.name, from: FROM[v.resolved.from!] }} build={{ done, total: live.length, waitingOn: buildWaits }} smoke={staged ? smoke : null} checklist={checklist} pr={live0 > 0 ? { status: i.pr?.status ?? null, number: i.pr?.number ?? null } : null} />
      <div className="task-main">
        {here === 'overview' && (
          <>
            <section className="panel"><Brief description={i.description} brief={null} /></section>
            {i.origin && <p className="muted" style={{ margin: '-6px 0 16px', fontSize: 14 }} data-component="CameFrom">It came from {i.origin.sourceName} {i.origin.ref}. The ticket, word for word, is in its <Link to={`${base}/context`}>Context</Link>.</p>}
            <Handover madeBy={i.madeBy} handover={i.handover} onWrite={(again) => engine.writeHandover(i.id, again)} />
            <section className="panel">
              <h2>Where it stands</h2>
              <p style={{ margin: '0 0 8px' }}>
                {v.blocking.length
                  ? <>It can be completed once these are done: {v.blocking.map((k, n) => <span key={k}>{n ? ', ' : ''}<Link to={`${base}/${k}`}>{label(k as StepKey, 'task')}{k === 'brief' && i.brief?.trim() ? ' (approval)' : ''}</Link></span>)}.</>
                  : 'Every required step is done.'}
              </p>
              {next && <p style={{ margin: '0 0 8px' }}>Next: <Link to={`${base}/${next.key}`}>{label(next.key, 'task')}</Link>{next.required ? '' : ' (optional)'}.</p>}
              <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                <WorkflowChoice workflow={wf} from={v.resolved.from} workflows={workflows} fromIdea={!!v.fromIdea} onChange={(w) => engine.useWorkflow({ kind: 'issues', id: i.id }, w)} />{' · '}
                <Link to={`/settings/apps/${i.appId}/workflows`}>Configure the rules</Link>
              </p>
            </section>
            <Comments i={i} />
            <Planner i={i} busy={busy} act={act} />
          </>
        )}
        {row && (
          <StepSection subject={subject} appId={i.appId} name={i.title} row={row} base={base} fromIdea={v.fromIdea} waitingState={rows.find((r) => r.key === row.waitingOn)?.state} session={agent.session?.id} small={small}>
            {row.key === 'brief' ? <BriefStep i={i} busy={busy} act={act} feeds={rows.filter((r) => r.key !== 'brief')} base={base} /> : undefined}
          </StepSection>
        )}
        {here === 'context' && <Context subject={subject} version={+new Date(i.updatedAt ?? 0)} onChange={readCtx} />}
        {here === 'checklist' && checklist && <ChecklistView checklist={checklist} base={base} onTestAgain={() => engine.testAgain(i.id).then(() => engine.checklist(i.id)).then(setChecklist)} onCheckAgain={() => engine.checkAgain(i.id).then(() => engine.checklist(i.id)).then(setChecklist)} />}
        {here === 'smoke' && (checklist || staged) && <SmokeTest issueId={i.id} appId={i.appId} base={base} small={small} />}
        {here === 'pr' && <PrStep issueId={i.id} appId={i.appId} base={base} />}
        {here === 'saves' && <TaskBranches issueId={i.id} at={new URLSearchParams(window.location.search).get('at')} stamp={savesStamp} onMoved={() => void act(async () => {})} onChanged={readSaves} />}
        {here === 'build' && (buildWaits
          ? <section className="panel"><h2>🏗️ {checklist ? 'Build' : 'Sub-tasks'}</h2><div className="empty">{checklist ? 'The build waits' : 'Planning and building wait'} for the brief's approval. <Link to={`${base}/brief`}>Go to the brief →</Link></div>{checklist?.flow && <TaskGraph i={i} checklist={checklist} />}</section>
          : <>
              {live.length > 0 && i.project && ['drafting', 'proposed', 'approved'].includes(i.project.status) && (
                <section className="panel" data-component="RunIt">
                  <h2>{reading.length ? 'Being read before it is built' : 'Ready to build'}</h2>
                  {reading.length > 0
                    ? <p style={{ margin: 0 }}>Planned in {live.length} sub-task{live.length === 1 ? '' : 's'}, and being read before it is built. Still to come, by themselves: {reading.map((r, n) => <span key={r.key}>{n ? ', ' : ''}<Link to={`${base}/${r.key}`}>{label(r.key, 'task')}</Link></span>)}. Then the build starts.</p>
                    : <>
                        <p style={{ margin: '0 0 10px' }}>Planned in {live.length} sub-task{live.length === 1 ? '' : 's'} and not started. A task approved from now on starts by itself; this one was planned before that.</p>
                        <button className="btn" disabled={busy} onClick={() => act(() => engine.buildTask(i.id))}>Build it</button>
                      </>}
                </section>
              )}
              <SubTasks i={i} plan={!live.length && i.state === 'todo' ? <button className="btn" disabled={busy} onClick={() => act(() => engine.planIssue(i.id))}>Plan it</button> : null} />
              <Planner i={i} busy={busy} act={act} />
              {(live.length > 0 || checklist?.flow) && <TaskGraph i={i} checklist={checklist} />}
              {live.length > 0 && <PlanCovers list={i.requirements ?? []} />}
              {live.length > 0 && <MergeGuide issueId={i.id} stamp={i.updatedAt} />}
              {live.length > 0 && <p className="faint" style={{ margin: '10px 0 0', fontSize: 13 }}>Its pull request has a page of its own: <Link to={`${base}/pr`}>{i.pr?.number ? `#${i.pr.number}, ${i.pr.status}` : 'not submitted yet'}</Link>.</p>}
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
            <span className="faint">{skipped(r.state) ? 'skipped' : r.state.status === 'none' ? 'not started' : r.state.detail ?? (r.state.status === 'done' ? 'done' : 'started')}</span>
            {ready(r.state, 'task') && <Badge tone="warn">ready for you</Badge>}
            {r.required && !finished(r.state, 'task') && <Badge tone="warn">required</Badge>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * How long the brief is, against the size a brief is held to (Sandy, 2026-11-14: "we need less text so that people can
 * actually consume it"). Within it: a quiet count. Over it: said plainly, with one press that asks the task's agent
 * to cut it back (not once it is approved: then it is the person's word, and they withdraw it first).
 */
export function BriefSize({ text, approved, busy, onShorten }: { text: string; approved?: boolean; busy?: boolean; onShorten?: () => void }) {
  const n = briefWords(text)
  if (n <= BRIEF_WORDS) return <p className="faint" style={{ margin: '0 0 6px', fontSize: 12 }} data-component="BriefSize">{n} words</p>
  return (
    <div className="empty" style={{ marginBottom: 12, textAlign: 'left' }} data-component="BriefSize">
      <strong>This brief is {n} words.</strong> A brief says what to build and why in at most {BRIEF_WORDS}, so that it gets read; how it is built belongs to the ADR and the plan.{' '}
      {approved ? 'It is approved as it stands.' : onShorten && <button type="button" className="linkish" disabled={busy} onClick={onShorten}>Ask the agent to cut it back</button>}
    </div>
  )
}

/** The brief's page: the brief, what it stands on, and its approval, which waits for the required steps. */
function BriefStep({ i, busy, act, feeds, base }: { i: IssueDetail; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void>; feeds: Row[]; base: string }) {
  const [asked, setAsked] = useState(false)
  const owed = feeds.filter((r) => r.required && step(r.key).place !== 'check' && !finished(r.state, 'task')) // not the prototype's checks: the build waits for those, the brief does not
  const checksLeft = feeds.filter((r) => step(r.key).place === 'check' && r.state.status !== 'done')
  const open = feeds.filter((r) => canSkip(r) && !settled(r.state, 'task')) // optional, and neither done nor skipped
  const proto = feeds.find((r) => r.key === 'prototype')
  const hasPrototype = !!proto && !skipped(proto.state) // no prototype step, or it is skipped: the criteria have nothing to say about one
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
      <Acceptance issueId={i.id} items={i.acceptance ?? []} prototype={hasPrototype} onChanged={() => void act(async () => {})} />
      <StandsOn feeds={feeds} base={base} />
    </div>
  )
  return (
    <>
      <BriefSize text={i.brief} approved={!!i.briefApprovedBy} onShorten={() => act(async () => { await engine.ask({ appId: i.appId, subjectRef: { issueId: i.id }, text: `Cut the brief of this task back to what and why, in at most ${BRIEF_WORDS} words, with update_task. Move nothing into it; what you take out is already in the steps and the reports.` }); window.dispatchEvent(new Event(TASK_AGENT_ASKED)) })} busy={busy} />
      <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{i.brief}</Markdown></div>
      <Acceptance issueId={i.id} items={i.acceptance ?? []} approved={!!i.briefApprovedBy} prototype={hasPrototype} onChanged={() => void act(async () => {})} />
      <StandsOn feeds={feeds} base={base} />
      <div className="brief-approval">
        {i.briefApprovedBy
          ? <><Badge tone="ok">brief approved</Badge><span className="faint">by {i.briefApprovedBy}{i.briefApprovedAt ? `, ${new Date(i.briefApprovedAt).toLocaleDateString()}` : ''}</span>
            <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id, false))}>Withdraw</button>
            {checksLeft.length > 0 && <div className="faint" style={{ flexBasis: '100%', fontSize: 13 }}>It is planned and built by itself once the prototype's checks are in. Still to come: {checksLeft.map((r, n) => <span key={r.key}>{n ? ', ' : ''}<Link to={`${base}/${r.key}`}>{label(r.key, 'task')}</Link></span>)}.{feeds.find((r) => r.key === 'prototype')?.state.approved ? '' : ' They start when you approve the prototype.'}</div>}</>
          : owed.length
          ? <span className="faint">It can be approved once {owed.map((r, n) => <span key={r.key}>{n ? ', ' : ''}<Link to={`${base}/${r.key}`}>{label(r.key, 'task')}</Link></span>)} {owed.length === 1 ? 'is' : 'are'} done.</span>
          : open.length
          ? <span className="faint">It can be approved once each optional step is done or skipped. Still to do or skip: {open.map((r, n) => <span key={r.key}>{n ? ', ' : ''}<Link to={`${base}/${r.key}`}>{label(r.key, 'task')}</Link></span>)}.</span>
          : <><Badge tone="warn">waiting for your approval</Badge><span className="faint">Planning and building wait for it. {criteria ? `Approving it approves its ${criteria === 1 ? 'acceptance criterion' : `${criteria} acceptance criteria`} as enough${unshown ? `; ${unshown} ${unshown === 1 ? 'was' : 'were'} not shown in the prototype` : ''}${left ? `; ${left} ${left === 1 ? 'is' : 'are'} left to the final build, unproven` : ''}.` : 'It has no acceptance criteria yet.'}</span>
            <button className="btn small" disabled={busy} onClick={() => act(() => engine.approveBrief(i.id))}>{criteria ? `Approve the brief and its ${criteria === 1 ? 'criterion' : `${criteria} criteria`}` : 'Approve the brief'}</button></>}
      </div>
    </>
  )
}

/** Sub-tasks under code, a checklist under a to-do. */
/** A sub-task that is out of the plan: canceled, or a duplicate. Not counted, not built, folded away (Sandy, 2026-11-13). */
const dropped = (s: { state: string }) => s.state === 'canceled' || s.state === 'duplicate'

function SubTasks({ i, plan }: { i: IssueDetail; plan?: React.ReactNode }) {
  const code = i.kind === 'code'
  const subs = i.subIssues.filter((s) => !dropped(s))
  const gone = i.subIssues.filter(dropped)
  const planned = subs.length > 0
  if (!planned && !gone.length && i.parentId) return null
  return (
    <section className="panel">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{code ? 'Sub-tasks' : 'Checklist'} {planned && <Badge>{subs.filter((s) => s.state === 'done').length}/{subs.length}</Badge>}</h2>
        {plan}
      </div>
      {!planned && <p className="faint" style={{ margin: '8px 0 0' }}>{code ? 'Not planned yet: the planner reads the code and the brief, and cuts it into sub-tasks, one agent each.' : 'No lines yet.'}</p>}
      {planned && (
        <ol className="list sub-issues">
          {subs.map((s) => (
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
      {gone.length > 0 && (
        <details className="sub-issues-gone">
          <summary>{gone.length} canceled <span className="faint">not counted, not built</span></summary>
          <ol className="list sub-issues">
            {gone.map((s) => (
              <li key={s.id} className={`sub-issue ${s.state}`}>
                <span className="mono faint">{s.identifier}</span>
                <div>
                  <Link to={`/tasks/${s.id}`} style={{ textDecoration: 'none' }}>{s.title}</Link>
                  {s.reason && <div className="faint" style={{ fontSize: 13 }}>{s.reason}</div>}
                </div>
                <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
              </li>
            ))}
          </ol>
        </details>
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
/**
 * The task's own graph, in its Build section (Sandy, 2026-11-14: "the task should also have a graph when you're in
 * the build area"): its sub-tasks, what each waits on, the files they share and any unanswered question, the same
 * drawing as the project's graph but only this task's part of it.
 */
function TaskGraph({ i, checklist }: { i: IssueDetail; /** A checklist task: its whole flow is drawn, what is to come included. */ checklist?: Checklist | null }) {
  // Live like the project's graph: every event of the project reads it again (a status, a step, a retry, a landing).
  // It used to be read only when the task's own detail showed a sub-task in a new status, so a node could sit on an
  // old one until the page was reloaded (Sandy, 2026-11-15: "I seem to need to refresh the page").
  const { graph: g } = useLiveProject(i.project?.id)
  const subs = g?.subIssues.filter((x) => x.parentId === i.id) ?? []
  const flow = checklist?.flow
  if (!flow && (!g || !subs.length)) return null
  const nodes = flow ? flowGraph(flow, subs) : subs
  const mine = new Set(subs.map((x) => x.id))
  return (
    <section className="panel" data-component="TaskGraph">
      <h2>Graph {flow && !subs.length && <span className="faint">how it will go; nothing has started</span>}</h2>
      <PlanGraphView subIssues={nodes} files={(g?.files ?? []).map((f) => ({ ...f, subIssues: f.subIssues.filter((id) => mine.has(id)) }))} questions={asked(g?.questions ?? [], subs)} storageKey={`task:${i.id}`} />
    </section>
  )
}

function Planner({ i, busy, act }: { i: IssueDetail; busy?: boolean; act?: (fn: () => Promise<unknown>) => Promise<void> }) {
  if (!i.questions.length && !i.decisions.length && !(i.project?.solo && i.subIssues.length)) return null // a task planned on its own always has the way to its plan and build
  return (
    <section className="panel">
      <h2>The planner</h2>
      {/* A question is answered where it is read. */}
      {i.questions.filter((q) => q.status === 'open').map((q) => act
        ? <QuestionAsk key={q.id} q={q} busy={busy} onAnswer={(answer) => act(() => engine.answer(q.id, answer))} />
        : <p key={q.id} style={{ margin: '0 0 8px' }}><Badge tone="warn">asks</Badge> <Md text={q.text} inline /></p>)}
      {i.decisions.map((d) => <p key={d.id} className="muted" style={{ margin: '0 0 6px' }}>Decided: <Md text={d.question} inline />: <Md text={d.options.find((o) => o.key === d.chosen)?.text} inline />{d.provisional ? ' (provisional)' : ''}</p>)}
      {i.project && <p style={{ margin: '8px 0 0' }}><Link to={`/projects/${i.project.id}`}>{i.project.solo ? 'Its plan and build →' : 'The project →'}</Link></p>}
    </section>
  )
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
