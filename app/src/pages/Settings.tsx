/**
 * Settings: the apps the factory works on (repo, how to test, which model, how much to spend), then the modules
 * and the providers that fill them. Apps and repos are rows in the engine; the modules list is still static.
 */
import { useEffect, useState } from 'react'
import type { Module, Status } from '../providers'
import { Badge, type Tone } from '../components/Badge'
import { engine, type App, type AppSetup, type Repo } from '../engine'
import { useCurrentApp } from '../current-app'

const TONE: Record<Status, Tone> = { connected: 'ok', pending: 'warn', 'not connected': 'neutral' }

export function Settings({ modules }: { modules: Module[] }) {
  const [apps, setApps] = useState<App[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState('')
  const { reload: reloadNav } = useCurrentApp()
  const reload = () => engine.apps().then((a) => { setApps(a); void reloadNav() }).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { void reload() }, [])

  const addApp = async () => {
    const name = adding.trim()
    if (!name) return
    try {
      const ws = (await engine.workspaces())[0] ?? (await engine.createWorkspace('My workspace'))
      await engine.createApp({ workspaceId: ws.id, name })
      setAdding(''); await reload()
    } catch (e: any) { setError(String(e.message ?? e)) }
  }

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <section className="panel">
        <h2>Apps</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>What the factory works on. Each app is a repo with a local checkout on this machine, a test command the engine runs on every merged commit before it lands, and the model and budget its agents get.</p>
        {error && <div className="empty bad">{error}</div>}
        {apps === null && !error && <p className="muted">Loading…</p>}
        {apps?.map((a) => <AppCard key={a.id} app={a} onSaved={reload} onError={setError} />)}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>New app<input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Its name" onKeyDown={(e) => { if (e.key === 'Enter') void addApp() }} /></label>
          <div style={{ alignSelf: 'end' }}><button className="btn quiet" disabled={!adding.trim()} onClick={addApp}>+ Add app</button></div>
        </div>
      </section>

      {modules.map((m) => (
        <section className="panel" key={m.role}>
          <h2>{m.role}</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>{m.why}</p>
          <div className="providers">
            {m.providers.map((p) => (
              <div className="provider" key={p.name}>
                <div><strong>{p.name}</strong> <span className="muted">— {p.does}</span>
                  {p.note && <div className="faint" style={{ fontSize: 13 }}>{p.note}</div>}</div>
                <Badge tone={TONE[p.status]} dot>{p.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function AppCard({ app, onSaved, onError }: { app: App; onSaved: () => Promise<unknown>; onError: (e: string) => void }) {
  const [name, setName] = useState(app.name)
  const [branch, setBranch] = useState(app.defaultBranch)
  const [setup, setSetup] = useState<AppSetup>(app.setup ?? {})
  const [repo, setRepo] = useState<Partial<Repo>>(app.repos?.[0] ?? { fullName: '', localPath: '' })
  const [busy, setBusy] = useState(false)
  const dirty = name !== app.name || branch !== app.defaultBranch || JSON.stringify(setup) !== JSON.stringify(app.setup ?? {})
    || repo.fullName !== (app.repos?.[0]?.fullName ?? '') || (repo.localPath ?? '') !== (app.repos?.[0]?.localPath ?? '')
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const save = async () => {
    setBusy(true)
    try {
      await engine.updateApp(app.id, { name: name.trim(), defaultBranch: branch.trim() || 'main', setup: clean(setup) })
      if (repo.id) await engine.updateRepo(repo.id, { fullName: repo.fullName ?? '', localPath: repo.localPath?.trim() || null })
      else if (repo.fullName?.trim() || repo.localPath?.trim()) await engine.createRepo({ appId: app.id, fullName: repo.fullName?.trim() ?? '', localPath: repo.localPath?.trim() || undefined })
      await onSaved()
    } catch (e: any) { onError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  return (
    <div className="task-block" data-component="AppCard">
      <div className="task-block-head"><strong>{app.name}</strong><span className="mono faint">{app.id}</span></div>
      <div className="form-grid">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Default branch<input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></label>
        <label>GitHub repo<input className="mono" value={repo.fullName ?? ''} onChange={(e) => setRepo({ ...repo, fullName: e.target.value })} placeholder="owner/name (for the PR)" /></label>
        <label>Local checkout<input className="mono" value={repo.localPath ?? ''} onChange={(e) => setRepo({ ...repo, localPath: e.target.value })} placeholder="/absolute/path/to/the/repo, on its default branch" /></label>
        <label>Storybook URL<input className="mono" value={setup.storybook_url ?? ''} onChange={(e) => setSetup({ ...setup, storybook_url: e.target.value })} placeholder="http://localhost:6006" /></label>
        <label>Storybook command<input className="mono" value={setup.storybook_cmd ?? ''} onChange={(e) => setSetup({ ...setup, storybook_cmd: e.target.value })} placeholder="cd web && pnpm storybook --no-open" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Pull requests<select value={setup.pr_mode ?? 'project'} onChange={(e) => setSetup({ ...setup, pr_mode: e.target.value as 'project' | 'issue' })}>
          <option value="project">One per project: every issue lands on the project's branch</option>
          <option value="issue">One per issue, stacked: small PRs for a team; each merges on its own</option>
        </select></label>
        <label style={{ gridColumn: '1 / -1' }}>Test command<input className="mono" value={setup.test_cmd ?? ''} onChange={(e) => setSetup({ ...setup, test_cmd: e.target.value })} placeholder="runs in the worktree on the merged commit; must exit 0 to land" /></label>
        <label>Model<input className="mono" value={setup.model ?? ''} onChange={(e) => setSetup({ ...setup, model: e.target.value })} placeholder="default: the agent's own" /></label>
        <label>Budget per run (USD)<input type="number" min={0} step={1} value={setup.max_budget_usd ?? ''} onChange={(e) => setSetup({ ...setup, max_budget_usd: num(e.target.value) })} placeholder="no cap" /></label>
        <label>Turns per run<input type="number" min={1} step={1} value={setup.max_turns ?? ''} onChange={(e) => setSetup({ ...setup, max_turns: num(e.target.value) })} placeholder="60" /></label>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" disabled={!dirty || busy} onClick={save}>Save</button>
        {dirty && <span className="faint">Unsaved changes.</span>}
      </div>
    </div>
  )
}

/** Drop empty strings so the engine's defaults apply. */
function clean(s: AppSetup): AppSetup {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))) as AppSetup
}
