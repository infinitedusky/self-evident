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

export function TaskNav({ base, here, on = 'task', rows, workflow, build, folded, onToggle }: {
  base: string; here: string; on?: On; rows: Row[]
  /** The workflow in force and where it comes from (", the app's default"); its steps are the list. */
  workflow?: { name: string; from: string } | null
  /** The build: how many sub-tasks are done, and what it waits on, if anything. */
  build: { done: number; total: number; waitingOn: string | null }
  /** Folded to a strip of icons, to give the step's page the room (Sandy, 2026-11-10: "make the left nav steps collapsible too"). */
  folded?: boolean
  onToggle?: () => void
}) {
  const item = (key: string, to: string, body: React.ReactNode, waitingOn: string | null, extra = '') =>
    waitingOn
      ? <span key={key} className={`link locked ${extra}`} title={`After ${waitingOn}`} aria-disabled="true">{body}<span className="task-nav-after">after {waitingOn}</span></span>
      : <NavLink key={key} to={to} end className={() => `link ${here === key ? 'active' : ''} ${extra}`}>{body}</NavLink>
  const brief = rows.find((r) => r.key === 'brief')
  const feeds = rows.filter((r) => r.key !== 'brief')
  const stands = briefStands(rows, on)
  const toggle = onToggle && <button className="task-nav-fold" onClick={onToggle} aria-expanded={!folded} aria-label={folded ? 'Show the steps' : 'Hide the steps'} title={folded ? 'Show the steps' : 'Hide the steps'}>{folded ? '›' : '‹'}</button>
  if (folded) { // icons only: each still goes to its page, its name and state in the tooltip
    const icon = (key: string, to: string, glyph: string, name: string, state: string, waitingOn: string | null, done: boolean) =>
      waitingOn
        ? <span key={key} className="link locked" title={`${name}: after ${waitingOn}`} aria-disabled="true">{glyph}</span>
        : <NavLink key={key} to={to} end className={() => `link ${here === key ? 'active' : ''} ${done ? 'done' : ''}`} title={`${name}: ${state}`} aria-label={name}>{glyph}</NavLink>
    const said = (r: Row) => (finished(r.state, on) ? 'done' : r.state.status === 'none' ? 'not started' : 'started')
    return (
      <nav className="task-nav folded" aria-label="This task" data-component="TaskNav">
        {toggle}
        {icon('overview', base, '⌂', 'Overview', 'this task', null, false)}
        {brief && icon('brief', `${base}/brief`, step('brief').icon, 'The brief', stands ?? said(brief), null, finished(brief.state, on))}
        {feeds.map((r) => icon(r.key, `${base}/${r.key}`, step(r.key).icon, label(r.key, on), said(r), after(r, rows, on), finished(r.state, on)))}
        {icon('build', `${base}/build`, '🏗️', 'Sub-tasks', build.total ? `${build.done}/${build.total}` : 'not planned', build.waitingOn, !!build.total && build.done === build.total)}
      </nav>
    )
  }
  return (
    <nav className="task-nav" aria-label="This task" data-component="TaskNav">
      {toggle}
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
