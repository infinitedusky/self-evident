/**
 * A task's own agent, in a column of the task's page: one conversation for the life of the task, the conductor of its
 * worktree (SHAPE.md, "One conductor per worktree"). It stays put while the steps of the brief and the build change
 * beside it, so it is plain whose agent it is and nothing from another task is in it (Sandy, 2026-11-10: "an agent
 * chat thing within the task itself, so we know that it's its own thing and that we're not sharing across different
 * tasks … static across the different steps of the brief and the build"). Under its name: the agents it has out,
 * each on one piece of work (a prototype's builder; a fresh agent on each check once the prototype is approved). It folds to a thin strip. After Linear's issue page, which keeps an issue's activity on
 * the issue, and Cursor's chat column, which stays while the editor changes.
 */
import { AgentStrip, type AgentStripProps } from './AgentStrip'
import { Conversation } from './Conversation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { openEvents, API, engine, type TalkSession, type TaskAgentOut } from '../engine'
import { currentTalk, talkColor } from '../workspace'

const OPEN_KEY = 'se.task-agent.open'
/** Said by a page when it hands a step to the task's agent: the column opens and looks for the conversation again. */
export const TASK_AGENT_ASKED = 'se:task-agent-asked'

/**
 * The task's own conversation, kept up to date on its app's talk events (so the dot shows it working), with the
 * column's open or folded state remembered in this browser, and a way to start the agent when the task has none.
 */
export function useTaskAgent(taskId: string, appId: string) {
  const [session, setSession] = useState<TalkSession | null | undefined>(undefined)
  const [out, setOut] = useState<TaskAgentOut[]>([])
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((on: boolean) => { setOpen(on); try { localStorage.setItem(OPEN_KEY, on ? '1' : '0') } catch { /* fine */ } }, [])
  useEffect(() => {
    let closed = false
    const refresh = () => { void engine.taskAgents(taskId).then((a) => { if (!closed) setOut(Array.isArray(a) ? a : []) }).catch(() => {}); return engine.taskTalk(taskId).then((s) => { if (!closed) setSession(s) }).catch(() => { if (!closed) setSession(null) }) }
    void refresh()
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 200) }
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    for (const t of ['talk.message', 'talk.permission', 'talk.result', 'prototype.created', 'prototype.started', 'prototype.stopped', 'prototype.discarded', 'step.updated']) es.addEventListener(t, bump)
    const asked = () => { show(true); bump() }
    window.addEventListener(TASK_AGENT_ASKED, asked)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current); window.removeEventListener(TASK_AGENT_ASKED, asked) }
  }, [taskId, appId, show])
  useEffect(() => { if (session?.id) currentTalk.set(session.id) }, [session?.id]) // a Sketches or Mockups tab opened from here shows this task's worktree
  const start = async () => {
    setStarting(true); setError(null)
    try { setSession(await engine.startTaskTalk(taskId)) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) }
  }
  return { session, out, open, toggle: () => show(!open), start, starting, error }
}

/** A fresh agent the conductor sent out, and what it is on; with `sessionId`, its conversation can be read here, as a tab of its own. */
export interface Deployed { what: string; icon?: string; state: 'out' | 'back'; detail?: string; sessionId?: string; title?: string }

export function TaskAgent({ sessionId, taskId, stage, state = 'idle', deployed = [], open, onToggle, onStart, starting, error }: {
  /** The task's conversation; none until its agent is started. */
  sessionId: string | null
  taskId: string
  /** The stage it's at now: Sketches, Brief, Build. */
  stage: string
  state?: AgentStripProps['state']
  deployed?: Deployed[]
  open: boolean
  onToggle: () => void
  onStart?: () => void
  starting?: boolean
  /** Why its agent could not be started, in words. */
  error?: string | null
}) {
  const color = talkColor(sessionId ?? taskId)
  // Which conversation the column shows: the conductor's, or one of the agents it has out. They are tabs, so an agent at work is never out of sight.
  const [shown, setShown] = useState<string | null>(null)
  const tabs = deployed.filter((d) => d.sessionId)
  const sub = tabs.find((d) => d.sessionId === shown) ?? null
  if (!open) return (
    <aside className="task-agent folded" data-component="TaskAgent" style={{ ['--talk' as string]: color }}>
      <button className="task-agent-fold" onClick={onToggle} aria-expanded="false" aria-label="Show this task's agent" title="Show this task's agent">
        <span className={`dot ${state}`} /><span className="task-agent-fold-text">This task's agent</span><span aria-hidden="true">‹</span>
      </button>
    </aside>
  )
  return (
    <aside className="task-agent" data-component="TaskAgent">
      <div className="task-agent-head">
        <AgentStrip color={color} name="This task's agent" stage={stage} state={state} />
        <button className="btn quiet small" onClick={onToggle} aria-expanded="true" aria-label="Hide this task's agent" title="Hide this task's agent">›</button>
      </div>
      {tabs.length > 0 && (
        <div className="task-agent-tabs" role="tablist" aria-label="This task's agents">
          <button role="tab" aria-selected={!sub} className={!sub ? 'on' : ''} onClick={() => setShown(null)}><span className={`dot ${state}`} />This task's agent</button>
          {tabs.map((d) => (
            <button key={d.sessionId} role="tab" aria-selected={sub === d} className={sub === d ? 'on' : ''} onClick={() => setShown(d.sessionId!)} title={`${d.title ?? d.what}: ${d.state === 'out' ? 'working' : 'idle'}`}>
              <span className={`dot ${d.state === 'out' ? 'working' : ''}`} />{d.icon} {d.what}{d.state === 'out' && <span className="faint"> · working</span>}
            </button>
          ))}
        </div>
      )}
      {deployed.filter((d) => !d.sessionId).length > 0 && (
        <ul className="list task-agent-out" aria-label="Agents it has out">
          {deployed.filter((d) => !d.sessionId).map((d) => (
            <li key={d.what} className={d.state}>
              <span className={`dot ${d.state === 'out' ? 'working' : ''}`} />
              <span>{d.icon} {d.what}</span>
              <span className="faint">{d.state === 'out' ? 'a fresh agent is on it' : d.detail ?? 'back'}</span>
            </li>
          ))}
        </ul>
      )}
      {sub
        ? <Conversation key={sub.sessionId} sessionId={sub.sessionId!} compact context={{ path: `/tasks/${taskId}`, issueId: taskId, label: `the ${sub.what.toLowerCase()}` }} />
        : sessionId
        ? <Conversation key={sessionId} sessionId={sessionId} compact context={{ path: `/tasks/${taskId}`, issueId: taskId, label: 'this task' }} />
        : (
          <div className="task-agent-empty">
            <p className="faint">No agent on this task yet. One agent stays with it from the first sketch to the merge, and sends out others where the work needs fresh eyes.</p>
            <button className="btn" disabled={starting || !onStart} onClick={onStart}>{starting ? 'Starting…' : 'Start this task\'s agent'}</button>
            {error && <div className="empty bad">{error}</div>}
          </div>
        )}
    </aside>
  )
}
