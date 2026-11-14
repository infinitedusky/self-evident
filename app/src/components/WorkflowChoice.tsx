/**
 * The workflow a task follows, on its page, and a way to change it after the task is made. It reads as a sentence
 * until "Change" is pressed; then it is a list of the app's workflows, with "follow its project or the app" on top.
 * Choosing saves at once and it reads as a sentence again. Workflows that start everything as an idea are greyed
 * out for a task that was made directly. Like the property pickers on a Linear issue: a label you press to change.
 */
import { useState } from 'react'
import type { Workflow } from '@self-evident/engine/steps'
import { needsIdea } from './RulesPicker'

const FROM = { task: ', its own', project: ', from its project', app: ', the app\'s default' }

export function WorkflowChoice({ workflow, from, workflows, fromIdea, onChange }: {
  /** The workflow in force, and where it comes from. */
  workflow: Workflow | null
  from: 'task' | 'project' | 'app' | null
  /** The app's workflows to choose from. */
  workflows: Workflow[]
  /** The task came from an idea, so workflows that start as an idea are allowed. */
  fromIdea?: boolean
  /** A workflow's id, or null to follow its project or the app again. */
  onChange: (id: string | null) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const own = from === 'task'
  const choose = async (v: string) => {
    setBusy(true); setError(null)
    try { await onChange(v || null); setOpen(false) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  if (!open) return (
    <span data-component="WorkflowChoice">
      {workflow ? <>Workflow <b>{workflow.name}</b>{from ? FROM[from] : ''}{workflow.ordered ? ', in order' : ''}. </> : 'No workflow. '}
      {workflows.length > 0 && <button type="button" className="linkish" onClick={() => setOpen(true)}>Change</button>}
    </span>
  )
  return (
    <span className="rules-picker" data-component="WorkflowChoice" style={{ display: 'inline-flex' }}>
      <label style={{ display: 'contents' }}>Workflow
        <select autoFocus disabled={busy} value={own ? workflow?.id ?? '' : ''} onChange={(e) => void choose(e.target.value)}>
          <option value="">{own ? 'Follow its project or the app again' : `Follow its project or the app${workflow ? `: ${workflow.name}` : ''}`}</option>
          {workflows.map((w) => { const no = needsIdea(w) && !fromIdea; return <option key={w.id} value={w.id} disabled={no}>{w.name}{no ? ' (starts as an idea)' : ''}</option> })}
        </select>
      </label>
      <button type="button" className="linkish" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>Cancel</button>
      {error && <span className="bad">{error}</span>}
    </span>
  )
}
