/**
 * Where each mock's data comes from, place by place (engine/src/mock-places.ts): for a prototype, a smoke test and a
 * reviewer, one of the real service, the real response as it is, a fake of it, a named set, or the app's default.
 * With no task it is the app's defaults (Settings); with one, the task's own, each row following the app until it
 * is changed. A reviewer is never offered real data.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type MockPlace, type MockPlacesRow, type MockPlan, type MockSource } from '../engine'

const PLACES: { key: MockPlace; name: string }[] = [{ key: 'prototype', name: 'Prototype' }, { key: 'smoke', name: 'Smoke test' }, { key: 'review', name: 'Reviewer' }]
const err = (e: unknown) => String((e as Error)?.message ?? e)
const SOURCE: Record<Exclude<MockSource, 'default' | 'data'>, string> = { live: 'The real service, every run', replay: 'Record and replay: the real response, as it is', fake: 'Record and fake: a fake of the real response' }
const valueOf = (c: { source: MockSource; data?: string } | null) => (!c ? 'default' : c.source === 'data' ? `data:${c.data}` : c.source)

export function MockPlaces({ appId, issueId, onChanged }: { appId: string; /** A task: its own choices. None: the app's defaults. */ issueId?: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<MockPlacesRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = () => engine.mockPlaces(appId, issueId).then((r) => { setRows(r); setError(null) }).catch((e) => setError(err(e)))
  useEffect(() => { setRows(null); void reload() }, [appId, issueId]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = async (mock: string, place: MockPlace, value: string) => {
    try {
      await engine.setMockPlace(appId, mock, place, value.startsWith('data:') ? { source: 'data', data: value.slice(5), issueId } : { source: value as MockSource, issueId })
      await reload(); onChanged?.()
    } catch (e) { setError(err(e)) }
  }
  if (rows === null) return error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>
  if (!rows.length) return <div className="empty" data-component="MockPlaces">This app has no mocks yet, so there is nothing to choose. One is made when a task's agent finds an outside service its change depends on.</div>
  return (
    <div className="mock-places" data-component="MockPlaces">
      {error && <div className="empty bad" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="mock-places-grid" role="table">
        <div className="mock-places-head" role="row"><span role="columnheader">Outside service</span>{PLACES.map((p) => <span key={p.key} role="columnheader">{p.name}</span>)}</div>
        {rows.map((r) => (
          <div className="mock-places-row" role="row" key={r.mock}>
            <div role="cell"><strong>{r.name}</strong><div className="faint">{r.real ? `A real response is on this computer (${new Date(r.real).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : 'No real response on this computer yet'}</div></div>
            {PLACES.map((p) => <Cell key={p.key} row={r} plan={r.places[p.key]} place={p} task={!!issueId} onSet={(v) => set(r.mock, p.key, v)} />)}
          </div>
        ))}
      </div>
      <p className="faint mock-places-foot">A reviewer is never given real data: only a fake, or data that holds nothing real. {issueId ? 'A row left as it is follows the app\'s default (Settings › Mocks).' : 'A task follows these unless it says otherwise on its Data step.'}</p>
    </div>
  )
}

function Cell({ row, plan, place, task, onSet }: { row: MockPlacesRow; plan: MockPlan; place: { key: MockPlace; name: string }; task: boolean; onSet: (value: string) => void }) {
  const review = place.key === 'review'
  const mine = task ? plan.own : plan.app
  const real = plan.how === 'live' || plan.data?.kind === 'real'
  return (
    <div role="cell" className="mock-places-cell" data-place={place.key}>
      <span className="mock-places-label">{place.name}</span>
      <select aria-label={`${row.name}, ${place.name}`} value={valueOf(mine)} onChange={(e) => onSet(e.target.value)}>
        <option value="default">{task ? 'The app\'s default' : 'Its default data'}</option>
        {!review && <option value="live">{SOURCE.live}</option>}
        {!review && <option value="replay">{SOURCE.replay}</option>}
        <option value="fake">{SOURCE.fake}</option>
        {row.data.filter((d) => !review || d.kind !== 'real').map((d) => <option key={d.key} value={`data:${d.key}`}>{d.name} ({d.kind})</option>)}
      </select>
      <div className="mock-places-says">
        {plan.says}
        {real && !plan.blocked && <> <Badge tone="warn">Real · this computer only</Badge></>}
      </div>
      {plan.how === 'live' && <div className="mock-places-note">Every run is a real call: it costs what the service charges, and takes as long.</div>}
      {plan.note && <div className="mock-places-note">{plan.note[0].toUpperCase() + plan.note.slice(1)}.</div>}
      {plan.blocked && <div className="mock-places-blocked">A reviewer's copy cannot be made: {plan.blocked}.</div>}
    </div>
  )
}
