/**
 * A task's hand-over, on its overview: which conversation made the task (there can be several about the app, so it
 * is named), and what that conversation said about it, written for the task's own agent when it starts. Read-only:
 * it is that conversation's account. A task a person made has none and shows nothing. Like the "Created from" line
 * on a Linear issue made out of a Slack thread, with the thread's gist under it.
 */
import { useState } from 'react'
import { Md } from './Md'

export interface HandoverView { text: string | null; sessionId: string; at: string }
export interface MadeBy { sessionId: string; title: string; open: boolean }

export function Handover({ madeBy, handover, onWrite }: {
  /** The conversation that created the task, or null when a person did. */
  madeBy: MadeBy | null
  handover: HandoverView | null
  /** Write it (again): asks a copy of that conversation. Resolves when it is written. */
  onWrite: (again: boolean) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!madeBy) return null
  const write = async (again: boolean) => {
    setBusy(true); setError(null)
    try { await onWrite(again) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const when = handover ? new Date(handover.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null
  return (
    <section className="panel" data-component="Handover">
      <h2>Hand-over</h2>
      <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>
        Made in the conversation <b>{madeBy.title}</b>{madeBy.open ? '' : ' (ended)'}.{' '}
        {handover?.text ? <>What it said about this task, written for the task's agent on {when}.</>
          : handover ? <>It said nothing about this task beyond its title and description.</>
          : <>What it said about this task is written down when the task's agent starts.</>}
      </p>
      {handover?.text && <Md text={handover.text} />}
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>
        {busy ? <span className="muted">Asking a copy of that conversation…</span>
          : <button type="button" className="linkish" onClick={() => void write(!!handover)}>{handover ? 'Write it again' : 'Write it now'}</button>}
        {error && <span className="bad"> {error}</span>}
      </p>
    </section>
  )
}
