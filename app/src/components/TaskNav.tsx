/**
 * A task's own nav, down its left side, after Linear's issue sidebar and the side nav in our Settings: its overview
 * first, then its two stages, the brief and the build (Sandy, 2026-11-10: a task "really has the brief stage and then
 * the build stage"). The brief is the parent of the steps: it comes first, and the steps that feed it sit under it,
 * in the workflow's order. Each is a page of its own. With an enforced order, a step waits on the required ones
 * before it (Sandy, 2026-10-29: "you can't go to them until you've done the ones that are required"); the brief is
 * approved once the required steps are done, and the build waits on that approval.
 */
import { NavLink } from 'react-router'
import { finished, label, step, type On, type Row } from '@self-evident/engine/steps'

/** What a step waits on, in words. */
export function after(r: Row, _rows: Row[], on: On) {
  return r.waitingOn ? label(r.waitingOn, on) : null
}

/** Where the brief stands, in a few words under its row: what it still waits on, or that it waits for the person. */
export function briefStands(rows: Row[], on: On) {
  const b = rows.find((r) => r.key === 'brief')
  if (!b || finished(b.state, on)) return null
  const owed = rows.filter((r) => r.key !== 'brief' && r.required && !finished(r.state, on))
  if (owed.length) return `waits on ${owed.map((r) => label(r.key, on)).join(', ')}`
  return b.state.status === 'done' && on === 'task' ? 'waiting for your approval' : b.state.status === 'none' ? 'not written yet' : 'a draft'
}

/** ✓ finished, ◐ started (or a brief waiting for approval), ○ not started. */
export const mark = (r: Row, on: On) => (finished(r.state, on) ? '✓' : r.state.status === 'none' ? '○' : '◐')

export function TaskNav({ base, here, on = 'task', rows, workflow, build }: {
  base: string; here: string; on?: On; rows: Row[]
  /** The workflow in force and where it comes from (", the app's default"); its steps are the list. */
  workflow?: { name: string; from: string } | null
  /** The build: how many sub-tasks are done, and what it waits on, if anything. */
  build: { done: number; total: number; waitingOn: string | null }
}) {
  const item = (key: string, to: string, body: React.ReactNode, waitingOn: string | null, extra = '') =>
    waitingOn
      ? <span key={key} className={`link locked ${extra}`} title={`After ${waitingOn}`} aria-disabled="true">{body}<span className="task-nav-after">after {waitingOn}</span></span>
      : <NavLink key={key} to={to} end className={() => `link ${here === key ? 'active' : ''} ${extra}`}>{body}</NavLink>
  const brief = rows.find((r) => r.key === 'brief')
  const feeds = rows.filter((r) => r.key !== 'brief')
  const stands = briefStands(rows, on)
  return (
    <nav className="task-nav" aria-label="This task" data-component="TaskNav">
      {item('overview', base, <span className="task-nav-row"><span className="task-nav-mark">⌂</span>Overview</span>, null)}
      <div className="task-nav-label faint">Brief</div>
      {workflow && <div className="task-nav-workflow faint" title={`The workflow this task follows${workflow.from}`}>Workflow: <b>{workflow.name}</b>{workflow.from}</div>}
      {brief && item('brief', `${base}/brief`,
        <>
          <span className="task-nav-row">
            <span className={`task-nav-mark ${finished(brief.state, on) ? 'ok' : ''}`}>{mark(brief, on)}</span>
            <span className="task-nav-text">{step('brief').icon} The brief</span>
          </span>
          {stands && <span className="task-nav-after">{stands}</span>}
        </>, null, brief.state.status)}
      {feeds.map((r) => item(r.key, `${base}/${r.key}`,
        <span className="task-nav-row">
          <span className={`task-nav-mark ${finished(r.state, on) ? 'ok' : ''}`}>{mark(r, on)}</span>
          <span className="task-nav-text">{r.position && <span className="faint mono">{r.position}. </span>}{step(r.key).icon} {label(r.key, on)}</span>
          {r.required && !finished(r.state, on) && <span className="task-nav-req" title="Required">•</span>}
        </span>, after(r, rows, on), `${r.state.status} task-nav-feed`))}
      <div className="task-nav-label faint">Build</div>
      {item('build', `${base}/build`,
        <span className="task-nav-row">
          <span className={`task-nav-mark ${build.total && build.done === build.total ? 'ok' : ''}`}>{build.total ? (build.done === build.total ? '✓' : '◐') : '○'}</span>
          <span className="task-nav-text">🏗️ Sub-tasks</span>
          {build.total > 0 && <span className="faint mono" style={{ fontSize: 12 }}>{build.done}/{build.total}</span>}
        </span>, build.waitingOn)}
    </nav>
  )
}
