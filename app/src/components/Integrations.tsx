/**
 * Settings → Integrations, after Linear's and Vercel's integration settings: a list saying where each one stands, then
 * a page per integration. The page reads first (what it does, its values, where its key lives, a check of the
 * connection, what a workflow step can do with it) and turns into a form only on Edit. All apps sets the values; an
 * app overrides any field and inherits the rest. Keys are never typed here, only the name of the variable holding one.
 *
 * A per-app integration (tkt, the runner) has a switch instead of values: on for an app, it runs that app's tasks.
 * Its check runs by itself when the page opens, says in the tool's own words what is wrong, and leaves fixing it
 * outside Self Evident; the tracker guide is the one thing Self Evident hands over, the file the skills read to
 * find the app here.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { engine, type EffectiveValues, type Integration, type IntegrationStatus, type IntegrationValues } from '../engine'

const err = (e: any) => String(e?.message ?? e)
/** Backticks in a sentence as code. */
const inline = (s: string) => s.split('`').map((part, n) => (n % 2 ? <span key={n} className="mono">{part}</span> : part))

/** What a status says, in a word or two, and its tone. */
export function standing(i: Integration, s: IntegrationStatus | undefined): { label: string; tone: Tone } {
  if (i.fields.some((f) => f.kind === 'switch')) return s?.state === 'ready' ? { label: 'On', tone: 'ok' } : { label: 'Off', tone: 'neutral' }
  switch (s?.state) {
    case 'ready': return { label: i.calls ? 'Connected' : 'Set', tone: 'ok' }
    case 'no-key': return { label: 'Key missing', tone: 'warn' }
    case 'incomplete': return { label: `Missing ${s.missing.join(', ').toLowerCase()}`, tone: 'warn' }
    default: return { label: 'Not set up', tone: 'neutral' }
  }
}

interface Props {
  base: string // this list's address; an integration's page is base/key
  item?: string
  integrations: Integration[]
  values: EffectiveValues
  status: Record<string, IntegrationStatus>
  scope: 'workspace' | 'app'
  appId?: string
  onSave: (values: IntegrationValues) => Promise<void>
}

export function Integrations({ base, item, integrations, values, status, scope, appId, onSave }: Props) {
  if (!item) return (
    <section className="panel" data-component="Integrations">
      <h2>Integrations</h2>
      <p className="muted settings-lead">{scope === 'app'
        ? 'What this app connects to, and who runs its tasks. Each uses the values set under All apps unless this app overrides them.'
        : 'What Self Evident connects to, through each service\'s own API. Set once here; an app can override any value. A runner is switched on per app.'}</p>
      <ul className="integrations-list">
        {integrations.map((i) => {
          const st = i.perApp && scope === 'workspace' ? { label: 'Per app', tone: 'neutral' as Tone } : standing(i, status[i.key])
          return (
            <li key={i.key}>
              <Link to={`${base}/${i.key}`} className="integration-row">
                <span><strong>{i.name}</strong> <span className="faint">· {i.role}</span><span className="muted settings-desc integration-does">{i.does}</span></span>
                <Badge tone={st.tone} dot={st.tone === 'ok'}>{st.label}</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
      <dl className="fields" style={{ marginTop: 18 }}>
        <dt>Claude Code</dt><dd className="muted">The agents. Development runs on the operator's login; the product on an API key.</dd>
        <dt>GitHub</dt><dd className="muted">Set per app under Repo: its repo, where PRs live.</dd>
      </dl>
    </section>
  )
  const i = integrations.find((x) => x.key === item)
  if (!i) return <section className="panel"><Back base={base} /><div className="empty">No integration called {item}.</div></section>
  return <Page key={i.key} i={i} base={base} values={values[i.key] ?? {}} status={status[i.key]} scope={scope} appId={appId} all={values} onSave={onSave} />
}

function Back({ base }: { base: string }) {
  return <Link to={base} className="faint integration-back">← Integrations</Link>
}

function Page({ i, base, values, status, scope, appId, all, onSave }: { i: Integration; base: string; values: EffectiveValues[string]; status?: IntegrationStatus; scope: 'workspace' | 'app'; appId?: string; all: EffectiveValues; onSave: Props['onSave'] }) {
  const [editing, setEditing] = useState(false)
  const [check, setCheck] = useState<{ ok: boolean; detail: string; links?: { label: string; href: string }[] } | 'busy' | null>(null)
  const [acted, setActed] = useState<string | null>(null)
  const st = standing(i, status)
  const keyField = i.fields.find((f) => f.secret)
  const keyVar = keyField ? values[keyField.key]?.value : null
  const switched = i.fields.some((f) => f.kind === 'switch')
  const perAppHere = !!i.perApp && scope === 'app'
  const on = status?.state === 'ready'
  const buttons = perAppHere && i.actions.some((a) => a.kind) // actions that do something from here, for this app
  const runCheck = async () => {
    setCheck('busy')
    try { setCheck(await engine.checkIntegration(i.key, appId)) } catch (e) { setCheck({ ok: false, detail: err(e) }) }
  }
  // A per-app check runs by itself: the page says whether it works without being asked.
  useEffect(() => { if (perAppHere && on) void runCheck() }, [i.key, perAppHere, on, appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (a: Integration['actions'][number]) => {
    if (!appId) return
    setActed('busy')
    try {
      if (a.kind === 'start') { await engine.startStorybook(appId); setActed('Starting; the check runs again in a moment.'); window.setTimeout(() => void runCheck(), 4000) }
      else if (a.kind === 'ask') { // the engine does its part, then hands the rest to the agent
        const r = await engine.setupIntegration(i.key, appId)
        setActed([...r.did, r.done ? `All set: ${r.detail}` : r.ask ? 'The rest is with the agent: its conversation is open beside this.' : r.detail].join(' '))
        if (r.done || r.did.length) void runCheck()
      }
    } catch (e) { setActed(err(e)) }
  }
  const linkOf = (a: Integration['actions'][number]) => (check && check !== 'busy' ? check.links?.find((l) => l.label === a.name) : undefined)
  const setup = i.actions.find((a) => a.kind === 'ask') // one button under the check, when it fails
  const shown = buttons ? i.actions.filter((a) => a.kind !== 'ask') : i.actions
  const actions = (
    <div className="settings-group">
      <h3 className="settings-h3">{i.role === 'Runner' ? 'On a ticket' : buttons || i.actions.some((a) => a.kind) ? 'From here' : 'In a workflow'}</h3>
      {i.actions.length
        ? <>
            <p className="faint settings-desc" style={{ margin: '0 0 6px' }}>{i.role === 'Runner'
              ? <>What {i.name} does with a ticket whose brief is approved, each a command in a herdr tab today; the same as buttons on the ticket page comes next.</>
              : i.actions.some((a) => a.kind) ? <>What can be done with {i.name} for {scope === 'app' ? 'this app' : 'an app'}{scope === 'app' ? '' : ', from its own Integrations page'}.</>
              : <>What an integration step can do with {i.name}, placed between a workflow's steps. Each asks before it sends anything out, and running it again updates what it made.</>}</p>
            <ul className="list">{shown.map((a) => {
              const link = linkOf(a)
              return (
                <li key={a.key}>
                  {buttons && a.kind === 'start'
                    ? <button className="btn quiet" disabled={acted === 'busy' || !on} onClick={() => act(a)}>{a.name}</button>
                    : buttons && a.kind === 'link'
                      ? link ? <a className="btn quiet" href={link.href} target="_blank" rel="noreferrer">{a.name} ↗</a> : <strong className="faint">{a.name}</strong>
                      : <strong>{a.name}</strong>}
                  <div className="muted settings-desc">{inline(a.does)}</div>
                </li>
              )
            })}</ul>
            {i.role !== 'Runner' && !i.actions.some((a) => a.kind) && <p className="faint settings-desc">Integration steps arrive in workflow rules next.</p>}
          </>
        : <p className="faint settings-desc">Nothing: {i.name} is read by each app{i.role === 'Telemetry' ? ' to report what happens' : ''}, not used as a step.</p>}
    </div>
  )
  if (i.perApp && scope === 'workspace') return ( // nothing to set for all apps: each app switches it on, or sets its own values
    <section className="panel" data-component="Integration">
      <Back base={base} />
      <div className="integration-head"><h2>{i.name}</h2><Badge>Per app</Badge></div>
      <p className="muted settings-lead">{i.does}</p>
      <p className="settings-desc">{switched
        ? <>Switched on under an app's Integrations.{i.fields.some((f) => f.kind !== 'switch') && <> Its {i.fields.filter((f) => f.kind !== 'switch').map((f) => f.label.toLowerCase()).join(' and ')} have defaults read from the app's repo; set them there only when the defaults are wrong.</>}</>
        : <>Set under each app's Integrations: {i.fields.map((f) => f.label.toLowerCase()).join(' and ')}. The check reads the app's repo.</>} Installed and kept working outside Self Evident{i.docs && <>: <a href={i.docs} target="_blank" rel="noreferrer">{i.key === 'storybook' ? 'the screen map add-on' : `about ${i.name}`} ↗</a></>}.</p>
      {actions}
    </section>
  )
  return (
    <section className="panel" data-component="Integration">
      <Back base={base} />
      <div className="integration-head">
        <h2>{i.name}</h2>
        <Badge tone={st.tone} dot={st.tone === 'ok'}>{st.label}</Badge>
      </div>
      <p className="muted settings-lead">{i.does}</p>

      {editing
        ? <EditForm i={i} values={values} scope={scope} all={all} onCancel={() => setEditing(false)} onSave={async (v) => { const turnedOn = perAppHere && switched && !on && v[i.key]?.on === 'true'; await onSave(v); setEditing(false); setCheck(null); if (turnedOn && setup) void act(setup) }} /> // switching on is the set-up (Sandy, 2026-11-09: "add it and it works")
        : <div className="settings-group">
            <div className="integration-section-head"><h3 className="settings-h3">{i.perApp ? 'For this app' : 'Values'}</h3><button className="btn quiet" onClick={() => setEditing(true)}>Edit</button></div>
            <dl className="fields">
              {i.fields.filter((f) => !f.secret).map((f) => (
                <div key={f.key} style={{ display: 'contents' }}>
                  <dt>{f.label}</dt>
                  <dd>{f.kind === 'switch'
                    ? <><Badge tone={on ? 'ok' : 'neutral'} dot={on}>{on ? 'On' : 'Off'}</Badge><span className="faint"> · {on ? f.states?.on ?? 'on' : f.states?.off ?? 'off'}.</span></>
                    : <>{values[f.key]?.value ? <span className="mono">{values[f.key]!.value}</span> : <span className="faint">{f.required ? 'Not set' : f.placeholder?.startsWith('default:') ? f.placeholder : '—'}</span>}
                      {scope === 'app' && !i.perApp && values[f.key]?.from && <span className="faint"> · {values[f.key]!.from === 'app' ? 'this app' : 'from All apps'}</span>}</>}</dd>
                </div>
              ))}
            </dl>
          </div>}

      {!editing && (keyField || i.calls) && (
        <div className="settings-group">
          <h3 className="settings-h3">{keyField ? 'Key' : 'The check'}</h3>
          {keyField && (
            <p className="settings-desc">
              {keyVar
                ? <>Kept in <span className="mono">{keyVar}</span>{i.calls ? <> in the engine's environment{status?.state === 'no-key' ? <span className="warn-text">, where it isn't set yet. Add it and restart the engine.</span> : '.'}</> : <> in each app's <span className="mono">.env</span>.</>}</>
                : <>No variable named yet. Edit to name the one that will hold the key; the key itself never goes in Settings.</>}
              {i.docs && <> <a href={i.docs} target="_blank" rel="noreferrer">Make a key ↗</a></>}
            </p>
          )}
          {!keyField && i.perApp && (
            <p className="settings-desc">
              {!on ? <>Nothing to check while it is off. </>
                : i.key === 'tkt' ? <>Whether {i.name} can run this app's tickets from here: the runner on the engine's PATH, a local checkout with the tracker guide pointing at this app, and its own doctor passing there. </>
                : <>Whether this app's Storybook meets the standard: Storybook 10 in the checkout, the screen map add-on installed and wired, its stylesheet imported, the flow files kept out of the story tests, and a map; then whether it is answering at the URL. </>}
              Installed and kept working outside Self Evident{i.docs && <>: <a href={i.docs} target="_blank" rel="noreferrer">{i.key === 'storybook' ? 'the screen map add-on' : `about ${i.name}`} ↗</a></>}.
            </p>
          )}
          {i.calls && (
            <div className="integration-check">
              <button className="btn quiet" disabled={check === 'busy' || status?.state === 'off'} onClick={runCheck}>{check === 'busy' ? 'Checking…' : i.perApp ? 'Check again' : 'Check the connection'}</button>
              {check && check !== 'busy' && <span className={check.ok ? 'ok-text' : 'bad'}>{check.ok ? '✓ ' : ''}{check.detail}</span>}
            </div>
          )}
          {perAppHere && setup && check && check !== 'busy' && !check.ok && (
            <div className="integration-setup" data-component="SetUp">
              <button className="btn" disabled={acted === 'busy'} onClick={() => act(setup)}>{acted === 'busy' ? 'Setting up…' : setup.name}</button>
              <span className="muted settings-desc">{inline(setup.does)}</span>
            </div>
          )}
          {buttons && acted && acted !== 'busy' && <p className="settings-desc" data-component="ActionNote">{acted}</p>}
        </div>
      )}

      {!editing && i.key === 'tkt' && scope === 'app' && appId && <TrackerGuide appId={appId} name={i.name} />}

      {!editing && actions}
    </section>
  )
}

/** The repo's docs/agents/issue-tracker.md for this app, filled in by the engine: Self Evident's half of the handshake with tkt's skills. */
function TrackerGuide({ appId, name }: { appId: string; name: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { let gone = false; engine.trackerGuide(appId).then((t) => { if (!gone) setText(t) }).catch((e) => { if (!gone) setError(err(e)) }); return () => { gone = true } }, [appId])
  const copy = async () => {
    try { await navigator.clipboard.writeText(text!); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch (e) { setError(err(e)) }
  }
  return (
    <div className="settings-group" data-component="TrackerGuide">
      <div className="integration-section-head"><h3 className="settings-h3">The tracker guide</h3>{text && <button className="btn quiet" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>}</div>
      <p className="faint settings-desc" style={{ margin: '0 0 6px' }}>
        How {name}'s skills find this app here. Set up what's missing writes it into the repo as <span className="mono">docs/agents/issue-tracker.md</span>, with the rest of the lifecycle configuration (the forge, the workflow, the domain docs, the pull request template, the block in CLAUDE.md); this is the copy to paste when you would rather do it by hand. Everything about {name} itself stays outside Self Evident.
      </p>
      {error ? <div className="bad">{error}</div> : text ? <details><summary className="faint">Show the file</summary><pre className="guide">{text}</pre></details> : <p className="muted" style={{ margin: 0 }}>Loading…</p>}
    </div>
  )
}

/** The form, only once asked for. An app's empty field shows the inherited value and keeps it. A switch is on or off. */
function EditForm({ i, values, scope, all, onCancel, onSave }: { i: Integration; values: EffectiveValues[string]; scope: 'workspace' | 'app'; all: EffectiveValues; onCancel: () => void; onSave: (v: IntegrationValues) => Promise<void> }) {
  const own = (v: EffectiveValues[string] = {}) => Object.fromEntries(Object.entries(v).filter(([, x]) => x.value && (scope === 'workspace' || x.from === 'app')).map(([k, x]) => [k, x.value!]))
  const [v, setV] = useState<Record<string, string>>(own(values))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setError(null)
    // Every integration's own values go back together, so saving one leaves the others as they were.
    const rest = Object.fromEntries(Object.keys(all).filter((k) => k !== i.key).map((k) => [k, own(all[k])]))
    try { await onSave({ ...rest, [i.key]: v }) } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  return (
    <div className="settings-group">
      <h3 className="settings-h3">Edit {i.name}</h3>
      {scope === 'app' && !i.perApp && <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>An empty field uses All apps' value, shown in italics.</p>}
      <div className="form-grid">
        {i.fields.map((f) => {
          const inherited = scope === 'app' && values[f.key]?.from === 'workspace' ? values[f.key]!.value : null
          return (
            <label key={f.key}>{f.label}{f.required && f.kind !== 'switch' && <span className="faint"> · required</span>}
              {f.kind === 'switch'
                ? <select value={v[f.key] === 'true' ? 'true' : 'false'} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                    <option value="true">On: {f.states?.on ?? `${i.name} is on for this app`}</option>
                    <option value="false">Off: {f.states?.off ?? `no ${i.name} for this app`}</option>
                  </select>
                : <input className="mono" value={v[f.key] ?? ''} placeholder={inherited ?? f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
            </label>
          )
        })}
      </div>
      <div className="settings-save">
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn quiet" disabled={busy} onClick={onCancel}>Cancel</button>
        {error && <span className="bad">{error}</span>}
      </div>
    </div>
  )
}
