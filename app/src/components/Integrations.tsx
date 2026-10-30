/**
 * Settings → Integrations, after Linear's and Vercel's integration settings: a list saying where each one stands, then
 * a page per integration. The page reads first (what it does, its values, where its key lives, a check of the
 * connection, what a workflow step can do with it) and turns into a form only on Edit. All apps sets the values; an
 * app overrides any field and inherits the rest. Keys are never typed here, only the name of the variable holding one.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { engine, type EffectiveValues, type Integration, type IntegrationStatus, type IntegrationValues } from '../engine'

const err = (e: any) => String(e?.message ?? e)

/** What a status says, in a word or two, and its tone. */
export function standing(i: Integration, s: IntegrationStatus | undefined): { label: string; tone: Tone } {
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
        ? 'What this app connects to. Each uses the values set under All apps unless this app overrides them.'
        : 'What Self Evident connects to, through each service\'s own API. Set once here; an app can override any value.'}</p>
      <ul className="integrations-list">
        {integrations.map((i) => {
          const st = standing(i, status[i.key])
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
        <dt>Storybook</dt><dd className="muted">Set per app: where its stories run.</dd>
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
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | 'busy' | null>(null)
  const st = standing(i, status)
  const keyField = i.fields.find((f) => f.secret)
  const keyVar = keyField ? values[keyField.key]?.value : null
  const runCheck = async () => {
    setCheck('busy')
    try { setCheck(await engine.checkIntegration(i.key, appId)) } catch (e) { setCheck({ ok: false, detail: err(e) }) }
  }
  return (
    <section className="panel" data-component="Integration">
      <Back base={base} />
      <div className="integration-head">
        <h2>{i.name}</h2>
        <Badge tone={st.tone} dot={st.tone === 'ok'}>{st.label}</Badge>
      </div>
      <p className="muted settings-lead">{i.does}</p>

      {editing
        ? <EditForm i={i} values={values} scope={scope} all={all} onCancel={() => setEditing(false)} onSave={async (v) => { await onSave(v); setEditing(false); setCheck(null) }} />
        : <div className="settings-group">
            <div className="integration-section-head"><h3 className="settings-h3">Values</h3><button className="btn quiet" onClick={() => setEditing(true)}>Edit</button></div>
            <dl className="fields">
              {i.fields.filter((f) => !f.secret).map((f) => (
                <div key={f.key} style={{ display: 'contents' }}>
                  <dt>{f.label}</dt>
                  <dd>{values[f.key]?.value ? <span className="mono">{values[f.key]!.value}</span> : <span className="faint">{f.required ? 'Not set' : '—'}</span>}
                    {scope === 'app' && values[f.key]?.from && <span className="faint"> · {values[f.key]!.from === 'app' ? 'this app' : 'from All apps'}</span>}</dd>
                </div>
              ))}
            </dl>
          </div>}

      {keyField && !editing && (
        <div className="settings-group">
          <h3 className="settings-h3">Key</h3>
          <p className="settings-desc">
            {keyVar
              ? <>Kept in <span className="mono">{keyVar}</span>{i.calls ? <> in the engine's environment{status?.state === 'no-key' ? <span className="warn-text">, where it isn't set yet. Add it and restart the engine.</span> : '.'}</> : <> in each app's <span className="mono">.env</span>.</>}</>
              : <>No variable named yet. Edit to name the one that will hold the key; the key itself never goes in Settings.</>}
            {i.docs && <> <a href={i.docs} target="_blank" rel="noreferrer">Make a key ↗</a></>}
          </p>
          {i.calls && (
            <div className="integration-check">
              <button className="btn quiet" disabled={check === 'busy' || status?.state === 'off'} onClick={runCheck}>{check === 'busy' ? 'Checking…' : 'Check the connection'}</button>
              {check && check !== 'busy' && <span className={check.ok ? 'ok-text' : 'bad'}>{check.ok ? '✓ ' : ''}{check.detail}</span>}
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div className="settings-group">
          <h3 className="settings-h3">In a workflow</h3>
          {i.actions.length
            ? <>
                <p className="faint settings-desc" style={{ margin: '0 0 6px' }}>What an integration step can do with {i.name}, placed between a workflow's steps. Each asks before it sends anything out, and running it again updates what it made.</p>
                <ul className="list">{i.actions.map((a) => <li key={a.key}><strong>{a.name}</strong><div className="muted settings-desc">{a.does}</div></li>)}</ul>
                <p className="faint settings-desc">Integration steps arrive in workflow rules next.</p>
              </>
            : <p className="faint settings-desc">Nothing: {i.name} is read by each app{i.role === 'Telemetry' ? ' to report what happens' : ''}, not used as a step.</p>}
        </div>
      )}
    </section>
  )
}

/** The form, only once asked for. An app's empty field shows the inherited value and keeps it. */
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
      {scope === 'app' && <p className="faint settings-desc" style={{ margin: '0 0 8px' }}>An empty field uses All apps' value, shown in italics.</p>}
      <div className="form-grid">
        {i.fields.map((f) => {
          const inherited = scope === 'app' && values[f.key]?.from === 'workspace' ? values[f.key]!.value : null
          return (
            <label key={f.key}>{f.label}{f.required && <span className="faint"> · required</span>}
              <input className="mono" value={v[f.key] ?? ''} placeholder={inherited ?? f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
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
