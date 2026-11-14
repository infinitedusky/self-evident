/**
 * One workflow, in the three parts a task has (Sandy, 2026-11-14): the steps a person chooses on the way to an approved
 * prototype, what runs by itself after it, and the brief. It reads as a short list;
 * Edit turns it into switches and arrows (no form until asked). The settings are a small subset of Jira's workflows:
 * no statuses or transitions of their own, only which steps, how strictly, in what order. The fixed rules live in the
 * engine's steps module: the arrows can't break them, and a step that is always on has no switch.
 */
import { useState } from 'react'
import { Badge } from './Badge'
import { CHECKS, addCheck, canTurnOff, normalize, removeCheck, step, validOrder, type StepKey, type Workflow, type WorkflowStep } from '@self-evident/engine/steps'

const NOTE: Partial<Record<StepKey, string>> = { idea: 'always first', brief: 'the parent: every step feeds it, and it is approved last', analysis: 'a check, first once the prototype is approved', adr: 'a check, after the other steps', risk: 'a check, after the other steps', audit: 'a check, after the other steps' }

export function WorkflowCard({ workflow, usedBy, editing: startEditing = false, onSave }: { workflow: Workflow; usedBy?: string; editing?: boolean; onSave?: (w: Workflow) => void }) {
  const [editing, setEditing] = useState(startEditing)
  const [w, setW] = useState(() => normalize(workflow))
  const set = (i: number, patch: Partial<WorkflowStep>) => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const moved = (i: number, by: number) => { const steps = [...w.steps]; const [s] = steps.splice(i, 1); steps.splice(i + by, 0, s); return steps }
  const canMove = (i: number, by: number) => i + by >= 0 && i + by < w.steps.length && w.steps[i].key !== 'brief' && w.steps[i + by].key !== 'brief' && validOrder(moved(i, by)) // the brief stays last: it isn't in the order
  const move = (i: number, by: number) => setW({ ...w, steps: moved(i, by) })
  const on = w.steps.filter((s) => s.on)
  const off = w.steps.filter((s) => !s.on)
  const lead = (s: WorkflowStep) => s.key !== 'brief' && step(s.key).place !== 'check' // the steps a person chooses, on the way to the prototype
  const check = (s: WorkflowStep) => step(s.key).place === 'check' // what runs by itself once the prototype is approved
  const missing = CHECKS.filter((k) => !w.steps.some((s) => s.key === k))
  return (
    <div className="panel workflow" data-component="WorkflowCard">
      <div className="card-head">
        <span className="card-title">{w.name}</span>
        {!editing && <button className="btn quiet small" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {usedBy && <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>{usedBy}</div>}
      {!editing ? (
        <>
          <h4 className="wf-h">On the way to an approved prototype <span className="faint">yours to choose</span></h4>
          <ol className={`wf-steps ${w.ordered ? '' : 'free'}`}>
            {on.filter(lead).map((s) => <li key={s.key}>{step(s.key).icon} {step(s.key).label} {s.required ? <Badge tone="warn">required</Badge> : <span className="faint" style={{ fontSize: 12 }}>optional: done or skipped on each task</span>}</li>)}
          </ol>
          <div className="faint" style={{ fontSize: 13 }}>
            {w.ordered ? 'In this order: a step waits for the required ones before it.' : 'In any order.'}
            {off.length > 0 && <> Off: {off.map((s) => step(s.key).label).join(', ')}.</>}
          </div>
          <h4 className="wf-h">After the prototype is approved <span className="faint">runs by itself, in this order</span></h4>
          <ol className="wf-steps">
            {on.filter(check).map((s) => <li key={s.key}>{step(s.key).icon} {step(s.key).label}</li>)}
            <li className="faint">🏗️ The plan (sub-tasks), then the build</li>
          </ol>
          {missing.length > 0 && <div className="faint" style={{ fontSize: 13 }}>Not in this workflow: {missing.map((k) => step(k).label).join(', ')}.</div>}
          <h4 className="wf-h">The brief <span className="faint">always, and approved by you</span></h4>
          <div className="faint" style={{ fontSize: 13 }}>What to build and why. It can be approved once every step above it is done, or skipped where it is optional. What every plan must cover (telemetry, tests and the rest) is the app's: Settings › Landing.</div>
        </>
      ) : (
        <>
          <h4 className="wf-h">On the way to an approved prototype</h4>
          <ul className="list">
            {w.steps.map((s, i) => !lead(s) ? null : (
              <li key={s.key} className="wf-edit-row">
                <span className="wf-arrows">
                  <button className="btn quiet small" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} aria-label={`Move ${step(s.key).label} up`}>↑</button>
                  <button className="btn quiet small" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} aria-label={`Move ${step(s.key).label} down`}>↓</button>
                </span>
                <span className={s.on ? '' : 'faint'}>{step(s.key).icon} {step(s.key).label}{NOTE[s.key] && <span className="faint" style={{ fontSize: 12 }}> · {NOTE[s.key]}</span>}</span>
                {canTurnOff(s.key) ? <label><input type="checkbox" checked={s.on} onChange={(e) => set(i, { on: e.target.checked, required: e.target.checked && s.required })} /> On</label> : <span />}
                <label className={s.on ? '' : 'faint'}><input type="checkbox" disabled={!s.on} checked={s.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
              </li>
            ))}
          </ul>
          <h4 className="wf-h">After the prototype is approved <span className="faint">runs by itself, in this order</span></h4>
          <ul className="list">
            {CHECKS.map((k) => {
              const i = w.steps.findIndex((s) => s.key === k)
              const has = i >= 0
              return (
                <li key={k} className="wf-edit-row">
                  <span />
                  <span className={has ? '' : 'faint'} title={step(k).what}>{step(k).icon} {step(k).label}</span>
                  <label><input type="checkbox" checked={has} onChange={(e) => setW(e.target.checked ? addCheck(w, k) : removeCheck(w, k))} /> In this workflow</label>
                  <label className={has ? '' : 'faint'}><input type="checkbox" disabled={!has} checked={has && w.steps[i].required} onChange={(e) => set(i, { required: e.target.checked })} /> The brief waits for it</label>
                </li>
              )
            })}
            <li className="wf-edit-row faint"><span /><span>🏗️ The plan (sub-tasks), then the build</span><span>always</span><span /></li>
          </ul>
          <h4 className="wf-h">The brief <span className="faint">always, and approved by you</span></h4>
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
