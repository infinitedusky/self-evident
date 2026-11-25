/**
 * Evident on a phone. The workspace of tabs does not fit one, so a narrow screen gets this instead (Sandy, 2026-11-23:
 * "it needs to hold the agents chat only and then have ways to look at things that are needed outside of those chats").
 *
 * You are at a place in the app: a task, a project, an idea, My Stuff, a list. A place has three things, and the
 * phone shows one at a time (Sandy, 2026-11-25: "the task or project view should be moving between the chat window
 * … the whatever page we are on at that time, and the left nav, and then we are always able to navigate to wherever
 * else in the app … by going to like the grid thing in the top"):
 * - its page: the app's own page, in a PagePane. Links in it go where they go, and where you go is where you are.
 *   A task, a project and an idea have several pages (the overview, the context, the brief and each step, the
 *   build): they are tabs across the top, scrolled sideways, with Chat kept at the right end (Sandy, 2026-11-25: "we
 *   need a way to navigate through projects and tasks to get the differnt sections. Currently it is just overview"
 *   and "I would also put the chat tab to the right of overview or whatever else we put there").
 * - its chat: a task's own agent with the agents it has out as tabs (TaskAgent, as on the task's page), an idea's
 *   agent, a project's conversation, and anywhere else a conversation about the app as a whole. The chat is always
 *   the chat of where you are, so there is no going "back" to a task you have left.
 * - its nav, the tray from the left: a task's steps, a project's tasks, what needs you, the chats.
 * The grid at the top right goes anywhere in the app. The phone opens where it was last, else on My Stuff.
 *
 * After Slack's phone app (the list slides in from the left) and GitHub's (an issue's own tabs under its name).
 * Prototypes, Storybook and the terminal stay on the computer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { label, ready, step, type Row } from '@self-evident/engine/steps'
import { openEvents, API, engine, EVENT_TYPES, type Attention, type Graph, type IssueDetail, type Now, type Question, type StepsView, type TalkSession } from '../engine'
import { useCurrentApp } from '../current-app'
import { tabTitle, WorkspaceContext, talkColor, type Tab, type WorkspaceApi } from '../workspace'
import { Conversation } from './Conversation'
import { EngineLink } from './EngineLink'
import { PagePane } from './PagePane'
import { QuestionAsk } from './QuestionAsk'
import { TaskAgent, useTaskAgent } from './TaskAgent'
import { briefStands, mark } from './TaskNav'

type View = 'chat' | 'page'
/** What a place is about, when it is about one thing: that thing has its own chat and its own nav. */
type Subject = { kind: 'task' | 'project' | 'idea'; id: string } | null

const NARROW = '(max-width: 700px)'
const FULL_KEY = 'se.phone.full' // "the full site", asked for on a phone: for this visit only
const atKey = (appId: string) => `se.phone.at.${appId}` // where this phone was in the app, and on which of chat and page
const talkKey = (appId: string) => `se.phone.talk.${appId}` // the conversation about the app it was on
const recall = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* fine */ } }
const wantsFull = () => { try { return sessionStorage.getItem(FULL_KEY) === '1' } catch { return false } }

/** Whether this screen gets the phone's layout: it is narrow, and the full site was not asked for. */
export function useIsPhone() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches)
  useEffect(() => {
    const m = matchMedia(NARROW)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow && !wantsFull()
}

const parts = (path: string) => path.split(/[?#]/)[0].split('/').filter(Boolean)
function subjectOf(path: string): Subject {
  const [a, b] = parts(path)
  if (a === 'tasks' && b) return { kind: 'task', id: b }
  if (a === 'projects' && b && b !== 'new') return { kind: 'project', id: b }
  if (a === 'ideas' && b?.startsWith('idea_')) return { kind: 'idea', id: b }
  return null
}
const PLACES: Record<string, string> = { '': 'My Stuff', projects: 'Projects', tasks: 'Tasks', ideas: 'Ideas', todos: 'To-dos', settings: 'Settings', summary: 'Summary', reports: 'Reports', observe: 'Observe', learn: 'Learn', plan: 'Plan', build: 'Build', mockups: 'Mockups', graph: 'Graph' }
const placeName = (path: string) => { const a = parts(path)[0] ?? ''; return PLACES[a] ?? (a ? a[0].toUpperCase() + a.slice(1) : 'My Stuff') }

/** Where something that needs the person is dealt with: a question in its task's chat, the rest on a page. */
function asksOf(a: Attention): { path: string; view: View; title: string; why: string } | null {
  switch (a.kind) {
    case 'failed_build': return { path: `/tasks/${a.issueId}/build`, view: 'page', title: `${a.identifier} ${a.title}`, why: 'its build failed' }
    case 'plan_issue': return { path: `/tasks/${a.issueId}`, view: 'page', title: `${a.identifier} ${a.issueTitle}`, why: 'not planned yet' }
    case 'smoke_test': return { path: `/tasks/${a.issueId}/smoke`, view: 'page', title: `${a.identifier} ${a.issueTitle}`, why: `${a.owed} check${a.owed === 1 ? '' : 's'} only you can do` }
    case 'approve_brief': return { path: `/tasks/${a.issueId}/brief`, view: 'page', title: `${a.identifier} ${a.issueTitle}`, why: 'its brief is ready to approve' }
    case 'question': return a.issueIdentifier ? { path: `/tasks/${a.issueIdentifier}`, view: 'chat', title: a.issueIdentifier, why: a.text } : null
    default: return null
  }
}

const dropped = (s: { state: string }) => s.state === 'canceled' || s.state === 'duplicate'
const stateMark = (state: string) => (state === 'done' ? '✓' : state === 'in_progress' || state === 'in_review' ? '◐' : '○')

interface About { key: string; task?: { i: IssueDetail; v: StepsView | null }; graph?: Graph | null; idea?: { id: string; title: string }; /** The steps of a project or an idea; a task's are with the task. */ v?: StepsView | null }
/** What the place is about, read from the engine: the task with its steps and its project, the project, the idea. Read again on every `stamp`. */
function useAbout(subject: Subject, stamp: number) {
  const key = subject ? `${subject.kind}:${subject.id}` : ''
  const [d, setD] = useState<About | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setError(null) }, [key])
  useEffect(() => {
    if (!subject) return
    let closed = false
    void (async () => {
      try {
        let about: About
        if (subject.kind === 'task') {
          const i = await engine.issue(subject.id)
          const [v, graph] = await Promise.all([
            engine.steps({ kind: 'issues', id: i.id }).catch(() => null),
            i.project && !i.project.solo ? engine.graph(i.project.id).catch(() => null) : Promise.resolve(null),
          ])
          about = { key, task: { i, v }, graph }
        } else if (subject.kind === 'project') {
          const [graph, v] = await Promise.all([engine.graph(subject.id), engine.steps({ kind: 'projects', id: subject.id }).catch(() => null)])
          about = { key, graph, v }
        } else {
          const [idea, v] = await Promise.all([engine.idea(subject.id), engine.steps({ kind: 'ideas', id: subject.id }).catch(() => null)])
          about = { key, idea: { id: idea.id, title: idea.title }, v }
        }
        if (!closed) { setD(about); setError(null) }
      } catch (e: any) { if (!closed) setError(String(e?.message ?? e)) }
    })()
    return () => { closed = true }
  }, [key, stamp]) // eslint-disable-line react-hooks/exhaustive-deps
  return { about: d && d.key === key ? d : null, error }
}

/** One page of a task, a project or an idea: a tab at the top of the phone. */
interface Section { key: string; path: string; name: string; mark?: string; /** Waits on a step before it. */ locked?: boolean; /** Ready for the person. */ asks?: boolean }
/** The pages a place has, in the order its own nav on the computer gives them: overview, context, the brief and what feeds it, then the build. */
function sectionsOf(subject: NonNullable<Subject>, about: About | null): Section[] {
  const on = subject.kind
  const base = `/${on}s/${subject.id}`
  const rows = (on === 'task' ? about?.task?.v?.rows : about?.v?.rows) ?? []
  const of = (r: Row): Section => ({ key: r.key, path: `${base}/${r.key}`, name: label(r.key, on), mark: mark(r, on), locked: !!r.waitingOn, asks: ready(r.state, on) })
  const brief = rows.find((r) => r.key === 'brief')
  const out: Section[] = [{ key: 'overview', path: base, name: 'Overview' }, { key: 'context', path: `${base}/context`, name: 'Context' }]
  if (on === 'project') out.push({ key: 'tickets', path: `${base}/tickets`, name: 'Tickets' })
  if (brief) out.push(of(brief))
  out.push(...rows.filter((r) => r.key !== 'brief' && r.key !== 'idea').map(of))
  const i = about?.task?.i
  if (on === 'task' && i) {
    const live = i.subIssues.filter((x) => !dropped(x))
    out.push({ key: 'build', path: `${base}/build`, name: 'Build', mark: live.length ? (live.every((x) => x.state === 'done') ? '✓' : '◐') : '○' })
    if (live.length) out.push({ key: 'smoke', path: `${base}/smoke`, name: 'Smoke test' }, { key: 'pr', path: `${base}/pr`, name: 'Pull request' })
  }
  return out
}

const Icon = ({ d }: { d: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const LIST = 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'
const GRID = 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'

export function Phone({ initial = {}, address = true }: {
  /** Where a story starts: the place, which of its chat and its page shows, and what is pulled out over it. */
  initial?: { path?: string; view?: View; tray?: boolean; shelf?: boolean }
  /** Read the place from the address bar and keep it there (off where the page is not the app's, like a story). */
  address?: boolean
}) {
  const { app, apps, loaded, setAppId } = useCurrentApp()
  const arrived = useMemo(() => (address && window.location.pathname !== '/' ? window.location.pathname + window.location.search : null), [address])
  const [at, setAt] = useState<{ path: string; view: View } | null>(initial.path || arrived ? { path: initial.path ?? arrived!, view: initial.view ?? 'page' } : null)
  const [tray, setTray] = useState(!!initial.tray)
  const [shelf, setShelf] = useState(!!initial.shelf)
  const [note, setNote] = useState<{ text: string; path?: string } | null>(null)
  const [now, setNow] = useState<Now | null>(null)
  const [talks, setTalks] = useState<TalkSession[] | null>(null)
  const [appTalk, setAppTalk] = useState<string | null>(null)
  const [stamp, setStamp] = useState(0)
  const [starting, setStarting] = useState(false)
  const subject = useMemo(() => (at ? subjectOf(at.path) : null), [at?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  const strip = useRef<HTMLDivElement>(null)
  const { about, error } = useAbout(subject, stamp)
  const bump = useCallback(() => setStamp((n) => n + 1), [])

  /** Go somewhere in the app: its page, or its chat. */
  const go = useCallback((path: string, view: View = 'page') => { setAt({ path, view }); setTray(false); setShelf(false); setNote(null) }, [])
  const show = (view: View) => setAt((a) => (a ? { ...a, view } : a))
  /** The page moved by itself (a link pressed in it): that is where the phone is now. */
  const moved = useCallback((path: string) => setAt((a) => (a && a.path !== path ? { path, view: 'page' } : a)), [])

  const lastApp = useRef<string | null>(null)
  useEffect(() => { // where this phone was in the app, else My Stuff; another app starts on its own
    if (!app) return
    const switched = !!lastApp.current && lastApp.current !== app.id
    lastApp.current = app.id
    if (switched) { setNow(null); setTalks(null) }
    setAppTalk(recall(talkKey(app.id)))
    if (at && !switched) return
    let kept: { path: string; view: View } | null = null
    try { kept = JSON.parse(recall(atKey(app.id)) ?? 'null') } catch { /* start on My Stuff */ }
    setAt(kept?.path ? { path: kept.path, view: kept.view === 'chat' ? 'chat' : 'page' } : { path: '/', view: 'page' })
  }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!app || !at) return
    remember(atKey(app.id), JSON.stringify(at))
    if (address && at.path !== window.location.pathname + window.location.search) window.history.replaceState(null, '', at.path)
  }, [app?.id, at, address])

  useEffect(() => { // the app's events: one refetch per burst, as on My Stuff
    if (!app) return
    let timer: number | undefined
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(bump, 300) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, later)
    // The agent opened a page: on the computer it becomes a tab; here it is offered, and the person stays where they are.
    es.addEventListener('ui.open', ((ev: MessageEvent) => {
      const tab = (JSON.parse(ev.data) as { payload?: { tab?: Tab } }).payload?.tab
      if (tab?.kind === 'page') setNote({ text: `The agent opened ${tabTitle(tab)}.`, path: tab.path })
    }) as EventListener)
    return () => { es.close(); window.clearTimeout(timer) }
  }, [app?.id, bump])
  useEffect(() => {
    if (!app) return
    let closed = false
    void engine.now(app.id).then((n) => { if (!closed) setNow(n) }).catch(() => {})
    void engine.talks().then((t) => { if (!closed) setTalks(t.filter((x) => x.appId === app.id && !x.closedAt)) }).catch(() => { if (!closed) setTalks([]) })
    return () => { closed = true }
  }, [app?.id, stamp])

  useEffect(() => { // the open page's tab is brought into sight in the strip, also once its steps have been read
    const el = strip.current, on = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el && on) el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 })
  }, [at?.path, at?.view, about])

  /** The conversations that belong to no task and no idea: about a project, or about the app. */
  const loose = (talks ?? []).filter((t) => !t.taskId && !t.ideaId)
  const aboutApp = loose.filter((t) => !t.subjectRef?.projectId)
  const projectTalk = subject?.kind === 'project' ? loose.find((t) => t.subjectRef?.projectId === subject.id) ?? null : null
  const appChat = aboutApp.find((t) => t.id === appTalk) ?? (talks ?? []).find((t) => t.id === appTalk) ?? aboutApp[0] ?? null
  const pickTalk = (t: TalkSession) => {
    if (t.taskId) return go(`/tasks/${t.taskId}`, 'chat')
    if (t.ideaId) return go(`/ideas/${t.ideaId}`, 'chat')
    if (t.subjectRef?.projectId) return go(`/projects/${t.subjectRef.projectId}`, 'chat')
    setAppTalk(t.id); if (app) remember(talkKey(app.id), t.id)
    go(subject ? '/' : at?.path ?? '/', 'chat') // a chat about the app is the chat of the app's own places
  }
  const newChat = async (projectId?: string) => {
    if (!app) return
    setStarting(true)
    try {
      const t = await engine.startTalk({ appId: app.id, subjectRef: projectId ? { projectId } : { app: true } })
      setTalks((all) => [t, ...(all ?? [])])
      if (projectId) go(`/projects/${projectId}`, 'chat'); else pickTalk(t)
    } catch (e: any) { setNote({ text: String(e?.message ?? e) }) } finally { setStarting(false) }
  }

  // Pages and conversations ask the workspace to open things: a page is gone to; the rest needs the computer.
  const ws = useMemo<WorkspaceApi>(() => ({
    open: (tab: Tab) => { if (tab.kind === 'page') go(tab.path); else setNote({ text: `${tabTitle(tab)} opens on the computer.` }) },
    tabs: [], focused: null,
  }), [go])
  /** A link in the chat to a page of the app: the phone goes there, not to a new browser tab. */
  const onClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('.tab-page')) return // the page follows its own links
    const href = el.closest('a')?.getAttribute('href')
    if (!href?.startsWith('/') || href.startsWith('/api')) return
    e.preventDefault(); go(href)
  }

  if (loaded && !app) return <div className="phone"><div className="phone-empty"><p>No app yet. Add one on the computer, in Settings.</p></div></div>
  if (!at) return <div className="phone"><div className="phone-empty"><p className="muted">Loading…</p></div></div>

  const task = about?.task ?? null
  const asks = (now?.needsYou ?? []).map(asksOf).filter((a): a is NonNullable<ReturnType<typeof asksOf>> => !!a)
  const needs = now?.needsYou.length ?? 0
  const title = task ? `${task.i.identifier} ${task.i.title}` : subject?.kind === 'project' ? about?.graph?.project.name ?? 'Project' : subject?.kind === 'idea' ? about?.idea?.title ?? 'Idea' : placeName(at.path)
  const under = task?.i.project && !task.i.project.solo ? task.i.project.name : subject ? (error ? 'Could not be read' : app?.name) : app?.name
  const section = parts(at.path)[2]
  const here = section ?? 'overview'
  // The place's pages: a task's, a project's or an idea's sections; anywhere else, the one page it is.
  const known = subject ? sectionsOf(subject, about) : []
  const sections: Section[] = subject
    ? (known.some((x) => x.key === here) ? known : [...known, { key: here, path: at.path, name: here[0].toUpperCase() + here.slice(1) }]) // a page the list does not know (save points): it still has its tab
    : [{ key: 'overview', path: at.path, name: placeName(at.path) }]
  const shownTalk = subject ? projectTalk?.id ?? null : appChat?.id ?? null

  return (
    <WorkspaceContext.Provider value={ws}>
      <div className="phone" data-component="Phone" onClick={onClick}>
        <EngineLink />
        <header className="phone-head">
          <button type="button" className="phone-btn" aria-label="This place's nav, and the chats" aria-expanded={tray} onClick={() => { setTray(true); setShelf(false) }}>
            <Icon d={LIST} />{needs > 0 && <span className="phone-count" aria-label={`${needs} need you`}>{needs}</span>}
          </button>
          <div className="phone-title"><strong>{title}</strong>{under && <span>{under}</span>}</div>
          <button type="button" className="phone-btn" aria-label="Go anywhere in the app" aria-expanded={shelf} onClick={() => { setShelf(true); setTray(false) }}><Icon d={GRID} /></button>
        </header>
        <div className="phone-views" role="tablist" aria-label="This place's pages, and its chat">
          <div className="phone-sections" ref={strip}>
            {sections.map((x) => {
              const on = at.view === 'page' && x.key === here
              return (
                <button type="button" role="tab" key={x.key} aria-selected={on} disabled={x.locked} className={`${on ? 'on' : ''} ${x.asks ? 'asks' : ''}`} onClick={() => (x.key === here ? show('page') : go(x.path))}>
                  {x.mark && <span className={`mark ${x.mark === '✓' ? 'ok' : ''}`} aria-hidden="true">{x.mark}</span>}{x.name}
                </button>
              )
            })}
          </div>
          <button type="button" role="tab" aria-selected={at.view === 'chat'} className={`phone-chat-tab ${at.view === 'chat' ? 'on' : ''}`} onClick={() => show('chat')}>Chat</button>
        </div>

        {/* Both stay mounted: flipping between them loses neither the page's scroll nor what was being typed. */}
        <div className="phone-pane" hidden={at.view !== 'chat'}>
          {subject?.kind === 'task' ? (task
              ? <AgentChat key={task.i.id} of="task" id={task.i.id} appId={task.i.appId} stage={task.i.briefApprovedBy ? 'Build' : 'Brief'} questions={task.i.questions} onAnswered={bump} />
              : <div className="phone-empty"><p className={error ? '' : 'muted'}>{error ?? 'Loading…'}</p></div>)
            : subject?.kind === 'idea' && app ? <AgentChat key={subject.id} of="idea" id={subject.id} appId={app.id} stage="Idea" questions={[]} onAnswered={bump} />
            : subject?.kind === 'project' ? (projectTalk
              ? <div className="phone-chat"><Conversation key={projectTalk.id} sessionId={projectTalk.id} compact context={{ path: at.path, projectId: subject.id, appId: app?.id }} /></div>
              : <div className="phone-empty">{!talks ? <p className="muted">Loading…</p> : <>
                  <p>No chat about this project yet. Each of its tasks has its own.</p>
                  <button type="button" className="btn" disabled={starting} onClick={() => void newChat(subject.id)}>{starting ? 'Starting…' : 'Chat about this project'}</button>
                </>}</div>)
            : appChat ? <div className="phone-chat"><Conversation key={appChat.id} sessionId={appChat.id} compact context={{ path: at.path, appId: app?.id }} /></div>
            : <div className="phone-empty">{!talks ? <p className="muted">Loading…</p> : <>
                <p>No chat about {app?.name ?? 'the app'} yet. A task, an idea and a project each have their own, on their page.</p>
                <button type="button" className="btn" disabled={starting} onClick={() => void newChat()}>{starting ? 'Starting…' : 'New chat'}</button>
              </>}</div>}
        </div>
        <div className="phone-pane phone-page" hidden={at.view !== 'page'}>
          <PagePane path={at.path} onNavigate={moved} />
        </div>

        {note && (
          <div className="phone-note" role="status">
            <span>{note.text}</span>
            {note.path && <button type="button" onClick={() => go(note.path!)}>Go</button>}
            <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>×</button>
          </div>
        )}

        {(tray || shelf) && <button type="button" className="phone-scrim" aria-label="Close" onClick={() => { setTray(false); setShelf(false) }} />}

        {tray && (
          <nav className="phone-tray" aria-label="This place's nav, and the chats">
            <div className="phone-tray-head">
              {apps.length > 1
                ? <select aria-label="App" value={app?.id ?? ''} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                : <strong>{app?.name}</strong>}
              <button type="button" className="phone-btn plain" aria-label="Close the tray" onClick={() => setTray(false)}>×</button>
            </div>

            {task && <>
              <h2>{about?.graph ? about.graph.project.name : 'This task'}</h2>
              {about?.graph && <button type="button" className="phone-row" onClick={() => go(`/projects/${about.graph!.project.id}`)}><span className="mark" aria-hidden="true">‹</span><span className="text"><span>The project</span></span></button>}
              {(about?.graph ? (about.graph.issues.some((t) => t.id === task.i.id) ? about.graph.issues : [task.i, ...about.graph.issues]) : [task.i]).map((t) => t.id === task.i.id // a sub-task is not among the project's tasks: it goes first
                ? <div key={t.id} className="phone-here">
                    <div className="phone-row on"><span className="mark" aria-hidden="true">{stateMark(t.state)}</span><span className="text"><span>{t.identifier} {t.title}</span><small>You are here</small></span></div>
                    <Steps i={task.i} rows={task.v?.rows ?? []} here={section ?? ''} go={go} />
                  </div>
                : <button type="button" key={t.id} className="phone-row" onClick={() => go(`/tasks/${t.id}`, at.view)}>
                    <span className={`mark ${t.state === 'done' ? 'ok' : ''}`} aria-hidden="true">{stateMark(t.state)}</span><span className="text"><span>{t.identifier} {t.title}</span></span>
                  </button>)}
            </>}
            {subject?.kind === 'project' && about?.graph && <>
              <h2>Its tasks</h2>
              {about.graph.issues.map((t) => (
                <button type="button" key={t.id} className="phone-row" onClick={() => go(`/tasks/${t.id}`)}>
                  <span className={`mark ${t.state === 'done' ? 'ok' : ''}`} aria-hidden="true">{stateMark(t.state)}</span><span className="text"><span>{t.identifier} {t.title}</span></span>
                </button>
              ))}
              {!about.graph.issues.length && <p className="phone-aside">No tasks yet.</p>}
            </>}

            {needs > 0 && <h2>Needs you · {needs}</h2>}
            {asks.map((a, n) => (
              <button type="button" key={`${a.path}:${n}`} className="phone-row asks" onClick={() => go(a.path, a.view)}>
                <span className="mark" aria-hidden="true">●</span><span className="text"><span>{a.title}</span><small>{a.why}</small></span>
              </button>
            ))}
            {needs > asks.length && (
              <button type="button" className="phone-row" onClick={() => go('/')}>
                <span className="mark" aria-hidden="true">›</span><span className="text"><span>{asks.length ? `${needs - asks.length} more on My Stuff` : 'See them on My Stuff'}</span></span>
              </button>
            )}

            <h2>Chats</h2>
            {(talks ?? []).filter((t) => t.id !== shownTalk && !(task && t.taskId === task.i.id) && !(subject?.kind === 'idea' && t.ideaId === subject.id)).map((t) => (
              <button type="button" key={t.id} className="phone-row" onClick={() => pickTalk(t)}>
                <span className="phone-dot" style={{ background: talkColor(t.id) }} aria-hidden="true" />
                <span className="text"><span>{t.subject ?? t.title ?? 'A conversation'}</span><small>{t.taskId ? 'a task\'s' : t.ideaId ? 'an idea\'s' : t.subjectRef?.projectId ? 'a project\'s' : 'about the app'}{t.busy ? ' · working' : ''}</small></span>
              </button>
            ))}
            <button type="button" className="phone-row" disabled={starting} onClick={() => void newChat()}>
              <span className="mark" aria-hidden="true">+</span><span className="text"><span>{starting ? 'Starting…' : 'New chat about the app'}</span></span>
            </button>
          </nav>
        )}

        {shelf && (
          <section className="phone-shelf" aria-label="Go anywhere in the app">
            <span className="phone-grab" aria-hidden="true" />
            <h2>{app?.name ?? 'The app'}</h2>
            {[['/', 'My Stuff'], ['/projects', 'Projects'], ['/tasks', 'Tasks'], ['/ideas', 'Ideas'], ['/todos', 'To-dos'], ['/learn', 'Learn'], ['/settings', 'Settings']].map(([path, name]) => (
              <button type="button" key={path} className={`phone-row ${!subject && placeName(at.path) === name ? 'on' : ''}`} onClick={() => go(path)}>
                <span className="text"><span>{name}</span></span>{path === '/' && needs > 0 && <span className="badge warn">{needs}</span>}
              </button>
            ))}
            <p className="phone-aside">Prototypes, Storybook and the terminal stay on the computer.</p>
            <button type="button" className="phone-row" onClick={() => { try { sessionStorage.setItem(FULL_KEY, '1') } catch { /* fine */ } window.location.reload() }}>
              <span className="text"><span>The full site, on this phone</span><small>Until this tab is closed</small></span>
            </button>
          </section>
        )}
      </div>
    </WorkspaceContext.Provider>
  )
}

/** Where a task's build stands, in a few words. */
function buildSays(i: IssueDetail) {
  const live = i.subIssues.filter((s) => !dropped(s))
  if (!live.length) return i.briefApprovedBy ? 'not planned yet' : 'after the brief'
  return `${live.filter((s) => s.state === 'done').length} of ${live.length} sub-tasks done`
}

/** This task's steps, under it in the tray: the brief and what feeds it, then the build. Each is a page of the task. */
function Steps({ i, rows, here, go }: { i: IssueDetail; rows: Row[]; /** The step whose page is open; '' the overview. */ here: string; go: (path: string) => void }) {
  const base = `/tasks/${i.id}`
  const brief = rows.find((r) => r.key === 'brief')
  const stands = briefStands(rows, 'task')
  const live = i.subIssues.filter((s) => !dropped(s))
  const row = (r: Row, text: string, under: string | null) => (
    <button type="button" key={r.key} className={`phone-row step ${here === r.key ? 'here' : ''}`} disabled={!!r.waitingOn} onClick={() => go(`${base}/${r.key}`)}>
      <span className={`mark ${mark(r, 'task') === '✓' ? 'ok' : ''}`} aria-hidden="true">{mark(r, 'task')}</span>
      <span className="text"><span>{text}</span>{r.waitingOn ? <small>after {label(r.waitingOn, 'task')}</small> : under ? <small className={ready(r.state, 'task') ? 'asks' : ''}>{under}</small> : null}</span>
    </button>
  )
  return (
    <div className="phone-steps">
      <button type="button" className={`phone-row step ${here === '' ? 'here' : ''}`} onClick={() => go(base)}><span className="mark" aria-hidden="true">⌂</span><span className="text"><span>Overview</span></span></button>
      {brief && row(brief, `${step('brief').icon} The brief`, stands)}
      {rows.filter((r) => r.key !== 'brief' && r.key !== 'idea').map((r) => row(r, `${step(r.key).icon} ${label(r.key, 'task')}`, ready(r.state, 'task') ? 'ready for you' : null))}
      <button type="button" className={`phone-row step ${here === 'build' ? 'here' : ''}`} onClick={() => go(`${base}/build`)}>
        <span className={`mark ${live.length && live.every((s) => s.state === 'done') ? 'ok' : ''}`} aria-hidden="true">{live.length ? (live.every((s) => s.state === 'done') ? '✓' : '◐') : '○'}</span>
        <span className="text"><span>🏗️ Build</span><small>{buildSays(i)}</small></span>
      </button>
    </div>
  )
}

/** A task's or an idea's chat: its own agent, the agents it has out as tabs, and what it asks, answered where it is read. */
function AgentChat({ of, id, appId, stage, questions, onAnswered }: { of: 'task' | 'idea'; id: string; appId: string; stage: string; questions: Question[]; onAnswered: () => void }) {
  const agent = useTaskAgent(id, appId, of)
  const [busy, setBusy] = useState(false)
  const open = questions.filter((q) => q.status === 'open')
  const answer = async (qid: string, text: string) => { setBusy(true); try { await engine.answer(qid, text); onAnswered() } finally { setBusy(false) } }
  return (
    <div className="phone-chat">
      {open.length > 0 && <div className="phone-asks">{open.map((q) => <QuestionAsk key={q.id} q={q} busy={busy} onAnswer={(a) => answer(q.id, a)} />)}</div>}
      <TaskAgent open onToggle={() => {}} of={of} sessionId={agent.session?.id ?? null} taskId={id} stage={stage}
        state={agent.out.some((a) => a.asking) ? 'waiting' : agent.session?.busy ? 'working' : 'idle'}
        deployed={agent.out.map((a) => ({ what: a.what, icon: a.icon ?? '🛠️', title: a.title, sessionId: a.sessionId, runId: a.runId, detail: a.detail, failed: a.failed, state: a.busy ? 'out' as const : 'back' as const, asking: a.asking ? `${a.asking.tool}: ${a.asking.what}` : undefined }))}
        onStart={() => void agent.start()} starting={agent.starting} error={agent.error} />
    </div>
  )
}
