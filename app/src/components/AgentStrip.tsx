/**
 * The conversation's name at the top of it, after a dot in its colour (pulsing while it works, amber while it waits
 * on you), and nothing else (Sandy, 2026-11-01: "it should have a name and that is it"). A fork adds a fork icon whose popup
 * says where it came from and what it's on. Story first; not wired to the engine yet.
 */

export interface AgentStripProps {
  /** The conversation's colour (talkColor). */
  color: string
  name: string
  state: 'working' | 'waiting' | 'idle'
  /** A fork: the conversation it came from, and what it's focusing on. */
  fork?: { from: string; focus: string }
}

const STATE = { working: 'working', waiting: 'waiting on you', idle: 'idle' }

export function AgentStrip({ color, name, state, fork }: AgentStripProps) {
  return (
    <div className={`agent-strip ${state}`} style={{ ['--talk' as string]: color }} data-component="AgentStrip">
      <span className="dot" role="img" aria-label={STATE[state]} title={STATE[state]} />
      <strong className="agent-strip-name" title={name}>{name}</strong>
      {fork && (
        <span className="agent-strip-fork">
          <button className="icon-btn" aria-label="Forked: where from" aria-describedby="fork-info">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <circle cx="4" cy="3" r="1.6" /><circle cx="12" cy="3" r="1.6" /><circle cx="8" cy="13" r="1.6" /><path d="M4 4.6v1.4c0 1.7 1.3 3 3 3h2c1.7 0 3-1.3 3-3V4.6M8 9v2.4" />
            </svg>
          </button>
          <span className="agent-strip-pop" role="tooltip" id="fork-info">
            Forked from <strong>{fork.from}</strong> while it was busy. Focusing on {fork.focus}.
          </span>
        </span>
      )}
    </div>
  )
}
