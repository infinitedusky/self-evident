/**
 * A pull request's finalizing, on the task's Pull request step (Sandy, 2026-11-23: "The Pull request step finalizes;
 * the person decides"; "no way to see the evidence before it was public"). Accepting the smoke test starts it; each
 * step shows as it goes; the results wait here.
 *
 * Top to bottom, the order a person decides in: where it stands; the five steps, each with what it found; what was
 * found that can be put right (a planned test not proven, a break no test caught, a gate check that fails), each
 * with "Fix this", which sends a sub-task after it; the evidence as it would be sent; and last the one press that
 * sends anything to GitHub, off until the gate passes, with what it waits on. A break may be left as it is, with a
 * reason that goes into the evidence.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import type { FinalizeView, GateCheck, Survivor } from '../engine'

const MARK: Record<string, string> = { pass: '✓', fail: '✗', running: '…', skipped: '–', waiting: '○', wait: '…', none: '–' }
const CLS: Record<string, string> = { pass: 'ok', fail: 'bad', running: 'warn', wait: 'warn', skipped: 'faint', waiting: 'faint', none: 'faint' }
const problemOf = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function Finalize({ v, base, number, onStart, onFix, onAccept, onSend }: {
  v: FinalizeView
  /** The task's address, for the links on from here. */ base: string
  /** The pull request's number, when it has one. */ number?: number | null
  onStart: () => Promise<unknown>
  onFix: (kind: 'survivor' | 'row' | 'gate', id: string) => Promise<unknown>
  onAccept: (id: string, i: { reason?: string; equivalent?: boolean; undo?: boolean }) => Promise<unknown>
  onSend: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [leaving, setLeaving] = useState<string | null>(null) // the survivor a reason is being written for
  const [reason, setReason] = useState('')
  const [equivalent, setEquivalent] = useState(false)
  const act = async (key: string, fn: () => Promise<unknown>, then?: () => void) => { setBusy(key); setError(null); try { await fn(); then?.() } catch (e) { setError(problemOf(e)) } finally { setBusy(null) } }
  const short = (s: string | null) => (s ? s.slice(0, 7) : '')
  const where: { says: string; tone: Tone } = v.state === 'running' ? { says: 'Running', tone: 'warn' } : v.state === 'none' ? { says: 'Not run', tone: 'neutral' } : v.state === 'failed' ? { says: 'It failed', tone: 'bad' } : v.state === 'cut' ? { says: 'Cut off', tone: 'warn' } : v.stale ? { says: `Of an earlier commit (${short(v.sha)})`, tone: 'warn' } : { says: `Run on ${short(v.sha)}`, tone: 'ok' }
  const open = (v.mutation?.survivors ?? []).filter((s) => !s.equivalent && !s.accepted?.equivalent)
  const aside = (v.mutation?.survivors ?? []).filter((s) => s.equivalent || s.accepted?.equivalent)
  const sendName = v.press === 'update' ? 'Update pull request' : 'Push and mark ready for review'
  const leave = (s: Survivor) => act(`leave:${s.id}`, () => onAccept(s.id, { reason: reason.trim(), ...(equivalent ? { equivalent: true } : {}) }), () => { setLeaving(null); setReason(''); setEquivalent(false) })
  return (
    <div className="finalize" data-component="Finalize" role="group" aria-label="Finalizing">
      <div className="finalize-head">
        <h3 className="settings-h3" style={{ margin: 0 }}>Finalizing</h3>
        <Badge tone={where.tone}>{where.says}</Badge>
        {v.state !== 'running' && <button className="btn quiet small" disabled={!!busy || !v.canStart} title={v.canStart ? 'Runs every step again on the branch as it is now. Nothing is sent.' : v.startWaits ?? undefined} onClick={() => void act('start', onStart)}>{busy === 'start' ? 'Starting…' : v.state === 'none' ? 'Run the finalizing' : 'Run it again'}</button>}
      </div>
      <p className="faint finalize-lead">
        {v.state === 'none' ? <>Accepting the smoke test starts it (<Link to={`${base}/smoke`}>the smoke test</Link>), or run it here. </> : v.state === 'cut' ? 'The engine stopped while it was running: run it again. ' : v.state === 'failed' ? <>{v.error ? `${cap(v.error)}. ` : ''}Run it again. </> : ''}
        It runs on this computer. Nothing here reaches GitHub until you press {sendName}.
      </p>
      {!v.canStart && v.startWaits && v.state !== 'running' && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>It cannot be run now: {v.startWaits}.</p>}
      {error && <p className="bad" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}

      <ol className="finalize-steps" aria-label="The steps">
        {v.steps.map((s) => <li key={s.key} className={s.state}><span className={`finalize-mark ${CLS[s.state]}`} aria-label={s.state}>{MARK[s.state]}</span><span><strong>{s.name}</strong>{s.says ? <span className="finalize-says"> {s.says}</span> : s.state === 'running' ? <span className="finalize-says"> Running…</span> : null}</span></li>)}
      </ol>

      {v.unproven.length > 0 && (<>
        <h4 className="finalize-h4">Planned tests not proven <span className="faint">{v.unproven.length}</span></h4>
        <ul className="finalize-list" aria-label="Planned tests not proven">
          {v.unproven.map((r) => <li key={r.id}><div><strong>{r.id}</strong> <code>{r.test}</code>: {r.says}.</div>{r.fix ? <div className="faint">A fix is on its way: {r.fix.title}.</div> : <div className="finalize-acts"><button className="btn quiet small" disabled={!!busy} onClick={() => void act(`fix:${r.id}`, () => onFix('row', r.id))}>Fix this</button></div>}</li>)}
        </ul>
      </>)}

      {v.mutation && (<>
        <h4 className="finalize-h4">Mutation testing <span className="faint">{v.mutation.meaningful ? `${v.mutation.caught} of ${v.mutation.meaningful} breaks caught (${v.mutation.percent}%)` : 'no meaningful break could be made'}</span></h4>
        <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>Small breaks made one at a time to the lines this pull request changed, in {v.mutation.files} file{v.mutation.files === 1 ? '' : 's'}, and run against {v.mutation.tests.length} test file{v.mutation.tests.length === 1 ? '' : 's'}{v.mutation.tool === 'app' ? ', by the app\'s own tool' : ''}.{v.mutation.tried < v.mutation.found ? ` ${v.mutation.tried} of ${v.mutation.found} possible breaks were tried.` : ''}{v.mutation.invalid ? ` ${v.mutation.invalid} would not load and ${v.mutation.invalid === 1 ? 'is' : 'are'} not counted.` : ''}{v.mutation.partial ? ` Stopped early: ${v.mutation.partial}.` : ''}</p>
        {open.length > 0 && (
          <ul className="finalize-list" aria-label="Breaks no test caught">
            {open.map((s) => (
              <li key={s.id}>
                <div><code>{s.file}:{s.line}</code> <code>{s.from}</code> became <code>{s.to || 'nothing'}</code></div>
                <div>{cap(s.means)}.</div>
                <pre className="finalize-code">{s.code}</pre>
                {s.accepted ? <div className="faint">Left as it is: {s.accepted.reason} <button className="linkish" disabled={!!busy} onClick={() => void act(`undo:${s.id}`, () => onAccept(s.id, { undo: true }))}>Take that back</button></div>
                  : s.fix ? <div className="faint">A fix is on its way: {s.fix.title}. The finalizing runs again when it lands.</div>
                  : leaving === s.id ? (
                    <div className="finalize-leave" role="group" aria-label="Leave it as it is">
                      <label>Why it is left as it is (it goes into the evidence, for the reviewer)<textarea rows={2} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} /></label>
                      <label className="check"><input type="checkbox" checked={equivalent} onChange={(e) => setEquivalent(e.target.checked)} /> No test could tell the two apart: take it out of the score</label>
                      <div className="finalize-acts"><button className="btn small" disabled={!!busy || !reason.trim()} onClick={() => void leave(s)}>{busy === `leave:${s.id}` ? 'Saving…' : 'Leave it'}</button> <button className="btn quiet small" disabled={!!busy} onClick={() => setLeaving(null)}>Cancel</button></div>
                    </div>
                  ) : <div className="finalize-acts"><button className="btn quiet small" disabled={!!busy} title="Sends a sub-task to write the test that fails with this break in. The finalizing runs again when it lands." onClick={() => void act(`fix:${s.id}`, () => onFix('survivor', s.id))}>{busy === `fix:${s.id}` ? 'Sending…' : 'Fix this'}</button> <button className="btn quiet small" disabled={!!busy} onClick={() => { setLeaving(s.id); setReason(''); setEquivalent(false); setError(null) }}>Leave it, with a reason</button></div>}
              </li>
            ))}
          </ul>
        )}
        {aside.length > 0 && (<>
          <p className="faint" style={{ margin: '0 0 4px', fontSize: 13 }}>Left out of the score, because no test could tell:</p>
          <ul className="finalize-list aside" aria-label="Left out of the score">
            {aside.map((s) => <li key={s.id}><div><code>{s.file}:{s.line}</code> <code>{s.from}</code> became <code>{s.to || 'nothing'}</code>. <span className="faint">{cap(s.accepted?.equivalent ? s.accepted.reason : s.equivalent ?? '')}{s.accepted?.equivalent ? <> <button className="linkish" disabled={!!busy} onClick={() => void act(`undo:${s.id}`, () => onAccept(s.id, { undo: true }))}>Take that back</button></> : '.'}</span></div></li>)}
          </ul>
        </>)}
      </>)}

      {v.gate.length > 0 && (<>
        <h4 className="finalize-h4">The gate <span className="faint">what must pass before anything is sent</span></h4>
        <ul className="finalize-gate" aria-label="The gate checks">
          {v.gate.map((c) => <Gate key={c.key} c={c} busy={!!busy} onFix={() => void act(`fix:${c.key}`, () => onFix('gate', c.key))} />)}
        </ul>
      </>)}

      {v.evidence && <details className="finalize-evidence"><summary>The evidence, as it would be sent</summary><Md html text={v.evidence} /></details>}

      {v.press && (
        <div className="finalize-press">
          {v.sent && <p className="faint" style={{ margin: '0 0 6px', fontSize: 13 }}>{v.sent.same ? 'GitHub has this evidence.' : `GitHub has the evidence as it was sent on ${short(v.sent.sha)}; what is here is newer.`}</p>}
          {asking && v.canPush ? (
            <div className="submit-pr-ask" role="group" aria-label={sendName}>
              <div>{v.press === 'update' ? `This sends the title, the description with this evidence, and the review branch to ${number ? `#${number}` : 'the pull request'}, which your team is already reviewing.` : `This pushes the branch, sends the title, the description with this evidence, and the review branch, and takes ${number ? `#${number}` : 'the pull request'} out of draft: its reviewers are asked.`}</div>
              <div><button className="btn small" disabled={!!busy} onClick={() => void act('send', onSend, () => setAsking(false))}>{busy === 'send' ? 'Sending…' : v.press === 'update' ? 'Send it' : 'Push it and mark it ready'}</button> <button className="btn quiet small" disabled={!!busy} onClick={() => setAsking(false)}>Not yet</button></div>
            </div>
          ) : <button className="btn" disabled={!v.canPush || !!busy} onClick={() => { setAsking(true); setError(null) }}>{sendName}</button>}
          {!v.canPush && v.pushWaits.length > 0 && <ul className="pr-waits" aria-label="What the press waits on" style={{ marginTop: 8 }}>{v.pushWaits.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}

function Gate({ c, busy, onFix }: { c: GateCheck; busy: boolean; onFix: () => void }) {
  return (
    <li className={c.state}>
      <span className={`finalize-mark ${CLS[c.state]}`} aria-label={c.state === 'none' ? 'nothing to check' : c.state === 'wait' ? 'waiting' : c.state}>{MARK[c.state]}</span>
      <span>
        <strong>{c.name}</strong> <span className="finalize-says">{c.says}</span>
        {c.details && c.details.length > 1 && <ul className="finalize-details">{c.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        {c.sent ? <span className="faint"> A fix is on its way: {c.sent.title}.</span> : c.fix && c.state === 'fail' ? <> <button className="btn quiet small" disabled={busy} onClick={onFix}>Fix this</button></> : null}
      </span>
    </li>
  )
}
