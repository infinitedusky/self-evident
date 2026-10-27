/**
 * Settings, in two levels with a side list: All apps (what every app gets: the agents' skills, REA, the
 * integrations' shared values) and one page per app (its repo, its agents, how it lands, its Storybook, and its own
 * integration values, each field inheriting the workspace's until the app overrides it).
 */
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { engine, type AgentRole, type App, type AppSettings as AppSettingsData, type AppSetup, type FactorySettings, type Integration, type IntegrationValues, type Repo } from '../engine'
import { useCurrentApp } from '../current-app'

const ROLE: Record<AgentRole, { label: string; does: string }> = {
  talk: { label: 'Talk', does: 'the agent in the drawer' },
  planner: { label: 'Planner', does: 'turns an issue into sub-issues' },
  builder: { label: 'Builder', does: 'builds one sub-issue in a worktree' },
}
const err = (e: any) => String(e?.message ?? e)

export function Settings() {
  const { id } = useParams()
  const { apps, reload: reloadNav } = useCurrentApp()
  const [adding, setAdding] = useState('')
  const [error, setError] = useState<string | null>(null)
  const app = id ? apps.find((a) => a.id === id) : undefined

  const addApp = async () => {
    const name = adding.trim()
    if (!name) return
    try {
      const ws = (await engine.workspaces())[0] ?? (await engine.createWorkspace('My workspace'))
      await engine.createApp({ workspaceId: ws.id, name })
      setAdding(''); await reloadNav()
    } catch (e) { setError(err(e)) }
  }

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="settings" data-component="Settings">
        <aside className="settings-side">
          <NavLink to="/settings" end className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>All apps</NavLink>
          <div className="settings-side-label mono faint">APPS</div>
          {apps.map((a) => <NavLink key={a.id} to={`/settings/apps/${a.id}`} className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>{a.name}</NavLink>)}
          <div className="settings-add">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New app" onKeyDown={(e) => { if (e.key === 'Enter') void addApp() }} />
            <button className="btn quiet" disabled={!adding.trim()} onClick={addApp}>Add</button>
          </div>
        </aside>
        <div>
          {error && <div className="empty bad">{error}</div>}
          {!id ? <FactoryPage /> : app ? <AppPage key={app.id} app={app} onSaved={reloadNav} /> : <p className="muted">No such app.</p>}
        </div>
      </div>
    </>
  )
}

/** What every app gets. */
function FactoryPage() {
  const [s, setS] = useState<FactorySettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => engine.settings().then(setS).catch((e) => setError(err(e)))
  useEffect(() => { void load() }, [])
  if (error) return <div className="empty bad">{error}</div>
  if (!s) return <p className="muted">Loading…</p>
  const { roles, plugins, rea } = s.skills
  return (
    <>
      <section className="panel">
        <h2>Agents and skills</h2>
        <p className="muted settings-lead">Skills come in two layers. These are the factory's, the same for every app; each app's repo can add its own in <span className="mono">.claude/skills/</span> (see the app). An agent loads a skill when the work calls for it.</p>
        <dl className="fields">
          {(Object.keys(ROLE) as AgentRole[]).map((r) => (
            <div key={r} style={{ display: 'contents' }}>
              <dt>{ROLE[r].label}</dt>
              <dd>{roles[r].length ? roles[r].map((p) => <Badge key={p} tone="accent">{p}</Badge>) : <span className="faint">none</span>} <span className="faint">· {ROLE[r].does}</span></dd>
            </div>
          ))}
        </dl>
      </section>

      {plugins.map((p) => (
        <section className="panel" key={p.name}>
          <h2>{p.name === 'self-evident' ? 'Our skills' : 'REA: reverse engineering'} <span className="mono faint">{p.name}{p.version ? ` ${p.version}` : ''}</span></h2>
          {p.name === 'self-evident' && <p className="muted settings-lead">Self Evident's own skills, one folder each under <span className="mono">engine/plugin/skills/</span>.</p>}
          {p.name === 'rea-agents' && <p className="muted settings-lead">Studies a feature another product has shipped, from its code: decompiled binaries, Electron bundles, .NET, APKs, web captures.</p>}
          {p.skills.length ? <SkillList skills={p.skills} /> : <div className="empty">None yet.</div>}
          {p.name === 'rea-agents' && (
            <>
              <h3 className="settings-h3">Its {rea.tools} tools, by what they could cost</h3>
              <dl className="fields">
                <dt><Badge tone="ok">free {rea.ratings.free}</Badge></dt><dd className="muted">Reads the target. Runs without asking.</dd>
                <dt><Badge tone="warn">moderate {rea.ratings.moderate}</Badge></dt><dd className="muted">Reaches outside (a browser, a device, an external analyser) or changes REA's own session. Asks unless the conversation allows moderate.</dd>
                <dt><Badge tone="bad">expensive {rea.ratings.expensive}</Badge></dt><dd className="muted">Runs, drives or changes the target. Always asks. The planner, with no one to ask, gets only the free ones.</dd>
              </dl>
            </>
          )}
        </section>
      ))}

      <section className="panel">
        <h2>Integrations</h2>
        <p className="muted settings-lead">Shared values for every app. An app can override any field on its own page. Keys stay in each program's <span className="mono">.env</span>; here, only the variable's name.</p>
        {s.workspace
          ? <IntegrationsForm integrations={s.integrations} values={s.values} onSave={async (v) => { await engine.updateWorkspace(s.workspace!.id, { integrations: v }); await load() }} />
          : <div className="empty">Add an app first; it creates the workspace.</div>}
        <dl className="fields" style={{ marginTop: 16 }}>
          <dt>Claude Code</dt><dd className="muted">The agents. Development runs on the operator's login; the product on an API key.</dd>
          <dt>GitHub</dt><dd className="muted">Set per app: its repo, where PRs live.</dd>
          <dt>Storybook</dt><dd className="muted">Set per app: where its stories run.</dd>
        </dl>
      </section>
    </>
  )
}

function SkillList({ skills }: { skills: { name: string; description: string }[] }) {
  return (
    <ul className="list">
      {skills.map((k) => <li key={k.name}><span className="mono">{k.name}</span>{k.description && <div className="muted settings-desc">{k.description}</div>}</li>)}
    </ul>
  )
}

/** The workspace's values: one block per integration, saved together. */
function IntegrationsForm({ integrations, values, onSave }: { integrations: Integration[]; values: IntegrationValues; onSave: (v: IntegrationValues) => Promise<void> }) {
  const [v, setV] = useState<IntegrationValues>(values)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(v) !== JSON.stringify(values)
  const save = async () => { setBusy(true); setError(null); try { await onSave(v) } catch (e) { setError(err(e)) } finally { setBusy(false) } }
  return (
    <>
      {integrations.map((i) => (
        <div className="settings-group" key={i.key}>
          <div className="settings-group-head"><strong>{i.name}</strong> <span className="faint">· {i.role}: {i.does}</span></div>
          <div className="form-grid">
            {i.fields.map((f) => (
              <label key={f.key}>{f.label}<input className="mono" value={v[i.key]?.[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [i.key]: { ...v[i.key], [f.key]: e.target.value } })} /></label>
            ))}
          </div>
        </div>
      ))}
      <SaveRow dirty={dirty} busy={busy} error={error} onSave={save} />
    </>
  )
}

/** One app: grouped, one Save for the lot. Integration fields show the inherited value until overridden. */
function AppPage({ app, onSaved }: { app: App; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState(app.name)
  const [branch, setBranch] = useState(app.defaultBranch)
  const [setup, setSetup] = useState<AppSetup>(app.setup ?? {})
  const [repo, setRepo] = useState<Partial<Repo>>(app.repos?.[0] ?? { fullName: '', localPath: '' })
  const [info, setInfo] = useState<AppSettingsData | null>(null)
  const [factory, setFactory] = useState<FactorySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => Promise.all([engine.appSettings(app.id).then(setInfo), engine.settings().then(setFactory)]).catch((e) => setError(err(e)))
  useEffect(() => { void load() }, [app.id])

  const dirty = name !== app.name || branch !== app.defaultBranch || JSON.stringify(setup) !== JSON.stringify(app.setup ?? {})
    || repo.fullName !== (app.repos?.[0]?.fullName ?? '') || (repo.localPath ?? '') !== (app.repos?.[0]?.localPath ?? '')
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const set = (patch: Partial<AppSetup>) => setSetup({ ...setup, ...patch })
  const save = async () => {
    setBusy(true); setError(null)
    try {
      await engine.updateApp(app.id, { name: name.trim(), defaultBranch: branch.trim() || 'main', setup: clean(setup) })
      if (repo.id) await engine.updateRepo(repo.id, { fullName: repo.fullName ?? '', localPath: repo.localPath?.trim() || null })
      else if (repo.fullName?.trim() || repo.localPath?.trim()) await engine.createRepo({ appId: app.id, fullName: repo.fullName?.trim() ?? '', localPath: repo.localPath?.trim() || undefined })
      await onSaved(); await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  const own = setup.integrations ?? {}
  const shared = factory?.values ?? {}

  return (
    <section className="panel" data-component="AppSettings">
      <div className="task-block-head"><h2 style={{ margin: 0 }}>{app.name}</h2><span className="mono faint">{app.key} · {app.id}</span></div>

      <Group title="Repo" lead="The code and the checkout on this machine the agents work from.">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Default branch<input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></label>
        <label>GitHub repo<input className="mono" value={repo.fullName ?? ''} onChange={(e) => setRepo({ ...repo, fullName: e.target.value })} placeholder="owner/name (for the PR)" /></label>
        <label>Local checkout<input className="mono" value={repo.localPath ?? ''} onChange={(e) => setRepo({ ...repo, localPath: e.target.value })} placeholder="/absolute/path/to/the/repo, on its default branch" /></label>
      </Group>

      <Group title="Agents" lead="What a planner or builder run on this app gets.">
        <label>Model<input className="mono" value={setup.model ?? ''} onChange={(e) => set({ model: e.target.value })} placeholder="default: the agent's own" /></label>
        <label>Budget per run (USD)<input type="number" min={0} step={1} value={setup.max_budget_usd ?? ''} onChange={(e) => set({ max_budget_usd: num(e.target.value) })} placeholder="no cap" /></label>
        <label>Turns per run<input type="number" min={1} step={1} value={setup.max_turns ?? ''} onChange={(e) => set({ max_turns: num(e.target.value) })} placeholder="60" /></label>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="label-text">Skills in this repo</div>
          {info?.skills.length ? <SkillList skills={info.skills} /> : <div className="faint settings-desc">None in <span className="mono">.claude/skills/</span>{repo.localPath ? '' : ' (no local checkout set)'}. The factory's skills apply too: see <NavLink to="/settings">All apps</NavLink>.</div>}
        </div>
      </Group>

      <Group title="Landing" lead="How finished work reaches the default branch.">
        <label style={{ gridColumn: '1 / -1' }}>Test command<input className="mono" value={setup.test_cmd ?? ''} onChange={(e) => set({ test_cmd: e.target.value })} placeholder="runs in the worktree on the merged commit; must exit 0 to land" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Pull requests<select value={setup.pr_mode ?? 'project'} onChange={(e) => set({ pr_mode: e.target.value as 'project' | 'issue' })}>
          <option value="project">One per project: every issue lands on the project's branch</option>
          <option value="issue">One per issue, stacked: small PRs for a team; each merges on its own</option>
        </select></label>
      </Group>

      <Group title="Storybook" lead="Where this app's stories run.">
        <label>URL<input className="mono" value={setup.storybook_url ?? ''} onChange={(e) => set({ storybook_url: e.target.value })} placeholder="http://localhost:6006" /></label>
        <label>Command<input className="mono" value={setup.storybook_cmd ?? ''} onChange={(e) => set({ storybook_cmd: e.target.value })} placeholder="cd web && pnpm storybook --no-open" /></label>
      </Group>

      <div className="settings-group">
      <h3 className="settings-h3">Integrations</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>An empty field uses the value set under All apps, shown in italics. Type to override it for this app only.</p>
      {(factory?.integrations ?? []).map((i) => (
        <div className="settings-group" key={i.key}>
          <div className="settings-group-head"><strong>{i.name}</strong> <span className="faint">· {i.role}</span></div>
          <div className="form-grid">
            {i.fields.map((f) => {
              const mine = own[i.key]?.[f.key] ?? ''
              const inherited = shared[i.key]?.[f.key]
              return (
                <label key={f.key}>{f.label} {mine.trim() ? <Badge tone="accent">override</Badge> : inherited ? <span className="faint">· inherited</span> : null}
                  <input className="mono" value={mine} placeholder={inherited ?? f.placeholder}
                    onChange={(e) => set({ integrations: { ...own, [i.key]: { ...own[i.key], [f.key]: e.target.value } } })} />
                </label>
              )
            })}
          </div>
        </div>
      ))}
      </div>

      <SaveRow dirty={dirty} busy={busy} error={error} onSave={save} />
    </section>
  )
}

function Group({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="settings-group">
      <h3 className="settings-h3">{title}</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>{lead}</p>
      <div className="form-grid">{children}</div>
    </div>
  )
}

function SaveRow({ dirty, busy, error, onSave }: { dirty: boolean; busy: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="settings-save">
      <button className="btn" disabled={!dirty || busy} onClick={onSave}>Save</button>
      {dirty && <span className="faint">Unsaved changes.</span>}
      {error && <span className="bad">{error}</span>}
    </div>
  )
}

/** Drop empty strings so the engine's defaults apply. */
function clean(s: AppSetup): AppSetup {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))) as AppSetup
}
