/**
 * Settings, after VS Code's: which settings across the top (All apps, then each app; an app inherits All apps until it
 * overrides), and that scope's sections down the side, one at a time, each with its own address and its own Save.
 * All apps: plugins, the jobs their skills cover, the integrations (a list, then a page each). An app: its repo, agents, plugins,
 * landing, prototype, Storybook, integration values, and its workflow rules.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { Integrations } from '../components/Integrations'
import { WorkflowSettings } from '../components/WorkflowSettings'
import { STEPS } from '@self-evident/engine/steps'
import { engine, type PulledSkills, type SkillSource, type AccountStatus, type AgentRole, type AppJob, type UsableSkill, type App, type AppReference, type AppSettings as AppSettingsData, type AppSetup, type CategoryGroup, type EffectiveValues, type FactorySettings, type Folder, type GitHubRepos, type PluginInfo } from '../engine'
import { useCurrentApp } from '../current-app'

const ROLE: Record<AgentRole, string> = { talk: 'Talk', planner: 'Planner' }
const err = (e: any) => String(e?.message ?? e)

export const FACTORY_SECTIONS = [
  { key: 'plugins', label: 'Plugins' }, { key: 'yours', label: 'Your skills' }, { key: 'skills', label: 'Skills by job' }, { key: 'integrations', label: 'Integrations' },
] as const
export const APP_SECTIONS = [
  { key: 'repo', label: 'Repo' }, { key: 'agents', label: 'Agents' }, { key: 'plugins', label: 'Plugins' }, { key: 'skills', label: 'Skills' }, { key: 'landing', label: 'Landing' },
  { key: 'prototype', label: 'Prototype' }, { key: 'integrations', label: 'Integrations' }, { key: 'workflows', label: 'Workflow rules' },
] as const

export function Settings() {
  const { id, section, item } = useParams()
  const { apps, reload: reloadNav } = useCurrentApp()
  const making = !!useMatch('/settings/new') // the New app step has its own address
  const app = id ? apps.find((a) => a.id === id) : undefined
  const sections = id ? APP_SECTIONS : FACTORY_SECTIONS
  const here = sections.find((x) => x.key === section)?.key ?? sections[0].key
  const base = id ? `/settings/apps/${id}` : '/settings'

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <nav className="settings-scope" aria-label="Which settings">
        <NavLink to="/settings" className={() => `scope ${!id && !making ? 'active' : ''}`}>All apps</NavLink>
        {apps.map((a) => <NavLink key={a.id} to={`/settings/apps/${a.id}`} className={() => `scope ${id === a.id ? 'active' : ''}`}>{a.name}</NavLink>)}
        <NavLink to="/settings/new" className={() => `scope add ${making ? 'active' : ''}`} title="Add an app">+ App</NavLink>
      </nav>
      <div className="settings" data-component="Settings">
        <aside className="settings-side" aria-label="Sections">
          {making
            ? <span className="link active">New app</span>
            : sections.map((x) => <NavLink key={x.key} to={`${base}/${x.key}`} className={() => `link ${here === x.key ? 'active' : ''}`}>{x.label}</NavLink>)}
        </aside>
        <div>
          {making ? <NewApp onMade={reloadNav} /> : !id ? <FactoryPage section={here} item={item} /> : app ? <AppPage key={app.id} app={app} section={here} item={item} onSaved={reloadNav} /> : <p className="muted">No such app.</p>}
        </div>
      </div>
    </>
  )
}

/**
 * A new app, with its code (Sandy, 2026-11-09): a GitHub repo of yours, picked from gh's list or typed, the folder on
 * this machine, or both. The engine makes a folder that isn't a repository one, and says so on the app's Repo page.
 */
function NewApp({ onMade }: { onMade: () => Promise<unknown> }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [fullName, setFullName] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [gh, setGh] = useState<GitHubRepos | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { engine.githubRepos().then(setGh).catch((e) => setGh({ repos: [], problem: err(e) })) }, [])
  const picked = gh?.repos.find((r) => r.fullName === fullName.trim())
  const ready = !!name.trim() && !!(fullName.trim() || localPath.trim())
  const add = async () => {
    setBusy(true); setError(null)
    try {
      const ws = (await engine.workspaces())[0] ?? (await engine.createWorkspace('My workspace'))
      const made = await engine.createApp({ workspaceId: ws.id, name: name.trim(), defaultBranch: picked?.defaultBranch, repo: { fullName: fullName.trim(), localPath: localPath.trim() } })
      await onMade()
      navigate(`/settings/apps/${made.id}`, { state: { note: made.note } })
    } catch (e) { setError(err(e)); setBusy(false) }
  }
  return (
    <section className="panel" data-component="NewApp">
      <Group title="New app" lead="Its name, and where its code is: a GitHub repo of yours, the folder on this machine, or both. A folder that isn't a git repository yet becomes one on the default branch, with the files as found committed.">
        <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ragdoll Golf" onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void add() }} /></label>
        <label>Default branch<input className="mono" value={picked?.defaultBranch ?? 'main'} readOnly title="Follows the GitHub repo picked, or the folder's own branch" /></label>
        <RepoFields fullName={fullName} localPath={localPath} gh={gh} onChange={(p) => { if (p.fullName !== undefined) setFullName(p.fullName); if (p.localPath !== undefined) setLocalPath(p.localPath) }} />
      </Group>
      <div className="settings-save">
        <button className="btn" disabled={!ready || busy} onClick={add}>Add</button>
        {!ready && <span className="faint">A name, and a GitHub repo or a folder.</span>}
        {error && <span className="bad">{error}</span>}
      </div>
    </section>
  )
}

/** The two places code lives, shared by New app and an app's Repo page: GitHub (a pick from gh's list, or typed) and the folder here. */
function RepoFields({ fullName, localPath, gh, onChange }: { fullName: string; localPath: string; gh: GitHubRepos | null; onChange: (patch: { fullName?: string; localPath?: string }) => void }) {
  return (
    <>
      <label>GitHub repo
        <input className="mono" list="github-repos" value={fullName} onChange={(e) => onChange({ fullName: e.target.value })} placeholder="owner/name (for the PR)" />
        <datalist id="github-repos">{(gh?.repos ?? []).map((r) => <option key={r.fullName} value={r.fullName}>{r.private ? 'private' : 'public'} · {r.defaultBranch}</option>)}</datalist>
        <span className="faint settings-desc">{gh === null ? 'Looking up your GitHub repos…' : gh.problem ?? `${gh.repos.length} of yours to pick from, or type one.`}</span>
      </label>
      <label>Local checkout
        <input className="mono" value={localPath} onChange={(e) => onChange({ localPath: e.target.value })} placeholder="/absolute/path/to/the/folder on this machine" />
        <span className="faint settings-desc">Where the agents work from. Not a git repository yet? It becomes one.</span>
      </label>
    </>
  )
}

/** What every app gets. */
function FactoryPage({ section, item }: { section: string; item?: string }) {
  const [s, setS] = useState<FactorySettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => engine.settings().then(setS).catch((e) => setError(err(e)))
  useEffect(() => { void load() }, [])
  if (error) return <div className="empty bad">{error}</div>
  if (!s) return <p className="muted">Loading…</p>
  const act = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load() } catch (e) { setError(err(e)) } }
  return (
    <>
      {section === 'plugins' && <section className="panel" data-component="Plugins">
        <h2>Plugins</h2>
        <p className="muted settings-lead">What the factory installs to give its agents more to work with: skills, tools, or both. Each is a Claude Code plugin, installed for Self Evident only (not your own Claude Code). The builder gets none; it builds what the plan says.</p>
        {s.plugins.filter((p) => p.id !== 'shared').map((p) => <PluginBlock key={p.id} p={p} catalogue={s.catalogue} act={act} />)}
        <AddPlugin onAdded={load} />
      </section>}

      {section === 'yours' && <section className="panel" data-component="YourSkills">
        <h2>Your skills</h2>
        <p className="muted settings-lead">Skills of your own, kept on this computer outside every repo, and given to every app. Write one here, or pull every skill from a repository and update them when it changes. File one under a job below, or choose it for a step of the workflow in an app's Skills.</p>
        {s.plugins.filter((p) => p.id === 'shared').map((p) => <YourSkills key={p.id} p={p} catalogue={s.catalogue} act={act} />)}
        {!s.plugins.some((p) => p.id === 'shared') && <div className="empty">This engine has no folder for your own skills. Update the engine.</div>}
      </section>}

      {section === 'skills' && <section className="panel" data-component="SkillsByJob">
        <h2>Skills by what we do</h2>
        <p className="muted settings-lead">One skill per job: agents pick a skill by its description, so two for the same job compete. Filing a skill under a job that already has one replaces it. Skills in an app's own repo are on that app's page.</p>
        <Jobs plugins={s.plugins} catalogue={s.catalogue} />
      </section>}

      {section === 'integrations' && (s.workspace
        ? <Integrations base="/settings/integrations" item={item} integrations={s.integrations} values={asEffective(s)} status={s.status} scope="workspace"
            onSave={async (v) => { await engine.updateWorkspace(s.workspace!.id, { integrations: v }); await load() }} />
        : <section className="panel"><h2>Integrations</h2><div className="empty">Add an app first; it creates the workspace.</div></section>)}
    </>
  )
}

/** One plugin: its switch, its agents, its skills filed by job, and what its tools could cost. */
/** Your own skills (the `shared` plugin), as a page of their own: the skills with where each came from, the form that writes one, the repositories to pull from. */
function YourSkills({ p, catalogue, act }: { p: PluginInfo; catalogue: CategoryGroup[]; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [sources, setSources] = useState<SkillSource[]>([])
  const load = () => engine.skillSources().then(setSources).catch(() => setSources([]))
  useEffect(() => { void load() }, [p.skills.length])
  const origin = (name: string) => { const from = sources.find((x) => x.skills.includes(name)); return from ? `pulled from ${from.url}` : 'written here' }
  return <PluginBlock p={p} catalogue={catalogue} act={act} origin={origin} />
}

/** `origin`: given for your own skills, where each came from; the block then drops the plugin's name and shows the rows that add skills. */
function PluginBlock({ p, catalogue, act, origin }: { p: PluginInfo; catalogue: CategoryGroup[]; act: (f: () => Promise<unknown>) => () => Promise<void>; origin?: (name: string) => string }) {
  const roles = (r: AgentRole) => (p.roles.includes(r) ? p.roles.filter((x) => x !== r) : [...p.roles, r])
  const remove = act(async () => { if (window.confirm(`Uninstall ${p.name}? Its settings go with it.`)) await engine.removePlugin(p.id) })
  return (
    <div className={`settings-group plugin ${p.on ? '' : 'off'}`}>
      <div className="plugin-head">
        <div>
          {origin ? <strong>For every app</strong> : <><strong>{p.name}</strong> <span className="mono faint">{p.version ?? ''}</span> {p.builtIn && <Badge>built in</Badge>}</>}
          <div className="muted settings-desc">{origin ? <>Off: no app gets them. An app can switch them for itself under its Plugins, where they are named <span className="mono">shared</span>.</> : p.description}</div>
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
                {origin && <div className="faint settings-desc">{origin(k.name)}</div>}
              </li>
            ))}
          </ul>
        ) : <span className="faint">None yet{p.builtIn ? <>: a skill is a folder under <span className="mono">{p.skillsDir ?? 'engine/plugin/skills/'}</span></> : ''}.</span>}
      </div>
      {origin && <AddSharedSkill dir={p.skillsDir ?? null} onAdded={act(async () => {})} />}
      {origin && <SkillSources onChanged={act(async () => {})} />}
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
/**
 * Write one of your own skills (Sandy, 2026-11-13: "skills … outside the repo we are using that become available for
 * any app"): a name, when to use it, what it says. It becomes a SKILL.md in the shared folder on this computer, there
 * to edit by hand afterwards; the same name again replaces it.
 */
function AddSharedSkill({ dir, onAdded }: { dir: string | null; onAdded: () => unknown }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrote, setWrote] = useState<string | null>(null)
  const add = async () => {
    setBusy(true); setError(null)
    try { const r = await engine.addSharedSkill({ name, description, body }); setWrote(r.file); setOpen(false); setName(''); setDescription(''); setBody(''); await onAdded() } catch (e) { { const m = err(e); try { setError(JSON.parse(m).error ?? m) } catch { setError(m) } } } finally { setBusy(false) }
  }
  return (
    <div className="plugin-row top" data-component="AddSharedSkill"><span className="label-text">Add</span>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="faint settings-desc">Skills kept on this computer, outside every repo{dir ? <>, in <span className="mono">{dir}</span></> : ''}. The same name again replaces the one here.</div>
        {wrote && <p className="settings-note" style={{ margin: 0 }}><Badge tone="ok">Written</Badge><span className="mono">{wrote}</span></p>}
        {!open ? <div><button className="btn quiet" onClick={() => { setOpen(true); setWrote(null) }}>Write a skill</button></div> : <>
          <label>Name<input className="mono" aria-label="Skill name" value={name} onChange={(e) => setName(e.target.value)} placeholder="decision-record" /></label>
          <label>When to use it<input aria-label="When to use it" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two sentences. An agent picks a skill by this." /></label>
          <label>What it says<textarea aria-label="What it says" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="The instructions, in Markdown: what to do, in what order, what the result looks like." /></label>
          {error && <div className="empty bad">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || !name.trim() || !description.trim() || !body.trim()} onClick={() => void add()}>{busy ? 'Writing…' : 'Write the skill'}</button>
            <button className="btn quiet" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>}
      </div>
    </div>
  )
}

/**
 * Skills from a repository (Sandy, 2026-11-13: "point to a repo and pull all the skills of that repo, or update if we
 * already have them and the repo has changed"). Give a git URL or a folder on this computer: every skill in it is
 * copied into the shared skills. Update fetches it again and says what changed. A name a skill from somewhere else
 * already holds is left alone and named.
 */
function SkillSources({ onChanged }: { onChanged: () => unknown }) {
  const [rows, setRows] = useState<SkillSource[] | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [did, setDid] = useState<PulledSkills | null>(null)
  const load = () => engine.skillSources().then(setRows).catch(() => setRows([]))
  useEffect(() => { void load() }, [])
  const words = (e: unknown) => { const m = err(e); try { return JSON.parse(m).error ?? m } catch { return m } }
  const pull = async (from: string) => {
    setBusy(from); setError(null); setDid(null)
    try { setDid(await engine.pullSkills(from)); setUrl(''); await load(); await onChanged() } catch (e) { setError(words(e)) } finally { setBusy(null) }
  }
  const remove = async (from: string, n: number) => {
    if (!window.confirm(`Stop pulling from ${from}? Its ${n} skill${n === 1 ? '' : 's'} here ${n === 1 ? 'is' : 'are'} removed.`)) return
    setBusy(from); setError(null); setDid(null)
    try { await engine.removeSkillSource(from); await load(); await onChanged() } catch (e) { setError(words(e)) } finally { setBusy(null) }
  }
  const part = (label: string, names: string[]) => (names.length ? `${label} ${names.join(', ')}. ` : '')
  const changed = did && (did.added.length || did.updated.length || did.removed.length)
  return (
    <div className="plugin-row top" data-component="SkillSources"><span className="label-text">From a repo</span>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="faint settings-desc">Pull every skill in a repository into the shared skills. Update fetches it again and brings them up to date: changed ones are replaced, new ones added, dropped ones removed.</div>
        {(rows ?? []).length > 0 && <ul className="list">
          {rows!.map((r) => (
            <li key={r.url} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ overflowWrap: 'anywhere' }}>{r.url}</div>
                <div className="faint" style={{ fontSize: 13 }}>{r.skills.length} skill{r.skills.length === 1 ? '' : 's'}: {r.skills.join(', ')} · at <span className="mono">{r.commit.slice(0, 7)}</span>, pulled {r.pulledAt.slice(0, 10)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn quiet small" disabled={!!busy} aria-label={`Update ${r.url}`} onClick={() => void pull(r.url)}>{busy === r.url ? 'Updating…' : 'Update'}</button>
                <button className="btn quiet small" disabled={!!busy} aria-label={`Remove ${r.url}`} onClick={() => void remove(r.url, r.skills.length)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="mono" aria-label="Repository" style={{ flex: 1, minWidth: 0 }} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !busy) void pull(url) }} placeholder="git@github.com:owner/skills.git, an https URL, or a folder on this computer" />
          <button className="btn" disabled={!!busy || !url.trim()} onClick={() => void pull(url)}>{busy && busy === url ? 'Pulling…' : 'Pull skills'}</button>
        </div>
        {error && <div className="empty bad">{error}</div>}
        {did && <p className="settings-note" style={{ margin: 0 }}><Badge tone={changed ? 'ok' : 'neutral'}>{changed ? 'Pulled' : 'Up to date'}</Badge><span>
          {part('Added', did.added)}{part('Updated', did.updated)}{part('Removed', did.removed)}{!changed && `Nothing has changed in ${did.unchanged.length} skill${did.unchanged.length === 1 ? '' : 's'}. `}
          {did.skipped.length > 0 && `Left alone, because a skill of that name here came from somewhere else: ${did.skipped.join(', ')}.`}
        </span></p>}
      </div>
    </div>
  )
}

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

/** The workspace's own values, in the shape an app's are shown in. */
function asEffective(s: FactorySettings): EffectiveValues {
  return Object.fromEntries(s.integrations.map((i) => [i.key, Object.fromEntries(i.fields.map((f) => {
    const v = s.values[i.key]?.[f.key]?.trim()
    return [f.key, { value: v || null, from: v ? 'workspace' as const : null }]
  }))]))
}

/** One app: grouped, one Save for the lot. Integration fields show the inherited value until overridden. */
function AppPage({ app, section, item, onSaved }: { app: App; section: string; item?: string; onSaved: () => Promise<unknown> }) {
  const others = useCurrentApp().apps.filter((x) => x.id !== app.id)
  const [name, setName] = useState(app.name)
  const [branch, setBranch] = useState(app.defaultBranch)
  const [setup, setSetup] = useState<AppSetup>(app.setup ?? {})
  const was = (app.repos ?? []).map(rowOf) // the engine lists home first
  const [repos, setRepos] = useState<RepoRow[]>(was)
  const [home, setHome] = useState<string | null>(was[0]?.key ?? null)
  const [info, setInfo] = useState<AppSettingsData | null>(null)
  const [factory, setFactory] = useState<FactorySettings | null>(null)
  const [gh, setGh] = useState<GitHubRepos | null>(null)
  const arrived = useLocation().state as { note?: string | null } | null // what New app's engine call said, carried here
  const [note, setNote] = useState<string | null>(arrived?.note ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => Promise.all([engine.appSettings(app.id).then(setInfo), engine.settings().then(setFactory)]).catch((e) => setError(err(e)))
  useEffect(() => { void load() }, [app.id])
  useEffect(() => { if (section === 'repo' && gh === null) engine.githubRepos().then(setGh).catch((e) => setGh({ repos: [], problem: err(e) })) }, [section])
  useEffect(() => { setBranch(app.defaultBranch) }, [app.defaultBranch]) // the engine may have made the checkout's branch the default

  const dirty = name !== app.name || branch !== app.defaultBranch || JSON.stringify(setup) !== JSON.stringify(app.setup ?? {})
    || repos.map((r) => r.key).join() !== was.map((r) => r.key).join() || (repos.length > 1 && homeOf(repos, home) !== was[0]?.key)
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const set = (patch: Partial<AppSetup>) => setSetup({ ...setup, ...patch })
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const homeKey = homeOf(repos, home)
      const many = (id?: string) => ({ ...setup, home_repo: repos.length > 1 ? id : undefined })
      await engine.updateApp(app.id, { name: name.trim(), defaultBranch: branch.trim() || 'main', setup: clean(many(repos.find((r) => r.key === homeKey)?.id ?? setup.home_repo)) })
      for (const r of was.filter((w) => !repos.some((x) => x.key === w.key))) await engine.deleteRepo(r.id!)
      const notes: string[] = []
      const rows: RepoRow[] = []
      for (const r of [...repos].sort((x, y) => Number(y.key === homeKey) - Number(x.key === homeKey))) { // home first: the app's default branch follows it
        if (r.id) { rows.push(r); continue }
        const { note: said, ...made } = await engine.createRepo({ appId: app.id, fullName: r.fullName, localPath: r.localPath || undefined, baseBranch: r.baseBranch || undefined })
        if (said) notes.push(said)
        rows.push({ ...rowOf(made), key: r.key })
      }
      const homeId = rows.find((r) => r.key === homeKey)?.id
      if (repos.length > 1 && homeId && repos.find((r) => r.key === homeKey)?.id !== homeId) await engine.updateApp(app.id, { setup: clean(many(homeId)) }) // home was only just made
      setRepos(rows.map((r) => ({ ...r, key: r.id! }))); setHome(homeId ?? null); setSetup(clean(many(homeId)))
      if (notes.length) setNote(notes.join(' '))
      await onSaved(); await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  if (section === 'workflows') return <WorkflowSettings appId={app.id} />
  if (section === 'integrations') return info && factory
    ? <Integrations base={`/settings/apps/${app.id}/integrations`} item={item} integrations={factory.integrations} values={info.integrations} status={info.status} scope="app" appId={app.id}
        onSave={async (v) => { await engine.updateApp(app.id, { setup: { ...(app.setup ?? {}), integrations: v } }); await onSaved(); await load() }} />
    : error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>
  const groups: Record<string, React.ReactNode> = {
    repo: <>
      <Group title="Repo" lead="What the app is called, and the branch its work is cut from.">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Default branch<input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></label>
      </Group>
      <Repos appName={app.name} defaultBranch={branch.trim() || 'main'} rows={repos} home={homeOf(repos, home)} gh={gh} onRows={setRepos} onHome={setHome} />
      <References app={app} others={others} value={setup.references ?? []} onChange={(references) => set({ references: references.length ? references : undefined })} />
      {note && <p className="settings-note" data-component="CheckoutNote"><Badge tone="ok">Set up</Badge><span>{note}</span></p>}
    </>,
    agents: <>
      <Group title="Agents" lead="What a planner or builder run on this app gets.">
        <label>Model<input className="mono" value={setup.model ?? ''} onChange={(e) => set({ model: e.target.value })} placeholder="default: the agent's own" /></label>
        <label>Budget per run (USD)<input type="number" min={0} step={1} value={setup.max_budget_usd ?? ''} onChange={(e) => set({ max_budget_usd: num(e.target.value) })} placeholder="no cap" /></label>
        <label>Turns per run<input type="number" min={1} step={1} value={setup.max_turns ?? ''} onChange={(e) => set({ max_turns: num(e.target.value) })} placeholder="60" /></label>
        <Account appId={app.id} value={setup.account} saved={app.setup?.account} onChange={(account) => set({ account })} />
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="label-text">Skills in this repo</div>
          {info?.skills.length ? <SkillList skills={info.skills} /> : <div className="faint settings-desc">None in <span className="mono">.claude/skills/</span>{repos[0]?.localPath ? '' : ' (no local checkout set)'}. Plugins' skills apply too: see Plugins below and <NavLink to="/settings">All apps</NavLink>.</div>}
        </div>
      </Group>
    </>,
    plugins: <>
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
    </>,
    skills: <><StepSkills usable={info?.usable ?? null} value={setup.step_skills ?? {}} onChange={(next) => set({ step_skills: Object.keys(next).length ? next : undefined })} />
      <AppJobs jobs={info?.jobs ?? null} value={setup.skills_by_job ?? {}} onChange={(next) => set({ skills_by_job: Object.keys(next).length ? next : undefined })} /></>,
    landing: <>
      <Group title="Landing" lead="How finished work reaches the default branch.">
        <label style={{ gridColumn: '1 / -1' }}>Test command<input className="mono" value={setup.test_cmd ?? ''} onChange={(e) => set({ test_cmd: e.target.value })} placeholder="runs in the worktree on the merged commit; must exit 0 to land" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Pull requests<select value={setup.pr_mode ?? 'project'} onChange={(e) => set({ pr_mode: e.target.value as 'project' | 'issue' })}>
          <option value="project">One per project: every task lands on the project's branch</option>
          <option value="issue">One per task, stacked: small PRs for a team; each merges on its own</option>
        </select></label>
      </Group>
    </>,
    prototype: <>
      <Group title="Prototype" lead="How a prototype's server starts: run in the prototype's own worktree, serving on $PORT. With a database server, each prototype gets a throwaway database of its own there, made by the schema command and filled with made-up data. The agent works these out the first time and asks you to confirm.">
        <label style={{ gridColumn: '1 / -1' }}>Command<input className="mono" value={setup.prototype_cmd ?? ''} onChange={(e) => set({ prototype_cmd: e.target.value })} placeholder="pnpm install && pnpm dev --port $PORT" /></label>
        <label>Database server<input className="mono" value={setup.prototype_db?.url ?? ''} onChange={(e) => set({ prototype_db: { ...setup.prototype_db, url: e.target.value } })} placeholder="postgres://app:app@localhost:5432/app" /></label>
        <label>Its variable<input className="mono" value={setup.prototype_db?.env ?? ''} onChange={(e) => set({ prototype_db: { url: '', ...setup.prototype_db, env: e.target.value } })} placeholder="DATABASE_URL" /></label>
        <label style={{ gridColumn: '1 / -1' }}>Schema command<input className="mono" value={setup.prototype_db?.schema_cmd ?? ''} onChange={(e) => set({ prototype_db: { url: '', ...setup.prototype_db, schema_cmd: e.target.value } })} placeholder="makes the schema in the database its variable names, like: alembic upgrade head" /></label>
      </Group>
    </>,
  }
  return (
    <section className="panel" data-component="AppSettings">
      {groups[section]}
      <SaveRow dirty={dirty} busy={busy} error={error} onSave={save} />
    </section>
  )
}

/**
 * An app's skills for the steps of its workflow (Sandy, 2026-11-13: "a skill that can be used in sketch, or mockup
 * etc. This allows an app to have special context"). Each step takes any number of the skills the app's conversations
 * already get: its repo's own and the plugins' that are on for it. The agent doing that step is told to use them.
 * A skill saved for a step and no longer there is shown as missing, to remove.
 */
function StepSkills({ usable, value, onChange }: { usable: UsableSkill[] | null; value: Record<string, string[]>; onChange: (next: Record<string, string[]>) => void }) {
  const put = (key: string, names: string[]) => { const { [key]: _, ...rest } = value; onChange(names.length ? { ...rest, [key]: names } : rest) }
  return (
    <div className="settings-group" data-component="StepSkills">
      <h3 className="settings-h3">Skills by workflow step</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>What this app knows about doing a step: its design rules for a sketch or a mockup, its standard for a decision record. The agent doing the step is told to use the skills chosen for it. Choose from the skills in this app's repo (<span className="mono">.claude/skills/</span>), your own (<NavLink to="/settings/yours">All apps › Your skills</NavLink>) and the plugins on for it.</p>
      {usable === null ? <p className="muted">Loading…</p> : <>
        {!usable.length && <p className="settings-note" style={{ margin: '0 0 8px' }}><Badge>Nothing to choose yet</Badge><span>This app's conversations get no skills: none in its repo's <span className="mono">.claude/skills/</span>, none of your own (<NavLink to="/settings/yours">All apps › Your skills</NavLink>), and no plugin with skills on for it.</span></p>}
        <dl className="fields">
          {STEPS.filter((s) => s.key !== 'idea').map((s) => {
            const chosen = value[s.key] ?? []
            const rest = usable.filter((u) => !chosen.includes(u.name))
            return (
              <div key={s.key} style={{ display: 'contents' }}>
                <dt>{s.icon} {s.label}</dt>
                <dd style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {chosen.map((n) => {
                    const u = usable.find((x) => x.name === n)
                    return <span key={n} className={`badge ${u ? 'accent' : 'warn'}`} title={u ? `${u.description} (${u.from})` : 'This app\'s conversations no longer get this skill, so it is not used.'}>
                      {u?.label ?? n}{u ? '' : ' · missing'} <button type="button" className="linkish" aria-label={`Remove ${u?.label ?? n} from ${s.label}`} onClick={() => put(s.key, chosen.filter((x) => x !== n))}>✕</button>
                    </span>
                  })}
                  {rest.length > 0 && <select className="small" aria-label={`Add a skill to ${s.label}`} value="" onChange={(e) => { if (e.target.value) put(s.key, [...chosen, e.target.value]) }}>
                    <option value="">Add a skill…</option>
                    {rest.map((u) => <option key={u.name} value={u.name}>{u.label} ({u.from})</option>)}
                  </select>}
                  {!chosen.length && !rest.length && <span className="faint">None.</span>}
                </dd>
              </div>
            )
          })}
        </dl>
      </>}
    </div>
  )
}

/**
 * An app's own skill per job (Sandy, 2026-11-13: "it shouldn't be a plugin, it should have its own nav"). Every job
 * is listed, grouped by where it sits in the loop, so the page is never empty: a job with a skill filed follows All
 * apps unless this app picks another filed there, or none; a job with none filed says so, and what the engine does
 * there itself. Filing a skill under a job is done in All apps.
 */
function AppJobs({ jobs, value, onChange }: { jobs: AppJob[] | null; value: Record<string, string | null>; onChange: (next: Record<string, string | null>) => void }) {
  if (!jobs) return <p className="muted">Loading…</p>
  const groups = [...new Set(jobs.map((j) => j.group ?? ''))]
  const filed = jobs.filter((j) => j.skills.length).length
  return (
    <div data-component="AppJobs">
      <div className="settings-group">
        <h3 className="settings-h3">Skills by job</h3>
        <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>One skill does each job. Each follows All apps unless this app picks another skill filed under that job, or none. A skill is filed under a job in <NavLink to="/settings/skills">All apps › Skills by job</NavLink>.</p>
        {!filed && <p className="settings-note" style={{ margin: '0 0 8px' }}><Badge>Nothing to choose yet</Badge><span>No skill is filed under any job. Write or pull skills of your own (All apps › Your skills), or install a plugin that brings some (All apps › Plugins), and file them (All apps › Skills by job); then each job here can be chosen for this app.</span></p>}
      </div>
      {groups.map((g) => (
        <div className="settings-group" key={g}>
          {g && <h3 className="settings-h3">{g}</h3>}
          <dl className="fields">
            {jobs.filter((j) => (j.group ?? '') === g).map((j) => {
              const mine = j.key in value
              const named = (key: string | null) => j.skills.find((s) => s.key === key)?.name ?? 'none'
              const choose = (v: string) => { const { [j.key]: _, ...rest } = value; onChange(v === '' ? rest : { ...rest, [j.key]: v === '-' ? null : v }) }
              return (
                <div key={j.key} style={{ display: 'contents' }}>
                  <dt>{j.name}<div className="faint" style={{ fontSize: 13, fontWeight: 400 }}>{j.for}</div></dt>
                  <dd>
                    {j.skills.length
                      ? <><select aria-label={`Skill for ${j.name}`} value={!mine ? '' : value[j.key] ?? '-'} onChange={(e) => choose(e.target.value)}>
                          <option value="">As All apps ({named(j.factory)})</option>
                          {j.skills.map((s) => <option key={s.key} value={s.key}>{s.name} ({s.plugin})</option>)}
                          <option value="-">None for this app</option>
                        </select> {mine && <Badge tone="accent">override</Badge>}</>
                      : <span className="faint">No skill filed.</span>}
                    {j.builtIn && <div className="faint" style={{ fontSize: 13 }}>The engine itself: {j.builtIn}</div>}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}

/**
 * Which Claude account this app's agents run on: the engine's default, or the app's own. The app's own is the NAME of
 * an environment variable holding an API key (the key stays in the engine's environment), or a folder with its own
 * Claude login. Below, what the engine finds for what is saved: who the account is, or what is wrong.
 */
type AccountValue = NonNullable<AppSetup['account']>
function Account({ appId, value, saved, onChange }: { appId: string; value?: AccountValue; saved?: AccountValue; onChange: (v: AccountValue | undefined) => void }) {
  const [kind, setKind] = useState<'default' | 'key' | 'login'>(value?.key_env !== undefined ? 'key' : value?.config_dir !== undefined ? 'login' : 'default')
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const savedKey = JSON.stringify(saved ?? {})
  useEffect(() => { setStatus(null); engine.appAccount(appId).then(setStatus).catch(() => setStatus(null)) }, [appId, savedKey])
  const changed = JSON.stringify({ key_env: value?.key_env || undefined, config_dir: value?.config_dir || undefined }) !== JSON.stringify({ key_env: saved?.key_env, config_dir: saved?.config_dir })
  const choose = (k: typeof kind) => { setKind(k); onChange(k === 'key' ? { key_env: '' } : k === 'login' ? { config_dir: '' } : undefined) }
  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }} data-component="Account">
      <label>Claude account
        <select aria-label="Claude account" value={kind} onChange={(e) => choose(e.target.value as typeof kind)}>
          <option value="default">The engine's default</option>
          <option value="key">This app's own API key</option>
          <option value="login">This app's own Claude login</option>
        </select>
      </label>
      {kind === 'key' && <label>Key variable<input className="mono" aria-label="Key variable" value={value?.key_env ?? ''} onChange={(e) => onChange({ key_env: e.target.value })} placeholder="WORK_ANTHROPIC_KEY (its name; the key stays in the engine's environment)" /></label>}
      {kind === 'login' && <label>Login folder<input className="mono" aria-label="Login folder" value={value?.config_dir ?? ''} onChange={(e) => onChange({ config_dir: e.target.value })} placeholder="~/.claude-work" /></label>}
      {kind === 'login' && <div className="faint settings-desc">Log in there once, in a terminal: <span className="mono">CLAUDE_CONFIG_DIR={value?.config_dir?.trim() || '~/.claude-work'} claude auth login</span>. This app's conversations are then kept in that folder.</div>}
      {changed
        ? <div className="faint settings-desc">Save to check this account.</div>
        : status && <p className="settings-note" style={{ margin: 0 }}><Badge tone={status.ok ? 'ok' : 'bad'}>{status.ok ? 'In use' : 'Not usable'}</Badge><span>{status.note}{!status.ok && status.kind !== 'default' ? ' Until this is fixed, this app\'s agents won\'t start: they never fall back to the default.' : ''}</span></p>}
    </div>
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
/**
 * Reference apps: other apps whose code this one's agents may read and never change (a frontend and the backend it
 * talks to). Each stays its own app, with its own tasks and pull requests.
 */
function References({ app, others, value, onChange }: { app: App; others: App[]; value: AppReference[]; onChange: (v: AppReference[]) => void }) {
  return (
    <div className="settings-group" data-component="References">
      <h3 className="settings-h3">Reference apps</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>Other apps whose code {app.name}'s agents may read and never change: the backend a frontend talks to, or the other way round. Each keeps its own tasks and pull requests.</p>
      {others.length === 0
        ? <p className="faint settings-desc">No other apps yet. <Link to="/settings/new">Add the other repo as an app</Link>, then name it here.</p>
        : <ul className="references">
          {others.map((o) => {
            const mine = value.find((r) => r.appId === o.id)
            const here = !!o.repos?.[0]?.localPath
            return (
              <li key={o.id}>
                <label><input type="checkbox" checked={!!mine} onChange={(e) => onChange(e.target.checked ? [...value, { appId: o.id }] : value.filter((r) => r.appId !== o.id))} /> {o.name}</label>
                {mine && <input value={mine.note ?? ''} aria-label={`What ${o.name} is to ${app.name}`} placeholder="What it is to this app: the backend it calls"
                  onChange={(e) => onChange(value.map((r) => (r.appId === o.id ? (e.target.value ? { appId: o.id, note: e.target.value } : { appId: o.id }) : r)))} />}
                {mine && !here && <Badge tone="warn">no checkout set: nothing to read yet</Badge>}
              </li>
            )
          })}
        </ul>}
    </div>
  )
}

/** One of the app's repositories on the Repo page: saved (it has an id) or chosen and not saved yet. */
interface RepoRow { key: string; id?: string; fullName: string; localPath: string; baseBranch: string | null }
const rowOf = (r: { id: string; fullName: string; localPath: string | null; baseBranch: string | null }): RepoRow => ({ key: r.id, id: r.id, fullName: r.fullName, localPath: r.localPath ?? '', baseBranch: r.baseBranch })
/** Home is the one picked, or the first when that one has gone. */
const homeOf = (rows: RepoRow[], home: string | null) => (rows.some((r) => r.key === home) ? home : rows[0]?.key ?? null)

/**
 * The app's repositories (LOG.md, "The workbench"): one or several, chosen by folder. Choose folder… opens the folder
 * dialog on the engine's computer and lists the git repositories in the folder picked (itself, or the ones directly
 * inside); ticking one adds it with the GitHub name its origin remote gives. With more than one, one is home.
 */
function Repos({ appName, defaultBranch, rows, home, gh, onRows, onHome }: { appName: string; defaultBranch: string; rows: RepoRow[]; home: string | null; gh: GitHubRepos | null; onRows: (r: RepoRow[]) => void; onHome: (key: string) => void }) {
  const [folder, setFolder] = useState<Folder | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [byHand, setByHand] = useState({ fullName: '', localPath: '' })
  const choose = async () => {
    setBusy(true); setProblem(null)
    try { const f = await engine.chooseFolder(); if (f.path) setFolder(f) } catch (e) { setProblem(err(e)) } finally { setBusy(false) }
  }
  const label = (r: RepoRow) => r.fullName || r.localPath
  const add = (r: Omit<RepoRow, 'key'>) => onRows([...rows, { ...r, key: `new:${r.localPath || r.fullName}` }])
  return (
    <div className="settings-group" data-component="Repos">
      <h3 className="settings-h3">Repositories</h3>
      <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>The code {appName} is made of, each with its checkout on this machine. With more than one, a conversation gets a worktree in each and a change in several is a pull request in each; home is where an agent starts, and where Storybook, tests and prototypes run.</p>
      {rows.length === 0
        ? <p className="faint settings-desc">None yet. Choose the folder its code is in.</p>
        : <ul className="repos">
          {rows.map((r) => (
            <li key={r.key}>
              {rows.length > 1 && <label className="repo-home" title="Where an agent starts"><input type="radio" name="home-repo" aria-label={`Home: ${label(r)}`} checked={r.key === home} onChange={() => onHome(r.key)} /> Home</label>}
              <span className="repo-names">
                <span className="mono">{r.fullName || <span className="faint">no GitHub repo</span>}</span>
                <span className="mono faint">{r.localPath || 'no checkout on this machine'}</span>
              </span>
              {r.baseBranch && r.baseBranch !== defaultBranch && <span className="faint">from {r.baseBranch}</span>}
              {!r.id && <Badge tone="warn">not saved</Badge>}
              <button type="button" className="btn quiet small" aria-label={`Remove ${label(r)}`} title="The app stops using it; the folder is not touched" onClick={() => onRows(rows.filter((x) => x.key !== r.key))}>Remove</button>
            </li>
          ))}
        </ul>}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button type="button" className="btn quiet" disabled={busy} onClick={() => void choose()}>{busy ? 'Choosing…' : 'Choose folder…'}</button>
        <span className="faint settings-desc">Opens the folder dialog on this computer: pick the folder the repositories are in, or one repository.</span>
      </div>
      {problem && <div className="empty bad" style={{ marginTop: 8 }}>{problem}</div>}
      {folder && <div className="repos-found" data-component="FolderRepos">
        <div className="label-text">Repositories in <span className="mono">{folder.path}</span></div>
        {folder.repos.length === 0
          ? <p className="faint settings-desc">No git repository in <span className="mono">{folder.path}</span> or directly inside it. Choose another folder.</p>
          : <ul className="references">
            {folder.repos.map((f) => {
              const mine = rows.find((r) => r.localPath === f.path)
              return (
                <li key={f.path}>
                  <label><input type="checkbox" checked={!!mine} onChange={(e) => (e.target.checked
                    ? add({ fullName: f.fullName ?? '', localPath: f.path, baseBranch: f.branch && f.branch !== defaultBranch && rows.length > 0 ? f.branch : null })
                    : onRows(rows.filter((r) => r.key !== mine!.key)))} /> {f.name}</label>
                  <span className="mono faint">{f.fullName ?? 'no GitHub remote'}</span>
                  {f.branch && <span className="faint">{f.branch}</span>}
                </li>
              )
            })}
          </ul>}
      </div>}
      <details className="repos-by-hand">
        <summary className="faint">Add one by hand</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <RepoFields fullName={byHand.fullName} localPath={byHand.localPath} gh={gh} onChange={(p) => setByHand({ ...byHand, ...p })} />
        </div>
        <button type="button" className="btn quiet" disabled={!byHand.fullName.trim() && !byHand.localPath.trim()} onClick={() => { add({ fullName: byHand.fullName.trim(), localPath: byHand.localPath.trim(), baseBranch: null }); setByHand({ fullName: '', localPath: '' }) }}>Add</button>
      </details>
    </div>
  )
}

function clean(s: AppSetup): AppSetup {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))) as AppSetup
}
