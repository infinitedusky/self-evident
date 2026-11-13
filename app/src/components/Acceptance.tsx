/**
 * A task's acceptance criteria, on its brief's page: how we will know it is done (Sandy, 2026-11-13: "part of what
 * you approve before you actually start building is whether or not your acceptance criteria is sufficient"). Each is
 * one statement a person can check, how we will know, and what the prototype showed for it. The agents build the list
 * as the task goes; the person can add, reword and remove, and approves it with the brief.
 *
 * After the acceptance criteria on a user story, and a pull request's checklist for the marks.
 */
import { useEffect, useState } from 'react'
import { engine, type AcceptanceChange, type Criterion } from '../engine'

const MARK = { shown: ['✓', 'The prototype showed it'], not: ['✗', 'The prototype did not show it'], open: ['○', 'Not tried in a prototype'] } as const
const stateOf = (c: Criterion) => (c.shown === true ? 'shown' : c.shown === false ? 'not' : 'open')

export function Acceptance({ issueId, items, approved, onChanged }: { issueId: string; items: Criterion[]; /** The brief is approved: a change here asks for approval again. */ approved?: boolean; onChanged?: () => void }) {
  const [list, setList] = useState(items)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ text: '', check: '' })
  const [fresh, setFresh] = useState({ text: '', check: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setList(items) }, [items])
  const change = async (c: AcceptanceChange) => {
    setBusy(true); setError(null)
    try { setList((await engine.setAcceptance(issueId, c)).acceptance); onChanged?.(); return true } catch (e: any) { setError(String(e.message ?? e)); return false } finally { setBusy(false) }
  }
  const notShown = list.filter((c) => c.shown === false).length
  const untried = list.filter((c) => c.shown === undefined).length
  return (
    <section className="acceptance" data-component="Acceptance" aria-label="Acceptance criteria">
      <h3>Acceptance criteria <span className="faint">{list.length ? `${list.length}` : 'none yet'}</span>
        {notShown > 0 && <span className="acceptance-warn">{notShown} not shown in the prototype</span>}
        {list.length > 0 && notShown === 0 && untried > 0 && <span className="faint">{untried} not tried</span>}
      </h3>
      <p className="faint acceptance-lead">How we will know it is done. The agent builds these as the task goes and the prototype is made; you approve them with the brief.{approved ? ' The brief is approved: changing one asks for your approval again.' : ''}</p>
      {list.length === 0 && <p className="muted">No acceptance criteria yet. Without them, approving the brief approves no way of knowing it is done.</p>}
      <ul className="acceptance-list">
        {list.map((c) => {
          const s = stateOf(c)
          return (
            <li key={c.id} className={s}>
              <span className="acceptance-mark" title={MARK[s][1]} aria-label={MARK[s][1]}>{MARK[s][0]}</span>
              {editing === c.id ? (
                <form className="acceptance-edit" onSubmit={async (e) => { e.preventDefault(); if (await change({ update: [{ id: c.id, text: draft.text, check: draft.check || null }] })) setEditing(null) }}>
                  <input autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-label="Criterion" />
                  <input value={draft.check} onChange={(e) => setDraft({ ...draft, check: e.target.value })} aria-label="How we will know" placeholder="How we will know: a page, a scenario, a test" />
                  <div><button className="btn small" disabled={busy || !draft.text.trim()}>Save</button> <button type="button" className="btn quiet small" onClick={() => setEditing(null)}>Cancel</button></div>
                </form>
              ) : (
                <div className="acceptance-body">
                  <div>{c.text}</div>
                  {c.check ? <div className="faint">How we will know: {c.check}</div> : <div className="acceptance-warn">No way to check it yet</div>}
                  {c.evidence && <div className="faint">{s === 'not' ? 'Missing' : 'Seen'}: {c.evidence}</div>}
                </div>
              )}
              {editing !== c.id && <span className="acceptance-actions">
                <button className="btn quiet small" disabled={busy} onClick={() => { setDraft({ text: c.text, check: c.check ?? '' }); setEditing(c.id) }} aria-label={`Edit: ${c.text}`}>Edit</button>
                <button className="icon-btn" disabled={busy} onClick={() => void change({ remove: [c.id] })} title="Remove it" aria-label={`Remove: ${c.text}`}>×</button>
              </span>}
            </li>
          )
        })}
      </ul>
      <form className="acceptance-add" onSubmit={async (e) => { e.preventDefault(); if (await change({ add: [{ text: fresh.text, ...(fresh.check.trim() ? { check: fresh.check } : {}) }] })) setFresh({ text: '', check: '' }) }}>
        <input value={fresh.text} onChange={(e) => setFresh({ ...fresh, text: e.target.value })} aria-label="New criterion" placeholder="Add one: what must be true, as something you could check" />
        <input value={fresh.check} onChange={(e) => setFresh({ ...fresh, check: e.target.value })} aria-label="How we will know it" placeholder="How we will know (optional)" />
        <button className="btn quiet small" disabled={busy || !fresh.text.trim()}>Add</button>
      </form>
      {error && <div className="empty bad">{error}</div>}
    </section>
  )
}
