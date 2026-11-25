/**
 * One step of a task, as a page of its own: what the step is for, what it has so far, and the way on (hand it to the
 * agent, open what it made, mark it done). A step that waits on another says which, with a link there, so a locked
 * step is never a dead end. The brief's page passes its own body as children.
 */
import { MockLibrary } from './MockLibrary'
import { TASK_AGENT_ASKED } from './TaskAgent'
import { Viewer, type Viewed } from './Viewer'
import { PrototypeCode } from './PrototypeCode'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { canSkip, finished, label, needsApproval, ready, skipped, step, type On, type Row, type StepState } from '@self-evident/engine/steps'
import { Badge } from './Badge'
import { askStep } from './StepsPanel'
import { engine, type Prototype, type StepSubject, type StepWork, type Trajectory } from '../engine'
import { TrajectoryView } from './TrajectoryView'
import { useWorkspace } from '../workspace'

const words = (t: string) => t.trim().split(/\s+/).length

const err = (e: any) => String(e?.message ?? e)

export function StepSection({ subject, appId, name, on = 'task', row, base, fromIdea, waitingState, session, small = false, children }: {
  subject: StepSubject; appId: string; name: string; on?: On; row: Row
  /** The task's head is small: what the step is, said at its top, is left out with it. */
  small?: boolean
  /** Where this thing's pages live, for the link to the step it waits on. */
  base: string
  fromIdea?: { id: string; number: number; title: string } | null
  /** The state of the step it waits on, if any. */
  waitingState?: StepState
  /** The task's own agent, when it has one: its worktree is where the sketches and the stories are. */
  session?: string | null
  children?: React.ReactNode
}) {
  const ws = useWorkspace()
  const [work, setWork] = useState<StepWork | null>(null)
  const [protos, setProtos] = useState<Prototype[]>([])
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)
  const [pane, setPane] = useState<'view' | 'code' | 'notes'>('view')
  const [error, setError] = useState<string | null>(null)
  const s = row.state
  // The Data step shows what its agent wrote inside its panel, at the top of the services: not again below it.
  const dataStep = row.key === 'data' && on === 'task' // its Approve and Skip are in its head: the page under it is long
  const dataInside = dataStep && row.state.status !== 'skipped'
  // The Test plan step shows its plan as the trajectory: the table with what the engine saw of each row, not the same table again as text.
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const planStep = row.key === 'testplan' && on === 'task'
  useEffect(() => { if (planStep) void engine.trajectory(subject.id).then(setTrajectory).catch(() => setTrajectory(null)) }, [planStep, subject.id, s.status, s.detail, s.approved?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  const planInside = planStep && !!trajectory?.plan
  // What there is to look at, right on the step's page: the task's sketches, its Storybook at the first story named, its prototype.
  const proto = protos.find((p) => p.status !== 'discarded')
  // The agent can send the person here to one file or story (?file=, ?story=): that one shows, else the first the step recorded.
  const [asked_] = useSearchParams()
  const viewed: Viewed | null = row.waitingOn ? null
    : row.key === 'sketch' && session ? { kind: 'sketch', session, file: asked_.get('file') ?? work?.refs?.[0] }
    : row.key === 'screen' && session ? { kind: 'screens', session, story: asked_.get('story') ?? undefined }
    : row.key === 'mockup' && session ? { kind: 'storybook', session, story: asked_.get('story') ?? work?.refs?.[0] }
    : row.key === 'prototype' && proto && s.status !== 'none' ? { kind: 'prototype', id: proto.id } : null
  // The agent showed a file or a page in the prototype's code (?shown=<its id>): the Code view, on that.
  const shown = row.key === 'prototype' ? asked_.get('shown') : null
  useEffect(() => { if (shown) setPane('code') }, [shown])
  const code = viewed?.kind === 'prototype' ? viewed.id : null // a prototype's step also has its code to read
  const waitsOnApproval = row.waitingOn === 'brief' && on === 'task' && waitingState?.status === 'done'
  // The steps whose work is kept as a step. A task's brief is on the task itself (its page passes it in); an idea's rough draft is a step like the others.
  const own = row.key !== 'idea' && !(row.key === 'brief' && on === 'task')
  const approves = own && subject.kind === 'issues' && needsApproval(row.key, on) // a person approves it, here
  useEffect(() => {
    setAsked(false)
    if (own && s.status !== 'none') engine.step(subject, row.key).then(setWork).catch((e) => { if (row.key === 'prototype') setWork(null); else setError(err(e)) }) // a prototype's step has notes for the brief too
    else setWork(null)
    // The prototypes started on this thing: a task's by the task, an idea's by the idea.
    const mine = (p: Prototype) => (subject.kind === 'ideas' ? p.ideaId === subject.id : subject.kind === 'projects' ? p.projectId === subject.id && !p.issueId && !p.ideaId : p.issueId === subject.id)
    if (row.key === 'prototype') engine.prototypes(appId).then((all) => setProtos(all.filter((p) => mine(p) && p.status !== 'discarded'))).catch(() => {})
  }, [subject.id, row.key, s.status, s.detail]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn() } catch (e) { setError(err(e)) } finally { setBusy(false) } }
  const ownAgent = true // a task's steps go to the task's own agent, an idea's to the idea's and a project's to the project's, each on its page
  const ask = () => act(async () => { await askStep(subject, appId, name, row.key, on); if (ownAgent) window.dispatchEvent(new Event(TASK_AGENT_ASKED)); setAsked(true) })

  // With something to look at, the step's page is two tabs: the view (the sketch, the story, the prototype), which gets the whole
  // page so it is never pushed out of sight, and what the step wrote for the brief (Sandy, 2026-11-10: "we make them tabs so you go
  // back and forth. Then the view can be visible").
  const showView = !!viewed && pane === 'view'
  const showCode = !!code && pane === 'code'
  return (
    <section className={`panel step-section ${showView || showCode ? 'viewing' : ''}`} data-component="StepSection">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{step(row.key).icon} {label(row.key, on)}</h2>
        {approves && s.approved && <Badge tone="ok">approved by {s.approved.by}</Badge>}
        {approves && ready(s, on) && <Badge tone="warn">ready for you</Badge>}
        {viewed && (
          <div className="seg step-tabs" role="tablist" aria-label="What to show">
            <button role="tab" aria-selected={pane === 'view'} className={pane === 'view' ? 'on' : ''} onClick={() => setPane('view')}>View</button>
            {code && <button role="tab" aria-selected={pane === 'code'} className={pane === 'code' ? 'on' : ''} onClick={() => setPane('code')} title="Every file the prototype changed, with its diff, and what the agent is showing you">Code</button>}
            <button role="tab" aria-selected={pane === 'notes'} className={pane === 'notes' ? 'on' : ''} onClick={() => setPane('notes')}>For the brief</button>
          </div>
        )}
        {row.required ? <Badge tone={finished(s, on) ? 'ok' : 'warn'}>required</Badge> : skipped(s) ? <Badge>skipped</Badge> : <span className="faint" style={{ fontSize: 13 }}>optional</span>}
        {/* The check mark is the person's: the agent can only say a step is ready (Sandy, 2026-11-10: "an approve button for each step"). */}
        {/* The Data step's page is its services and their data, there before anything is started: it is approved as it stands (Sandy, 2026-11-24: "the data tab doesn't have an approve button at the top. A skip, you know"). */}
        {approves && !s.approved && (s.status !== 'none' || dataStep) && !skipped(s) && !row.waitingOn && <button className={ready(s, on) && !s.needs ? 'btn small' : 'btn quiet small'} disabled={busy || !!s.needs} onClick={() => act(async () => { if (s.status === 'none') await engine.setStep(subject, row.key, { status: 'started' }); return engine.approveStep(subject.id, row.key) })} title={row.key === 'prototype' && on === 'task' ? 'Your last press: it approves the brief too when the brief is ready, and the analysis, the ADR, the plan, its audit and the build follow by themselves' : 'Approve this step: it gets its check, and the steps after it can go on'}>{row.key === 'prototype' && on === 'task' ? 'Approve the prototype' : 'Approve'}</button>}
        {approves && s.approved && <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveStep(subject.id, row.key, false))} title="Take the approval back">Withdraw</button>}
        {dataStep && canSkip(row) && !finished(s, on) && !skipped(s) && !row.waitingOn && <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: 'skipped' }))} title="Say this optional step is not being done on this task: the app's defaults are used">Skip this step</button>}
      </div>
      {s.needs && !s.approved && <p className="smoke-stale" role="note">{s.needs}</p>}
      {showView && viewed && <Viewer tab={viewed} embedded />}
      {showCode && code && <PrototypeCode id={code} appId={appId} focus={shown} />}
      {!showView && !showCode && <>
      {!small && <p className="faint" style={{ margin: '4px 0 14px' }}>{step(row.key).what}</p>}

      {row.waitingOn && (
        <div className="empty" style={{ marginBottom: 14 }}>
          This workflow does {label(row.waitingOn, on)} first{waitsOnApproval ? ', approved' : ''}. <Link to={`${base}/${row.waitingOn}`}>Go to {label(row.waitingOn, on)} →</Link>
        </div>
      )}

      {row.key === 'idea' ? (
        fromIdea
          ? <p>Converted from <Link to={`/ideas/${fromIdea.id}`}>idea #{fromIdea.number} {fromIdea.title}</Link>: its research, mockups and prototype came with it.</p>
          : <p className="muted">{row.required ? 'Made directly, but this workflow wants tasks to start as an idea.' : 'Made directly, not from an idea.'}</p>
      ) : children ?? (
        <>
          {row.key === 'prototype' && on === 'task' && !small && !s.approved && !skipped(s) && s.status !== 'none' && <p className="faint" style={{ fontSize: 13, margin: '0 0 8px' }}>Approving the prototype is the last thing you press. It approves the brief with it, when the brief is ready, and then the analysis, the ADR, the plan, the blast radius, the audit, the final ADR and plan, and the build follow by themselves.</p>}
          <p className="step-status">
            {skipped(s) ? <span>– Skipped: not being done on this {on}.</span> : s.status === 'none' ? <span className="faint">Not started.{planStep ? (canSkip(row) ? ' Its agent writes it once the brief is approved. Skip it and the task is built as before, with no test plan.' : ' Its agent writes it once the brief is approved; the build waits for it.') : on === 'task' && canSkip(row) ? ' It is optional: do it, or skip it. The brief waits until you have said which.' : ''}</span> : <span>{s.status === 'done' ? '✓ ' : '◐ '}{s.detail ?? (s.status === 'done' ? 'Done' : 'Started')}</span>}
            {work?.updatedBy && <span className="faint"> · {work.updatedBy}{work.updatedAt ? `, ${new Date(work.updatedAt).toLocaleDateString()}` : ''}</span>}
          </p>

          {/* The Data step: the task's own table and the app's mocks, there whether or not the step is started, since the table works without an agent. */}
          {/* What its agent wrote goes inside it, at the top of the services, not below the whole panel. */}
          {row.key === 'data' && on === 'task' && !skipped(s) && <MockLibrary appId={appId} issueId={subject.id} needs={work?.summary?.trim() || work?.body ? <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{[work.summary?.trim(), work.body].filter(Boolean).join('\n\n')}</Markdown></div> : undefined} />}

          {planStep && !skipped(s) && trajectory?.plan && <TrajectoryView view={trajectory} />}
          {planStep && !s.approved && !skipped(s) && trajectory?.plan && <p className="faint" style={{ fontSize: 13, margin: '0 0 8px' }}>Approving it starts the build: a test phase that writes these tests and sees them fail, then each slice. The engine runs every test itself, and a row counts only when it was seen to fail before its code and pass after.</p>}
          {row.key === 'prototype' && protos.length > 0 && (
            <ul className="list step-protos">
              {protos.map((p) => (
                <li key={p.id}>
                  <span>{p.title}</span> <Badge tone={p.status === 'running' ? 'accent' : 'neutral'}>{p.status}</Badge>
                  <button className="btn quiet small" style={{ marginLeft: 'auto' }} onClick={() => ws?.open({ kind: 'prototype', id: p.id })}>Open</button>
                </li>
              ))}
            </ul>
          )}
          {work && work.refs.length > 0 && (
            <p style={{ margin: '8px 0' }}>{work.refs.map((story) => <button key={story} className="btn quiet small" style={{ marginRight: 6 }} onClick={() => ws?.open({ kind: 'storybook', story })}>{story}</button>)}</p>
          )}
          {dataInside || planInside ? null : work?.summary?.trim() && (
            <div className="step-summary" data-component="StepSummary" aria-label="What you need to know">
              <h3>What you need to know</h3>
              <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{work.summary}</Markdown></div>
            </div>
          )}
          {!dataInside && !planInside && work?.body && (work.summary?.trim()
            ? <details className="step-full"><summary>The full report <span className="faint">{words(work.body)} words, written for the next agent</span></summary><div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{work.body}</Markdown></div></details>
            : <>
                {words(work.body) > 400 && <p className="faint step-nosummary">This report is {words(work.body)} words and has no summary. Ask the task's agent: “summarize the {label(row.key, on).toLowerCase()} for me”.</p>}
                <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{work.body}</Markdown></div>
              </>)}

          {/* A prototype that exists is the content: with nothing written yet, say so and where the prototype is. */}
          {row.key === 'prototype' && proto && !work?.body && !work?.summary?.trim() && <p className="muted" data-component="NothingForTheBrief">Nothing is written for the brief yet. The prototype itself is under <button type="button" className="linkish" onClick={() => setPane('view')}>View</button>.</p>}

          {/* Under way, and nothing written here yet: say so, so an empty page is not mistaken for a broken one. */}
          {own && row.key !== 'prototype' && s.status !== 'none' && !skipped(s) && work && !work.body && !work.summary?.trim() && !work.refs.length && <p className="muted" data-component="NothingWrittenYet">{s.status === 'done' ? 'Its agent has marked this done, and nothing is written here yet. Ask it in the conversation beside this page.' : 'Its agent is on this, and nothing is written here yet. What it finds shows here as it records it; it is in the conversation beside this page.'}</p>}

          {skipped(s) && (
            <div className="step-actions">
              <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: work?.body || work?.refs.length ? 'started' : 'none' }))}>Do it after all</button>
            </div>
          )}
          {!row.waitingOn && !skipped(s) && (
            <div className="step-actions">
              {s.status === 'none'
                ? <button className="btn" disabled={busy || asked} onClick={ask}>{row.key === 'prototype' ? 'Start a prototype with the agent' : 'Start with the agent'}</button>
                : null}{/* once a step is under way there is nothing to press: its agent is beside the page, and what it wrote is above (Sandy, 2026-11-15: "we don't need to push a button that says ask the agent to carry on … what we need is the content") */}
              {own && !approves && s.status === 'started' && row.key !== 'prototype' && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: 'done' }))}>Mark done</button>}
              {on === 'task' && !dataStep && canSkip(row) && !finished(s, on) && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: 'skipped' }))} title="Say this optional step is not being done on this task">Skip this step</button>}
              {asked && <span className="faint">{ownAgent ? `Handed to this ${on}'s agent, on the right.` : 'Handed to the agent: it\'s in the agent panel.'}</span>}
            </div>
          )}
        </>
      )}
      </>}
      {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  )
}
