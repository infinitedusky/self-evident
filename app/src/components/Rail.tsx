/**
 * The loop as a thin strip of icons on the far left, like VS Code's activity bar: each opens its page as a tab
 * (or brings it to the front). Hovering one shows its name. The rail holds only the stages of work, with nothing under
 * them: projects, tasks and the steps live inside their stage (LOG.md, 2026-10-29). Below the rule: Summary, Reports, My Stuff and Docs.
 * Settings sits at the bottom, with the switch to the other Evident on this computer when there is one (InstanceSwitch). The apps have their own strip outside it, on the far left as in Slack (AppPicker); the
 * tiny chevron at the top shows or hides that strip.
 */
import type { Tab } from '../workspace'
import { InstanceSwitch } from './InstanceSwitch'
import { PhoneLink } from './PhoneLink'

interface Item { icon: string; label: string; tab: Tab; also?: RegExp }
const page = (path: string): Tab => ({ kind: 'page', path })
const LOOP: Item[] = [
  { icon: '🔭', label: 'Observe', tab: page('/observe') },
  { icon: '🧠', label: 'Learn', tab: page('/learn') },
  { icon: '💡', label: 'Ideate', tab: page('/ideas'), also: /^\/ideas/ },
  { icon: '📋', label: 'Plan', tab: page('/plan'), also: /^\/(plan|projects|todos|mockups)|^\/tasks(?!\/[^/]+\/build)|^(storybook|sketch|prototype|main)/ }, // a task's Build section belongs to Build
  { icon: '🔨', label: 'Build', tab: page('/build'), also: /^\/(build|graph)|^\/tasks\/[^/]+\/build|^build:/ },
]
const OUTSIDE: Item[] = [
  { icon: '📰', label: 'Summary', tab: page('/summary') },
  { icon: '🗞️', label: 'Reports', tab: page('/reports') },
  { icon: '🔍', label: 'Reviews', tab: page('/reviews') }, // other people's pull requests, reviewed from here (Sandy, 2026-11-25)
  { icon: '📌', label: 'My Stuff', tab: page('/'), also: /^\/$/ },
  { icon: '📚', label: 'Docs', tab: page('/docs') }, // the app's docs site, from its workbench folder (Sandy, 2026-11-24: "in the left nav near my stuff")
]

/** `here` is the key of the tab in front (tabKey), which lights its icon. */
export function Rail({ here, onOpen, agentOpen, onToggleAgent, appsOpen, onToggleApps }: { here: string | null; onOpen: (tab: Tab) => void; agentOpen?: boolean; onToggleAgent?: () => void; appsOpen?: boolean; onToggleApps?: () => void }) {
  const active = (i: Item) => here !== null && (i.also ?? new RegExp(`^${i.tab.kind === 'page' ? i.tab.path : i.tab.kind}`)).test(here)
  const button = (i: Item) => (
    <div className="rail-item" key={i.label}>
      <button className={`rail-btn ${active(i) ? 'active' : ''}`} onClick={() => onOpen(i.tab)} aria-label={i.label}><span aria-hidden="true">{i.icon}</span></button>
      <div className="rail-fly" role="menu">
        <button className="rail-fly-head" onClick={() => onOpen(i.tab)}>{i.label}</button>
      </div>
    </div>
  )
  return (
    <nav className="rail" data-component="Rail" aria-label="Evident">
      {onToggleApps && <button className="rail-apps-toggle" onClick={onToggleApps} title={`${appsOpen ? 'Hide' : 'Show'} the apps`} aria-label={`${appsOpen ? 'Hide' : 'Show'} the apps`} aria-expanded={!!appsOpen}>{appsOpen ? '‹' : '›'}</button>}
      <button className={`rail-brand ${agentOpen ? 'on' : ''}`} onClick={onToggleAgent} title={`${agentOpen ? 'Hide' : 'Show'} the agent (⌘J)`} aria-label="Toggle the agent">S<i>.</i></button>
      {LOOP.map(button)}
      <div className="rail-rule" />
      {OUTSIDE.map(button)}
      <div className="rail-end">
        <InstanceSwitch />
        <PhoneLink />
        {button({ icon: '⚙️', label: 'Settings', tab: page('/settings') })}
      </div>
    </nav>
  )
}
