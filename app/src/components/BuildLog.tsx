/**
 * A sub-task's build as it happens, in a tab: the builder's steps, then everything it did, one line each
 * (what it said, the commands it ran, the files it read and changed), live. After Replit's action feed:
 * a tool's output stays folded under its line.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge } from './Badge'
import { openEvents, API, engine, type Event, type IssueDetail } from '../engine'
import { describeEvent } from '../describe-event'
import { useWorkspace } from '../workspace'

const SHOWN = new Set(['build.status', 'build.held', 'build.error', 'build.failed', 'build.retry', 'build.interrupted', 'run.started', 'run.message', 'run.tool_call', 'run.tool_result', 'run.error', 'run.result', 'run.rate_limit', 'land.committed', 'land.tested', 'land.landed', 'land.conflict', 'land.retry'])
const MARK: Record<string, string> = { completed: '✓', in_progress: '●', pending: '○' }

export function BuildLog({ issueId }: { issueId: string }) {
  const ws = useWorkspace()
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let closed = false
    const refresh = () => engine.issue(issueId).then((i) => { if (!closed) setIssue(i) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = openEvents(`${API}/events?issue=${issueId}`)
    const onAny = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as Event
      if (SHOWN.has(e.type)) setEvents((prev) => [...prev.slice(-499), e])
      window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 200)
    }
    for (const type of [...SHOWN, 'run.steps']) es.addEventListener(type, onAny as EventListener)
    es.onerror = () => setError('event stream disconnected; retrying')
    es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [issueId])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [events.length])

  if (!issue) return <div className="tab-page" data-component="BuildLog">{error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>}</div>
  const done = issue.steps.filter((s) => s.status === 'completed').length
  return (
    <div className="tab-page build-log" data-component="BuildLog">
      <header className="build-log-head">
        <span className="mono faint">{issue.identifier}</span>
        <strong>{issue.title}</strong>
        {issue.build && <Badge tone={issue.build.status === 'running' ? 'accent' : issue.build.status === 'failed' ? 'bad' : issue.build.status === 'done' ? 'ok' : 'neutral'} dot={issue.build.status === 'running'}>{issue.build.status}{issue.build.attempt > 1 ? ` · attempt ${issue.build.attempt}` : ''}</Badge>}
        {ws && <button className="btn quiet small" onClick={() => ws.open({ kind: 'page', path: `/tasks/${issue.id}` })}>Open the task</button>}
      </header>
      {issue.build?.heldReason && <p className="faint" style={{ margin: '0 0 8px' }}>Held: {issue.build.heldReason}</p>}
      {issue.steps.length > 0 && (
        <details className="build-log-steps" open>
          <summary><strong>Steps</strong> <span className="faint">{done}/{issue.steps.length}</span></summary>
          <ol>{issue.steps.map((s) => <li key={s.id} className={s.status}><span className="mark" aria-hidden="true">{MARK[s.status]}</span>{s.text}</li>)}</ol>
        </details>
      )}
      {error && <div className="faint" style={{ fontSize: 12 }}>{error}</div>}
      {events.length === 0 ? <p className="muted">Nothing yet. The builder's actions show here as it works.</p> : (
        <ol className="feed">
          {events.map((e) => <FeedLine key={e.seq} e={e} />)}
        </ol>
      )}
      <div ref={bottom} />
    </div>
  )
}

function FeedLine({ e }: { e: Event }) {
  const time = <span className="mono faint">{e.ts.slice(11, 19)}</span>
  const text = describeEvent(e)
  if (e.type === 'run.message') return <li className="feed-say">{time}<span>{text}</span></li>
  if (e.type === 'run.tool_result') return <li className="feed-result">{time}<details><summary className="mono faint">{(e.payload as { ok?: boolean }).ok === false ? 'error' : 'output'}</summary><pre>{text}</pre></details></li>
  const tone = /error|failed|conflict/.test(e.type) ? 'bad' : e.type === 'land.landed' ? 'ok' : ''
  return <li className={`feed-act ${tone}`}>{time}<span className="mono">{e.type.startsWith('run.tool') ? text : <><span className="faint">{e.type}</span> {text}</>}</span></li>
}
