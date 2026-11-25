/**
 * Evident on a phone: one chat on the screen, and everything else a pull away (Sandy, 2026-11-23: "it needs to hold
 * the agents chat only and then have ways to look at things that are needed outside of those chats"; 2026-11-25:
 * "just implement what we have for C and then try it out"). The workspace of tabs does not fit a phone, so a narrow
 * screen gets this instead of it.
 *
 * - The chat: a task's own agent, with the agents it has out as tabs under the task's name (TaskAgent, as on the
 *   task's page), or a conversation about the app as a whole.
 * - The tray, from the left: what needs you, the project's tasks, this task's steps, the other chats. It is how you
 *   change chat.
 * - Look, from the bottom: this task's pages and the rest of the app.
 * - A page looked at opens over the chat (the app's own page, in a PagePane), with the way back at its top.
 *
 * After Slack's phone app (the channel list slides in from the left over one conversation) and Linear's (an issue's
 * detail as a sheet over the list). Prototypes, Storybook and the terminal stay on the computer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { label, ready, step, type Row } from '@self-evident/engine/steps'
import { openEvents, API, engine, EVENT_TYPES, type Attention, type Graph, type IssueDetail, type Now, type StepsView, type TalkSession } from '../engine'
import { useCurrentApp } from '../current-app'
import { tabTitle, talkColor, WorkspaceContext, type Tab, type WorkspaceApi } from '../workspace'
import { Conversation } from './Conversation'
import { EngineLink } from './EngineLink'
import { PagePane } from './PagePane'
import { QuestionAsk } from './QuestionAsk'
import { TaskAgent, useTaskAgent } from './TaskAgent'
import { briefStands, mark } from './TaskNav'

export type PhoneChat = { kind: 'task'; /** The task's id, or its identifier (SE-12): the engine knows both. */ id: string } | { kind: 'talk'; id: string }

const NARROW = '(max-width: 700px)'
const FULL_KEY = 'se.phone.full' // "the full site", asked for on a phone: for this visit only
const chatKey = (appId: string) => `se.phone.chat.${appId}`
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

/** What needs the person and belongs to one task: pressing it goes to that task's chat. */
function asksOf(a: Attention): { id: string; title: string; why: string } | null {
  switch (a.kind) {
    case 'failed_build': return { id: a.issueId, title: `${a.identifier} ${a.title}`, why: 'its build failed' }
    case 'plan_issue': return { id: a.issueId, title: `${a.identifier} ${a.issueTitle}`, why: 'not planned yet' }
    case 'smoke_test': return { id: a.issueId, title: `${a.identifier} ${a.issueTitle}`, why: `${a.owed} check${a.owed === 1 ? '' : 's'} only you can do` }
    case 'approve_brief': return { id: a.issueId, title: `${a.identifier} ${a.issueTitle}`, why: 'its brief is ready to approve' }
    case 'question': return a.issueIdentifier ? { id: a.issueIdentifier, title: a.issueIdentifier, why: a.text } : null
    default: return null
  }
}

/** A task's chat named by the address (/tasks/SE-12, /tasks/iss_…/brief), and the page to open over it. */
function fromAddress(path: string): { chat: PhoneChat | null; sheet: string | null } {
  const task = path.match(/^\/tasks\/([^/?#]+)(\/[^?#]+)?/)
  if (task) return { chat: { kind: 'task', id: task[1] }, sheet: task[2] ? path : null }
  return { chat: null, sheet: path !== '/' && path !== '' ? path : null }
}

/** A looked-at page's name, for the top of it. */
function sheetTitle(path: string) {
  const first = path.split('?')[0].split('/')[1] ?? ''
  if (!first) return 'My Stuff'
  if (first === 'tasks' && path.split('?')[0].split('/').length > 2) return 'Task'
  if (first === 'todos') return 'To-dos'
  return first[0].toUpperCase() + first.slice(1)
}

const isTask = (i: IssueDetail, id: string) => i.id === id || i.identifier === id
const dropped = (s: { state: string }) => s.state === 'canceled' || s.state === 'duplicate'
const stateMark = (state: string) => (state === 'done' ? '✓' : state === 'in_progress' || state === 'in_review' ? '◐' : '○')

/** The task in the chat: itself, its steps, and its project's tasks. Read again on every `stamp`. */
function useTask(id: string | null, stamp: number) {
  const [d, setD] = useState<{ i: IssueDetail; v: StepsView | null; g: Graph | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setD(null); setError(null) }, [id])
  useEffect(() => {
    if (!id) return
    let closed = false
    void (async () => {
      try {
        const i = await engine.issue(id)
        const [v, g] = await Promise.all([
          engine.steps({ kind: 'issues', id: i.id }).catch(() => null),
          i.project && !i.project.solo ? engine.graph(i.project.id).catch(() => null) : Promise.resolve(null),
        ])
        if (!closed) { setD({ i, v, g }); setError(null) }
      } catch (e: any) { if (!closed) setError(String(e?.message ?? e)) }
    })()
    return () => { closed = true }
  }, [id, stamp])
  return { task: d && id && isTask(d.i, id) ? d : null, error }
}

const Icon = ({ d }: { d: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const LIST = 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'
const GRID = 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'

export function Phone({ initial = {}, address = true }: {
  /** Where a story starts: the chat, and what is pulled out over it. */
  initial?: { chat?: PhoneChat; tray?: boolean; shelf?: boolean; sheet?: string }
  /** Read the chat and the page from the address bar (off where the page is not the app's, like a story). */
  address?: boolean
}) {
  const { app, apps, loaded, setAppId } = useCurrentApp()
  const arrived = useMemo(() => (address ? fromAddress(window.location.pathname) : { chat: null, sheet: null }), [address])
  const [chat, setChatState] = useState<PhoneChat | null>(initial.chat ?? arrived.chat)
  const [tray, setTray] = useState(!!initial.tray)
  const [shelf, setShelf] = useState(!!initial.shelf)
  const [sheet, setSheet] = useState<string | null>(initial.sheet ?? arrived.sheet)
  const [note, setNote] = useState<{ text: string; path?: string } | null>(null)
  const [now, setNow] = useState<Now | null>(null)
  const [talks, setTalks] = useState<TalkSession[] | null>(null)
  const [stamp, setStamp] = useState(0)
  const [starting, setStarting] = useState(false)
  const picked = useRef<string | null>(chat ? '*' : null) // the app a chat was picked for; '*': given from outside
  const { task, error } = useTask(chat?.kind === 'task' ? chat.id : null, stamp)

  const setChat = useCallback((c: PhoneChat | null) => {
    setChatState(c); setTray(false); setShelf(false)
    if (app && c) remember(chatKey(app.id), JSON.stringify(c))
  }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const look = useCallback((path: string) => { setSheet(path); setTray(false); setShelf(false); setNote(null) }, [])

  useEffect(() => { // the app's events: one refetch per burst, as on My Stuff
    if (!app) return
    let timer: number | undefined
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setStamp((n) => n + 1), 300) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, bump)
    // The agent opened a page: on the computer it becomes a tab; here it is offered, never thrown over the chat.
    es.addEventListener('ui.open', ((ev: MessageEvent) => {
      const tab = (JSON.parse(ev.data) as { payload?: { tab?: Tab } }).payload?.tab
      if (tab?.kind === 'page') setNote({ text: `The agent opened ${tabTitle(tab)}.`, path: tab.path })
    }) as EventListener)
    return () => { es.close(); window.clearTimeout(timer) }
  }, [app?.id])
  useEffect(() => {
    if (!app) return
    let closed = false
    void engine.now(app.id).then((n) => { if (!closed) setNow(n) }).catch(() => {})
    void engine.talks().then((t) => { if (!closed) setTalks(t.filter((x) => x.appId === app.id && !x.closedAt)) }).catch(() => { if (!closed) setTalks([]) })
    return () => { closed = true }
  }, [app?.id, stamp])

  const lastApp = useRef<string | null>(null)
  useEffect(() => { // another app: its own chat, picked afresh
    if (!app) return
    if (lastApp.current && lastApp.current !== app.id) { picked.current = null; setChatState(null); setNow(null); setTalks(null) }
    lastApp.current = app.id
  }, [app?.id])
  useEffect(() => { // no chat given: the one this phone was on, else what needs you first, else the newest conversation
    if (!app || picked.current === '*' || picked.current === app.id) return
    try { const kept = JSON.parse(recall(chatKey(app.id)) ?? 'null') as PhoneChat | null; if (kept?.id) { picked.current = app.id; setChatState(kept); return } } catch { /* pick afresh */ }
    if (!now || !talks) return
    picked.current = app.id
    const asks = now.needsYou.map(asksOf).find((a) => a)
    const own = talks.find((t) => t.taskId)
    setChatState(asks ? { kind: 'task', id: asks.id } : own?.taskId ? { kind: 'task', id: own.taskId } : talks[0] ? { kind: 'talk', id: talks[0].id } : null)
  }, [app?.id, now, talks])

  const newChat = async () => {
    if (!app) return
    setStarting(true)
    try { const t = await engine.startTalk({ appId: app.id, subjectRef: { app: true } }); setTalks((all) => [t, ...(all ?? [])]); setChat({ kind: 'talk', id: t.id }) }
    catch (e: any) { setNote({ text: String(e?.message ?? e) }) }
    finally { setStarting(false) }
  }

  // Pages and conversations ask the workspace to open things: a page opens over the chat; the rest needs the computer.
  const ws = useMemo<WorkspaceApi>(() => ({
    open: (tab: Tab) => { if (tab.kind === 'page') look(tab.path); else setNote({ text: `${tabTitle(tab)} opens on the computer.` }) },
    tabs: [], focused: null,
  }), [look])
  /** A link in the chat to a page of the app: it opens over the chat, not as a new browser tab. */
  const onClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('.tab-page')) return // a page over the chat follows its own links
    const href = el.closest('a')?.getAttribute('href')
    if (!href?.startsWith('/') || href.startsWith('/api')) return
    e.preventDefault(); look(href)
  }

  const asks = (now?.needsYou ?? []).map(asksOf).filter((a): a is NonNullable<ReturnType<typeof asksOf>> => !!a)
  const needs = now?.needsYou.length ?? 0
  const talk = chat?.kind === 'talk' ? talks?.find((t) => t.id === chat.id) ?? null : null
  const title = chat?.kind === 'task' ? (task ? `${task.i.identifier} ${task.i.title}` : chat.id) : chat ? talk?.subject ?? talk?.title ?? 'A conversation' : app?.name ?? 'Evident'
  const under = chat?.kind === 'task'
    ? task ? `${task.i.project && !task.i.project.solo ? `${task.i.project.name} · ` : ''}${task.i.briefApprovedBy ? 'Build' : 'Brief'}` : error ? 'Could not be read' : 'Loading…'
    : chat ? `About ${app?.name ?? 'the app'}` : null
  const color = chat?.kind === 'talk' ? talkColor(chat.id) : undefined

  if (loaded && !app) return <div className="phone"><div className="phone-empty"><p>No app yet. Add one on the computer, in Settings.</p></div></div>
  return (
    <WorkspaceContext.Provider value={ws}>
      <div className="phone" data-component="Phone" onClick={onClick}>
        <EngineLink />
        <header className="phone-head">
          <button type="button" className="phone-btn" aria-label="Tasks, steps and chats" aria-expanded={tray} onClick={() => { setTray(true); setShelf(false) }}>
            <Icon d={LIST} />{needs > 0 && <span className="phone-count" aria-label={`${needs} need you`}>{needs}</span>}
          </button>
          <div className="phone-title">
            <strong>{color && <span className="phone-dot" style={{ background: color }} aria-hidden="true" />}{title}</strong>
            {under && <span>{under}</span>}
          </div>
          <button type="button" className="phone-btn" aria-label="Look" aria-expanded={shelf} onClick={() => { setShelf(true); setTray(false) }}><Icon d={GRID} /></button>
        </header>

        {chat?.kind === 'task' && task ? <TaskChat key={task.i.id} i={task.i} onAnswered={() => setStamp((n) => n + 1)} />
          : chat?.kind === 'task' ? <div className="phone-empty">{error ? <><p>{error}</p><button type="button" className="btn quiet" onClick={() => { setChatState(null); setTray(true) }}>Pick another chat</button></> : <p className="muted">Loading…</p>}</div>
          : chat ? <div className="phone-chat"><Conversation key={chat.id} sessionId={chat.id} compact context={{ path: '/', appId: app?.id }} /></div>
          : <div className="phone-empty">
              {!now || !talks ? <p className="muted">Loading…</p> : <>
                <p>No chat yet. Start one about {app?.name ?? 'the app'}, or pick a task from the tray.</p>
                <button type="button" className="btn" disabled={starting} onClick={() => void newChat()}>{starting ? 'Starting…' : 'New chat'}</button>
              </>}
            </div>}

        {note && (
          <div className="phone-note" role="status">
            <span>{note.text}</span>
            {note.path && <button type="button" onClick={() => look(note.path!)}>Look</button>}
            <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>×</button>
          </div>
        )}

        {(tray || shelf) && <button type="button" className="phone-scrim" aria-label="Close" onClick={() => { setTray(false); setShelf(false) }} />}

        {tray && (
          <nav className="phone-tray" aria-label="Tasks, steps and chats">
            <div className="phone-tray-head">
              {apps.length > 1
                ? <select aria-label="App" value={app?.id ?? ''} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                : <strong>{app?.name}</strong>}
              <button type="button" className="phone-btn plain" aria-label="Close the tray" onClick={() => setTray(false)}>×</button>
            </div>

            {needs > 0 && <h2>Needs you · {needs}</h2>}
            {asks.map((a, n) => (
              <button type="button" key={`${a.id}:${n}`} className="phone-row asks" onClick={() => setChat({ kind: 'task', id: a.id })}>
                <span className="mark" aria-hidden="true">●</span><span className="text"><span>{a.title}</span><small>{a.why}</small></span>
              </button>
            ))}
            {needs > asks.length && (
              <button type="button" className="phone-row" onClick={() => look('/')}>
                <span className="mark" aria-hidden="true">›</span><span className="text"><span>{asks.length ? `${needs - asks.length} more on My Stuff` : 'See them on My Stuff'}</span></span>
              </button>
            )}

            {task && <>
              <h2>{task.g ? task.g.project.name : 'This task'}</h2>
              {(task.g ? (task.g.issues.some((t) => t.id === task.i.id) ? task.g.issues : [task.i, ...task.g.issues]) : [task.i]).map((t) => t.id === task.i.id // a sub-task is not among the project's tasks: it goes first
                ? <div key={t.id} className="phone-here">
                    <div className="phone-row on"><span className="mark" aria-hidden="true">{stateMark(t.state)}</span><span className="text"><span>{t.identifier} {t.title}</span><small>This chat</small></span></div>
                    <Steps i={task.i} rows={task.v?.rows ?? []} look={look} />
                  </div>
                : <button type="button" key={t.id} className="phone-row" onClick={() => setChat({ kind: 'task', id: t.id })}>
                    <span className={`mark ${t.state === 'done' ? 'ok' : ''}`} aria-hidden="true">{stateMark(t.state)}</span><span className="text"><span>{t.identifier} {t.title}</span></span>
                  </button>)}
            </>}

            <h2>Other chats</h2>
            {(talks ?? []).filter((t) => !(chat?.kind === 'talk' && t.id === chat.id) && !(task && t.taskId === task.i.id)).map((t) => (
              <button type="button" key={t.id} className="phone-row" onClick={() => setChat(t.taskId ? { kind: 'task', id: t.taskId } : { kind: 'talk', id: t.id })}>
                <span className="phone-dot" style={{ background: talkColor(t.id) }} aria-hidden="true" />
                <span className="text"><span>{t.subject ?? t.title ?? 'A conversation'}</span>{t.busy && <small>working</small>}</span>
              </button>
            ))}
            <button type="button" className="phone-row" disabled={starting} onClick={() => void newChat()}>
              <span className="mark" aria-hidden="true">+</span><span className="text"><span>{starting ? 'Starting…' : 'New chat'}</span></span>
            </button>
          </nav>
        )}

        {shelf && (
          <section className="phone-shelf" aria-label="Look">
            <span className="phone-grab" aria-hidden="true" />
            {task && <>
              <h2>On {task.i.identifier}</h2>
              <div className="phone-tiles">
                <button type="button" className="phone-tile" onClick={() => look(`/tasks/${task.i.id}`)}><span>Overview</span></button>
                <button type="button" className="phone-tile" onClick={() => look(`/tasks/${task.i.id}/brief`)}><span>Brief</span><small>{task.i.briefApprovedBy ? 'approved' : briefStands(task.v?.rows ?? [], 'task') ?? 'not approved'}</small></button>
                <button type="button" className="phone-tile" onClick={() => look(`/tasks/${task.i.id}/build`)}><span>Build</span><small>{buildSays(task.i)}</small></button>
                {task.i.pr?.url
                  ? <a className="phone-tile" href={task.i.pr.url} target="_blank" rel="noreferrer"><span>Pull request</span><small>#{task.i.pr.number} on GitHub</small></a>
                  : <div className="phone-tile off"><span>Pull request</span><small>not open yet</small></div>}
              </div>
            </>}
            <h2>Everything else</h2>
            <button type="button" className="phone-row" onClick={() => look('/')}><span className="text"><span>My Stuff</span></span>{needs > 0 && <span className="badge warn">{needs}</span>}</button>
            <button type="button" className="phone-row" onClick={() => look('/projects')}><span className="text"><span>Projects</span></span></button>
            <button type="button" className="phone-row" onClick={() => look('/tasks')}><span className="text"><span>Tasks</span></span></button>
            <button type="button" className="phone-row" onClick={() => look('/ideas')}><span className="text"><span>Ideas</span></span></button>
            <button type="button" className="phone-row" onClick={() => look('/todos')}><span className="text"><span>To-dos</span></span></button>
            <p className="phone-aside">Prototypes, Storybook and the terminal stay on the computer.</p>
            <button type="button" className="phone-row" onClick={() => { try { sessionStorage.setItem(FULL_KEY, '1') } catch { /* fine */ } window.location.reload() }}>
              <span className="text"><span>The full site, on this phone</span><small>Until this tab is closed</small></span>
            </button>
          </section>
        )}

        {sheet && (
          <section className="phone-sheet" aria-label={sheetTitle(sheet)}>
            <header className="phone-sheet-head">
              <button type="button" aria-label="Back to the chat" onClick={() => setSheet(null)}>‹ Chat</button>
              <strong>{sheetTitle(sheet)}</strong>
            </header>
            <PagePane path={sheet} onNavigate={setSheet} />
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

/** This task's steps, under it in the tray: the brief and what feeds it, then the build. Each opens its page. */
function Steps({ i, rows, look }: { i: IssueDetail; rows: Row[]; look: (path: string) => void }) {
  const base = `/tasks/${i.id}`
  const brief = rows.find((r) => r.key === 'brief')
  const stands = briefStands(rows, 'task')
  const live = i.subIssues.filter((s) => !dropped(s))
  const row = (r: Row, text: string, under: string | null) => (
    <button type="button" key={r.key} className="phone-row step" disabled={!!r.waitingOn} onClick={() => look(`${base}/${r.key}`)}>
      <span className={`mark ${mark(r, 'task') === '✓' ? 'ok' : ''}`} aria-hidden="true">{mark(r, 'task')}</span>
      <span className="text"><span>{text}</span>{r.waitingOn ? <small>after {label(r.waitingOn, 'task')}</small> : under ? <small className={ready(r.state, 'task') ? 'asks' : ''}>{under}</small> : null}</span>
    </button>
  )
  return (
    <div className="phone-steps">
      <button type="button" className="phone-row step" onClick={() => look(base)}><span className="mark" aria-hidden="true">⌂</span><span className="text"><span>Overview</span></span></button>
      {brief && row(brief, `${step('brief').icon} The brief`, stands)}
      {rows.filter((r) => r.key !== 'brief' && r.key !== 'idea').map((r) => row(r, `${step(r.key).icon} ${label(r.key, 'task')}`, ready(r.state, 'task') ? 'ready for you' : null))}
      <button type="button" className="phone-row step" onClick={() => look(`${base}/build`)}>
        <span className={`mark ${live.length && live.every((s) => s.state === 'done') ? 'ok' : ''}`} aria-hidden="true">{live.length ? (live.every((s) => s.state === 'done') ? '✓' : '◐') : '○'}</span>
        <span className="text"><span>🏗️ Build</span><small>{buildSays(i)}</small></span>
      </button>
    </div>
  )
}

/** A task's chat: its own agent, the agents it has out as tabs, and what it asks, answered where it is read. */
function TaskChat({ i, onAnswered }: { i: IssueDetail; onAnswered: () => void }) {
  const agent = useTaskAgent(i.id, i.appId)
  const [busy, setBusy] = useState(false)
  const open = i.questions.filter((q) => q.status === 'open')
  const answer = async (id: string, text: string) => { setBusy(true); try { await engine.answer(id, text); onAnswered() } finally { setBusy(false) } }
  return (
    <div className="phone-chat">
      {open.length > 0 && <div className="phone-asks">{open.map((q) => <QuestionAsk key={q.id} q={q} busy={busy} onAnswer={(a) => answer(q.id, a)} />)}</div>}
      <TaskAgent open onToggle={() => {}} sessionId={agent.session?.id ?? null} taskId={i.id} stage={i.briefApprovedBy ? 'Build' : 'Brief'}
        state={agent.out.some((a) => a.asking) ? 'waiting' : agent.session?.busy ? 'working' : 'idle'}
        deployed={agent.out.map((a) => ({ what: a.what, icon: a.icon ?? '🛠️', title: a.title, sessionId: a.sessionId, runId: a.runId, detail: a.detail, failed: a.failed, state: a.busy ? 'out' as const : 'back' as const, asking: a.asking ? `${a.asking.tool}: ${a.asking.what}` : undefined }))}
        onStart={() => void agent.start()} starting={agent.starting} error={agent.error} />
    </div>
  )
}
