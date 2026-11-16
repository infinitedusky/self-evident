/**
 * A task's pull request, on its Sub-tasks page (Sandy, 2026-11-16: one opened after the first of nine sub-tasks,
 * before the checks only a person could run: "we should move to 'submit PR' as a button that needs to be pressed so
 * that I can't ever have this happen"). The engine never opens one by itself and pushes nothing while the build runs.
 * When every sub-task has landed, the person runs their own checks and submits: the branch is pushed and the pull
 * request opens, as a draft unless the app says otherwise. One they closed stays closed until they submit again.
 *
 * After a "Create pull request" button on a pushed branch, with the confirmation a publish step has.
 */
import { useState } from 'react'
import { engine, type TaskPr } from '../engine'

const problem = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }

export function SubmitPr({ issueId, pr, landed, total, unchecked = 0, draft = true, auto = false, onChanged }: {
  issueId: string; pr: TaskPr | null
  /** Sub-tasks landed, of those in the plan. */
  landed: number; total: number
  /** Acceptance criteria not marked as met by the build. */
  unchecked?: number
  /** The app opens its pull requests as drafts. */
  draft?: boolean
  /** The app is set to open a task's pull request by itself once the whole task has landed (Settings › Landing). */
  auto?: boolean
  onChanged?: () => void
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<TaskPr | null>(null)
  const now = made ?? pr
  const live = now && now.status !== 'closed' && now.status !== 'merged'
  const closed = now?.status === 'closed'
  const ready = total > 0 && landed === total
  const submit = async () => {
    setBusy(true); setError(null)
    try { const r = await engine.submitPr(issueId); setMade({ number: r.number, url: r.url, status: r.status }); setAsking(false); onChanged?.() } catch (e) { setError(problem(e)) } finally { setBusy(false) }
  }
  return (
    <section className="panel submit-pr" data-component="SubmitPr" aria-label="Pull request">
      <h2>Pull request {live && <a className="badge accent" href={now!.url ?? '#'} target="_blank" rel="noreferrer">Pull request #{now!.number} · {now!.status}</a>}</h2>
      {live ? (
        <p className="faint" style={{ margin: 0 }}>You submitted it. Anything that lands from here on is pushed to it. Marking it ready for review, and merging it, are yours to do on GitHub.</p>
      ) : (
        <>
          <p style={{ margin: '0 0 6px' }}>
            {closed ? <>#{now!.number} is closed, and it stays closed: nothing more is pushed to it until you submit it again. </> : <>Not submitted. Nothing has been pushed: the work is on this computer only. </>}
            <b>{landed} of {total} sub-task{total === 1 ? ' has' : 's have'} landed.</b>
          </p>
          {auto && !closed
            ? <p className="faint" style={{ margin: '0 0 8px' }}>It opens by itself{draft ? ', as a draft,' : ''} once all {total} have landed and the task's test run has passed. To hold it for your own checks, change "A task's pull request" in Settings › Landing.</p>
            : ready
            ? <p className="faint" style={{ margin: '0 0 8px' }}>Run your own checks first: the ones only you can do. Self Evident does not open this pull request by itself.</p>
            : <p className="faint" style={{ margin: '0 0 8px' }}>It can be submitted once they all have, and you have run your own checks.</p>}
          {ready && unchecked > 0 && <p className="submit-pr-warn">{unchecked} acceptance {unchecked === 1 ? 'criterion is' : 'criteria are'} not marked as met by the build.</p>}
          {asking ? (
            <div className="submit-pr-ask" role="group" aria-label="Submit the pull request">
              <div>This pushes the branch and {closed ? `reopens #${now!.number}` : 'opens the pull request'}{draft ? ' as a draft' : ', ready for review'}. Your team can see it from then on.</div>
              <div><button className="btn small" disabled={busy} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Submit it'}</button> <button className="btn quiet small" disabled={busy} onClick={() => setAsking(false)}>Not yet</button></div>
            </div>
          ) : auto && !closed && !ready ? null : <button className="btn" disabled={!ready} onClick={() => { setAsking(true); setError(null) }}>{closed ? 'Submit pull request again' : 'Submit pull request'}</button>}
          {error && <div className="empty bad" style={{ marginTop: 8 }}>{error}</div>}
        </>
      )}
    </section>
  )
}
