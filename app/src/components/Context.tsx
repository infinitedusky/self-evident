/**
 * Context (docs/context-brief.md; Sandy, 2026-11-24): what is put in ahead of research, and what is settled along the
 * way, on an idea, a project and a task. Three kinds of thing, each a section of this one page:
 *
 * - Reference docs: the ticket the work came from (first, never edited here, brought up to date from its tracker),
 *   other tickets by their id, text pasted in, files brought in (a PDF or an HTML page is kept as the file it was).
 * - Decisions: each a question and its answer, with why if there is one (Sandy, 2026-11-24: "key value, question
 *   answer … we can put unmade decisions in and then make them later and make sure that we make them"). One with no
 *   answer yet is unanswered. It is a decision record like any other and sits with them, first, marked Unanswered
 *   (Sandy, 2026-11-24: "they should be actual decision records, just not completed … incomplete or unanswered").
 *   An agent that was not told the answer in conversation proposes one, which the person accepts or rejects there.
 *   Either kind can be marked as waiting on someone the person has asked. A decision can carry its background:
 *   the story of why it is a question, shown in full while it is unanswered and folded once it is answered. The nav counts what is unanswered;
 *   nothing is held up by it.
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
/** How long since a day: "today", "1 day", "3 days". */
const ago = (on: string) => { const n = Math.max(0, Math.round((+new Date(`${today()}T12:00:00`) - +new Date(`${on}T12:00:00`)) / 86_400_000)); return n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago` }
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
  const mine = <T extends { fromProject: boolean }>(l: T[]) => l.filter((x) => !x.fromProject)
  const projects = <T extends { fromProject: boolean }>(l: T[]) => l.filter((x) => x.fromProject)
  const decisions = v.notes.filter((n) => n.kind === 'decision')
  const settled = decisions.filter((n) => n.status === 'settled')
  const proposed = decisions.filter((n) => n.status === 'proposed')
  const undecided = decisions.filter((n) => n.status === 'open')
  // Yours to make now first; then the ones you have asked someone about, longest wait first.
  const asked = mine([...proposed, ...undecided]).filter((n) => n.waitingOn).sort((a, b) => a.on.localeCompare(b.on))
  const waiting = [...mine(proposed).filter((n) => !n.waitingOn), ...mine(undecided).filter((n) => !n.waitingOn), ...asked]
  const yours = waiting.length - asked.length
  const rejected = decisions.filter((n) => n.status === 'rejected')
  const notes = v.notes.filter((n) => n.kind === 'note')
  const fromProject = v.project && <div className="context-from">From the project, <Link to={`/projects/${v.project.id}`}>{v.project.name}</Link>. Changed there.</div>
  return (
    <section className="panel context" data-component="Context">
      <h2>📎 Context</h2>
      <p className="muted context-lede">What is known before the work starts, and what is settled along the way. Every agent working on this {on} is given it{v.on === 'idea' ? ', and it goes with the idea when it becomes a task or a project' : ''}.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0' }}>{error}</div>}

      <div className="context-section" data-section="docs">
        <div className="context-head">
          <h3 className="context-h">Reference docs {v.docs.length > 0 && <Badge>{v.docs.length}</Badge>}</h3>
          <button className="btn quiet small" onClick={() => setOpen(open === 'paste' ? null : 'paste')}>Paste text</button>
          <button className="btn quiet small" disabled={busy} onClick={() => file.current?.click()}>Import a file</button>
          <button className="btn quiet small" onClick={() => setOpen(open === 'ticket' ? null : 'ticket')}>Add a ticket</button>
          <input ref={file} type="file" hidden aria-label="A file to import" accept=".txt,.md,.markdown,.pdf,.html,.htm,text/plain,text/markdown,application/pdf,text/html" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void act(() => engine.importContextDoc(subject, f)) }} />
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
          <h3 className="context-h">Decisions {settled.length + waiting.length > 0 && <Badge>{settled.length + waiting.length}</Badge>}{yours > 0 && <Badge tone="accent">{yours} unanswered</Badge>}{asked.length > 0 && <Badge tone="warn">{asked.length} waiting on someone</Badge>}</h3>
          <button className="btn quiet small" onClick={() => setOpen(open === 'decision' ? null : 'decision')}>Add a decision</button>
        </div>
        <p className="context-how">Each a question and its answer. Every agent is told each answered one in full, as something not to reopen, and each unanswered one as not decided, so it does not guess. A report lists the unanswered ones as open.</p>
        {open === 'decision' && <DecisionForm busy={busy} onSave={(b) => act(() => engine.addContextNote(subject, { kind: 'decision', ...b }))} onCancel={() => setOpen(null)} />}
        {!settled.length && !waiting.length && open !== 'decision' && <div className="empty">None yet.</div>}
        {waiting.map((n) => (
          <div className="context-row context-qa context-unmade" key={n.id} data-note={n.id} data-unanswered={n.waitingOn ? 'waiting' : n.status}>
            {n.background && open !== n.id && open !== `edit:${n.id}` && <Background text={n.background} open />}
            <div className="context-q">{n.title}</div>
            <div>
              <div className="context-detail">
                {n.waitingOn ? <><Badge tone="warn">Waiting on {n.waitingOn}</Badge> asked {day(n.on)}, {ago(n.on)}</> : <><Badge tone="accent">Unanswered</Badge> {n.status === 'proposed' ? `the agent proposes an answer, ${day(n.on)}` : `asked by ${who(n.addedBy)}, ${day(n.on)}`}</>}
                {n.status === 'open' && n.body ? <> · <Md text={n.body} inline /></> : null}
              </div>
              {n.status === 'proposed' && <div className="context-why"><span className="faint">The agent proposes: </span><strong>{n.answer}</strong></div>}
              {n.status === 'proposed' && n.body && <div className="context-why"><span className="faint">Why: </span><Md text={n.body} inline /></div>}
              {open === `wait:${n.id}`
                ? <WaitingForm start={n.waitingOn ?? ''} busy={busy} onSave={(to) => act(() => engine.editContextNote(subject, n.id, { waitingOn: to }))} onCancel={() => setOpen(null)} />
                : open === `edit:${n.id}`
                  ? <DecisionForm start={n} asking busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b.answer ? { ...b, status: 'settled' } : { title: b.title, background: b.background }))} onCancel={() => setOpen(null)} />
                : open === n.id
                  ? <DecisionForm start={n} answering busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, { ...b, status: 'settled' }))} onCancel={() => setOpen(null)} />
                  : (
                    <div className="row">
                      {n.status === 'proposed' && <button className="btn small" disabled={busy} aria-label={`Accept: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'settled' }))}>Accept</button>}
                      {n.status === 'proposed' && <button className="btn quiet small" disabled={busy} aria-label={`Reject: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'rejected' }))}>Reject</button>}
                      <button className={`btn small ${n.status === 'proposed' ? 'quiet' : ''}`} disabled={busy} aria-label={`Answer: ${n.title}`} onClick={() => setOpen(n.id)}>{n.status === 'proposed' ? 'Answer it yourself' : 'Answer it'}</button>
                      {!n.waitingOn && <button className="btn quiet small" disabled={busy} aria-label={`Waiting on someone: ${n.title}`} title="You have asked someone and are waiting for their answer" onClick={() => setOpen(`wait:${n.id}`)}>Waiting on someone</button>}
                      {n.waitingOn && <button className="btn quiet small" disabled={busy} aria-label={`No longer waiting: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { waitingOn: '' }))}>No longer waiting</button>}
                      <button className="btn quiet small" disabled={busy} aria-label={`Edit the question: ${n.title}`} title="Its question and its background; give an answer too, or leave it unanswered" onClick={() => setOpen(`edit:${n.id}`)}>Edit</button>
                      {n.status === 'open' && <button className="btn quiet small" disabled={busy} aria-label={`Not needed: ${n.title}`} onClick={() => { if (window.confirm(`Drop the question "${n.title}"? It will not be asked again.`)) void act(() => engine.removeContextNote(subject, n.id)) }}>Not needed</button>}
                    </div>
                  )}
            </div>
          </div>
        ))}
        {mine(settled).map((n) => open === n.id
          ? <DecisionForm key={n.id} start={n} busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Delete the decision "${n.title || n.answer}"?`)) void act(() => engine.removeContextNote(subject, n.id)) }} />
          : <DecisionRow key={n.id} n={n} onEdit={() => setOpen(n.id)} />)}
        {projects([...settled, ...undecided, ...proposed]).length > 0 && <>{fromProject}{projects([...settled, ...undecided, ...proposed]).map((n) => <DecisionRow key={n.id} n={n} />)}</>}
        {rejected.length > 0 && (
          <details className="context-rejected">
            <summary className="context-detail">{rejected.length} answer{rejected.length === 1 ? '' : 's'} proposed and rejected</summary>
            <p className="context-how">Kept so the agents know: each is told you turned it down, and does not propose it again.</p>
            {rejected.map((n) => (
              <div className="context-row context-qa" key={n.id} data-note={n.id}>
                <div className="context-q">{n.title}</div>
                <div>
                  <div className="context-title rejected">{n.answer}</div>
                  {n.body && <div className="context-why"><span className="faint">Why it was proposed: </span><Md text={n.body} inline /></div>}
                  <div className="context-detail">Proposed by the agent, {day(n.on)} · rejected by you
                    {' · '}<button className="link-btn" disabled={busy} aria-label={`Accept after all: ${n.title}`} onClick={() => act(() => engine.editContextNote(subject, n.id, { status: 'settled' }))}>Accept after all</button>
                    {' · '}<button className="link-btn" disabled={busy} aria-label={`Ask again: ${n.title}`} title="The question goes back among the decisions, unanswered. This answer stays turned down." onClick={() => act(() => engine.addContextNote(subject, { kind: 'decision', title: n.title, body: '' }))}>Ask the question again</button>
                    {' · '}<button className="link-btn" disabled={busy} aria-label={`Delete: ${n.title}`} onClick={() => { if (window.confirm(`Delete "${n.answer}"? An agent may then propose it again.`)) void act(() => engine.removeContextNote(subject, n.id)) }}>Delete</button>
                  </div>
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
        {open === 'note' && <NoteForm busy={busy} onSave={(b) => act(() => engine.addContextNote(subject, { kind: 'note', ...b }))} onCancel={() => setOpen(null)} />}
        {!notes.length && open !== 'note' && <div className="empty">None yet.</div>}
        {mine(notes).map((n) => open === n.id
          ? <NoteForm key={n.id} start={n} busy={busy} onSave={(b) => act(() => engine.editContextNote(subject, n.id, b))} onCancel={() => setOpen(null)} onRemove={() => { if (window.confirm(`Delete the note "${n.title}"?`)) void act(() => engine.removeContextNote(subject, n.id)) }} />
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
        {t ? <OriginBody origin={t.origin} /> : pdf ? <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>{/\.html?$/i.test(d.fileName ?? '') ? 'An HTML page' : 'A PDF'}, kept on this computer as the file it was. The agent that needs it opens it; it is not put in front of every agent.</p> : d.body?.trim() ? <Md text={d.body} className="context-text" /> : <p className="muted">Nothing in it.</p>}
      </div>
    </details>
  )
}

/** A decision: its question on the left, its answer on the right, with why and when. One made before questions were asked has only its answer. */
function DecisionRow({ n, onEdit }: { n: ContextNote; onEdit?: () => void }) {
  const made = n.status === 'settled'
  return (
    <div className={`context-row ${n.title ? 'context-qa' : ''}`} data-note={n.id}>
      {n.background && <Background text={n.background} />}
      {n.title && <div className="context-q">{n.title}</div>}
      <div>
        {made ? <div className="context-title">{n.answer}</div> : <div className="context-detail">{n.status === 'proposed' ? `Unanswered: the agent proposes "${n.answer}"` : n.waitingOn ? `Unanswered: waiting on ${n.waitingOn}` : 'Unanswered'}</div>}
        {made && n.body && <div className="context-why"><span className="faint">Why: </span><Md text={n.body} inline /></div>}
        {made && <div className="context-detail">
          {n.addedBy?.startsWith('agent') ? `Recorded by the agent once you agreed, ${day(n.on)}` : `Decided ${day(n.on)}`}
          {onEdit && <>{' · '}<button className="link-btn" aria-label={`Edit: ${n.title || n.answer}`} onClick={onEdit}>Edit</button></>}
        </div>}
      </div>
    </div>
  )
}

/** A decision's background: the story of why it is a question. In full while it is unanswered; folded once it is answered. */
function Background({ text, open }: { text: string; open?: boolean }) {
  return (
    <details className="context-bg" open={open} data-component="ContextBackground">
      <summary className="context-detail">Background</summary>
      <Md text={text} className="context-text" />
    </details>
  )
}

/** A decision asked, made or changed. Adding one, the answer may be left empty: it then waits to be decided. */
function DecisionForm({ start, answering, asking, busy, onSave, onCancel, onRemove }: { start?: ContextNote; /** An open or proposed one being answered: the answer is what is asked for. */ answering?: boolean; /** An unanswered one edited: its question and background, and an answer if one is given now. */ asking?: boolean; busy: boolean; onSave: (b: { title: string; answer: string; body: string; background: string; on: string }) => void; onCancel: () => void; onRemove?: () => void }) {
  const [d, setD] = useState({ title: start?.title ?? '', answer: asking ? '' : start?.answer ?? '', body: asking ? '' : start?.body ?? '', background: start?.background ?? '', on: answering ? today() : start?.on ?? today() })
  const needs = !!start && !asking // one already made, or being answered, has an answer
  // Always the same four, in the order they are thought (Sandy: "background should be above the question"): what led to the question, the question, the answer, why that answer.
  return (
    <form className="mock-edit context-form" data-component="ContextDecisionForm" onSubmit={(e) => { e.preventDefault(); onSave({ title: d.title.trim(), answer: d.answer.trim(), body: d.answer.trim() ? d.body.trim() : '', background: d.background.trim(), on: d.on }) }}>
      <label>Background (optional): what led to the question, and what turns on it<textarea autoFocus={!start} rows={3} value={d.background} onChange={(e) => setD({ ...d, background: e.target.value })} placeholder="The story, and anything to read. Whoever answers it, and every agent, is given this." /></label>
      <label>The question<input autoFocus={!!start && !answering} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="What happens to a card when it is removed?" /></label>
      <label>{needs ? 'The answer' : 'The answer (leave it empty to answer later)'}<input autoFocus={answering} value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} placeholder="It is deleted at the provider, not hidden here" /></label>
      <label>Why this answer (optional)<textarea rows={2} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder={d.answer.trim() ? 'The reason it was decided this way' : 'Once there is an answer: the reason it was decided this way'} /></label>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || (!d.title.trim() && !d.answer.trim()) || (needs && !d.answer.trim()) || (!needs && !d.title.trim())}>{busy ? 'Saving…' : d.answer.trim() || needs ? 'Save the decision' : start ? 'Save it, unanswered' : 'Add it, unanswered'}</button>
        {onRemove && <button className="btn quiet small" type="button" onClick={onRemove}>Delete</button>}
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** Who an open decision waits on: the person has asked them, and says so. */
function WaitingForm({ start, busy, onSave, onCancel }: { start: string; busy: boolean; onSave: (to: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState(start)
  return (
    <form className="mock-edit context-form" data-component="ContextWaitingForm" onSubmit={(e) => { e.preventDefault(); onSave(to.trim()) }}>
      <label>Who you asked<input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="Em, the vendor, legal" /></label>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || !to.trim()}>{busy ? 'Saving…' : 'Mark it as waiting'}</button>
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** A note: what it is about, what was said, then who and when. */
function NoteRow({ n, onEdit }: { n: ContextNote; onEdit?: () => void }) {
  return (
    <div className="context-row" data-note={n.id}>
      <div className="context-title">{n.title}</div>
      {n.body && <Md text={n.body} className="context-text" />}
      <div className="context-detail">
        {day(n.on)} · added by {who(n.addedBy)}
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

/** A note, written or changed. */
function NoteForm({ start, busy, onSave, onCancel, onRemove }: { start?: ContextNote; busy: boolean; onSave: (b: { title: string; body: string; on: string }) => void; onCancel: () => void; onRemove?: () => void }) {
  const [d, setD] = useState({ title: start?.title ?? '', body: start?.body ?? '', on: start?.on ?? today() })
  return (
    <form className="mock-edit context-form" data-component="ContextNoteForm" onSubmit={(e) => { e.preventDefault(); onSave({ title: d.title.trim(), body: d.body.trim(), on: d.on }) }}>
      <label>What it is about<input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Talked with the team about the import" /></label>
      <label>What was said, and what came of it<textarea rows={4} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></label>
      <label style={{ maxWidth: 180 }}>Day<input type="date" value={d.on} onChange={(e) => setD({ ...d, on: e.target.value })} /></label>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy || !d.title.trim() || !d.on}>{busy ? 'Saving…' : 'Save the note'}</button>
        {onRemove && <button className="btn quiet small" type="button" onClick={onRemove}>Delete</button>}
        <button className="btn quiet small" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
