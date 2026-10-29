/**
 * One step of a task, as a page of its own: what the step is for, what it has so far, and the way on (hand it to the
 * agent, open what it made, mark it done). A step that waits on another says which, with a link there, so a locked
 * step is never a dead end. The brief's page passes its own body as children.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { finished, label, step, type On, type Row, type StepState } from '@self-evident/engine/steps'
import { Badge } from './Badge'
import { askStep } from './StepsPanel'
import { engine, type Prototype, type StepSubject, type StepWork } from '../engine'
import { useWorkspace } from '../workspace'

const err = (e: any) => String(e?.message ?? e)

export function StepSection({ subject, appId, name, on = 'task', row, base, fromIdea, waitingState, children }: {
  subject: StepSubject; appId: string; name: string; on?: On; row: Row
  /** Where this thing's pages live, for the link to the step it waits on. */
  base: string
  fromIdea?: { id: string; number: number; title: string } | null
  /** The state of the step it waits on, if any. */
  waitingState?: StepState
  children?: React.ReactNode
}) {
  const ws = useWorkspace()
  const [work, setWork] = useState<StepWork | null>(null)
  const [protos, setProtos] = useState<Prototype[]>([])
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = row.state
  const waitsOnApproval = row.waitingOn === 'brief' && on === 'task' && waitingState?.status === 'done'
  const own = row.key !== 'idea' && row.key !== 'brief' // the steps whose work is kept as a step
  useEffect(() => {
    setAsked(false)
    if (own && row.key !== 'prototype' && s.status !== 'none') engine.step(subject, row.key).then(setWork).catch((e) => setError(err(e)))
    else setWork(null)
    if (row.key === 'prototype') engine.prototypes(appId).then((all) => setProtos(all.filter((p) => p.issueId === subject.id && p.status !== 'discarded'))).catch(() => {})
  }, [subject.id, row.key, s.status, s.detail]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn() } catch (e) { setError(err(e)) } finally { setBusy(false) } }
  const ask = () => act(async () => { await askStep(subject, appId, name, row.key, on); setAsked(true) })

  return (
    <section className="panel step-section" data-component="StepSection">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>{step(row.key).icon} {label(row.key, on)}</h2>
        {row.required ? <Badge tone={finished(s, on) ? 'ok' : 'warn'}>required</Badge> : <span className="faint" style={{ fontSize: 13 }}>optional</span>}
      </div>
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
              {own && s.status === 'started' && row.key !== 'prototype' && <button className="btn quiet" disabled={busy} onClick={() => act(() => engine.setStep(subject, row.key, { status: 'done' }))}>Mark done</button>}
              {asked && <span className="faint">Handed to the agent: it's in the agent panel.</span>}
            </div>
          )}
        </>
      )}
      {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  )
}
