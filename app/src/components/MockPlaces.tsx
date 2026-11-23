/**
 * What each place is given for one service (engine/src/mock-places.ts): for a prototype, a smoke test and a
 * reviewer, the real service or the mock. Where the mock's data comes from is a separate matter, set on each
 * endpoint. For a person's own prototype or smoke test the mock can be told to answer with recorded responses as
 * they are; a reviewer always gets faked data, and is never offered the real service.
 *
 * In the app's settings these are the defaults. On a task each place follows the app until it is overridden.
 */
import { useState } from 'react'
import { Badge } from './Badge'
import { engine, type MockPlace, type MockPlacesRow, type MockPlan, type MockSource } from '../engine'

const PLACES: { key: MockPlace; name: string }[] = [{ key: 'prototype', name: 'Prototype' }, { key: 'smoke', name: 'Smoke test' }, { key: 'review', name: 'Reviewer' }]
const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }

export function Sources({ appId, row, issueId, onChanged }: { appId: string; row: MockPlacesRow; /** A task: its own choices. None: the app's defaults. */ issueId?: string; onChanged: () => void | Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const set = async (place: MockPlace, source: MockSource) => {
    try { setError(null); await engine.setMockPlace(appId, row.mock, place, { source, issueId }); await onChanged() } catch (e) { setError(err(e)) }
  }
  return (
    <div data-component="Sources" data-service={row.mock}>
      {error && <div className="empty bad" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="mock-sources">
        {PLACES.map((p) => <Cell key={p.key} row={row} plan={row.places[p.key]} place={p} task={!!issueId} onSet={(s) => set(p.key, s)} />)}
      </div>
    </div>
  )
}

function Cell({ row, plan, place, task, onSet }: { row: MockPlacesRow; plan: MockPlan; place: { key: MockPlace; name: string }; task: boolean; onSet: (source: MockSource) => void }) {
  const review = place.key === 'review'
  const mine = task ? plan.own : plan.app
  const [overriding, setOverriding] = useState(false)
  const value = !mine ? (task ? 'default' : 'mock') : mine.source === 'live' ? 'real' : 'mock'
  const choosing = !task || !!mine || overriding
  return (
    <div className="mock-places-cell" data-place={place.key}>
      <span className="mock-sources-label">{place.name}{task && !review && <span className="faint"> · {mine ? 'this task\'s own' : 'the app\'s default'}</span>}</span>
      {review ? null : choosing ? (
        <select aria-label={`${row.name}, ${place.name}`} value={value} onChange={(e) => { setOverriding(false); onSet(e.target.value === 'default' ? 'default' : e.target.value === 'real' ? 'live' : 'fake') }}>
          {task && <option value="default">The app's default</option>}
          <option value="mock">The mock</option>
          <option value="real">The real service</option>
        </select>
      ) : <button className="btn quiet small" style={{ justifySelf: 'start' }} aria-label={`Override ${row.name}, ${place.name}`} onClick={() => setOverriding(true)}>Override</button>}
      {choosing && value === 'mock' && !review && (
        <label className="mock-check" style={{ fontSize: 13 }}><input type="checkbox" aria-label={`${row.name}, ${place.name}: recorded responses as they are`} checked={mine?.source === 'replay'} onChange={(e) => onSet(e.target.checked ? 'replay' : 'fake')} /> <span>Use the real responses, not the faked copies <span className="faint">(this computer only)</span></span></label>
      )}
      <div className="mock-places-says">
        {plan.says}
        {(plan.how === 'live' || plan.real) && !plan.blocked && <> <Badge tone="warn">Real · this computer only</Badge></>}
      </div>
      {plan.how === 'live' && <div className="mock-places-note">Every run is a real call: it costs what the service charges, and takes as long.</div>}
      {plan.note && <div className="mock-places-note">{plan.note[0].toUpperCase() + plan.note.slice(1)}.</div>}
      {plan.blocked && <div className="mock-places-blocked">A reviewer's copy cannot be made: {plan.blocked}.</div>}
      {review && !plan.blocked && <div className="faint" style={{ fontSize: 12 }}>Always the mock: a reviewer is never given anything real.</div>}
    </div>
  )
}
