/**
 * One endpoint's data (engine/src/mock-serve.ts), wherever the endpoint is shown: in the app's settings, where it
 * is the app's, and on a task's Data step, where it is the app's until the task puts its own in place of it.
 *
 * Data is added as a file: a real response the service sent (kept on this computer, and faked; for a sensitive
 * endpoint faked at once and not kept), or one the person states holds nothing real. Everything here can be
 * replaced and removed.
 */
import { useState } from 'react'
import { Badge } from './Badge'
import { engine, type EndpointItem, type MockEndpoint } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function EndpointDataCell({ appId, mockKey, serviceName, endpoint: e, issueId, canAsk, onChanged }: {
  appId: string; mockKey: string; serviceName: string; endpoint: MockEndpoint
  /** On a task: the app's data is shown until the task has its own. None: the app's settings. */ issueId?: string
  /** Is there a task whose agent makes the fake of a real response? */ canAsk: boolean; onChanged: () => void | Promise<void>
}) {
  const [open, setOpen] = useState<null | 'app' | 'task'>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const own = issueId ? e.data.task : null
  const item = own ?? e.data.app
  const call = `${e.method} ${e.path}`
  const act = async (fn: () => Promise<string | null | void>) => { try { setError(null); setSaid((await fn()) ?? null); setOpen(null); await onChanged() } catch (x) { setError(err(x)) } }
  const give = (level: 'app' | 'task') => (files: File[], real: boolean) => act(async () => {
    const r = await engine.giveEndpointData(appId, mockKey, e.key, files, { real, issueId: level === 'task' ? issueId : null })
    if (r.kept === 'faked') return `Faked. The original was not kept.${r.maybeStructure?.length ? ` These look like structure and were replaced all the same: ${r.maybeStructure.join(', ')}.` : ''}`
    if (r.kept === 'recorded') return r.asked ? 'Kept on this computer. The task\'s agent is making the fake.' : 'Kept on this computer. It is faked once a task takes this service up.'
    return null
  })
  const remove = (level: 'app' | 'task') => {
    const it = level === 'task' ? own : e.data.app
    const what = level === 'task' ? `Go back to the app's data for ${call}? This task's own is removed` : `Remove the data of ${call}?`
    if (window.confirm(`${what}${it?.recorded ? (level === 'task' ? ', and its real response is deleted from this computer.' : ' Its real response is deleted from this computer too.') : level === 'task' ? '.' : ''}`)) void act(() => engine.removeEndpointData(appId, mockKey, e.key, { issueId: level === 'task' ? issueId : null, real: true }).then(() => null))
  }
  return (
    <div className="endpoint-data" data-component="EndpointData" data-endpoint={e.key}>
      {issueId && item && <div>{own ? <Badge tone="accent">This task's own</Badge> : <span className="faint">From the app's settings</span>}</div>}
      <ItemSays item={item} canAsk={canAsk} />
      {said && <div className="faint">{said}</div>}
      {error && <div className="mock-data-warn">{error}</div>}
      {open ? <GiveForm call={call} sensitive={!!e.sensitive} note={open === 'app' && issueId ? `This becomes ${serviceName}'s data in Settings: every task gets it unless it has its own.` : open === 'task' ? 'For this task alone. Other tasks keep the app\'s.' : null} onGive={give(open)} onCancel={() => setOpen(null)} /> : (
        <div className="row">
          {!issueId && <button className="btn quiet small" aria-label={`${item ? 'Replace' : 'Add'} the data of ${call}`} onClick={() => setOpen('app')}>{item ? 'Replace' : 'Add data'}</button>}
          {!issueId && item && <button className="btn quiet small" aria-label={`Remove the data of ${call}`} onClick={() => remove('app')}>Remove</button>}
          {issueId && own && <button className="btn quiet small" aria-label={`Replace this task's data of ${call}`} onClick={() => setOpen('task')}>Replace</button>}
          {issueId && own && <button className="btn quiet small" aria-label={`Go back to the app's data of ${call}`} onClick={() => remove('task')}>Back to the app's</button>}
          {issueId && !own && item && <button className="btn quiet small" aria-label={`Override the data of ${call} for this task`} onClick={() => setOpen('task')}>Override</button>}
          {issueId && !own && !item && <button className="btn quiet small" aria-label={`Add the data of ${call}`} onClick={() => setOpen('app')}>Add data</button>}
        </div>
      )}
    </div>
  )
}

function ItemSays({ item, canAsk }: { item: EndpointItem | null; canAsk: boolean }) {
  if (!item) return <div className="faint">No data: answered with what the mock's server makes up.</div>
  return (
    <>
      {item.recorded && <div><Badge tone="warn">Real · this computer only</Badge> {item.recorded.how === 'given' ? 'A response you gave' : 'Recorded in a live run'}, {day(item.recorded.at)}</div>}
      {item.safe && <div><Badge tone={item.safe.kind === 'faked' ? 'ok' : 'neutral'}>{item.safe.kind === 'faked' ? 'Faked' : 'Provided'}</Badge> <span title={item.safe.note}>{item.safe.kind === 'faked' ? (item.recorded ? 'A fake of it' : 'A fake; the original was not kept') : 'A file stated to hold nothing real'}: {item.safe.files.join(', ')}</span></div>}
      {item.recorded && !item.safe && <div className="mock-data-warn">Not faked yet, so nothing of it is served. {canAsk ? 'The task\'s agent makes the fake.' : 'It is faked once a task takes this service up.'}</div>}
      {item.safe?.stale && <div className="faint">The fake is of an older response than the one above.</div>}
    </>
  )
}

/** A file for one endpoint, and what it is: a response the service sent, or something that holds nothing real. */
function GiveForm({ call, sensitive, note, onGive, onCancel }: { call: string; sensitive: boolean; note: string | null; onGive: (files: File[], real: boolean) => Promise<void>; onCancel: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [real, setReal] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mock-edit" data-component="GiveEndpointData">
      <label>What {call} answers with<input type="file" multiple aria-label={`A file for ${call}`} onChange={(ev) => setFiles([...(ev.target.files ?? [])])} /></label>
      <label className="mock-check"><input type="radio" name={`kind-${call}`} checked={real} onChange={() => setReal(true)} /> A response the service really sent</label>
      <label className="mock-check"><input type="radio" name={`kind-${call}`} checked={!real} onChange={() => setReal(false)} /> I wrote this, or made it up: it holds nothing real</label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        {!real ? 'It is used as it is, and may go to a reviewer. Where a real response of this service is on this computer, it is checked against it.'
          : sensitive ? 'This call is sensitive: the file is faked at once and the original is not kept. Only the fake is ever stored or served.'
          : 'It is kept on this computer only, never exported. A fake is made of it, and a reviewer gets the fake.'}
        {note ? ` ${note}` : ''}
      </p>
      <div className="row"><button className="btn small" disabled={!files.length || busy} onClick={async () => { setBusy(true); try { await onGive(files, real) } finally { setBusy(false) } }}>{busy ? 'Adding…' : 'Add it'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
