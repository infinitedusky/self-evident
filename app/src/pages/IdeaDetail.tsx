/**
 * One idea from the inbox: what it says, its steps (research, a rough draft, mockups, a prototype, none of them
 * committing to anything), and converting it. The agent reads everything the idea has and decides whether it becomes a
 * task or a project; or the person says which (LOG.md, 2026-10-29).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '../components/Badge'
import { StepsPanel } from '../components/StepsPanel'
import { engine, type IdeaRow } from '../engine'
import { useCurrentApp } from '../current-app'

export function IdeaDetail({ id }: { id: string }) {
  const nav = useNavigate()
  const [idea, setIdea] = useState<IdeaRow | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { app } = useCurrentApp()
  useEffect(() => { if (app) engine.ideas(app.id).then((all) => setIdea(all.find((i) => i.id === id) ?? null)).catch((e) => setError(String(e.message ?? e))) }, [id, app?.id])
  const convert = async (as: 'task' | 'project') => {
    setBusy(true)
    try { const out = await engine.convertIdea(id, { as }); nav(out.issueId ? `/tasks/${out.issueId}` : `/projects/${out.projectId}`) } catch (e: any) { setError(String(e.message ?? e)); setBusy(false) }
  }
  const ask = async () => {
    if (!idea) return
    setBusy(true)
    try { await engine.ask({ appId: idea.appId, subjectRef: { ideaId: idea.id }, text: `Convert the idea #${idea.number} "${idea.title}" (${idea.id}) into a task or a project: read everything it has, decide which, and say why.` }) } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  if (error && !idea) return <div className="empty bad">{error}</div>
  if (idea === undefined) return <p className="muted">Loading…</p>
  if (idea === null) return <div className="empty">No such idea. <Link to="/ideas">Back to the ideas</Link>.</div>
  const open = idea.lane === 'inbox'
  return (
    <>
      <p className="mono"><Link to="/ideas">← Ideas</Link></p>
      <div className="page-head">
        <div>
          <h1><span className="mono faint" style={{ fontWeight: 400 }}>#{idea.number}</span> {idea.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><Badge tone={open ? 'neutral' : 'ok'}>{open ? 'an idea' : 'converted'}</Badge></div>
          {idea.body && <p className="muted" style={{ margin: '8px 0 0', maxWidth: 720, whiteSpace: 'pre-wrap' }}>{idea.body}</p>}
        </div>
      </div>
      <StepsPanel subject={{ kind: 'ideas', id: idea.id }} appId={idea.appId} name={idea.title} />
      {open && (
        <section className="panel">
          <h2>Convert it</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>When it's something we'll build. Its research, mockups and prototype go with it, and its rough draft becomes the brief, waiting for your approval.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={busy} onClick={ask}>Ask the agent to convert it</button>
            <button className="btn quiet" disabled={busy} onClick={() => convert('task')}>As a task</button>
            <button className="btn quiet" disabled={busy} onClick={() => convert('project')}>As a project</button>
          </div>
          {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
        </section>
      )}
    </>
  )
}
