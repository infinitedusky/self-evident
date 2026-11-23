/**
 * Notes (engine/src/notes.ts): what a person wants kept that Evident cannot know. A conversation had and what
 * came of it, something found, a decision made along the way. Each has the day it is about, so a report on that day
 * includes it, and the tasks it is about, none or several.
 *
 * On the Reports page these are the app's, all of them. On a task: the ones attached to it, and a new one is
 * attached to it to begin with.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import { Md } from './Md'
import { engine, type Issue, type Note } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dayLabel = (on: string) => new Date(`${on}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function Notes({ appId, issueId, version = 0 }: { appId: string; /** A task: its notes, and a new one is about it. None: every note of the app. */ issueId?: string; /** Read again when it changes. */ version?: number }) {
  const [list, setList] = useState<Note[] | null>(null)
  const [tasks, setTasks] = useState<Issue[]>([])
  const [open, setOpen] = useState<null | 'new' | string>(null)
  const [only, setOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reload = () => engine.notes(appId, { issueId }).then((l) => { setList(l); setError(null) }).catch((e) => { setList([]); setError(err(e)) })
  useEffect(() => { void reload() }, [appId, issueId, version]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) void engine.issues(appId, { top: true }).then(setTasks).catch(() => setTasks([])) }, [appId, open])
  if (!list) return null
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setOpen(null); await reload() } catch (e) { setError(err(e)) } }
  const shown = only ? list.filter((n) => n.kind === 'decision') : list
  const decisions = list.filter((n) => n.kind === 'decision').length
  return (
    <section className="panel" data-component="Notes">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: '0 auto 0 0' }}>Notes {list.length > 0 && <Badge>{list.length}</Badge>}</h2>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          {decisions > 0 && <label className="faint" style={{ fontSize: 13 }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Decisions only</label>}
          <button className="btn quiet small" onClick={() => setOpen(open === 'new' ? null : 'new')}>Add a note</button>
        </span>
      </div>
      <p className="faint" style={{ margin: '4px 0 10px', fontSize: 13 }}>{issueId ? 'What was said, found or decided about this task.' : 'What was said, found or decided, by day.'} A report includes the notes dated in its period.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}
      {open === 'new' && <NoteForm tasks={tasks} start={{ on: today(), kind: 'note', title: '', body: '', issueIds: issueId ? [issueId] : [] }} onSave={(b) => act(() => engine.addNote(appId, b))} onCancel={() => setOpen(null)} />}
      {!shown.length ? open !== 'new' && <div className="empty">{only ? 'No decisions noted.' : 'None yet.'}</div>
        : shown.map((n) => open === n.id
          ? <NoteForm key={n.id} tasks={tasks} start={{ on: n.on, kind: n.kind, title: n.title, body: n.body, issueIds: n.tasks.map((t) => t.id) }} onSave={(b) => act(() => engine.editNote(appId, n.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Remove the note "${n.title}"?`)) void act(() => engine.removeNote(appId, n.id)) }} />
          : (
            <div className="note" key={n.id} data-note={n.id}>
              <div className="note-head">
                <span className="note-day">{dayLabel(n.on)}</span>
                {n.kind === 'decision' && <Badge tone="accent">Decision</Badge>}
                <strong>{n.title}</strong>
                <button className="btn quiet small" style={{ marginLeft: 'auto' }} aria-label={`Edit the note ${n.title}`} onClick={() => setOpen(n.id)}>Edit</button>
              </div>
              {n.body && <Md text={n.body} className="note-body" />}
              {n.tasks.filter((t) => t.id !== issueId).length > 0 && <div className="faint" style={{ fontSize: 13 }}>{issueId ? 'Also about' : 'About'}: {n.tasks.filter((t) => t.id !== issueId).map((t, i) => <span key={t.id}>{i > 0 && ', '}<Link to={`/tasks/${t.id}`} title={t.title}>{t.name}</Link></span>)}</div>}
            </div>
          ))}
    </section>
  )
}

interface Draft { on: string; kind: 'note' | 'decision'; title: string; body: string; issueIds: string[] }
/** A note written or changed: its day, what it is, what it says, and the tasks it is about. */
function NoteForm({ start, tasks, onSave, onCancel, onRemove }: { start: Draft; tasks: Issue[]; onSave: (b: Draft) => Promise<void>; onCancel: () => void; onRemove?: () => void }) {
  const [d, setD] = useState<Draft>(start)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Draft>) => setD({ ...d, ...p })
  return (
    <form className="mock-edit" data-component="NoteForm" style={{ margin: '0 0 12px' }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave({ ...d, title: d.title.trim(), body: d.body.trim() }) } finally { setBusy(false) } }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <label>Day<input type="date" value={d.on} onChange={(e) => set({ on: e.target.value })} /></label>
        <label className="mock-check" style={{ marginBottom: 6 }}><input type="checkbox" checked={d.kind === 'decision'} onChange={(e) => set({ kind: e.target.checked ? 'decision' : 'note' })} /> A decision</label>
      </div>
      <label>What it is about<input autoFocus value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Talked with the team about the import" /></label>
      <label>What was said, and what came of it<textarea rows={4} value={d.body} onChange={(e) => set({ body: e.target.value })} /></label>
      <div>
        <div className="task-calls-sub">Tasks it is about</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {d.issueIds.map((id) => { const t = tasks.find((x) => x.id === id); return <span className="chip" key={id}>{t ? t.identifier : 'a task'}<button type="button" className="btn quiet small" aria-label={`No longer about ${t?.identifier ?? 'that task'}`} onClick={() => set({ issueIds: d.issueIds.filter((x) => x !== id) })}>×</button></span> })}
          <select aria-label="Attach a task" value="" onChange={(e) => { if (e.target.value) set({ issueIds: [...d.issueIds, e.target.value] }) }}>
            <option value="">{d.issueIds.length ? 'another task…' : 'none: attach a task…'}</option>
            {tasks.filter((t) => !d.issueIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.identifier} {t.title}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <button className="btn small" type="submit" disabled={!d.title.trim() || !d.on || busy}>{busy ? 'Saving…' : 'Save the note'}</button>
        {onRemove && <button className="btn quiet small" type="button" onClick={onRemove}>Remove</button>}
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
