import { Link, NavLink, useLocation } from 'react-router'
import { useCurrentApp } from '../current-app'
import { TalkDrawer } from './TalkDrawer'

/**
 * The nav is the loop: one stage per line, its icon in front. Below the rule, outside the loop: My Stuff (what is
 * happening in Self Evident and what needs you, the page that opens first) and Settings. The wordmark sits above;
 * the agent is the drawer, not a page.
 */
const STAGES: { to: string; icon: string; label: string; also?: RegExp; sub?: { to: string; label: string }[] }[] = [
  { to: '/observe', icon: '🔭', label: 'Observe' },
  { to: '/learn', icon: '🧠', label: 'Learn' },
  { to: '/ideas', icon: '💡', label: 'Ideate' },
  { to: '/projects', icon: '📋', label: 'Plan', also: /^\/(projects|tasks|todos)/, sub: [{ to: '/projects', label: 'Projects' }, { to: '/tasks', label: 'Tasks' }, { to: '/todos', label: 'To-dos' }] },
  { to: '/validate', icon: '🧪', label: 'Validate', sub: [{ to: '/mockups', label: 'Mockups' }] },
  { to: '/build', icon: '🔨', label: 'Build', also: /^\/graph/, sub: [{ to: '/graph', label: 'Graph' }] },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const { apps, app, setAppId } = useCurrentApp()
  const { pathname } = useLocation()
  const cls = (active: boolean) => `link ${active ? 'active' : ''}`
  return (
    <div className="shell" data-component="Shell">
      <TalkDrawer />
      <nav className="nav">
        <Link to="/" className="brand" title="Self Evident: the thing proves itself" aria-label="Self Evident">
          Self Evident<i>.</i>
        </Link>
        {STAGES.map((s) => (
          <div key={s.to}>
            <NavLink to={s.to} end={false} className={({ isActive }) => cls(isActive || !!s.also?.test(pathname))}>
              <span className="ico" aria-hidden="true">{s.icon}</span>{s.label}
            </NavLink>
            {s.sub?.map((x) => <NavLink key={x.to} to={x.to} end={false} className={({ isActive }) => `link sub ${isActive && !(x.to === '/projects' && pathname === '/projects/new') ? 'active' : ''}`}>{x.label}</NavLink>)}
          </div>
        ))}
        <div className="nav-rule" />
        <NavLink to="/" end className={({ isActive }) => cls(isActive)}><span className="ico" aria-hidden="true">📌</span>My Stuff</NavLink>
        <NavLink to="/settings" className={({ isActive }) => cls(isActive)}><span className="ico" aria-hidden="true">⚙️</span>Settings</NavLink>
        <div className="apps">
          <div className="mono faint" style={{ margin: '0 10px 6px' }}>APP</div>
          {apps.map((a) => (
            <button key={a.id} className={`link app-pick ${a.id === app?.id ? 'active' : ''}`} onClick={() => setAppId(a.id)} title={a.id === app?.id ? 'The app you are working on' : `Work on ${a.name}`}>{a.name}</button>
          ))}
          {!apps.length && <div className="faint" style={{ margin: '0 10px', fontSize: 13 }}>None yet: add one in Settings.</div>}
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
