/** Plan: the drafts being planned (issues, the planner's sub-issues and questions). Build: what is planned and ready to run (with the button that runs it), what is running and what landed. Same list, two halves. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { engine, useIdeaFirst, type ProjectSummary } from '../engine'
import { useCurrentApp } from '../current-app'

const TONE: Record<string, Tone> = { running: 'accent', landed: 'ok', stopped: 'warn', drafting: 'neutral' }
const DRAFT = ['drafting', 'proposed', 'approved']
// Plan lists every project, filtered by stage; Build lists what runs and what landed.
const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'open', label: 'Open', match: (s) => !['landed', 'stopped', 'superseded'].includes(s) },
  { key: 'drafting', label: 'Drafting', match: (s) => DRAFT.includes(s) },
  { key: 'running', label: 'Running', match: (s) => s === 'running' || s === 'paused' },
  { key: 'landed', label: 'Landed', match: (s) => s === 'landed' },
  { key: 'stopped', label: 'Stopped', match: (s) => s === 'stopped' },
  { key: 'all', label: 'All', match: () => true },
]

export function Projects({ mode }: { mode: 'project' | 'build' }) {
  const { app } = useCurrentApp()
  const ideaFirst = useIdeaFirst(app?.id)
  const [projects, setPlans] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const read = () => { if (app) engine.projects(app.id, { solo: mode === 'build' }).then(setPlans).catch((e) => setError(String(e.message ?? e))) } // Build lists tasks planned on their own too
  useEffect(() => { setPlans(null); read() }, [app?.id, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const [running, setRunning] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ id: string; why: string } | null>(null)
  const run = async (id: string) => { setRunning(id); setRefused(null); try { await engine.start(id); read() } catch (e) { setRefused({ id, why: e instanceof Error ? e.message : String(e) }) } finally { setRunning(null) } }
  const [filter, setFilter] = useState('open')
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]
  const shown = projects?.filter((p) => (mode === 'project' ? f.match(p.status) : !DRAFT.includes(p.status))) ?? null
  // Build: planned and not yet run. A draft with at least one planned task is ready; running it is the one thing to do here.
  const ready = mode === 'build' ? projects?.filter((p) => DRAFT.includes(p.status) && (p.plannedTasks?.length ?? 0) > 0) ?? [] : []
  const home = (p: ProjectSummary) => (p.solo && p.plannedTasks?.[0] ? `/tasks/${p.plannedTasks[0].id}/build` : `/projects/${p.id}`) // a task planned on its own is reached as the task
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mode === 'project' ? '📋 Projects' : '🔨 Build'}{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mode === 'project'
              ? 'A project is tasks in order, each a title and a brief. The planner turns a task into sub-tasks and asks what it cannot settle. When every task is planned and nothing is open, it is ready to build.'
              : 'A planned task waits here until its project is run. Each sub-task is built by one agent in one worktree; what lands becomes the project\'s PR. The Graph shows every sub-task of every project and what each one waits on.'}
          </p>
        </div>
        {mode === 'project' ? (ideaFirst ? <Link to="/ideas" className="btn" title={`The workflow "${ideaFirst}" starts everything as an idea`}>From an idea</Link> : <Link to="/projects/new" className="btn">New project</Link>) : <Link to="/graph" className="btn quiet">Graph</Link>}
      </div>
      {mode === 'project' && projects && (
        <div className="filters">
          {FILTERS.map((x) => { const n = projects.filter((p) => x.match(p.status)).length; return <button key={x.key} className={`filter ${x.key === filter ? 'active' : ''}`} onClick={() => setFilter(x.key)}>{x.label} <span className="faint">{n}</span></button> })}
        </div>
      )}
      {error && <div className="empty">The engine isn't reachable: {error}. Start it with <code>pnpm dev</code> at the repo root.</div>}
      {!app && <div className="empty">No app yet. Add one in Settings.</div>}
      {ready.length > 0 && (
        <section data-component="ReadyToBuild">
          <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Ready to build</h2>
          <ul className="list panel" style={{ padding: '4px 18px', marginBottom: 20 }}>
            {ready.map((p) => (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={home(p)} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.solo && p.plannedTasks?.[0] ? `${p.plannedTasks[0].identifier} ${p.plannedTasks[0].title}` : p.name}</Link>
                  <div className="faint" style={{ fontSize: 13 }}>
                    {p.solo
                      ? <>A task on its own, planned in {p.plannedTasks![0].subTasks} sub-task{p.plannedTasks![0].subTasks === 1 ? '' : 's'}.</>
                      : <>Planned: {p.plannedTasks!.map((t, n) => <span key={t.id}>{n ? ', ' : ''}<Link to={`/tasks/${t.id}/build`}>{t.identifier}</Link> ({t.subTasks} sub-task{t.subTasks === 1 ? '' : 's'})</span>)}{p.issueCount > p.plannedTasks!.length ? `. ${p.issueCount - p.plannedTasks!.length} more task${p.issueCount - p.plannedTasks!.length === 1 ? ' is' : 's are'} planned in turn as it runs.` : '.'}</>}
                    {refused?.id === p.id && <div className="bad">{refused.why}</div>}
                  </div>
                </div>
                <button className="btn" disabled={running !== null} onClick={() => void run(p.id)}>{running === p.id ? 'Starting…' : p.solo ? 'Run it' : 'Run this project'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {shown && !shown.length && !ready.length && <div className="empty">{mode === 'project' ? (filter === 'open' ? 'No open projects. Keep an idea and make it a task, or start a project.' : 'No projects here.') : 'Nothing planned, running or landed yet. A task shows here to be run once it is planned: approve its brief, then Plan it on its Build page.'}</div>}
      {shown && shown.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {shown.map((p) => {
            const total = Object.values(p.builds).reduce((a, b) => a + b, 0)
            return (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={home(p)} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</Link>
                  <div className="faint" style={{ fontSize: 13 }}>{p.issueCount} task{p.issueCount === 1 ? '' : 's'} · {total} sub-task{total === 1 ? '' : 's'}{p.backlogOpen ? ` · ${p.backlogOpen} in the backlog` : ''}
                    {p.builds.done ? ` · ${p.builds.done} done` : ''}{p.builds.failed ? ` · ${p.builds.failed} failed` : ''} · <span className="mono">{p.id}</span></div>
                </div>
                <Badge tone={TONE[p.status] ?? 'neutral'} dot={p.status === 'running'}>{p.status}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
