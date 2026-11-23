/**
 * The app's fixtures (engine/src/fixtures.ts): what is in the app's own database when it is tried. Each is a set of
 * made-up rows by table, kept in Evident with the ids it was saved with, so a mock's data can be filled out
 * for its people. On a task it also says which fixture the task's runs are built from: the one its data was made
 * for.
 *
 * One is made from the app's own seed in a press (its schema and seed commands, run on a database of its own:
 * minutes), opened to its tables and their rows, renamed and deleted. One can also be kept from a prototype's data
 * (its Data panel, "keep as a scenario", shared with the app).
 */
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from './Badge'
import { engine, type Fixture } from '../engine'

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
/** What the one made from the seed is called until it is renamed. */
const SEED = 'seed'

export function Fixtures({ appId, issueId, version = 0, files, onChanged }: { appId: string; /** A task: which fixture its runs are built from is said too. */ issueId?: string; /** Read again when it changes. */ version?: number; /** The section's second part, after the database: the files a tester brings (TestFiles). */ files?: React.ReactNode; /** A fixture was made, renamed or deleted: what names it elsewhere is read again. */ onChanged?: () => void | Promise<void> }) {
  const [got, setGot] = useState<Awaited<ReturnType<typeof engine.fixtures>> | null>(null)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const reload = () => engine.fixtures(appId, issueId).then(setGot).catch(() => setGot({ fixtures: [], used: null }))
  useEffect(() => { void reload() }, [appId, issueId, version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!got) return null
  const act = async (fn: () => Promise<string | null>) => { try { setError(null); setSaid(await fn()); await reload(); await onChanged?.() } catch (e) { setSaid(null); setError(err(e)) } }
  const make = async () => {
    if (got.fixtures.some((f) => f.name === SEED) && !window.confirm(`Make "${SEED}" again from the app's seed? The one there is replaced. Rename it first to keep it.`)) return
    setMaking(true)
    try { await act(async () => { const r = await engine.makeFixture(appId); return `Made "${r.name}" from the app's seed: ${Object.entries(r.tables).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t} ${n}`).join(', ')}${Object.keys(r.tables).length > 4 ? ` and ${Object.keys(r.tables).length - 4} more tables` : ''}. Rename it to say what it is.` }) } finally { setMaking(false) }
  }
  const can = got.make ?? { ok: false, missing: null }
  return (
    <div className="lv-section" data-component="Fixtures">
      <div className="lv-section-head"><h3>Fixtures</h3></div>
      <p className="lv-section-note">Made-up data this is tried on: the database it starts with, and the files a tester adds to it.</p>
      <div className="lv-group" data-part="database">
      <div className="lv-group-head">
        <h4>Database{got.fixtures.length > 0 && <span className="lv-count">{got.fixtures.length}</span>}</h4>
        {got.make && <span className="lv-end"><button className="btn quiet small" disabled={making || !can.ok} title={can.ok ? 'Its schema command and its seed command are run on a database of its own, which is dropped after' : `Not yet: ${can.missing}`} onClick={() => void make()}>{making ? 'Making it…' : 'Make one from the app\'s seed'}</button></span>}
      </div>
      <p className="lv-section-note">
        What is in the app's own database when it is tried: made-up rows, with ids that stay the same, so a mock's data can be filled out for a fixture's people.
        {issueId && <> {got.used ? <>This task's smoke test, and a new prototype of it, are built from <strong>{got.used}</strong>, the fixture its data was made for.</> : 'No data of this task is made for a fixture yet, so its smoke test is built from the app\'s default.'}</>}
      </p>
      {making && <p className="lv-note" role="status">Making a database from nothing, then running the app's schema and seed commands. This takes a few minutes; the page can be left.</p>}
      {said && !making && <p className="lv-note" role="status">{said}</p>}
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}
      {got.make && !can.ok && can.missing && <p className="lv-sub">One cannot be made from the app's seed yet: {can.missing}.</p>}
      {!got.fixtures.length ? !making && <div className="empty">No fixtures yet. {can.ok ? 'Make one from the app\'s seed, above. ' : ''}One can also be kept from a prototype's data: fill the prototype's database, then keep it as a scenario shared with the app.</div>
        : got.fixtures.map((f) => <FixtureItem key={f.name} appId={appId} fixture={f} used={got.used === f.name}
          onRename={(to) => act(async () => { await engine.renameFixture(appId, f.name, to); return null })}
          onDelete={() => { const n = f.madeFor ?? 0; if (window.confirm(`Delete the fixture "${f.name}"?${n ? ` The data of ${plural(n, 'endpoint')} was filled out for its people: that data stays as it is, and no longer says what a task's runs are built from.` : ''}`)) void act(async () => { await engine.deleteFixture(appId, f.name); return null }) }} />)}
      </div>
      {files}
    </div>
  )
}

function FixtureItem({ appId, fixture: f, used, onRename, onDelete }: { appId: string; fixture: Fixture; used: boolean; onRename: (to: string) => Promise<void>; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(f.name)
  const [shown, setShown] = useState<string | null>(null) // the table whose rows are shown
  const rows = f.tables.reduce((n, t) => n + t.rows, 0)
  const box = useRef<HTMLDetailsElement>(null)
  // Rename and Delete are the fixture's, so they sit on its own line beside its name, not over its tables. A press there does not fold it.
  const on = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); fn() }
  return (
    <details className="lv-item" open={used || undefined} data-fixture={f.name} ref={box}>
      <summary className="lv-item-head"><span className="lv-item-name">{f.name}</span>{f.real && <Badge tone="warn">Real · this computer only</Badge>}{used && <Badge tone="accent">This task's</Badge>}<span className="lv-end"><span className="lv-item-meta">{plural(rows, 'row')} in {plural(f.tables.length, 'table')} · {size(f.bytes)}</span>
        <button className="btn quiet small" type="button" aria-label={`Rename ${f.name}`} onClick={on(() => { setName(f.name); setRenaming(true); if (box.current) box.current.open = true })}>Rename</button>
        <button className="btn quiet small" type="button" aria-label={`Delete ${f.name}`} onClick={on(onDelete)}>Delete</button></span></summary>
      {renaming && (
        <div className="lv-part">
          <form className="mock-edit" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); void onRename(name.trim()).then(() => setRenaming(false)) }}>
            <label>Its name<input autoFocus className="mono" aria-label={`A new name for ${f.name}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="letters, numbers and dashes, like northwind-company" /></label>
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>Data filled out for its people{(f.madeFor ?? 0) > 0 ? ` (${plural(f.madeFor!, 'endpoint')})` : ''} and prototypes built from it follow the new name.</p>
            <div className="row"><button className="btn small" type="submit" disabled={!/^[a-z0-9][a-z0-9-]*$/i.test(name.trim()) || name.trim() === f.name}>Rename</button><button className="btn quiet small" type="button" onClick={() => setRenaming(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      <div className="lv-part">
        <div className="lv-part-head"><span className="lv-part-label">Tables</span></div>
        {f.tables.map((t) => (
          <div key={t.name}>
            <div className="lv-row" data-cols="2">
              <div><code>{t.name}</code>{t.columns.length > 0 && <div className="lv-sub">{t.columns.slice(0, 5).join(', ')}{t.columns.length > 5 ? ` and ${t.columns.length - 5} more` : ''}</div>}</div>
              <span className="lv-item-meta" style={{ textAlign: 'right' }}>{plural(t.rows, 'row')}<div><button className="lv-act" aria-expanded={shown === t.name} aria-label={`${shown === t.name ? 'Hide' : 'Show'} the rows of ${t.name}`} onClick={() => setShown(shown === t.name ? null : t.name)}>{shown === t.name ? 'Hide rows' : 'Show rows'}</button></div></span>
            </div>
            {shown === t.name && <FixtureRows appId={appId} fixture={f.name} table={t.name} />}
          </div>
        ))}
      </div>
    </details>
  )
}

/** A table's first rows, as they are: a fixture is made-up data, so it can be read. */
function FixtureRows({ appId, fixture, table }: { appId: string; fixture: string; table: string }) {
  const [got, setGot] = useState<Awaited<ReturnType<typeof engine.fixtureSample>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setGot(null); engine.fixtureSample(appId, fixture, table).then(setGot).catch((e) => setError(err(e))) }, [appId, fixture, table])
  if (error) return <div className="mock-data-warn" style={{ marginBottom: 10 }}>{error}</div>
  if (!got) return <p className="lv-sub">Reading…</p>
  return (
    <>
      <div className="fx-rows" data-component="FixtureRows" tabIndex={0} role="region" aria-label={`The rows of ${table}`}>
        <table>
          <thead><tr>{got.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{got.rows.map((r, n) => <tr key={n}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {got.total > got.rows.length && <p className="lv-sub" style={{ margin: '4px 0 10px' }}>The first {got.rows.length} of {got.total}.</p>}
    </>
  )
}
