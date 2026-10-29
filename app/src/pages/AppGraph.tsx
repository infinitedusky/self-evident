/**
 * The top level: every code sub-issue of every project in an app, on one canvas. Dependencies as solid edges; unbuilt
 * sub-issues that share a file as dashed links (they will never build at once). Live over the app's event stream.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView } from '../components/PlanGraphView'
import { openEvents, API, EVENT_TYPES, type App, type GraphFile, type GraphIssue, type GraphSubIssue } from '../engine'
import { useCurrentApp } from '../current-app'

interface AppGraphData {
  app: App
  projects: { id: string; name: string; status: string; pr: { number: number | null; url: string | null } | null }[]
  issues: GraphIssue[]
  subIssues: GraphSubIssue[]
  conflicts: [string, string][]
  files?: GraphFile[]
}
const PROJECT_TONE: Record<string, Tone> = { running: 'accent', landed: 'ok' }
const short = (t: string) => (t.length > 28 ? t.slice(0, 26).trimEnd() + '…' : t)

async function fetchAppGraph(appId: string): Promise<AppGraphData> {
  const res = await fetch(`${API}/apps/${appId}/graph`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function AppGraph() {
  const [params, setParams] = useSearchParams()
  const { app } = useCurrentApp()
  const appId = app?.id
  const [data, setData] = useState<AppGraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => { if (appId && params.get('app') !== appId) setParams({ app: appId }, { replace: true }) }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!appId) return
    let closed = false
    const refresh = () => fetchAppGraph(appId).then((g) => { if (!closed) setData(g) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = openEvents(`${API}/events?app=${appId}&since=-1`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 200) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, bump)
    es.onerror = () => setError('event stream disconnected; retrying'); es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [appId])

  const selected = data?.subIssues.find((p) => p.id === selectedId)
  const issueOf = (p: GraphSubIssue) => data?.issues.find((t) => t.id === p.parentId)
  const projectOf = (p: GraphSubIssue) => data?.projects.find((x) => x.id === p.projectId)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Graph{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every sub-task being built, across projects. An arrow is a wait: the sub-task at its head starts after the one at its tail lands. Ones that touch the same file take turns; that shows on the node when it happens.</p>
        </div>
      </div>
      {error && !data && <div className="empty">The engine isn't reachable: {error}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {data.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className={`badge ${PROJECT_TONE[p.status] ?? ''}`}>{p.name}{p.pr ? ` · PR #${p.pr.number}` : ''}</Link>
            ))}
            {error && <Badge tone="warn" dot>{error}</Badge>}
          </div>
          {data.subIssues.length
            ? <PlanGraphView subIssues={data.subIssues} files={data.files} storageKey={data.app.id} labels={Object.fromEntries(data.subIssues.map((p) => [p.id, short(issueOf(p)?.title ?? projectOf(p)?.name ?? '')]))} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} tall />
            : <div className="empty">Nothing planned in {data.app.name} yet.</div>}
          {selected && (
            <section className="panel">
              <h2><Link to={`/tasks/${selected.id}`}>{selected.identifier}</Link> {selected.title} <Badge>{projectOf(selected)?.name}</Badge></h2>
              <dl className="fields">
                <dt>Build</dt><dd>{selected.status}{selected.heldReason ? ` — ${selected.heldReason}` : ''}</dd>
                <dt>Task</dt><dd>{issueOf(selected) ? <Link to={`/tasks/${issueOf(selected)!.id}`}>{issueOf(selected)!.identifier} {issueOf(selected)!.title}</Link> : '—'}</dd>
                <dt>Files</dt><dd>{selected.files.length ? <span className="mono">{selected.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
                <dt>Shares files with</dt><dd>{data.conflicts.filter((c) => c.includes(selected.id)).map((c) => c.find((x) => x !== selected.id)).map((id) => data.subIssues.find((p) => p.id === id)).filter(Boolean).map((p) => `${p!.identifier} ${p!.title} (${projectOf(p!)?.name})`).join('; ') || <span className="faint">Nothing open.</span>}</dd>
                <dt>Project</dt><dd><Link to={`/projects/${selected.projectId}`}>{projectOf(selected)?.name}</Link></dd>
              </dl>
            </section>
          )}
        </>
      )}
    </>
  )
}
