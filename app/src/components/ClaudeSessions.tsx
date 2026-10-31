/**
 * The Claude Code sessions run on this app in a terminal or an editor, newest first, to bring one in: the same list
 * Claude Code's own `/resume` shows (its title, when, which branch), so picking one here feels like resuming there.
 * One already brought in just opens.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type ClaudeSession } from '../engine'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
const folder = (cwd: string) => cwd.split('/').filter(Boolean).pop() ?? cwd

/** `onPicked` gets the conversation's id here, new or already brought in; `onClose` goes back. */
export function ClaudeSessions({ appId, appName, onPicked, onClose }: { appId: string; appName: string; onPicked: (talkId: string) => void; onClose: () => void }) {
  const [list, setList] = useState<ClaudeSession[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [bringing, setBringing] = useState<string | null>(null)
  useEffect(() => { setList(null); engine.claudeSessions(appId).then(setList).catch((e) => setProblem(String(e.message ?? e))) }, [appId])
  const pick = async (s: ClaudeSession) => {
    if (s.talkId) { onPicked(s.talkId); return }
    setBringing(s.id); setProblem(null)
    try { onPicked((await engine.adopt({ appId, cwd: s.cwd, agentSessionId: s.id })).id) } catch (e: any) { setProblem(String(e.message ?? e)) } finally { setBringing(null) }
  }
  return (
    <div className="claude-sessions" data-component="ClaudeSessions">
      <div className="claude-sessions-head">
        <strong>From Claude Code</strong>
        <button className="link-btn" onClick={onClose}>back</button>
      </div>
      <p className="faint" style={{ margin: '0 0 8px', fontSize: 12 }}>Sessions run on {appName} in a terminal or VS Code. Pick one to carry it on here; what's said there keeps showing.</p>
      {problem && <div className="empty bad">{problem}</div>}
      {!list && !problem && <p className="muted">Looking…</p>}
      {list?.length === 0 && <p className="muted">None yet. Start <code>claude</code> in {appName}'s checkout or one of its worktrees, and it shows here.</p>}
      <ul>
        {list?.map((s) => (
          <li key={`${s.cwd}/${s.id}`}>
            <button onClick={() => void pick(s)} disabled={bringing !== null} title={`${s.cwd} · ${s.id}`}>
              <span className="claude-session-title">{s.title ?? 'Untitled session'}</span>
              <span className="faint claude-session-meta">
                {ago(s.at)} · {s.branch ?? folder(s.cwd)}
                {s.talkId && <Badge tone="accent">here</Badge>}
                {bringing === s.id && ' · bringing it in…'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
