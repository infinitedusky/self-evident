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
  const rows = (f: Fixture) => f.tables.reduce((n, t) => n + t.rows, 0)
  return (
    <div className="lv-section" data-component="Fixtures">
      <div className="lv-section-head"><h3>Fixtures{got.fixtures.length > 0 && <span className="lv-count">{got.fixtures.length}</span>}</h3></div>
      <p className="lv-section-note">
        What is in the app's own database when it is tried: made-up rows, with ids that stay the same, so a mock's data can be filled out for a fixture's people.
        {issueId && <> {got.used ? <>This task's smoke test is built from <strong>{got.used}</strong>, the fixture its data was made for.</> : 'No data of this task is made for a fixture yet, so its smoke test is built from the app\'s default.'}</>}
      </p>
      {!got.fixtures.length ? <div className="empty">No fixtures yet. One is kept from a prototype's data: fill the prototype's database (the app's own seed will do), then keep it as a scenario shared with the app.</div>
        : got.fixtures.map((f) => (
          <details className="lv-item" key={f.name} open={got.used === f.name}>
            <summary className="lv-item-head"><span className="lv-item-name">{f.name}</span>{got.used === f.name && <Badge tone="accent">This task's</Badge>}<span className="lv-item-meta lv-end">{rows(f)} row{rows(f) === 1 ? '' : 's'} in {f.tables.length} table{f.tables.length === 1 ? '' : 's'} · {size(f.bytes)}</span></summary>
            <div className="lv-part">
              <div className="lv-part-head"><span className="lv-part-label">Tables</span></div>
              {f.tables.map((t) => (
                <div className="lv-row" data-cols="2" key={t.name}>
                  <div><code>{t.name}</code>{t.columns.length > 0 && <div className="lv-sub">{t.columns.slice(0, 5).join(', ')}{t.columns.length > 5 ? ` and ${t.columns.length - 5} more` : ''}</div>}</div>
                  <span className="lv-item-meta">{t.rows} row{t.rows === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
    </div>
  )
}
