/**
 * A prototype's guide, beside the prototype inside Self Evident (Sandy, 2026-11-15: "is that only share or should it
 * be included in the embedded prototype viewer as well?"). The same steps whoever opens the shared link sees in the
 * tab at the bottom right (share-guide.ts): where to go and what to try. Here it is Self Evident's own panel over the
 * stage, not put into the prototype's page, so a step can move the embedded view. It folds to a tab in the same
 * corner. No feedback box: the person here has the agent beside them.
 */
import { useEffect, useState } from 'react'
import type { Guide } from '../engine'
import { GuideRun, useGuideRuns } from './GuideRun'

const read = (key: string): { open?: boolean; done?: Record<string, boolean> } => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {} } catch { return {} } }
const norm = (p: string) => { const [path, query] = p.split('#')[0].split('?'); return `${path.replace(/\/$/, '') || '/'}${query ? `?${query}` : ''}` }
const same = (a: string, b: string) => norm(a) === norm(b)

export function PrototypeGuide({ id, guide, at, onGo }: {
  /** The prototype's id: what is open and what was tried is remembered per prototype, on this browser. */
  id: string
  guide: Guide | null | undefined
  /** Where the embedded view is now. */
  at: string
  /** Move the embedded view to a step's page. */
  onGo: (path: string) => void
}) {
  const key = `se.guide.${id}`
  const [open, setOpen] = useState(() => read(key).open ?? false)
  const [done, setDone] = useState<Record<string, boolean>>(() => read(key).done ?? {})
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ open, done })) } catch { /* fine without it */ } }, [key, open, done])
  const { runs, problem, run, stop } = useGuideRuns(id) // steps that are commands: run from here too
  const steps = guide?.steps ?? []
  if (!steps.length && !guide?.intro) return null
  const tried = steps.filter((_, i) => done[i]).length
  if (!open) return <button type="button" className="guide-tab" data-component="PrototypeGuide" aria-expanded={false} onClick={() => setOpen(true)} title="Where to go and what to try, as someone opening the shared link sees it">What to try{steps.length ? ` · ${tried}/${steps.length}` : ''}</button>
  return (
    <aside className="guide-panel" data-component="PrototypeGuide" aria-label="What to try">
      <button type="button" className="guide-head" aria-expanded onClick={() => setOpen(false)} title="Hide (it stays in this corner)"><span>What to try</span><span aria-hidden>×</span></button>
      {guide?.intro && <p className="guide-intro">{guide.intro}</p>}
      {problem && <p className="guide-intro bad">{problem}</p>}
      <ol className="guide-steps">
        {steps.map((s, i) => {
          const here = !!s.path && same(s.path, at)
          return (
            <li key={i} className={`${here ? 'here' : ''} ${done[i] ? 'done' : ''}`}>
              <label><input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} aria-label={`Tried: ${s.title}`} /> <b>{s.title}</b></label>
              {s.try && <div className="guide-try">{s.try}</div>}
              {s.run && <div className="guide-try"><GuideRun compact command={s.run} run={runs.find((r) => r.step === i)} onRun={() => run(i)} onStop={() => stop(i)} /></div>}
              {s.path && (here ? <span className="faint guide-at">You are here</span> : <button type="button" className="linkish" onClick={() => onGo(s.path!)}>Go there →</button>)}
            </li>
          )
        })}
      </ol>
      <p className="faint guide-foot">The same guide a shared link shows.</p>
    </aside>
  )
}
