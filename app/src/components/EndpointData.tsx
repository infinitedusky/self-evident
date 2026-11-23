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
import { engine, type EndpointItem, type Fixture, type MockEndpoint, type TestFile } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function EndpointDataCell({ appId, mockKey, serviceName, endpoint: e, issueId, written = false, canAsk, onChanged }: {
  appId: string; mockKey: string; serviceName: string; endpoint: MockEndpoint
  /** On a task: the app's data is shown until the task has its own. None: the app's settings. */ issueId?: string
  /** The service has a server written for it, which answers a call that has no data. Otherwise such a call fails. */ written?: boolean
  /** Is there a task whose agent makes the fake of a real response? */ canAsk: boolean; onChanged: () => void | Promise<void>
}) {
  const [open, setOpen] = useState<null | 'app' | 'task'>(null)
  // Fields mapped from a fixture: a table of its database, or one of its files. Which, while the form is open.
  const [source, setSource] = useState<null | 'table' | 'file'>(null)
  const filling = source === 'table', mapping = source === 'file'
  const setFilling = (on: boolean) => setSource(on ? 'table' : null), setMapping = (on: boolean) => setSource(on ? 'file' : null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [faking, setFaking] = useState(false)
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
  // The fake of the saved real response, made now. Refused while something real is still in it: then it is the task's agent's to say what is structure.
  const makeFake = async () => {
    setFaking(true)
    try { await act(async () => { const r = await engine.fakeEndpoint(appId, mockKey, e.key, own?.recorded ? issueId : null); return `Faked: ${r.replaced} value${r.replaced === 1 ? '' : 's'} replaced, ${r.kept} kept as structure. Checked against the real response.` }) } finally { setFaking(false) }
  }
  const remove = (level: 'app' | 'task') => {
    const it = level === 'task' ? own : e.data.app
    const what = level === 'task' ? `Go back to the app's data for ${call}? This task's own is removed` : `Remove the data of ${call}?`
    if (window.confirm(`${what}${it?.recorded ? (level === 'task' ? ', and its real response is deleted from this computer.' : ' Its real response is deleted from this computer too.') : level === 'task' ? '.' : ''}`)) void act(() => engine.removeEndpointData(appId, mockKey, e.key, { issueId: level === 'task' ? issueId : null, real: true }).then(() => null))
  }
  return (
    <div className="endpoint-data" data-component="EndpointData" data-endpoint={e.key}>
      <ItemSays item={item} written={written} own={!!own} />
      {item?.recorded && !item.safe && <div className="row"><button className="btn small" disabled={faking} aria-label={`Make the fake version of ${call}`} onClick={() => void makeFake()}>{faking ? 'Making it…' : 'Make fake version'}</button></div>}
      {/* Which version a person's own runs get, where there is a real response to choose: this endpoint's own switch. */}
      {item?.recorded && !e.sensitive && (() => {
        const f = e.data.faked ?? { app: true, task: null }, mine = issueId ? f.task : null, on = mine ?? f.app
        return (
          <div className="endpoint-faked">
            <label className="mock-check"><input type="checkbox" aria-label={`Use the faked version of ${call}`} checked={on} onChange={(ev) => void act(() => engine.setEndpointFaked(appId, mockKey, e.key, ev.target.checked, issueId ?? null).then(() => null))} /> Use faked version</label>
            <span className="faint">{on ? 'Your prototype and smoke test get the faked version.' : 'Your prototype and smoke test get the real response: this computer only.'} A reviewer always gets the faked one.{issueId ? (mine === null ? " The app's setting." : " This task's own.") : ''}</span>
            {issueId && mine !== null && <button className="lv-act" aria-label={`Follow the app again for ${call}`} onClick={() => void act(() => engine.setEndpointFaked(appId, mockKey, e.key, null, issueId).then(() => null))}>Follow the app</button>}
          </div>
        )
      })()}
      {/* The data is a template: a fixture supplies who it is for. */}
      {source && item?.safe && <div className="mock-edit" style={{ marginBottom: 0 }}><label>Map fields from<select aria-label={`Where the fields of ${call} come from`} value={source} onChange={(ev) => setSource(ev.target.value as 'table' | 'file')}><option value="table">A table of the fixture's database</option><option value="file">One of the fixture's files</option></select></label></div>}
      {filling && item?.safe && <FillForm appId={appId} call={call} columns={item.safe.columns ?? []} was={item.safe.madeFor} onCancel={() => setFilling(false)} onFill={(b) => act(async () => { const r = await engine.assignFixture(appId, mockKey, e.key, { ...b, issueId: own ? issueId : null }); setFilling(false); return `Filled out for ${r.madeFor.who}.` })} />}
      {/* Or a file a tester brings supplies who: only the mapping is kept, and it is worked out for the version of the file each place uses. */}
      {mapping && item?.safe && <FileMapForm appId={appId} issueId={issueId} call={call} columns={item.safe.columns ?? []} was={item.safe.fromFile} onCancel={() => setMapping(false)}
        onSave={(b) => act(async () => { const r = await engine.mapFromFile(appId, mockKey, e.key, { ...b, issueId: own ? issueId : null }); setMapping(false); return r.fromFile ? `It answers for the people in ${r.fromFile.file}.` : 'No longer mapped from a file.' })} />}
      {said && <div className="faint">{said}</div>}
      {error && <div className="mock-data-warn" style={{ whiteSpace: 'pre-wrap' }}>{error}{/^refused/.test(error) && canAsk && <div className="lv-line" style={{ marginTop: 4 }}><span>The task's agent can say which of these is structure and make it.</span><button className="lv-act" aria-label={`Ask the task's agent to make the fake of ${call}`} onClick={() => void act(async () => { await engine.mineMock(appId, mockKey); return 'Asked. Its conversation shows how far it is.' })}>Ask the task's agent</button></div>}</div>}
      {open ? <GiveForm call={call} sensitive={!!e.sensitive} note={open === 'app' && issueId ? `This becomes ${serviceName}'s data in Settings: every task gets it unless it has its own.` : open === 'task' ? 'For this task alone. Other tasks keep the app\'s.' : null} onGive={give(open)} onCancel={() => setOpen(null)} /> : (
        <div className="lv-line">
          {issueId && item && !own && <span>From the app's settings</span>}
          {item?.safe && !filling && (item.safe.madeFor ? <span>For <strong>{item.safe.madeFor.who}</strong> of the fixture {item.safe.madeFor.fixture}</span> : !item.safe.fromFile && <span title="The app may send people this has no answer for.">Not made for a fixture's people</span>)}
          {item?.safe?.fromFile && !mapping && <span>Answers for the people in <strong>{item.safe.fromFile.file}</strong></span>}
          {item?.safe && !source && (!issueId || own || !e.data.task) && <button className="lv-act" aria-label={`Map fields of ${call} from a fixture`} title="Set columns of this data from a table of the fixture's database, or from one of its files" onClick={() => setSource(item.safe?.fromFile && !item.safe.madeFor ? 'file' : 'table')}>{item.safe.fromFile || item.safe.madeFor ? 'Change the mapping' : 'Map fields from a fixture'}</button>}
          {item?.recorded && item.safe?.kind === 'faked' && <button className="lv-act" disabled={faking} aria-label={`Make the fake version of ${call} again`} title="From the real response saved here, with what was said to be structure" onClick={() => void makeFake()}>{faking ? 'Making it…' : 'Make the fake again'}</button>}
          {!issueId && <button className="lv-act" aria-label={`${item ? 'Replace' : 'Add'} the data of ${call}`} onClick={() => setOpen('app')}>{item ? 'Replace' : 'Add data'}</button>}
          {!issueId && item && <button className="lv-act" aria-label={`Remove the data of ${call}`} onClick={() => remove('app')}>Remove</button>}
          {issueId && own && <button className="lv-act" aria-label={`Replace this task's data of ${call}`} onClick={() => setOpen('task')}>Replace</button>}
          {issueId && own && <button className="lv-act" aria-label={`Go back to the app's data of ${call}`} onClick={() => remove('task')}>Back to the app's</button>}
          {issueId && !own && item && <button className="lv-act" aria-label={`Override the data of ${call} for this task`} onClick={() => setOpen('task')}>Override</button>}
          {issueId && !own && !item && <button className="lv-act" aria-label={`Add the data of ${call}`} onClick={() => setOpen('app')}>Add data</button>}
        </div>
      )}
    </div>
  )
}

function ItemSays({ item, written, own }: { item: EndpointItem | null; written: boolean; /** It is the task's own, in place of the app's. */ own: boolean }) {
  if (!item) return <div className="faint">{written ? 'No data: answered with what the server written for it makes up.' : 'No data yet: a call to it fails until some is added.'}</div>
  return (
    <>
      {item.recorded && <div><Badge tone="warn">Real · this computer only</Badge> {item.recorded.how === 'given' ? 'A response you gave' : 'Recorded in a live run'}, {day(item.recorded.at)}{own && !item.safe && <> <Badge tone="accent">This task's own</Badge></>}</div>}
      {item.safe && <div><Badge tone={item.safe.kind === 'faked' ? 'ok' : 'neutral'}>{item.safe.kind === 'faked' ? 'Faked' : 'Provided'}</Badge> <span title={item.safe.note}>{item.safe.kind === 'faked' ? (item.recorded ? 'A fake of it' : 'A fake; the original was not kept') : 'A file stated to hold nothing real'}: {item.safe.files.join(', ')}</span>{own && <> <Badge tone="accent">This task's own</Badge></>}</div>}
      {/* What the mapping changes in that data, said where the data is: which fields, and from where. */}
      {item.safe?.fromFile && <div className="lv-sub" style={{ margin: 0 }} data-overridden="file" title={Object.entries(item.safe.fromFile.map).map(([c, from]) => `${c} ← ${from || '(left empty)'}`).join('\n')}>Overridden fields, from <strong>{item.safe.fromFile.file}</strong>: {Object.entries(item.safe.fromFile.map).map(([c, from], n) => <span key={c}>{n > 0 && ', '}<code>{c}</code>{from && from !== c ? <> ← {from}</> : !from ? ' (empty)' : null}</span>)}</div>}
      {item.safe?.madeFor && <div className="lv-sub" style={{ margin: 0 }} data-overridden="table" title={Object.entries(item.safe.madeFor.map).map(([c, from]) => `${c} ← ${from}`).join('\n')}>Overridden fields, from <strong>{item.safe.madeFor.table}</strong> of {item.safe.madeFor.fixture}: {Object.entries(item.safe.madeFor.map).map(([c, from], n) => <span key={c}>{n > 0 && ', '}<code>{c}</code>{from !== c ? <> ← {from}</> : null}</span>)}</div>}
      {item.recorded && !item.safe && <div className="mock-data-warn">Not faked yet, so nothing of it is served.</div>}
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

/** The table of a fixture its people are in: the one whose columns say who someone is (a name, an email), then one named for people; never simply the largest. */
export function peopleTable(tables: Fixture['tables']): string {
  const score = (t: Fixture['tables'][number]) => t.columns.filter((c) => /^(first_name|last_name|full_name|name|work_email|email)$/i.test(c)).length * 2 + (/employee|people|person|user|member|contact|customer|staff/i.test(t.name) ? 3 : 0) + (t.columns.some((c) => /email/i.test(c)) ? 2 : 0)
  return [...tables].sort((a, b) => score(b) - score(a))[0]?.name ?? ''
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
  const [touched, setTouched] = useState(!!was) // the columns are the person's once they change one: a guess no longer replaces them
  const edit = (m: [string, string][]) => { setTouched(true); setMap(m) }
  const [busy, setBusy] = useState(false)
  const fx = fixtures?.find((f) => f.name === fixture), tb = fx?.tables.find((t) => t.name === table)
  useEffect(() => { void engine.fixtures(appId).then((r) => { setFixtures(r.fixtures); const f = r.fixtures.find((x) => x.name === fixture) ?? r.fixtures[0]; if (f) { setFixture(f.name); setTable((t) => (f.tables.some((x) => x.name === t) ? t : peopleTable(f.tables))) } }).catch(() => setFixtures([])) }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fixture || !table) return
    void engine.fixtureRows(appId, fixture, table).then((r) => {
      setRows(r.rows)
      // Columns the data and the fixture both have, that say who someone is, are theirs to begin with: guessed again for another table, until the person changes one.
      if (!touched) setMap(columns.filter((c) => r.columns.includes(c) && /email|name$/i.test(c)).map((c) => [c, c] as [string, string]))
    }).catch(() => setRows([]))
  }, [appId, fixture, table]) // eslint-disable-line react-hooks/exhaustive-deps
  if (fixtures && !fixtures.length) return <div className="mock-edit"><p className="faint" style={{ margin: 0 }}>This app has no fixtures yet. One is kept from a prototype's data, shared with the app.</p><div className="row"><button className="btn quiet small" onClick={onCancel}>Close</button></div></div>
  const people = Math.floor(Number(count))
  const ok = !!fx && !!tb && people >= 1 && people <= 200 && map.length > 0 && map.every(([d, f]) => d && f)
  return (
    <div className="mock-edit" data-component="FillFromFixture">
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>This data is the template. Each person chosen gets its rows, with the columns below set from them, so the app sends the people this mock has answers for.</p>
      <div className="task-calls-call">
        <label>Fixture<select value={fixture} onChange={(e) => { setFixture(e.target.value); setTable(peopleTable(fixtures?.find((f) => f.name === e.target.value)?.tables ?? [])); setRow(0) }}>{(fixtures ?? []).map((f) => <option key={f.name}>{f.name}</option>)}</select></label>
        <label>Its people are in<select value={table} onChange={(e) => { setTable(e.target.value); setRow(0) }}>{(fx?.tables ?? []).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows})</option>)}</select></label>
      </div>
      <div className="task-calls-call">
        <label>How many people<input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label>Starting from<select value={row} onChange={(e) => setRow(Number(e.target.value))}>{rows.map((r) => <option key={r.index} value={r.index}>{r.label}</option>)}</select></label>
      </div>
      <div>
        <div className="task-calls-sub">Which columns are theirs</div>
        <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>Each line sets one column of the data from one column of the person. Include the one the app matches an answer to a person by: an id or an email.</p>
        {!map.length && <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>None yet: no column of the data has the same name as one of {table || 'the table'}'s. Add the first.</p>}
        {map.map(([d, f], n) => (
          <div className="row" key={n} style={{ marginBottom: 4 }}>
            <select aria-label={`Data column ${n + 1}`} value={d} onChange={(e) => edit(map.map((x, i) => (i === n ? [e.target.value, x[1]] : x)))}><option value="">a column of the data…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select>
            <span className="faint">is their</span>
            <select aria-label={`Fixture column ${n + 1}`} value={f} onChange={(e) => edit(map.map((x, i) => (i === n ? [x[0], e.target.value] : x)))}><option value="">a column of {table}…</option>{(tb?.columns ?? []).map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn quiet small" aria-label={`Remove column ${n + 1}`} onClick={() => edit(map.filter((_, i) => i !== n))}>×</button>
          </div>
        ))}
        <button className="btn quiet small" onClick={() => edit([...map, ['', '']])}>Add a column</button>
      </div>
      <div className="row"><button className="btn small" aria-label={`Fill the data of ${call} out`} disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onFill({ fixture, table, row, count: people, map: Object.fromEntries(map) }) } finally { setBusy(false) } }}>{busy ? 'Filling…' : 'Fill it out'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

/** A file a tester brings supplies who the data is for. Only the columns to override are listed: each line picks a column of the response, or names a new one it lacks, and says which column of the file it is set from (or that it is left empty). */
interface MapLine { col: string; /** Not one of the response's: its name is typed. */ fresh: boolean; from: string }
function FileMapForm({ appId, issueId, call, columns, was, onSave, onCancel }: { appId: string; issueId?: string; call: string; columns: string[]; was?: NonNullable<EndpointItem['safe']>['fromFile']; onSave: (b: { file: string | null; map?: Record<string, string> }) => Promise<void>; onCancel: () => void }) {
  const [files, setFiles] = useState<TestFile[] | null>(null)
  const [file, setFile] = useState(was?.file ?? '')
  const [lines, setLines] = useState<MapLine[]>(Object.entries(was?.map ?? {}).map(([col, from]) => ({ col, fresh: !columns.includes(col), from })))
  const [touched, setTouched] = useState(!!was)
  const [busy, setBusy] = useState(false)
  const f = files?.find((x) => x.name === file)
  // Columns the response and the file both have, that say who someone is, are theirs to begin with.
  const guess = (x?: TestFile): MapLine[] => columns.filter((c) => x?.columns?.includes(c) && /email|name$/i.test(c)).map((c) => ({ col: c, fresh: false, from: c }))
  useEffect(() => { void engine.testFiles(appId, issueId).then((l) => { const withColumns = l.filter((x) => x.columns?.length); setFiles(withColumns); const first = withColumns.find((x) => x.name === file) ?? withColumns[0]; if (first) { setFile(first.name); if (!touched) setLines(guess(first)) } }).catch(() => setFiles([])) }, [appId, issueId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (files && !files.length) return <div className="mock-edit"><p className="faint" style={{ margin: 0 }}>There is no CSV among the fixtures' files yet. Add one under Fixtures › Files: only a file with columns has fields to map.</p><div className="row"><button className="btn quiet small" onClick={onCancel}>Close</button></div></div>
  const edit = (n: number, to: Partial<MapLine>) => { setTouched(true); setLines(lines.map((x, i) => (i === n ? { ...x, ...to } : x))) }
  const named = lines.filter((l) => l.col.trim())
  const ok = !!f && lines.length > 0 && named.length === lines.length && new Set(named.map((l) => l.col.trim())).size === named.length && lines.some((l) => l.from)
  const save = async (b: { file: string | null; map?: Record<string, string> }) => { setBusy(true); try { await onSave(b) } finally { setBusy(false) } }
  const free = (mine: string) => columns.filter((c) => c === mine || !lines.some((l) => !l.fresh && l.col === c))
  return (
    <div className="mock-edit" data-component="MapFromFile">
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>This data is the template. Each row of the file is a person, and each gets the template's rows with the columns below set from them, so the mock answers for whoever the tester brings in.{f?.has.real ? ' A place set to the real version is answered for the real person; a reviewer always for the fake.' : ''}</p>
      <label>File<select value={file} onChange={(e) => { setFile(e.target.value); if (!touched) setLines(guess(files?.find((x) => x.name === e.target.value))) }}>{(files ?? []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select></label>
      <div>
        <div className="task-calls-sub">Columns set from the file</div>
        <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>Only these are changed; every other column of the response stays as faked. Include the one the app matches an answer to a person by.</p>
        <div className="map-cols">
          {lines.map((l, n) => (
            <div className="map-col" key={n}>
              <span className="map-col-name">
                <select aria-label={`Response column ${n + 1}`} value={l.fresh ? '\u0000new' : l.col} onChange={(e) => edit(n, e.target.value === '\u0000new' ? { fresh: true, col: '' } : { fresh: false, col: e.target.value })}>
                  {!l.fresh && !l.col && <option value="">a column of the response…</option>}
                  {free(l.fresh ? '' : l.col).map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value={'\u0000new'}>＋ a new column…</option>
                </select>
                {l.fresh && <input autoFocus aria-label={`Name of new column ${n + 1}`} placeholder="its name, as the app reads it" value={l.col} onChange={(e) => edit(n, { col: e.target.value })} />}
              </span>
              <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <select aria-label={`File column ${n + 1}`} value={l.from} onChange={(e) => edit(n, { from: e.target.value })}><option value="">(left empty)</option>{(f?.columns ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <button className="btn quiet small" aria-label={`Remove column ${n + 1}`} onClick={() => { setTouched(true); setLines(lines.filter((_, i) => i !== n)) }}>×</button>
              </span>
            </div>
          ))}
        </div>
        <button className="btn quiet small" style={{ marginTop: 6 }} onClick={() => { setTouched(true); setLines([...lines, { col: '', fresh: false, from: f?.columns?.[0] ?? '' }]) }}>Add a column</button>
      </div>
      <div className="row">
        <button className="btn small" aria-label={`Save the mapping of ${call}`} disabled={!ok || busy} onClick={() => void save({ file, map: Object.fromEntries(lines.map((l) => [l.col.trim(), l.from])) })}>{busy ? 'Saving…' : 'Save the mapping'}</button>
        {was && <button className="btn quiet small" disabled={busy} onClick={() => void save({ file: null })}>Stop mapping</button>}
        <button className="btn quiet small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
