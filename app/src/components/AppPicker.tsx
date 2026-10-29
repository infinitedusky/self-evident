/** The app you are working on, at the top of the agent's column: its name and a menu of the others. After Replit's project switcher. */
import { useState } from 'react'
import { useCurrentApp } from '../current-app'

export function AppPicker() {
  const { apps, app, setAppId } = useCurrentApp()
  const [open, setOpen] = useState(false)
  return (
    <div className="app-picker" data-component="AppPicker">
      <button className="app-picker-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        {app?.name ?? (apps.length ? 'Pick an app' : 'No apps yet')} <span className="faint" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="ws-menu app-picker-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {apps.map((a) => (
            <div key={a.id} className="ws-menu-row">
              <button role="menuitem" className={a.id === app?.id ? 'on' : ''} onClick={() => { setAppId(a.id); setOpen(false) }}><span className="mono faint">{a.key}</span> {a.name}</button>
            </div>
          ))}
          {!apps.length && <p className="faint" style={{ margin: 0, padding: '4px 10px', fontSize: 13 }}>Add one in Settings.</p>}
        </div>
      )}
    </div>
  )
}
