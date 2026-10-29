/**
 * One conversation with the factory's agent: the transcript (live over talk.* events), permission cards, the
 * input. Used in full on the Talk page and compact in the drawer that follows you around. Each message sent
 * carries where the person is (`context`), so "project this" needs no explaining.
 */
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from './Badge'
import { API, engine, type Risk, type TalkContext, type TalkMessage, type Transcript } from '../engine'

const RISK_TONE: Record<Risk, 'neutral' | 'ok' | 'warn' | 'bad'> = { free: 'neutral', cheap: 'ok', moderate: 'warn', expensive: 'bad' }

export function Conversation({ sessionId, context, compact, onChanged }: { sessionId: string; context?: TalkContext; compact?: boolean; onChanged?: () => void }) {
  const [t, setT] = useState<Transcript | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let closed = false
    const refresh = () => engine.transcript(sessionId).then((x) => { if (!closed) { setT(x); setError(null); onChanged?.() } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?since=-1`)
    const onTalk = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as { payload: { sessionId?: string } }
      if (e.payload?.sessionId !== sessionId) return
      window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 120)
    }
    for (const type of ['talk.message', 'talk.permission', 'talk.result']) es.addEventListener(type, onTalk as EventListener)
    es.onerror = () => setError('event stream disconnected; retrying')
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [t?.messages.length])

  const send = async () => {
    if (!text.trim()) return
    const body = text; setText('')
    try { await engine.say(sessionId, body, context) } catch (e: any) { setError(String(e.message ?? e)); setText(body) }
  }
  if (error && !t) return <div className="empty bad">{error}</div>
  if (!t) return <p className="muted">Loading…</p>
  const busy = t.session.busy
  const waiting = t.messages.some((m) => m.kind === 'permission' && t.pending.includes(m.payload?.requestId))
  return (
    <div className={`conversation ${compact ? 'compact' : ''}`} data-component="Conversation">
      <div className="chat">
        {t.messages.length === 0 && <div className="msg engine faint">Say what you want. It can read this checkout, has the engine as tools, and asks before it edits or runs anything.</div>}
        {grouped(t.messages).map((g) => Array.isArray(g)
          ? <Actions key={g[0].id} ms={g} sessionId={sessionId} />
          : <Message key={g.id} m={g} pending={t.pending.includes(g.payload?.requestId)} sessionId={sessionId} />)}
        {busy && !waiting && <div className="msg engine faint"><Badge tone="accent" dot>thinking</Badge></div>}
        <div ref={bottom} />
      </div>
      {error && <div className="faint" style={{ fontSize: 12 }}>{error}</div>}
      {t.session.status !== 'ended' && (
        <div className="talk-input">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3}
            placeholder={waiting ? 'Answer the request above first, or type anyway.' : context?.label ? `Ask about ${context.label}, or anything. Enter sends.` : 'Say what you want. Enter sends; Shift+Enter for a new line.'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="btn" disabled={!text.trim()} onClick={send}>Send</button>
            {busy && <button className="btn quiet small" onClick={() => engine.interrupt(sessionId)}>Stop</button>}
          </div>
        </div>
      )}
    </div>
  )
}

const ACTION = new Set(['tool_call', 'tool_result', 'auto'])
/** Runs of tool calls and their results fold into one row, after Replit's "N actions". */
function grouped(ms: TalkMessage[]): (TalkMessage | TalkMessage[])[] {
  const out: (TalkMessage | TalkMessage[])[] = []
  for (const m of ms) {
    const last = out[out.length - 1]
    if (ACTION.has(m.kind) && Array.isArray(last)) last.push(m)
    else out.push(ACTION.has(m.kind) ? [m] : m)
  }
  return out
}

const ICON: [RegExp, string, string][] = [[/^Bash$/, '›_', 'ran a command'], [/^(Read|Glob|Grep)$/, '⌕', 'read'], [/^(Edit|Write|MultiEdit|NotebookEdit)$/, '✎', 'edited'], [/^mcp__engine__/, '◈', 'asked the engine'], [/^Web/, '◎', 'looked on the web'], [/^TodoWrite$/, '☑', 'listed steps']]
const iconFor = (tool: string) => ICON.find(([re]) => re.test(tool)) ?? [/./, '•', tool]

function Actions({ ms, sessionId }: { ms: TalkMessage[]; sessionId: string }) {
  const calls = ms.filter((m) => m.kind !== 'tool_result')
  const failed = ms.some((m) => m.kind === 'tool_result' && m.payload?.ok === false)
  return (
    <details className="msg actions">
      <summary>
        {calls.slice(0, 6).map((m) => { const [, icon, what] = iconFor(String(m.payload?.tool ?? '')); return <span key={m.id} className="action-ico" title={what}>{icon}</span> })}
        {calls.length > 6 && <span className="action-ico">…</span>}
        <span className="faint">{calls.length} action{calls.length === 1 ? '' : 's'}{failed ? ' · one failed' : ''}</span>
      </summary>
      <div className="actions-list">{ms.map((m) => <Message key={m.id} m={m} pending={false} sessionId={sessionId} />)}</div>
    </details>
  )
}

const took = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} seconds` : `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`

export function Message({ m, pending, sessionId }: { m: TalkMessage; pending: boolean; sessionId: string }) {
  const p = m.payload ?? {}
  switch (m.kind) {
    case 'text': return <div className={`msg ${m.author}`}>{m.author === 'agent' ? <div className="msg-body md-chat"><Markdown remarkPlugins={[remarkGfm]}>{m.body}</Markdown></div> : <div className="msg-body">{m.body}</div>}</div>
    case 'tool_call': return <div className="msg tool mono">{p.tool === 'Bash' ? `$ ${p.input?.command ?? ''}` : `${String(p.tool).replace('mcp__engine__', 'engine · ')} ${p.input?.file ?? p.input?.pattern ?? ''}`}</div>
    case 'tool_result': return <details className="msg tool-result"><summary className="mono faint">{p.ok === false ? 'error' : 'result'}</summary><pre>{m.body}</pre></details>
    case 'auto': return <div className="msg tool mono faint" title={p.why}>auto · <Badge tone={RISK_TONE[p.risk as Risk] ?? 'neutral'}>{p.risk}</Badge> · {p.tool === 'Bash' ? `$ ${p.input?.command ?? ''}` : `${String(p.tool).replace('mcp__engine__', 'engine · ')} ${p.input?.file ?? ''}`}</div>
    case 'permission': return (
      <div className={`perm ${pending ? 'open' : ''}`}>
        <div>{p.risk && <Badge tone={RISK_TONE[p.risk as Risk] ?? 'neutral'}>{p.risk}</Badge>} <strong>{p.tool}</strong> {p.tool === 'Bash' ? <code>{p.input?.command}</code> : <span className="mono">{p.input?.file}</span>}{p.why && <div className="faint" style={{ fontSize: 12 }}>{p.why}</div>}
          {p.tool === 'Edit' && <pre className="diff"><span className="del">- {p.input?.old}</span>{'\n'}<span className="add">+ {p.input?.new}</span></pre>}</div>
        {pending ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => engine.permission(sessionId, p.requestId, true)}>Allow</button>
            <button className="btn quiet small" onClick={() => engine.permission(sessionId, p.requestId, true, true)}>Allow {p.tool} for this conversation</button>
            <button className="btn quiet small" onClick={() => engine.permission(sessionId, p.requestId, false)}>Deny</button>
          </div>
        ) : <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>answered</div>}
      </div>
    )
    case 'result': return <div className="msg engine faint worked" title={`${p.turns ?? '?'} turns${p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)}` : ''}`}>{m.body === 'done' && p.durationMs ? `Worked for ${took(Number(p.durationMs))}` : m.body}{p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)}` : ''}</div>
    case 'error': return <div className={`msg engine ${p.waiting ? 'faint' : 'bad'}`}>{m.body}</div>
    default: return null
  }
}
