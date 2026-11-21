/**
 * What a task calls outside the app (engine/src/task-calls.ts), at the top of its Data step: one row a call, with
 * what the task needs from it and what answers it now. The agent lists them from the brief and the code; the person
 * adds any it missed. From a row the service's mock is made, the call added to a mock that lacks it, a real response
 * given for it, or the call tied by hand to one of the mock's endpoints.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type Mock, type TaskCall } from '../engine'

const err = (e: unknown) => String((e as Error)?.message ?? e)
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export function TaskCalls({ appId, issueId, mocks, version = 0, onChanged }: { appId: string; issueId: string; /** The app's mocks: for a service's name, and the endpoints a call can be tied to. */ mocks: Mock[]; /** Read again when it changes. */ version?: number; onChanged?: () => void }) {
  const [calls, setCalls] = useState<TaskCall[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  useEffect(() => { engine.taskCalls(issueId).then((c) => { setCalls(c); setError(null) }).catch((e) => setError(err(e))) }, [issueId, version])
  const act = async (fn: () => Promise<TaskCall[] | { calls: TaskCall[] }>) => { try { const r = await fn(); setCalls(Array.isArray(r) ? r : r.calls); setError(null); onChanged?.() } catch (e) { setError(err(e)) } }
  const services = [...new Set((calls ?? []).map((c) => c.service))]
  const real = (calls ?? []).filter((c) => c.state === 'answered' && c.endpoint?.real).length, code = (calls ?? []).filter((c) => c.state === 'answered' && !c.endpoint?.real).length, none = (calls ?? []).filter((c) => c.state !== 'answered').length
  return (
    <div className="task-calls" data-component="TaskCalls">
      <div className="task-block-head">
        <h3 className="mock-h3" style={{ margin: 0 }}>What this task calls</h3>
        <span className="row" style={{ display: 'flex', gap: 8 }}>
          {!!calls?.length && <button className="btn quiet small" onClick={() => { if (window.confirm('Clear this task\'s whole list of calls, yours among them? The mocks are not touched.')) void act(() => engine.clearTaskCalls(issueId)) }}>Clear the list</button>}
          <button className="btn quiet small" onClick={() => setAdding(!adding)}>Add a call</button>
        </span>
      </div>
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}
      {adding && <AddCall names={[...new Set([...mocks.map((m) => m.name), ...(calls ?? []).map((c) => c.serviceName)])]} onAdd={(b) => act(async () => { const r = await engine.addTaskCall(issueId, b); setAdding(false); return r })} onCancel={() => setAdding(false)} />}
      {calls === null ? (error ? null : <p className="muted">Loading…</p>)
        : !calls.length ? <div className="empty" style={{ marginTop: 8 }}>Not listed yet. Start this step with the agent and it lists every call the change makes outside the app, from the brief and the code, with what each has to answer. Or add one with Add a call: the service it is made to, the call, and what you need from it. A real response is then given on the call it answers.</div>
        : (
          <>
            <p className="faint" style={{ margin: '4px 0 8px', fontSize: 13 }}>{calls.length} call{calls.length === 1 ? '' : 's'} to {services.length} service{services.length === 1 ? '' : 's'}: {real} answered from a real response, {code} from the code, {none} with nothing to answer {none === 1 ? 'it' : 'them'}</p>
            {services.map((s) => {
              const mine = calls.filter((c) => c.service === s), m = mocks.find((x) => x.key === s) ?? null
              return (
                <div className="task-calls-service" key={s}>
                  <div className="task-calls-service-head">
                    <strong>{mine[0].serviceName}</strong>
                    {!mine[0].mock ? <Badge tone="bad">No mock</Badge> : mine[0].mock.status === 'needs_recording' ? <Badge tone="warn">Its mock is not built yet</Badge> : <Badge tone="ok">Has a mock</Badge>}
                    {!mine[0].mock && <button className="btn small" onClick={() => act(() => engine.coverTaskCall(issueId, mine[0].id))}>Create a mock of {mine[0].serviceName}</button>}
                  </div>
                  {mine.map((c) => <CallRow key={c.id} call={c} mock={m}
                    onCover={() => act(() => engine.coverTaskCall(issueId, c.id))}
                    onLink={(e) => act(() => engine.linkTaskCall(issueId, c.id, e))}
                    onRemove={() => act(() => engine.removeTaskCall(issueId, c.id))}
                    onEdit={(b) => act(() => engine.editTaskCall(issueId, c.id, b))}
                    names={[...new Set([...mocks.map((x) => x.name), ...calls.map((x) => x.serviceName)])]}
                    onGive={(files) => act(async () => {
                      // A file is the answer to this call: where nothing answers it yet, the mock is made (or the call added to it) first.
                      let mock = c.mock?.key, endpoint = c.endpoint?.key
                      if (!mock || !endpoint) { const made = (await engine.coverTaskCall(issueId, c.id)).calls.find((x) => x.id === c.id); mock = made?.mock?.key; endpoint = made?.endpoint?.key }
                      if (!mock || !endpoint) throw new Error(`nothing could be set up to answer ${c.method} ${c.path}`)
                      await engine.giveRecording(appId, mock, files, endpoint)
                      return engine.taskCalls(issueId)
                    })} />)}
                </div>
              )
            })}
          </>
        )}
    </div>
  )
}

function CallRow({ call: c, mock, names, onCover, onLink, onRemove, onEdit, onGive }: { call: TaskCall; mock: Mock | null; names: string[]; onCover: () => void; onLink: (endpoint: string | null) => void; onRemove: () => void; onEdit: (b: { service: string; method: string; path: string; what?: string }) => Promise<void>; onGive: (files: File[]) => void }) {
  const e = c.endpoint
  const [editing, setEditing] = useState(false)
  if (editing) return <div className="task-calls-row" style={{ gridTemplateColumns: '1fr' }}><CallForm names={names} start={c} onSave={(b) => void onEdit(b).then(() => setEditing(false))} onCancel={() => setEditing(false)} /></div>
  // A real response is given here, on the call it answers, whatever answers the call now.
  const give = (label: string) => <label className="mock-give-one" style={{ margin: 0 }}><input type="file" multiple aria-label={`A real response of ${c.method} ${c.path}`} onChange={(ev) => { const files = [...(ev.target.files ?? [])]; if (files.length) onGive(files); ev.target.value = '' }} /><span className="btn quiet small">{label}</span></label>
  return (
    <div className="task-calls-row" data-state={c.state}>
      <div>
        <span className="mock-method">{c.method}</span> <code>{c.path}</code>{c.by === 'user' && <span className="faint"> · added by you</span>}
        {c.what ? <div className="task-calls-what">Needs: {c.what}</div> : <div className="faint">Nothing said yet about what it has to answer.</div>}
      </div>
      <div>
        {c.state === 'answered' && e ? (
          <>
            <div>{e.real ? <><Badge tone="ok">A real response</Badge> {e.real.how === 'given' ? 'you gave' : 'recorded in a live run'}, {day(e.real.at)}</> : <><Badge tone="warn">From the code</Badge> no real response behind it</>}</div>
            <div className="faint">{c.mock?.status === 'needs_recording' ? 'Listed on the mock; its server is not built yet.' : e.files.length ? `Answered with ${e.files.join(', ')}` : 'Answered with what the mock\'s server makes up'}{c.linked ? ' · tied by hand' : ''}</div>
            <div className="row">
              {give(e.real ? 'Give a newer one' : 'Give a real response')}
              {c.linked && <button className="btn quiet small" onClick={() => onLink(null)}>Untie</button>}
            </div>
          </>
        ) : c.state === 'no_endpoint' ? (
          <>
            <div><Badge tone="bad">Not answered</Badge> {c.mock?.name} has a mock, and it lacks this call</div>
            <div className="row">
              {give('Give a real response')}
              <button className="btn quiet small" title="Without a real response: its shape is taken from the code" onClick={onCover}>Add it to the mock</button>
              {mock && mock.endpoints.length > 0 && (
                <select aria-label={`Tie ${c.method} ${c.path} to an endpoint of the mock`} value="" onChange={(ev) => { if (ev.target.value) onLink(ev.target.value) }}>
                  <option value="">or it is one the mock has…</option>
                  {mock.endpoints.map((x) => <option key={x.key} value={x.key}>{x.method} {x.path}</option>)}
                </select>
              )}
            </div>
          </>
        ) : (
          <>
            <div><Badge tone="bad">Not answered</Badge> {c.serviceName} has no mock</div>
            <div className="row">{give('Give a real response')}<span className="faint">Its mock is made with it.</span></div>
          </>
        )}
      </div>
      <span className="task-calls-tools"><button className="btn quiet small" aria-label={`Edit ${c.method} ${c.path}`} onClick={() => setEditing(true)}>Edit</button><button className="btn quiet small task-calls-remove" aria-label={`Remove ${c.method} ${c.path}`} title="Take it off this task's list" onClick={onRemove}>×</button></span>
    </div>
  )
}

function AddCall({ names, onAdd, onCancel }: { names: string[]; onAdd: (b: { service: string; method: string; path: string; what?: string }) => void; onCancel: () => void }) {
  return <div style={{ margin: '8px 0 12px' }} data-component="AddCall"><CallForm names={names} label="Add" onSave={onAdd} onCancel={onCancel} /></div>
}
/** A call's fields: for a new one, or one being changed. */
function CallForm({ names, start, label = 'Save', onSave, onCancel }: { names: string[]; start?: TaskCall; label?: string; onSave: (b: { service: string; method: string; path: string; what?: string }) => void; onCancel: () => void }) {
  const [service, setService] = useState(start?.serviceName ?? '')
  const [method, setMethod] = useState(start?.method ?? 'GET')
  const [path, setPath] = useState(start?.path ?? '')
  const [what, setWhat] = useState(start?.what ?? '')
  return (
    <div className="mock-edit" style={{ marginTop: 0 }}>
      <label>The service<input list="task-calls-services" value={service} onChange={(e) => setService(e.target.value)} placeholder="who is called, e.g. SixtyFour" /><datalist id="task-calls-services">{names.map((n) => <option key={n} value={n} />)}</datalist></label>
      <div className="task-calls-call">
        <label>Method<select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>The call<input className="mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/runs/{id}/status" /></label>
      </div>
      <label>What this task needs from it<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="what must come back, and the cases it has to show" /></label>
      <div className="row"><button className="btn small" disabled={!service.trim() || !path.trim()} onClick={() => onSave({ service: service.trim(), method, path: path.trim(), what: what.trim() })}>{label}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
