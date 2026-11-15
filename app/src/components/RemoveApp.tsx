/**
 * Removing an app, in two steps (Sandy, 2026-11-15: "we need to be able to remove apps").
 * - RemoveApp, on the app's own settings: one press puts it away. It can be undone, so it asks nothing first (Things:
 *   what can be put back is not confirmed).
 * - RemovedApps, under All apps: the apps put away. Each can be brought back, or deleted for good, which asks for the
 *   app's name typed, as GitHub does before deleting a repository.
 * Neither touches the code on disk or anything on GitHub; deleting says what stays.
 */
import { useState } from 'react'

import type { AppHolds } from '../engine'
export type { AppHolds }

const said = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const n = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`
/** What an app holds, in a line: only what it has. */
export const holds = (a: AppHolds) => [[a.tasks, 'task'], [a.projects, 'project'], [a.ideas, 'idea'], [a.conversations, 'conversation']].filter(([c]) => c).map(([c, w]) => n(c as number, w as string)).join(' · ') || 'Nothing in it'

export function RemoveApp({ name, onRemove }: { name: string; /** Puts it away. Rejects with the engine's reason when it can't yet. */ onRemove: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => { setBusy(true); setError(null); try { await onRemove() } catch (e) { setError(said(e)); setBusy(false) } }
  return (
    <div data-component="RemoveApp">
      <h2>Remove {name}</h2>
      <p className="muted" style={{ margin: '0 0 12px' }}>It leaves every list and nothing of it runs. Its tasks and conversations are kept, and it can be brought back from All apps › Removed apps. Its code and GitHub are not touched.</p>
      <button type="button" className="btn quiet" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : `Remove ${name}`}</button>
      {error && <div className="empty bad" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}

export function RemovedApps({ apps, onRestore, onDelete }: {
  /** The apps put away, latest first; null while loading. */
  apps: AppHolds[] | null
  onRestore: (id: string) => Promise<unknown>
  /** Deletes it for good; `name` is what the person typed. */
  onDelete: (id: string, name: string) => Promise<unknown>
}) {
  const [asking, setAsking] = useState<string | null>(null) // the app whose deletion is being confirmed
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setError(null)
    try { await fn(); setAsking(null); setTyped('') } catch (e) { setError({ id, text: said(e) }) } finally { setBusy(null) }
  }
  return (
    <section className="panel" data-component="RemovedApps">
      <h2>Removed apps</h2>
      {!apps ? <p className="muted">Loading…</p> : !apps.length ? <div className="empty">No app is removed. An app is removed from its own settings, under Remove.</div> : (
        <ul className="list">
          {apps.map((a) => (
            <li key={a.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <b>{a.name}</b> <span className="mono faint">{a.key}</span>
                  <div className="faint" style={{ fontSize: 13 }}>{holds(a)}{a.removedAt ? ` · removed ${new Date(a.removedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn small" disabled={busy === a.id} onClick={() => void run(a.id, () => onRestore(a.id))}>Bring back</button>
                  {asking !== a.id && <button type="button" className="btn quiet small" disabled={busy === a.id} onClick={() => { setAsking(a.id); setTyped(''); setError(null) }}>Delete for good…</button>}
                </div>
              </div>
              {asking === a.id && (
                <form className="remove-app-ask" onSubmit={(e) => { e.preventDefault(); if (typed.trim() === a.name) void run(a.id, () => onDelete(a.id, typed)) }}>
                  <div>This erases {a.name} from Self Evident: {holds(a).toLowerCase()}, and its history. It cannot be undone.</div>
                  {a.kept.length > 0 && <div className="faint" style={{ fontSize: 13 }}>Stays where it is: {a.kept.map((k, i) => <span key={k}>{i ? ', ' : ''}<span className="mono">{k}</span></span>)}.</div>}
                  <label>Type <b>{a.name}</b> to delete it<input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label={`Type ${a.name} to delete it`} /></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="submit" className="btn bad small" disabled={typed.trim() !== a.name || busy === a.id}>{busy === a.id ? 'Deleting…' : 'Delete for good'}</button>
                    <button type="button" className="btn quiet small" onClick={() => { setAsking(null); setTyped('') }}>Keep it</button>
                  </div>
                </form>
              )}
              {error?.id === a.id && <div className="empty bad" style={{ marginTop: 8 }}>{error.text}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
