/** Plan: the drafts being planned (issues, the planner's sub-issues and questions). Build: what is running and what landed. Same list, two halves. */
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
  useEffect(() => { setPlans(null); if (app) engine.projects(app.id).then(setPlans).catch((e) => setError(String(e.message ?? e))) }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState('open')
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]
  const shown = projects?.filter((p) => (mode === 'project' ? f.match(p.status) : !DRAFT.includes(p.status))) ?? null
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mode === 'project' ? '📋 Projects' : '🔨 Build'}{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mode === 'project'
              ? 'A project is issues in order, each a title and a brief. The planner turns an issue into sub-issues and asks what it cannot settle. When every issue is planned and nothing is open, it is ready to build.'
              : 'Each sub-issue is built by one agent in one worktree; what lands becomes the project\'s PR. The Graph shows every sub-issue of every project and what each one waits on.'}
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
      {shown && !shown.length && <div className="empty">{mode === 'project' ? (filter === 'open' ? 'No open projects. Keep an idea and make it an issue, or start a project.' : 'No projects here.') : 'Nothing running or landed yet. Projects run once their first issue is planned.'}</div>}
      {shown && shown.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {shown.map((p) => {
            const total = Object.values(p.builds).reduce((a, b) => a + b, 0)
            return (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={`/projects/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.name}</Link>
                  <div className="faint" style={{ fontSize: 13 }}>{p.issueCount} issue{p.issueCount === 1 ? '' : 's'} · {total} sub-issue{total === 1 ? '' : 's'}{p.backlogOpen ? ` · ${p.backlogOpen} in the backlog` : ''}
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
