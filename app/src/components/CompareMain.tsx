/**
 * What a piece of work is compared with, and saying so (Sandy, 2026-11-20: "compare with app level … or do a new one
 * in which you are copying or just running it off the same db"). One control on a prototype and on a smoke test:
 * - the app's main: the one that is already there for looking at any time, on its standard data;
 * - a new main for this task, on a copy of this work's data as it is now;
 * - a new main for this task, on this work's very database.
 * A main that stops by itself is said, with its last lines: it used to end the comparison as if it had been cancelled.
 * After GitHub's "compare" base picker: what it is against is chosen where the comparison is started.
 */
import type { useCompare } from '../main-running'

export const COMPARE_SAYS = { app: "the app's main, on its standard data", copy: 'a new main, on a copy of this data as it is now', shared: 'a new main, on this same database' } as const

export function CompareWith({ c, beside, onStop }: { c: ReturnType<typeof useCompare>; /** What it is beside: prototype:<id>, or smoke:<task id>:<set-up>. */ beside: string; onStop?: () => void }) {
  if (!c.can && !c.which) return null
  return (
    <>
      {c.which
        ? <button className="btn quiet small" onClick={() => { c.stop(); onStop?.() }} title={c.which === 'app' ? "The app's main stays on for its own tab; it turns itself off when nobody has looked for a while" : "Turns this task's main off. The app's own main is not touched."}>Stop comparing</button>
        : <select className="compare-with" aria-label="Compare with main" value="" disabled={c.busy} onChange={(e) => { const w = e.target.value; if (w === 'app' || w === 'copy' || w === 'shared') c.choose(w, beside) }}
            title="Main beside it, at the same place. The app's main is the one you can open any time, on its standard data. A new one is this task's own, on its own port: on a copy of this data as it is now (its own database, main's schema), or on this same database (what you do here shows there).">
            <option value="">{c.busy ? 'Turning main on…' : 'Compare with main…'}</option>
            <option value="app">The app's main (standard data)</option>
            {c.local && <option value="copy">{c.hasData ? 'A new main, on a copy of this data as it is now' : 'A new main for this task'}</option>}
            {c.hasData && <option value="shared">A new main, on this same database</option>}
          </select>}
      {c.error && <span className="bad" role="alert">{c.error}</span>}
      {c.stopped && !c.which && (
        <div className="compare-stopped" role="alert">
          <strong>Main stopped by itself{c.stopped.exited?.code != null ? ` (exit ${c.stopped.exited.code})` : ''}.</strong>{' '}
          {c.stopped.which === 'shared' ? 'On the same database that is usually its start script or its code not coping with a schema that is ahead of it. ' : ''}
          {c.stopped.exited?.log.length ? <>Its last lines:<pre className="smoke-log">{c.stopped.exited.log.slice(-8).join('\n')}</pre></> : 'It left no output.'}
        </div>
      )}
    </>
  )
}

/** After the branch and commit on main's view: what it is. */
export const comparedSays = (c: ReturnType<typeof useCompare>) => (c.which === 'app' ? "the app's main, standard data" : c.main?.data?.mode === 'shared' ? 'on the same database' : c.main?.data ? 'on a copy of the data' : c.which ? "this task's own" : '')
