/**
 * To-dos: the work around the code (accounts, approvals, people, checks), each with a checklist. They belong to the
 * app, beside its projects; one can point at the project it unblocks. The agent drafts a checklist on request, and
 * can do or check lines in a conversation. Live: refreshes on every to-do event.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Badge } from '../components/Badge'
import { openEvents, API, engine, type ProjectSummary, type Todo } from '../engine'
import { useCurrentApp } from '../current-app'

const errText = (e: any) => { const m = String(e?.message ?? e); try { return JSON.parse(m).error ?? m } catch { return m } }
type Filter = 'open' | 'done' | 'dropped' | 'all'

export function Todos() {
  const { app } = useCurrentApp()
  const loc = useLocation()
  const [rows, setRows] = useState<Todo[] | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [composing, setComposing] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    setRows(null)
    if (!app) return
    let closed = false
    const refresh = () => engine.todos(app.id).then((r) => { if (!closed) setRows(r) }).catch((e) => setError(errText(e)))
    void refresh()
    engine.projects(app.id).then(setProjects).catch(() => setProjects([]))
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 150) }
    for (const t of ['todo.created', 'todo.updated', 'todo.checked', 'todo.done', 'todo.dropped', 'todo.reopened']) es.addEventListener(t, bump)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [app?.id])
  useEffect(() => { // a link to one to-do (/todos#todo_…) scrolls to it
    const id = loc.hash.slice(1)
    if (id && rows) document.getElementById(id)?.scrollIntoView({ block: 'center' })
  }, [loc.hash, rows])
  const upsert = (t: Todo) => setRows((r) => (r ? (r.some((x) => x.id === t.id) ? r.map((x) => (x.id === t.id ? t : x)) : [t, ...r]) : [t]))
  const counts = { open: 0, done: 0, dropped: 0, all: rows?.length ?? 0 } as Record<Filter, number>
  for (const t of rows ?? []) counts[t.status]++
  const shown = (rows ?? []).filter((t) => filter === 'all' || t.status === filter)
  if (!app) return <div className="empty">No app yet. Add one in Settings.</div>
  return (
    <>
      <div className="page-head">
        <div>
          <h1>✅ To-dos<span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span></h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>The work around the code: accounts, approvals, people, checks. Each has a checklist; the agent drafts one if you ask. A to-do can point at the project it unblocks.</p>
        </div>
        <button className="btn" onClick={() => setComposing(!composing)}>{composing ? 'Close' : 'New to-do'}</button>
      </div>
      {error && <div className="empty bad" onClick={() => setError(null)}>{error}</div>}
      {composing && <NewTodo appId={app.id} projects={projects} onMade={(t) => { upsert(t); setComposing(false); setFilter('open') }} onError={setError} />}
      <div className="filters">
        {(['open', 'done', 'dropped', 'all'] as Filter[]).map((f) => <button key={f} className={`filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)} <span className="faint">{counts[f]}</span></button>)}
      </div>
      {!rows ? <p className="muted">Loading…</p>
        : !shown.length ? <div className="empty">{filter === 'open' ? 'Nothing to do outside the code. Add a to-do, or tell the agent what is on your mind.' : `No ${filter} to-dos.`}</div>
        : <div className="todo-list">{shown.map((t) => <TodoCard key={t.id} todo={t} projects={projects} onChange={upsert} onError={setError} />)}</div>}
    </>
  )
}

function NewTodo({ appId, projects, onMade, onError }: { appId: string; projects: ProjectSummary[]; onMade: (t: Todo) => void; onError: (e: string) => void }) {
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState('')
  const [projectId, setProjectId] = useState('')
  const [owner, setOwner] = useState<'person' | 'agent'>('person')
  const [draft, setDraft] = useState(true)
  const [busy, setBusy] = useState(false)
  const open = projects.filter((p) => !['landed', 'stopped', 'superseded'].includes(p.status))
  const make = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      const checklist = lines.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
      const t = await engine.createTodo({ appId, title, owner, projectId: projectId || undefined, checklist })
      onMade(t)
      if (!checklist.length && draft) void engine.draftChecklist(t.id).catch((e) => onError(`Drafting the checklist failed: ${errText(e)}`)) // arrives on the event stream
    } catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <section className="panel form-grid" data-component="NewTodo">
      <label>What needs doing<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Get approved for Apple" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void make() }} /></label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 200 }}>Unblocks<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">No project</option>{open.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={{ minWidth: 160 }}>Who<select value={owner} onChange={(e) => setOwner(e.target.value as 'person' | 'agent')}><option value="person">You</option><option value="agent">The agent</option></select></label>
      </div>
      <label>Checklist <span className="faint">(one line each; optional)</span><textarea rows={4} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'Enroll in the Apple Developer Program\nRequest the Family Controls entitlement'} /></label>
      {!lines.trim() && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} style={{ width: 'auto', margin: 0 }} /> Have the agent draft the checklist (it may look up how it's done today)</label>}
      <div><button className="btn" disabled={busy || !title.trim()} onClick={make}>Add to-do</button></div>
    </section>
  )
}

/** One to-do: its checklist to tick, lines waiting on someone, notes, and what it unblocks. Used here and on a project's page. */
export function TodoCard({ todo: t, projects = [], onChange, onError, compact = false }: { todo: Todo; projects?: ProjectSummary[]; onChange: (t: Todo) => void; onError: (e: string) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [line, setLine] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(t.notes ?? '')
  const act = async (fn: () => Promise<Todo>) => { setBusy(true); try { onChange(await fn()) } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const done = t.checklist.filter((l) => l.done).length
  const closed = t.status !== 'open'
  const left = t.checklist.filter((l) => !l.done)
  const waiting = left.length && left.every((l) => l.waitingOn) ? [...new Set(left.map((l) => l.waitingOn!))] : [] // stalled: only someone else can move it
  const add = () => { const v = line.trim(); if (v) void act(async () => { const r = await engine.addChecklist(t.id, [v]); setLine(''); return r }) }
  const draft = async () => { setDrafting(true); try { onChange(await engine.draftChecklist(t.id)) } catch (e) { onError(`Drafting failed: ${errText(e)}`) } finally { setDrafting(false) } }
  const project = t.project ?? (t.projectId ? projects.find((p) => p.id === t.projectId) : null)
  return (
    <div id={t.id} className={`card todo ${t.status}`} data-component="TodoCard">
      <div className="card-head">
        <span className="mono faint" style={{ whiteSpace: 'nowrap' }}>{t.identifier}</span>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {waiting.map((w) => <Badge key={w} tone="warn">waiting on {w}</Badge>)}
          {t.checklist.length > 0 && <Badge tone={done === t.checklist.length ? 'ok' : 'neutral'}>{done}/{t.checklist.length}</Badge>}
          <button className="badge" disabled={busy || closed} title="Who does it: click to switch" onClick={() => act(() => engine.updateTodo(t.id, { owner: t.owner === 'person' ? 'agent' : 'person' }))}>{t.owner === 'person' ? 'you' : 'agent'}</button>
          {t.status !== 'open' && <Badge tone={t.status === 'done' ? 'ok' : 'neutral'}>{t.status}</Badge>}
        </span>
      </div>
      <div className="card-title">{t.title}</div>
      {project && !compact && <div className="faint" style={{ fontSize: 13 }}>Unblocks <Link to={`/projects/${project.id}`}>{project.name}</Link></div>}
      {t.status === 'dropped' && t.reason && <div className="faint" style={{ fontSize: 13 }}>Dropped: {t.reason}</div>}
      {t.checklist.length > 0 && (
        <ul className="checklist">
          {t.checklist.map((l) => (
            <li key={l.id} className={l.done ? 'done' : ''}>
              <label><input type="checkbox" checked={l.done} disabled={busy || t.status === 'dropped'} onChange={(e) => act(() => engine.setLine(l.id, { done: e.target.checked }))} /> <span>{l.text}</span></label>
              {l.waitingOn && !l.done && <span className="faint" style={{ fontSize: 12 }}>⏳ {l.waitingOn}</span>}
              {!closed && <span className="line-actions">
                <button className="linkish faint" disabled={busy} title={l.waitingOn ? 'No longer waiting' : 'Waiting on someone else'} onClick={() => { if (l.waitingOn) void act(() => engine.setLine(l.id, { waitingOn: null })); else { const who = window.prompt('Waiting on whom? (e.g. Apple\'s review)'); if (who?.trim()) void act(() => engine.setLine(l.id, { waitingOn: who.trim() })) } }}>⏳</button>
                <button className="linkish faint" disabled={busy} title="Remove this line" onClick={() => act(() => engine.removeLine(l.id))}>×</button>
              </span>}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <div className="backlog-add" style={{ marginTop: 8 }}>
          <input value={line} placeholder="Add a line" onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button className="btn quiet small" disabled={busy || drafting} onClick={draft} title="The agent drafts the checklist, or what is missing from it">{drafting ? 'Drafting…' : t.checklist.length ? 'Agent: what\'s missing?' : 'Agent: draft it'}</button>
        </div>
      )}
      {!compact && (editingNotes ? (
        <div className="form-grid" style={{ marginTop: 8 }}>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Links, who, what was said" />
          <div style={{ display: 'flex', gap: 6 }}><button className="btn small" disabled={busy} onClick={() => act(async () => { const r = await engine.updateTodo(t.id, { notes }); setEditingNotes(false); return r })}>Save notes</button><button className="btn quiet small" onClick={() => { setNotes(t.notes ?? ''); setEditingNotes(false) }}>Cancel</button></div>
        </div>
      ) : t.notes ? <p className="todo-notes" onClick={() => setEditingNotes(true)} title="Click to edit">{t.notes}</p> : null)}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {t.status === 'open' ? <>
          <button className="btn small" disabled={busy} onClick={() => act(() => engine.todoDone(t.id))} title="Done, whatever the checklist says">Done</button>
          {!compact && !editingNotes && <button className="btn quiet small" onClick={() => setEditingNotes(true)}>{t.notes ? 'Edit notes' : 'Add notes'}</button>}
          <button className="btn quiet small" disabled={busy} onClick={() => { const why = window.prompt(`Drop "${t.title}"? Say why.`); if (why?.trim()) void act(() => engine.dropTodo(t.id, why.trim())) }}>Drop</button>
        </> : <button className="btn quiet small" disabled={busy} onClick={() => act(() => engine.reopenTodo(t.id))}>Reopen</button>}
        {compact && <Link className="btn quiet small" to={`/todos#${t.id}`}>Open</Link>}
      </div>
    </div>
  )
}
