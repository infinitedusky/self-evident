/**
 * A task's team ticket and its name for the team, on the task's head (found on a client's first pull request,
 * 2026-11-20: the task linked the team's ticket and had none recorded, so its branch and its pull request's title
 * carried our id, which their CI rejects; and the title was our working one, "…, third build: …").
 *
 * The ticket shows as a badge with where it was read from; with none it says so, as a warning when the app requires
 * one, since the task's branch and pull request then wait for it. One press opens both fields. After the "linked
 * issue" chip on a pull request: the thing it answers to, beside its name.
 */
import { useState } from 'react'
import { engine } from '../engine'

const FROM = { set: 'set on this task', import: 'the ticket it was brought in from', link: 'read from a link in its description', idea: 'read from a link in the idea it came from' } as const
const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }

export function TeamNames({ issueId, ticket, from, missing, set, title, ourTitle, also = [], onSaved }: {
  issueId: string
  /** The ticket in force, and where it was read from. */ ticket: string | null; from: keyof typeof FROM | null
  /** The app requires one and there is none. */ missing?: boolean
  /** What was set by hand (the ticket in force may be read from elsewhere). */ set: string | null
  /** Its name for the team, when it has one; and ours, which is used otherwise. */ title: string | null; ourTitle: string
  /** The other tickets it is under (a task can answer more than one): they place it under them and name nothing. */ also?: string[]
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [t, setT] = useState(''); const [n, setN] = useState(''); const [o, setO] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const start = () => { setT(set ?? ''); setN(title ?? ''); setO(also.join(', ')); setError(null); setOpen(true) }
  const save = async () => {
    setBusy(true); setError(null)
    try { await engine.setTeamNames(issueId, { ticket: t, title: n, ...(o.trim() !== also.join(', ') ? { also: o.split(/[\s,]+/).filter(Boolean) } : {}) }); setOpen(false); onSaved?.() } catch (e) { setError(problemOf(e)) } finally { setBusy(false) }
  }
  if (!open) return (
    <span className="team-names" data-component="TeamNames">
      <button type="button" className={`badge ${ticket ? 'accent' : missing ? 'warn' : ''} team-ticket`} onClick={start}
        title={ticket ? `The team's ticket: ${from ? FROM[from] : ''}. It names this task's branch, commits and pull request.${title ? ` For the team it is called: ${title}.` : ''} Press to change.` : missing ? 'This app requires a team ticket. Its branch and its pull request wait for one. Press to set it.' : 'No team ticket: its branch and pull request carry our id. Press to set one.'}>
        {ticket ?? (missing ? 'needs a team ticket' : 'no team ticket')}{title ? <span className="faint"> · {title}</span> : null}{also.length ? <span className="faint" title={`Also under ${also.join(', ')}: they place this task under them too, and name nothing`}> · also {also.join(', ')}</span> : null} ✎
      </button>
    </span>
  )
  return (
    <form className="team-names open" data-component="TeamNames" role="group" aria-label="For the team" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label>Team ticket<input className="mono" value={t} autoFocus onChange={(e) => setT(e.target.value)} placeholder={ticket && !set ? `${ticket} (${from ? FROM[from] : ''})` : 'ENT-322'} /></label>
      <label>Its name for the team<input value={n} onChange={(e) => setN(e.target.value)} placeholder={ourTitle} title="A plain phrase, as the team would say it: the pull request's title and the branch use it in place of our own title" /></label>
      <label>Also under<input className="mono" value={o} onChange={(e) => setO(e.target.value)} placeholder="ENT-324, ENT-325" title="Other tickets this task answers, by key. They place it under those tickets too; its branch and pull request carry only the team ticket." /></label>
      <span className="team-names-acts"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button> <button type="button" className="btn quiet small" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></span>
      {error && <span className="bad" role="alert">{error}</span>}
    </form>
  )
}
