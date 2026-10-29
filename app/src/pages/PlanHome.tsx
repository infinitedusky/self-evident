/**
 * Plan's own page: the rail opens a stage, not its parts (LOG.md, 2026-10-29: "you don't go to projects from the
 * left nav. You go to plan"). Cards for what's inside, then each project with its tasks, then tasks in no project.
 * Each task shows its steps as small marks and whether its brief is approved. After Linear's project list, where a
 * project row opens onto its issues.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../components/Badge'
import { STEPS, type StepKey, type StepState, type Workflow } from '@self-evident/engine/steps'

export interface PlanTask { id: string; identifier: string; title: string; state: string; steps: StepState[]; keys?: StepKey[]; workflow?: string } // keys: the steps its workflow shows
export interface PlanProject { id: string; name: string; status: string; workflow?: string; steps: StepState[]; keys?: StepKey[]; tasks: PlanTask[] }
export interface Plan { projects: PlanProject[]; loose: PlanTask[]; todosOpen: number; workflows: Workflow[]; appWorkflow?: string }

/** One mark per step its workflow shows (without one, the default steps), dim until started. */
function Marks({ steps, keys }: { steps: StepState[]; keys?: StepKey[] }) {
  const shown = keys ? STEPS.filter((s) => keys.includes(s.key)) : STEPS.filter((s) => s.place !== 'after')
  return (
    <span className="step-marks" aria-label="Steps">
      {shown.map((s) => {
        const st = steps.find((x) => x.key === s.key)
        return <span key={s.key} className={`mark ${st?.status ?? 'none'}`} title={`${s.label}: ${st ? st.detail ?? st.status : 'not started'}`}>{s.icon}</span>
      })}
    </span>
  )
}

function Brief({ steps }: { steps: StepState[] }) {
  const b = steps.find((s) => s.key === 'brief')
  if (!b) return <span className="faint" style={{ fontSize: 12 }}>no brief</span>
  if (b.approved) return <Badge tone="ok">brief approved</Badge>
  return <Badge tone="warn">brief {b.status === 'done' ? 'to approve' : 'in progress'}</Badge>
}

function Task({ t }: { t: PlanTask }) {
  return (
    <li className="plan-task">
      <span className="mono faint">{t.identifier}</span>
      <Link to={`/issues/${t.id}`}>{t.title}</Link>
      <Marks steps={t.steps} keys={t.keys} />
      <Brief steps={t.steps} />
      <span className="faint" style={{ fontSize: 12 }}>{t.state.replace('_', ' ')}</span>
    </li>
  )
}

/** `onNewTask` makes a task from a title; it may refuse (a workflow that starts tasks as ideas), and says why. */
export function PlanHome({ plan, app, appId, onNewTask }: { plan: Plan; app?: string; appId?: string; onNewTask?: (title: string) => Promise<void> }) {
  const [adding, setAdding] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const add = async () => {
    if (!adding?.trim() || !onNewTask) return
    try { await onNewTask(adding.trim()); setAdding(null); setWhy(null) } catch (e: any) { setWhy(String(e.message ?? e)) }
  }
  const tasks = plan.projects.reduce((n, p) => n + p.tasks.length, 0) + plan.loose.length
  const cards = [
    { label: 'Projects', n: plan.projects.length, to: '/projects', hint: 'Tasks in order, built as one PR' },
    { label: 'Tasks', n: tasks, to: '/issues', hint: 'Things we\'re going to build' },
    { label: 'To-dos', n: plan.todosOpen, to: '/todos', hint: 'Things a person does' },
  ]
  return (
    <>
      <div className="page-head">
        <div>
          <h1>📋 Plan{app && <span className="muted" style={{ fontWeight: 400 }}> · {app}</span>}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>What we've decided to build. A task is built from an approved brief; research, mockups and a prototype can be done on it, or on its project, at any time.</p>
          <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>Workflow rules: {plan.appWorkflow ? <>tasks follow <b>{plan.appWorkflow}</b> unless they have their own</> : 'none set; only the brief is required'}. <Link to={appId ? `/settings/apps/${appId}#workflows` : '/settings'}>Configure the rules</Link></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onNewTask && <button className="btn quiet" onClick={() => setAdding(adding === null ? '' : null)}>New task</button>}
          <Link to="/projects/new" className="btn">New project</Link>
        </div>
      </div>

      {adding !== null && (
        <section className="panel new-task">
          <input autoFocus value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="What will be built? One line; the brief comes after." onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(null) }} />
          <button className="btn small" disabled={!adding.trim()} onClick={add}>Make the task</button>
          <button className="btn quiet small" onClick={() => setAdding(null)}>Cancel</button>
          {why && <div className="empty bad" style={{ flexBasis: '100%' }}>{why}</div>}
        </section>
      )}

      <div className="home-cards">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card home-card">
            <span className="card-title">{c.label}</span>
            <span className="home-n">{c.n}</span>
            <span className="faint" style={{ fontSize: 13 }}>{c.hint}</span>
          </Link>
        ))}
      </div>

      {plan.projects.map((p) => (
        <section key={p.id} className="panel">
          <div className="card-head">
            <Link to={`/projects/${p.id}`} className="card-title" style={{ textDecoration: 'none' }}>{p.name}</Link>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {p.steps.length > 0 && <Marks steps={p.steps} keys={p.keys} />}
              {p.workflow && <Badge>{p.workflow}</Badge>}
              <Badge tone={p.status === 'running' ? 'accent' : 'neutral'} dot={p.status === 'running'}>{p.status}</Badge>
            </span>
          </div>
          {p.tasks.length ? <ul className="list">{p.tasks.map((t) => <Task key={t.id} t={t} />)}</ul> : <div className="empty">No tasks yet.</div>}
        </section>
      ))}

      {(plan.projects.length > 0 || plan.loose.length > 0) && <section className="panel">
        <h2>Tasks in no project</h2>
        {plan.loose.length ? <ul className="list">{plan.loose.map((t) => <Task key={t.id} t={t} />)}</ul> : <div className="empty">None. A task can stand alone; make one when you know it will be built.</div>}
      </section>}

      {!plan.projects.length && !plan.loose.length && (
        <div className="empty">Nothing planned yet. Convert an idea from Ideate, or make a task directly when you know it'll be built.</div>
      )}
    </>
  )
}
