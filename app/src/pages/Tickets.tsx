/**
 * Tickets: the team's tickets as records, each with the tasks under it (Sandy, 2026-11-24: "ticket needs to become an
 * actual record, not just text … and then we can link them that way. And that way it would just be an organizational
 * thing"). A ticket bigger than one pull request is several tasks under one ticket: each task still has its own brief,
 * prototype, build and pull request, and the ticket builds and approves nothing. It is done when its tasks are.
 *
 * /tickets lists every ticket with a task under it, the ones still being worked first; /tickets/:key is one, where a
 * ticket known by its key alone (read from a link in a task) can be read from its tracker for its title and link.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { engine, STATE_LABEL, type IssueState, type TicketGroup } from '../engine'
import { useCurrentApp } from '../current-app'

const TONE: Record<IssueState, Tone> = { triage: 'neutral', backlog: 'neutral', todo: 'neutral', in_progress: 'accent', in_review: 'accent', done: 'ok', canceled: 'neutral', duplicate: 'neutral' }
const FROM = { set: 'linked on the task', import: 'brought in from it', link: 'read from a link in the task', idea: 'read from a link in its idea' } as const
const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const SOURCE: Record<string, string> = { linear: 'Linear' }

function Ticket({ t, alone, onRead }: { t: TicketGroup; /** The page is this ticket's own. */ alone: boolean; onRead: (t: TicketGroup) => void }) {
  const { app } = useCurrentApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const read = async () => { if (!app) return; setBusy(true); setError(null); try { onRead(await engine.readTicket(app.id, t.key)) } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  const dropped = t.tasks.length - t.total
  const Head = alone ? 'h1' : 'h2'
  return (
    <section className="panel" data-component="Ticket" aria-label={t.key}>
      <Head style={{ margin: 0 }}>
        {alone ? <span className="mono">{t.key}</span> : <Link to={`/tickets/${t.key}`} className="mono" style={{ textDecoration: 'none' }}>{t.key}</Link>}
        {t.title ? <> {t.title}</> : null}
      </Head>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 10px' }}>
        {t.finished ? <Badge tone="ok">Done</Badge> : t.total ? <Badge tone={t.done ? 'accent' : 'neutral'}>{t.done} of {t.total} task{t.total === 1 ? '' : 's'} done</Badge> : <Badge>no tasks</Badge>}
        {t.url && <a href={t.url} target="_blank" rel="noreferrer">Open it in {SOURCE[t.source ?? ''] ?? 'its tracker'}</a>}
        {!t.read && <span className="faint" style={{ fontSize: 13 }}>Only its key is known.</span>}
        {alone && <button type="button" className="btn small quiet" disabled={busy} onClick={() => void read()} title="Its title, link and words, as Linear has them now">{busy ? 'Reading…' : t.read ? 'Read it again from Linear' : 'Read it from Linear'}</button>}
        {error && <span className="bad" role="alert">{error}</span>}
      </div>
      {t.tasks.length === 0 ? <p className="muted" style={{ margin: 0 }}>No task is under it. Set it as a task's team ticket and the task shows here.</p> : (
        <ul className="list">
          {t.tasks.map((k) => (
            <li key={k.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', opacity: ['canceled', 'duplicate'].includes(k.state) ? 0.6 : 1 }}>
              <div>
                <Link to={`/tasks/${k.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}><span className="mono faint">{k.identifier}</span> {k.teamTitle ?? k.title}</Link>
                <div className="faint" style={{ fontSize: 13 }}>
                  {k.project ? <>in <Link to={`/projects/${k.project.id}`}>{k.project.name}</Link></> : 'in no project'} · {FROM[k.from]}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {k.pr?.url && <a className="badge" href={k.pr.url} target="_blank" rel="noreferrer">PR #{k.pr.number} · {k.pr.status}</a>}
                <Badge tone={TONE[k.state]} dot={k.state === 'in_progress'}>{STATE_LABEL[k.state]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dropped > 0 && <p className="faint" style={{ margin: '8px 0 0', fontSize: 13 }}>{dropped} dropped, not counted.</p>}
    </section>
  )
}

export function Tickets() {
  const { app } = useCurrentApp()
  const { key } = useParams()
  const [rows, setRows] = useState<TicketGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setRows(null); setError(null)
    if (!app) return
    let live = true
    const got = key ? engine.ticket(app.id, key).then((t) => [t]) : engine.tickets(app.id).then((all) => all.filter((t) => t.tasks.length))
    got.then((r) => { if (live) setRows(r) }).catch((e) => { if (live) setError(problemOf(e)) })
    return () => { live = false }
  }, [app?.id, key])
  const onRead = (t: TicketGroup) => setRows((was) => was?.map((x) => (x.key === t.key ? t : x)) ?? null)
  return (
    <>
      {key ? <p style={{ margin: '0 0 12px' }}><Link to="/tickets">All tickets</Link></p> : (
        <div className="page-head"><div>
          <h1>🎫 Tickets{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>The team's tickets and the tasks under each. A ticket bigger than one pull request is several tasks with the same ticket: each has its own brief, build and pull request, and the ticket is done when they all are. A task comes under a ticket when the ticket is set on it.</p>
        </div></div>
      )}
      {error && <div className="empty bad">{error}</div>}
      {rows && !rows.length && <div className="empty">No task has a team ticket yet. Set one on a task (the badge under its title) and it shows here.</div>}
      {rows?.map((t) => <Ticket key={t.key} t={t} alone={!!key} onRead={onRead} />)}
    </>
  )
}
