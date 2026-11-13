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

const BUILT = { met: ['✓', 'The final build meets it'], not: ['✗', 'The final build does not meet it'], open: ['○', 'Not checked against the final build yet'] } as const
const builtOf = (c: Criterion) => (c.built === true ? 'met' : c.built === false ? 'not' : 'open')
const NEXT = { open: true, met: false, not: null } as const // a click moves the build's mark on: not checked, met, not met
const MARK = { shown: ['✓', 'The prototype showed it'], not: ['✗', 'The prototype did not show it'], open: ['○', 'Not tried in a prototype'], build: ['–', 'Skipped by the prototype: for the final build only'] } as const
const stateOf = (c: Criterion) => (c.buildOnly ? 'build' : c.shown === true ? 'shown' : c.shown === false ? 'not' : 'open')

export function Acceptance({ issueId, items, approved, onChanged }: { issueId: string; items: Criterion[]; /** The brief is approved: a change here asks for approval again. */ approved?: boolean; onChanged?: () => void }) {
  const [list, setList] = useState(items)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ text: '', check: '', buildOnly: false, why: '' })
  const [fresh, setFresh] = useState({ text: '', check: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setList(items) }, [items])
  const change = async (c: AcceptanceChange) => {
    setBusy(true); setError(null)
    try { setList((await engine.setAcceptance(issueId, c)).acceptance); onChanged?.(); return true } catch (e: any) { setError(String(e.message ?? e)); return false } finally { setBusy(false) }
  }
  const notShown = list.filter((c) => !c.buildOnly && c.shown === false).length
  const untried = list.filter((c) => !c.buildOnly && c.shown === undefined).length
  const left = list.filter((c) => c.buildOnly).length
  const proto = list.filter((c) => !c.buildOnly)
  const met = list.filter((c) => c.built === true).length
  const unmet = list.filter((c) => c.built === false).length
  return (
    <section className="acceptance" data-component="Acceptance" aria-label="Acceptance criteria">
      <h3>Acceptance criteria <span className="faint">{list.length ? `${list.length}` : 'none yet'}</span>
        {notShown > 0 && <span className="acceptance-warn">{notShown} not shown in the prototype</span>}
        {list.length > 0 && notShown === 0 && untried > 0 && <span className="faint">{untried} not tried</span>}
        {left > 0 && <span className="faint">{left} for the final build only</span>}
      </h3>
      <p className="faint acceptance-lead">How we will know it is done. The agent builds these as the task goes and the prototype is made; you approve them with the brief. Each has two marks: what the prototype showed, and whether the final build meets it.{approved ? ' The brief is approved: changing one asks for your approval again.' : ''}</p>
      {list.length === 0 && <p className="muted">No acceptance criteria yet. Without them, approving the brief approves no way of knowing it is done.</p>}
      {list.length > 0 && <div className="acceptance-heads" aria-hidden="true"><span title={`The prototype showed ${proto.filter((c) => c.shown).length} of ${proto.length}`}>Prototype <span className="faint">{proto.filter((c) => c.shown).length}/{proto.length}</span></span><span title={`The final build meets ${met} of ${list.length}`}>Build <span className={unmet ? 'acceptance-warn' : 'faint'}>{met}/{list.length}</span></span></div>}
      <ul className="acceptance-list">
        {list.map((c) => {
          const s = stateOf(c)
          return (
            <li key={c.id} className={s}>
              <span className={`acceptance-mark ${s}`} title={MARK[s][1]} aria-label={`Prototype: ${MARK[s][1]}`}>{MARK[s][0]}</span>
              <button className={`acceptance-mark ${builtOf(c)}`} disabled={busy} onClick={() => void change({ update: [{ id: c.id, built: NEXT[builtOf(c)] }] })} title={`${BUILT[builtOf(c)][1]}${c.builtEvidence ? `: ${c.builtEvidence}` : ''}. Click to change.`} aria-label={`Final build: ${BUILT[builtOf(c)][1]} (${c.text})`}>{BUILT[builtOf(c)][0]}</button>
              {editing === c.id ? (
                <form className="acceptance-edit" onSubmit={async (e) => { e.preventDefault(); if (await change({ update: [{ id: c.id, text: draft.text, check: draft.check || null, buildOnly: draft.buildOnly, why: draft.buildOnly ? draft.why || null : null }] })) setEditing(null) }}>
                  <input autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-label="Criterion" />
                  <input value={draft.check} onChange={(e) => setDraft({ ...draft, check: e.target.value })} aria-label="How we will know" placeholder="How we will know: a page, a scenario, a test" />
                  <label className="acceptance-skip"><input type="checkbox" checked={draft.buildOnly} onChange={(e) => setDraft({ ...draft, buildOnly: e.target.checked })} /> For the final build only: the prototype skips it</label>
                  {draft.buildOnly && <input value={draft.why} onChange={(e) => setDraft({ ...draft, why: e.target.value })} aria-label="Why the prototype skips it" placeholder="Why the prototype skips it" />}
                  <div><button className="btn small" disabled={busy || !draft.text.trim()}>Save</button> <button type="button" className="btn quiet small" onClick={() => setEditing(null)}>Cancel</button></div>
                </form>
              ) : (
                <div className="acceptance-body">
                  <div>{c.text}</div>
                  {c.check ? <div className="faint">How we will know: {c.check}</div> : <div className="acceptance-warn">No way to check it yet</div>}
                  {c.buildOnly && <div className="acceptance-build">Final build only: the prototype skips it{c.why ? `. ${c.why}` : ''}</div>}
                  {c.evidence && !c.buildOnly && <div className="faint">Prototype, {s === 'not' ? 'missing' : 'seen'}: {c.evidence}</div>}
                  {c.builtEvidence && <div className="faint">Build, {c.built === false ? 'missing' : 'seen'}: {c.builtEvidence}</div>}
                </div>
              )}
              {editing !== c.id && <span className="acceptance-actions">
                <button className="btn quiet small" disabled={busy} onClick={() => { setDraft({ text: c.text, check: c.check ?? '', buildOnly: !!c.buildOnly, why: c.why ?? '' }); setEditing(c.id) }} aria-label={`Edit: ${c.text}`}>Edit</button>
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
