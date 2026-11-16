/**
 * One app at a time. The current app scopes Now, Plans, Ideas, the Graph and where the agent works; it is picked
 * in the nav and remembered in localStorage (a per-viewer convenience; the engine never sees it as state).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { engine, type App } from './engine'

const KEY = 'if.app'
interface Ctx { apps: App[]; app: App | null; loaded: boolean; setAppId: (id: string) => void; reload: () => Promise<void> }
const CurrentApp = createContext<Ctx>({ apps: [], app: null, loaded: false, setAppId: () => {}, reload: async () => {} })

/**
 * The app a browser tab starts in. An address that names one (`?app=`, how an app is opened in a new tab) wins, and
 * the name is taken off the address at once. Else the app this tab was last in (sessionStorage: each tab keeps its
 * own through a reload, so two tabs on two apps stay that way). Else the app last picked anywhere (localStorage).
 */
export function arrivingApp(): string | null {
  try {
    const url = new URL(window.location.href)
    const named = url.searchParams.get('app')
    if (named) {
      url.searchParams.delete('app')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
      try { sessionStorage.setItem(KEY, named) } catch { /* fine */ }
      return named
    }
  } catch { /* no address to read */ }
  try { const mine = sessionStorage.getItem(KEY); if (mine) return mine } catch { /* fine */ }
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function CurrentAppProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<App[]>([])
  const [loaded, setLoaded] = useState(false)
  const [appId, setId] = useState<string | null>(arrivingApp)
  const reload = async () => { try { setApps(await engine.apps()) } catch { /* the engine is down; pages say so */ } finally { setLoaded(true) } }
  useEffect(() => { void reload() }, [])
  useEffect(() => { // nothing chosen, or the chosen app is gone: take the newest
    if (apps.length && !apps.some((a) => a.id === appId)) setId(apps[apps.length - 1].id)
  }, [apps, appId])
  const setAppId = (id: string) => { setId(id); try { sessionStorage.setItem(KEY, id) } catch { /* fine */ } try { localStorage.setItem(KEY, id) } catch { /* fine */ } }
  const value = useMemo(() => ({ apps, app: apps.find((a) => a.id === appId) ?? null, loaded, setAppId, reload }), [apps, appId, loaded])
  return <CurrentApp.Provider value={value}>{children}</CurrentApp.Provider>
}

export const useCurrentApp = () => useContext(CurrentApp)
