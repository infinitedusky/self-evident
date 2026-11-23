/**
 * The services a task calls, and its calls of each (engine/src/task-calls.ts), at the top of its Data step.
 *
 * A service is one of the app's, set up in its settings: a task picks from those, so one service is never two by a
 * slip of the keyboard. Each service block reads top to bottom as its settings do (Sandy, 2026-11-22): what each
 * place is given, the real service or the mock, as the app has it until the task overrides it; then the calls this
 * task makes, picked from the service's endpoints, each with its data: the app's until the task puts its own in
 * place of it. A call the service does not have yet is added to the service in Settings, and the form says so.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from './Badge'
import { EndpointDataCell } from './EndpointData'
import { Sources } from './MockPlaces'
import { engine, type Mock, type MockEndpoint, type MockPlacesRow, type TaskCall, type TaskService } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export function TaskCalls({ appId, issueId, mocks, places = [], version = 0, onChanged, intro, needs }: { /** What this section is, said under its heading, where the agent has not reported yet. */ intro?: ReactNode; /** The agent's report of what the task needs, folded away at the top. */ needs?: ReactNode; appId: string; issueId: string; /** The app's services (each is its mock): what can be picked, and the endpoints a call can be tied to. */ mocks: Mock[]; /** What each place is given for each service, for this task. */ places?: MockPlacesRow[]; /** Read again when it changes. */ version?: number; onChanged?: () => void | Promise<void> }) {
  const [services, setServices] = useState<TaskService[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const reload = () => engine.taskServices(issueId).then((s) => { setServices(s); setError(null) }).catch((e) => setError(err(e)))
  useEffect(() => { void reload() }, [issueId, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); await onChanged?.() } catch (e) { setError(err(e)) } }
  const calls = (services ?? []).flatMap((s) => s.calls)
  const has = (c: TaskCall) => !!(c.endpoint?.data.task ?? c.endpoint?.data.app)
  const withData = calls.filter(has).length, own = calls.filter((c) => c.endpoint?.data.task).length, missing = calls.filter((c) => c.state !== 'answered').length
  const others = mocks.filter((m) => !(services ?? []).some((s) => s.key === m.key))
  return (
    <div className="lv-section task-calls" data-component="TaskCalls">
      <div className="lv-section-head">
        <h3>Services</h3>
        <span className="lv-end">
          {!!services?.length && <button className="btn quiet small" onClick={() => { if (window.confirm('Take every service and call off this task\'s list? The app\'s services and their mocks are not touched.')) void act(async () => { for (const s of services) await engine.removeTaskService(issueId, s.key) }) }}>Clear the list</button>}
          <button className="btn quiet small" onClick={() => setAdding(!adding)}>Add a service</button>
        </span>
      </div>
      {/* With the agent's report the section says what it is in a line and the report follows; without one, the fuller paragraph stands in for both. */}
      {needs ? <p className="lv-section-note">What this task calls outside the app. Each is mocked, so the task can be tried without calling it.</p> : intro}
      {needs}
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}
      {adding && <AddService others={others}
        onPick={(key) => act(async () => { await engine.addTaskService(issueId, key); setAdding(false) })}
        onNew={(name, what) => act(async () => { const m = await engine.raiseMock(appId, { name, ...(what ? { standsInFor: what } : {}) }); await engine.addTaskService(issueId, m.key); setAdding(false) })}
        onCancel={() => setAdding(false)} />}
      {services === null ? (error ? null : <p className="muted">Loading…</p>)
        : !services.length ? <div className="empty" style={{ marginTop: 8 }}>None listed yet. Start this step with the agent and it names the outside services the change calls, from the brief and the code, then the calls it makes to each. Or add one with Add a service.</div>
        : (
          <>
            <p className="lv-sub" style={{ margin: '10px 0 0' }}>{services.length} service{services.length === 1 ? '' : 's'}, {calls.length} call{calls.length === 1 ? '' : 's'}: {withData} with data{own ? ` (${own} this task's own)` : ''}, {calls.length - withData - missing} with none yet{missing ? `, ${missing} not on ${missing === 1 ? 'its' : 'their'} service yet` : ''}</p>
            {services.map((s) => <ServiceBlock key={s.key} appId={appId} issueId={issueId} service={s} mock={mocks.find((m) => m.key === s.key) ?? null} places={places.find((p) => p.mock === s.key) ?? null} onData={() => act(async () => {})}
              onRemove={() => { if (window.confirm(`Take ${s.name} off this task's list${s.calls.length ? `, with its ${s.calls.length} call${s.calls.length === 1 ? '' : 's'}` : ''}? It stays one of the app's services.`)) void act(() => engine.removeTaskService(issueId, s.key)) }}
              onAddCall={(b) => act(() => engine.addTaskCall(issueId, { ...b, service: s.key }))}
              onEditCall={(id, b) => act(() => engine.editTaskCall(issueId, id, b))}
              onRemoveCall={(id) => act(() => engine.removeTaskCall(issueId, id))}
              onCover={(id) => act(() => engine.coverTaskCall(issueId, id))}
              onLink={(id, e) => act(() => engine.linkTaskCall(issueId, id, e))} />)}
          </>
        )}
    </div>
  )
}

function ServiceBlock({ appId, issueId, service: s, mock, places, onData, onRemove, onAddCall, onEditCall, onRemoveCall, onCover, onLink }: {
  appId: string; issueId: string; service: TaskService; mock: Mock | null; places: MockPlacesRow | null; onData: () => Promise<void>; onRemove: () => void
  onAddCall: (b: CallFields) => Promise<void>; onEditCall: (id: string, b: CallFields) => Promise<void>; onRemoveCall: (id: string) => void
  onCover: (id: string) => void; onLink: (id: string, endpoint: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  // The service's endpoints this task does not list yet: what a call is picked from.
  const eps = mock?.endpoints ?? []
  // A call with a next step is one thing to a task: the step comes with the call it follows, and sits under it.
  const stepsUnder = (k: string): MockEndpoint[] => eps.filter((e) => e.follows === k).flatMap((e) => [e, ...stepsUnder(e.key)])
  const listed = (k?: string) => (k ? s.calls.find((c) => c.endpoint?.key === k) : undefined)
  const under = (e?: MockEndpoint | null): boolean => { const p = e?.follows ? eps.find((x) => x.key === e.follows) : null; return !!p && (!!listed(p.key) || under(p)) }
  const top = s.calls.filter((c) => !under(c.endpoint))
  // The service's endpoints this task does not list yet: what a call is picked from. A step is never picked by itself.
  const known = eps.filter((e) => !listed(e.key) && !e.follows)
  return (
    <div className="lv-item" data-service={s.key}>
      <div className="lv-item-head">
        <span className="lv-item-name">{s.name}</span>
        <span className="lv-end">
          {!mock || mock.served === 'none' ? <Badge tone="warn" dot>No endpoints yet</Badge> : mock.served === 'general' ? <Badge tone="ok" dot>Served from its endpoints</Badge> : s.status === 'assumed' ? <Badge tone="warn" dot>A server of an assumed shape</Badge> : <Badge tone="ok" dot>Has a server written for it</Badge>}
          <button className="btn quiet small" aria-label={`Take ${s.name} off this task`} title="Off this task's list; it stays one of the app's services" onClick={onRemove}>×</button>
        </span>
      </div>
      <div className="lv-part">
        <div className="lv-part-head"><span className="lv-part-label">Info</span><span className="lv-sub" style={{ margin: 0 }}>Changed in Settings › Mocks</span></div>
        <dl className="lv-fields">
          <dt>What it is</dt><dd>{s.standsInFor || <span className="faint">Not said yet</span>}</dd>
          <dt>Real address</dt><dd>{mock?.connection.address ? <code>{mock.connection.address}</code> : <span className="faint">Not set</span>}</dd>
          <dt>Variable to override</dt><dd>{mock?.connection.addressSetting ? <code>{mock.connection.addressSetting}</code> : <span className="faint">Not set: the app cannot be pointed at its mock yet</span>}</dd>
        </dl>
      </div>
      {places && <div className="lv-part"><div className="lv-part-head"><span className="lv-part-label">Source</span></div><Sources appId={appId} row={places} issueId={issueId} onChanged={onData} /></div>}
      <div className="lv-part">
      <div className="lv-part-head"><span className="lv-part-label">Endpoints{eps.length > 0 && <span className="lv-count">{s.calls.length} of its {eps.filter((e) => !e.follows || listed(e.key)).length}</span>}</span><button className="btn quiet small" aria-label={`Add a call to ${s.name}`} onClick={() => setAdding(!adding)}>Add a call</button></div>
      {adding && <div className="lv-row" data-cols="1"><CallForm label="Add" known={known} steps={(k) => stepsUnder(k).length} serviceName={s.name} onSave={(b) => void onAddCall(b).then(() => setAdding(false))} onCancel={() => setAdding(false)} /></div>}
      {mock?.needs?.recorded && <div className="lv-row" data-cols="1"><div className="lv-note"><span>A real response is in. The task's agent is {mock.served === 'written' ? 'building the mock from it' : 'making its faked version'}: its conversation shows how far it is.</span><button className="lv-act" title="If the agent did not start, or stopped" onClick={() => void engine.mineMock(appId, s.key).then(onData)}>Ask again</button></div></div>}
      {!s.calls.length && !adding && <div className="lv-row" data-cols="1"><span className="faint">No calls listed yet: which of its endpoints does this task use?</span></div>}
      {top.flatMap((c) => [
        <CallRow key={c.id} appId={appId} issueId={issueId} call={c} mock={mock} onData={onData} onCover={() => onCover(c.id)} onLink={(e) => onLink(c.id, e)} onRemove={() => onRemoveCall(c.id)} onEdit={(b) => onEditCall(c.id, b)} />,
        ...(c.endpoint ? stepsUnder(c.endpoint.key) : []).map((e) => {
          const own = listed(e.key), parent = eps.find((x) => x.key === e.follows)!
          // A step the task lists itself says what the task needs of it; one it does not comes with the call above all the same.
          return own
            ? <CallRow key={own.id} appId={appId} issueId={issueId} call={own} parent={parent} mock={mock} onData={onData} onCover={() => onCover(own.id)} onLink={(x) => onLink(own.id, x)} onRemove={() => onRemoveCall(own.id)} onEdit={(b) => onEditCall(own.id, b)} />
            : <StepRow key={`step-${e.key}`} appId={appId} issueId={issueId} step={e} parent={parent} mock={mock!} onData={onData} />
        }),
      ])}
      {known.length > 0 && s.calls.length > 0 && <div className="lv-sub">{s.name} has {known.length} more endpoint{known.length === 1 ? '' : 's'} this task does not use: {known.map((e) => `${e.method} ${e.path}`).join(', ')}. Add a call picks from them.</div>}
      </div>
    </div>
  )
}

/** A next step that came with the call above it: the link that call's answer gives, with this step's own data. */
function StepRow({ appId, issueId, step: e, parent, mock, onData }: { appId: string; issueId: string; step: MockEndpoint; parent: MockEndpoint; mock: Mock; onData: () => Promise<void> }) {
  return (
    <div className="lv-row" data-step="yes">
      <div>
        <span className="faint">Next step: </span><span className="mock-method">{e.method}</span> the link in <code>{e.linkField}</code>{e.sensitive && <> <Badge tone="warn">Sensitive</Badge></>}
        {e.what && <div className="lv-sub">{e.what}</div>}
        <div className="lv-sub">Comes with {parent.method} {parent.path}: it is called on the link that answers with.</div>
      </div>
      <div><EndpointDataCell appId={appId} mockKey={mock.key} serviceName={mock.name} endpoint={e} issueId={issueId} written={mock.served === 'written'} canAsk onChanged={onData} /></div>
      <span className="lv-tools" />
    </div>
  )
}

function CallRow({ appId, issueId, call: c, parent, mock, onData, onCover, onLink, onRemove, onEdit }: { appId: string; issueId: string; call: TaskCall; /** The endpoint this call is a next step of, when that one is on the task's list: it sits under it. */ parent?: MockEndpoint; mock: Mock | null; onData: () => Promise<void>; onCover: () => void; onLink: (endpoint: string | null) => void; onRemove: () => void; onEdit: (b: CallFields) => Promise<void> }) {
  const e = c.endpoint
  const [editing, setEditing] = useState(false)
  const by = c.by === 'user' ? <span> · added by you</span> : null // who listed it, at the end of what is said of it
  if (editing) return <div className="lv-row" data-cols="1"><CallForm start={c} onSave={(b) => void onEdit(b).then(() => setEditing(false))} onCancel={() => setEditing(false)} /></div>
  return (
    <div className="lv-row" data-state={c.state} data-step={parent ? 'yes' : undefined}>
      <div>
        {parent && e ? <><span className="faint">Next step: </span><span className="mock-method">{c.method}</span> the link in <code>{e.linkField}</code></> : <><span className="mock-method">{c.method}</span> <code>{c.path}</code></>}{e && mock?.endpoints.some((x) => x.follows === e.key) && <> <Badge tone="neutral">Intermediate</Badge></>}{e?.sensitive && <> <Badge tone="warn">Sensitive</Badge></>}
        {e?.what && e.what !== c.what && <div className="lv-sub">{e.what}{!c.what && by}</div>}
        {c.what ? <div className="lv-sub">This task needs: {c.what}{by}</div> : !e?.what && <div className="lv-sub">Nothing said yet about what it has to answer.{by}</div>}
      </div>
      <div>
        {c.state === 'answered' && e && c.mock ? (
          <>
            <EndpointDataCell appId={appId} mockKey={c.mock.key} serviceName={c.mock.name} endpoint={e} issueId={issueId} written={mock?.served === 'written'} canAsk onChanged={onData} />
            {c.linked && <div className="row"><span className="faint">Tied by hand to {e.method} {e.path}</span><button className="btn quiet small" onClick={() => onLink(null)}>Untie</button></div>}
          </>
        ) : (
          <>
            <div><Badge tone="bad">Not on the service</Badge> {c.mock ? `${c.mock.name} does not list this call` : 'its service is no longer one of the app\'s'}</div>
            {c.mock && (
              <div className="row">
                <button className="btn quiet small" title="It becomes one of the service's endpoints, in Settings" onClick={onCover}>Add it to {c.mock.name}</button>
                {mock && mock.endpoints.length > 0 && (
                  <select aria-label={`Tie ${c.method} ${c.path} to an endpoint of the mock`} value="" onChange={(ev) => { if (ev.target.value) onLink(ev.target.value) }}>
                    <option value="">or it is one it has…</option>
                    {mock.endpoints.map((x) => <option key={x.key} value={x.key}>{x.method} {x.path}</option>)}
                  </select>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <span className="lv-tools"><button className="btn quiet small" aria-label={`Edit ${c.method} ${c.path}`} onClick={() => setEditing(true)}>Edit</button><button className="btn quiet small" aria-label={`Remove ${c.method} ${c.path}`} title="Take it off this task's list" onClick={onRemove}>×</button></span>
    </div>
  )
}

/** Adding a service to a task: one of the app's is picked; one the app does not have is added to the app's services, by name, and refused when it is one already there. */
function AddService({ others, onPick, onNew, onCancel }: { others: Mock[]; onPick: (key: string) => void; onNew: (name: string, what: string) => void; onCancel: () => void }) {
  const [key, setKey] = useState(others[0]?.key ?? '')
  const [fresh, setFresh] = useState(!others.length)
  const [name, setName] = useState('')
  const [what, setWhat] = useState('')
  return (
    <div className="mock-edit" style={{ margin: '8px 0 12px' }} data-component="AddTaskService">
      {!fresh ? (
        <>
          <label>One of the app's services<select value={key} onChange={(e) => setKey(e.target.value)}>{others.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select></label>
          <div className="row"><button className="btn small" disabled={!key} onClick={() => onPick(key)}>Add</button><button className="btn quiet small" onClick={() => setFresh(true)}>It is not in the list</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
        </>
      ) : (
        <>
          <label>A service the app does not have yet<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="its name, e.g. SixtyFour" /></label>
          <label>What it is<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="in a line, e.g. the vendor that scans for exposure" /></label>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>It is added to the app's services (Settings › Mocks), where every task can pick it. A name that is one already there, written differently, is refused.</p>
          <div className="row"><button className="btn small" disabled={!name.trim()} onClick={() => onNew(name.trim(), what.trim())}>Add to the app and this task</button>{others.length > 0 && <button className="btn quiet small" onClick={() => setFresh(false)}>Pick one the app has</button>}<button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
        </>
      )}
    </div>
  )
}

interface CallFields { method: string; path: string; what: string }
/** A call's fields: one of the service's endpoints picked from its list, or a new one, which is added to the service in Settings. Its service is where it sits, never typed. */
function CallForm({ start, label = 'Save', known = [], steps, serviceName, onSave, onCancel }: { start?: TaskCall; label?: string; /** The service's endpoints not yet on the task's list. */ known?: MockEndpoint[]; /** How many next steps come with one of them. */ steps?: (key: string) => number; serviceName?: string; onSave: (b: CallFields) => void; onCancel: () => void }) {
  const [pick, setPick] = useState(!start && known.length ? known[0].key : '')
  const [method, setMethod] = useState(start?.method ?? 'GET')
  const [path, setPath] = useState(start?.path ?? '')
  const [what, setWhat] = useState(start?.what ?? '')
  const picked = known.find((e) => e.key === pick)
  return (
    <div className="mock-edit" style={{ marginTop: 0 }}>
      {!start && known.length > 0 && (
        <label>One of {serviceName}'s endpoints<select value={pick} onChange={(e) => setPick(e.target.value)}>
          {known.map((e) => { const n = steps?.(e.key) ?? 0; return <option key={e.key} value={e.key}>{e.method} {e.path}{n ? ` (with its next step${n === 1 ? '' : 's'})` : ''}</option> })}
          <option value="">A new one…</option>
        </select></label>
      )}
      {!picked && (
        <>
          <div className="task-calls-call">
            <label>Method<select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label>The call<input className="mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/runs/{id}/status" /></label>
          </div>
          {!start && serviceName && <p className="faint" style={{ margin: 0, fontSize: 13 }}>This is added to {serviceName} in Settings, as one of its endpoints.</p>}
        </>
      )}
      <label>What this task needs from it<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="what must come back, and the cases it has to show" /></label>
      <div className="row"><button className="btn small" disabled={!picked && !path.trim()} onClick={() => onSave(picked ? { method: picked.method, path: picked.path, what: what.trim() } : { method, path: path.trim(), what: what.trim() })}>{label}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
