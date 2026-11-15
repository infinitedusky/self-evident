/**
 * A prototype with no screen is tried by running it (Sandy, 2026-11-15: "can we add a command line window if that is
 * the prototype access point"; asked which, "Run buttons"). Its guide's steps are commands the agent wrote. Each is
 * shown as written, with Run beside it and what it printed under it. Not a terminal: nothing can be typed, and only a
 * step's own command runs. Like the Run button beside a test in an editor, or a job's log in a CI page.
 *
 * - GuideRun: one command, its button and its output.
 * - GuideRuns: a prototype's whole guide as a page, for a prototype whose server is not running.
 * - useGuideRuns: the last run of each step, asked for again every second while one is running.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge, type Tone } from './Badge'
import { engine, type Guide, type StepRun } from '../engine'

const said = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const WORD: Record<StepRun['status'], string> = { running: 'Running…', passed: 'Finished', failed: 'Failed', stopped: 'Stopped' }
const TONE: Record<StepRun['status'], Tone> = { running: 'accent', passed: 'ok', failed: 'bad', stopped: 'neutral' }

export function useGuideRuns(id: string) {
  const [runs, setRuns] = useState<StepRun[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const load = useCallback(() => engine.prototypeRuns(id).then(setRuns).catch(() => {}), [id])
  useEffect(() => { void load() }, [load])
  const running = runs.some((r) => r.status === 'running')
  useEffect(() => { if (!running) return; const t = window.setInterval(() => void load(), 1000); return () => window.clearInterval(t) }, [running, load])
  const act = (fn: () => Promise<unknown>) => { setProblem(null); void fn().then(load).catch((e) => setProblem(said(e))) }
  return { runs, problem, run: (step: number) => act(() => engine.runGuideStep(id, step)), stop: (step: number) => act(() => engine.stopGuideStep(id, step)) }
}

export function GuideRun({ command, run, onRun, onStop, compact }: {
  command: string
  /** Its last run, if it has been run since the engine started. */
  run?: StepRun
  onRun: () => void; onStop: () => void
  /** In the small panel over a running prototype: the last few lines only, until asked for. */
  compact?: boolean
}) {
  const [all, setAll] = useState(false)
  const lines = run?.lines ?? []
  const few = compact ? 8 : 40
  const shown = all ? lines : lines.slice(-few)
  return (
    <div className={`guide-run ${compact ? 'compact' : ''}`} data-component="GuideRun">
      <div className="guide-run-line">
        <code>{command}</code>
        {run?.status === 'running'
          ? <button type="button" className="btn quiet small" onClick={onStop}>Stop</button>
          : <button type="button" className="btn small" onClick={onRun}>{run ? 'Run again' : 'Run'}</button>}
      </div>
      {run && (
        <div className="guide-run-status">
          <Badge tone={TONE[run.status]} dot={run.status === 'running'}>{WORD[run.status]}{run.status === 'failed' && run.exitCode !== null ? ` (exit ${run.exitCode})` : ''}</Badge>
          {lines.length > few && <button type="button" className="linkish" onClick={() => setAll(!all)}>{all ? `Show the last ${few} lines` : `Show all ${lines.length} lines`}</button>}
        </div>
      )}
      {run && (lines.length ? <pre className="guide-run-out mono" aria-label="What it printed">{shown.join('\n')}</pre> : run.status !== 'running' && <p className="faint guide-run-none">It printed nothing.</p>)}
    </div>
  )
}

export function GuideRuns({ id, guide }: { id: string; guide: Guide }) {
  const { runs, problem, run, stop } = useGuideRuns(id)
  return (
    <div className="guide-runs" data-component="GuideRuns">
      {guide.intro && <p className="muted">{guide.intro}</p>}
      {problem && <div className="empty bad">{problem}</div>}
      <ol>
        {guide.steps.map((s, i) => (
          <li key={i}>
            <b>{s.title}</b>
            {s.try && <div className="muted guide-runs-try">{s.try}</div>}
            {s.run ? <GuideRun command={s.run} run={runs.find((r) => r.step === i)} onRun={() => run(i)} onStop={() => stop(i)} />
              : s.path ? <div className="faint guide-runs-try">A page of the prototype, <span className="mono">{s.path}</span>: start its server to open it.</div> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
