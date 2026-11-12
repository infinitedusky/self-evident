/**
 * On a project's page: Add task(s) (Sandy, 2026-11-12: "It should be Add Task(s) and allow you to create new ones,
 * select existing ones, or choose from Linear"). One panel, three ways in:
 *  - New: a title and, if wanted, what it is. It is made in this project.
 *  - Existing: the app's other open tasks. One in no project is added, one in another open project is moved, and says
 *    where it is now. A task in a project that is running is not offered: the engine won't move it until that stops.
 *  - From Linear (when the app has a Linear team): the team's open tickets; a ticked one becomes a task here. A ticket
 *    that already is a task is named, and is found under Existing.
 * Whatever comes in goes at the end of this project's order.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LinearImport } from './LinearImport'
import { engine, type IssueRow } from '../engine'

const CLOSED = ['done', 'canceled', 'duplicate']
type Way = 'new' | 'existing' | 'linear'
const field = { width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit' } as const
/** The engine's sentence, out of its JSON reply. */
const said = (e: any) => { const m = String(e?.message ?? e); try { return JSON.parse(m).error ?? m } catch { return m } }

export function AddTasks({ appId, projectId, linearTeam, onAdd, onCreate }: {
  appId: string; projectId: string; /** The app's Linear team, when one is set. */ linearTeam?: string
  onAdd: (issueId: string) => Promise<unknown>; onCreate: (title: string, description?: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [way, setWay] = useState<Way>('new')
  const ways: { key: Way; label: string }[] = [{ key: 'new', label: 'New' }, { key: 'existing', label: 'Existing' }, ...(linearTeam ? [{ key: 'linear' as Way, label: 'From Linear' }] : [])]
  return (
    <section className="panel" data-component="AddTasks">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Add tasks</h2>
        <span className="muted" style={{ flex: '1 1 300px', fontSize: 14 }}>Write a new one, pick ones the app already has{linearTeam ? ', or choose tickets from Linear' : ''}. They go at the end of this project's order.</span>
        <button type="button" className="btn quiet" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add task(s)…'}</button>
      </div>
      {open && <>
        <div role="tablist" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {ways.map((w) => <button key={w.key} type="button" role="tab" aria-selected={way === w.key} className={`btn small ${way === w.key ? '' : 'quiet'}`} onClick={() => setWay(w.key)}>{w.label}</button>)}
        </div>
        {way === 'new' && <NewTask onCreate={onCreate} />}
        {way === 'existing' && <Existing appId={appId} projectId={projectId} onAdd={onAdd} />}
        {way === 'linear' && linearTeam && <LinearImport appId={appId} team={linearTeam} embedded verb="Add" onImported={async (r) => { for (const t of r.made) await onAdd(t.id) }} />}
      </>}
    </section>
  )
}

function NewTask({ onCreate }: { onCreate: (title: string, description?: string) => Promise<unknown> }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const create = async () => {
    const t = title.trim(); if (!t || busy) return
    setBusy(true); setProblem(null)
    try { await onCreate(t, description.trim() || undefined); setAdded([...added, t]); setTitle(''); setDescription('') } catch (e) { setProblem(said(e)) } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <input aria-label="Task title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create() }} placeholder="What the task is, in a line" style={field} />
      <textarea aria-label="Task description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="More about it, if it needs saying (optional; markdown)" style={{ ...field, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy || !title.trim()} onClick={() => void create()}>{busy ? 'Adding…' : 'Add task'}</button>
        {added.length > 0 && <span className="faint" style={{ fontSize: 13 }}>Added: {added.join(', ')}</span>}
      </div>
      {problem && <div className="empty bad">{problem}</div>}
    </div>
  )
}

function Existing({ appId, projectId, onAdd }: { appId: string; projectId: string; onAdd: (issueId: string) => Promise<unknown> }) {
  const [rows, setRows] = useState<IssueRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const load = () => engine.codeIssues(appId).then(setRows).catch(() => setRows([]))
  useEffect(() => { setRows(null); void load() }, [appId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const others = (rows ?? []).filter((t) => t.project?.id !== projectId && !CLOSED.includes(t.state) && t.project?.status !== 'running')
  const words = filter.trim().toLowerCase()
  const shown = others.filter((t) => !words || `${t.identifier} ${t.title} ${t.project?.name ?? ''}`.toLowerCase().includes(words))
  const add = async (t: IssueRow) => { setBusy(t.id); try { await onAdd(t.id); await load() } finally { setBusy(null) } }
  if (rows === null) return <p className="muted" style={{ marginTop: 10 }}>Loading…</p>
  if (!others.length) return <div className="empty" style={{ marginTop: 10 }}>Every open task of this app is already here, or in a project that is running.</div>
  return (
    <>
      {others.length > 6 && <input aria-label="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter: words, a number, a project" style={{ ...field, margin: '12px 0 0' }} />}
      <ul className="list" style={{ marginTop: 8 }}>
        {shown.map((t) => (
          <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            <div>
              <Link to={`/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}><span className="mono faint">{t.identifier}</span> {t.title}</Link>
              <div className="faint" style={{ fontSize: 13 }}>{t.project ? <>in {t.project.name}</> : 'in no project'}</div>
            </div>
            <button type="button" className="btn quiet small" disabled={busy === t.id} aria-label={`${t.project ? 'Move' : 'Add'} ${t.identifier}`} onClick={() => void add(t)}>{t.project ? 'Move here' : 'Add'}</button>
          </li>
        ))}
      </ul>
    </>
  )
}
