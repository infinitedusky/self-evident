/**
 * Settings, in two levels with a side list: All apps (what every app gets: the skills, added as files and tagged with
 * the jobs they could do; what we do, and the skill doing each job; plugins, for tools; the integrations' shared values) and one page per app (its repo, its agents, its plugins, how it lands, its
 * Storybook, and its own integration values; each inherits All apps until the app overrides it).
 */
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { engine, type AgentRole, type App, type AppSettings as AppSettingsData, type AddedSkill, type AppSetup, type FactorySettings, type Integration, type IntegrationValues, type Candidate, type Job, type JobGroup, type PluginInfo, type PluginSkill, type Repo } from '../engine'
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
      <section className="panel" data-component="Skills">
        <h2>Skills</h2>
        <p className="muted settings-lead">A skill is one file: instructions an agent picks up when its description matches the work. Add one from a link, a file, or by pasting it. Tags are the jobs it could do. Skills in an app's own repo are on that app's page.</p>
        <AddSkill onAdded={load} />
        <Skills s={s} act={act} />
      </section>

      <section className="panel" data-component="Jobs">
        <h2>What we do</h2>
        <p className="muted settings-lead">Each job, and the one skill selected to do it. Agents pick a skill by its description, so two for one job would compete. A skill reaches the agents only once it is selected here.</p>
        <Jobs s={s} act={act} reload={load} />
      </section>

      <section className="panel" data-component="Plugins">
        <h2>Plugins</h2>
        <p className="muted settings-lead">For tools: a plugin brings tools the agents can call, like REA's. It's a Claude Code plugin, installed for Self Evident only (not your own Claude Code). Its skills join the list above. The builder gets none; it builds what the plan says.</p>
        {s.plugins.filter((p) => !p.builtIn).map((p) => <PluginBlock key={p.id} p={p} act={act} />)}
        <AddPlugin onAdded={load} />
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

/** One plugin: its switch, its agents, how many of its skills do a job, and what its tools could cost. */
type Act = (f: () => Promise<unknown>) => () => Promise<void>

function PluginBlock({ p, act }: { p: PluginInfo; act: Act }) {
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
      <div className="plugin-row"><span className="label-text">Skills</span>
        {p.skills.length
          ? <span>{p.skills.length} <span className="faint">· {p.skills.filter((k) => k.jobs.length).length} doing a job</span></span>
          : <span className="faint">None yet{p.builtIn ? <>: a skill is a folder under <span className="mono">engine/plugin/skills/</span></> : ''}.</span>}
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

const allSkills = (s: FactorySettings) => s.plugins.flatMap((p) => p.skills.map((k) => ({ ...k, plugin: p })))
const jobNames = (groups: JobGroup[]) => new Map(groups.flatMap((g) => g.categories.map((c) => [c.key, c.name] as const)))

/** The jobs, each with a select of installed skills (tagged ones first), what the engine does there, and candidates. */
function Jobs({ s, act, reload }: { s: FactorySettings; act: Act; reload: () => Promise<unknown> }) {
  const skills = allSkills(s)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const get = async (x: Candidate) => {
    const plugin = x.key && s.sources[x.key.split('/')[0]]
    setAdding(x.key ?? x.name); setError(null)
    try {
      if (x.url) await engine.addSkill({ url: x.url, source: 'url' })
      else if (plugin) await engine.installPlugin(plugin.marketplace, plugin.name)
      await reload()
    } catch (e) { setError(err(e)) } finally { setAdding(null) }
  }
  const installed = new Set(skills.map((k) => k.key))
  const option = (k: (typeof skills)[number]) => <option key={k.key} value={k.key}>{k.name} · {k.plugin.name}{k.personOnly ? ' (person only)' : ''}</option>
  return (
    <>
      {error && <div className="empty bad">{error}</div>}
      {s.jobs.map((g) => (
        <div className="settings-group" key={g.name}>
          <h3 className="settings-h3">{g.name}</h3>
          <dl className="fields jobs">
            {g.categories.map((c: Job) => {
              const tagged = skills.filter((k) => k.tags.includes(c.key))
              const rest = skills.filter((k) => !k.tags.includes(c.key))
              const chosen = skills.find((k) => k.key === c.skill)
              return (
                <div key={c.key} style={{ display: 'contents' }}>
                  <dt>{c.name}<div className="faint settings-desc">{c.for}</div></dt>
                  <dd>
                    <div className="job-pick">
                      <select value={c.skill ?? ''} onChange={(e) => void act(() => engine.selectSkill(c.key, e.target.value || null))()}>
                        <option value="">{c.builtIn ? 'Built in (no skill)' : 'No skill'}</option>
                        {tagged.length > 0 && <optgroup label="Tagged for this">{tagged.map(option)}</optgroup>}
                        {rest.length > 0 && <optgroup label="Other installed skills">{rest.map(option)}</optgroup>}
                      </select>
                      {chosen && !chosen.plugin.on && <span className="faint">its plugin is off</span>}
                      {chosen?.personOnly && <span className="faint">a person starts it with /{chosen.name}; agents can't</span>}
                    </div>
                    {c.builtIn && <div className={`settings-desc ${chosen ? 'faint' : ''}`}>{c.builtIn} <span className="faint">· built in</span></div>}
                    {c.candidates?.length ? (
                      <div className="faint settings-desc">Candidates: {c.candidates.map((x, i) => (
                        <span key={x.name + x.by}>{i > 0 && ', '}<span className="mono">{x.name}</span> ({x.by}){x.key && installed.has(x.key) ? ' ✓'
                          : (x.url || (x.key && s.sources[x.key.split('/')[0]])) ? <button className="btn quiet tiny" disabled={!!adding} onClick={() => void get(x)}>{adding === (x.key ?? x.name) ? 'Adding…' : 'Add'}</button> : null}</span>
                      ))}
                      </div>
                    ) : null}
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

/** Adding a skill is a form only once asked for: a link, a file, or pasted text. */
function AddSkill({ onAdded }: { onAdded: () => Promise<unknown> }) {
  const [how, setHow] = useState<'url' | 'upload' | 'paste' | null>(null)
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reset = () => { setHow(null); setUrl(''); setContent(''); setFile(''); setName(''); setError(null) }
  const ready = how === 'url' ? !!url.trim() : !!content.trim()
  const add = async () => {
    setBusy(true); setError(null)
    try { await engine.addSkill({ source: how!, ...(how === 'url' ? { url } : { content }), name: name.trim() || undefined }); reset(); await onAdded() } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  const pick = (f?: File) => { if (!f) return; setFile(f.name); if (!name) setName(f.name.replace(/\.md$/i, '').toLowerCase() === 'skill' ? '' : f.name.replace(/\.md$/i, '').toLowerCase()); void f.text().then(setContent) }
  if (!how) return (
    <div className="add-skill-row">
      <span className="label-text">Add a skill</span>
      <button className="btn quiet tiny" onClick={() => setHow('url')}>From a link</button>
      <button className="btn quiet tiny" onClick={() => setHow('upload')}>Upload a file</button>
      <button className="btn quiet tiny" onClick={() => setHow('paste')}>Paste it</button>
    </div>
  )
  return (
    <div className="settings-group add-skill">
      <h3 className="settings-h3">{how === 'url' ? 'Add a skill from a link' : how === 'upload' ? 'Upload a skill' : 'Paste a skill'}</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>One SKILL.md: frontmatter with a <span className="mono">name</span> and a <span className="mono">description</span>, then the instructions.{how === 'url' && ' A GitHub link to the file or its folder works.'}</p>
      {how === 'url' && <label className="label-text">Link<input className="mono wide-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/skills/name/SKILL.md" /></label>}
      {how === 'upload' && <label className="label-text">File<input type="file" accept=".md,text/markdown,text/plain" onChange={(e) => pick(e.target.files?.[0])} /></label>}
      {how === 'upload' && file && <div className="faint settings-desc">{file}: {content.length.toLocaleString()} characters</div>}
      {how === 'paste' && <textarea className="mono wide-input" rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder={'---\nname: my-skill\ndescription: When to use it.\n---\n\nThe instructions.'} />}
      {how !== 'url' && <label className="label-text">Name, if the file doesn't give one<input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="lowercase-with-dashes" /></label>}
      <div className="settings-save">
        <button className="btn" disabled={busy || !ready} onClick={() => void add()}>{busy ? 'Adding…' : 'Add'}</button>
        <button className="btn quiet" disabled={busy} onClick={reset}>Cancel</button>
        {error && <span className="bad">{error}</span>}
      </div>
    </div>
  )
}

/** Every installed skill: what it says it does, the job it is doing, and its tags (edited only once asked for). */
function Skills({ s, act }: { s: FactorySettings; act: Act }) {
  const skills = allSkills(s)
  const names = jobNames(s.jobs)
  if (!skills.length) return <div className="empty">No skills yet. Add one above, or add a candidate from a job below.</div>
  return (
    <ul className="list skill-list">
      {skills.map((k) => <SkillRow key={k.key} k={k} added={s.added.find((a) => a.key === k.key)} names={names} groups={s.jobs} act={act} />)}
    </ul>
  )
}

function SkillRow({ k, added, names, groups, act }: { k: PluginSkill & { plugin: PluginInfo }; added?: AddedSkill; names: Map<string, string>; groups: JobGroup[]; act: Act }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = async () => { setError(null); try { setText(text === null ? (await engine.addedSkill(k.name)).content : null) } catch (e) { setError(err(e)) } }
  const save = async () => { setError(null); try { await engine.editSkill(k.name, text ?? ''); setText(null); await act(async () => undefined)() } catch (e) { setError(err(e)) } }
  const toggle = (tag: string) => act(() => engine.tagSkill(k.key, k.tags.includes(tag) ? k.tags.filter((t) => t !== tag) : [...k.tags, tag]))
  return (
    <li className={k.jobs.length ? '' : 'off'}>
      <div className="plugin-skill-head">
        <span className="mono">{k.name}</span> {!added && <Badge>{k.plugin.name}</Badge>}
        {k.personOnly && <Badge tone="warn">person only</Badge>}
        {k.jobs.length ? <span>doing: {k.jobs.map((j) => names.get(j)).join(', ')}</span> : <span className="faint">not selected for a job</span>}
      </div>
      {k.description && <div className="muted settings-desc skill-desc">{k.description}</div>}
      <div className="skill-tags">
        {k.tags.map((t) => <span key={t} className="tag">{names.get(t) ?? t}</span>)}
        <button className="btn quiet tiny" onClick={() => setEditing(!editing)}>{editing ? 'Done' : k.tags.length ? 'Edit tags' : 'Add tags'}</button>
        {added && <>
          <span className="faint skill-source">{added.sourceUrl ? <>from <a href={added.sourceUrl} target="_blank" rel="noreferrer">{added.sourceUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a></> : added.source === 'upload' ? 'uploaded' : 'pasted'}</span>
          <button className="btn quiet tiny" onClick={() => void open()}>{text === null ? 'Text' : 'Close'}</button>
          {added.sourceUrl && <button className="btn quiet tiny" onClick={act(() => engine.refreshSkill(k.name))}>Refresh</button>}
          <button className="btn quiet tiny" onClick={act(async () => { if (window.confirm(`Remove ${k.name}? Its tags and job go with it.`)) await engine.removeSkill(k.name) })}>Remove</button>
        </>}
      </div>
      {error && <div className="bad settings-desc">{error}</div>}
      {text !== null && (
        <div className="skill-text">
          <textarea className="mono" value={text} onChange={(e) => setText(e.target.value)} rows={14} />
          <div className="settings-save"><button className="btn" onClick={() => void save()}>Save</button><button className="btn quiet" onClick={() => setText(null)}>Cancel</button></div>
        </div>
      )}
      {editing && (
        <div className="tag-editor">
          {groups.map((g) => (
            <div key={g.name}><span className="label-text">{g.name}</span>
              {g.categories.map((c) => <button key={c.key} className={`switch small ${k.tags.includes(c.key) ? 'on' : ''}`} aria-pressed={k.tags.includes(c.key)} onClick={toggle(c.key)}>{c.name}</button>)}
            </div>
          ))}
        </div>
      )}
    </li>
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
