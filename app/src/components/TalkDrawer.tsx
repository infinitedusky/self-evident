/**
 * The agent, on every page: a panel on the right that follows you around, opened with the floating button or ⌘J.
 * Several conversations at once, as tabs: each is pinned to what it started on (a project, an idea, or the first
 * thing said), works in its own worktree on its own branch, and keeps going while you move around the site.
 * Every message still carries the page you are on.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Conversation } from './Conversation'
import { engine, type TalkContext, type TalkSession } from '../engine'
import { useCurrentApp } from '../current-app'

const OPEN_KEY = 'if.talk.open', SESSION_KEY = 'if.talk.session', POPPED_KEY = 'if.talk.popped'
// The main window and a popped-out agent window talk over this channel: where the person is, which app, closed.
type Msg = { type: 'context'; context: TalkContext; appId?: string } | { type: 'hello' } | { type: 'closed' } | { type: 'ping' }
const channel = () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('self-evident-agent'))
let popup: Window | null = null

/** Where the person is, from the route: enough for the agent to look the rest up. */
export function contextFor(pathname: string, search: string): TalkContext {
  const project = pathname.match(/^\/projects\/((?:plan|proj)_[A-Za-z0-9_-]+)/)?.[1]
  const app = new URLSearchParams(search).get('app') ?? undefined
  if (project) return { path: pathname, projectId: project, label: 'this project' }
  if (pathname === '/projects/new') return { path: pathname, label: 'the project composer' }
  if (pathname.startsWith('/projects')) return { path: pathname, label: 'the projects list' }
  if (pathname.startsWith('/build')) return { path: pathname, label: 'Build' }
  const issue = pathname.match(/^\/issues\/((?:iss|task|ph|todo|bl)_[A-Za-z0-9]+)/)
  if (issue) return { path: pathname, issueId: issue[1], label: 'this issue' }
  if (pathname.startsWith('/issues')) return { path: pathname, label: 'the issue list' }
  if (pathname.startsWith('/todos')) return { path: pathname, label: 'the to-dos (work outside the code)' }
  if (pathname.startsWith('/validate')) return { path: pathname, label: 'Validate' }
  if (pathname.startsWith('/mockups')) return { path: pathname, label: 'the mockups (Storybook)' }
  if (pathname.startsWith('/ideas')) return { path: pathname, label: 'Ideate (the inbox)' }
  if (pathname.startsWith('/learn')) return { path: pathname, label: 'Learn' }
  if (pathname.startsWith('/graph')) return { path: pathname, appId: app, label: 'the graph' }
  if (pathname.startsWith('/settings')) return { path: pathname, label: 'settings' }
  if (pathname.startsWith('/observe')) return { path: pathname, label: 'Observe (the app\'s metrics and promises)' }
  return { path: pathname, label: 'My Stuff (what needs you, what is running)' }
}

const remember = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* fine */ } }
const recall = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

/** The agent in its own browser window: the same panel, filling the window, told by the main window where the person is. */
export function AgentWindow() { return <TalkDrawer standalone /> }

export function TalkDrawer({ standalone = false }: { standalone?: boolean }) {
  const loc = useLocation()
  const { app, apps, setAppId } = useCurrentApp()
  const [open, setOpen] = useState(() => standalone || recall(OPEN_KEY) === '1')
  const [popped, setPopped] = useState(() => !standalone && recall(POPPED_KEY) === '1')
  const [remote, setRemote] = useState<TalkContext | null>(null) // standalone: the main window's page
  const alive = useRef(false) // the agent window answered
  const [sessions, setSessions] = useState<TalkSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(() => recall(SESSION_KEY))
  const [problem, setProblem] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const local = useMemo(() => ({ ...contextFor(loc.pathname, loc.search), appId: app?.id }), [loc.pathname, loc.search, app?.id])
  const context: TalkContext = standalone ? remote ?? { path: '/', label: 'the main window' } : local
  useEffect(() => { // the two windows keep each other informed
    const ch = channel()
    if (!ch) return
    if (standalone) {
      ch.onmessage = (e: MessageEvent<Msg>) => {
        if (e.data.type === 'context') { setRemote(e.data.context); if (e.data.appId && e.data.appId !== app?.id) setAppId(e.data.appId) }
        if (e.data.type === 'ping') ch.postMessage({ type: 'hello' } satisfies Msg) // still here
      }
      ch.postMessage({ type: 'hello' } satisfies Msg)
      const bye = () => ch.postMessage({ type: 'closed' } satisfies Msg)
      window.addEventListener('beforeunload', bye)
      return () => { window.removeEventListener('beforeunload', bye); ch.close() }
    }
    const send = () => ch.postMessage({ type: 'context', context: local, appId: app?.id } satisfies Msg)
    send()
    // Is the agent window really there? If nothing answers, the drawer comes back: a failed or closed pop-out never strands it.
    if (recall(POPPED_KEY) === '1') { alive.current = false; ch.postMessage({ type: 'ping' } satisfies Msg); window.setTimeout(() => { if (!alive.current) { setPopped(false); remember(POPPED_KEY, '0') } }, 800) }
    ch.onmessage = (e: MessageEvent<Msg>) => { if (e.data.type === 'hello') { alive.current = true; send(); setPopped(true); remember(POPPED_KEY, '1') } if (e.data.type === 'closed') { setPopped(false); remember(POPPED_KEY, '0') } }
    return () => ch.close()
  }, [standalone, local.path, local.projectId, app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const popOut = () => {
    popup = window.open(`${window.location.origin}/agent`, 'self-evident-agent', 'popup,width=520,height=900')
    if (!popup) { setProblem('The browser blocked the new window. Allow pop-ups for this site, or keep the agent here.'); return }
    setPopped(true); remember(POPPED_KEY, '1')
  }
  const backIn = () => { channel()?.postMessage({ type: 'closed' } satisfies Msg); window.close() }
  const current = sessions.find((s) => s.id === sessionId) ?? null
  const setOpenKeep = (v: boolean) => { setOpen(v); remember(OPEN_KEY, v ? '1' : '0') }
  const pick = (id: string | null) => { setSessionId(id); remember(SESSION_KEY, id) }
  const reload = () => engine.talks(true).then((all) => { setSessions(all); return all }).catch((e) => { setProblem(String(e.message ?? e)); return [] as TalkSession[] })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => { remember(OPEN_KEY, o ? '0' : '1'); return !o }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (standalone) return; document.body.classList.toggle('talk-open', open && !popped); return () => document.body.classList.remove('talk-open') }, [open, popped, standalone])
  useEffect(() => { // on open: the remembered conversation if still open, else the latest, else none (start one on demand)
    if (!open) return
    void reload().then((all) => { if (!all.some((s) => s.id === sessionId)) pick(all[0]?.id ?? null) })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (!app) { setProblem('Pick an app in the nav, or add one in Settings. A conversation belongs to an app.'); return }
    setStarting(true); setProblem(null)
    try {
      const s = await engine.startTalk({ appId: app.id, subjectRef: { projectId: context.projectId, path: context.path } })
      await reload(); pick(s.id)
    } catch (e: any) { setProblem(String(e.message ?? e)) } finally { setStarting(false) }
  }
  const end = async (s: TalkSession) => {
    if (!window.confirm(`End "${s.subject ?? 'this conversation'}"? Its worktree is removed; its branch stays if it has commits.`)) return
    const r = await engine.endTalk(s.id)
    const all = await reload()
    if (sessionId === s.id) pick(all[0]?.id ?? null)
    if (r.branchKept) setProblem(`Ended. Branch ${r.branchKept} kept: it has commits.`)
  }
  const rename = async (subject: string) => { if (current && subject.trim()) { await engine.renameTalk(current.id, subject); await reload() } setRenaming(false) }

  const bringBack = () => { setPopped(false); remember(POPPED_KEY, '0'); setOpenKeep(true) }
  if (popped) return (
    <div className="talk-fab-group" data-component="TalkFab">
      <button className="talk-fab" onClick={() => { if (popup && !popup.closed) popup.focus(); else bringBack() }} title="The agent is in its own window">Agent ↗</button>
      <button className="talk-fab back" onClick={() => { if (popup && !popup.closed) popup.close(); bringBack() }} title="Put the agent back in the page">↙</button>
    </div>
  )
  if (!open) return <button className="talk-fab" onClick={() => setOpenKeep(true)} title="Talk (⌘J)" data-component="TalkFab">Talk</button>
  const appName = (s: TalkSession) => apps.find((a) => a.id === s.appId)?.name ?? ''
  const label = (s: TalkSession) => s.subject ?? `New · ${appName(s)}`
  return (
    <aside className={standalone ? 'talk-drawer standalone' : 'talk-drawer'} data-component="TalkDrawer">
      <div className="talk-tabs">
        {sessions.map((s) => (
          <button key={s.id} className={`talk-tab ${s.id === sessionId ? 'active' : ''}`} onClick={() => pick(s.id)} title={`${label(s)} · ${appName(s)}${s.branch ? ` · ${s.branch}` : ''}`}>
            {s.busy && <span className="dot" />}{label(s)}
          </button>
        ))}
        <button className="talk-tab new" disabled={starting} onClick={start} title={app ? `New conversation about ${app.name}${context.projectId ? ', pinned to this project' : ''}` : 'Pick an app first'}>+</button>
        {standalone
          ? <button className="talk-tab close" onClick={backIn} title="Put the agent back in the page">↙</button>
          : <><button className="talk-tab pop" onClick={popOut} title="Open the agent in its own window">↗</button><button className="talk-tab close" onClick={() => setOpenKeep(false)} title="Close (⌘J)">×</button></>}
      </div>
      {current ? (
        <>
          <div className="talk-drawer-head">
            {renaming
              ? <input autoFocus defaultValue={current.subject ?? ''} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename((e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenaming(false) }} />
              : <strong style={{ flex: 1, cursor: 'text' }} onClick={() => setRenaming(true)} title="Rename">{label(current)}</strong>}
            <AutoSelect sessionId={current.id} />
            <button className="btn quiet small" onClick={() => end(current)} title="End this conversation">End</button>
          </div>
          <div className="faint" style={{ fontSize: 12, padding: '0 12px 6px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>{appName(current)}{current.branch ? ` · ${current.branch}` : ''}</span>
            {current.subjectRef?.projectId && <Link to={`/projects/${current.subjectRef.projectId}`}>open its project</Link>}
            <span>· looking at {context.label}</span>
          </div>
          {problem && <div className="faint" style={{ fontSize: 12, padding: '0 12px 6px', color: 'var(--warn)' }}>{problem}</div>}
          <Conversation sessionId={current.id} context={context} compact />
        </>
      ) : (
        <div style={{ padding: 16 }}>
          <p className="muted" style={{ marginTop: 0 }}>No conversation open. Press <strong>+</strong> to start one about {app?.name ?? 'an app'}{context.projectId ? ', pinned to this project' : ''}. It gets its own worktree and branch; you can have several at once and switch with the tabs.</p>
          {problem && <div className="empty bad">{problem}</div>}
        </div>
      )}
    </aside>
  )
}

/** How much the agent may do without asking in this conversation. Expensive always asks. */
function AutoSelect({ sessionId }: { sessionId: string }) {
  const [level, setLevel] = useState<'free' | 'cheap' | 'moderate'>('cheap')
  useEffect(() => { engine.transcript(sessionId).then((t) => setLevel(t.session.autoApprove ?? 'cheap')).catch(() => {}) }, [sessionId])
  return (
    <select className="auto-select" value={level} title="What it may do without asking; expensive always asks"
      onChange={(e) => { const v = e.target.value as 'free' | 'cheap' | 'moderate'; setLevel(v); void engine.setAuto(sessionId, v) }}>
      <option value="free">asks for everything</option>
      <option value="cheap">runs cheap things</option>
      <option value="moderate">runs up to moderate</option>
    </select>
  )
}
