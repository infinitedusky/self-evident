/**
 * The composer: a project as issues in order (title + brief, what you author), each with its sub-issues. Sub-issues are what the
 * planner will propose from the brief; until it exists you can write them here. Straight into the engine.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { engine, useIdeaFirst, useWorkflows } from '../engine'
import { RulesPicker } from '../components/RulesPicker'
import { useCurrentApp } from '../current-app'

interface PhaseRow { key: string; title: string; description: string; brief: string; dependsOn: string[]; files: string }
interface TaskRow { key: string; title: string; description: string; brief: string; phases: PhaseRow[] }
let seq = 0
const blankPhase = (): PhaseRow => ({ key: `p${++seq}`, title: '', description: '', brief: '', dependsOn: [], files: '' })
const blankTask = (): TaskRow => ({ key: `t${++seq}`, title: '', description: '', brief: '', phases: [] })

export function NewProject() {
  const nav = useNavigate()
  const { apps, app } = useCurrentApp()
  const [appId, setAppId] = useState('')
  const [title, setTitle] = useState('')
  const [spec, setSpec] = useState('')
  const [tasks, setTasks] = useState<TaskRow[]>([blankTask()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const ideaId = params.get('idea') // "Break it down" from the inbox: the idea becomes the project's title and why, and the first task
  const ideaFirst = useIdeaFirst(appId || app?.id) // every choice of rules starts it as an idea: no project made here directly
  const { workflows, defaultId } = useWorkflows(appId || app?.id)
  const [rules, setRules] = useState('')
  useEffect(() => {
    if (ideaId && app) engine.ideas(app.id).then((all) => {
      const i = all.find((x) => x.id === ideaId)
      if (!i) return
      setAppId(i.appId); setTitle(i.title); setSpec(i.body ?? '')
      setTasks([{ ...blankTask(), title: i.title, description: i.body ?? '' }])
    }).catch(() => {})
  }, [ideaId, app?.id])
  useEffect(() => { if (app && !appId) setAppId(app.id) }, [app, appId])

  const updateTask = (ti: number, patch: Partial<TaskRow>) => setTasks((ts) => ts.map((t, j) => (j === ti ? { ...t, ...patch } : t)))
  const updatePhase = (ti: number, pi: number, patch: Partial<PhaseRow>) => updateTask(ti, { phases: tasks[ti].phases.map((p, j) => (j === pi ? { ...p, ...patch } : p)) })
  const earlierPhases = (ti: number, pi: number) => tasks.slice(0, ti + 1).flatMap((t, j) => t.phases.filter((p, k) => (j < ti || k !== pi) && p.title.trim()))

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const body = tasks.filter((t) => t.title.trim()).map((t) => ({
        title: t.title.trim(), description: t.description.trim() || undefined, brief: t.brief.trim() || undefined,
        subIssues: t.phases.filter((p) => p.title.trim()).map((p) => ({
          key: p.key, title: p.title.trim(), description: p.description.trim() || undefined, brief: p.brief.trim() || undefined, dependsOn: p.dependsOn,
          files: p.files.split(',').map((f) => f.trim()).filter(Boolean),
        })),
      }))
      if (!body.length) throw new Error('add at least one issue with a title')
      const { project } = await engine.createProject({ appId, name: title.trim(), content: spec.trim() || undefined, ideaId: ideaId ?? undefined, workflowId: rules || undefined, issues: body })
      nav(`/projects/${project.id}`)
    } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }

  if (ideaFirst && !ideaId) return (
    <>
      <p className="mono"><Link to="/projects">← Projects</Link></p>
      <div className="page-head"><h1>New project</h1></div>
      <div className="empty">Every set of workflow rules in this app starts things as an idea (the default is "{ideaFirst}"). <Link to="/ideas">Capture the idea</Link>, then convert it into a project.</div>
    </>
  )

  return (
    <>
      <p className="mono"><Link to="/projects">← Projects</Link></p>
      <div className="page-head"><h1>New project</h1></div>
      <section className="panel">
        <div className="form-grid">
          <label>App<select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What this project changes, in a line" /></label>
          {!ideaId && <RulesPicker workflows={workflows} defaultId={defaultId} value={rules} onChange={setRules} />}
          <label style={{ gridColumn: '1 / -1' }}>Why (optional)<textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} placeholder="The idea or hypothesis behind it; goes in the PR" /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Issues, in order</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>An issue is a title and a brief: what to change and why. Issues are built in order. Each is planned into sub-issues, one agent each in its own worktree; write them below or leave them for the planner.</p>
        {tasks.map((t, ti) => (
          <div className="task-block" key={t.key} data-component="TaskRow">
            <div className="task-block-head"><span className="mono faint">issue {ti + 1}</span>
              <button className="btn quiet" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== ti))} aria-label="remove issue">×</button></div>
            <div className="form-grid">
              <label>Title<input value={t.title} onChange={(e) => updateTask(ti, { title: e.target.value })} placeholder="Harden the POC" /></label>
              <label style={{ gridColumn: '1 / -1' }}>What will be different<textarea value={t.description} onChange={(e) => updateTask(ti, { description: e.target.value })} rows={2} placeholder="One to three plain sentences, for a person: what changes for the people using the app, and why. No file names." /></label>
              <label style={{ gridColumn: '1 / -1' }}>Brief for the builder (optional)<textarea value={t.brief} onChange={(e) => updateTask(ti, { brief: e.target.value })} rows={3} placeholder="What should be true when this is done, what's wrong today, what to avoid. The planner reads this and the repo." /></label>
            </div>
            <div className="phase-list">
              {t.phases.map((p, pi) => (
                <div className="task-row" key={p.key}>
                  <div className="mono faint">{ti + 1}.{pi + 1}</div>
                  <div className="form-grid">
                    <label>Sub-issue<input value={p.title} onChange={(e) => updatePhase(ti, pi, { title: e.target.value })} placeholder="Add a GET /health endpoint" /></label>
                    <label>Files (comma-separated)<input className="mono" value={p.files} onChange={(e) => updatePhase(ti, pi, { files: e.target.value })} placeholder="poc/hg/app.py, poc/tests/test_health.py" /></label>
                    <label style={{ gridColumn: '1 / -1' }}>Brief<textarea value={p.brief} onChange={(e) => updatePhase(ti, pi, { brief: e.target.value })} rows={2} placeholder="What to do, what done looks like, what not to touch." /></label>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="label-text">Depends on</span>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {earlierPhases(ti, pi).map((o) => (
                          <label key={o.key} className="inline"><input type="checkbox" checked={p.dependsOn.includes(o.key)}
                            onChange={(e) => updatePhase(ti, pi, { dependsOn: e.target.checked ? [...p.dependsOn, o.key] : p.dependsOn.filter((k) => k !== o.key) })} /> {o.title}</label>
                        ))}
                        {earlierPhases(ti, pi).length === 0 && <span className="faint">No other titled sub-issues yet. Issue order already applies.</span>}
                      </div>
                    </div>
                  </div>
                  <button className="btn quiet" onClick={() => updateTask(ti, { phases: t.phases.filter((_, j) => j !== pi) })} aria-label="remove sub-issue">×</button>
                </div>
              ))}
              <button className="btn quiet" onClick={() => updateTask(ti, { phases: [...t.phases, blankPhase()] })}>+ Add a sub-issue</button>
            </div>
          </div>
        ))}
        <button className="btn quiet" onClick={() => setTasks((ts) => [...ts, blankTask()])}>+ Add an issue</button>
      </section>
      {error && <div className="empty bad">{error}</div>}
      <p><button className="btn" disabled={busy || !title.trim() || !appId} onClick={submit}>Create project</button> <span className="faint">You run it from the project page once its issues are planned.</span></p>
    </>
  )
}
