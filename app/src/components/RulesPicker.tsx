/**
 * Choosing a task's or project's workflow rules when it's made. Rules that start everything as an idea are greyed
 * out: those come from converting an idea. Picks the app's default when it allows making things directly, else the
 * first rules that do (LOG.md, 2026-10-29).
 */
import { useEffect } from 'react'
import type { Workflow } from '@self-evident/engine/steps'

export const needsIdea = (w: Workflow | undefined | null) => !!w?.steps.find((s) => s.key === 'idea')?.required

/** The choice to start on: '' (the app's default) if it allows it, else the first rules that do, else null (none do). */
export function firstAllowed(workflows: Workflow[], defaultId: string | null): string | null {
  const def = workflows.find((w) => w.id === defaultId)
  if (!needsIdea(def)) return ''
  return workflows.find((w) => !needsIdea(w))?.id ?? null
}

export function RulesPicker({ workflows, defaultId, value, onChange }: { workflows: Workflow[]; defaultId: string | null; value: string; onChange: (id: string) => void }) {
  const def = workflows.find((w) => w.id === defaultId)
  useEffect(() => { // start on something that's allowed
    const ok = value === '' ? !needsIdea(def) : !needsIdea(workflows.find((w) => w.id === value))
    if (!ok) { const f = firstAllowed(workflows, defaultId); if (f !== null) onChange(f) }
  }, [workflows.length, defaultId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="rules-picker" data-component="RulesPicker">Workflow rules
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled={needsIdea(def)}>{`The app's default${def ? `: ${def.name}` : ''}`}{needsIdea(def) ? ' (starts as an idea)' : ''}</option>
        {workflows.filter((w) => w.id !== defaultId).map((w) => <option key={w.id} value={w.id} disabled={needsIdea(w)}>{w.name}{needsIdea(w) ? ' (starts as an idea)' : ''}</option>)}
      </select>
    </label>
  )
}
