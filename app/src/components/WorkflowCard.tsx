/**
 * One workflow: the steps it uses, which are required, and whether their order is enforced. It reads as a short list;
 * Edit turns it into switches and arrows (no form until asked). The settings are a small subset of Jira's workflows:
 * no statuses or transitions of their own, only which steps, how strictly, in what order. The fixed rules (the brief
 * always required, the idea first, research before the brief) are shown, and the arrows can't break them.
 */
import { useState } from 'react'
import { Badge } from './Badge'
import { FIXED, canTurnOff, normalize, step, validOrder, type Workflow, type WorkflowStep } from '../steps'

export function WorkflowCard({ workflow, usedBy, editing: startEditing = false, onSave }: { workflow: Workflow; usedBy?: string; editing?: boolean; onSave?: (w: Workflow) => void }) {
  const [editing, setEditing] = useState(startEditing)
  const [w, setW] = useState(() => normalize(workflow))
  const set = (i: number, patch: Partial<WorkflowStep>) => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const moved = (i: number, by: number) => { const steps = [...w.steps]; const [s] = steps.splice(i, 1); steps.splice(i + by, 0, s); return steps }
  const canMove = (i: number, by: number) => i + by >= 0 && i + by < w.steps.length && validOrder(moved(i, by))
  const move = (i: number, by: number) => setW({ ...w, steps: moved(i, by) })
  const on = w.steps.filter((s) => s.on)
  return (
    <div className="panel workflow" data-component="WorkflowCard">
      <div className="card-head">
        <span className="card-title">{w.name}</span>
        {!editing && <button className="btn quiet small" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {usedBy && <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>{usedBy}</div>}
      {!editing ? (
        <>
          <ol className={`wf-steps ${w.ordered ? '' : 'free'}`}>
            {on.map((s) => <li key={s.key}>{step(s.key).icon} {step(s.key).label} {s.required ? <Badge tone="warn">required</Badge> : <span className="faint" style={{ fontSize: 12 }}>optional</span>}</li>)}
          </ol>
          <div className="faint" style={{ fontSize: 13 }}>
            {w.ordered ? 'In this order: a step waits for the required ones before it.' : 'Any order.'}
            {w.steps.length > on.length && <> Off: {w.steps.filter((s) => !s.on).map((s) => step(s.key).label).join(', ')}.</>}
          </div>
        </>
      ) : (
        <>
          <ul className="list">
            {w.steps.map((s, i) => (
              <li key={s.key} className="wf-edit-row">
                <span className="wf-arrows">
                  <button className="btn quiet small" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} aria-label={`Move ${step(s.key).label} up`}>↑</button>
                  <button className="btn quiet small" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} aria-label={`Move ${step(s.key).label} down`}>↓</button>
                </span>
                <span className={s.on ? '' : 'faint'}>{step(s.key).icon} {step(s.key).label}{s.key in FIXED && s.key !== 'brief' && <span className="faint" style={{ fontSize: 12 }}> · {FIXED[s.key as keyof typeof FIXED].toLowerCase()}</span>}</span>
                {canTurnOff(s.key)
                  ? <label><input type="checkbox" checked={s.on} onChange={(e) => set(i, { on: e.target.checked, required: e.target.checked && s.required })} /> On</label>
                  : <span />}
                {canTurnOff(s.key)
                  ? <label className={s.on ? '' : 'faint'}><input type="checkbox" disabled={!s.on} checked={s.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
                  : <Badge tone="warn">always required</Badge>}
              </li>
            ))}
          </ul>
          <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={w.ordered} onChange={(e) => setW({ ...w, ordered: e.target.checked })} /> Enforce this order</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn small" onClick={() => { onSave?.(w); setEditing(false) }}>Save</button>
            <button className="btn quiet small" onClick={() => { setW(normalize(workflow)); setEditing(false) }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}
