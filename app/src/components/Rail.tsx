/**
 * The loop as a thin strip of icons on the far left, like VS Code's activity bar: each opens its page as a tab
 * (or brings it to the front). Hovering one shows its name. The rail holds only the stages of work, with nothing under
 * them: projects, tasks and the steps live inside their stage (LOG.md, 2026-10-29). Below the rule: Summary and My Stuff.
 * Settings sits at the bottom; the app picker is atop the agent.
 */
import type { Tab } from '../workspace'

interface Item { icon: string; label: string; tab: Tab; also?: RegExp }
const page = (path: string): Tab => ({ kind: 'page', path })
const LOOP: Item[] = [
  { icon: '🔭', label: 'Observe', tab: page('/observe') },
  { icon: '🧠', label: 'Learn', tab: page('/learn') },
  { icon: '💡', label: 'Ideate', tab: page('/ideas'), also: /^\/ideas/ },
  { icon: '📋', label: 'Plan', tab: page('/projects'), also: /^\/(plan|projects|issues|todos|mockups)|^(storybook|prototype)/ },
  { icon: '🔨', label: 'Build', tab: page('/build'), also: /^\/(build|graph)|^build:/ },
]
const OUTSIDE: Item[] = [
  { icon: '📰', label: 'Summary', tab: page('/summary') },
  { icon: '📌', label: 'My Stuff', tab: page('/'), also: /^\/$/ },
]

/** `here` is the key of the tab in front (tabKey), which lights its icon. */
export function Rail({ here, onOpen, agentOpen, onToggleAgent }: { here: string | null; onOpen: (tab: Tab) => void; agentOpen?: boolean; onToggleAgent?: () => void }) {
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
    <nav className="rail" data-component="Rail" aria-label="Self Evident">
      <button className={`rail-brand ${agentOpen ? 'on' : ''}`} onClick={onToggleAgent} title={`${agentOpen ? 'Hide' : 'Show'} the agent (⌘J)`} aria-label="Toggle the agent">S<i>.</i></button>
      {LOOP.map(button)}
      <div className="rail-rule" />
      {OUTSIDE.map(button)}
      <div className="rail-end">
        {button({ icon: '⚙️', label: 'Settings', tab: page('/settings') })}
      </div>
    </nav>
  )
}
