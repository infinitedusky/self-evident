/**
 * The whole app, laid out like an IDE, after Replit's workspace: the loop as an icon rail on the far left, the
 * agent in the column beside it, and everything else as tabs on the right, which split by dragging a tab to an
 * edge (Dockview). Pages, the app running (Preview), its Storybook and a build's live log all open here. The agent
 * is told which tabs are open and can open them itself (its open_tab tool arrives as a ui.open event). The layout
 * is kept per app in this browser; the tab in front is the address bar's page, so a link or a reload lands on it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DockviewReact, Orientation, SplitviewReact, type DockviewApi, type DockviewTheme, type IDockviewHeaderActionsProps, type IDockviewPanel, type IDockviewPanelProps, type SplitviewApi } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { API, engine } from '../engine'
import { useCurrentApp } from '../current-app'
import { tabContext, tabKey, tabTitle, useWorkspace, WorkspaceContext, type OpenTab, type Split, type Tab, type WorkspaceApi } from '../workspace'
import { AppPicker } from './AppPicker'
import { BuildLog } from './BuildLog'
import { PagePane } from './PagePane'
import { PreviewPane } from './PreviewPane'
import { Rail } from './Rail'
import { contextFor, TalkDrawer } from './TalkDrawer'

const THEME: DockviewTheme = { name: 'self-evident', className: 'dockview-theme-se', gap: 8 } // each group a card, after Replit's panes
const AGENT_KEY = 'se.agent.open', AGENT_WIDTH_KEY = 'se.agent.width', AGENT_WIDTH = 210
const layoutKey = (appId: string) => `se.layout.${appId}`
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* fine */ } }
const recall = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

/** The page and the + menu: what a tab can open. */
const MENU: { label: string; tab: Tab }[] = [
  { label: 'My Stuff', tab: { kind: 'page', path: '/' } }, { label: 'Projects', tab: { kind: 'page', path: '/projects' } },
  { label: 'Issues', tab: { kind: 'page', path: '/issues' } }, { label: 'To-dos', tab: { kind: 'page', path: '/todos' } },
  { label: 'Ideas', tab: { kind: 'page', path: '/ideas' } }, { label: 'Preview', tab: { kind: 'preview' } },
  { label: 'Storybook', tab: { kind: 'storybook' } }, { label: 'Settings', tab: { kind: 'page', path: '/settings' } },
]

/** A better name than the path gives, once the engine says: the project's, the issue's. */
async function nameFor(tab: Tab): Promise<string | null> {
  const clip = (s: string) => (s.length > 36 ? `${s.slice(0, 35)}…` : s)
  if (tab.kind === 'build') return engine.issue(tab.issueId).then((i) => `Build · ${i.identifier}`).catch(() => null)
  if (tab.kind !== 'page') return null
  const project = tab.path.match(/^\/projects\/((?:plan|proj)_[A-Za-z0-9_-]+)/)?.[1]
  if (project) return engine.graph(project).then((g) => clip(g.project.name)).catch(() => null)
  const issue = tab.path.match(/^\/issues\/([A-Za-z0-9_]+)/)?.[1]
  if (issue) return engine.issue(issue).then((i) => clip(`${i.identifier} ${i.title}`)).catch(() => null)
  return null
}

// Panels tell the workspace they changed (navigated, renamed), which Dockview has no event for.
const Changed = createContext<() => void>(() => {})

function TabBody({ params, api }: IDockviewPanelProps<{ tab: Tab }>) {
  const changed = useContext(Changed)
  const t = params.tab
  const went = (tab: Tab) => {
    api.updateParameters({ tab })
    api.setTitle(tabTitle(tab))
    void nameFor(tab).then((n) => { if (n) { api.setTitle(n); changed() } })
    changed()
  }
  switch (t.kind) {
    case 'page': return <PagePane path={t.path} onNavigate={(path) => went({ kind: 'page', path })} />
    case 'preview': return <PreviewPane path={t.path} onNavigate={(path) => went({ kind: 'preview', path })} />
    case 'storybook': return <PagePane path="/mockups" />
    case 'build': return <BuildLog issueId={t.issueId} />
  }
}

function GroupActions({ group }: IDockviewHeaderActionsProps) {
  const ws = useWorkspace() as (WorkspaceApi & { openIn: (tab: Tab, groupId: string) => void }) | null
  const [open, setOpen] = useState(false)
  if (!ws) return null
  return (
    <div className="ws-actions">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Open a tab here" aria-expanded={open} title="Open a tab here">+</button>
      {open && (
        <div className="ws-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {MENU.map((m) => (
            <div key={m.label} className="ws-menu-row">
              <button onClick={() => { ws.openIn(m.tab, group.id); setOpen(false) }}>{m.label}</button>
              <button className="faint" title="Open beside, to the right" aria-label={`${m.label}, beside`} onClick={() => { ws.open(m.tab, { split: 'right' }); setOpen(false) }}>⇥</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Nothing() {
  return <div className="ws-empty"><p className="muted">Nothing open. Pick a page on the left, or ask the agent to open one.</p></div>
}

function AgentColumn() {
  const ws = useWorkspace()
  const context = useMemo(() => tabContext(ws?.focused ?? null, ws?.tabs ?? [], contextFor), [ws?.focused, ws?.tabs])
  return (
    <div className="agent-col">
      <AppPicker />
      <TalkDrawer context={context} onOpen={(path) => ws?.open({ kind: 'page', path })} />
    </div>
  )
}

function Tabs({ params }: { params: { onReady: (api: DockviewApi) => void } }) {
  return (
    <DockviewReact className="ws-dock" theme={THEME} components={{ tab: TabBody }} rightHeaderActionsComponent={GroupActions}
      watermarkComponent={Nothing} onReady={(e) => params.onReady(e.api)} />
  )
}

/**
 * `initial`: the tabs to open when this browser has kept none for the app (My Stuff otherwise). `address`: open the
 * address bar's page and keep the address on the tab in front (off where the page is not the app's, like a story).
 */
export function Workspace({ initial = [], address = true }: { initial?: { tab: Tab; split?: Split }[]; address?: boolean }) {
  const { app, apps, loaded } = useCurrentApp()
  const dock = useRef<DockviewApi | null>(null)
  const split = useRef<SplitviewApi | null>(null)
  const [dockGen, setDockGen] = useState(0) // a new Dockview (first mount, or mounted again) restores the tabs
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [agentOpen, setAgentOpen] = useState(() => recall(AGENT_KEY) !== '0')
  const appId = useRef<string | null>(null)
  const restoring = useRef(false)
  const firstPath = useRef<string | null>(address ? window.location.pathname + window.location.search : null)
  const follow = useRef(address)

  const sync = useCallback(() => {
    const api = dock.current
    if (!api || restoring.current) return
    const front = api.activePanel?.id
    const list = api.panels.map((p: IDockviewPanel) => {
      const tab = (p.params as { tab: Tab }).tab
      return { id: p.id, title: p.title ?? tabTitle(tab), key: tabKey(tab), tab, focused: p.id === front }
    })
    setTabs(list)
    if (appId.current) remember(layoutKey(appId.current), JSON.stringify(api.toJSON()))
    const f = list.find((t) => t.focused)?.tab
    const url = f?.kind === 'page' ? f.path : null
    if (follow.current && url && url !== window.location.pathname + window.location.search) window.history.replaceState(null, '', url)
  }, [])

  const add = useCallback((tab: Tab, where: { split?: Split; groupId?: string } = {}) => {
    const api = dock.current
    if (!api) return
    const there = api.panels.find((p) => tabKey((p.params as { tab: Tab }).tab) === tabKey(tab))
    if (there) { there.api.setActive(); return }
    const id = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const front = api.activePanel
    const position = where.groupId ? { referenceGroup: where.groupId } : where.split && front ? { referencePanel: front, direction: where.split } : undefined
    const panel = api.addPanel({ id, component: 'tab', title: tabTitle(tab), params: { tab }, ...(position ? { position } : {}) })
    void nameFor(tab).then((n) => { if (n) { panel.api.setTitle(n); sync() } })
  }, [sync])

  const onDock = useCallback((api: DockviewApi) => {
    dock.current = api
    api.onDidLayoutChange(sync)
    api.onDidActivePanelChange(sync)
    setDockGen((g) => g + 1)
  }, [sync])

  useEffect(() => { // the app's tabs: kept from last time in this browser, then the page in the address bar
    const api = dock.current
    if (!api || !loaded || (!app && apps.length)) return // wait for the app to be picked
    restoring.current = true
    api.clear()
    appId.current = app?.id ?? null
    const saved = app ? recall(layoutKey(app.id)) : null
    try { if (saved) api.fromJSON(JSON.parse(saved)) } catch { api.clear() }
    for (const p of api.panels) { const tab = (p.params as { tab: Tab }).tab; void nameFor(tab).then((n) => { if (n) { p.api.setTitle(n); sync() } }) }
    restoring.current = false
    const first = firstPath.current
    firstPath.current = null
    if (!saved) for (const x of initial) add(x.tab, { split: x.split })
    if (first && first !== '/') add({ kind: 'page', path: first })
    if (!api.panels.length) add({ kind: 'page', path: '/' })
    sync()
  }, [dockGen, loaded, app?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // the agent opens tabs
    if (!app) return
    const es = new EventSource(`${API}/events?since=now&app=${app.id}`)
    es.addEventListener('ui.open', ((ev: MessageEvent) => {
      const p = (JSON.parse(ev.data) as { payload?: { tab?: Tab; split?: Split | null } }).payload
      if (p?.tab) add(p.tab, { split: p.split ?? undefined })
    }) as EventListener)
    return () => es.close()
  }, [app?.id, add])

  const toggleAgent = useCallback(() => setAgentOpen((o) => { remember(AGENT_KEY, o ? '0' : '1'); return !o }), [])
  useEffect(() => { split.current?.getPanel('agent')?.api.setVisible(agentOpen) }, [agentOpen])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleAgent() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleAgent])

  const focused = tabs.find((t) => t.focused) ?? null
  const value = useMemo(() => ({ open: (tab: Tab, opts?: { split?: Split }) => add(tab, opts), openIn: (tab: Tab, groupId: string) => add(tab, { groupId }), tabs, focused }), [add, tabs, focused])
  return (
    <WorkspaceContext.Provider value={value}>
      <Changed.Provider value={sync}>
        <div className="workspace" data-component="Workspace">
          <Rail here={focused?.key ?? null} onOpen={(tab) => add(tab)} agentOpen={agentOpen} onToggleAgent={toggleAgent} />
          <SplitviewReact className="ws-split" orientation={Orientation.HORIZONTAL} proportionalLayout={false}
            components={{ agent: AgentColumn, tabs: Tabs }}
            onReady={(e) => {
              split.current = e.api
              const width = Number(recall(AGENT_WIDTH_KEY)) || AGENT_WIDTH // the default, or the width it was dragged to
              const agent = e.api.addPanel({ id: 'agent', component: 'agent', size: width, minimumSize: 180, maximumSize: 760 })
              e.api.addPanel({ id: 'tabs', component: 'tabs', minimumSize: 360, params: { onReady: onDock } })
              let sized = false
              requestAnimationFrame(() => { agent.api.setSize({ size: width }); sized = true }) // Splitview shares the space out evenly at first
              agent.api.onDidDimensionsChange((d) => { if (sized && d.width > 0) remember(AGENT_WIDTH_KEY, String(Math.round(d.width))) })
              if (!agentOpen) agent.api.setVisible(false)
            }} />
        </div>
      </Changed.Provider>
    </WorkspaceContext.Provider>
  )
}
