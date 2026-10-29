/**
 * Workflow rules, in an app's settings. A workflow here is configuration, not something that runs: it says which steps
 * a task goes through before it's built, which are required, and whether their order is enforced. The app's default
 * applies to every project and task that doesn't have its own (LOG.md, 2026-10-29).
 */
import { useEffect, useState } from 'react'
import { DEFAULT_STEPS } from '@self-evident/engine/steps'
import { WorkflowCard } from './WorkflowCard'
import { engine, type WorkflowRow } from '../engine'

export function WorkflowSettings({ appId }: { appId: string }) {
  const [list, setList] = useState<WorkflowRow[] | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = () => engine.workflows(appId).then(setList).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { setList(null); void reload() }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setError(null); await reload() } catch (e: any) { setError(String(e.message ?? e)) } }
  const byDefault = list?.find((w) => w.appDefault)
  return (
    <section className="panel" data-component="WorkflowSettings">
      <div className="task-block-head">
        <h2 style={{ margin: 0 }}>Workflow rules</h2>
        <button className="btn quiet small" onClick={() => setName(name === null ? '' : null)}>New set of rules</button>
      </div>
      <p className="faint settings-desc" style={{ margin: '6px 0 12px', maxWidth: 760 }}>
        Rules for the steps a task goes through before it's built: which ones it takes, which are required, and whether their order is enforced. Nothing here runs anything.
        Some rules are fixed: the brief is always required, starting as an idea comes first, research comes before the brief, and checks come after it.
        A task follows its own rules if it has some, else its project's, else the app's default.
      </p>
      {name !== null && (
        <div className="new-task" style={{ marginBottom: 12 }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="A name, like UI change or Quick fix" onKeyDown={(e) => { if (e.key === 'Escape') setName(null) }} />
          <button className="btn small" disabled={!name.trim()} onClick={() => act(async () => { await engine.saveWorkflow({ appId, name, steps: DEFAULT_STEPS, ordered: false }); setName(null) })}>Add</button>
          <button className="btn quiet small" onClick={() => setName(null)}>Cancel</button>
        </div>
      )}
      {error && <div className="empty bad" style={{ marginBottom: 12 }}>{error}</div>}
      {list === null ? <p className="muted">Loading…</p> : (
        <>
          <label className="settings-group" style={{ display: 'block' }}>The app's default{' '}
            <select value={byDefault?.id ?? ''} onChange={(e) => act(() => engine.useWorkflow({ kind: 'apps', id: appId }, e.target.value))}>
              {!byDefault && <option value="" disabled>Choose one</option>}
              {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          {list.length > 0 && (
            <div className="workflow-list">
              {list.map((w) => <WorkflowCard key={w.id} workflow={w} usedBy={w.appDefault ? 'The app\'s default' : undefined} onSave={(next) => void act(() => engine.saveWorkflow({ ...next, appId }))} />)}
            </div>
          )}
        </>
      )}
    </section>
  )
}
