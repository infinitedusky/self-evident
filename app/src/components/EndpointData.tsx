/**
 * One endpoint's data (engine/src/mock-serve.ts), wherever the endpoint is shown: in the app's settings, where it
 * is the app's, and on a task's Data step, where it is the app's until the task puts its own in place of it.
 *
 * Data is added as a file: a real response the service sent (kept on this computer, and faked; for a sensitive
 * endpoint faked at once and not kept), or one the person states holds nothing real. Everything here can be
 * replaced and removed.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type EndpointItem, type Fixture, type MockEndpoint } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function EndpointDataCell({ appId, mockKey, serviceName, endpoint: e, issueId, written = false, canAsk, onChanged }: {
  appId: string; mockKey: string; serviceName: string; endpoint: MockEndpoint
  /** On a task: the app's data is shown until the task has its own. None: the app's settings. */ issueId?: string
  /** The service has a server written for it, which answers a call that has no data. Otherwise such a call fails. */ written?: boolean
  /** Is there a task whose agent makes the fake of a real response? */ canAsk: boolean; onChanged: () => void | Promise<void>
}) {
  const [open, setOpen] = useState<null | 'app' | 'task'>(null)
  const [filling, setFilling] = useState(false)
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
      <ItemSays item={item} canAsk={canAsk} written={written} />
      {/* Which version a person's own runs get, where there is a real response to choose: this endpoint's own switch. */}
      {item?.recorded && !e.sensitive && (() => {
        const f = e.data.faked ?? { app: true, task: null }, mine = issueId ? f.task : null, on = mine ?? f.app
        return (
          <div className="endpoint-faked">
            <label className="mock-check"><input type="checkbox" aria-label={`Use the faked version of ${call}`} checked={on} onChange={(ev) => void act(() => engine.setEndpointFaked(appId, mockKey, e.key, ev.target.checked, issueId ?? null).then(() => null))} /> Use faked version</label>
            <span className="faint">{on ? 'Your prototype and smoke test get the faked version.' : 'Your prototype and smoke test get the real response: this computer only.'} A reviewer always gets the faked one.{issueId ? (mine === null ? " The app's setting." : " This task's own.") : ''}</span>
            {issueId && mine !== null && <button className="btn quiet small" aria-label={`Follow the app again for ${call}`} onClick={() => void act(() => engine.setEndpointFaked(appId, mockKey, e.key, null, issueId).then(() => null))}>Follow the app</button>}
          </div>
        )
      })()}
      {/* The data is a template: a fixture supplies who it is for. */}
      {item?.safe && (filling
        ? <FillForm appId={appId} call={call} columns={item.safe.columns ?? []} was={item.safe.madeFor} onCancel={() => setFilling(false)} onFill={(b) => act(async () => { const r = await engine.assignFixture(appId, mockKey, e.key, { ...b, issueId: own ? issueId : null }); setFilling(false); return `Filled out for ${r.madeFor.who}.` })} />
        : <div className="endpoint-faked">
            {item.safe.madeFor ? <span>For <strong>{item.safe.madeFor.who}</strong> <span className="faint">of the fixture {item.safe.madeFor.fixture}</span></span> : <span className="faint">Not made for a fixture's people: the app may send people this has no answer for.</span>}
            {(!issueId || own || !e.data.task) && <button className="btn quiet small" aria-label={`Fill the data of ${call} out for fixture people`} onClick={() => setFilling(true)}>{item.safe.madeFor ? 'Change' : 'Fill out for fixture people'}</button>}
          </div>)}
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

function ItemSays({ item, canAsk, written }: { item: EndpointItem | null; canAsk: boolean; written: boolean }) {
  if (!item) return <div className="faint">{written ? 'No data: answered with what the server written for it makes up.' : 'No data yet: a call to it fails until some is added.'}</div>
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
      <label className="mock-check"><input type="checkbox" checked={real} onChange={(ev) => setReal(ev.target.checked)} /> This is real data</label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        {!real ? 'It is used exactly as it is, and may go to a reviewer. Leave the box unticked only for a file that holds nothing real, such as one you made up.'
          : sensitive ? 'Real data is always faked. This call is sensitive, so the file is faked at once and the original is not kept.'
          : 'Real data is always faked: the original is kept on this computer only, and a faked version is made of it, which is what a reviewer gets.'}
        {note ? ` ${note}` : ''}
      </p>
      <div className="row"><button className="btn small" disabled={!files.length || busy} onClick={async () => { setBusy(true); try { await onGive(files, real) } finally { setBusy(false) } }}>{busy ? 'Adding…' : 'Add it'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

/** The data is a template; a fixture supplies who. Pick the fixture, where its people are, who to start from and how many, and which columns of the data are theirs. */
function FillForm({ appId, call, columns, was, onFill, onCancel }: { appId: string; call: string; columns: string[]; was?: NonNullable<EndpointItem['safe']>['madeFor']; onFill: (b: { fixture: string; table: string; row: number; count: number; map: Record<string, string> }) => Promise<void>; onCancel: () => void }) {
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null)
  const [fixture, setFixture] = useState(was?.fixture ?? '')
  const [table, setTable] = useState(was?.table ?? '')
  const [rows, setRows] = useState<{ index: number; label: string }[]>([])
  const [row, setRow] = useState(0)
  const [count, setCount] = useState(String(was?.people ?? 1)) // as typed: it may be empty while it is being changed
  const [map, setMap] = useState<[string, string][]>(Object.entries(was?.map ?? {}))
  const [busy, setBusy] = useState(false)
  const fx = fixtures?.find((f) => f.name === fixture), tb = fx?.tables.find((t) => t.name === table)
  useEffect(() => { void engine.fixtures(appId).then((r) => { setFixtures(r.fixtures); const f = r.fixtures.find((x) => x.name === fixture) ?? r.fixtures[0]; if (f) { setFixture(f.name); setTable((t) => (f.tables.some((x) => x.name === t) ? t : f.tables[0]?.name ?? '')) } }).catch(() => setFixtures([])) }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fixture || !table) return
    void engine.fixtureRows(appId, fixture, table).then((r) => {
      setRows(r.rows)
      // Columns the data and the fixture both have, that say who someone is, are theirs to begin with.
      setMap((m) => (m.length ? m : columns.filter((c) => r.columns.includes(c) && /email|name$/i.test(c)).map((c) => [c, c] as [string, string])))
    }).catch(() => setRows([]))
  }, [appId, fixture, table]) // eslint-disable-line react-hooks/exhaustive-deps
  if (fixtures && !fixtures.length) return <div className="mock-edit"><p className="faint" style={{ margin: 0 }}>This app has no fixtures yet. One is kept from a prototype's data, shared with the app.</p><div className="row"><button className="btn quiet small" onClick={onCancel}>Close</button></div></div>
  const people = Math.floor(Number(count))
  const ok = !!fx && !!tb && people >= 1 && people <= 200 && map.length > 0 && map.every(([d, f]) => d && f)
  return (
    <div className="mock-edit" data-component="FillFromFixture">
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>This data is the template. Each person chosen gets its rows, with the columns below set from them, so the app sends the people this mock has answers for.</p>
      <div className="task-calls-call">
        <label>Fixture<select value={fixture} onChange={(e) => { setFixture(e.target.value); setTable(fixtures?.find((f) => f.name === e.target.value)?.tables[0]?.name ?? ''); setRow(0) }}>{(fixtures ?? []).map((f) => <option key={f.name}>{f.name}</option>)}</select></label>
        <label>Its people are in<select value={table} onChange={(e) => { setTable(e.target.value); setRow(0) }}>{(fx?.tables ?? []).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows})</option>)}</select></label>
      </div>
      <div className="task-calls-call">
        <label>How many people<input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label>Starting from<select value={row} onChange={(e) => setRow(Number(e.target.value))}>{rows.map((r) => <option key={r.index} value={r.index}>{r.label}</option>)}</select></label>
      </div>
      <div>
        <div className="task-calls-sub">Which columns are theirs</div>
        {map.map(([d, f], n) => (
          <div className="row" key={n} style={{ marginBottom: 4 }}>
            <select aria-label={`Data column ${n + 1}`} value={d} onChange={(e) => setMap(map.map((x, i) => (i === n ? [e.target.value, x[1]] : x)))}><option value="">a column of the data…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select>
            <span className="faint">is their</span>
            <select aria-label={`Fixture column ${n + 1}`} value={f} onChange={(e) => setMap(map.map((x, i) => (i === n ? [x[0], e.target.value] : x)))}><option value="">a column of {table}…</option>{(tb?.columns ?? []).map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn quiet small" aria-label={`Remove column ${n + 1}`} onClick={() => setMap(map.filter((_, i) => i !== n))}>×</button>
          </div>
        ))}
        <button className="btn quiet small" onClick={() => setMap([...map, ['', '']])}>Add a column</button>
      </div>
      <div className="row"><button className="btn small" aria-label={`Fill the data of ${call} out`} disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onFill({ fixture, table, row, count: people, map: Object.fromEntries(map) }) } finally { setBusy(false) } }}>{busy ? 'Filling…' : 'Fill it out'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
