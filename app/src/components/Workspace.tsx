/**
 * The whole app, laid out like an IDE, after Replit's workspace: the apps as a strip on the far left (it hides), the loop as an icon rail, the
 * agent in the column beside it, and everything else as tabs on the right, which split by dragging a tab to an
 * edge (Dockview). Pages, prototypes, its Storybook and a build's live log all open here. The agent
 * is told which tabs are open and can open them itself (its open_tab tool arrives as a ui.open event). What it changes
 * shows in one following tab, after following someone in Figma or Live Share: a ui.follow event moves it, and a dot in
 * the conversation's colour marks it. The layout
 * is kept per app in this browser; the tab in front is the address bar's page, so a link or a reload lands on it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DockviewDefaultTab, DockviewReact, Orientation, SplitviewReact, type DockviewApi, type DockviewTheme, type IDockviewHeaderActionsProps, type IDockviewPanel, type IDockviewPanelHeaderProps, type IDockviewPanelProps, type SplitviewApi } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { openEvents, API, engine } from '../engine'
import { useCurrentApp } from '../current-app'
import { landing, pendingOpen, tabContext, tabKey, tabTitle, talkColor, useWorkspace, WorkspaceContext, type OpenTab, type Split, type Tab, type WorkspaceApi } from '../workspace'
import { BuildLog } from './BuildLog'
import { Mockups } from '../pages/Mockups'
import { PagePane } from './PagePane'
import { PrototypePane } from './PrototypePane'
import { AppPicker } from './AppPicker'
import { Rail } from './Rail'
import { contextFor, TalkDrawer } from './TalkDrawer'

const THEME: DockviewTheme = { name: 'self-evident', className: 'dockview-theme-se', gap: 8 } // each group a card, after Replit's panes
const AGENT_KEY = 'se.agent.open', AGENT_WIDTH_KEY = 'se.agent.px', AGENT_WIDTH = 345
const APPS_KEY = 'se.apps.open' // the apps strip, shown or hidden from the rail's chevron
const FOLLOW_KEY = 'se.follow' // whether a tab follows what the agent changes
const SETTLE = 700 // ms: a burst of changes lands once, when it settles
const layoutKey = (appId: string) => `se.layout.${appId}`
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* fine */ } }
const recall = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

/** The page and the + menu: what a tab can open. */
const MENU: { label: string; tab: Tab }[] = [
  { label: 'My Stuff', tab: { kind: 'page', path: '/' } }, { label: 'Projects', tab: { kind: 'page', path: '/projects' } },
  { label: 'Tasks', tab: { kind: 'page', path: '/tasks' } }, { label: 'To-dos', tab: { kind: 'page', path: '/todos' } },
  { label: 'Ideas', tab: { kind: 'page', path: '/ideas' } }, { label: 'Prototypes', tab: { kind: 'prototype' } },
  { label: 'Storybook', tab: { kind: 'storybook' } }, { label: 'Settings', tab: { kind: 'page', path: '/settings' } },
]

/** A better name than the path gives, once the engine says: the project's, the task's. */
async function nameFor(tab: Tab): Promise<string | null> {
  const clip = (s: string) => (s.length > 36 ? `${s.slice(0, 35)}…` : s)
  if (tab.kind === 'build') return engine.issue(tab.issueId).then((i) => `Build · ${i.identifier}`).catch(() => null)
  if (tab.kind === 'prototype' && tab.id) return engine.prototype(tab.id).then((x) => clip(x.title)).catch(() => null)
  if (tab.kind !== 'page') return null
  const project = tab.path.match(/^\/projects\/((?:plan|proj)_[A-Za-z0-9_-]+)/)?.[1]
  if (project) return engine.graph(project).then((g) => clip(g.project.name)).catch(() => null)
  const issue = tab.path.match(/^\/tasks\/([A-Za-z0-9_]+)/)?.[1]
  if (issue) return engine.issue(issue).then((i) => clip(`${i.identifier} ${i.title}`)).catch(() => null)
  return null
}

/** A project's or a task's page: it belongs to one app. */
const ownedPath = (path: string) => path.match(/^\/projects\/((?:plan|proj)_[A-Za-z0-9_-]+)/)?.[1] ? 'project' : path.match(/^\/tasks\/(iss_[A-Za-z0-9_]+)/) ? 'task' : null
async function ownerOf(path: string): Promise<string | null> {
  const project = path.match(/^\/projects\/((?:plan|proj)_[A-Za-z0-9_-]+)/)?.[1]
  if (project) return engine.graph(project).then((g) => g.app.id).catch(() => null)
  const issue = path.match(/^\/tasks\/(iss_[A-Za-z0-9_]+)/)?.[1]
  if (issue) return engine.issue(issue).then((i) => i.appId).catch(() => null)
  return null
}

// Panels tell the workspace they changed (navigated, renamed), which Dockview has no event for.
const Changed = createContext<() => void>(() => {})

/** The tab following a conversation: which one, and a count that flashes the page each time it lands. */
type Follow = { sessionId: string | null; landed: number }
type Params = { tab: Tab; follow?: Follow }

/** The following tab's name, after a dot in its conversation's colour that pulses. */
function FollowTab(props: IDockviewPanelHeaderProps<Params>) {
  const [follow, setFollow] = useState(props.params.follow)
  useEffect(() => { const d = props.api.onDidParametersChange((p) => setFollow((p as Params).follow)); return () => d.dispose() }, [props.api])
  return <DockviewDefaultTab {...props} {...(follow ? { 'data-follow': '', title: 'Following the agent: what it changes shows here', style: { ['--talk' as string]: talkColor(follow.sessionId) } } : {})} />
}

function TabBody({ params, api }: IDockviewPanelProps<Params>) {
  const changed = useContext(Changed)
  const t = params.tab
  const pane = useRef<HTMLDivElement>(null)
  const landed = params.follow?.landed
  useEffect(() => { // each landing, a ring in the conversation's colour
    const el = pane.current
    if (!el || !landed) return
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash')
  }, [landed])
  const went = (tab: Tab) => {
    api.updateParameters({ tab, follow: params.follow })
    api.setTitle(tabTitle(tab))
    void nameFor(tab).then((n) => { if (n) { api.setTitle(n); changed() } })
    changed()
  }
  const body = (() => {
    switch (t.kind) {
      case 'page': return <PagePane path={t.path} onNavigate={(path) => went({ kind: 'page', path })} />
      case 'prototype': return <PrototypePane id={t.id} path={t.path} onNavigate={(path) => went({ kind: 'prototype', id: t.id, path })} />
      case 'storybook': return <PagePane path="/mockups"><Mockups story={t.story} /></PagePane>
      case 'build': return <BuildLog issueId={t.issueId} />
      default: return <PrototypePane /> // a tab saved before Preview became Prototypes
    }
  })()
  if (!params.follow) return body
  return <div ref={pane} className="follow-pane" style={{ ['--talk' as string]: talkColor(params.follow.sessionId) }}>{body}</div>
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
      <TalkDrawer context={context} onOpen={(tab) => ws?.open(tab)} />
    </div>
  )
}

function Tabs({ params }: { params: { onReady: (api: DockviewApi) => void } }) {
  return (
    <DockviewReact className="ws-dock" theme={THEME} components={{ tab: TabBody }} tabComponents={{ follow: FollowTab }} rightHeaderActionsComponent={GroupActions}
      watermarkComponent={Nothing} onReady={(e) => params.onReady(e.api)} />
  )
}

/**
 * `initial`: the tabs to open when this browser has kept none for the app (My Stuff otherwise). `address`: open the
 * address bar's page and keep the address on the tab in front (off where the page is not the app's, like a story).
 */
export function Workspace({ initial = [], address = true }: { initial?: { tab: Tab; split?: Split }[]; address?: boolean }) {
  const { app, apps, loaded, setAppId } = useCurrentApp()
  const dock = useRef<DockviewApi | null>(null)
  const split = useRef<SplitviewApi | null>(null)
  const [dockGen, setDockGen] = useState(0) // a new Dockview (first mount, or mounted again) restores the tabs
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [agentOpen, setAgentOpen] = useState(() => recall(AGENT_KEY) !== '0')
  const [appsOpen, setAppsOpen] = useState(() => recall(APPS_KEY) !== '0')
  const [following, setFollowingState] = useState(() => recall(FOLLOW_KEY) !== '0')
  const followingRef = useRef(following)
  const burst = useRef<{ sessionId: string | null; path: string; projectId?: string | null }[]>([])
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appId = useRef<string | null>(null)
  const restoring = useRef(false)
  const firstPath = useRef<string | null>(address ? window.location.pathname + window.location.search : null)
  const follow = useRef(address)
  // The address you arrived by may be another app's project or task: switch to that app first, then open it there.
  const [arriving, setArriving] = useState(() => !!firstPath.current && !!ownedPath(firstPath.current))
  useEffect(() => {
    if (!arriving || !loaded) return
    void ownerOf(firstPath.current!).then((owner) => {
      if (owner && owner !== app?.id && apps.some((a) => a.id === owner)) { pendingOpen.tab = { kind: 'page', path: firstPath.current! }; firstPath.current = null; setAppId(owner) }
      setArriving(false)
    })
  }, [arriving, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (there) { // one Storybook tab: asked for another story, it goes there
      if (tab.kind === 'storybook' && tab.story && tab.story !== ((there.params as { tab: Tab }).tab as { story?: string }).story) { there.api.updateParameters({ tab }); sync() }
      there.api.setActive(); return
    }
    const id = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const front = api.activePanel
    const position = where.groupId ? { referenceGroup: where.groupId } : where.split && front ? { referencePanel: front, direction: where.split } : undefined
    const panel = api.addPanel({ id, component: 'tab', title: tabTitle(tab), params: { tab }, ...(position ? { position } : {}) })
    void nameFor(tab).then((n) => { if (n) { panel.api.setTitle(n); sync() } })
  }, [sync])

  /** The agent changed things: the following tab goes where they show (opened beside the tab in front the first time). */
  const land = useCallback(() => {
    const api = dock.current
    const changes = burst.current
    burst.current = []
    const path = landing(changes)
    if (!api || !path) return
    const tab: Tab = { kind: 'page', path }
    const sessionId = changes[changes.length - 1].sessionId
    const there = api.panels.find((p) => (p.params as Params).follow)
    const landed = ((there?.params as Params | undefined)?.follow?.landed ?? 0) + 1
    const params: Params = { tab, follow: { sessionId, landed } }
    const panel = there ?? api.addPanel({ id: `t_${Date.now().toString(36)}f`, component: 'tab', tabComponent: 'follow', title: tabTitle(tab), params, ...(api.activePanel ? { position: { referencePanel: api.activePanel, direction: 'right' as const } } : {}) })
    if (there) { there.api.updateParameters(params); there.api.setTitle(tabTitle(tab)) }
    panel.api.setActive()
    void nameFor(tab).then((n) => { if (n) { panel.api.setTitle(n); sync() } })
    sync()
  }, [sync])

  const onDock = useCallback((api: DockviewApi) => {
    dock.current = api
    api.onDidLayoutChange(sync)
    api.onDidActivePanelChange(sync)
    setDockGen((g) => g + 1)
  }, [sync])

  useEffect(() => { // the app's tabs: kept from last time in this browser, then the page in the address bar
    const api = dock.current
    if (!api || !loaded || arriving || (!app && apps.length)) return // wait for the app to be picked
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
    if (pendingOpen.tab) { add(pendingOpen.tab); pendingOpen.tab = null }
    if (!api.panels.length) add({ kind: 'page', path: '/' })
    sync()
  }, [dockGen, loaded, arriving, app?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // the agent opens tabs
    if (!app) return
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    es.addEventListener('ui.open', ((ev: MessageEvent) => {
      const p = (JSON.parse(ev.data) as { payload?: { tab?: Tab; split?: Split | null } }).payload
      if (p?.tab) add(p.tab, { split: p.split ?? undefined })
    }) as EventListener)
    es.addEventListener('ui.follow', ((ev: MessageEvent) => {
      const p = (JSON.parse(ev.data) as { payload?: { sessionId?: string | null; tab?: Tab; projectId?: string | null } }).payload
      if (!followingRef.current || p?.tab?.kind !== 'page') return
      burst.current.push({ sessionId: p.sessionId ?? null, path: p.tab.path, projectId: p.projectId })
      if (settle.current) clearTimeout(settle.current)
      settle.current = setTimeout(land, SETTLE)
    }) as EventListener)
    return () => { es.close(); if (settle.current) clearTimeout(settle.current) }
  }, [app?.id, add, land])

  const toggleAgent = useCallback(() => setAgentOpen((o) => { remember(AGENT_KEY, o ? '0' : '1'); return !o }), [])
  const toggleApps = useCallback(() => setAppsOpen((o) => { remember(APPS_KEY, o ? '0' : '1'); return !o }), [])
  const setFollowing = useCallback((on: boolean) => { // off: the following tab stays, as an ordinary tab
    remember(FOLLOW_KEY, on ? '1' : '0'); followingRef.current = on; setFollowingState(on)
    if (!on) { burst.current = []; const there = dock.current?.panels.find((p) => (p.params as Params).follow); if (there) there.api.updateParameters({ tab: (there.params as Params).tab, follow: undefined }) }
  }, [])
  useEffect(() => { split.current?.getPanel('agent')?.api.setVisible(agentOpen) }, [agentOpen])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleAgent() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleAgent])

  const focused = tabs.find((t) => t.focused) ?? null
  const value = useMemo(() => ({ open: (tab: Tab, opts?: { split?: Split }) => add(tab, opts), openIn: (tab: Tab, groupId: string) => add(tab, { groupId }), tabs, focused, following, setFollowing }), [add, tabs, focused, following, setFollowing])
  return (
    <WorkspaceContext.Provider value={value}>
      <Changed.Provider value={sync}>
        <div className={`workspace ${appsOpen ? '' : 'no-apps'}`} data-component="Workspace">
          {appsOpen && <AppPicker onOpen={(tab) => add(tab)} />}
          <Rail here={focused?.key ?? null} onOpen={(tab) => add(tab)} agentOpen={agentOpen} onToggleAgent={toggleAgent} appsOpen={appsOpen} onToggleApps={toggleApps} />
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
