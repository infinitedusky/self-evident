/**
 * Tasks from Linear tickets (LOG.md, "Tasks from Linear tickets"): on the Tasks page of an app whose Linear team is
 * set. Closed until asked for, so Linear is only read when the person wants it. Open: the team's open tickets (the
 * person's own, unassigned, or everyone's), a tick for each one to bring in, and the task a ticket already is.
 * Reads Linear; nothing is written there.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import { engine, type LinearImported, type LinearScope, type LinearTicket } from '../engine'

const SCOPES: { key: LinearScope; label: string }[] = [{ key: 'mine', label: 'Mine' }, { key: 'unassigned', label: 'Unassigned' }, { key: 'all', label: "Everyone's" }]
const PRIORITY = ['', 'Urgent', 'High', 'Medium', 'Low']
/** The engine's sentence, out of its JSON reply. */
const said = (e: any) => { const m = String(e?.message ?? e); try { return JSON.parse(m).error ?? m } catch { return m } }

/**
 * `startOpen`: asked for by a button (Plan's From Linear), so it opens on the tickets straight away.
 * `embedded`: inside another panel (a project's Add tasks): no panel or heading of its own, always open, and the
 * button says `verb`. `onImported` is given what was made, so the caller can put the new tasks where they belong.
 */
export function LinearImport({ appId, team, onImported, startOpen = false, embedded = false, verb = 'Bring in' }: { appId: string; team: string; onImported: (r: LinearImported) => unknown; startOpen?: boolean; embedded?: boolean; verb?: string }) {
  const [open, setOpen] = useState(startOpen || embedded)
  const [scope, setScope] = useState<LinearScope>('mine')
  const [tickets, setTickets] = useState<LinearTicket[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<LinearImported | null>(null)
  const load = () => { setTickets(null); setProblem(null); engine.linearTickets(appId, scope).then((r) => setTickets(r.tickets)).catch((e) => setProblem(said(e))) }
  useEffect(() => { if (open) load() }, [open, scope, appId]) // eslint-disable-line react-hooks/exhaustive-deps
  const words = filter.trim().toLowerCase()
  const shown = (tickets ?? []).filter((t) => !words || `${t.identifier} ${t.title} ${t.project ?? ''} ${t.assignee ?? ''}`.toLowerCase().includes(words))
  const bring = async () => {
    setBusy(true); setProblem(null)
    try { const r = await engine.importLinear(appId, picked); await onImported(r); setDone(r); setPicked([]); load() } catch (e) { setProblem(said(e)) } finally { setBusy(false) }
  }
  const list = (rows: LinearImported['made']) => rows.map((r) => `${r.identifier} (${r.linear})`).join(', ')
  const Wrap = embedded ? 'div' : 'section'
  return (
    <Wrap className={embedded ? undefined : 'panel'} data-component="LinearImport">
      {embedded
        ? <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>Open tickets of <span className="mono">{team}</span>. A ticked one becomes a task in this project, with its words and a link back. Linear is read, never written to.</p>
        : <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>From Linear <span className="mono faint" style={{ fontWeight: 400 }}>{team}</span></h2>
        <span className="muted" style={{ flex: '1 1 300px', fontSize: 14 }}>A ticket becomes a task here, with its words and a link back. Linear is read, never written to.</span>
        <button type="button" className="btn quiet" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Bring in tickets…'}</button>
      </div>}
      {done && <p className="settings-note" style={{ marginTop: 10 }}><Badge tone="ok">Brought in</Badge><span>
        {done.made.length > 0 && <>Made {list(done.made)}. </>}{done.updated.length > 0 && <>Updated {list(done.updated)}. </>}{done.missing.length > 0 && <>Not found in {team}: {done.missing.join(', ')}.</>}
      </span></p>}
      {open && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
          {SCOPES.map((s) => <button key={s.key} type="button" className={`btn small ${scope === s.key ? '' : 'quiet'}`} aria-pressed={scope === s.key} onClick={() => { setScope(s.key); setPicked([]) }}>{s.label}</button>)}
          <input aria-label="Filter tickets" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter: words, a number, a project" style={{ flex: '1 1 220px', minWidth: 0, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }} />
          <button type="button" className="btn" disabled={busy || !picked.length} onClick={() => void bring()}>{busy ? 'Bringing in…' : picked.length ? `${verb} ${picked.length}` : verb}</button>
        </div>
        {problem && <div className="empty bad">{problem}</div>}
        {!problem && tickets === null && <p className="muted">Asking Linear…</p>}
        {tickets && !tickets.length && <div className="empty">{scope === 'mine' ? `Nothing open is assigned to you in ${team}. Look under Unassigned or Everyone's.` : scope === 'unassigned' ? `Nothing open and unassigned in ${team}.` : `No open tickets in ${team}.`}</div>}
        {tickets && tickets.length > 0 && !shown.length && <div className="empty">No ticket matches “{filter}”.</div>}
        {shown.length > 0 && <ul className="list">
          {shown.map((t) => (
            <li key={t.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
              {t.task
                ? <span style={{ width: 16 }} />
                : <input type="checkbox" aria-label={`${t.identifier}: ${t.title}`} checked={picked.includes(t.identifier)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.identifier] : picked.filter((p) => p !== t.identifier))} />}
              <div>
                <div><a className="mono faint" href={t.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{t.identifier}</a> <span style={{ fontWeight: 600 }}>{t.title}</span></div>
                <div className="faint" style={{ fontSize: 13 }}>{[t.project, t.assignee ?? 'unassigned', PRIORITY[t.priority]].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.task && <span className="faint" style={{ fontSize: 13 }}>is <Link to={`/tasks/${t.task.id}`}>{t.task.identifier}</Link></span>}
                <Badge tone={t.state.type === 'started' ? 'accent' : 'neutral'}>{t.state.name}</Badge>
              </div>
            </li>
          ))}
        </ul>}
      </>}
    </Wrap>
  )
}
