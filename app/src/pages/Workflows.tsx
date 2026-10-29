/**
 * The app's workflows, under Plan: each one's steps, how strictly and in what order; which is the app's default; how
 * many projects and tasks use each. A task uses its own, else its project's, else the app's (LOG.md, 2026-10-29).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DEFAULT_STEPS } from '@self-evident/engine/steps'
import { WorkflowCard } from '../components/WorkflowCard'
import { engine, type WorkflowRow } from '../engine'
import { useCurrentApp } from '../current-app'

export function Workflows() {
  const { app } = useCurrentApp()
  const [list, setList] = useState<WorkflowRow[] | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = () => app && engine.workflows(app.id).then(setList).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { setList(null); void reload() }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setError(null); await reload() } catch (e: any) { setError(String(e.message ?? e)) } }
  if (!app) return <div className="empty">No app yet. Add one in Settings.</div>
  const byDefault = list?.find((w) => w.appDefault)
  return (
    <>
      <p className="mono"><Link to="/plan">← Plan</Link></p>
      <div className="page-head">
        <div>
          <h1>Workflows<span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span></h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>Which steps a task takes, which are required, and whether their order is enforced. The brief is always required; starting as an idea is always first; research comes before the brief; checks come after it. A task uses its own workflow, else its project's, else the app's.</p>
        </div>
        <button className="btn" onClick={() => setName(name === null ? '' : null)}>New workflow</button>
      </div>
      {name !== null && (
        <section className="panel new-task">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name, like UI change or Quick fix" onKeyDown={(e) => { if (e.key === 'Escape') setName(null) }} />
          <button className="btn small" disabled={!name.trim()} onClick={() => act(async () => { await engine.saveWorkflow({ appId: app.id, name, steps: DEFAULT_STEPS, ordered: false }); setName(null) })}>Make it</button>
          <button className="btn quiet small" onClick={() => setName(null)}>Cancel</button>
        </section>
      )}
      {error && <div className="empty bad" style={{ marginBottom: 12 }}>{error}</div>}
      {list && (
        <section className="panel">
          <h2>The app's default</h2>
          <select value={byDefault?.id ?? ''} onChange={(e) => act(() => engine.useWorkflow({ kind: 'apps', id: app.id }, e.target.value || null))}>
            <option value="">None: any step, any order; only the brief is required</option>
            {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </section>
      )}
      {list === null ? <p className="muted">Loading…</p> : list.length === 0 ? <div className="empty">No workflows yet. Without one, every step but the brief is optional and the order is free.</div> : (
        <div className="workflow-list">
          {list.map((w) => (
            <WorkflowCard key={w.id} workflow={w} usedBy={[w.appDefault && 'The app\'s default', `${w.projects} project${w.projects === 1 ? '' : 's'}`, `${w.tasks} task${w.tasks === 1 ? '' : 's'} use it`].filter(Boolean).join(' · ')}
              onSave={(next) => void act(() => engine.saveWorkflow({ ...next, appId: app.id }))} />
          ))}
        </div>
      )}
    </>
  )
}
