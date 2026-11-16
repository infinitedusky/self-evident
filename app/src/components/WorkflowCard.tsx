/**
 * One workflow. It reads as a short list; Edit turns it into switches (no form until asked).
 *
 * A workflow is one of two kinds (Sandy, 2026-11-16: "what we should have for our different workflows are not full,
 * fast, or whatever. It's just a thing where you … set the requirements"; "These are both what's put into the
 * instructions and what is checked at the end"):
 * - **Checklist**: two choices. Sub-tasks or not, and the requirements a build is held to (a decision record,
 *   telemetry, tests …). The same list goes in the builder's instructions and is what is checked when it is built.
 * - **Staged**: the earlier way, kept. Checks before the build (every one, none, or a pick), then a plan and sub-tasks.
 *
 * Above either: the steps a person chooses on the way to an approved prototype, and the brief. The settings are a
 * small subset of Jira's workflows: no statuses or transitions of their own. The fixed rules live in the engine's
 * steps module: the arrows can't break them, and a step that is always on has no switch.
 */
import { useState } from 'react'
import { Badge } from './Badge'
import { AFTERS, AFTER_SAYS, BUILDS, BUILD_SAYS, CHECKS, STYLES, STYLE_SAYS, afterOf, buildOf, canTurnOff, checksOf, normalize, step, styleOf, validOrder, withChecks, type After, type Build, type StepKey, type Style, type Workflow, type WorkflowStep } from '@self-evident/engine/steps'
import { DEFAULT_REQUIREMENTS, requirementsOf, type Requirement } from '@self-evident/engine/requirements'

/** What follows an approved prototype in a staged workflow, in order: the plan sits between what it is made from and what reads it. Only the checks it runs. */
const afterList = (run: StepKey[]): (StepKey | 'plan' | 'build')[] => [...CHECKS.slice(0, 2).filter((k) => run.includes(k)), 'plan', ...CHECKS.slice(2).filter((k) => run.includes(k)), 'build']
const AFTER_NAME: Record<After, string> = { full: 'Full', fast: 'Fast', custom: 'Your pick' }
const BUILD_NAME: Record<Build, string> = { one: 'In one go', planned: 'In sub-tasks' }
const STYLE_NAME: Record<Style, string> = { checklist: 'Checklist', staged: 'Staged' }
/** What a checklist workflow does once the prototype is approved, by itself (the engine's verify module). */
const thenList = (build: Build) => [
  build === 'one' ? '🏗️ Built in one go: one builder, the whole task' : '🗂️ Planned into sub-tasks, built side by side and merged one at a time',
  '✅ Checked against the list, by an agent that did not build it', '🔁 What the check found is done, and checked again (three rounds at most)',
  '🧪 Probed by another agent, which tries to break it and cleans up', '🧫 The app\'s whole test run, once',
]
const NOTE: Partial<Record<StepKey, string>> = { idea: 'always first', brief: 'the parent: every step feeds it, and it is approved last' }

export function WorkflowCard({ workflow, usedBy, editing: startEditing = false, onSave, catalogue = DEFAULT_REQUIREMENTS }: {
  workflow: Workflow; usedBy?: string; editing?: boolean; onSave?: (w: Workflow) => void
  /** The app's requirements: what each means, and whether the app has it on. A workflow switches them for itself. */
  catalogue?: Requirement[]
}) {
  const [editing, setEditing] = useState(startEditing)
  const [w, setW] = useState(() => normalize(workflow))
  const set = (i: number, patch: Partial<WorkflowStep>) => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const moved = (i: number, by: number) => { const steps = [...w.steps]; const [s] = steps.splice(i, 1); steps.splice(i + by, 0, s); return steps }
  const canMove = (i: number, by: number) => i + by >= 0 && i + by < w.steps.length && w.steps[i].key !== 'brief' && w.steps[i + by].key !== 'brief' && validOrder(moved(i, by)) // the brief stays last: it isn't in the order
  const move = (i: number, by: number) => setW({ ...w, steps: moved(i, by) })
  const on = w.steps.filter((s) => s.on)
  const off = w.steps.filter((s) => !s.on)
  const lead = (s: WorkflowStep) => s.key !== 'brief' && step(s.key).place !== 'check' // the steps a person chooses, on the way to the prototype
  const hasPrototype = w.steps.some((s) => s.key === 'prototype' && s.on)
  const style = styleOf(w), build = buildOf(w)
  const run = checksOf(w)
  const [picking, setPicking] = useState(() => afterOf(normalize(workflow)) === 'custom') // "Your pick" stays open while every box happens to be ticked
  const after: After = picking ? 'custom' : afterOf(w)
  const choose = (a: After) => { setPicking(a === 'custom'); if (a !== 'custom') setW(withChecks(w, a)) }
  const toggle = (k: StepKey, yes: boolean) => setW(withChecks(w, CHECKS.filter((c) => (c === k ? yes : run.includes(c)))))
  // The list this workflow holds a build to: the app's, with this workflow's own switches over it.
  const list = requirementsOf({ requirements: catalogue }, undefined, w.requirements)
  const held = list.filter((r) => r.on)
  const hold = (key: string, yes: boolean) => setW({ ...w, requirements: { ...(w.requirements ?? {}), [key]: yes } })
  // Changing kind: a checklist runs nothing before the build; a staged workflow is planned and starts from every check.
  const kind = (s: Style) => setW(s === 'checklist' ? { ...withChecks(w, 'fast'), style: s } : { ...withChecks(w, 'full'), style: s, build: 'planned' })
  return (
    <div className="panel workflow" data-component="WorkflowCard">
      <div className="card-head">
        <span className="card-title">{w.name} <Badge tone={style === 'checklist' ? 'accent' : 'neutral'}>{STYLE_NAME[style]}</Badge></span>
        {!editing && <button className="btn quiet small" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {usedBy && <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>{usedBy}</div>}
      {!editing ? (
        <>
          <h4 className="wf-h">On the way to an approved prototype <span className="faint">yours to choose</span></h4>
          <ol className={`wf-steps ${w.ordered ? '' : 'free'}`}>
            {on.filter(lead).map((s) => <li key={s.key}>{step(s.key).icon} {step(s.key).label} {s.required ? <Badge tone="warn">required</Badge> : <span className="faint" style={{ fontSize: 12 }}>optional: done or skipped on each task</span>}</li>)}
          </ol>
          <div className="faint" style={{ fontSize: 13 }}>
            {w.ordered ? 'In this order: a step waits for the required ones before it.' : 'In any order.'}
            {off.length > 0 && <> Off: {off.map((s) => step(s.key).label).join(', ')}.</>}
          </div>
          {style === 'checklist' ? (
            <>
              <h4 className="wf-h">What a build is held to <span className="faint">in the builder's instructions, and checked when it is built</span></h4>
              {held.length > 0
                ? <ul className="wf-held">{held.map((r) => <li key={r.key} title={r.what}><strong>{r.name}</strong> <span className="faint">{r.what}</span></li>)}</ul>
                : <div className="faint" style={{ fontSize: 13 }}>Nothing but the task's own acceptance criteria.</div>}
              <div className="faint" style={{ fontSize: 13 }}>And each task's own acceptance criteria.{list.length > held.length && <> Not held to: {list.filter((r) => !r.on).map((r) => r.name).join(', ')}.</>}</div>
              <h4 className="wf-h">Then, by itself <Badge tone="neutral">{BUILD_NAME[build]}</Badge></h4>
              <ol className="wf-steps">{thenList(build).map((line) => <li key={line}>{line}</li>)}</ol>
            </>
          ) : (
            <>
              <h4 className="wf-h">After the prototype is approved <span className="faint">by itself, in this order</span>{hasPrototype && <> <Badge tone="neutral">{AFTER_NAME[afterOf(w)]}</Badge></>}</h4>
              {hasPrototype
                ? <ol className="wf-steps">{afterList(run).map((k) => (k === 'plan' ? <li key={k}>🗂️ The plan: the task cut into sub-tasks</li> : k === 'build' ? <li key={k}>🏗️ The build: each sub-task built and merged, then its criteria checked and the tests run</li> : <li key={k} title={step(k).what}>{step(k).icon} {step(k).label}</li>))}</ol>
                : <div className="faint" style={{ fontSize: 13 }}>This workflow has no prototype, so there is nothing to read first: once the brief is approved, the plan (sub-tasks), then the build.</div>}
              {hasPrototype && <div className="faint" style={{ fontSize: 13 }}>
                {afterOf(w) === 'full' ? 'Every check, before anything is built.' : afterOf(w) === 'fast' ? 'No checks: planned and built straight after the prototype.' : `Not run: ${CHECKS.filter((k) => !run.includes(k)).map((k) => step(k).label).join(', ')}.`}
                {' '}The earlier way of working, kept. A checklist does this after the build instead.
              </div>}
            </>
          )}
          <h4 className="wf-h">The brief <span className="faint">always, and approved by you</span></h4>
          <div className="faint" style={{ fontSize: 13 }}>What to build and why. It can be approved once every step above it is done, or skipped where it is optional.</div>
        </>
      ) : (
        <>
          <h4 className="wf-h">On the way to an approved prototype</h4>
          <ul className="list">
            {w.steps.map((s, i) => !lead(s) ? null : (
              <li key={s.key} className="wf-edit-row">
                <span className="wf-arrows">
                  <button className="btn quiet small" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} aria-label={`Move ${step(s.key).label} up`}>↑</button>
                  <button className="btn quiet small" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} aria-label={`Move ${step(s.key).label} down`}>↓</button>
                </span>
                <span className={s.on ? '' : 'faint'}>{step(s.key).icon} {step(s.key).label}{NOTE[s.key] && <span className="faint" style={{ fontSize: 12 }}> · {NOTE[s.key]}</span>}</span>
                {canTurnOff(s.key) ? <label><input type="checkbox" checked={s.on} onChange={(e) => set(i, { on: e.target.checked, required: e.target.checked && s.required })} /> On</label> : <span />}
                <label className={s.on ? '' : 'faint'}><input type="checkbox" disabled={!s.on} checked={s.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
              </li>
            ))}
          </ul>
          <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={w.ordered} onChange={(e) => setW({ ...w, ordered: e.target.checked })} /> Enforce this order</label>

          <h4 className="wf-h">Kind</h4>
          <fieldset className="wf-after" aria-label="Kind">
            {STYLES.map((s) => (
              <label key={s}><input type="radio" name={`style-${w.id}`} checked={style === s} onChange={() => kind(s)} /> <strong>{STYLE_NAME[s]}</strong> <span className="faint">{STYLE_SAYS[s]}</span></label>
            ))}
          </fieldset>
          {style === 'checklist' ? (
            <>
              <h4 className="wf-h">Sub-tasks</h4>
              <fieldset className="wf-after" aria-label="Sub-tasks">
                {BUILDS.map((b) => (
                  <label key={b}><input type="radio" name={`build-${w.id}`} checked={build === b} onChange={() => setW({ ...w, build: b })} /> <strong>{BUILD_NAME[b]}</strong> <span className="faint">{BUILD_SAYS[b]}</span></label>
                ))}
              </fieldset>
              <h4 className="wf-h">What a build is held to <span className="faint">in the builder's instructions, and checked when it is built</span></h4>
              <ul className="list wf-checks" aria-label="What a build is held to">
                {list.map((r) => <li key={r.key}><label><input type="checkbox" checked={r.on} onChange={(e) => hold(r.key, e.target.checked)} /> <strong>{r.name}</strong> <span className="faint">{r.what}</span></label></li>)}
              </ul>
              <div className="faint" style={{ fontSize: 13, margin: '6px 0' }}>A task's own acceptance criteria are always on the list. To add a requirement or reword one: Settings › Landing.</div>
            </>
          ) : (
            <>
              <h4 className="wf-h">After the prototype is approved</h4>
              {hasPrototype ? (
                <fieldset className="wf-after" aria-label="After the prototype is approved">
                  {AFTERS.map((a) => (
                    <label key={a}><input type="radio" name={`after-${w.id}`} checked={after === a} onChange={() => choose(a)} /> <strong>{AFTER_NAME[a]}</strong> <span className="faint">{AFTER_SAYS[a]}</span></label>
                  ))}
                  {after === 'custom' && (
                    <ul className="list wf-checks">
                      {CHECKS.map((k) => <li key={k}><label title={step(k).what}><input type="checkbox" checked={run.includes(k)} onChange={(e) => toggle(k, e.target.checked)} /> {step(k).icon} {step(k).label}</label></li>)}
                    </ul>
                  )}
                </fieldset>
              ) : <div className="faint" style={{ fontSize: 13, marginBottom: 6 }}>Nothing but the plan and the build: this workflow has no prototype.</div>}
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn small" onClick={() => { onSave?.(w); setEditing(false) }}>Save</button>
            <button className="btn quiet small" onClick={() => { setW(normalize(workflow)); setEditing(false) }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}
