/**
 * One unanswered question, with the way to answer it: its cost, its options as buttons (the recommended one marked,
 * with why), and "Answer in your own words" for anything else. Used wherever a question is seen, so it can be
 * answered where it is read: on Build and on the task (Sandy, 2026-11-14: "they should have the interface where I
 * can answer a question in the task as well"). After a pull request's suggested change: the choice and the button
 * side by side.
 */
import { useState } from 'react'
import { Badge, type Tone } from './Badge'
import { Md } from './Md'

const COST_TONE: Record<string, Tone> = { cheap: 'neutral', moderate: 'warn', expensive: 'bad' }
export interface AskedQuestion { id: string; text: string; cost: string | null; reason: string | null; options: { label: string; description: string; recommended: boolean }[] }

export function QuestionAsk({ q, busy, onAnswer }: { q: AskedQuestion; busy?: boolean; /** The option's label, or the person's own words. */ onAnswer: (answer: string) => Promise<unknown> | void }) {
  const [own, setOwn] = useState<string | null>(null) // null: not writing one
  const rec = q.options.find((o) => o.recommended)
  return (
    <div className="build-ask" data-component="QuestionAsk">
      <div><Badge tone={COST_TONE[q.cost ?? ''] ?? 'neutral'}>{q.cost ?? 'question'}</Badge> <strong><Md text={q.text} inline /></strong></div>
      <div className="opts">
        {q.options.map((o) => <button key={o.label} type="button" className={`btn quiet small ${o.recommended ? 'rec' : ''}`} disabled={busy} title={o.description} onClick={() => void onAnswer(o.label)}>{o.label}{o.recommended ? ' · recommended' : ''}</button>)}
        {own === null && <button type="button" className="linkish" disabled={busy} onClick={() => setOwn('')}>Answer in your own words</button>}
      </div>
      {own !== null && (
        <form className="opts" onSubmit={(e) => { e.preventDefault(); if (own.trim()) void onAnswer(own.trim()) }}>
          <input autoFocus value={own} onChange={(e) => setOwn(e.target.value)} aria-label="Your answer" placeholder="Your answer" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn small" disabled={busy || !own.trim()}>Answer</button>
          <button type="button" className="linkish" onClick={() => setOwn(null)}>Cancel</button>
        </form>
      )}
      {rec && q.reason && <div className="faint" style={{ fontSize: 13 }}>Why {rec.label}: <Md text={q.reason} inline /></div>}
      {q.options.some((o) => o.description) && <ul className="faint" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{q.options.filter((o) => o.description).map((o) => <li key={o.label}><strong>{o.label}</strong>: {o.description}</li>)}</ul>}
    </div>
  )
}
