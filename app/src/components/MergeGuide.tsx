/**
 * A task's merge guide, on its build page (Sandy, 2026-11-13: "really easy for someone who's actually approving this
 * thing to be able to understand and act on"): what its pull request opens with, shown here before there is one, so
 * it can be read and put right first. The engine puts it together from what the task holds: its description, its
 * acceptance criteria with the build's mark on each, the draft ADR's and the blast radius's summaries, the planner's
 * decisions. To change it, change those.
 *
 * After a pull request template's "What / How to test / Risks".
 */
import { useEffect, useState } from 'react'
import { engine } from '../engine'
import { Md } from './Md'

export function MergeGuide({ issueId, stamp }: { issueId: string; /** Changes when the task did: read it again. */ stamp?: string | number | null }) {
  const [guide, setGuide] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { let on = true; void engine.mergeGuide(issueId).then((r) => { if (on) setGuide(r.guide) }).catch(() => { if (on) setGuide('') }); return () => { on = false } }, [issueId, stamp])
  if (guide === null) return null
  const copy = async () => { try { await navigator.clipboard.writeText(guide); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* no clipboard here */ } }
  return (
    <section className="panel merge-guide" data-component="MergeGuide" aria-label="Merge guide">
      <h2>🧭 Merge guide <span className="faint">what the pull request opens with, for whoever approves it</span>
        {guide && <button className="btn quiet small merge-guide-copy" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>}
      </h2>
      {guide
        ? <Md text={guide} />
        : <p className="muted">Nothing to put in it yet. It is put together from the task: its description, its acceptance criteria and the build's mark on each, the decisions, and the summaries of the draft ADR and the blast radius.</p>}
    </section>
  )
}
