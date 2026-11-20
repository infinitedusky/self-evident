/**
 * A checklist task's list, on a page of its own (Sandy, 2026-11-16: "what it needs to check for is the really
 * critical thing"; "These are both what's put into the instructions and what is checked at the end"). The stages
 * the task goes through by itself after its prototype, then every item it is held to: its own acceptance criteria
 * and the requirements its workflow has on, each with the check's mark and what the check saw.
 *
 * Reading only: a criterion is changed on the brief, a requirement in the workflow's rules. What is not done comes
 * first, as on a failing CI run's summary (GitHub's checks list) and a test report.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import type { Checklist, ChecklistItem, ChecklistStage } from '../engine'

const MARK: Record<ChecklistItem['mark'], { icon: string; says: string }> = {
  unmet: { icon: '❌', says: 'not done' }, person: { icon: '👀', says: 'yours to judge' }, unchecked: { icon: '⬜', says: 'not checked yet' },
  met: { icon: '✅', says: 'met' }, na: { icon: '➖', says: 'does not apply' },
}
const ORDER: ChecklistItem['mark'][] = ['unmet', 'person', 'unchecked', 'met', 'na']
export const STAGE_MARK: Record<ChecklistStage['state'], string> = { todo: '○', doing: '◐', done: '✓', failed: '✕' }
const TONE: Record<ChecklistStage['state'], 'neutral' | 'accent' | 'ok' | 'bad'> = { todo: 'neutral', doing: 'accent', done: 'ok', failed: 'bad' }

/** When a run was, in a few words: the page showed a failure hours old with nothing to say so. */
const ago = (at: string) => { const m = Math.round((Date.now() - new Date(at).getTime()) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago` }

export function ChecklistView({ checklist: c, base, onTestAgain }: { checklist: Checklist; /** The task's address, for the links on from here. */ base: string; /** Ask for the whole test run again, on the branch as it is now. Left out, there is no press. */ onTestAgain?: () => Promise<unknown> }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const again = async () => { if (!onTestAgain) return; setAsking(true); setError(null); try { await onTestAgain() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setAsking(false) } }
  const t = c.tests
  const sorted = (kind: ChecklistItem['kind']) => c.items.filter((x) => x.kind === kind).sort((a, b) => ORDER.indexOf(a.mark) - ORDER.indexOf(b.mark))
  const row = (x: ChecklistItem) => (
    <li key={x.id} className={`checklist-item ${x.mark}`}>
      <span className="checklist-mark" title={MARK[x.mark].says} aria-label={MARK[x.mark].says}>{MARK[x.mark].icon}</span>
      <div>
        <div><strong>{x.text}</strong>{x.what && <span className="faint"> {x.what}</span>}</div>
        {x.evidence && <div className="faint checklist-evidence">{x.mark === 'unmet' ? 'Missing: ' : x.mark === 'unchecked' ? 'How: ' : x.mark === 'person' ? '' : 'Seen: '}{x.evidence}</div>}
      </div>
    </li>
  )
  const criteria = sorted('criterion'), required = sorted('requirement')
  const checked = c.items.some((x) => x.mark !== 'unchecked')
  return (
    <section className="panel" data-component="ChecklistView" aria-label="Checklist">
      <h2>☑️ Checklist <span className="faint">{c.total === 0 ? 'nothing on it' : checked ? `${c.met} of ${c.total} met${c.unmet ? `, ${c.unmet} not done` : ''}` : `${c.total} to check once it is built`}</span></h2>
      <p className="faint" style={{ margin: '0 0 10px', fontSize: 13 }}>What this task is held to. The builder is given this list, and an agent that did not build it checks each line when the build is done. What is not done is sent back, three times at most.</p>
      <ol className="checklist-stages" aria-label="Where it is">
        {c.stages.map((s) => <li key={s.key}><Badge tone={TONE[s.state]}>{STAGE_MARK[s.state]} {s.label}</Badge> <span className="faint">{s.detail}</span>
          {s.key === 'test' && t && <>
            {t.at && !t.running && <span className="faint" title={new Date(t.at).toLocaleString()}> · ran {ago(t.at)}{t.ok && t.flaky ? ', on the second try' : ''}</span>}
            {onTestAgain && t.canRun && <> <button className="btn quiet small" disabled={asking} onClick={() => void again()} title="Runs the app's test command on this task's branch as it is now. It takes as long as the tests do.">{asking ? 'Starting…' : t.at ? 'Run again' : 'Run the tests'}</button></>}
            {error && <p className="bad" role="alert" style={{ margin: '6px 0 0' }}>{error}</p>}
            {t.output && !t.running && <details className="checklist-output"><summary>What the run said</summary><pre>{t.output.replace(/\x1b\[[0-9;]*m/g, '')}</pre></details>}
          </>}
        </li>)}
      </ol>
      <h3>The task's acceptance criteria <span className="faint">{criteria.length || 'none'}</span></h3>
      {criteria.length > 0
        ? <ul className="checklist-items">{criteria.map(row)}</ul>
        : <p className="muted" style={{ margin: 0 }}>None written. They are part of <Link to={`${base}/brief`}>the brief</Link>.</p>}
      <h3>What the workflow requires <span className="faint">{required.length || 'nothing'}</span></h3>
      {required.length > 0
        ? <ul className="checklist-items">{required.map(row)}</ul>
        : <p className="muted" style={{ margin: 0 }}>This task's workflow holds a build to nothing but its own criteria.</p>}
      <p className="faint" style={{ margin: '12px 0 0', fontSize: 13 }}>The agents doing each stage are on <Link to={`${base}/build`}>the build page</Link>. Which requirements apply is the workflow's: Settings › Workflow rules.</p>
    </section>
  )
}
