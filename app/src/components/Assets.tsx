/**
 * Assets (LOG.md, "Assets: what an app or a project is worked from"): the design file, the requirements, the build
 * order, a diagram. A name, where it is (a link, or a path on this computer), and a line on what it is. On Plan for
 * the app, on a project's page for that project's own. Every conversation there is told them, so it is said once.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type Asset } from '../engine'

const isLink = (s: string) => /^https?:\/\//i.test(s)
const said = (e: any) => { const m = String(e?.message ?? e); try { return JSON.parse(m).error ?? m } catch { return m } }
const field = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', minWidth: 0 } as const

export function Assets({ appId, projectId }: { appId: string; projectId?: string }) {
  const [rows, setRows] = useState<Asset[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', location: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => { setRows(null); engine.assets(appId, projectId).then(setRows).catch((e) => setProblem(said(e))) }, [appId, projectId])
  const ready = draft.name.trim() && draft.location.trim()
  const add = async () => {
    if (!ready) return
    setBusy(true); setProblem(null)
    try {
      const a = await engine.addAsset({ appId, projectId, name: draft.name.trim(), location: draft.location.trim(), note: draft.note.trim() || undefined })
      setRows([...(rows ?? []), a]); setDraft({ name: '', location: '', note: '' }); setAdding(false)
    } catch (e) { setProblem(said(e)) } finally { setBusy(false) }
  }
  const remove = async (a: Asset) => {
    setProblem(null)
    try { await engine.removeAsset(a.id); setRows((rows ?? []).filter((r) => r.id !== a.id)) } catch (e) { setProblem(said(e)) }
  }
  return (
    <section className="panel" data-component="Assets">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Assets {rows && rows.length > 0 && <Badge>{rows.length}</Badge>}</h2>
        <span className="muted" style={{ flex: '1 1 300px', fontSize: 14 }}>{projectId ? 'What this project is worked from, on top of the app\'s.' : 'What this app is worked from: designs, requirements, the build order.'} Every conversation here is told them.</span>
        <button type="button" className="btn quiet" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add an asset'}</button>
      </div>
      {problem && <div className="empty bad" style={{ marginTop: 10 }}>{problem}</div>}
      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 8, marginTop: 12 }}>
          <input aria-label="Name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name: Designs" style={field} />
          <input aria-label="Link or path" className="mono" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="https://… or /a/path/on/this/computer" style={field} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
          <input aria-label="What it is" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="What it is, in a line (optional)" style={{ ...field, gridColumn: '1 / -1' }} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
          <div><button type="button" className="btn" disabled={busy || !ready} onClick={() => void add()}>Add</button></div>
        </div>
      )}
      {rows && !rows.length && !adding && <p className="faint" style={{ margin: '10px 0 0', fontSize: 14 }}>None yet. Add the things you keep pointing people at: the design file, the requirements, a diagram.</p>}
      {rows && rows.length > 0 && (
        <ul className="list" style={{ marginTop: 8 }}>
          {rows.map((a) => (
            <li key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                {isLink(a.location)
                  ? <a href={a.location} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>{a.name}</a>
                  : <span style={{ fontWeight: 600 }}>{a.name}</span>}
                {a.note && <span className="muted"> · {a.note}</span>}
                <div className="mono faint" style={{ overflowWrap: 'anywhere' }}>{a.location}</div>
              </div>
              <button type="button" className="btn quiet small" aria-label={`Remove ${a.name}`} title="It leaves this list; the thing itself is not touched" onClick={() => void remove(a)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
