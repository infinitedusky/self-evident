/**
 * What a task owes at deploy, and what is watched after it, on its pull request step (Sandy, 2026-11-23: "Release (at
 * deploy): what must be true for it to go live and can only be done there … listed on the task as owed by whoever
 * deploys"). The same steps, in the same order, are in the pull request's description. Whoever deploys says each is
 * done; one said not done needs why, since it is usually the cause when production is wrong. What is watched is only
 * listed: it is read from telemetry, and nobody marks it.
 *
 * After a deploy runbook's checklist: numbered, in order, each with who ticked it.
 */
import { useState } from 'react'
import type { ReleaseCheck, WatchCheck } from '../engine'

export function ReleaseChecks({ release, watch = [], onMark }: { release: ReleaseCheck[]; watch?: WatchCheck[]; /** Say one is done, or not done with why. */ onMark: (id: string, done: boolean, note: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [why, setWhy] = useState<{ id: string; note: string } | null>(null)
  const [error, setError] = useState<{ id: string; says: string } | null>(null)
  const mark = async (id: string, done: boolean, note: string) => { setBusy(id); setError(null); try { await onMark(id, done, note); setWhy(null) } catch (e) { setError({ id, says: e instanceof Error ? e.message : String(e) }) } finally { setBusy(null) } }
  const owed = release.filter((r) => r.done !== true).length
  const who = (by?: string) => (by === 'user' || !by ? 'you' : by)
  if (!release.length && !watch.length) return null
  return (
    <section className="release-checks" data-component="ReleaseChecks" aria-label="At deploy and after">
      {release.length > 0 && <>
        <h3 className="settings-h3">At deploy <span className="faint" style={{ fontWeight: 400 }}>{owed ? `${owed} owed` : 'all done'}</span></h3>
        <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>What must be true for this to go live, and can only be done there. Whoever deploys does these, in order; they are in the pull request's description too. Nothing before the merge checks them, and the task is not done until each is said done.</p>
        <ol className="release-list">
          {release.map((r) => (
            <li key={r.id} className={r.done === true ? 'done' : r.done === false ? 'not' : ''}>
              <div><strong>{r.text}</strong>{r.how && <div className="faint">{r.how}</div>}</div>
              {r.done !== undefined && <div className={r.done ? 'faint' : 'bad'}>{r.done ? 'Done' : 'Not done'}, said {who(r.by)}{r.note ? `: ${r.note}` : '.'}</div>}
              {why?.id === r.id ? (
                <form className="release-why" onSubmit={(e) => { e.preventDefault(); void mark(r.id, false, why.note.trim()) }}>
                  <input autoFocus value={why.note} onChange={(e) => setWhy({ id: r.id, note: e.target.value })} aria-label="What stands in the way" placeholder="What stands in the way" />
                  <button className="btn small" disabled={busy === r.id || !why.note.trim()}>Say it is not done</button> <button type="button" className="btn quiet small" onClick={() => setWhy(null)}>Cancel</button>
                </form>
              ) : (
                <div className="release-acts">
                  {r.done !== true && <button className="btn small" disabled={busy === r.id} onClick={() => void mark(r.id, true, '')}>Done</button>}
                  {r.done !== false && <button className="btn quiet small" disabled={busy === r.id} onClick={() => setWhy({ id: r.id, note: '' })}>Not done</button>}
                </div>
              )}
              {error?.id === r.id && <p className="bad" role="alert" style={{ margin: '4px 0 0' }}>{error.says}</p>}
            </li>
          ))}
        </ol>
      </>}
      {watch.length > 0 && <>
        <h3 className="settings-h3">Watched after the deploy <span className="faint" style={{ fontWeight: 400 }}>{watch.length}</span></h3>
        <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>Production health this change promises. Nobody checks these before the merge; reading them from telemetry is not built yet, so for now they are a list to look at by hand.</p>
        <ul className="release-list watch">{watch.map((w) => <li key={w.id}><div><strong>{w.text}</strong>{w.how && <div className="faint">{w.how}</div>}</div></li>)}</ul>
      </>}
    </section>
  )
}
