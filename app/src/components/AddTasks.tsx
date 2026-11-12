/**
 * On a project's page: bring in tasks that already exist (Sandy, 2026-11-12: "add tasks that already exist to a
 * project or move them from one to the other"). Lists the app's other open tasks: one in no project is added, one in
 * another open project is moved, and says where it is now. It goes at the end of this project's order. A task in a
 * project that is running is not offered: the engine won't move it until that project is stopped.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { engine, type IssueRow } from '../engine'

const CLOSED = ['done', 'canceled', 'duplicate']

export function AddTasks({ appId, projectId, onAdd }: { appId: string; projectId: string; onAdd: (issueId: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<IssueRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const load = () => engine.codeIssues(appId).then(setRows).catch(() => setRows([]))
  useEffect(() => { if (open) { setRows(null); void load() } }, [open, appId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const others = (rows ?? []).filter((t) => t.project?.id !== projectId && !CLOSED.includes(t.state) && t.project?.status !== 'running')
  const words = filter.trim().toLowerCase()
  const shown = others.filter((t) => !words || `${t.identifier} ${t.title} ${t.project?.name ?? ''}`.toLowerCase().includes(words))
  const add = async (t: IssueRow) => { setBusy(t.id); try { await onAdd(t.id); await load() } finally { setBusy(null) } }
  return (
    <section className="panel" data-component="AddTasks">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Existing tasks</h2>
        <span className="muted" style={{ flex: '1 1 300px', fontSize: 14 }}>Add a task that is in no project, or move one in from another. It goes at the end of this project's order.</span>
        <button type="button" className="btn quiet" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add existing tasks…'}</button>
      </div>
      {open && rows === null && <p className="muted" style={{ marginTop: 10 }}>Loading…</p>}
      {open && rows && !others.length && <div className="empty" style={{ marginTop: 10 }}>Every open task of this app is already here, or in a project that is running.</div>}
      {open && others.length > 0 && <>
        {others.length > 6 && <input aria-label="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter: words, a number, a project" style={{ width: '100%', margin: '12px 0 0', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }} />}
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
      </>}
    </section>
  )
}
