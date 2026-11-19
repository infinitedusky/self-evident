/**
 * An app's steps, as Settings › Skills shows them (LOG.md, 2026-11-18, "Steps, stages and probes"): each step in the
 * order it happens, what it needs, what it leaves and when it is done, then its stages. A stage says who runs it (the
 * engine, an agent, you) and what is attached there: skills where an agent works, probes where the engine verifies.
 * Closed, a step is one line with what is attached; opened, the whole contract. The contracts are the engine's
 * (`@self-evident/engine/contracts`); this draws them.
 * After GitHub Actions' run view (jobs in order, each opening to its steps) and Linear's workflow settings (one calm
 * row per state). It took the place of "Skills by workflow step", the skills by job and the requirements list.
 * A reading view until handlers are given: then skills are added and removed where an agent works, and probes are
 * switched, set to block or to report only, edited (the app's own), added and removed where the engine verifies,
 * and nowhere else.
 */
import { Fragment, useState } from 'react'
import type { ProbeChange, ProbeView, RunsWhen, StageKey, StepGroup } from '@self-evident/engine/contracts'
import { Badge } from './Badge'

const STAGE: Record<StageKey, string> = { prepare: 'Prepare', do: 'Do', verify: 'Verify', report: 'Report' }
const BY = { engine: 'the engine', agent: 'an agent', person: 'you' }
const KIND: Record<ProbeView['kind'], string> = { command: 'command', judged: 'judged', skill: 'skill as reviewer', 'built-in': 'built in' }
/** When a command is run, as the row and the form say it. After GitHub Actions' own three triggers: push, pull_request, schedule. */
const WHEN: Record<RunsWhen, string> = { build: 'Every build', pr: 'On the pull request (CI)', nightly: 'Nightly, on the default branch' }
const WHEN_KIND: Record<RunsWhen, string> = { build: 'command', pr: 'CI on the pull request', nightly: 'nightly' }
const kindOf = (p: ProbeView) => (p.when && p.when !== 'build' ? WHEN_KIND[p.when] : KIND[p.kind])

export interface StepContractsProps {
  groups: StepGroup[]
  /** Steps shown open; the rest are one line each. */
  open?: string[]
  /** The skills that can be attached, when the page is being changed. */
  usable?: { name: string; label: string; from: string }[]
  /** A step's skills, as they are after a change. */
  onSkills?: (step: string, names: string[]) => void
  onProbe?: (change: ProbeChange) => void
  /** A row its workflow switches (`from`): switched for that workflow, or (null) left to the app again. */
  onWorkflow?: (key: string, on: boolean | null) => void
  /** Each probe's latest trial on past work, by its key. */
  trials?: Record<string, TrialView>
  /** Try a probe, as the row shows it, on the app's last merged tasks; `tryOn` is how many there are (none: no Try). */
  onTry?: (p: ProbeView) => void
  tryOn?: number
  /** Each nightly check's last run, by its key. */
  nightly?: Record<string, NightView>
  /** The workflows the app's repository has: a nightly check picks one that runs on a schedule, one left to CI picks a job. */
  workflows?: WorkflowView[]
}
/** A nightly check's last word (the engine's nightly.ts). `ran` and `green` are said as times ("6 hours ago"). */
export interface NightView { status: 'passed' | 'failed' | 'none'; url?: string | null; ran?: string; failing: number; green?: string; error?: string | null }
export interface WorkflowView { file: string; name: string; scheduled: boolean; onPr: boolean; jobs: string[] }
/** A probe as it was when tried, and what it said of each merged task. */
export interface TrialView { status: 'running' | 'done' | 'failed'; runs: string; tasks: number; when?: string; costUsd?: string | null; error?: string | null; results: { identifier: string; title: string; pr: number | null; pass: boolean | null; evidence: string; findings: string[] }[] }

export function StepContracts({ groups, open = [], usable = [], onSkills, onProbe, onWorkflow, trials = {}, onTry, tryOn = 0, nightly = {}, workflows = [] }: StepContractsProps) {
  return (
    <div className="step-contracts" data-component="StepContracts">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="settings-h3">{g.title}</h3>
          {g.steps.map((s) => {
            const skills = s.stages.flatMap((t) => (t.skills ?? []).map((k) => ({ ...k, stage: t.key })))
            const probes = s.stages.flatMap((t) => t.probes ?? []).filter((p) => p.on)
            return (
              <details key={s.key} className="step-contract" open={open.includes(s.key) || undefined}>
                <summary aria-label={s.label}>
                  <span className="step-contract-name">{s.icon} {s.label}</span>
                  <span className="step-contract-attached">
                    {skills.map((k) => <span key={`${k.stage}:${k.name}`} className={`badge ${k.missing ? 'warn' : 'accent'}`} title={`${STAGE[k.stage]}${k.from ? `: from ${k.from}` : ''}`}>{STAGE[k.stage]} · {k.label}{k.missing ? ' · missing' : ''}</span>)}
                    {probes.length > 0 && <Badge>{probes.length} probe{probes.length === 1 ? '' : 's'}</Badge>}
                    {!skills.length && !probes.length && <span className="faint">nothing attached</span>}
                  </span>
                </summary>
                <dl className="fields step-contract-body">
                  <dt>Needs</dt><dd>{s.needs.join(' · ')}</dd>
                  <dt>Leaves</dt><dd>{s.leaves.join(' · ')}</dd>
                  <dt>Done when</dt><dd>{s.done}</dd>
                </dl>
                <ol className="step-stages">
                  {s.stages.map((t) => {
                    const chosen = (t.skills ?? []).filter((k) => !k.fixed).map((k) => k.name)
                    const rest = usable.filter((u) => !(t.skills ?? []).some((k) => k.name === u.name))
                    return (
                      <li key={t.key} aria-label={`${s.label}, ${STAGE[t.key]}`}>
                        <div className="step-stage-head"><strong>{STAGE[t.key]}</strong><span className="faint">{BY[t.by]}</span></div>
                        <div className="step-stage-what">
                          <span>{t.what}</span>
                          {t.skills && (t.skills.length > 0 || (onSkills && rest.length > 0)) ? (
                            <div className="step-stage-attached">
                              {t.skills.map((k) => (
                                <span key={k.name} className={`badge ${k.missing ? 'warn' : 'accent'}`} title={k.missing ? 'This app\'s agents no longer have this skill, so it is not used.' : `${k.from ? `From ${k.from}. ` : ''}The agent is told to use it here, and the run records whether it did.`}>
                                  {k.label}{k.missing ? ' · missing' : ''}
                                  {onSkills && !k.fixed && <button type="button" className="linkish" aria-label={`Remove ${k.label} from ${s.label}, ${STAGE[t.key]}`} onClick={() => onSkills(s.key, chosen.filter((n) => n !== k.name))}>✕</button>}
                                </span>
                              ))}
                              {onSkills && rest.length > 0 && <select className="small" aria-label={`Add a skill to ${s.label}, ${STAGE[t.key]}`} value="" onChange={(e) => { if (e.target.value) onSkills(s.key, [...chosen, e.target.value]) }}>
                                <option value="">Add a skill…</option>
                                {rest.map((u) => <option key={u.name} value={u.name}>{u.label} ({u.from})</option>)}
                              </select>}
                            </div>
                          ) : null}
                          {t.probes ? <Probes step={s.label} probes={t.probes} onProbe={onProbe} onWorkflow={onWorkflow} trials={trials} onTry={onTry} tryOn={tryOn} nightly={nightly} workflows={workflows} /> : null}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </details>
            )
          })}
        </section>
      ))}
    </div>
  )
}

type Draft = { name: string; kind: 'command' | 'skill' | 'judged'; runs: string; blocks: boolean; when: RunsWhen }
const HINT = { command: 'a shell command; exit 0 passes, e.g. pnpm lint', skill: 'a skill this app\'s agents have, e.g. security-review', judged: 'a sentence the check\'s agent can judge' }
const HINT_WHEN = { pr: 'the check\'s name on the pull request, e.g. smoke', nightly: 'the workflow\'s file, e.g. nightly.yml' }
const NEW: Draft = { name: '', kind: 'command', runs: '', blocks: true, when: 'build' }

/** Blocks or reports, said in full where it is chosen. */
function Blocks({ label, value, disabled, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (blocks: boolean) => void }) {
  return (
    <select className="small" aria-label={label} title={value ? 'Blocks: a failure goes back to a builder.' : 'Reports: a failure is said, and nothing is held.'} value={value ? 'blocks' : 'reports'} disabled={disabled} onChange={(e) => onChange(e.target.value === 'blocks')}>
      <option value="blocks">Blocks</option>
      <option value="reports">Reports</option>
    </select>
  )
}

/** One probe's fields, for a new one and for one being edited (its kind stays what it was). */
function ProbeForm({ start, editing, named = true, timed = true, workflows = [], onSave, onCancel }: { start: Draft; editing?: string; /** false: its name is the engine's (the test command). */ named?: boolean; /** false: it is run on every build and that is not a choice (the test command). */ timed?: boolean; workflows?: WorkflowView[]; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(start)
  const ready = draft.name.trim() && draft.runs.trim()
  const when = draft.kind === 'command' && timed ? draft.when : 'build'
  // What there is to pick: a nightly check, the workflows that run on a schedule; one left to CI, the jobs of the ones that run on pull requests.
  const picks = when === 'nightly' ? workflows.filter((w) => w.scheduled).map((w) => ({ value: w.file, label: w.name === w.file ? w.file : `${w.name} (${w.file})` }))
    : when === 'pr' ? [...new Set(workflows.filter((w) => w.onPr).flatMap((w) => w.jobs))].map((j) => ({ value: j, label: j })) : []
  const known = picks.some((x) => x.value === draft.runs)
  return (
    <form className="step-probe-add" aria-label={editing ? `Edit ${editing}` : 'Add a probe'} onSubmit={(e) => { e.preventDefault(); if (ready) onSave(draft) }}>
      {named ? <input aria-label="Probe name" placeholder="Name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : <strong>{draft.name}</strong>}
      {editing ? <span className="faint">{KIND[draft.kind]}</span> : <select aria-label="Probe kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
        <option value="command">Command</option><option value="skill">Skill as reviewer</option><option value="judged">Judged</option>
      </select>}
      {draft.kind === 'command' && timed && <select aria-label="When it runs" value={when} onChange={(e) => { const w = e.target.value as RunsWhen; setDraft({ ...draft, when: w, runs: w === start.when ? start.runs : '', ...(w === 'nightly' ? { blocks: false } : {}) }) }}>
        {(Object.keys(WHEN) as RunsWhen[]).map((w) => <option key={w} value={w}>{WHEN[w]}</option>)}
      </select>}
      {when !== 'build' && picks.length > 0 && (known || !draft.runs)
        ? <select aria-label={when === 'nightly' ? 'The workflow that runs it' : 'Its check on the pull request'} className="mono" value={draft.runs} onChange={(e) => setDraft({ ...draft, runs: e.target.value })}>
            <option value="">{when === 'nightly' ? 'Pick a workflow…' : 'Pick a check…'}</option>
            {picks.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        : <input aria-label={when === 'nightly' ? 'The workflow that runs it' : when === 'pr' ? 'Its check on the pull request' : 'What it runs'} className={draft.kind === 'judged' ? undefined : 'mono'} placeholder={when === 'build' ? HINT[draft.kind] : HINT_WHEN[when]} value={draft.runs} onChange={(e) => setDraft({ ...draft, runs: e.target.value })} />}
      <Blocks label="When it fails" value={when === 'nightly' ? false : draft.blocks} disabled={when === 'nightly'} onChange={(blocks) => setDraft({ ...draft, blocks })} />
      <button type="submit" className="small" disabled={!ready}>{editing ? 'Save' : 'Add'}</button>
      <button type="button" className="linkish small" onClick={onCancel}>Cancel</button>
      {when === 'nightly' && <p className="faint step-probe-says">The repository runs it on a schedule; nothing here does, and nothing waits for it. A red run shows under what needs you.{picks.length === 0 ? ' No workflow in this repository runs on a schedule yet: add one with schedule: in .github/workflows and it can be picked here.' : ''}</p>}
      {when === 'pr' && <p className="faint step-probe-says">The repository's CI runs it on the pull request; no step here does.{draft.blocks ? ' A task is not closed while it is failing there.' : ''}</p>}
    </form>
  )
}

/**
 * What a build is held to: one row each, in the order it is verified. Being changed, every row but the acceptance
 * criteria can be switched and set to block or to report only; all but the engine's own probes can be reworded; one
 * the app has changed can be put back as the engine ships it; the app's own can be removed, and added to.
 */
/**
 * What a probe said of past work, under its row: one line, opening to each task. After a CI run's summary line
 * (GitHub Actions: "4 passed, 1 failed", then the jobs). All of the tasks were merged, so a fail is the probe
 * disagreeing with what was shipped.
 */
function TrialLine({ p, t }: { p: ProbeView; t: TrialView }) {
  const pass = t.results.filter((r) => r.pass === true).length, fail = t.results.filter((r) => r.pass === false).length, none = t.results.length - pass - fail
  const stale = t.runs !== p.runs
  const head = t.status === 'running' ? `Trying it on ${t.tasks} merged task${t.tasks === 1 ? '' : 's'}: ${t.results.length} done…`
    : `Tried on ${t.results.length} merged task${t.results.length === 1 ? '' : 's'}: ${pass} pass${fail ? `, ${fail} fail` : ''}${none ? `, ${none} not run` : ''}`
  return (
    <details className="step-probe-trial" aria-label={`Trial of ${p.name}`}>
      <summary><span className={fail ? 'trial-fail' : undefined}>{head}</span><span className="faint">{t.when ? ` · ${t.when}` : ''}{stale ? ' · before it was changed' : ''}{t.costUsd ? ` · $${t.costUsd}` : ''}{t.status === 'failed' ? ` · stopped: ${t.error ?? 'it failed'}` : ''}</span></summary>
      <ul>
        {t.results.map((r) => (
          <li key={r.identifier}>
            <span aria-label={r.pass === true ? 'passed' : r.pass === false ? 'failed' : 'not run'}>{r.pass === true ? '✓' : r.pass === false ? '✗' : '–'}</span> <strong>{r.identifier}</strong> {r.title}{r.pr ? <span className="faint"> · #{r.pr}</span> : null}
            {(r.findings.length > 0 || (r.pass !== true && r.evidence)) && <div className="muted">{r.findings.length ? r.findings.join(' · ') : r.evidence}</div>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** A nightly check's last run, under its row: one line. After a CI badge (passing, failing) with the run one click away. */
function NightLine({ p, n }: { p: ProbeView; n?: NightView }) {
  const run = n?.url ? <> · <a href={n.url} target="_blank" rel="noreferrer">Open the run</a></> : null
  return (
    <div className="step-probe-night" aria-label={`Last run of ${p.name}`}>
      {!n ? <span className="faint">Not read from GitHub yet.</span>
        : n.status === 'failed' ? <><span className="trial-fail">{n.failing > 1 ? `Failed ${n.failing} runs in a row` : 'The last run failed'}</span><span className="faint">{n.ran ? ` · ${n.ran}` : ''}{n.green ? ` · last passed ${n.green}` : ' · it has not passed yet'}{run}</span></>
        : n.status === 'passed' ? <><span>The last run passed</span><span className="faint">{n.ran ? ` · ${n.ran}` : ''}{run}</span></>
        : <span className="faint">{n.error ? `It could not be read from GitHub: ${n.error}` : 'No run on the default branch yet.'}</span>}
    </div>
  )
}

function Probes({ step, probes, onProbe, onWorkflow, trials = {}, onTry, tryOn = 0, nightly = {}, workflows = [] }: { step: string; probes: ProbeView[]; onProbe?: (change: ProbeChange) => void; onWorkflow?: (key: string, on: boolean | null) => void; trials?: Record<string, TrialView>; onTry?: (p: ProbeView) => void; tryOn?: number; nightly?: Record<string, NightView>; workflows?: WorkflowView[] }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const unset = (p: ProbeView) => p.key === 'tests' && !p.runs // the test command, before there is one
  const said = (p: ProbeView) => (p.key === 'tests' ? 'the test command' : p.name) // a sentence can be named Tests too
  return (
    <>
      <table className="step-probes">
        <tbody>
          {probes.map((p) => onProbe && editing === p.key && p.kind !== 'built-in' ? (
            <tr key={p.key}><td colSpan={6}>
              <ProbeForm editing={p.name} named={p.key !== 'tests'} timed={p.own} workflows={workflows} start={{ name: p.name, kind: p.kind, runs: p.runs, blocks: p.blocks, when: p.when ?? 'build' }} onCancel={() => setEditing(null)} onSave={(d) => {
                onProbe({ op: 'edit', key: p.key, name: d.name, runs: d.runs, ...(d.blocks !== p.blocks ? { blocks: d.blocks } : {}), ...(d.when !== (p.when ?? 'build') ? { when: d.when } : {}) }) // one change: two would each start from the same settings
                setEditing(null)
              }} />
            </td></tr>
          ) : (<Fragment key={p.key}>
            <tr className={p.on ? undefined : 'off'} title={p.fixed ?? (p.from ? `The ${p.from} workflow switches this ${p.on ? 'on' : 'off'} for its tasks.` : undefined)}>
              {onProbe && <td><input type="checkbox" aria-label={`Run ${said(p)}`} checked={p.on} disabled={!!p.fixed || unset(p)} onChange={(e) => (p.from && onWorkflow ? onWorkflow(p.key, e.target.checked) : onProbe({ op: 'on', key: p.key, on: e.target.checked }))} /></td>}
              <td>{p.name}{p.from && <span className="faint step-probe-from"> · from {p.from}{onWorkflow && <button type="button" className="linkish" aria-label={`Leave ${p.name} to the app, not the ${p.from} workflow`} title="Leave it to the app's own setting" onClick={() => onWorkflow(p.key, null)}>✕</button>}</span>}</td>
              <td className="faint">{kindOf(p)}</td>
              <td className={p.kind === 'command' || p.kind === 'skill' ? 'mono' : undefined}>{unset(p) ? <span className="faint" style={{ fontFamily: 'inherit' }}>no test command yet</span> : p.runs}</td>
              <td>{onProbe && !p.fixed && !unset(p) && p.when !== 'nightly'
                ? <Blocks label={`When ${said(p)} fails`} value={p.blocks} disabled={!p.on} onChange={(blocks) => onProbe({ op: 'blocks', key: p.key, blocks })} />
                : !p.on ? <Badge>off</Badge> : <Badge tone={p.blocks ? 'warn' : undefined}>{p.blocks ? 'blocks' : 'reports'}</Badge>}</td>
              {onProbe && <td className="step-probe-acts">
                {p.editable && <button type="button" className="linkish" aria-label={unset(p) ? 'Set the test command' : p.key === 'tests' ? 'Edit the test command' : `Edit the probe ${p.name}`} onClick={() => { setEditing(p.key); setAdding(false) }}>{unset(p) ? 'Set' : 'Edit'}</button>}
                {onTry && tryOn > 0 && p.on && !unset(p) && !p.fixed && (p.when ?? 'build') === 'build' && <button type="button" className="linkish" disabled={trials[p.key]?.status === 'running'} aria-label={`Try ${said(p)} on past work`}
                  title={p.kind === 'command' ? `Runs it on the last ${tryOn} merged task${tryOn === 1 ? '' : 's'}. Nothing is changed and it costs nothing.` : `An agent reads each of the last ${tryOn} merged task${tryOn === 1 ? '' : 's'}. Nothing is changed.`}
                  onClick={() => onTry(p)}>{p.kind === 'command' ? 'Try' : `Try (${tryOn} agent run${tryOn === 1 ? '' : 's'})`}</button>}
                {p.changed && <button type="button" className="linkish" aria-label={`Put ${p.name} back as the engine ships it`} title="Back to the default" onClick={() => onProbe({ op: 'reset', key: p.key })}>Reset</button>}
                {(p.own || (p.key === 'tests' && !unset(p))) && <button type="button" className="linkish" aria-label={p.key === 'tests' ? 'Clear the test command' : `Remove the probe ${p.name}`} onClick={() => onProbe({ op: 'remove', key: p.key })}>✕</button>}
              </td>}
            </tr>
            {p.when === 'nightly' && p.on && <tr className="step-probe-trial-row"><td colSpan={6}><NightLine p={p} n={nightly[p.key]} /></td></tr>}
            {trials[p.key] && <tr className="step-probe-trial-row"><td colSpan={6}><TrialLine p={p} t={trials[p.key]} /></td></tr>}
          </Fragment>))}
        </tbody>
      </table>
      {onProbe && !adding && <button type="button" className="linkish small" aria-label={`Add a probe to ${step}`} onClick={() => { setAdding(true); setEditing(null) }}>Add a probe</button>}
      {onProbe && adding && <ProbeForm start={NEW} workflows={workflows} onCancel={() => setAdding(false)} onSave={(d) => { const when = d.kind === 'command' ? d.when : 'build'; onProbe({ op: 'add', name: d.name, kind: d.kind, runs: d.runs, ...(d.blocks && when !== 'nightly' ? {} : { blocks: false }), ...(when !== 'build' ? { when } : {}) }); setAdding(false) }} />}
    </>
  )
}
