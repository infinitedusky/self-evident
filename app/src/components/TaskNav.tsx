/**
 * A task's own nav, down its left side, after Linear's issue sidebar and the side nav in our Settings: its overview
 * first, then its steps in the workflow's order, then the build. Each step is a page of its own. With an enforced
 * order, a step waits on the required ones before it, and the build waits on the brief's approval (Sandy, 2026-10-29:
 * "you can't go to them until you've done the ones that are required").
 */
import { NavLink } from 'react-router'
import { finished, label, step, type On, type Row } from '@self-evident/engine/steps'

/** What a step waits on, in words: a brief that's written but not approved waits on its approval. */
export function after(r: Row, rows: Row[], on: On) {
  if (!r.waitingOn) return null
  const w = rows.find((x) => x.key === r.waitingOn)
  return r.waitingOn === 'brief' && on === 'task' && w?.state.status === 'done' ? 'the brief\'s approval' : label(r.waitingOn, on)
}

/** ✓ finished, ◐ started (or a brief waiting for approval), ○ not started. */
export const mark = (r: Row, on: On) => (finished(r.state, on) ? '✓' : r.state.status === 'none' ? '○' : '◐')

export function TaskNav({ base, here, on = 'task', rows, build }: {
  base: string; here: string; on?: On; rows: Row[]
  /** The build: how many sub-tasks are done, and what it waits on, if anything. */
  build: { done: number; total: number; waitingOn: string | null }
}) {
  const item = (key: string, to: string, body: React.ReactNode, waitingOn: string | null, extra = '') =>
    waitingOn
      ? <span key={key} className={`link locked ${extra}`} title={`After ${waitingOn}`} aria-disabled="true">{body}<span className="task-nav-after">after {waitingOn}</span></span>
      : <NavLink key={key} to={to} end className={() => `link ${here === key ? 'active' : ''} ${extra}`}>{body}</NavLink>
  return (
    <nav className="task-nav" aria-label="This task" data-component="TaskNav">
      {item('overview', base, <span className="task-nav-row"><span className="task-nav-mark">⌂</span>Overview</span>, null)}
      <div className="task-nav-label faint">Steps</div>
      {rows.map((r) => item(r.key, `${base}/${r.key}`,
        <span className="task-nav-row">
          <span className={`task-nav-mark ${finished(r.state, on) ? 'ok' : ''}`}>{mark(r, on)}</span>
          <span className="task-nav-text">{r.position && <span className="faint mono">{r.position}. </span>}{step(r.key).icon} {label(r.key, on)}</span>
          {r.required && !finished(r.state, on) && <span className="task-nav-req" title="Required">•</span>}
        </span>, after(r, rows, on), r.state.status))}
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
