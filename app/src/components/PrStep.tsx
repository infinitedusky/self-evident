/**
 * A task's pull request, as a step of its own after the smoke test (Sandy, 2026-11-20: "a new step to the build
 * section after smoke test, 'PR'. This will show us the PR status, the message, let us submit (new PR or draft to
 * complete conversion) and let us see any comments. It will also in the future give us tools to help reviewers").
 *
 * Top to bottom, the order a person asks in: where it stands and what it waits on; the one thing to press now
 * (submit it, or mark the draft ready for review); its message, as it will open or as GitHub has it; what was said
 * on it, oldest first. Submitting and marking ready each ask once more before they act: both are seen by the team.
 * After GitHub's own pull request page, kept to what is decided here; reviewing and merging stay on GitHub.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import { SubmitPr } from './SubmitPr'
import { API, engine, openEvents, type PrComment, type PrView } from '../engine'

const TONE: Record<string, Tone> = { draft: 'neutral', open: 'accent', closed: 'warn', merged: 'ok' }
const SAYS: Record<string, string> = { draft: 'Draft', open: 'Open, ready for review', closed: 'Closed', merged: 'Merged' }
const KIND = { comment: 'commented', review: 'reviewed', line: 'on a line' } as const
const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const when = (at: string) => { const d = new Date(at); return at && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '' }

export function PrStep({ issueId, appId, base }: { issueId: string; appId: string; /** The task's address, for the links on from here. */ base: string }) {
  const [v, setV] = useState<PrView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false) // show what the next update sends, when GitHub's is behind
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => engine.prView(issueId).then((x) => { setV(x); setError(null) }).catch((e) => setError(problemOf(e))), [issueId])
  useEffect(() => {
    void load()
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 400) }
    for (const t of ['pr.opened', 'pr.updated', 'pr.submitted', 'pr.ready', 'pr.left_closed', 'build.status', 'smoke.marked', 'task.checked']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [issueId, appId, load])
  const ready = async () => { setBusy(true); setError(null); try { await engine.markPrReady(issueId); setAsking(false); await load() } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const pr = v.pr
  const live = !!pr && pr.status !== 'closed' && pr.status !== 'merged'
  const checks = pr?.checks ?? []
  const count = (s: string) => checks.filter((c) => c.state === s).length
  const shown = pr && !sent && pr.title ? { title: pr.title, body: pr.body, from: 'On GitHub now' } : v.message ? { title: v.message.title, body: v.message.body, from: pr && live ? 'What the next update sends' : pr?.status === 'closed' ? 'As it will be submitted again' : 'As it will open' } : null
  return (
    <section className="panel pr-step" data-component="PrStep" aria-label="Pull request">
      <div className="smoke-head">
        <h2>🔀 Pull request <span className="faint">{pr ? <>#{pr.number}</> : 'not submitted'}</span></h2>
        {pr?.url && <a className="btn quiet small" href={pr.url} target="_blank" rel="noreferrer">Open on GitHub ↗</a>}
      </div>
      <div className="pr-status" role="group" aria-label="Where it stands">
        <Badge tone={pr ? TONE[pr.status] : 'neutral'}>{pr ? SAYS[pr.status] : 'Not submitted'}</Badge>
        {pr?.review && live && <Badge tone={pr.review === 'approved' ? 'ok' : pr.review === 'changes requested' ? 'bad' : 'neutral'}>{pr.review === 'review required' ? 'waiting for review' : pr.review}</Badge>}
        {checks.length > 0 && live && <Badge tone={count('fail') ? 'bad' : count('pending') ? 'warn' : 'ok'} >{count('fail') ? `${count('fail')} of ${checks.length} checks failing` : count('pending') ? `${count('pending')} of ${checks.length} checks running` : `${checks.length} checks pass`}</Badge>}
        {pr?.mergeable === 'conflicting' && live && <Badge tone="bad">conflicts with {v.message?.base ?? 'its base'}</Badge>}
        {v.message && <span className="faint mono pr-branches">{v.message.head} → {v.message.base}</span>}
      </div>
      {v.problem && <p className="smoke-stale" role="note">{v.problem}</p>}
      {error && <p className="bad" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}
      {checks.some((c) => c.state === 'fail') && live && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>Failing: {checks.filter((c) => c.state === 'fail').map((c) => c.name).join(', ')}.</p>}

      {(!pr || pr.status === 'closed') && v.waits.length > 0 && <ul className="pr-waits" aria-label="What it waits on">{v.waits.map((w) => <li key={w}>{w}</li>)}</ul>}
      {/* The one thing to press now. */}
      {!pr || pr.status === 'closed' ? (
        <>
          {v.byHand > 0 && <p className="submit-pr-warn">{v.byHand} check{v.byHand === 1 ? '' : 's'} of yours still wait{v.byHand === 1 ? 's' : ''} in <Link to={`${base}/smoke`}>the smoke test</Link>.</p>}
          <SubmitPr issueId={issueId} pr={pr ? { number: pr.number, url: pr.url, status: pr.status } : null} landed={v.landed} total={v.total} unchecked={v.unchecked} draft={v.draft} auto={v.auto} onChanged={() => void load()} />
        </>
      ) : pr.status === 'draft' ? (
        <div className="pr-act">
          <p style={{ margin: '0 0 6px' }}>It is a draft: your team can see it, and nobody is asked to review it yet.{v.byHand > 0 ? <> {v.byHand} check{v.byHand === 1 ? '' : 's'} of yours still wait{v.byHand === 1 ? 's' : ''} in <Link to={`${base}/smoke`}>the smoke test</Link>.</> : ''}</p>
          {asking ? (
            <div className="submit-pr-ask" role="group" aria-label="Mark it ready for review">
              <div>This takes #{pr.number} out of draft. Its reviewers are asked, and it can be merged once they approve.</div>
              <div><button className="btn small" disabled={busy} onClick={() => void ready()}>{busy ? 'Marking it ready…' : 'Mark it ready'}</button> <button className="btn quiet small" disabled={busy} onClick={() => setAsking(false)}>Not yet</button></div>
            </div>
          ) : <button className="btn" onClick={() => { setAsking(true); setError(null) }}>Ready for review</button>}
        </div>
      ) : pr.status === 'open' ? (
        <p className="pr-act faint">It is ready for review. Reviewing and merging are done on GitHub; what is said there shows below.</p>
      ) : <p className="pr-act faint">It is merged. Nothing more is sent to it.</p>}

      <h3 className="settings-h3">Message <span className="faint" style={{ fontWeight: 400 }}>{shown?.from ?? ''}</span></h3>
      {v.behind && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>GitHub has an earlier version of it. It is brought up to date when the next sub-task lands. <button className="linkish" onClick={() => setSent(!sent)}>{sent ? 'Show what GitHub has' : 'Show what will be sent'}</button></p>}
      {shown ? (
        <div className="pr-message">
          <div className="pr-title">{shown.title}</div>
          <Md html text={shown.body} />
        </div>
      ) : <p className="muted">It has no message yet: nothing has been planned or built.</p>}

      <h3 className="settings-h3">Comments <span className="faint" style={{ fontWeight: 400 }}>{v.comments.length || ''}</span></h3>
      {!pr ? <p className="muted">Comments show here once it is submitted.</p>
        : v.comments.length === 0 ? <p className="muted">{v.problem ? 'They could not be read just now.' : 'Nobody has said anything on it yet.'}</p>
        : <ol className="pr-comments" aria-label="Comments">{v.comments.map((c) => <Comment key={c.id} c={c} />)}</ol>}
    </section>
  )
}

function Comment({ c }: { c: PrComment }) {
  return (
    <li className={`pr-comment ${c.kind}`}>
      <div className="pr-comment-head">
        <strong>{c.author}</strong> <span className="faint">{KIND[c.kind]}{c.kind === 'line' && c.path ? <> <code>{c.path}{c.line ? `:${c.line}` : ''}</code></> : null}{when(c.at) ? ` · ${when(c.at)}` : ''}</span>
        {c.kind === 'review' && c.state && <Badge tone={c.state === 'approved' ? 'ok' : c.state === 'changes requested' ? 'bad' : 'neutral'}>{c.state}</Badge>}
        {c.url && <a className="faint" href={c.url} target="_blank" rel="noreferrer" aria-label={`Open ${c.author}'s comment on GitHub`}>↗</a>}
      </div>
      {c.body.trim() ? <Md html text={c.body} /> : <span className="faint">No words with it.</span>}
    </li>
  )
}
