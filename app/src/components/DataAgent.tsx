/**
 * A task's data agent, at the top of its Data step (docs/reviewable-prs-brief.md, step 6; engine data-agent.ts).
 *
 * It works in three steps and stops after each; this is where the person lets it go on (Sandy, 2026-11-23: "You, on
 * the Data step"). Top to bottom: where it stands and the three steps; what it was asked; then, when it has stopped,
 * what it proposes (or, after the third step, what it built) with the two things a person can do about it: approve
 * it, or say what to change. Steps already approved stay, folded. Approving the second step is what lets it build,
 * so that button says so.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'
import { API, engine, openEvents, type DataAgentView } from '../engine'

const STEPS: Record<1 | 2 | 3, string> = { 1: 'What the task calls', 2: 'Where the data comes from', 3: 'Build it' }
const APPROVE: Record<1 | 2 | 3, string> = { 1: 'Approve, go on to step 2', 2: 'Approve, build it', 3: 'Approve: it is done' }
const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }

export function DataAgent({ issueId, appId, onChanged }: { issueId: string; appId: string; /** It built something, or a step was approved: the rest of the Data step may have changed. */ onChanged?: () => void }) {
  const [v, setV] = useState<DataAgentView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [ask, setAsk] = useState('')
  const [changing, setChanging] = useState(false)
  const [change, setChange] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => engine.dataAgent(issueId).then((x) => { setV(x); setError(null) }).catch((e) => setError(problemOf(e))), [issueId])
  useEffect(() => {
    void load()
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void load(); onChanged?.() }, 400) }
    for (const t of ['data_agent.asked', 'data_agent.proposed', 'data_agent.approved', 'data_agent.change']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [issueId, appId, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<DataAgentView>, after?: () => void) => { setBusy(true); setError(null); try { setV(await fn()); after?.(); onChanged?.() } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  if (!v) return error ? <p className="bad" role="alert">{error}</p> : null
  const tone: Tone = v.state === 'proposed' ? 'warn' : v.state === 'done' ? 'ok' : v.state === 'working' ? 'accent' : 'neutral'
  const says = v.state === 'none' ? 'Not asked yet' : v.state === 'done' ? 'Done' : v.state === 'proposed' ? `Waiting for you: step ${v.step} of 3` : `Working on step ${v.step} of 3`
  const mark = (n: 1 | 2 | 3) => (v.approved.some((p) => p.step === n) ? 'done' : v.state !== 'none' && v.state !== 'done' && v.step === n ? 'now' : 'later')
  const form = v.state === 'none' || asking
  return (
    <section className="data-agent" data-component="DataAgent" aria-label="Data agent">
      <div className="smoke-head">
        <h3 className="mock-h3" style={{ margin: 0 }}>🧪 Data agent</h3>
        <Badge tone={tone}>{says}</Badge>
      </div>
      <p className="faint" style={{ margin: '4px 0 8px', fontSize: 13 }}>It works out what this task needs outside its own code and builds it, in three steps. It stops after each one, and goes on only when you approve it here.</p>
      <ol className="data-agent-steps" aria-label="Its three steps">
        {([1, 2, 3] as const).map((n) => <li key={n} className={mark(n)} aria-current={mark(n) === 'now' ? 'step' : undefined}><span className="n">{mark(n) === 'done' ? '✓' : n}</span> {STEPS[n]}</li>)}
      </ol>
      {error && <p className="bad" role="alert" style={{ margin: '0 0 8px' }}>{error}</p>}
      {v.asked && <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>Asked by {v.asked.by}: {v.asked.text}</p>}
      {v.state === 'working' && <p style={{ margin: '0 0 8px', fontSize: 14 }}>{v.busy ? 'It is working on this step now.' : 'It is on this step; it has not said it is finished.'}{v.change ? <> You asked it to change: <em>{v.change}</em></> : null}</p>}

      {v.approved.map((p) => (
        <details key={p.step} className="lv-item data-agent-approved">
          <summary>Step {p.step}, approved: {STEPS[p.step]}</summary>
          <div className="pr-message"><Md html text={p.summary} /></div>
        </details>
      ))}

      {v.state === 'proposed' && v.proposal && (
        <div className="data-agent-proposal" role="group" aria-label={`Step ${v.step}: ${STEPS[v.step]}`}>
          <div className="data-agent-proposal-h">{v.step === 3 ? 'What it built' : 'What it proposes'} <span className="faint">step {v.step}: {STEPS[v.step]}</span></div>
          <div className="pr-message"><Md html text={v.proposal.summary} /></div>
          {v.step === 2 && <p className="pr-unwritten" style={{ margin: '8px 0', fontSize: 13 }}>It will build for these services and no others: {v.proposal.services.map((s) => <code key={s} style={{ marginRight: 6 }}>{s}</code>)}Nothing is built until you approve.</p>}
          {changing ? (
            <div className="pr-write">
              <label>What should it change?
                <textarea rows={3} value={change} autoFocus disabled={busy} onChange={(e) => setChange(e.target.value)} /></label>
              <div className="smoke-actions"><button className="btn small" disabled={busy || !change.trim()} onClick={() => void act(() => engine.changeDataStep(issueId, change), () => { setChanging(false); setChange('') })}>{busy ? 'Sending…' : 'Send it back'}</button> <button className="btn quiet small" disabled={busy} onClick={() => setChanging(false)}>Cancel</button></div>
            </div>
          ) : (
            <div className="smoke-actions"><button className="btn small" disabled={busy} onClick={() => void act(() => engine.approveDataStep(issueId))}>{busy ? 'Approving…' : APPROVE[v.step]}</button> <button className="btn quiet small" disabled={busy} onClick={() => setChanging(true)}>Say what to change</button></div>
          )}
        </div>
      )}

      {form ? (
        <div className="pr-write">
          <label>What does this task need? Say what the change does outside the app: what it calls, what a tester would bring to it. The task's agent asks this by itself when it reaches the task's data.
            <textarea rows={3} value={ask} disabled={busy} onChange={(e) => setAsk(e.target.value)} /></label>
          <div className="smoke-actions"><button className="btn small" disabled={busy || !ask.trim()} onClick={() => void act(() => engine.askDataAgent(issueId, ask), () => { setAsking(false); setAsk('') })}>{busy ? 'Asking…' : 'Ask the data agent'}</button>{v.state !== 'none' && <> <button className="btn quiet small" disabled={busy} onClick={() => setAsking(false)}>Cancel</button></>}</div>
        </div>
      ) : v.state === 'done' ? <button className="btn quiet small" onClick={() => setAsking(true)}>Ask it again</button> : null}
    </section>
  )
}
