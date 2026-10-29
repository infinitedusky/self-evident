/**
 * Ideas: the inbox first (rows in the engine: type it, it's kept; make it a project when its time comes), then the
 * design-phase idea files below, as they were.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Idea } from '../ideas'
import { LANES } from '../ideas'
import { Badge } from '../components/Badge'
import { LaneColumn } from '../components/LaneColumn'
import { engine, type IdeaRow, type ProjectSummary } from '../engine'
import { useCurrentApp } from '../current-app'

export function Board({ ideas }: { ideas: Idea[] }) {
  const nav = useNavigate()
  const { apps, app } = useCurrentApp()
  const appId = app?.id ?? ''
  const [rows, setRows] = useState<IdeaRow[] | null>(null)
  const [projects, setPlans] = useState<ProjectSummary[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const reload = () => Promise.all([engine.ideas(appId || undefined), engine.projects(appId || undefined)]).then(([i, p]) => { setRows(i); setPlans(p) }).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { setRows(null); setPlans([]); if (appId) void reload() }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!title.trim() || !appId) return
    setBusy('add')
    try { await engine.createIdea({ appId, title, body: body.trim() || undefined }); setTitle(''); setBody(''); await reload() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(null) }
  }
  const convert = async (id: string, as: 'task' | 'project') => {
    setBusy(id)
    try { const out = await engine.convertIdea(id, { as }); nav(out.issueId ? `/issues/${out.issueId}` : `/projects/${out.projectId}`) } catch (e: any) { setError(String(e.message ?? e)); setBusy(null) }
  }
  const projectOf = (i: IdeaRow) => projects.find((p) => p.ideaId === i.id)
  const notes = ideas.filter((i) => i.app === app?.name) // the files are labelled with the app they are about
  const inbox = (rows ?? []).filter((r) => r.lane === 'inbox')
  const planned = (rows ?? []).filter((r) => r.lane !== 'inbox')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>💡 Ideate{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Type it, it's kept. Research it, draft it, mock it up or prototype it without committing; when it's something we'll build, it becomes a task or a project.</p>
        </div>
        <span className="mono faint">{inbox.length} in the inbox</span>
      </div>

      <section className="panel">
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>Idea<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line: what should be true?" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void add() }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Why, and anything already decided (optional)<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Kept with the idea; the agent reads it when it's converted." /></label>
          <div className="faint" style={{ alignSelf: 'end', fontSize: 13 }}>For {app?.name ?? '…'} (pick another app in the nav)</div>
          <div style={{ alignSelf: 'end' }}><button className="btn" disabled={!title.trim() || !appId || busy === 'add'} onClick={add}>Keep it</button></div>
        </div>
        {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
      </section>

      <section className="panel">
        <h2>Inbox</h2>
        {rows === null ? <p className="muted">Loading…</p> : inbox.length === 0 ? <p className="muted" style={{ margin: 0 }}>Empty. Good.</p> : (
          <ul className="attention">
            {inbox.map((i) => (
              <li key={i.id}>
                <span className="mono faint">#{i.number}</span>
                <div><Link to={`/ideas/${i.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{i.title}</Link>{i.body && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{i.body}</div>}
                  <div className="faint" style={{ fontSize: 12 }}>{apps.find((a) => a.id === i.appId)?.name}</div></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link className="btn quiet small" to={`/ideas/${i.id}`} title="Research, a rough draft, mockups, a prototype: nothing committed">Work on it</Link>
                  <button className="btn quiet small" disabled={busy === i.id} onClick={() => convert(i.id, 'task')} title="One thing to build; its brief waits for your approval">As a task</button>
                  <button className="btn quiet small" disabled={busy === i.id} onClick={() => convert(i.id, 'project')} title="Several things in order">As a project</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {planned.length > 0 && (
          <p className="faint" style={{ margin: '12px 0 0', fontSize: 13 }}>Planned: {planned.map((i) => { const p = projectOf(i); return p ? <span key={i.id}><Link to={`/projects/${p.id}`}>{i.title}</Link> <Badge>{p.status}</Badge> </span> : <span key={i.id}>{i.title} </span> })}</p>
        )}
      </section>

      {notes.length > 0 && <>
      <div className="page-head" style={{ marginTop: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>From the design notes</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>The ideas written as files in <code>ideas/</code> before the inbox existed. Every idea carries its evidence; telemetry decides.</p>
        </div>
        <span className="mono faint">{notes.length} ideas</span>
      </div>
      <div className="lanes">
        {LANES.map((l) => <LaneColumn key={l.id} label={l.label} hint={l.hint} ideas={notes.filter((i) => i.lane === l.id)} />)}
      </div>
      </>}
    </>
  )
}
