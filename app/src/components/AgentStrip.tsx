/**
 * Where the agent is, at the top of its conversation, in the conversation's colour (SHAPE.md, "The agent shows where
 * it is"): what it's about as a path (after Linear's breadcrumbs), the explore → build steps with the current one lit
 * (after GitHub Actions' job steps), and one live line of what it's doing (after Cursor's and Claude Code's
 * "Reading… / Editing…"). A fork names the conversation it came from. Story first; not wired to the engine yet.
 */

export type StripStepState = 'done' | 'now' | 'next' | 'off'
export interface StripStep { key: string; label: string; state: StripStepState }
export interface StripDoing { state: 'working' | 'waiting' | 'idle'; text: string }
export interface AgentStripProps {
  /** The conversation's colour (talkColor). */
  color: string
  /** What it's about, outermost first: the app, then the idea, task or project, then the thing being made. */
  path: string[]
  /** Explore steps, then build steps; `group` splits them at the hinge. */
  steps: (StripStep & { group: 'explore' | 'build' })[]
  /** One line; text in backticks shows as code. */
  doing: StripDoing
  /** The conversation this one forked from. */
  forkedFrom?: string
}

/** `a \`b\` c` → a, <code>b</code>, c */
function withCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))
}

export function AgentStrip({ color, path, steps, doing, forkedFrom }: AgentStripProps) {
  const groups = (['explore', 'build'] as const).map((g) => ({ g, steps: steps.filter((s) => s.group === g) })).filter((x) => x.steps.length)
  return (
    <div className="agent-strip" style={{ ['--talk' as string]: color }} data-component="AgentStrip">
      <div className="agent-strip-path" title={path.join(' › ')}>
        {path.map((p, i) => <span key={i} className={i === path.length - 1 ? 'here' : ''}>{p}</span>)}
      </div>
      {forkedFrom && <div className="agent-strip-fork faint">forked from <strong>{forkedFrom}</strong></div>}
      <div className="agent-strip-steps">
        {groups.map(({ g, steps: list }) => (
          <div key={g} className={`agent-strip-group ${g}`}>
            <span className="agent-strip-caption">{g}</span>
            <ol>{list.map((s) => <li key={s.key} className={s.state} aria-current={s.state === 'now' ? 'step' : undefined}>{s.label}</li>)}</ol>
          </div>
        ))}
      </div>
      <div className={`agent-strip-doing ${doing.state}`} aria-live="polite">
        <span className="dot" />
        <span className="agent-strip-text">{doing.state === 'waiting' && <strong>Waiting on you: </strong>}{withCode(doing.text)}</span>
      </div>
    </div>
  )
}
