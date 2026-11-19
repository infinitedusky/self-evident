/**
 * The app's main, running, for a view that shows it (its own tab, or beside a prototype): how it stands now, kept
 * current, with turning it on and off. While `looking`, the engine is told someone is looking, so it stays on.
 */
import { useCallback, useEffect, useState } from 'react'
import { API, engine, openEvents, type MainRunning } from './engine'

export function useMain(appId: string | undefined, looking: boolean) {
  const [main, setMain] = useState<MainRunning | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback((touch = false) => { if (appId) return engine.main(appId, touch).then((m) => { setMain(m); return m }).catch((e) => { setError(String(e.message ?? e)); return null }); return Promise.resolve(null) }, [appId])
  useEffect(() => { setMain(null); void refresh(looking) }, [appId])
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
    start: () => (appId ? act(() => engine.startMain(appId)) : Promise.resolve(null)),
    update: () => (appId ? act(() => engine.startMain(appId, true)) : Promise.resolve(null)),
    stop: () => (appId ? act(() => engine.stopMain(appId)) : Promise.resolve(null)),
  }
}
