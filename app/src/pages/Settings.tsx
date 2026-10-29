/**
 * Settings, in two levels with a side list: All apps (what every app gets: the plugins, the jobs their skills cover,
 * the integrations' shared values) and one page per app (its repo, its agents, its plugins, how it lands, its
 * Storybook, and its own integration values; each inherits All apps until the app overrides it).
 */
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { engine, type AgentRole, type App, type AppSettings as AppSettingsData, type AppSetup, type CategoryGroup, type FactorySettings, type Integration, type IntegrationValues, type PluginInfo, type Repo } from '../engine'
import { useCurrentApp } from '../current-app'

const ROLE: Record<AgentRole, string> = { talk: 'Talk', planner: 'Planner' }
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
  const act = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load() } catch (e) { setError(err(e)) } }
  return (
    <>
      <section className="panel" data-component="Plugins">
        <h2>Plugins</h2>
        <p className="muted settings-lead">What the factory installs to give its agents more to work with: skills, tools, or both. Each is a Claude Code plugin, installed for Self Evident only (not your own Claude Code). The builder gets none; it builds what the plan says.</p>
        {s.plugins.map((p) => <PluginBlock key={p.id} p={p} catalogue={s.catalogue} act={act} />)}
        <AddPlugin onAdded={load} />
      </section>

      <section className="panel" data-component="SkillsByJob">
        <h2>Skills by what we do</h2>
        <p className="muted settings-lead">One skill per job: agents pick a skill by its description, so two for the same job compete. Filing a skill under a job that already has one replaces it. Skills in an app's own repo are on that app's page.</p>
        <Jobs plugins={s.plugins} catalogue={s.catalogue} />
      </section>

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

/** One plugin: its switch, its agents, its skills filed by job, and what its tools could cost. */
function PluginBlock({ p, catalogue, act }: { p: PluginInfo; catalogue: CategoryGroup[]; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const roles = (r: AgentRole) => (p.roles.includes(r) ? p.roles.filter((x) => x !== r) : [...p.roles, r])
  const remove = act(async () => { if (window.confirm(`Uninstall ${p.name}? Its settings go with it.`)) await engine.removePlugin(p.id) })
  return (
    <div className={`settings-group plugin ${p.on ? '' : 'off'}`}>
      <div className="plugin-head">
        <div>
          <strong>{p.name}</strong> <span className="mono faint">{p.version ?? ''}</span> {p.builtIn && <Badge>built in</Badge>}
          <div className="muted settings-desc">{p.description}</div>
          {p.source && <div className="faint settings-desc mono">from {p.source}</div>}
        </div>
        <div className="plugin-actions">
          <button className={`switch ${p.on ? 'on' : ''}`} aria-pressed={p.on} onClick={act(() => engine.updatePlugin(p.id, { on: !p.on }))}>{p.on ? 'On' : 'Off'}</button>
          {!p.builtIn && <button className="btn quiet" onClick={remove}>Remove</button>}
        </div>
      </div>
      <div className="plugin-row"><span className="label-text">Agents</span>
        <div className="plugin-switches">
          {(Object.keys(ROLE) as AgentRole[]).map((r) => (
            <button key={r} className={`switch small ${p.roles.includes(r) ? 'on' : ''}`} aria-pressed={p.roles.includes(r)} disabled={!p.on} onClick={act(() => engine.updatePlugin(p.id, { roles: roles(r) }))}>{ROLE[r]}</button>
          ))}
        </div>
      </div>
      <div className="plugin-row top"><span className="label-text">Skills</span>
        {p.skills.length ? (
          <ul className="list plugin-skills">
            {p.skills.map((k) => (
              <li key={k.key} className={k.on ? '' : 'off'}>
                <div className="plugin-skill-head">
                  <span className="mono">{k.name}</span>
                  <select value={k.category ?? ''} onChange={(e) => void act(() => engine.fileSkill(k.key, { category: e.target.value || null, on: true }))()}>
                    <option value="">Not filed</option>
                    {catalogue.map((g) => <optgroup key={g.name} label={g.name}>{g.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</optgroup>)}
                  </select>
                  <button className={`switch small ${k.on ? 'on' : ''}`} aria-pressed={k.on} onClick={act(() => engine.fileSkill(k.key, { on: !k.on }))}>{k.on ? 'On' : 'Off'}</button>
                </div>
                {k.description && <div className="muted settings-desc">{k.description}</div>}
              </li>
            ))}
          </ul>
        ) : <span className="faint">None yet{p.builtIn ? <>: a skill is a folder under <span className="mono">engine/plugin/skills/</span></> : ''}.</span>}
      </div>
      {p.tools && (
        <div className="plugin-row top"><span className="label-text">Tools</span>
          <div>
            <div>{p.tools.count} tools: <Badge tone="ok">free {p.tools.ratings.free}</Badge> <Badge tone="warn">moderate {p.tools.ratings.moderate}</Badge> <Badge tone="bad">expensive {p.tools.ratings.expensive}</Badge></div>
            <div className="faint settings-desc">Free ones read the target and run without asking. Moderate ones reach outside or change the plugin's own session, and ask unless the conversation allows moderate. Expensive ones run or change the target, and always ask. The planner, with no one to ask, gets only the free ones.</div>
            {p.note && <div className="faint settings-desc">{p.note}</div>}
          </div>
        </div>
      )}
      {!p.tools && p.mcpServers.length > 0 && <div className="plugin-row"><span className="label-text">Tools</span><span className="faint">from {p.mcpServers.join(', ')}; each call asks unless it is rated</span></div>}
    </div>
  )
}

/** Skills in the app's own repo: a name and what it is for. */
function SkillList({ skills }: { skills: { name: string; description: string }[] }) {
  return (
    <ul className="list">
      {skills.map((k) => <li key={k.name}><span className="mono">{k.name}</span>{k.description && <div className="muted settings-desc">{k.description}</div>}</li>)}
    </ul>
  )
}

/** Adding is a form only once asked for: a marketplace and a plugin name, installed by Claude Code's installer. */
function AddPlugin({ onAdded }: { onAdded: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [market, setMarket] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return <div className="settings-group"><button className="btn quiet" onClick={() => setOpen(true)}>Add a plugin</button></div>
  const install = async () => {
    setBusy(true); setError(null)
    try { await engine.installPlugin(market, name); setOpen(false); setMarket(''); setName(''); await onAdded() } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  return (
    <div className="settings-group">
      <h3 className="settings-h3">Add a plugin</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>From a Claude Code plugin marketplace. A plugin whose install would run a command is refused.</p>
      <div className="form-grid">
        <label>Marketplace<input className="mono" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="owner/repo, a git URL, or a path" /></label>
        <label>Plugin<input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="its name in that marketplace" /></label>
      </div>
      <div className="settings-save">
        <button className="btn" disabled={busy || !market.trim() || !name.trim()} onClick={install}>{busy ? 'Installing…' : 'Install'}</button>
        <button className="btn quiet" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>Cancel</button>
        {error && <span className="bad">{error}</span>}
      </div>
    </div>
  )
}

/** The catalogue's jobs, each with what covers it: a plugin's skill, the engine itself, or nothing yet. */
function Jobs({ plugins, catalogue }: { plugins: PluginInfo[]; catalogue: CategoryGroup[] }) {
  const filed = plugins.flatMap((p) => p.skills.filter((k) => k.category).map((k) => ({ ...k, plugin: p })))
  return (
    <>
      {catalogue.map((g) => (
        <div className="settings-group" key={g.name}>
          <h3 className="settings-h3">{g.name}</h3>
          <dl className="fields jobs">
            {g.categories.map((c) => {
              const here = filed.filter((k) => k.category === c.key)
              return (
                <div key={c.key} style={{ display: 'contents' }}>
                  <dt>{c.name}<div className="faint settings-desc">{c.for}</div></dt>
                  <dd>
                    {here.map((k) => {
                      const live = k.on && k.plugin.on
                      return <div key={k.key} className={live ? '' : 'off'}><span className="mono">{k.name}</span> <Badge tone={live ? 'accent' : undefined}>{k.plugin.name}</Badge>{!live && <span className="faint"> · off</span>}</div>
                    })}
                    {c.builtIn && <div className={here.some((k) => k.on && k.plugin.on) ? 'faint' : ''}>{c.builtIn} <span className="faint">· built in</span></div>}
                    {!here.length && !c.builtIn && <span className="faint">—</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ))}
    </>
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
          {info?.skills.length ? <SkillList skills={info.skills} /> : <div className="faint settings-desc">None in <span className="mono">.claude/skills/</span>{repo.localPath ? '' : ' (no local checkout set)'}. Plugins' skills apply too: see Plugins below and <NavLink to="/settings">All apps</NavLink>.</div>}
        </div>
      </Group>

      <div className="settings-group">
        <h3 className="settings-h3">Plugins</h3>
        <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>Each follows All apps unless this app switches it for itself.</p>
        <dl className="fields">
          {(info?.plugins ?? []).map((p) => {
            const mine = setup.plugins?.[p.id]?.on
            const choose = (v: string) => {
              const { [p.id]: _, ...rest } = setup.plugins ?? {}
              set({ plugins: v === '' ? rest : { ...rest, [p.id]: { on: v === 'on' } } })
            }
            return (
              <div key={p.id} style={{ display: 'contents' }}>
                <dt>{p.name}</dt>
                <dd>
                  <select value={mine === undefined ? '' : mine ? 'on' : 'off'} onChange={(e) => choose(e.target.value)}>
                    <option value="">As All apps ({p.factoryOn ? 'on' : 'off'})</option>
                    <option value="on">On for this app</option>
                    <option value="off">Off for this app</option>
                  </select> {mine !== undefined && <Badge tone="accent">override</Badge>}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      <Group title="Landing" lead="How finished work reaches the default branch.">
        <label style={{ gridColumn: '1 / -1' }}>Test command<input className="mono" value={setup.test_cmd ?? ''} onChange={(e) => set({ test_cmd: e.target.value })} placeholder="runs in the worktree on the merged commit; must exit 0 to land" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Pull requests<select value={setup.pr_mode ?? 'project'} onChange={(e) => set({ pr_mode: e.target.value as 'project' | 'issue' })}>
          <option value="project">One per project: every issue lands on the project's branch</option>
          <option value="issue">One per issue, stacked: small PRs for a team; each merges on its own</option>
        </select></label>
      </Group>

      <Group title="Prototype" lead="How a prototype's server starts: run in the prototype's own worktree, serving on $PORT. With a database server, each prototype gets a throwaway database of its own there, made by the schema command and filled with made-up data. The agent works these out the first time and asks you to confirm.">
        <label style={{ gridColumn: '1 / -1' }}>Command<input className="mono" value={setup.prototype_cmd ?? ''} onChange={(e) => set({ prototype_cmd: e.target.value })} placeholder="pnpm install && pnpm dev --port $PORT" /></label>
        <label>Database server<input className="mono" value={setup.prototype_db?.url ?? ''} onChange={(e) => set({ prototype_db: { ...setup.prototype_db, url: e.target.value } })} placeholder="postgres://app:app@localhost:5432/app" /></label>
        <label>Its variable<input className="mono" value={setup.prototype_db?.env ?? ''} onChange={(e) => set({ prototype_db: { url: '', ...setup.prototype_db, env: e.target.value } })} placeholder="DATABASE_URL" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Schema command<input className="mono" value={setup.prototype_db?.schema_cmd ?? ''} onChange={(e) => set({ prototype_db: { url: '', ...setup.prototype_db, schema_cmd: e.target.value } })} placeholder="makes the schema in the database its variable names, like: alembic upgrade head" /></label>
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
