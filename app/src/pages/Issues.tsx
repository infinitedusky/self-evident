/**
 * Issues: every code issue of the current app, in a project or not (Sandy, 2026-10-27: "tasks can be created
 * without project, and they can be added to projects"). Ones in no project come first, each with a place to send it;
 * the rest by project, in their order. Plan the ones with nothing planned yet.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { LinearImport } from '../components/LinearImport'
import { engine, STATE_LABEL, type IssueRow, type ProjectSummary } from '../engine'
import { useCurrentApp } from '../current-app'
import { Md } from '../components/Md'

export function standing(t: IssueRow): { label: string; tone: Tone } {
  const total = Object.values(t.builds).reduce((a, b) => a + b, 0)
  const done = t.builds.done ?? 0
  if (t.planning === 'issue.planning') return { label: 'planning…', tone: 'accent' }
  if (t.planning === 'issue.plan_waiting') return { label: 'waiting for the model', tone: 'warn' }
  if (['done', 'canceled', 'duplicate', 'backlog', 'triage', 'in_review'].includes(t.state)) return { label: STATE_LABEL[t.state], tone: t.state === 'done' ? 'ok' : t.state === 'in_review' ? 'accent' : 'neutral' }
  if (!total) return t.planning === 'issue.plan_failed' ? { label: 'planning failed', tone: 'bad' } : { label: 'not planned yet', tone: 'neutral' }
  if (t.builds.failed) return { label: `${t.builds.failed} failed · ${done}/${total} landed`, tone: 'bad' }
  if (t.builds.running || t.builds.merging || t.builds.testing) return { label: `${done}/${total} landed · building`, tone: 'accent' }
  return { label: `${done}/${total} landed`, tone: 'neutral' }
}

export function Issues() {
  const { app } = useCurrentApp()
  const [rows, setRows] = useState<IssueRow[] | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const reload = () => { if (app) { engine.codeIssues(app.id).then(setRows).catch((e) => setError(String(e.message ?? e))); engine.projects(app.id).then(setProjects).catch(() => {}) } }
  useEffect(() => { setRows(null); reload() }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(null); try { await fn(); reload() } catch (e: any) { const m = String(e.message ?? e); try { setError(JSON.parse(m).error ?? m) } catch { setError(m) } } finally { setBusy(null) } }
  const open = (s: string) => !['landed', 'stopped', 'superseded'].includes(s) // an issue can be planned until its project is over
  const targets = projects.filter((p) => open(p.status))
  const linearTeam = app?.setup?.integrations?.linear?.team?.trim().toUpperCase() // set under Integrations › Linear: tickets can be brought in
  const loose = rows?.filter((t) => (!t.project || t.project.solo) && !['done', 'canceled', 'duplicate'].includes(t.state)) ?? [] // on its own: in no project, or planned in one of its own
  const placed = rows?.filter((t) => t.project && !t.project.solo) ?? []
  return (
    <>
      <div className="page-head"><div>
        <h1>📋 Tasks{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>Every task of code work: what it will change, and where it stands. One in no project is planned and built on its own, or added to a project; a project builds its tasks in order, each planned into sub-tasks when its turn comes.</p>
      </div></div>
      {error && <div className="empty bad">{error}</div>}
      {app && linearTeam && <LinearImport appId={app.id} team={linearTeam} onImported={reload} />}
      {rows && !rows.length && <div className="empty">No tasks yet. Ask in the conversation, start a project, or make an idea a task.</div>}
      {loose.length > 0 && (
        <section className="panel">
          <h2>In no project <Badge>{loose.length}</Badge></h2>
          <ul className="list">
            {loose.map((t) => (
              <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={`/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}><span className="mono faint">{t.identifier}</span> {t.title}</Link>
                  {t.description && <div className="muted" style={{ fontSize: 14, margin: '2px 0' }}><Md text={t.description} clamp={3} /></div>}
                  {t.project?.solo && <div className="faint" style={{ fontSize: 13 }}>Planned on its own · {t.project.status} · <Link to={`/projects/${t.project.id}`}>Its plan and build →</Link></div>}
                </div>
                {targets.length > 0 && (!t.project || ['drafting', 'proposed', 'approved'].includes(t.project.status)) && (
                  <select disabled={busy === t.id} value="" onChange={(e) => e.target.value && act(t.id, () => engine.updateIssue(t.id, { projectId: e.target.value }))} aria-label={`Add ${t.identifier} to a project`}>
                    <option value="">Add to a project…</option>
                    {targets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {placed.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {placed.map((t) => { const s = standing(t); const unplanned = !Object.values(t.builds).reduce((a, b) => a + b, 0); return (
            <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <Link to={`/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}><span className="mono faint">{t.identifier}</span> {t.title}</Link>
                {t.description && <div className="muted" style={{ fontSize: 14, margin: '2px 0' }}><Md text={t.description} clamp={3} /></div>}
                <div className="faint" style={{ fontSize: 13 }}>in <Link to={`/projects/${t.project!.id}`}>{t.project!.name}</Link> · {t.project!.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Badge tone={s.tone} dot={s.tone === 'accent'}>{s.label}</Badge>
                {unplanned && t.state === 'todo' && open(t.project!.status) && !['issue.planning', 'issue.plan_waiting'].includes(t.planning ?? '') && <button className="btn small" disabled={busy === t.id} onClick={() => act(t.id, () => engine.planIssue(t.id))}>Plan</button>}
                {open(t.project!.status) && !['done', 'canceled', 'duplicate'].includes(t.state) && (
                  <select className="small" disabled={busy === t.id} value="" aria-label={`Move ${t.identifier}`} title={t.project!.status === 'running' ? 'Its project is running: stop it before moving a task out' : undefined}
                    onChange={(e) => e.target.value && act(t.id, () => engine.updateIssue(t.id, { projectId: e.target.value === 'none' ? null : e.target.value }))}>
                    <option value="">Move…</option>
                    {targets.filter((p) => p.id !== t.project!.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="none">No project</option>
                  </select>
                )}
              </div>
            </li>) })}
        </ul>
      )}
    </>
  )
}
