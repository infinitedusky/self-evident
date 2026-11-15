/**
 * A task's speed, on its page: how much stands between its approved prototype and its build (Sandy, 2026-11-15:
 * "let's build the two speeds"). It reads as a sentence until "Change" is pressed; then a list: follow the app,
 * careful, fast. Choosing saves at once and carries the task on. Like WorkflowChoice beside it, and the property
 * pickers on a Linear issue: a label you press to change.
 */
import { useState } from 'react'
import type { Speed } from '@self-evident/engine/steps'

export const SPEED_SAYS: Record<Speed, string> = {
  careful: 'the plan is read before it is built: analysis, ADR, blast radius, audit',
  fast: 'planned and built straight after the prototype; the scrutiny is on the pull request',
}

export function SpeedChoice({ speed, onChange }: {
  /** The speed in force, and whether it is the task's own or its app's. */
  speed: { value: Speed; from: 'task' | 'app' }
  /** careful, fast, or null to follow the app again. */
  onChange: (speed: Speed | null) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choose = async (v: string) => {
    setBusy(true); setError(null)
    try { await onChange(v === '' ? null : (v as Speed)); setOpen(false) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const name = speed.value === 'fast' ? 'Fast' : 'Careful'
  if (!open) return (
    <span data-component="SpeedChoice" title={SPEED_SAYS[speed.value]}>
      <b>{name}</b>{speed.from === 'task' ? ', its own' : ', the app\'s setting'}. <button type="button" className="linkish" onClick={() => setOpen(true)}>Change</button>
    </span>
  )
  return (
    <span className="rules-picker" data-component="SpeedChoice" style={{ display: 'inline-flex' }}>
      <label style={{ display: 'contents' }}>Speed
        <select autoFocus disabled={busy} value={speed.from === 'task' ? speed.value : ''} onChange={(e) => void choose(e.target.value)}>
          <option value="">{speed.from === 'task' ? 'Follow the app again' : `Follow the app: ${name}`}</option>
          <option value="careful">Careful: {SPEED_SAYS.careful}</option>
          <option value="fast">Fast: {SPEED_SAYS.fast}</option>
        </select>
      </label>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
      {error && <span className="bad">{error}</span>}
    </span>
  )
}
