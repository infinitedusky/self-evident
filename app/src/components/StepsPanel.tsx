/**
 * The steps on one idea, task or project, live: the engine's view (the workflow in force, each step's state), kept up
 * to date on the app's events. Start hands the step to the agent in a conversation of its own; Open shows what a step
 * produced (notes, an ADR, mockups) under the cards, opens its prototype, or takes a task to its brief.
 */
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { label, type StepKey } from '@self-evident/engine/steps'
import { Steps } from './Steps'
import { API, engine, type StepSubject, type StepsView, type StepWork } from '../engine'
import { useWorkspace } from '../workspace'

const LIVE = ['step.updated', 'brief.approved', 'brief.unapproved', 'workflow.used', 'workflow.saved', 'idea.converted', 'issue.updated', 'prototype.created', 'prototype.started', 'prototype.stopped', 'prototype.discarded']
const WHAT = { ideas: 'the idea', issues: 'the task', projects: 'the project' }

export function StepsPanel({ subject, appId, name, onBrief }: { subject: StepSubject; appId: string; name: string; onBrief?: () => void }) {
  const ws = useWorkspace()
  const [v, setV] = useState<StepsView | null>(null)
  const [open, setOpen] = useState<StepWork | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    let closed = false
    const refresh = () => engine.steps(subject).then((x) => { if (!closed) setV(x) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?since=-1&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
    for (const t of LIVE) es.addEventListener(t, bump)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [subject.kind, subject.id, appId]) // eslint-disable-line react-hooks/exhaustive-deps

  const ref = subject.kind === 'ideas' ? { ideaId: subject.id } : subject.kind === 'issues' ? { issueId: subject.id } : { projectId: subject.id }
  const ask = (key: StepKey) => engine.ask({ appId, subjectRef: ref, text: key === 'prototype'
    ? `Start a prototype for ${WHAT[subject.kind]} "${name}" (${subject.id}), as a step of it.`
    : `Do the ${label(key, v!.on)} step for ${WHAT[subject.kind]} "${name}" (${subject.id}), and record it with set_step.` }).catch((e) => setError(String(e.message ?? e)))

  const onStart = async (key: string) => {
    const k = key as StepKey
    const state = v?.states.find((s) => s.key === k)
    if (k === 'brief' && subject.kind === 'issues') return onBrief?.()
    if (k === 'prototype' && state && state.status !== 'none') return ws?.open({ kind: 'prototype' })
    if (!state || state.status === 'none') return void ask(k)
    const w = await engine.step(subject, k).catch(() => null)
    setOpen(w && (open?.key !== k) ? w : null)
  }

  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <section className="panel"><h2>Steps</h2><p className="muted">Loading…</p></section>
  return (
    <>
      <Steps on={v.on} states={v.states} resolved={v.resolved} fromIdea={v.fromIdea ? `#${v.fromIdea.number} ${v.fromIdea.title}` : null} onStart={onStart} />
      {open && (
        <section className="panel step-open">
          <div className="card-head">
            <h2 style={{ margin: 0 }}>{label(open.key, v.on)}</h2>
            <button className="btn quiet small" onClick={() => setOpen(null)}>Close</button>
          </div>
          {open.refs.length > 0 && (
            <p style={{ margin: '8px 0' }}>{open.refs.map((story) => <button key={story} className="btn quiet small" style={{ marginRight: 6 }} onClick={() => ws?.open({ kind: 'storybook', story })}>{story}</button>)}</p>
          )}
          {open.body ? <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{open.body}</Markdown></div> : <p className="faint">{open.detail ?? 'Nothing written yet.'}</p>}
        </section>
      )}
      {error && <div className="empty bad">{error}</div>}
    </>
  )
}
