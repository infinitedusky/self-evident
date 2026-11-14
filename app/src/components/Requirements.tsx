/**
 * What every plan in an app must cover: telemetry, tests, a test plan, docs, and whatever else the app asks for.
 * Read as a list; "Edit" turns it into rows to change, add or take out. The planner answers each one and the pull
 * request's merge guide reports it. After a team's "definition of done": a short list, the same for every change.
 */
import { useState } from 'react'

export interface RequirementRow { key: string; name: string; what: string; on: boolean }
/** How a task's plan covers one requirement, as the planner said. */
export interface CoveredRow { key: string; name: string; applies: boolean; how: string }

export function Requirements({ value, onChange }: { value: RequirementRow[]; onChange: (next: RequirementRow[]) => void }) {
  const [editing, setEditing] = useState(false)
  const set = (n: number, patch: Partial<RequirementRow>) => onChange(value.map((r, i) => (i === n ? { ...r, ...patch } : r)))
  if (!editing) return (
    <div data-component="Requirements" style={{ gridColumn: '1 / -1' }}>
      {value.length === 0 ? <p className="muted" style={{ margin: 0 }}>This app asks nothing of every plan.</p> : (
        <ul className="list" style={{ margin: 0 }}>
          {value.map((r) => <li key={r.key} style={{ opacity: r.on ? 1 : 0.55 }}><strong>{r.name}</strong>{r.on ? '' : ' (off)'}<div className="muted" style={{ fontSize: 13 }}>{r.what}</div></li>)}
        </ul>
      )}
      <p style={{ margin: '8px 0 0' }}><button type="button" className="linkish" onClick={() => setEditing(true)}>Edit the list</button></p>
    </div>
  )
  return (
    <div data-component="Requirements" style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}>
      {value.map((r, n) => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: 'auto 180px 1fr auto', gap: 8, alignItems: 'start' }}>
          <input type="checkbox" checked={r.on} onChange={(e) => set(n, { on: e.target.checked })} aria-label={`${r.name || 'This one'} is required`} style={{ marginTop: 8 }} />
          <input value={r.name} onChange={(e) => set(n, { name: e.target.value })} placeholder="Name" aria-label="Name" />
          <textarea value={r.what} onChange={(e) => set(n, { what: e.target.value })} rows={2} placeholder="What it means for this app, in a sentence the planner can act on" aria-label={`What ${r.name || 'it'} means`} />
          <button type="button" className="btn quiet small" onClick={() => onChange(value.filter((_, i) => i !== n))}>Take out</button>
        </div>
      ))}
      <p style={{ margin: 0, display: 'flex', gap: 12 }}>
        <button type="button" className="btn quiet small" onClick={() => onChange([...value, { key: '', name: '', what: '', on: true }])}>Add one</button>
        <button type="button" className="linkish" onClick={() => setEditing(false)}>Done</button>
      </p>
    </div>
  )
}

/** On a task: how its plan covers each requirement in force. */
export function PlanCovers({ list }: { list: CoveredRow[] }) {
  if (!list.length) return null
  return (
    <section className="panel" data-component="PlanCovers">
      <h2>What the plan covers</h2>
      <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>What this app asks of every plan, and how this one answers. The same list goes on the pull request.</p>
      <ul className="list" style={{ margin: 0 }}>
        {list.map((c) => (
          <li key={c.key}>
            <strong>{!c.how ? '⬜' : c.applies ? '✅' : '➖'} {c.name}</strong>{!c.how ? '' : c.applies ? '' : ' · does not apply'}
            <div className="muted" style={{ fontSize: 13 }}>{c.how || 'The plan does not say.'}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}
