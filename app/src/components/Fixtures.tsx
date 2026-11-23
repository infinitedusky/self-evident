/**
 * The app's fixtures (engine/src/fixtures.ts): what is in the app's own database when it is tried. Each is a set of
 * made-up rows by table, kept in Self Evident with the ids it was saved with, so a mock's data can be filled out
 * for its people. On a task it also says which fixture the task's runs are built from: the one its data was made
 * for. A fixture is saved from a prototype's data (its Data panel, "keep as a scenario", shared with the app).
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type Fixture } from '../engine'

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)

export function Fixtures({ appId, issueId, version = 0 }: { appId: string; /** A task: which fixture its runs are built from is said too. */ issueId?: string; /** Read again when it changes. */ version?: number }) {
  const [got, setGot] = useState<{ fixtures: Fixture[]; used: string | null } | null>(null)
  useEffect(() => { engine.fixtures(appId, issueId).then(setGot).catch(() => setGot({ fixtures: [], used: null })) }, [appId, issueId, version])
  if (!got) return null
  return (
    <div data-component="Fixtures">
      <h3 className="mock-h3">Fixtures</h3>
      <p className="faint" style={{ margin: '0 0 8px', fontSize: 13, maxWidth: 760 }}>
        What is in the app's own database when it is tried: made-up rows, with ids that stay the same. A mock's data is filled out for a fixture's people, so the app sends the people the mock has answers for.
        {issueId && <> {got.used ? <>This task's smoke test is built from <strong>{got.used}</strong>, the fixture its data was made for.</> : 'No data of this task is made for a fixture yet, so its smoke test is built from the app\'s default.'}</>}
      </p>
      {!got.fixtures.length ? <div className="empty">No fixtures yet. One is kept from a prototype's data: fill the prototype's database (the app's own seed will do), then keep it as a scenario shared with the app.</div> : (
        <ul className="mock-history">
          {got.fixtures.map((f) => (
            <li key={f.name}>
              <strong>{f.name}</strong> {got.used === f.name && <Badge tone="accent">This task's</Badge>} <span className="faint">{size(f.bytes)}</span>
              <div className="faint">{f.tables.slice(0, 8).map((t) => `${t.name}: ${t.rows}`).join(' · ')}{f.tables.length > 8 ? ` · and ${f.tables.length - 8} more tables` : ''}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
