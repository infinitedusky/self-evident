/**
 * A task's review copy, on its pull request step (docs/reviewable-prs-brief.md, step 5; engine review-copy.ts): the
 * branch a reviewer checks out and starts with one command, to run the change on made-up data.
 *
 * Top to bottom: where it stands (not made, in step with the pull request, or behind it); what it holds, which is
 * only ever made up; then what the person decides when it is made (Sandy, 2026-11-23: "we should define when we
 * create the review branch what fixture it uses"): the fixture its database starts from and what a reviewer should
 * try. Making it pushes a branch to the team's repository and changes the pull request's description, so it asks
 * once more first, like submitting does.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from './Badge'
import { API, engine, openEvents, type ReviewCopyView } from '../engine'

const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const short = (sha: string | null | undefined) => (sha ?? '').slice(0, 9)

export function ReviewCopy({ issueId, appId, onChanged }: { issueId: string; appId: string; /** It was made: the pull request's description now names it. */ onChanged?: () => void }) {
  const [v, setV] = useState<ReviewCopyView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fixture, setFixture] = useState('')
  const [steps, setSteps] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const take = (x: ReviewCopyView) => { setV(x); setFixture(x.made?.fixture ?? ''); setSteps(x.made?.try ?? '') }
  const load = useCallback((fresh = false) => engine.reviewCopy(issueId, fresh).then((x) => { take(x); setError(null) }).catch((e) => setError(problemOf(e))), [issueId])
  useEffect(() => {
    void load(true)
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 400) }
    for (const t of ['pr.opened', 'pr.updated', 'review_copy.made', 'review_copy.behind']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [issueId, appId, load])
  const make = async () => { setBusy(true); setError(null); try { take(await engine.makeReviewCopy(issueId, { fixture: fixture || null, try: steps })); setAsking(false); setOpen(false); onChanged?.() } catch (e) { setError(problemOf(e)); setAsking(false) } finally { setBusy(false) } }
  if (!v) return error ? <p className="bad" role="alert">{error}</p> : null
  if (!v.branch) return null // no pull request yet: a review copy goes with one
  const m = v.made
  const form = open || !m
  return (
    <div className="review-copy" data-component="ReviewCopy" role="group" aria-label="Review copy">
      <h3 className="settings-h3">Review copy <span className="faint" style={{ fontWeight: 400 }}>the branch a reviewer runs, on made-up data</span></h3>
      <div className="pr-status">
        {m ? (m.inStep ? <Badge tone="ok">In step with the pull request</Badge> : <Badge tone="warn">Behind the pull request</Badge>) : v.byHand ? <Badge tone="warn">Made by hand</Badge> : <Badge tone="neutral">Not made</Badge>}
        {m && !m.pushed && <Badge tone="warn">not on GitHub</Badge>}
        <span className="faint mono pr-branches">{v.branch}</span>
        {v.compare && (m?.pushed || v.byHand) && <a className="faint" href={v.compare} target="_blank" rel="noreferrer">What it adds ↗</a>}
      </div>
      {m && !m.inStep && <p className="pr-unwritten" style={{ margin: '0 0 8px', fontSize: 13 }}>It was made from <code>{short(m.from)}</code>, and the pull request is now at <code>{short(v.pr?.head)}</code>: a reviewer would run older code than they read. It is made again when the pull request is next updated, or now.</p>}
      {!m && v.byHand && <p className="pr-unwritten" style={{ margin: '0 0 8px', fontSize: 13 }}>A branch of this name is on GitHub that was not made here, so it does not follow the pull request. Making it here replaces it.</p>}
      {!m && !v.byHand && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>Without it a reviewer can read this pull request but not run it.</p>}
      <ul className="review-copy-holds" aria-label="What it holds">
        {v.services.map((s) => <li key={s.key} className={s.blocked ? 'bad' : undefined}><strong>{s.name}</strong>: {s.blocked ?? 'its mock, answering with made-up data; the real one is never called'}</li>)}
        {!v.services.length && <li>It calls no outside service.</li>}
        {m && <li>{m.files.length ? <>Files to bring to it: {m.files.map((f) => <code key={f} style={{ marginRight: 6 }}>{f}</code>)}(the fake versions)</> : 'No test files.'}</li>}
        {m && <li>Its database {m.fixture ? <>starts from the fixture "{m.fixture}"</> : 'starts empty'}.</li>}
      </ul>
      {v.waits.length > 0 && <ul className="pr-waits" aria-label="Why it cannot be made">{v.waits.map((w) => <li key={w}>{w}</li>)}</ul>}
      {error && <p className="bad" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}
      {form && (
        <div className="pr-write">
          <label>Its database starts from
            <select value={fixture} onChange={(e) => setFixture(e.target.value)} disabled={busy}>
              <option value="">Empty: only what the app needs to start</option>
              {v.fixtures.map((f) => <option key={f} value={f}>{f}</option>)}
            </select></label>
          <label style={{ marginTop: 8 }}>What to try, a step a line. It goes into the pull request and the branch's README, as the reviewer will read it.
            <textarea rows={5} value={steps} disabled={busy} onChange={(e) => setSteps(e.target.value)} placeholder={'Import review/files/… and start a scan.\nOpen that person: the new card shows each finding.'} /></label>
        </div>
      )}
      {asking ? (
        <div className="submit-pr-ask" role="group" aria-label="Make the review copy">
          <div>This pushes {v.branch} to GitHub{m?.pushed || v.byHand ? ', over what is there' : ''}, and brings the pull request's description up to date to say how to run it. Your team can see both.</div>
          <div><button className="btn small" disabled={busy} onClick={() => void make()}>{busy ? 'Making it…' : 'Make and push it'}</button> <button className="btn quiet small" disabled={busy} onClick={() => setAsking(false)}>Not yet</button></div>
        </div>
      ) : form ? (
        <div className="smoke-actions"><button className="btn small" disabled={v.waits.length > 0} onClick={() => { setAsking(true); setError(null) }}>{m ? 'Make it again' : 'Make the review copy'}</button>{m && <> <button className="btn quiet small" onClick={() => { setOpen(false); take(v) }}>Cancel</button></>}</div>
      ) : <button className="btn quiet small" onClick={() => setOpen(true)}>Make it again</button>}
    </div>
  )
}
