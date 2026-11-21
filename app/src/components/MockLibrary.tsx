/**
 * Settings › the app › Mocks (engine/src/mocks.ts): each outside service the app depends on, its mock, where the mock
 * came from and where it is in use. A mock is mined from a real response recorded once: its shape is real and its
 * values are invented. One that needs a recording says what a real call needs, and starts the live run that makes it.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import { engine, type Mock } from '../engine'

const STATUS: Record<Mock['status'], { label: string; tone: Tone }> = {
  mined: { label: 'Mined', tone: 'ok' },
  assumed: { label: 'Assumed shape', tone: 'warn' },
  needs_recording: { label: 'Needs a recording', tone: 'bad' },
}
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const envText = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}=${v}`).join('\n')
const envOf = (t: string) => Object.fromEntries(t.split('\n').map((l) => l.trim()).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const err = (e: unknown) => String((e as Error)?.message ?? e)

export function MockLibrary({ appId }: { appId: string }) {
  const [list, setList] = useState<Mock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const reload = () => engine.mocks(appId).then((l) => { setList(l); setError(null) }).catch((e) => setError(err(e)))
  useEffect(() => { setList(null); void reload() }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload() } catch (e) { setError(err(e)) } }
  return (
    <section className="panel" data-component="MockLibrary">
      <div className="task-block-head">
        <h2 style={{ margin: 0 }}>Mocks</h2>
        <button className="btn quiet small" onClick={() => setAdding(!adding)}>Add a service</button>
      </div>
      <p className="faint settings-desc" style={{ margin: '6px 0 12px', maxWidth: 760 }}>
        One mock for each outside service this app calls. Its prototypes, smoke tests and main are pointed at the mock instead of the real service.
        A mock is mined from a real response, recorded once and kept on this computer. It keeps the response's shape and none of its data, and every value in it is invented.
        Exporting a mock gives the invented copy, never the recording.
      </p>
      {adding && <AddService onAdd={(b) => act(async () => { await engine.raiseMock(appId, b); setAdding(false) })} onCancel={() => setAdding(false)} />}
      {error && <div className="empty bad" style={{ marginBottom: 12 }}>{error}</div>}
      {list === null ? (error ? null : <p className="muted">Loading…</p>)
        : !list.length ? <div className="empty">No mocks yet. One is added when a task's agent finds a service the change depends on, or here with Add a service.</div>
        : <div className="mock-list">{list.map((m) => <MockCard key={m.key} appId={appId} mock={m} act={act} />)}</div>}
    </section>
  )
}

function MockCard({ appId, mock: m, act }: { appId: string; mock: Mock; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [live, setLive] = useState(false)
  const s = STATUS[m.status]
  const canRecord = !!(m.issue && m.upstream && Object.keys(m.env).length)
  return (
    <article className="card mock-card" data-component="MockCard">
      <div className="card-head">
        <span className="card-title">{m.name}</span>
        <Badge tone={s.tone} dot>{s.label}</Badge>
      </div>
      {m.standsInFor && <p style={{ margin: 0 }}>Stands in for {m.standsInFor}.</p>}
      <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>
        {m.status === 'mined' ? <>Recorded {day(m.recordedAt) ?? 'on a date not kept'}{m.issue ? <> for <Link to={`/tasks/${m.issue.id}`}>{m.issue.identifier}</Link></> : null} · mined {day(m.minedAt)}</>
          : m.status === 'assumed' ? <>Written from a guess, before any recording. It shows only that the code handles the guess.</>
          : <>No mock yet{m.issue ? <>, raised on <Link to={`/tasks/${m.issue.id}`}>{m.issue.identifier}</Link></> : null}.</>}
        {' · '}{m.usedBy.length ? <>In use: {m.usedBy.join(', ')}</> : 'Not in use right now'}
      </p>

      {m.needs && (
        <div className="mock-needs">
          <strong>{m.status === 'needs_recording' ? 'Needs a recording' : 'Out of date: needs a new recording'}</strong>{m.needs.why ? <>: {m.needs.why}</> : null}
          <ul>
            {m.needs.person && <li>A real call needs {m.needs.person}.</li>}
            {m.needs.key && <li>The key: <code>{m.needs.key}</code>.</li>}
            {m.needs.cost && <li>It costs {m.needs.cost}.</li>}
          </ul>
          {m.needs.recorded ? <p className="faint" style={{ margin: 0 }}>A live run was recorded. The task's agent is mining it.</p>
            : canRecord ? (live
              ? <div className="row"><span>This calls {m.name} for real{m.needs.cost ? `, ${m.needs.cost}` : ''}, and the engine keeps what it sends.</span>
                  <button className="btn small" onClick={() => act(async () => { await engine.startLiveSmoke(m.issue!.id, [m.key]); setLive(false) })}>Start the live run</button>
                  <button className="btn quiet small" onClick={() => setLive(false)}>Cancel</button></div>
              : <div className="row"><button className="btn small" onClick={() => setLive(true)}>Record it: a live smoke run of {m.issue!.identifier}</button></div>)
            : <p className="faint" style={{ margin: 0 }}>To record it, give it {[!m.upstream && 'the real service\'s address', !Object.keys(m.env).length && 'the variables that point the app at it', !m.issue && 'a task to run'].filter(Boolean).join(', ')}.</p>}
        </div>
      )}
      {m.unmined && (
        <div className="row">
          <span>A recording from {day(m.unmined.at)} ({m.unmined.files} files) waits to be mined.</span>
          <button className="btn small" onClick={() => act(() => engine.mineMock(appId, m.key))}>Mine it</button>
        </div>
      )}

      {m.status !== 'needs_recording' && (
        <details className="mock-provenance">
          <summary>Provenance</summary>
          <Md text={m.note.replace(/^# .*\n+/, '')} />
          {m.files.length > 0 && <p className="faint" style={{ fontSize: 13 }}>Files: {m.files.map((f) => `${f.path} (${size(f.bytes)})`).join(', ')}. Run with <code>{m.cmd}</code>.</p>}
        </details>
      )}
      {editing && <EditMock mock={m} onSave={(b) => act(async () => { await engine.updateMock(appId, m.key, b); setEditing(false) })} onCancel={() => setEditing(false)} />}
      <div className="row">
        {m.status !== 'needs_recording' && <a className="btn quiet small" href={engine.mockExportUrl(appId, m.key)} download>Export</a>}
        {!editing && <button className="btn quiet small" onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn quiet small" onClick={() => { if (window.confirm(`Remove the mock of ${m.name}? Its recordings stay on this computer.`)) void act(() => engine.removeMock(appId, m.key)) }}>Remove</button>
      </div>
    </article>
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

function AddService({ onAdd, onCancel }: { onAdd: (b: { name: string; standsInFor?: string; upstream?: string; env?: Record<string, string> }) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [upstream, setUpstream] = useState('')
  const [env, setEnv] = useState('')
  return (
    <div className="mock-edit" style={{ marginBottom: 12 }}>
      <label>The service<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="its name, e.g. SixtyFour" /></label>
      <label>The real service's address<input className="mono" value={upstream} onChange={(e) => setUpstream(e.target.value)} placeholder="https://api.vendor.com" /></label>
      <label>The variables that point the app at it<textarea className="mono" rows={2} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="VENDOR_BASE_URL={container_url}" /></label>
      <div className="row"><button className="btn small" disabled={!name.trim()} onClick={() => onAdd({ name: name.trim(), ...(upstream.trim() ? { upstream: upstream.trim() } : {}), ...(env.trim() ? { env: envOf(env) } : {}) })}>Add</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
