/**
 * The composer: a project is a name and a why. Its tasks can come three ways (Sandy, 2026-11-12): none yet (an empty
 * project, filled later from Tasks or its own page), described in words for the agent to draft, or written here by
 * hand, each with sub-tasks if wanted. Straight into the engine.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { engine, useIdeaFirst, useWorkflows } from '../engine'
import { RulesPicker } from '../components/RulesPicker'
import { useCurrentApp } from '../current-app'

/** The job handed to the agent: draft this project's tasks from what the person said. */
const draftAsk = (name: string, projectId: string, said: string, already: number) => `Draft the tasks for the project "${name}" (${projectId}), from what I wrote below. Read the code and the app's assets first where they bear on it. Make each task with create_task (projectId: ${projectId}), in the order they should be built: a title, and a description of what will be different in plain words.${already ? ` It has ${already} task${already === 1 ? '' : 's'} already: add to them, don't repeat them.` : ''} Don't plan sub-tasks and don't start the project. Then tell me what you made and what you weren't sure of.\n\n${said}`

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
  const [tasks, setTasks] = useState<TaskRow[]>([]) // none: an empty project is a project
  const [prompt, setPrompt] = useState('') // what it should cover, for the agent to draft the tasks from
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
      const { project } = await engine.createProject({ appId, name: title.trim(), content: spec.trim() || undefined, ideaId: ideaId ?? undefined, workflowId: rules || undefined, issues: body })
      if (prompt.trim()) await engine.ask({ appId, subjectRef: { projectId: project.id }, text: draftAsk(title.trim(), project.id, prompt.trim(), body.length) }) // its conversation opens beside the page
      nav(`/projects/${project.id}`)
    } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }

  const written = tasks.some((t) => t.title.trim())

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

      <section className="panel" data-component="DraftTasks">
        <h2>Tasks</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>A project can start with none: add tasks later, or move existing ones in, from Tasks or the project's page. Or say what it should cover and the agent drafts them.</p>
        <label style={{ display: 'block' }}><span className="label-text">Have the agent draft the tasks (optional)</span>
          <textarea aria-label="What the project should cover" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="What it should cover, in your own words: the tickets, the order, what done looks like. The agent reads the code and the app's assets, makes the tasks in order, and tells you what it made." /></label>
      </section>

      <section className="panel">
        <h2>Or write them here, in order</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>A task is a title and a brief: what to change and why. Tasks are built in order. Each is planned into sub-tasks, one agent each in its own worktree; write them below or leave them for the planner.</p>
        {tasks.map((t, ti) => (
          <div className="task-block" key={t.key} data-component="TaskRow">
            <div className="task-block-head"><span className="mono faint">task {ti + 1}</span>
              <button className="btn quiet" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== ti))} aria-label="remove task">×</button></div>
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
                    <label>Sub-task<input value={p.title} onChange={(e) => updatePhase(ti, pi, { title: e.target.value })} placeholder="Add a GET /health endpoint" /></label>
                    <label>Files (comma-separated)<input className="mono" value={p.files} onChange={(e) => updatePhase(ti, pi, { files: e.target.value })} placeholder="poc/hg/app.py, poc/tests/test_health.py" /></label>
                    <label style={{ gridColumn: '1 / -1' }}>Brief<textarea value={p.brief} onChange={(e) => updatePhase(ti, pi, { brief: e.target.value })} rows={2} placeholder="What to do, what done looks like, what not to touch." /></label>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="label-text">Depends on</span>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {earlierPhases(ti, pi).map((o) => (
                          <label key={o.key} className="inline"><input type="checkbox" checked={p.dependsOn.includes(o.key)}
                            onChange={(e) => updatePhase(ti, pi, { dependsOn: e.target.checked ? [...p.dependsOn, o.key] : p.dependsOn.filter((k) => k !== o.key) })} /> {o.title}</label>
                        ))}
                        {earlierPhases(ti, pi).length === 0 && <span className="faint">No other titled sub-tasks yet. Task order already applies.</span>}
                      </div>
                    </div>
                  </div>
                  <button className="btn quiet" onClick={() => updateTask(ti, { phases: t.phases.filter((_, j) => j !== pi) })} aria-label="remove sub-task">×</button>
                </div>
              ))}
              <button className="btn quiet" onClick={() => updateTask(ti, { phases: [...t.phases, blankPhase()] })}>+ Add a sub-task</button>
            </div>
          </div>
        ))}
        <button className="btn quiet" onClick={() => setTasks((ts) => [...ts, blankTask()])}>+ Add a task</button>
      </section>
      {error && <div className="empty bad">{error}</div>}
      <p><button className="btn" disabled={busy || !title.trim() || !appId} onClick={submit}>{prompt.trim() ? 'Create and draft the tasks' : written ? 'Create project' : 'Create an empty project'}</button> <span className="faint">You run it from the project page once its tasks are planned.</span></p>
    </>
  )
}
