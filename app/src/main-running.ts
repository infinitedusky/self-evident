/**
 * The app's main, running, for a view that shows it (its own tab, or beside a prototype): how it stands now, kept
 * current, with turning it on and off. While `looking`, the engine is told someone is looking, so it stays on.
 * With `forId` it is the main a task has of its own for comparing (its prototype and its smoke test share it), on
 * a port of its own, and not the app's.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API, engine, openEvents, type MainDataChoice, type MainRunning } from './engine'

/** What the work is compared with: the app's own main (its standard data), or a new main for this task, on a copy of this work's data as it is now or on its very database. */
export type CompareWith = 'app' | 'copy' | 'shared'

export function useMain(appId: string | undefined, looking: boolean, forId?: string) {
  const [main, setMain] = useState<MainRunning | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback((touch = false) => { if (appId) return engine.main(appId, touch, forId).then((m) => { setMain(m); return m }).catch((e) => { setError(String(e.message ?? e)); return null }); return Promise.resolve(null) }, [appId, forId])
  useEffect(() => { setMain(null); void refresh(looking) }, [appId, forId])
  // Turned on or off by anyone (the agent, or by itself when nobody looked): show it as it is now.
  useEffect(() => {
    if (!appId) return
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const on = () => void refresh()
    for (const type of ['main.started', 'main.stopped']) es.addEventListener(type, on as EventListener)
    return () => es.close()
  }, [appId, refresh])
  // While it comes up, ask again every second or so; once it is up, say every minute that someone is looking.
  const coming = !!main?.running && !main.up
  useEffect(() => { if (!coming) return; const t = window.setInterval(() => void refresh(looking), 1200); return () => window.clearInterval(t) }, [coming, looking, refresh])
  const up = !!main?.running && main.up && main.how === 'local'
  useEffect(() => { if (!up || !looking) return; void refresh(true); const t = window.setInterval(() => void refresh(true), 60_000); return () => window.clearInterval(t) }, [up, looking, refresh])
  const act = (fn: () => Promise<MainRunning>) => { setBusy(true); setError(null); return fn().then((m) => { setMain(m); return m }).catch((e) => { setError(String(e.message ?? e)); return null }).finally(() => setBusy(false)) }
  return {
    main, error, busy,
    start: (data?: MainDataChoice) => (appId ? act(() => engine.startMain(appId, false, forId, data)) : Promise.resolve(null)),
    update: () => (appId ? act(() => engine.startMain(appId, true, forId)) : Promise.resolve(null)),
    stop: () => (appId ? act(() => engine.stopMain(appId, forId)) : Promise.resolve(null)),
  }
}

/**
 * Comparing a piece of work with main (Sandy, 2026-11-20: "compare with app level … or do a new one in which you are
 * copying or just running it off the same db"). The app's main is turned on if it is off and is not this page's to
 * turn off; a new one is the task's own (forId), turned off when comparing stops. One that stops by itself is kept
 * as `stopped`, with its last lines, so the page can say why and not just drop the comparison.
 */
export function useCompare(appId: string | undefined, forId: string) {
  const [which, setWhich] = useState<CompareWith | null>(null)
  const [stopped, setStopped] = useState<{ which: CompareWith; exited: MainRunning['exited'] } | null>(null)
  const app = useMain(appId, which === 'app')
  const task = useMain(appId, which === 'copy' || which === 'shared', forId)
  const active = which === 'app' ? app : task
  const starting = useRef(0) // a start is on its way: what an earlier stop reports back meanwhile is not this one stopping by itself
  useEffect(() => { // turned off elsewhere, or stopped by itself
    if (!which || !active.main || active.main.running || active.busy || starting.current) return
    setStopped({ which, exited: active.main.exited ?? null }); setWhich(null)
  }, [which, active.main?.running, active.busy]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (w: CompareWith, beside: string) => {
    setStopped(null); setWhich(w)
    starting.current++
    void (w === 'app' ? app.start() : task.start({ mode: w, beside })).then((m) => { if (!m?.running) setWhich(null) }).finally(() => { starting.current-- })
  }
  const stop = () => { if (which && which !== 'app') void task.stop(); setWhich(null); setStopped(null) }
  return {
    which, choose, stop, stopped,
    /** The main being compared with, while there is one. */ main: which ? active.main : null,
    busy: app.busy || task.busy, error: (which === 'app' ? app.error : task.error) ?? null,
    /** There is a main to compare with at all; and the app has a database, so the two new ones differ. */ can: !!app.main && app.main.how !== 'none', local: app.main?.how === 'local', hasData: app.main?.how === 'local' && !!app.main.database,
  }
}

