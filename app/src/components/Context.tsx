/**
 * Context (docs/context-brief.md; Sandy, 2026-11-24): what is put in ahead of research, and what is settled along the
 * way, on an idea, a project and a task. Three kinds of thing, each a section of this one page:
 *
 * - Reference docs: the ticket the work came from (first, never edited here, brought up to date from its tracker),
 *   other tickets by their id, text pasted in, files brought in.
 * - Decisions: one statement each, with a reason if there is one. An agent that was not told so in conversation
 *   proposes one; the person accepts or rejects it, and that is asked at the top of the page.
 * - Notes: what was said or found, by day. These and the decisions are the app's notes (Notes.tsx), so a report
 *   includes them.
 *
 * Every row says how the agents get it. A task in a project also sees its project's, marked and not changed here.
 *
 * The levels, one text style each: the page (h2), a section (h3, its count, what to add), one line on how agents get
 * that section, a row (its title in bold, then where it is from), and a row's detail (small and faint).
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import { Md } from './Md'
import { OriginBody } from './Origin'
import { engine, type ContextDoc, type ContextNote, type ContextSubject, type ContextView } from '../engine'

const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const day = (on: string) => new Date(on.length === 10 ? `${on}T12:00:00` : on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const who = (by: string | null) => (by?.startsWith('agent') ? 'the agent' : 'you')
const words = (chars: number) => { const n = Math.max(1, Math.round(chars / 6)); return n < 1000 ? `about ${n} words` : `about ${(n / 1000).toFixed(1).replace('.0', '')} thousand words` }
const NAME = { idea: 'idea', project: 'project', task: 'task' }

export function Context({ subject, version = 0, onChange }: { subject: ContextSubject; /** Read again when it changes. */ version?: number; /** Something in it changed: for a nav that counts it. */ onChange?: () => void }) {
  const [v, setV] = useState<ContextView | null>(null)
  const [open, setOpen] = useState<string | null>(null) // which form is open: paste, ticket, note, decision, or the id of what is being changed
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { engine.context(subject).then((r) => { setV(r); setError(null) }).catch((e) => setError(err(e))) }, [subject.kind, subject.id, version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return error ? <div className="empty bad">{error}</div> : null
  const act = async (fn: () => Promise<ContextView>) => { setBusy(true); try { setV(await fn()); setOpen(null); setError(null); onChange?.() } catch (e) { setError(err(e)) } finally { setBusy(false) } }
  const on = NAME[v.on]
  const decisions = v.notes.filter((n) => n.kind === 'decision')
  const settled = decisions.filter((n) => n.status === 'settled')
  const proposed = decisions.filter((n) => n.status === 'proposed')
  const rejected = decisions.filter((n) => n.status === 'rejected')
  const notes = v.notes.filter((n) => n.kind === 'note')
  const mine = <T extends { fromProject: boolean }>(l: T[]) => l.filter((x) => !x.fromProject)
  const projects = <T extends { fromProject: boolean }>(l: T[]) => l.filter((x) => x.fromProject)
  const fromProject = v.project && <div className="context-from">From the project, <Link to={`/projects/${v.project.id}`}>{v.project.name}</Link>. Changed there.</div>
  return (
    <section className="panel context" data-component="Context">
      <h2>📎 Context</h2>
      <p className="muted context-lede">What is known before the work starts, and what is settled along the way. Every agent working on this {on} is given it{v.on === 'idea' ? ', and it goes with the idea when it becomes a task or a project' : ''}.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}

      {proposed.length > 0 && (
        <div className="context-proposed" data-component="ContextProposed">
          <h3 className="context-h">For you to decide <Badge tone="accent">{proposed.length}</Badge></h3>
          <p className="context-how">The agent proposes {proposed.length === 1 ? 'this decision' : 'these decisions'}. Nothing is settled until you accept it.</p>
          {proposed.map((n) => (
            <div className="context-row" key={n.id} data-note={n.id}>
              <div className="context-title">{n.title}</div>
              {n.body && <div className="context-why"><span className="faint">Why: </span><Md text={n.body} inline /></div>}
              <div className="context-detail">Proposed by the agent, {day(n.on)}</div>
              <div className="row">
                <button className="btn small" disabled={busy} aria-label={`Accept: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'settled' }))}>Accept</button>
                <button className="btn quiet small" disabled={busy} aria-label={`Reject: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'rejected' }))}>Reject</button>
                <button className="btn quiet small" disabled={busy} onClick={() => setOpen(n.id)}>Change its words first</button>
              </div>
              {open === n.id && <NoteForm kind="decision" start={n} busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b))} onCancel={() => setOpen(null)} />}
            </div>
          ))}
        </div>
      )}

      <div className="context-section" data-section="docs">
        <div className="context-head">
          <h3 className="context-h">Reference docs {v.docs.length > 0 && <Badge>{v.docs.length}</Badge>}</h3>
          <button className="btn quiet small" onClick={() => setOpen(open === 'paste' ? null : 'paste')}>Paste text</button>
          <button className="btn quiet small" disabled={busy} onClick={() => file.current?.click()}>Import a file</button>
          <button className="btn quiet small" onClick={() => setOpen(open === 'ticket' ? null : 'ticket')}>Add a ticket</button>
          <input ref={file} type="file" hidden aria-label="A file to import" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void act(() => engine.importContextDoc(subject, f)) }} />
        </div>
        <p className="context-how">The ticket the work came from goes to every agent whole. The others are listed for an agent by title and description, and it opens one when it needs it, unless you mark it to be given in full.</p>
        {open === 'paste' && <DocForm limits={v.limits} busy={busy} onSave={(b) => act(() => engine.addContextDoc(subject, { ...b, body: b.body ?? '' }))} onCancel={() => setOpen(null)} />}
        {open === 'ticket' && <TicketForm busy={busy} onSave={(ref) => act(() => engine.addContextTicket(subject, ref))} onCancel={() => setOpen(null)} />}
        {!v.docs.length && !['paste', 'ticket'].includes(open ?? '') && <div className="empty">None yet. A design note, a spec, an email thread, another ticket: anything the work should be read against.</div>}
        {mine(v.docs).map((d) => open === d.id
          ? <DocForm key={d.id} start={d} limits={v.limits} busy={busy} onSave={(b) => act(() => engine.editContextDoc(subject, d.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Delete "${d.title}" from this ${on}'s context?`)) void act(() => engine.removeContextDoc(subject, d.id)) }} />
          : <Doc key={d.id} d={d} limits={v.limits} busy={busy} onEdit={() => setOpen(d.id)} onInFull={(to) => act(() => engine.editContextDoc(subject, d.id, { inFull: to }))} onRefresh={() => act(() => engine.refreshContextDoc(subject, d.id))} onRemove={() => { if (window.confirm(`Take ${d.ticket?.origin.ref ?? d.title} out of this ${on}'s context? The ticket itself is not touched.`)) void act(() => engine.removeContextDoc(subject, d.id)) }} />)}
        {projects(v.docs).length > 0 && <>{fromProject}{projects(v.docs).map((d) => <Doc key={d.id} d={d} limits={v.limits} busy={busy} />)}</>}
      </div>

      <div className="context-section" data-section="decisions">
        <div className="context-head">
          <h3 className="context-h">Decisions {settled.length > 0 && <Badge>{settled.length}</Badge>}</h3>
          <button className="btn quiet small" onClick={() => setOpen(open === 'decision' ? null : 'decision')}>Add a decision</button>
        </div>
        <p className="context-how">Settled. Every agent is told each one in full, as something not to reopen.</p>
        {open === 'decision' && <NoteForm kind="decision" busy={busy} onSave={(b) => act(() => engine.addContextNote(subject, { kind: 'decision', ...b }))} onCancel={() => setOpen(null)} />}
        {!settled.length && open !== 'decision' && <div className="empty">None yet.</div>}
        {mine(settled).map((n) => open === n.id
          ? <NoteForm key={n.id} kind="decision" start={n} busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Delete the decision "${n.title}"?`)) void act(() => engine.removeContextNote(subject, n.id)) }} />
          : <NoteRow key={n.id} n={n} onEdit={() => setOpen(n.id)} />)}
        {projects(settled).length > 0 && <>{fromProject}{projects(settled).map((n) => <NoteRow key={n.id} n={n} />)}</>}
        {rejected.length > 0 && (
          <details className="context-rejected">
            <summary className="context-detail">{rejected.length} proposed and rejected</summary>
            <p className="context-how">Kept so the agents know: each is told you turned it down, and does not propose it again.</p>
            {rejected.map((n) => (
              <div className="context-row" key={n.id} data-note={n.id}>
                <div className="context-title rejected">{n.title}</div>
                {n.body && <div className="context-why"><span className="faint">Why it was proposed: </span><Md text={n.body} inline /></div>}
                <div className="context-detail">Proposed by the agent, {day(n.on)} · rejected by you
                  {' · '}<button className="link-btn" disabled={busy} aria-label={`Accept after all: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'settled' }))}>Accept after all</button>
                  {' · '}<button className="link-btn" disabled={busy} aria-label={`Delete: ${n.title}`} onClick={() => { if (window.confirm(`Delete "${n.title}"? An agent may then propose it again.`)) void act(() => engine.removeContextNote(subject, n.id)) }}>Delete</button>
                </div>
              </div>
            ))}
          </details>
        )}
      </div>

      <div className="context-section" data-section="notes">
        <div className="context-head">
          <h3 className="context-h">Notes {notes.length > 0 && <Badge>{notes.length}</Badge>}</h3>
          <button className="btn quiet small" onClick={() => setOpen(open === 'note' ? null : 'note')}>Add a note</button>
        </div>
        <p className="context-how">What was said or found. Every agent is given each one in full, and a report includes the ones dated in its period.</p>
        {open === 'note' && <NoteForm kind="note" busy={busy} onSave={(b) => act(() => engine.addContextNote(subject, { kind: 'note', ...b }))} onCancel={() => setOpen(null)} />}
        {!notes.length && open !== 'note' && <div className="empty">None yet.</div>}
        {mine(notes).map((n) => open === n.id
          ? <NoteForm key={n.id} kind="note" start={n} busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Delete the note "${n.title}"?`)) void act(() => engine.removeContextNote(subject, n.id)) }} />
          : <NoteRow key={n.id} n={n} onEdit={() => setOpen(n.id)} />)}
        {projects(notes).length > 0 && <>{fromProject}{projects(notes).map((n) => <NoteRow key={n.id} n={n} />)}</>}
      </div>
    </section>
  )
}

/** One reference doc. Folded: what it is, where it is from, how agents get it. Open: the thing itself. */
function Doc({ d, limits, busy, onEdit, onInFull, onRefresh, onRemove }: { d: ContextDoc; limits: ContextView['limits']; busy: boolean; onEdit?: () => void; onInFull?: (to: boolean) => void; onRefresh?: () => void; onRemove?: () => void }) {
  const t = d.ticket
  const tooLong = d.chars > limits.inFull
  const where = t ? `From ${t.origin.sourceName}, ${t.origin.ref}${t.originating ? ' · the work came from it' : ''}` : d.from === 'file' ? `Imported file${d.fileName ? `, ${d.fileName}` : ''}` : 'Pasted text'
  const pdf = !!d.kept
  const editable = !d.fromProject
  return (
    <details className="context-row context-doc" data-doc={d.id}>
      <summary>
        <span className="context-title">{d.title}</span>
        <span className="context-detail">{where}</span>
        <span className="context-gets">{d.inFull ? <Badge tone="accent">Every agent, in full</Badge> : <Badge>Listed, opened when needed</Badge>}</span>
      </summary>
      <div className="context-doc-body">
        {d.description && <p className="context-desc">{d.description}</p>}
        <div className="context-detail">
          {t ? <>Never edited here: it stays as {t.origin.sourceName} has it.</> : <>Added by {who(d.addedBy)}, {day(d.addedAt)}{pdf ? '' : ` · ${words(d.chars)}`}</>}
          {editable && t && onRefresh && <>{' · '}<button className="link-btn" disabled={busy} aria-label={`Refresh ${t.origin.ref} from ${t.origin.sourceName}`} onClick={onRefresh}>Refresh from {t.origin.sourceName}</button></>}
          {editable && t && !t.originating && onRemove && <>{' · '}<button className="link-btn" disabled={busy} aria-label={`Take out ${t.origin.ref}`} onClick={onRemove}>Take it out</button></>}
          {editable && !t && onEdit && <>{' · '}<button className="link-btn" aria-label={`Edit ${d.title}`} onClick={onEdit}>Edit</button></>}
        </div>
        {editable && !(t?.originating) && !pdf && onInFull && (
          <label className="context-check" title={tooLong ? `Longer than ${limits.inFull.toLocaleString('en-US')} characters: too long to put in front of every agent. It stays listed, and an agent opens it when it needs it.` : undefined}>
            <input type="checkbox" checked={d.inFull} disabled={busy || (tooLong && !d.inFull)} onChange={(e) => onInFull(e.target.checked)} /> Give it to every agent in full
            {tooLong && <span className="faint"> · too long for that: over {limits.inFull.toLocaleString('en-US')} characters</span>}
          </label>
        )}
        {t ? <OriginBody origin={t.origin} /> : pdf ? <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>A PDF, kept on this computer as the file it was. The agent that needs it opens it; it is not put in front of every agent.</p> : d.body?.trim() ? <Md text={d.body} className="context-text" /> : <p className="muted">Nothing in it.</p>}
      </div>
    </details>
  )
}

/** A decision or a note, settled: what it says, then who and when. */
function NoteRow({ n, onEdit }: { n: ContextNote; onEdit?: () => void }) {
  const decision = n.kind === 'decision'
  return (
    <div className="context-row" data-note={n.id}>
      <div className="context-title">{n.title}</div>
      {n.body && (decision ? <div className="context-why"><span className="faint">Why: </span><Md text={n.body} inline /></div> : <Md text={n.body} className="context-text" />)}
      <div className="context-detail">
        {decision ? (n.addedBy?.startsWith('agent') ? `Recorded by the agent once you agreed, ${day(n.on)}` : `Decided ${day(n.on)}`) : `${day(n.on)} · added by ${who(n.addedBy)}`}
        {n.alsoAbout.length > 0 && <> · also about {n.alsoAbout.map((t, i) => <span key={t.id}>{i > 0 && ', '}<Link to={`/tasks/${t.id}`} title={t.title}>{t.name}</Link></span>)}</>}
        {onEdit && <>{' · '}<button className="link-btn" aria-label={`Edit: ${n.title}`} onClick={onEdit}>Edit</button></>}
      </div>
    </div>
  )
}

/** Text pasted in, or a doc's words changed: its title, the line an agent reads in the list, and the text. */
function DocForm({ start, limits, busy, onSave, onCancel, onRemove }: { start?: ContextDoc; limits: ContextView['limits']; busy: boolean; onSave: (b: { title: string; description: string; body?: string; inFull?: boolean }) => void; onCancel: () => void; onRemove?: () => void }) {
  const [d, setD] = useState({ title: start?.title ?? '', description: start?.description ?? '', body: start?.body ?? '', inFull: start?.inFull ?? false })
  const over = d.body.length > limits.doc
  const tooLong = d.body.length > limits.inFull
  const pdf = !!start?.kept // its words are the file's: only what it is called and what it is can change
  return (
    <form className="mock-edit context-form" data-component="ContextDocForm" onSubmit={(e) => { e.preventDefault(); onSave(pdf ? { title: d.title.trim(), description: d.description.trim() } : { ...d, title: d.title.trim(), description: d.description.trim(), inFull: d.inFull && !tooLong }) }}>
      <label>Title<input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Notes from the vendor's API guide" /></label>
      <label>What it is, in a line<input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What an agent reads to decide whether to open it" /></label>
      {!pdf && <><label>The text<textarea rows={8} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></label>
      <div className={over ? 'bad' : 'faint'} style={{ fontSize: 13 }}>{d.body.length.toLocaleString('en-US')} of {limits.doc.toLocaleString('en-US')} characters{over ? ': too long to keep. Cut it down, or split it in two.' : ''}</div>
      <label className="context-check"><input type="checkbox" checked={d.inFull && !tooLong} disabled={tooLong} onChange={(e) => setD({ ...d, inFull: e.target.checked })} /> Give it to every agent in full{tooLong && <span className="faint"> · too long for that: over {limits.inFull.toLocaleString('en-US')} characters</span>}</label></>}
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || over || !d.title.trim() || (!pdf && !d.body.trim())}>{busy ? 'Saving…' : start ? 'Save the doc' : 'Add the doc'}</button>
        {onRemove && <button className="btn quiet small" type="button" onClick={onRemove}>Delete</button>}
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** Another ticket, by the id its tracker gives it. */
function TicketForm({ busy, onSave, onCancel }: { busy: boolean; onSave: (ref: string) => void; onCancel: () => void }) {
  const [ref, setRef] = useState('')
  return (
    <form className="mock-edit context-form" data-component="ContextTicketForm" onSubmit={(e) => { e.preventDefault(); onSave(ref.trim()) }}>
      <label>The ticket's id in Linear<input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SHOP-12" /></label>
      <div className="faint" style={{ fontSize: 13 }}>Kept word for word, with its comments and images, and brought up to date from Linear when you ask.</div>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || !ref.trim()}>{busy ? 'Bringing it in…' : 'Bring it in'}</button>
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** A note or a decision, written or changed. */
function NoteForm({ kind, start, busy, onSave, onCancel, onRemove }: { kind: 'note' | 'decision'; start?: ContextNote; busy: boolean; onSave: (b: { title: string; body: string; on: string }) => void; onCancel: () => void; onRemove?: () => void }) {
  const [d, setD] = useState({ title: start?.title ?? '', body: start?.body ?? '', on: start?.on ?? today() })
  const decision = kind === 'decision'
  return (
    <form className="mock-edit context-form" data-component="ContextNoteForm" onSubmit={(e) => { e.preventDefault(); onSave({ title: d.title.trim(), body: d.body.trim(), on: d.on }) }}>
      <label>{decision ? 'The decision, in one statement' : 'What it is about'}<input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder={decision ? 'A removed card is deleted at the provider, not hidden here' : 'Talked with the team about the import'} /></label>
      <label>{decision ? 'Why (optional)' : 'What was said, and what came of it'}<textarea rows={decision ? 2 : 4} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></label>
      <label style={{ maxWidth: 180 }}>Day<input type="date" value={d.on} onChange={(e) => setD({ ...d, on: e.target.value })} /></label>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || !d.title.trim() || !d.on}>{busy ? 'Saving…' : decision ? 'Save the decision' : 'Save the note'}</button>
        {onRemove && <button className="btn quiet small" type="button" onClick={onRemove}>Delete</button>}
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
