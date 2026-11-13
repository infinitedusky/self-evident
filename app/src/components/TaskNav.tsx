/**
 * A task's own nav, down its left side, after Linear's issue sidebar and the side nav in our Settings: its overview
 * first, then its two stages, the brief and the build (Sandy, 2026-11-10: a task "really has the brief stage and then
 * the build stage"). The brief is the parent of the steps: it comes first, and the steps that feed it sit under it,
 * in the workflow's order. Each is a page of its own. With an enforced order, a step waits on the required ones
 * before it (Sandy, 2026-10-29: "you can't go to them until you've done the ones that are required"); the brief is
 * approved once the required steps are done, and the build waits on that approval.
 */
import { useState } from 'react'
import { NavLink } from 'react-router'
import { finished, label, ready, step, type On, type Row } from '@self-evident/engine/steps'

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

/** ✓ finished (approved, where a person approves it), ◐ started or ready for the person, ○ not started. */
export const mark = (r: Row, on: On) => (finished(r.state, on) ? '✓' : r.state.status === 'none' ? '○' : '◐')

export function TaskNav({ base, here, on = 'task', rows, workflow, build, folded, onToggle, saves, onSave }: {
  base: string; here: string; on?: On; rows: Row[]
  /** The workflow in force and where it comes from (", the app's default"); its steps are the list. */
  workflow?: { name: string; from: string } | null
  /** The build: how many sub-tasks are done, and what it waits on, if anything. */
  build?: { done: number; total: number; waitingOn: string | null }
  /** Folded to a strip of icons, to give the step's page the room (Sandy, 2026-11-10: "make the left nav steps collapsible too"). */
  folded?: boolean
  onToggle?: () => void
  /**
   * The task's save points, at the bottom (Sandy, 2026-11-13: "a list could start and the one you are on could be
   * shown"): the task branch being worked on, each save point, each task branch set aside. Left out: no section.
   */
  saves?: { current: string | null; points: { id: string; name: string }[]; aside: { id: string; name: string }[] }
  /** Save here, under this name (empty: the engine names it). */
  onSave?: (name: string) => unknown
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
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
    const said = (r: Row) => (finished(r.state, on) ? 'done' : ready(r.state, on) ? 'ready for you to approve' : r.state.status === 'none' ? 'not started' : 'started')
    return (
      <nav className="task-nav folded" aria-label={`This ${on}`} data-component="TaskNav">
        {toggle}
        {icon('overview', base, '⌂', 'Overview', `this ${on}`, null, false)}
        {brief && icon('brief', `${base}/brief`, step('brief').icon, on === 'task' ? 'The brief' : label('brief', on), stands ?? said(brief), null, finished(brief.state, on))}
        {feeds.map((r) => icon(r.key, `${base}/${r.key}`, step(r.key).icon, label(r.key, on), said(r), after(r, rows, on), finished(r.state, on)))}
        {build && icon('build', `${base}/build`, '🏗️', 'Sub-tasks', build.total ? `${build.done}/${build.total}` : 'not planned', build.waitingOn, !!build.total && build.done === build.total)}
        {saves && icon('saves', `${base}/saves`, '💾', 'Save points', saves.points.length || saves.aside.length ? `${saves.points.length} saved${saves.aside.length ? `, ${saves.aside.length} set aside` : ''}${saves.current ? `; working on ${saves.current}` : ''}` : 'none yet', null, false)}
      </nav>
    )
  }
  return (
    <nav className="task-nav" aria-label={`This ${on}`} data-component="TaskNav">
      {toggle}
      {item('overview', base, <span className="task-nav-row"><span className="task-nav-mark">⌂</span>Overview</span>, null)}
      <div className="task-nav-label faint">Brief</div>
      {workflow && <div className="task-nav-workflow faint" title={`The workflow this ${on} follows${workflow.from}`}>Workflow: <b>{workflow.name}</b>{workflow.from}</div>}
      {brief && item('brief', `${base}/brief`,
        <>
          <span className="task-nav-row">
            <span className={`task-nav-mark ${finished(brief.state, on) ? 'ok' : ''}`}>{mark(brief, on)}</span>
            <span className="task-nav-text">{step('brief').icon} {on === 'task' ? 'The brief' : label('brief', on)}</span>
          </span>
          {stands && <span className="task-nav-after">{stands}</span>}
        </>, null, brief.state.status)}
      {feeds.map((r) => item(r.key, `${base}/${r.key}`,
        <>
        <span className="task-nav-row">
          <span className={`task-nav-mark ${finished(r.state, on) ? 'ok' : ''}`}>{mark(r, on)}</span>
          <span className="task-nav-text">{r.position && <span className="faint mono">{r.position}. </span>}{step(r.key).icon} {label(r.key, on)}</span>
          {r.required && !finished(r.state, on) && <span className="task-nav-req" title="Required">•</span>}
        </span>
        {ready(r.state, on) && <span className="task-nav-after task-nav-ready" title="The agent says it is done: yours to approve">ready for you</span>}
        </>, after(r, rows, on), `${r.state.status} task-nav-feed`))}
      {build && <div className="task-nav-label faint">Build</div>}
      {build && item('build', `${base}/build`,
        <span className="task-nav-row">
          <span className={`task-nav-mark ${build.total && build.done === build.total ? 'ok' : ''}`}>{build.total ? (build.done === build.total ? '✓' : '◐') : '○'}</span>
          <span className="task-nav-text">🏗️ Sub-tasks</span>
          {build.total > 0 && <span className="faint mono" style={{ fontSize: 12 }}>{build.done}/{build.total}</span>}
        </span>, build.waitingOn)}
      {saves && (
        <>
          <div className="task-nav-label faint">Save points</div>
          {(saves.points.length > 0 || saves.aside.length > 0) && (
            <NavLink to={`${base}/saves`} end className={() => `link task-nav-save current ${here === 'saves' ? 'active' : ''}`} title="The task branch being worked on">
              <span className="task-nav-row"><span className="task-nav-mark ok">▸</span><span className="task-nav-text">{saves.current ?? 'Main'}</span></span>
              <span className="task-nav-after">working on</span>
            </NavLink>
          )}
          {saves.points.map((p) => (
            <NavLink key={p.id} to={`${base}/saves`} end className="link task-nav-save" title={`Save point: ${p.name}`}>
              <span className="task-nav-row"><span className="task-nav-mark task-nav-point">●</span><span className="task-nav-text">{p.name}</span></span>
            </NavLink>
          ))}
          {saves.aside.map((b) => (
            <NavLink key={b.id} to={`${base}/saves`} end className="link task-nav-save" title={`Set aside: ${b.name}`}>
              <span className="task-nav-row"><span className="task-nav-mark">⑂</span><span className="task-nav-text">{b.name}</span></span>
              <span className="task-nav-after">set aside</span>
            </NavLink>
          ))}
          {onSave && (naming
            ? <form className="task-nav-saving" onSubmit={async (e) => { e.preventDefault(); await onSave(name.trim()); setName(''); setNaming(false) }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(false) }} aria-label="Name of the save point" placeholder="Name it, then Enter" />
              </form>
            : <button className="task-nav-save-here" aria-label="Save here" onClick={() => setNaming(true)} title="Mark where the task is now, to come back to. The work carries on.">＋ Save here</button>)}
        </>
      )}
    </nav>
  )
}
