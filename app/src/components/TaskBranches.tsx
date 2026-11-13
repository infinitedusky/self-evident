/**
 * A task's save points and task branches, on its overview (Sandy, 2026-11-13: "I get to a point and I don't know if
 * it's right to move forward yet … but I also don't want to stop"; "it should be very easy to get rid of one of these").
 *
 * One flat list. A save point is a name on where the task is now: its code in every worktree, its brief, criteria,
 * approvals, steps, comments and sub-tasks. Saving does not interrupt anything. Going back to one starts a new task
 * branch there and sets aside the one worked on, whole, so nothing is lost; a set-aside one can be worked on again.
 * Deleting a save point loses only the way back, so it goes at once; a task branch holds work, so that asks once.
 *
 * After a game's save points, and a git client's branch list for "current", "switch" and "delete".
 */
import { useCallback, useEffect, useState } from 'react'
import { engine, type SavePoint, type TaskBranch, type TaskBranches as View } from '../engine'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
/** What the engine said went wrong, without its wrapping. */
const problem = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
const only = (w: NonNullable<TaskBranch['work']>) => [w.commits ? n(w.commits, 'commit') : '', w.comments ? n(w.comments, 'comment') : ''].filter(Boolean).join(' and ')

type Asking = { kind: 'back'; save: SavePoint } | { kind: 'switch'; branch: TaskBranch } | { kind: 'delete'; branch: TaskBranch } | { kind: 'clear' } | null

export function TaskBranches({ issueId, onMoved }: { issueId: string; /** The task changed under the page: read it again. */ onMoved?: () => void }) {
  const [v, setV] = useState<View | null>(null)
  const [name, setName] = useState('')
  const [asking, setAsking] = useState<Asking>(null)
  const [as, setAs] = useState('')
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const load = useCallback(() => engine.taskBranches(issueId).then(setV).catch((e) => setError(problem(e))), [issueId])
  useEffect(() => { void load() }, [load])
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setSaid(null)
    try { const s = await fn(); setAsking(null); setAs(''); setReset(false); if (s) setSaid(s); await load(); return true } catch (e: any) { setError(problem(e)); return false } finally { setBusy(false) }
  }
  const move = (go: () => Promise<{ now: { name: string }; setAside: { name: string }; restarted: number; leftAlone: string[]; problems: string[] }>) => run(async () => {
    const r = await go(); onMoved?.()
    return `Now working on “${r.now.name}”. “${r.setAside.name}” is set aside.${r.restarted ? ' The prototype restarted on this code.' : ''}${r.leftAlone.length ? ` Left as it is: ${r.leftAlone.join(', ')}.` : ''}${r.problems.length ? ` ${r.problems.join(' ')}` : ''}`
  })
  if (!v) return error ? <div className="empty bad">{error}</div> : null
  const cur = v.branches.find((b) => b.current)
  const aside = v.branches.filter((b) => !b.current)
  const empty = !v.saves.length && !aside.length
  return (
    <section className="panel task-branches" data-component="TaskBranches" aria-label="Save points">
      <h2>Save points {!empty && <span className="faint">{[v.saves.length ? n(v.saves.length, 'save point') : '', aside.length ? `${n(aside.length, 'task branch', 'task branches')} set aside` : ''].filter(Boolean).join(', ')}</span>}
        {!empty && <button className="btn quiet small task-branches-clear" disabled={busy} onClick={() => setAsking({ kind: 'clear' })}>Clear all</button>}
      </h2>
      <p className="faint task-branches-lead">
        {cur && (cur.name !== 'Main' || aside.length > 0) ? <>Working on <b>{cur.name}</b>{cur.fromSave ? `, started from “${cur.fromSave}”` : ''}. </> : null}
        A save point marks where the task is now: its code, brief, criteria, approvals and comments. Saving does not stop anything; you can go back to one later.
      </p>
      {empty && <p className="muted">No save points yet. Save before a change you are not sure of.</p>}
      {asking?.kind === 'clear' && (
        <div className="task-branches-ask" role="group" aria-label="Clear all">
          <div>Remove {[v.saves.length ? `all ${n(v.saves.length, 'save point')}` : '', aside.length ? `${n(aside.length, 'set-aside task branch', 'set-aside task branches')} with the work that is only on ${aside.length === 1 ? 'it' : 'them'}` : ''].filter(Boolean).join(' and ')}? What you are working on stays as it is.</div>
          <div><button className="btn small" disabled={busy} onClick={() => void run(async () => { await engine.clearTaskBranches(issueId) })}>Clear them</button> <button className="btn quiet small" onClick={() => setAsking(null)}>Keep them</button></div>
        </div>
      )}
      <ul className="task-branches-list">
        {v.saves.map((s) => (
          <li key={s.id}>
            <div className="task-branches-row">
              <span className="task-branches-kind" aria-hidden="true">●</span>
              <div className="task-branches-body">
                <div>{s.name}</div>
                <div className="faint">Save point · {ago(s.createdAt)}{s.auto ? ' · made by Self Evident' : ''}{s.onCurrent ? (s.changesSince ? ` · ${n(s.changesSince, 'change')} since` : ' · nothing changed since') : s.branchName ? ` · on “${s.branchName}”` : ''}</div>
              </div>
              <span className="task-branches-actions">
                <button className="btn quiet small" disabled={busy} onClick={() => { setAsking({ kind: 'back', save: s }); setAs(''); setReset(false); setError(null) }} aria-label={`Go back to ${s.name}`}>Go back to here</button>
                <button className="icon-btn" disabled={busy} onClick={() => void run(async () => { await engine.deleteSavePoint(s.id) })} title="Delete this save point. The work is not touched." aria-label={`Delete save point ${s.name}`}>×</button>
              </span>
            </div>
            {asking?.kind === 'back' && asking.save.id === s.id && (
              <form className="task-branches-ask" onSubmit={(e) => { e.preventDefault(); void move(() => engine.goBack(s.id, { name: as.trim() || undefined, resetData: reset })) }}>
                <div>A new task branch starts at “{s.name}” and becomes the one you work on: the code in every worktree, the brief, the criteria and their marks, approvals and comments as they were then. {s.onCurrent && s.changesSince ? `The ${n(s.changesSince, 'change')} since are set aside as “${cur?.name ?? 'Main'}”, not lost.` : `What you are working on is set aside as “${cur?.name ?? 'Main'}”, not lost.`} A running prototype restarts.</div>
                <input value={as} onChange={(e) => setAs(e.target.value)} aria-label="Name of the new task branch" placeholder={`Name it (else “From ${s.name}”)`} />
                <label className="task-branches-check"><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Also rebuild the prototype's data from its sample data (when the code then had a different database layout)</label>
                <div><button className="btn small" disabled={busy}>Go back</button> <button type="button" className="btn quiet small" onClick={() => setAsking(null)}>Stay here</button></div>
              </form>
            )}
          </li>
        ))}
        {aside.map((b) => (
          <li key={b.id}>
            <div className="task-branches-row">
              <span className="task-branches-kind aside" aria-hidden="true">⑂</span>
              <div className="task-branches-body">
                <div>{b.name}</div>
                <div className="faint">Set aside{b.fromSave ? ` · started from “${b.fromSave}”` : ''}{b.work && only(b.work) ? ` · ${only(b.work)} only here` : ''}</div>
              </div>
              <span className="task-branches-actions">
                <button className="btn quiet small" disabled={busy} onClick={() => { setAsking({ kind: 'switch', branch: b }); setReset(false); setError(null) }} aria-label={`Work on ${b.name}`}>Work on this</button>
                <button className="icon-btn" disabled={busy} onClick={() => setAsking({ kind: 'delete', branch: b })} title="Delete this task branch and the work that is only on it" aria-label={`Delete task branch ${b.name}`}>×</button>
              </span>
            </div>
            {asking?.kind === 'switch' && asking.branch.id === b.id && (
              <form className="task-branches-ask" onSubmit={(e) => { e.preventDefault(); void move(() => engine.switchTaskBranch(b.id, { resetData: reset })) }}>
                <div>“{b.name}” becomes the one you work on, as it was left. “{cur?.name ?? 'Main'}” is set aside, not lost. A running prototype restarts.</div>
                <label className="task-branches-check"><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Also rebuild the prototype's data from its sample data</label>
                <div><button className="btn small" disabled={busy}>Work on it</button> <button type="button" className="btn quiet small" onClick={() => setAsking(null)}>Stay here</button></div>
              </form>
            )}
            {asking?.kind === 'delete' && asking.branch.id === b.id && (
              <div className="task-branches-ask" role="group" aria-label={`Delete ${b.name}`}>
                <div>Delete “{b.name}”? {b.work && only(b.work) ? `${only(b.work)} ${b.work.commits + b.work.comments === 1 ? 'is' : 'are'} only on it and go with it` : 'Nothing is only on it'}, with its git branches and its own save points. This can't be undone.</div>
                <div><button className="btn small" disabled={busy} onClick={() => void run(async () => { await engine.deleteTaskBranch(b.id) })}>Delete it</button> <button className="btn quiet small" onClick={() => setAsking(null)}>Keep it</button></div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="task-branches-save" onSubmit={async (e) => { e.preventDefault(); if (await run(async () => { await engine.saveHere(issueId, name) })) setName('') }}>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name of the save point" placeholder="Name it: Proto before review" />
        <button className="btn small" disabled={busy}>Save here</button>
      </form>
      {said && <div className="task-branches-said" role="status">{said}</div>}
      {error && <div className="empty bad">{error}</div>}
    </section>
  )
}
