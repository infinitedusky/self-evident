/**
 * What a run read, did and said, as the tab of an agent that is a run and not a conversation: the planner (Sandy,
 * 2026-11-13: "I can't see if the planner is running or not"). Read only: there is nothing to say to it. It follows
 * the run while it works.
 *
 * After the conversation beside it (the same column, the same order, oldest first) and a CI job's log for the lines.
 */
import { useEffect, useRef, useState } from 'react'
import { openEvents, API, engine, type RunLine, type RunLog } from '../engine'
import { Md } from './Md'

const did = (l: RunLine) => {
  const i = l.input ?? {}
  const what = (i.file ?? i.command ?? i.pattern ?? '') as string
  return { verb: l.tool === 'Read' ? 'Read' : l.tool === 'Grep' || l.tool === 'Glob' ? 'Searched' : l.tool === 'Bash' ? 'Ran' : l.tool ?? 'Did', what: String(what), where: l.tool === 'Grep' && i.path ? ` in ${i.path}` : '' }
}

export function RunLogView({ runId }: { runId: string }) {
  const [log, setLog] = useState<RunLog | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let on = true
    let timer: number | undefined
    const read = () => { void engine.runLog(runId).then((l) => { if (on) setLog(l) }).catch(() => {}) }
    read()
    const bump = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 300) }
    const es = openEvents(`${API}/events?since=now`)
    for (const t of ['run.message', 'run.tool_call', 'run.error', 'issue.planning', 'issue.planned', 'issue.plan_failed', 'issue.plan_waiting']) es.addEventListener(t, bump)
    return () => { on = false; es.close(); window.clearTimeout(timer) }
  }, [runId])
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }) }, [log?.lines.length])
  if (!log) return <div className="run-log"><p className="faint">Loading…</p></div>
  return (
    <div className="run-log" data-component="RunLogView" aria-label="What the planner is doing">
      <p className="faint run-log-note">The planner reads the brief and the code and returns the sub-tasks in one go. There is nothing to say to it: to change the plan, change the brief and plan again.</p>
      {log.lines.length === 0 && <p className="muted">Nothing from it yet.</p>}
      <ol className="run-log-lines">
        {log.lines.map((l) => {
          if (l.type === 'run.message') return <li key={l.seq} className="said"><Md text={l.text} /></li>
          if (l.type === 'run.tool_call') { const d = did(l); return <li key={l.seq} className="did"><span className="faint">{d.verb}</span> <code>{d.what || l.tool}</code>{d.where && <span className="faint">{d.where}</span>}</li> }
          if (l.type === 'issue.planning') return <li key={l.seq} className="mark">Started planning</li>
          if (l.type === 'issue.planned') return <li key={l.seq} className="mark ok">Planned {Array.isArray(l.subIssues) ? `${l.subIssues.length} sub-task${l.subIssues.length === 1 ? '' : 's'}` : 'it'}. They are on the Sub-tasks page.</li>
          if (l.type === 'issue.plan_waiting') return <li key={l.seq} className="mark warn">Waiting to try again{l.minutes ? ` in about ${l.minutes} min` : ''}: {l.error}</li>
          if (l.type === 'issue.plan_failed' || l.type === 'run.error') return <li key={l.seq} className="mark bad">Planning failed: {l.error}</li>
          return null
        })}
      </ol>
      {log.working && <p className="run-log-working"><span className="dot working" /> Working out the sub-tasks…</p>}
      {!log.working && log.costUsd != null && <p className="faint run-log-note">Run cost estimate: ${log.costUsd.toFixed(2)}</p>}
      <div ref={end} />
    </div>
  )
}
