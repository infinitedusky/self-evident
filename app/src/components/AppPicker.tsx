/**
 * Which app you are in, as a strip outside the rail (far left) with a square for every app, after Slack's workspace bar: switching
 * apps switches everything (the tabs, the conversations, where the agent works), so each app is one click away and
 * never inside the agent's column. The square shows the app's key; its name shows on hover. + adds one in Settings.
 */
import { useCurrentApp } from '../current-app'
import type { Tab } from '../workspace'

export function AppPicker({ onOpen }: { onOpen?: (tab: Tab) => void }) {
  const { apps, app, setAppId } = useCurrentApp()
  return (
    <nav className="app-bar" data-component="AppPicker" aria-label="Apps">
      {apps.map((a) => (
        <div className="rail-item" key={a.id}>
          <button className={`app-bar-btn ${a.id === app?.id ? 'on' : ''}`} aria-current={a.id === app?.id ? 'true' : undefined} aria-label={a.name} onClick={() => setAppId(a.id)}>
            {a.key}
          </button>
          <div className="rail-fly"><span className="rail-fly-head app-bar-name">{a.name}</span></div>
        </div>
      ))}
      {onOpen && (
        <div className="rail-item">
          <button className="app-bar-btn add" aria-label="Add an app" onClick={() => onOpen({ kind: 'page', path: '/settings' })}>+</button>
          <div className="rail-fly"><span className="rail-fly-head app-bar-name">{apps.length ? 'Add an app' : 'Add your first app'}</span></div>
        </div>
      )}
    </nav>
  )
}
