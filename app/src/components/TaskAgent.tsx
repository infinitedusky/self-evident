/**
 * A task's own agent, in a column of the task's page: one conversation for the life of the task, the conductor of its
 * worktree (SHAPE.md, "One conductor per worktree"). It stays put while the steps of the brief and the build change
 * beside it, so it is plain whose agent it is and nothing from another task is in it (Sandy, 2026-11-10: "an agent
 * chat thing within the task itself, so we know that it's its own thing and that we're not sharing across different
 * tasks … static across the different steps of the brief and the build"). Under its name: the agents it has out,
 * each on one piece of work. It folds to a thin strip. After Linear's issue page, which keeps an issue's activity on
 * the issue, and Cursor's chat column, which stays while the editor changes.
 */
import { AgentStrip, type AgentStripProps } from './AgentStrip'
import { Conversation } from './Conversation'
import { talkColor } from '../workspace'

/** A fresh agent the conductor sent out, and what it is on. */
export interface Deployed { what: string; icon?: string; state: 'out' | 'back'; detail?: string }

export function TaskAgent({ sessionId, taskId, stage, state = 'idle', deployed = [], open, onToggle, onStart, starting }: {
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
}) {
  const color = talkColor(sessionId ?? taskId)
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
      {deployed.length > 0 && (
        <ul className="list task-agent-out" aria-label="Agents it has out">
          {deployed.map((d) => (
            <li key={d.what} className={d.state}>
              <span className={`dot ${d.state === 'out' ? 'working' : ''}`} />
              <span>{d.icon} {d.what}</span>
              <span className="faint">{d.state === 'out' ? 'a fresh agent is on it' : d.detail ?? 'back'}</span>
            </li>
          ))}
        </ul>
      )}
      {sessionId
        ? <Conversation sessionId={sessionId} compact context={{ path: `/tasks/${taskId}`, issueId: taskId, label: 'this task' }} />
        : (
          <div className="task-agent-empty">
            <p className="faint">No agent on this task yet. One agent stays with it from the first sketch to the merge, and sends out others where the work needs fresh eyes.</p>
            <button className="btn" disabled={starting || !onStart} onClick={onStart}>Start this task's agent</button>
          </div>
        )}
    </aside>
  )
}
