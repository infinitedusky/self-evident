/**
 * The steps on one idea, task or project, as cards: what each has so far and what's next. They're things you do to
 * it, not places to go, so they live here and not in the rail (LOG.md, 2026-10-29). A workflow in force says where it
 * came from; with none, every step is optional and the order is free. After Linear's project page, which keeps a
 * project's documents and milestones on the project itself.
 */
import { Badge } from './Badge'
import { label, rows, step, type On, type Resolved, type StepState } from '../steps'

const FROM = { task: 'this task\'s own', project: 'from its project', app: 'the app\'s' }

export function Steps({ on, states, resolved, onStart }: { on: On; states: StepState[]; resolved: Resolved; onStart?: (key: string) => void }) {
  const list = rows(on, states, resolved.workflow)
  const wf = resolved.workflow
  return (
    <section className="panel" data-component="Steps">
      <div className="steps-head">
        <h2>Steps</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {wf ? <>Workflow <b>{wf.name}</b> · {FROM[resolved.from!]}{wf.ordered ? ' · in order' : ''}</> : 'No workflow: any step, any order, all optional.'}
        </span>
      </div>
      <div className="steps">
        {list.map((r) => {
          const s = r.state
          const blocked = !!r.waitingOn
          const briefWaits = r.key === 'brief' && on === 'task' && s.status === 'done' && !s.approved
          return (
            <div key={r.key} className={`step-card ${s.status} ${blocked ? 'blocked' : ''}`}>
              <div className="card-head">
                <span className="card-title">{r.position && <span className="faint mono">{r.position}. </span>}{step(r.key).icon} {label(r.key, on)}</span>
                {r.required ? <Badge tone="warn">required</Badge> : <span className="faint" style={{ fontSize: 12 }}>optional</span>}
              </div>
              <p className="faint" style={{ margin: '2px 0 8px', fontSize: 13 }}>{on === 'idea' && r.key === 'brief' ? 'A first pass, nothing committed. The real brief is written on the task.' : step(r.key).what}</p>
              <div className="step-foot">
                {s.status === 'none'
                  ? <span className="faint">Not started</span>
                  : <span>{s.status === 'done' ? '✓ ' : '◐ '}{s.detail ?? (s.status === 'done' ? 'Done' : 'Started')}</span>}
                {s.approved && <Badge tone="ok">approved by {s.approved.by}</Badge>}
                {briefWaits && <Badge tone="warn">waiting for approval</Badge>}
                {blocked
                  ? <span className="faint" style={{ marginLeft: 'auto', fontSize: 13 }}>after {label(r.waitingOn!, on)}</span>
                  : <button className="btn quiet small" style={{ marginLeft: 'auto' }} onClick={() => onStart?.(r.key)}>{s.status === 'none' ? 'Start' : 'Open'}</button>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
