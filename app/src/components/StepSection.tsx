/**
 * One step of a task, as a page of its own: what the step is for, what it has so far, and the way on (hand it to the
 * agent, open what it made, mark it done). A step that waits on another says which, with a link there, so a locked
 * step is never a dead end. The brief's page passes its own body as children.
 */
import { TASK_AGENT_ASKED } from './TaskAgent'
import { Viewer, type Viewed } from './Viewer'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { finished, label, needsApproval, ready, step, type On, type Row, type StepState } from '@self-evident/engine/steps'
import { Badge } from './Badge'
import { askStep } from './StepsPanel'
import { engine, type Prototype, type StepSubject, type StepWork } from '../engine'
import { useWorkspace } from '../workspace'

const err = (e: any) => String(e?.message ?? e)

export function StepSection({ subject, appId, name, on = 'task', row, base, fromIdea, waitingState, session, children }: {
  subject: StepSubject; appId: string; name: string; on?: On; row: Row
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
  const [pane, setPane] = useState<'view' | 'notes'>('view')
  const [error, setError] = useState<string | null>(null)
  const s = row.state
  // What there is to look at, right on the step's page: the task's sketches, its Storybook at the first story named, its prototype.
  const proto = protos.find((p) => p.status !== 'discarded')
  // The agent can send the person here to one file or story (?file=, ?story=): that one shows, else the first the step recorded.
  const [asked_] = useSearchParams()
  const viewed: Viewed | null = row.waitingOn ? null
    : row.key === 'sketch' && session ? { kind: 'sketch', session, file: asked_.get('file') ?? work?.refs?.[0] }
    : row.key === 'mockup' && session ? { kind: 'storybook', session, story: asked_.get('story') ?? work?.refs?.[0] }
    : row.key === 'prototype' && proto && s.status !== 'none' ? { kind: 'prototype', id: proto.id } : null
  const waitsOnApproval = row.waitingOn === 'brief' && on === 'task' && waitingState?.status === 'done'
  const own = row.key !== 'idea' && row.key !== 'brief' // the steps whose work is kept as a step
  const approves = own && subject.kind === 'issues' && needsApproval(row.key, on) // a person approves it, here
  useEffect(() => {
    setAsked(false)
    if (own && row.key !== 'prototype' && s.status !== 'none') engine.step(subject, row.key).then(setWork).catch((e) => setError(err(e)))
    else setWork(null)
    if (row.key === 'prototype') engine.prototypes(appId).then((all) => setProtos(all.filter((p) => p.issueId === subject.id && p.status !== 'discarded'))).catch(() => {})
  }, [subject.id, row.key, s.status, s.detail]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn() } catch (e) { setError(err(e)) } finally { setBusy(false) } }
  const ownAgent = subject.kind === 'issues' // a task's steps go to the task's own agent, on its page
  const ask = () => act(async () => { await askStep(subject, appId, name, row.key, on); if (ownAgent) window.dispatchEvent(new Event(TASK_AGENT_ASKED)); setAsked(true) })

  // With something to look at, the step's page is two tabs: the view (the sketch, the story, the prototype), which gets the whole
  // page so it is never pushed out of sight, and what the step wrote for the brief (Sandy, 2026-11-10: "we make them tabs so you go
  // back and forth. Then the view can be visible").
  const showView = !!viewed && pane === 'view'
  return (
    <section className={`panel step-section ${showView ? 'viewing' : ''}`} data-component="StepSection">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{step(row.key).icon} {label(row.key, on)}</h2>
        {approves && s.approved && <Badge tone="ok">approved by {s.approved.by}</Badge>}
        {approves && ready(s, on) && <Badge tone="warn">ready for you</Badge>}
        {viewed && (
          <div className="seg step-tabs" role="tablist" aria-label="What to show">
            <button role="tab" aria-selected={pane === 'view'} className={pane === 'view' ? 'on' : ''} onClick={() => setPane('view')}>View</button>
            <button role="tab" aria-selected={pane === 'notes'} className={pane === 'notes' ? 'on' : ''} onClick={() => setPane('notes')}>For the brief</button>
          </div>
        )}
        {row.required ? <Badge tone={finished(s, on) ? 'ok' : 'warn'}>required</Badge> : <span className="faint" style={{ fontSize: 13 }}>optional</span>}
        {/* The check mark is the person's: the agent can only say a step is ready (Sandy, 2026-11-10: "an approve button for each step"). */}
        {approves && !s.approved && s.status !== 'none' && !row.waitingOn && <button className={ready(s, on) ? 'btn small' : 'btn quiet small'} disabled={busy} onClick={() => act(() => engine.approveStep(subject.id, row.key))} title="Approve this step: it gets its check, and the steps after it can go on">Approve</button>}
        {approves && s.approved && <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.approveStep(subject.id, row.key, false))} title="Take the approval back">Withdraw</button>}
      </div>
      {showView && viewed && <Viewer tab={viewed} embedded />}
      {!showView && <>
      <p className="faint" style={{ margin: '4px 0 14px' }}>{step(row.key).what}</p>

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
          <p className="step-status">
            {s.status === 'none' ? <span className="faint">Not started.</span> : <span>{s.status === 'done' ? '✓ ' : '◐ '}{s.detail ?? (s.status === 'done' ? 'Done' : 'Started')}</span>}
            {work?.updatedBy && <span className="faint"> · {work.updatedBy}{work.updatedAt ? `, ${new Date(work.updatedAt).toLocaleDateString()}` : ''}</span>}
          </p>

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
          {work?.body && <div className="md step-body"><Markdown remarkPlugins={[remarkGfm]}>{work.body}</Markdown></div>}

          {!row.waitingOn && (
            <div className="step-actions">
              {s.status === 'none'
                ? <button className="btn" disabled={busy || asked} onClick={ask}>{row.key === 'prototype' ? 'Start a prototype with the agent' : 'Start with the agent'}</button>
                : <button className="btn quiet" disabled={busy || asked} onClick={ask}>Ask the agent to carry on</button>}
              {own && !approves && s.status === 'started' && row.key !== 'prototype' && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: 'done' }))}>Mark done</button>}
              {asked && <span className="faint">{ownAgent ? 'Handed to this task\'s agent, on the right.' : 'Handed to the agent: it\'s in the agent panel.'}</span>}
            </div>
          )}
        </>
      )}
      </>}
      {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  )
}
