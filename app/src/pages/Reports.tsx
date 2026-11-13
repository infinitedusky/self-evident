/**
 * Reports: the end-of-day note and the weekly status on an app's work, as the person sends them to whoever they
 * report to (Sandy, 2026-11-13: "a daily report of what was built or what was worked on that I can produce and report
 * every day … on an app level and we could ask for today or last week"). The engine gathers what happened in the
 * period and a model writes it in the person's own format; what comes back is a draft: edit it, copy it, send it
 * yourself. Nothing is sent from here.
 *
 * After a stand-up note and a weekly status for the shape, and the Summary page beside it for "written by the agent
 * from what Self Evident knows".
 */
import { useEffect, useRef, useState } from 'react'
import { Badge } from '../components/Badge'
import { openEvents, API, engine, type Report, type ReportPeriod, type Reports as State } from '../engine'
import { useCurrentApp } from '../current-app'

const PERIODS: { key: ReportPeriod; label: string }[] = [{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'this_week', label: 'This week' }, { key: 'last_week', label: 'Last week' }]
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const problem = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }

export function Reports() {
  const { app } = useCurrentApp()
  const [data, setData] = useState<State | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  const [format, setFormat] = useState({ daily: '', weekly: '' })
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const follow = useRef(true) // show the newest when one arrives, unless the person went looking at an earlier one
  useEffect(() => {
    setData(null); setShown(null)
    if (!app) return
    let closed = false
    const refresh = () => engine.reports(app.id).then((d) => { if (closed) return; setData(d); setFormat(d.format); if (follow.current) setShown(d.reports[0]?.id ?? null) }).catch((e) => setError(problem(e)))
    void refresh()
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    es.addEventListener('report.writing', () => void refresh())
    es.addEventListener('report.written', () => { follow.current = true; void refresh() })
    es.addEventListener('report.failed', (ev) => { setError(String(JSON.parse((ev as MessageEvent).data).payload?.error ?? 'writing failed')); void refresh() })
    return () => { closed = true; es.close() }
  }, [app?.id])
  const report: Report | null = data?.reports.find((r) => r.id === shown) ?? null
  useEffect(() => { setText(report?.body ?? '') }, [report?.id, report?.body])

  if (!app) return <div className="empty">No app yet. Add one in Settings.</div>
  const write = async (period: ReportPeriod) => {
    setError(null); follow.current = true
    try { await engine.writeReport(app.id, { period, ...(notes.trim() ? { notes: notes.trim() } : {}) }); setNotes(''); setData((d) => d && { ...d, writing: true }); setData(await engine.reports(app.id).then((d) => { setShown(d.reports[0]?.id ?? null); return d })) } catch (e) { setError(problem(e)) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* no clipboard here */ } }
  const save = async () => { if (!report) return; try { const r = await engine.editReport(report.id, text); setData((d) => d && { ...d, reports: d.reports.map((x) => (x.id === r.id ? r : x)) }) } catch (e) { setError(problem(e)) } }
  const remove = async () => { if (!report || !window.confirm(`Delete the report "${report.label}"?`)) return; try { await engine.deleteReport(report.id); follow.current = true; const d = await engine.reports(app.id); setData(d); setShown(d.reports[0]?.id ?? null) } catch (e) { setError(problem(e)) } }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>🗞️ Reports<span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span></h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>The end-of-day note and the weekly status, written from what happened on this app in the period: what moved on each task, pull requests, commits, what is in progress. A draft comes back for you to edit and send; nothing is sent from here.</p>
        </div>
        {error && <Badge tone="warn" dot>{error}</Badge>}
      </div>
      <section className="panel report-ask" data-component="ReportAsk">
        <label className="report-notes"><span className="faint">Anything to add that Self Evident cannot know: a meeting, a review you gave, what is next</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Anything to add" placeholder="Met with Em about the copy. Tomorrow: start the share sheet." />
        </label>
        <div className="report-periods"><span className="faint">Write the report for</span>
          {PERIODS.map((p) => <button key={p.key} className="btn small" disabled={!!data?.writing} onClick={() => void write(p.key)}>{p.label}</button>)}
          {data?.writing && <span className="faint"><span className="dot working" /> Writing… about a minute</span>}
        </div>
      </section>
      <div className="report-layout">
        <section className="panel report-draft" data-component="ReportDraft">
          {report ? (
            <>
              <div className="card-head">
                <h2 style={{ margin: 0 }}>{report.label} <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>{report.kind === 'daily' ? 'end of day' : 'weekly'} · written {when(report.createdAt)}{report.editedAt ? ' · edited' : ''}</span></h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  {text !== report.body && <button className="btn quiet small" onClick={() => void save()}>Save changes</button>}
                  <button className="btn small" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
                  <button className="icon-btn" onClick={() => void remove()} title="Delete this report" aria-label="Delete this report">×</button>
                </div>
              </div>
              <textarea className="report-text" value={text} onChange={(e) => setText(e.target.value)} aria-label="The report" rows={Math.min(Math.max(text.split('\n').length + 2, 10), 40)} />
              {report.notes && <p className="faint" style={{ fontSize: 13, margin: '6px 0 0' }}>You added: {report.notes}</p>}
            </>
          ) : data && !data.reports.length
            ? <p className="muted" style={{ margin: 0 }}>No reports yet. Pick a period above and one is drafted in about a minute.</p>
            : <p className="faint" style={{ margin: 0 }}>{data ? 'Pick one from the list.' : 'Loading…'}</p>}
        </section>
        {data && data.reports.length > 0 && (
          <aside className="panel report-list" aria-label="Earlier reports">
            <h3>Reports</h3>
            <ul className="list">
              {data.reports.map((r) => <li key={r.id}><button className={`report-pick ${r.id === shown ? 'on' : ''}`} onClick={() => { follow.current = false; setShown(r.id) }}>{r.label}<span className="faint"> · {r.kind === 'daily' ? 'end of day' : 'weekly'}</span></button></li>)}
            </ul>
          </aside>
        )}
      </div>
      <details className="panel report-format">
        <summary>Your format</summary>
        <p className="faint" style={{ fontSize: 13 }}>Paste how you write each one, with a few real reports of yours as examples. Every report is shaped after them: the sections, the tone, how much detail. Their content is never reused. Kept on this app, on this computer.</p>
        <label><span className="faint">End of day</span><textarea rows={8} value={format.daily} onChange={(e) => { setFormat({ ...format, daily: e.target.value }); setSaved(false) }} aria-label="End-of-day format and examples" /></label>
        <label><span className="faint">Weekly</span><textarea rows={8} value={format.weekly} onChange={(e) => { setFormat({ ...format, weekly: e.target.value }); setSaved(false) }} aria-label="Weekly format and examples" /></label>
        <div><button className="btn small" onClick={() => void engine.setReportFormat(app.id, format).then(() => setSaved(true)).catch((e) => setError(problem(e)))}>Save format</button> {saved && <span className="faint">Saved.</span>}</div>
      </details>
    </>
  )
}
