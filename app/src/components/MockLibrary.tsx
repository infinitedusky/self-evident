/**
 * Settings › the app › Mocks (engine/src/mocks.ts): each outside service the app depends on, its mock, where the mock
 * came from and where it is in use. A mock is mined from a real response recorded once: its shape is real and its
 * values are invented. One that needs a recording says what a real call needs, and starts the live run that makes it.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import { MockPlaces } from './MockPlaces'
import { TaskCalls } from './TaskCalls'
import { engine, type Mock, type MockChange, type MockData, type MockEndpoint } from '../engine'

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
const envText = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}=${v}`).join('\n')
const envOf = (t: string) => Object.fromEntries(t.split('\n').map((l) => l.trim()).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const err = (e: unknown) => String((e as Error)?.message ?? e)

export function MockLibrary({ appId, issueId }: { appId: string; /** On a task's Data step: its own table, and what it adds is the task's. None: the app's settings. */ issueId?: string }) {
  const [list, setList] = useState<Mock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0) // the table is read again when a mock or its data changes
  const reload = () => engine.mocks(appId).then((l) => { setList(l); setError(null) }).catch((e) => setError(err(e)))
  useEffect(() => { setList(null); void reload() }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); setTick((t) => t + 1) } catch (e) { setError(err(e)) } }
  // While an agent is building a mock, the page is read again every few seconds, so it shows the mock the moment it is saved
  // and never a state that is already gone. What it shows is compared first: nothing is redrawn while nothing has changed.
  const building = !!list?.some((m) => m.needs?.recorded)
  useEffect(() => {
    if (!building) return
    const t = setInterval(() => { void engine.mocks(appId).then((l) => setList((was) => { if (JSON.stringify(was) === JSON.stringify(l)) return was; setTick((x) => x + 1); return l })).catch(() => {}) }, 4000)
    return () => clearInterval(t)
  }, [building, appId])
  return (
    <section className="panel" data-component="MockLibrary">
      <div className="task-block-head">
        <h2 style={{ margin: 0 }}>{issueId ? 'This task\'s data' : 'Mocks'}</h2>
      </div>
      <p className="faint settings-desc" style={{ margin: '6px 0 12px', maxWidth: 760 }}>
        {issueId ? 'What stands outside the app is mocked, so this task can be tried without calling it. The app\'s own code is what goes live: only its settings point at the mock.' : 'One mock for each outside service this app calls. Its prototypes, smoke tests and main are pointed at the mock instead of the real service. A mock is made in a task, on its Data step, and kept here for the next one.'}{' '}
        A mock is a small server that behaves as the service does, and, kept apart from it, the data it answers with: a real response as it is, a fake of one, or invented data.
        A real response stays on this computer. Only faked or invented data is ever exported or shared.
      </p>
      {issueId && <TaskCalls appId={appId} issueId={issueId} mocks={list ?? []} version={tick} onChanged={() => { void reload() }} />}
      <h3 className="mock-h3">{issueId ? 'Where its data comes from, for this task' : 'Where the data comes from, unless a task says otherwise'}</h3>
      <MockPlaces key={tick} appId={appId} issueId={issueId} />
      <h3 className="mock-h3">{issueId ? 'The app\'s mocks' : 'Each mock'}</h3>
      {error && <div className="empty bad" style={{ marginBottom: 12 }}>{error}</div>}
      {(() => {
        const all = list === null ? (error ? null : <p className="muted">Loading…</p>)
          : !list.length ? <div className="empty">{issueId ? 'No mocks yet. One is made from a call above.' : 'No mocks yet. One is made on a task\'s Data step, when its change depends on an outside service.'}</div>
          : <div className="mock-list">{list.map((m) => <MockCard key={m.key} appId={appId} issueId={issueId} mock={m} act={act} />)}</div>
        // On a task the calls above already show what matters to it: the whole of each mock is one press away.
        return issueId && list?.length ? <details className="mock-all"><summary>Each mock in full ({list.length})</summary>{all}</details> : all
      })()}
    </section>
  )
}

function MockCard({ appId, issueId, mock: m, act }: { appId: string; issueId?: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [live, setLive] = useState(false)
  const s = STATUS[m.status]
  const canRecord = !!(m.issue && m.upstream && Object.keys(m.env).length)
  const realDefault = m.data.some((d) => d.isDefault && d.kind === 'real')
  return (
    <article className="card mock-card" data-component="MockCard">
      <div className="card-head">
        <span className="card-title">{m.name}</span>
        <Badge tone={s.tone} dot>{s.label}</Badge>
      </div>
      {m.standsInFor && <p style={{ margin: 0 }}>Stands in for {m.standsInFor}.</p>}
      <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>
        {m.status === 'mined' ? <>Recorded {day(m.recordedAt) ?? 'on a date not kept'}{m.issue ? <> for <Link to={`/tasks/${m.issue.id}`}>{m.issue.identifier}</Link></> : null} · built {day(m.minedAt)}</>
          : m.status === 'assumed' ? <>Written from a guess, before any recording. It shows only that the code handles the guess.</>
          : <>No mock yet{m.issue ? <>, raised on <Link to={`/tasks/${m.issue.id}`}>{m.issue.identifier}</Link></> : null}.</>}
        {' · '}{m.usedBy.length ? <>In use: {m.usedBy.join(', ')}</> : 'Not in use right now'}
      </p>

      {m.needs && (
        <div className="mock-needs">
          <strong>{m.status === 'needs_recording' ? 'Needs a real response' : 'Out of date: needs a new real response'}</strong>{m.needs.why ? <>: {m.needs.why}</> : null}
          <ul>
            {m.needs.person && <li>A real call needs {m.needs.person}.</li>}
            {m.needs.key && <li>The key: <code>{m.needs.key}</code>.</li>}
            {m.needs.cost && <li>It costs {m.needs.cost}.</li>}
          </ul>
          {m.needs.recorded ? <div className="row"><span>A real response is in. The task's agent is building the mock from it: its conversation shows how far it is.</span><button className="btn quiet small" title="If the agent did not start, or stopped" onClick={() => act(() => engine.mineMock(appId, m.key))}>Ask again</button></div>
            : !m.issue ? <p className="faint" style={{ margin: 0 }}>It has no task yet, so there is no agent to mine it. A task's agent raises a mock when its change needs one.</p>
            : <>
              {m.endpoints.length
                ? <p style={{ margin: '8px 0' }}>A real response is given on the call it answers{issueId ? ', under What this task calls above' : ', on the Data step of the task that needs it'}: {m.endpoints.map((e) => `${e.method} ${e.path}`).join(', ')}.</p>
                : <GiveFiles what={m.needs.file} onGive={(files) => act(() => engine.giveRecording(appId, m.key, files))} />}
              {canRecord ? (live
                ? <div className="row"><span>This calls {m.name} for real{m.needs.cost ? `, ${m.needs.cost}` : ''}, and the engine keeps what it sends.</span>
                    <button className="btn small" onClick={() => act(async () => { await engine.startLiveSmoke(m.issue!.id, [m.key]); setLive(false) })}>Start the live run</button>
                    <button className="btn quiet small" onClick={() => setLive(false)}>Cancel</button></div>
                : <div className="row"><span className="faint">Or record the whole exchange:</span><button className="btn quiet small" onClick={() => setLive(true)}>Record it: a live smoke run of {m.issue.identifier}</button></div>)
                : <p className="faint" style={{ margin: 0 }}>To record it live instead, give it {[!m.upstream && 'the real service\'s address', !Object.keys(m.env).length && 'the variables that point the app at it'].filter(Boolean).join(' and ')}.</p>}
            </>}
        </div>
      )}
      {m.unmined && !m.needs?.recorded && ( // one the agent was already asked about says so above, once
        <div className="row">
          <span>A newer real response, from {day(m.unmined.at)}, has not been used yet.</span>
          <button className="btn small" onClick={() => act(() => engine.mineMock(appId, m.key))}>Ask the task's agent to use it</button>
        </div>
      )}

      {m.status !== 'needs_recording' && <Endpoints appId={appId} mock={m} act={act} />}
      {m.status !== 'needs_recording' && <DataSets appId={appId} issueId={issueId} mock={m} act={act} />}

      {m.status !== 'needs_recording' && (
        <details className="mock-provenance">
          <summary>Provenance</summary>
          <Md text={m.note.replace(/^# .*\n+/, '')} />
          {m.files.length > 0 && <p className="faint" style={{ fontSize: 13 }}>Files: {m.files.map((f) => `${f.path} (${size(f.bytes)})`).join(', ')}. Run with <code>{m.cmd}</code>.</p>}
        </details>
      )}
      <History appId={appId} mockKey={m.key} />
      {editing && <EditMock mock={m} onSave={(b) => act(async () => { await engine.updateMock(appId, m.key, b); setEditing(false) })} onCancel={() => setEditing(false)} />}
      <div className="row">
        {m.status !== 'needs_recording' && !realDefault && <a className="btn quiet small" href={engine.mockExportUrl(appId, m.key)} download>Export</a>}
        {!editing && <button className="btn quiet small" onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn quiet small" onClick={() => { if (window.confirm(`Remove the mock of ${m.name}? Its server, its data and every choice made for it in a task go with it. The real responses stay on this computer.`)) void act(() => engine.removeMock(appId, m.key)) }}>Remove</button>
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

/** The calls the mock answers: a response belongs to exactly one, and each says whether a real response is behind it or its shape is taken from the code. */
function Endpoints({ appId, mock: m, act }: { appId: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const real = m.endpoints.filter((e) => e.real).length
  if (!m.endpoints.length) return (
    <div className="mock-data" data-component="MockEndpoints">
      <strong>Endpoints</strong>
      <div className="row" style={{ marginTop: 4 }}><span className="faint">Not listed: this mock was built before a mock said which calls it answers and which response answers which.</span>{m.issue && <button className="btn quiet small" onClick={() => act(() => engine.mineMock(appId, m.key))}>Ask the task's agent to list them</button>}</div>
    </div>
  )
  return (
    <div className="mock-data" data-component="MockEndpoints">
      <strong>Endpoints</strong> <span className="faint">{m.endpoints.length} call{m.endpoints.length === 1 ? '' : 's'}: {real} with a real response behind {real === 1 ? 'it' : 'them'}, {m.endpoints.length - real} taken from the code</span>
      <div className="mock-endpoints" role="table">
        <div className="mock-endpoints-head" role="row"><span role="columnheader">The call</span><span role="columnheader">Answered with</span><span role="columnheader">Where its shape came from</span></div>
        {m.endpoints.map((e) => <EndpointRow key={e.key} endpoint={e} canGive={!!m.issue} onGive={(files) => act(() => engine.giveRecording(appId, m.key, files, e.key))} />)}
      </div>
      {m.unlinked.length > 0 && <p className="mock-data-warn">{m.unlinked.length === 1 ? 'A data file is' : 'Data files are'} no endpoint's, so nothing says which call {m.unlinked.length === 1 ? 'it answers' : 'they answer'}: <code>{m.unlinked.join(', ')}</code>. A file is an endpoint's by its name: <code>{m.endpoints[0].key}.csv</code>, or <code>{m.endpoints[0].key}.more.csv</code> for more of the same.</p>}
    </div>
  )
}
function EndpointRow({ endpoint: e, canGive, onGive }: { endpoint: MockEndpoint; canGive: boolean; onGive: (files: File[]) => Promise<void> }) {
  return (
    <div className="mock-endpoints-row" role="row">
      <div role="cell"><span className="mock-method">{e.method}</span> <code>{e.path}</code>{e.what && <div className="faint">{e.what}</div>}</div>
      <div role="cell">{e.files.length ? e.files.map((f) => <code key={f} style={{ display: 'block' }}>{f}</code>) : <span className="faint">What its server makes up</span>}</div>
      <div role="cell">
        {e.real ? <>{e.real.how === 'given' ? 'A real response you gave' : 'A live run, recorded'}, {day(e.real.at)}</> : <span>The code that calls it <span className="faint">(no real response)</span></span>}
        {canGive && <label className="mock-give-one"><input type="file" multiple aria-label={`A real response of ${e.method} ${e.path}`} onChange={(ev) => { const files = [...(ev.target.files ?? [])]; if (files.length) void onGive(files) }} /><span className="btn quiet small">{e.real ? 'Give a newer one' : 'Give a real response'}</span></label>}
      </div>
    </div>
  )
}

/** What the mock can answer with: each set, what it is, and which it serves unless a run says otherwise. */
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

function EditMock({ mock: m, onSave, onCancel }: { mock: Mock; onSave: (b: { standsInFor: string; upstream: string | null; env: Record<string, string> }) => void; onCancel: () => void }) {
  const [standsInFor, setStandsInFor] = useState(m.standsInFor)
  const [upstream, setUpstream] = useState(m.upstream ?? '')
  const [env, setEnv] = useState(envText(m.env))
  return (
    <div className="mock-edit">
      <label>Stands in for<input value={standsInFor} onChange={(e) => setStandsInFor(e.target.value)} placeholder="the service and version, e.g. Vendor workflow 3d50b61e, results CSV" /></label>
      <label>The real service's address<input className="mono" value={upstream} onChange={(e) => setUpstream(e.target.value)} placeholder="https://api.vendor.com: a live run is recorded through it" /></label>
      <label>The variables that point the app at it<textarea className="mono" rows={3} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'one a line, e.g.\nVENDOR_BASE_URL={container_url}\n{url} is the mock on this computer; {container_url} is it as a container reaches it'} /></label>
      <div className="row"><button className="btn small" onClick={() => onSave({ standsInFor, upstream: upstream.trim() || null, env: envOf(env) })}>Save</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

