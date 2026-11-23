/**
 * Settings › the app › Mocks (engine/src/mocks.ts): the outside services the app connects to. Each is laid out top
 * to bottom as it is set up (Sandy, 2026-11-22): what it is and how the app reaches it; what each place is given by
 * default, the real service or the mock; then its endpoints, each with its own data. Its server's provenance, its
 * real responses and its history are folded away below. With a task (its Data step) the page starts from the
 * services the task calls, where each of these can be overridden for the task alone.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import { EndpointDataCell } from './EndpointData'
import { Fixtures } from './Fixtures'
import { Sources } from './MockPlaces'
import { TaskCalls } from './TaskCalls'
import { TestFiles } from './TestFiles'
import { engine, type Mock, type MockChange, type MockData, type MockEndpoint, type MockPlacesRow, type MockReal } from '../engine'

const STATUS: Record<Mock['status'], { label: string; tone: Tone }> = {
  mined: { label: 'From a real response', tone: 'ok' },
  assumed: { label: 'Assumed shape', tone: 'warn' },
  needs_recording: { label: 'Needs a real response', tone: 'bad' },
}
const KIND: Record<MockData['kind'], { label: string; tone: Tone }> = {
  real: { label: 'Real · this computer only', tone: 'warn' },
  faked: { label: 'Faked', tone: 'ok' },
  invented: { label: 'Invented', tone: 'neutral' },
}
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }

export function MockLibrary({ appId, issueId, needs }: { /** On a task: what its agent wrote of what the task calls and where that stands, shown at the top of the services. */ needs?: ReactNode; appId: string; /** On a task's Data step: its own table, and what it adds is the task's. None: the app's settings. */ issueId?: string }) {
  const [list, setList] = useState<Mock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [places, setPlaces] = useState<MockPlacesRow[]>([])
  const [tick, setTick] = useState(0) // what the task calls is read again when a mock or its data changes
  const reload = () => Promise.all([engine.mocks(appId, issueId), engine.mockPlaces(appId, issueId).catch(() => [] as MockPlacesRow[])]).then(([l, p]) => { setList(l); setPlaces(p); setError(null) }).catch((e) => setError(err(e)))
  useEffect(() => { setList(null); void reload() }, [appId, issueId]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); setTick((t) => t + 1) } catch (e) { setError(err(e)) } }
  // While an agent is building a mock, the page is read again every few seconds, so it shows the mock the moment it is saved
  // and never a state that is already gone. What it shows is compared first: nothing is redrawn while nothing has changed.
  const building = !!list?.some((m) => m.needs?.recorded)
  useEffect(() => {
    if (!building) return
    const t = setInterval(() => { void engine.mocks(appId, issueId).then((l) => setList((was) => { if (JSON.stringify(was) === JSON.stringify(l)) return was; setTick((x) => x + 1); return l })).catch(() => {}) }, 4000)
    return () => clearInterval(t)
  }, [building, appId, issueId])
  const intro = (
    <p className={issueId ? 'lv-section-note' : 'faint settings-desc'} style={issueId ? { maxWidth: 760 } : { margin: '6px 0 12px', maxWidth: 760 }}>
        {issueId ? 'What stands outside the app is mocked, so this task can be tried without calling it. The app\'s own code is what goes live: only an environment variable points it at the mock. Everything here starts as the app has it in Settings, and can be overridden for this task alone.'
          : 'The outside services this app connects to. Each says how the app reaches it, what a prototype, a smoke test and a reviewer are given by default (the real service or its mock), and its endpoints, each with the data its mock answers with. A task picks its services from these and may override any of it for itself.'}{' '}
        A real response stays on this computer. A reviewer only ever gets faked data, or a file stated to hold nothing real.
      </p>
  )
  return (
    // On a task the step's panel is the box: this is not boxed again inside it.
    <section className={issueId ? 'lv-root' : 'panel lv-root'} data-component="MockLibrary">
      {/* On a task the step is already headed Data: it is not said again here. */}
      {!issueId && (
        <div className="task-block-head">
          <h2 style={{ margin: 0 }}>Mocks</h2>
          <button className="btn quiet small" onClick={() => setAdding(!adding)}>Add a service</button>
        </div>
      )}
      {/* The fixtures come first: the app's own database, and the files a tester brings. Then the services outside it, with what they are said at the top of that section. */}
      {list !== null && <Fixtures appId={appId} issueId={issueId} version={tick} onChanged={() => reload()} files={<TestFiles appId={appId} issueId={issueId} />} />}
      {issueId && <TaskCalls appId={appId} issueId={issueId} mocks={list ?? []} places={places} version={tick} onChanged={() => reload()} intro={intro} needs={needs && <details className="lv-item" data-component="WhatTheTaskNeeds"><summary className="lv-item-head"><span className="lv-item-name">What the task needs</span><span className="lv-item-meta lv-end">The agent's report</span></summary><div className="lv-part">{needs}</div></details>} />}
      {!issueId && <h3 className="mock-h3">The app's services</h3>}
      {!issueId && intro}
      {adding && !issueId && <AddAppService onAdd={(b) => act(async () => { await engine.raiseMock(appId, b); setAdding(false) })} onCancel={() => setAdding(false)} />}
      {error && <div className="empty bad" style={{ marginBottom: 12 }}>{error}</div>}
      {/* On a task the services above are the whole of it: nothing is shown twice. What a service is beyond its endpoints (its address, its real responses, its history) is in the app's settings. */}
      {/* Not built (LOG.md, 2026-11-23): a place is held for it so the Data step shows the whole of what it will be. */}
      {issueId && <div className="lv-section" data-component="DataScripts">
        <div className="lv-section-head"><h3>Data scripts</h3><span className="lv-end"><Badge tone="neutral">Coming soon</Badge></span></div>
        <p className="lv-section-note">Custom logic for a test, where mapping fields is not enough: a script that stands in for one function of the app.</p>
      </div>}
      {issueId ? <p className="lv-sub" style={{ margin: '14px 0 0' }}>A service's real responses on this computer and its history are in Settings › Mocks.</p>
        : list === null ? (error ? null : <p className="muted">Loading…</p>)
        : !list.length ? <div className="empty">No services yet. Add one here, or a task's agent adds it when it finds the code calling one.</div>
        : <div className="mock-list">{list.map((m) => <MockCard key={m.key} appId={appId} mock={m} places={places.find((p) => p.mock === m.key) ?? null} act={act} />)}</div>}
    </section>
  )
}

function MockCard({ appId, issueId, mock: m, places, act }: { appId: string; issueId?: string; mock: Mock; places: MockPlacesRow | null; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [live, setLive] = useState(false)
  // How it is served says more than whether anything was "built": a service with endpoints is served as it is.
  const s: { label: string; tone: Tone } = m.served === 'none' ? { label: 'No endpoints yet', tone: 'warn' } : m.served === 'general' ? (m.pointed ? { label: 'Served from its endpoints', tone: 'ok' } : { label: 'Cannot be pointed at yet', tone: 'warn' }) : STATUS[m.status]
  const withData = m.endpoints.filter((e) => e.data.app).length
  const canRecord = !!(m.issue && m.upstream && Object.keys(m.env).length)
  return (
    <article className="card mock-card" data-component="MockCard">
      {/* Its base settings, like a profile: the name first, then each setting on its own line. */}
      <div className="service-profile" data-component="ServiceProfile">
        <div className="service-profile-head">
          <h3>{m.name}</h3>
          <Badge tone={s.tone} dot>{s.label}</Badge>
          {!editing && <button className="btn quiet small" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing ? <EditMock mock={m} onSave={(b) => act(async () => { await engine.updateMock(appId, m.key, b); setEditing(false) })} onCancel={() => setEditing(false)} /> : (
          <dl data-component="MockConnection">
            <dt>What it is</dt><dd>{m.standsInFor || <span className="faint">Not said yet</span>}</dd>
            <dt>Real address</dt><dd>{m.connection.address ? <code>{m.connection.address}</code> : <span className="faint">Not set: needed only to record a live run</span>}</dd>
            <dt>Variable to override</dt><dd>{m.connection.addressSetting ? <><code>{m.connection.addressSetting}</code> <span className="faint">set to the mock's address when the mock is used</span></> : <span className="faint">Not set: an agent fills it in from the code when it builds the mock</span>}</dd>
            <dt>Variable for its key</dt><dd>{m.connection.keySetting ? <><code>{m.connection.keySetting}</code> <span className="faint">given a made-up key under a mock</span></> : <span className="faint">None</span>}</dd>
            <dt>Its mock</dt><dd>
              {m.served === 'none' ? <>Add an endpoint below and it can be served. Nothing has to be built.</>
                : m.served === 'general' ? <>Served straight from its endpoints: each call is answered with that endpoint's data. {withData} of {m.endpoints.length} {m.endpoints.length === 1 ? 'has' : 'have'} data.{!m.pointed && <> The app cannot be pointed at it until the variable to override is set.</>}</>
                : m.status === 'mined' ? <>Served by a server written for it, from a real response recorded {day(m.recordedAt) ?? 'on a date not kept'}{m.issue ? <> for <Link to={`/tasks/${m.issue.id}`}>{m.issue.identifier}</Link></> : null}, built {day(m.minedAt)}.</>
                : <>Served by a server written for it from a guess, before any real response. It shows only that the code handles the guess.</>}
              {m.usedBy.length > 0 && <> In use: {m.usedBy.join(', ')}.</>}
            </dd>
          </dl>
        )}
      </div>

      {m.needs && (
        <div className="mock-needs">
          <strong>{m.needs.recorded ? 'A real response is in' : m.status === 'needs_recording' ? 'Needs a real response' : 'Out of date: needs a new real response'}</strong>{m.needs.why ? <>: {m.needs.why}</> : null}
          <ul>
            {m.needs.person && <li>A real call needs {m.needs.person}.</li>}
            {m.needs.key && <li>The key: <code>{m.needs.key}</code>.</li>}
            {m.needs.cost && <li>It costs {m.needs.cost}.</li>}
          </ul>
          {m.needs.recorded ? <div className="row"><span>The task's agent is {m.served === 'written' ? 'building the mock from it' : 'making its faked version'}: its conversation shows how far it is.</span><button className="btn quiet small" title="If the agent did not start, or stopped" onClick={() => act(() => engine.mineMock(appId, m.key))}>Ask again</button></div>
            : !m.issue ? <p className="faint" style={{ margin: 0 }}>It has no task yet, so there is no agent to mine it. A task's agent raises a mock when its change needs one.</p>
            : <>
              {m.endpoints.length
                ? <p style={{ margin: '8px 0' }}>A real response is given on the endpoint it answers, below.</p>
                : <GiveFiles what={m.needs.file} onGive={(files) => act(() => engine.giveRecording(appId, m.key, files))} />}
              {canRecord ? (live
                ? <div className="row"><span>This calls {m.name} for real{m.needs.cost ? `, ${m.needs.cost}` : ''}, and the engine keeps what it sends.</span>
                    <button className="btn small" onClick={() => act(async () => { await engine.startLiveSmoke(m.issue!.id, [m.key]); setLive(false) })}>Start the live run</button>
                    <button className="btn quiet small" onClick={() => setLive(false)}>Cancel</button></div>
                : <div className="row"><span className="faint">Or record the whole exchange:</span><button className="btn quiet small" onClick={() => setLive(true)}>Record it: a live smoke run of {m.issue.identifier}</button></div>)
                : <p className="faint" style={{ margin: 0 }}>To record it live instead, give it {[!m.upstream && 'its real address', !m.connection.addressSetting && 'the environment variable to override'].filter(Boolean).join(' and ')} (Edit).</p>}
            </>}
        </div>
      )}
      {m.unmined && !m.needs?.recorded && ( // one the agent was already asked about says so above, once
        <div className="row">
          <span>A newer real response, from {day(m.unmined.at)}, has not been used yet.</span>
          <button className="btn small" onClick={() => act(() => engine.mineMock(appId, m.key))}>Ask the task's agent to use it</button>
        </div>
      )}

      {places && !issueId && (
        <div className="mock-data" data-component="MockSources">
          <strong>Source</strong> <span className="faint">what each place is given, unless a task says otherwise</span>
          <div style={{ marginTop: 6 }}><Sources appId={appId} row={places} onChanged={() => act(async () => {})} /></div>
        </div>
      )}
      <Endpoints appId={appId} mock={m} act={act} />
      {!m.needs && canRecord && (live
        ? <div className="row"><span>This calls {m.name} for real, and the engine keeps what it sends{m.endpoints.some((e) => e.sensitive) ? ' (what a sensitive call sends is faked at once and not kept)' : ''}.</span>
            <button className="btn small" onClick={() => act(async () => { await engine.startLiveSmoke(m.issue!.id, [m.key]); setLive(false) })}>Start the live run</button>
            <button className="btn quiet small" onClick={() => setLive(false)}>Cancel</button></div>
        : <div className="row"><button className="btn quiet small" aria-label={`Record real responses of ${m.name}`} onClick={() => setLive(true)}>Record real responses: a live smoke run of {m.issue!.identifier}</button></div>)}
      {!m.endpoints.length && m.data.length > 0 && <DataSets appId={appId} issueId={issueId} mock={m} act={act} />}

      {m.served === 'written' && (
        <details className="mock-provenance">
          <summary>Provenance</summary>
          <Md text={m.note.replace(/^# .*\n+/, '')} />
          {m.files.length > 0 && <p className="faint" style={{ fontSize: 13 }}>Files: {m.files.map((f) => `${f.path} (${size(f.bytes)})`).join(', ')}. Run with <code>{m.cmd}</code>.</p>}
        </details>
      )}
      <RealResponses appId={appId} mock={m} act={act} />
      <History appId={appId} mockKey={m.key} />
      {removing && <RemoveMock appId={appId} mock={m} onRemove={(files) => act(async () => { await engine.removeMock(appId, m.key, files); setRemoving(false) })} onCancel={() => setRemoving(false)} />}
      <div className="row">
        {m.served !== 'none' && <a className="btn quiet small" href={engine.mockExportUrl(appId, m.key)} download>Export</a>}
        {!removing && <button className="btn quiet small" aria-label="Remove the mock" onClick={() => setRemoving(true)}>Remove</button>}
      </div>
    </article>
  )
}

/** Real responses the person already has: kept with the task, never in a repository, and mined into invented data. */
function GiveFiles({ what, onGive }: { what?: string; onGive: (files: File[]) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  return (
    <div className="mock-give">
      <span>Have a real response already? {what ? <>For example {what}. </> : null}Give it: it stays on this computer with the task, and the task's agent builds the mock and a fake of it.</span>
      <div className="row">
        <input type="file" multiple aria-label="Responses you already have" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        <button className="btn small" disabled={!files.length || busy} onClick={async () => { setBusy(true); try { await onGive(files) } finally { setBusy(false) } }}>{busy ? 'Giving…' : 'Give it'}</button>
      </div>
    </div>
  )
}

/** The service's endpoints: each call the app makes to it, with the data its mock answers that call with. One can be added, changed, marked sensitive and removed. */
function Endpoints({ appId, mock: m, act }: { appId: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const withData = m.endpoints.filter((e) => e.data.app).length
  return (
    <div className="mock-data" data-component="MockEndpoints">
      <div className="task-block-head">
        <span><strong>Endpoints</strong> {m.endpoints.length > 0 && <span className="faint">{m.endpoints.length} call{m.endpoints.length === 1 ? '' : 's'}: {withData} with data, {m.endpoints.length - withData} {m.served === 'written' ? 'answered with what the server makes up' : 'with none yet'}</span>}</span>
        <button className="btn quiet small" aria-label={`Add an endpoint to ${m.name}`} onClick={() => setAdding(!adding)}>Add an endpoint</button>
      </div>
      {adding && <EndpointForm label="Add" others={m.endpoints} onSave={(b) => act(async () => { await engine.addMockEndpoint(appId, m.key, b); setAdding(false) })} onCancel={() => setAdding(false)} />}
      {!m.endpoints.length ? !adding && <p className="faint" style={{ margin: '4px 0 0' }}>None listed yet. An endpoint is one call the app makes to {m.name}: add each here, or a task's agent lists them from the code. With one endpoint and its data, the mock can be used.</p> : (
        <div className="mock-endpoints" role="table">
          <div className="mock-endpoints-head" role="row"><span role="columnheader">The call</span><span role="columnheader">Its data</span></div>
          {/* A second step sits under the endpoint whose answer gives its link. */}
          {inSteps(m.endpoints).map((e) => <EndpointRow key={e.key} appId={appId} mock={m} endpoint={e} act={act} />)}
        </div>
      )}
      {m.unlinked.length > 0 && m.endpoints.length > 0 && <p className="mock-data-warn">{m.unlinked.length === 1 ? 'A data file is' : 'Data files are'} no endpoint's, so nothing says which call {m.unlinked.length === 1 ? 'it answers' : 'they answer'}: <code>{m.unlinked.join(', ')}</code>. A file is an endpoint's by its name: <code>{m.endpoints[0].key}.csv</code>, or <code>{m.endpoints[0].key}.more.csv</code> for more of the same.</p>}
    </div>
  )
}
/** The endpoints in the order they are called: each one's steps right after it. */
const inSteps = (all: MockEndpoint[]): MockEndpoint[] => { const under = (k: string): MockEndpoint[] => all.filter((e) => e.follows === k).flatMap((e) => [e, ...under(e.key)]); return all.filter((e) => !e.follows || !all.some((p) => p.key === e.follows)).flatMap((e) => [e, ...under(e.key)]) }
function EndpointRow({ appId, mock: m, endpoint: e, act }: { appId: string; mock: Mock; endpoint: MockEndpoint; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const parent = e.follows ? m.endpoints.find((p) => p.key === e.follows) : null
  const steps = m.endpoints.filter((x) => x.follows === e.key)
  if (editing) return <div className="mock-endpoints-row" role="row" style={{ gridTemplateColumns: '1fr' }}><div role="cell"><EndpointForm start={e} others={m.endpoints.filter((x) => x.key !== e.key && x.follows !== e.key)} label="Save" onSave={(b) => {
    if (b.sensitive && !e.sensitive && e.data.app?.recorded && !window.confirm(`Mark ${e.method} ${e.path} sensitive? Its real response on this computer is faked, where it has no fake yet, and deleted. It cannot be got back.`)) return Promise.resolve()
    return act(async () => { await engine.editMockEndpoint(appId, m.key, e.key, b); setEditing(false) })
  }} onCancel={() => setEditing(false)} /></div></div>
  return (
    <div className="mock-endpoints-row" role="row" data-step={parent ? 'yes' : undefined}>
      <div role="cell" style={parent ? { paddingLeft: 20, borderLeft: '2px solid var(--line)' } : undefined}>
        {parent
          ? <><span className="faint">Next step: </span><span className="mock-method">{e.method}</span> the link in <code>{e.linkField}</code></>
          : <><span className="mock-method">{e.method}</span> <code>{e.path}</code></>}
        {steps.length > 0 && <> <Badge tone="neutral">Intermediate</Badge></>}{e.sensitive && <> <Badge tone="warn">Sensitive</Badge></>}{e.what && <div className="faint">{e.what}</div>}
        {parent && <div className="faint">Called on the link that {parent.method} {parent.path} answers with.</div>}
        {steps.length > 0 && <div className="faint">Its answer gives the link for the next step.{m.served === 'general' ? ' The mock points that link back at itself.' : ''}</div>}
        {e.sensitive && <div className="faint">A real response of it is never stored: one that comes in is faked at once.</div>}
        <div className="row" style={{ marginTop: 4 }}><button className="btn quiet small" aria-label={`Edit the call ${e.method} ${e.path}`} onClick={() => setEditing(true)}>Edit</button><button className="btn quiet small" aria-label={`Remove the call ${e.method} ${e.path}`} onClick={() => { if (window.confirm(`Take ${e.method} ${e.path} off ${m.name}? Its data files stay, no longer tied to a call.`)) void act(() => engine.removeMockEndpoint(appId, m.key, e.key)) }}>Remove</button></div>
      </div>
      <div role="cell"><EndpointDataCell appId={appId} mockKey={m.key} serviceName={m.name} endpoint={e} written={m.served === 'written'} canAsk={!!m.issue} onChanged={() => act(async () => {})} /></div>
    </div>
  )
}
/** An endpoint's fields: the call (or, for a second step, the endpoint whose answer gives its link), what it answers with, and whether it is sensitive. */
interface EndpointFields { method: string; path?: string; what: string; sensitive: boolean; follows: string | null; linkField?: string }
function EndpointForm({ start, others = [], label, onSave, onCancel }: { start?: MockEndpoint; /** The endpoints it could follow. */ others?: MockEndpoint[]; label: string; onSave: (b: EndpointFields) => Promise<void>; onCancel: () => void }) {
  const [method, setMethod] = useState(start?.method ?? 'GET')
  const [path, setPath] = useState(start?.follows ? '' : start?.path ?? '')
  const [what, setWhat] = useState(start?.what ?? '')
  const [sensitive, setSensitive] = useState(!!start?.sensitive)
  const [step, setStep] = useState(!!start?.follows)
  const [follows, setFollows] = useState(start?.follows ?? others[0]?.key ?? '')
  const [linkField, setLinkField] = useState(start?.linkField ?? '')
  const ok = step ? !!follows && !!linkField.trim() : !!path.trim()
  return (
    <div className="mock-edit" style={{ marginTop: 0 }} data-component="EndpointForm">
      {others.length > 0 && <label className="mock-check"><input type="checkbox" checked={step} onChange={(ev) => setStep(ev.target.checked)} /> A next step: it is called on a link another endpoint's answer gives</label>}
      {step ? (
        <>
          <div className="task-calls-call">
            <label>Method<select value={method} onChange={(ev) => setMethod(ev.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>The endpoint whose answer gives the link<select value={follows} onChange={(ev) => setFollows(ev.target.value)}>{others.map((o) => <option key={o.key} value={o.key}>{o.method} {o.path}</option>)}</select></label>
          </div>
          <label>The field of that answer that holds the link<input className="mono" value={linkField} onChange={(ev) => setLinkField(ev.target.value)} placeholder="download_url" /></label>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>That endpoint becomes intermediate: the mock answers it with a link back to itself in that field, and answers this step from this step's own data.</p>
        </>
      ) : (
        <div className="task-calls-call">
          <label>Method<select value={method} onChange={(ev) => setMethod(ev.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>The call<input className="mono" value={path} onChange={(ev) => setPath(ev.target.value)} placeholder="/runs/{id}/status" /></label>
        </div>
      )}
      <label>What it answers with<input value={what} onChange={(ev) => setWhat(ev.target.value)} placeholder="in a line" /></label>
      <label className="mock-check"><input type="checkbox" checked={sensitive} onChange={(ev) => setSensitive(ev.target.checked)} /> Sensitive: never store a real response of it</label>
      {sensitive && <p className="faint" style={{ margin: 0, fontSize: 13 }}>A real response that comes in, given or recorded, is faked at once and the original deleted. Only the fake is ever stored or served, so it cannot be faked again differently later.</p>}
      <div className="row"><button className="btn small" aria-label={label === 'Save' ? 'Save the call' : 'Add the endpoint'} disabled={!ok} onClick={() => void onSave(step ? { method, what: what.trim(), sensitive, follows, linkField: linkField.trim(), ...(start?.follows ? {} : { path: '' }) } : { method, path: path.trim(), what: what.trim(), sensitive, follows: null })}>{label}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

/** Removing a mock: what goes with it, and whether its real responses are deleted from this computer too. Deleted by default, so nothing of it is left for the next one. */
function RemoveMock({ appId, mock: m, onRemove, onCancel }: { appId: string; mock: Mock; onRemove: (files: boolean) => Promise<void>; onCancel: () => void }) {
  const [real, setReal] = useState<MockReal[] | null>(null)
  const [files, setFiles] = useState(true)
  useEffect(() => { engine.mockReal(appId, m.key).then(setReal).catch(() => setReal([])) }, [appId, m.key])
  const n = real?.length ?? 0
  return (
    <div className="mock-needs" data-component="RemoveMock">
      <strong>Remove the mock of {m.name}?</strong>
      <p style={{ margin: '4px 0' }}>Its server, its endpoints, its data and every choice a task made for it go with it. What tasks list as their calls stays.</p>
      {real === null ? <p className="muted" style={{ margin: 0 }}>Looking for its real responses…</p>
        : n > 0 ? <label className="mock-check"><input type="checkbox" checked={files} onChange={(e) => setFiles(e.target.checked)} /> Also delete its {n} real response{n === 1 ? '' : 's'} from this computer</label>
        : <p className="faint" style={{ margin: 0 }}>It has no real responses on this computer.</p>}
      {n > 0 && !files && <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>Kept, they stay on this computer and are not taken up by a mock made later; they can be deleted from that mock's card.</p>}
      <div className="row"><button className="btn small" disabled={real === null} onClick={() => void onRemove(files && n > 0)}>Remove it</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

/** The service's real responses on this computer: what is there and from when, never what is in it. Each can be deleted. Read when it is opened. */
function RealResponses({ appId, mock: m, act }: { appId: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [list, setList] = useState<MockReal[] | null>(null)
  const load = () => engine.mockReal(appId, m.key).then(setList).catch(() => setList([]))
  return (
    <details className="mock-provenance" data-component="RealResponses" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load() }}>
      <summary>Real responses on this computer</summary>
      {!list ? <p className="muted">Loading…</p> : !list.length ? <p className="muted">None. A real response is given on the call it answers, or recorded in a live run.</p> : (
        <ul className="mock-history">
          {list.map((r) => (
            <li key={r.id}>
              {r.given ? 'Given' : 'Recorded in a live run'} {day(r.at)}: {r.files.map((f) => `${f.name} (${size(f.bytes)})`).join(', ') || 'no files'}.
              {r.before && <span className="faint"> From before this mock was made: it is not used.</span>}
              {' '}<button className="btn quiet small" aria-label={`Delete the real response of ${day(r.at)}`} onClick={() => { if (window.confirm(`Delete this real response of ${m.name} from this computer? It cannot be got back. A fake already made from it stays.`)) void act(async () => { await engine.removeMockReal(appId, m.key, r.id); await load() }) }}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/** What the mock can answer with: each set, what it is, and which it serves unless a run says otherwise. */
// From before data sat on the endpoint: shown only for a mock that lists no endpoints.
function DataSets({ appId, issueId, mock: m, act }: { appId: string; issueId?: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const realDefault = m.data.some((d) => d.isDefault && d.kind === 'real')
  return (
    <div className="mock-data" data-component="MockDataSets">
      <strong>Data</strong>
      {!m.data.length ? <p className="faint" style={{ margin: '4px 0 0' }}>None yet. Its server answers with whatever its own files hold. A task's agent makes data from a real response, or writes it.</p> : (
        <ul>
          {m.data.map((d) => (
            <li key={d.key}>
              <div className="mock-data-head">
                <span>{d.name}</span>
                <Badge tone={KIND[d.kind].tone}>{KIND[d.kind].label}</Badge>
                <button className="btn quiet small" aria-label={`Rename ${d.name}`} onClick={() => { const name = window.prompt('What to call this data', d.name); if (name?.trim() && name.trim() !== d.name) void act(() => engine.renameMockData(appId, m.key, d.key, name.trim())) }}>Rename</button>
                {d.isDefault ? <Badge tone="accent">Default</Badge> : <button className="btn quiet small" onClick={() => act(() => engine.setMockDefaultData(appId, m.key, d.key))}>Make default</button>}
                <button className="btn quiet small" onClick={() => { if (window.confirm(`Remove "${d.name}"?${d.kind === 'real' ? ' The real response itself stays on this computer.' : ''}`)) void act(() => engine.removeMockData(appId, m.key, d.key)) }}>Remove</button>
              </div>
              <p className="faint">{d.note}{d.files.length ? ` Files: ${d.files.map((f) => `${f.path} (${size(f.bytes)})`).join(', ')}.` : ''}</p>
            </li>
          ))}
        </ul>
      )}
      <ProvideData mock={m} onReal={(files) => act(() => engine.giveRecording(appId, m.key, files))} onInvented={(files, name) => act(() => engine.provideMockData(appId, m.key, files, name, issueId))} />
      {realDefault && <p className="mock-data-warn">Its default is a real response, so runs here show real data and it cannot be exported or shared. Make a faked set the default to export it.</p>}
    </div>
  )
}

/** A file of data from the person: one that may hold real data is kept here and faked; one they state holds nothing real is used as it is. */
function ProvideData({ mock: m, onReal, onInvented }: { mock: Mock; onReal: (files: File[]) => Promise<void>; onInvented: (files: File[], name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [nothingReal, setNothingReal] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!open) return <div className="row"><button className="btn quiet small" onClick={() => setOpen(true)}>Add data from a file</button></div>
  const go = async () => { setBusy(true); try { await (nothingReal ? onInvented(files, name.trim() || files[0].name) : onReal(files)); setOpen(false); setFiles([]); setName(''); setNothingReal(false) } finally { setBusy(false) } }
  return (
    <div className="mock-edit" data-component="ProvideData">
      <label>A response {m.name} sent, or data in its shape<input type="file" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
      <label className="mock-check"><input type="checkbox" checked={nothingReal} onChange={(e) => setNothingReal(e.target.checked)} /> I wrote this, or made it up: it holds nothing real</label>
      {nothingReal
        ? <><label>What to call it<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Someone with nothing found" /></label><p className="faint" style={{ margin: 0, fontSize: 13 }}>It is used as it is, and may go to a reviewer. Where a real response of {m.name} is on this computer it is checked against it; otherwise your word is all there is, and its note says so.</p></>
        : <p className="faint" style={{ margin: 0, fontSize: 13 }}>It is treated as real: kept on this computer, never exported, and {m.issue ? 'the task\'s agent makes a fake of it' : 'faked once a task takes this mock up'}.</p>}
      <div className="row"><button className="btn small" disabled={!files.length || busy} onClick={go}>{busy ? 'Adding…' : 'Add it'}</button><button className="btn quiet small" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  )
}

/** What has changed on a mock: the app's own choices, and what tasks did to it. Read when it is opened. */
function History({ appId, mockKey }: { appId: string; mockKey: string }) {
  const [list, setList] = useState<MockChange[] | null>(null)
  return (
    <details className="mock-provenance" data-component="MockHistory" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !list) void engine.mockHistory(appId, mockKey).then(setList).catch(() => setList([])) }}>
      <summary>History</summary>
      {!list ? <p className="muted">Loading…</p> : !list.length ? <p className="muted">Nothing has changed yet.</p> : (
        <ul className="mock-history">
          {list.map((c, i) => <li key={i}><span className="faint">{new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span> {c.what} <span className="faint">· {c.by}{c.issue ? <>, for <Link to={`/tasks/${c.issue.id}`}>{c.issue.identifier}</Link></> : c.by === 'you' ? ', in the app\'s settings' : ''}</span></li>)}
        </ul>
      )}
    </details>
  )
}

/** A service the app connects to, added in its settings: its name and what it is. What a live run needs is tucked away. A name that is one already there, written differently, is refused. */
function AddAppService({ onAdd, onCancel }: { onAdd: (b: { name: string; standsInFor?: string; upstream?: string; addressSetting?: string; keySetting?: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [what, setWhat] = useState('')
  const [upstream, setUpstream] = useState('')
  const [addr, setAddr] = useState('')
  const [key, setKey] = useState('')
  return (
    <div className="mock-edit" style={{ marginBottom: 12 }} data-component="AddAppService">
      <label>The service<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="its name, e.g. SixtyFour" /></label>
      <label>What it is<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="in a line, e.g. the vendor that scans for exposure" /></label>
      <Connection upstream={upstream} setUpstream={setUpstream} addr={addr} setAddr={setAddr} keyName={key} setKeyName={setKey} />
      <div className="row"><button className="btn small" disabled={!name.trim()} onClick={() => void onAdd({ name: name.trim(), ...(what.trim() ? { standsInFor: what.trim() } : {}), ...(upstream.trim() ? { upstream: upstream.trim() } : {}), ...(addr.trim() ? { addressSetting: addr.trim() } : {}), ...(key.trim() ? { keySetting: key.trim() } : {}) })}>Add</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

function EditMock({ mock: m, onSave, onCancel }: { mock: Mock; onSave: (b: { name: string; standsInFor: string; upstream: string | null; addressSetting: string | null; keySetting: string | null }) => void; onCancel: () => void }) {
  const [name, setName] = useState(m.name)
  const [standsInFor, setStandsInFor] = useState(m.standsInFor)
  const [upstream, setUpstream] = useState(m.connection.address ?? '')
  const [addr, setAddr] = useState(m.connection.addressSetting ?? '')
  const [key, setKey] = useState(m.connection.keySetting ?? '')
  return (
    <div className="mock-edit">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>What it is<input value={standsInFor} onChange={(e) => setStandsInFor(e.target.value)} placeholder="the service and version, e.g. Vendor workflow 3d50b61e, results CSV" /></label>
      <Connection upstream={upstream} setUpstream={setUpstream} addr={addr} setAddr={setAddr} keyName={key} setKeyName={setKey} />
      {Object.keys(m.connection.others).length > 0 && <p className="faint" style={{ margin: 0, fontSize: 13 }}>A mock is also given {Object.entries(m.connection.others).map(([k, v]) => `${k}=${v}`).join(', ')}, set by the agent that built it.</p>}
      <div className="row"><button className="btn small" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), standsInFor, upstream: upstream.trim() || null, addressSetting: addr.trim() || null, keySetting: key.trim() || null })}>Save</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
/** A service's connection: its real address, and the environment variable the app reads that address from, which is the one a mock overrides. */
function Connection({ upstream, setUpstream, addr, setAddr, keyName, setKeyName }: { upstream: string; setUpstream: (v: string) => void; addr: string; setAddr: (v: string) => void; keyName: string; setKeyName: (v: string) => void }) {
  return (
    <>
      <label>Its real address<input className="mono" value={upstream} onChange={(e) => setUpstream(e.target.value)} placeholder="https://api.vendor.com" /></label>
      <label>The environment variable to override<input className="mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="the one the app reads that address from, e.g. VENDOR_BASE_URL" /></label>
      <label>The environment variable for its key <span className="faint">(if it has one)</span><input className="mono" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="its name, e.g. VENDOR_API_KEY: never the key itself" /></label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>The app's code is the same everywhere: it reads the service's address from that variable. On main it holds the real address. For a mock the engine sets it to the mock's address, and gives the key's variable a made-up key, so the real key never reaches a mock. Left empty, an agent fills the variables in from the code.</p>
    </>
  )
}

