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
import { useState } from 'react'
import type { ProbeChange, ProbeView, StageKey, StepGroup } from '@self-evident/engine/contracts'
import { Badge } from './Badge'

const STAGE: Record<StageKey, string> = { prepare: 'Prepare', do: 'Do', verify: 'Verify', report: 'Report' }
const BY = { engine: 'the engine', agent: 'an agent', person: 'you' }
const KIND: Record<ProbeView['kind'], string> = { command: 'command', judged: 'judged', skill: 'skill as reviewer', 'built-in': 'built in' }

export interface StepContractsProps {
  groups: StepGroup[]
  /** Steps shown open; the rest are one line each. */
  open?: string[]
  /** The skills that can be attached, when the page is being changed. */
  usable?: { name: string; label: string; from: string }[]
  /** A step's skills, as they are after a change. */
  onSkills?: (step: string, names: string[]) => void
  onProbe?: (change: ProbeChange) => void
}

export function StepContracts({ groups, open = [], usable = [], onSkills, onProbe }: StepContractsProps) {
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
                          {t.probes ? <Probes step={s.label} probes={t.probes} onProbe={onProbe} /> : null}
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

type Draft = { name: string; kind: 'command' | 'skill' | 'judged'; runs: string; blocks: boolean }
const HINT = { command: 'a shell command; exit 0 passes, e.g. pnpm lint', skill: 'a skill this app\'s agents have, e.g. security-review', judged: 'a sentence the check\'s agent can judge' }
const NEW: Draft = { name: '', kind: 'command', runs: '', blocks: true }

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
function ProbeForm({ start, editing, onSave, onCancel }: { start: Draft; editing?: string; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(start)
  const ready = draft.name.trim() && draft.runs.trim()
  return (
    <form className="step-probe-add" aria-label={editing ? `Edit ${editing}` : 'Add a probe'} onSubmit={(e) => { e.preventDefault(); if (ready) onSave(draft) }}>
      <input aria-label="Probe name" placeholder="Name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      {editing ? <span className="faint">{KIND[draft.kind]}</span> : <select aria-label="Probe kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
        <option value="command">Command</option><option value="skill">Skill as reviewer</option><option value="judged">Judged</option>
      </select>}
      <input aria-label="What it runs" className={draft.kind === 'judged' ? undefined : 'mono'} placeholder={HINT[draft.kind]} value={draft.runs} onChange={(e) => setDraft({ ...draft, runs: e.target.value })} />
      <Blocks label="When it fails" value={draft.blocks} onChange={(blocks) => setDraft({ ...draft, blocks })} />
      <button type="submit" className="small" disabled={!ready}>{editing ? 'Save' : 'Add'}</button>
      <button type="button" className="linkish small" onClick={onCancel}>Cancel</button>
    </form>
  )
}

/** What a build is held to: one row each, in the order it is verified. Being changed: switched, set to block or to report only, edited (the app's own), removed, added to. */
function Probes({ step, probes, onProbe }: { step: string; probes: ProbeView[]; onProbe?: (change: ProbeChange) => void }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <table className="step-probes">
        <tbody>
          {probes.map((p) => onProbe && editing === p.key && p.kind !== 'built-in' ? (
            <tr key={p.key}><td colSpan={6}>
              <ProbeForm editing={p.name} start={{ name: p.name, kind: p.kind, runs: p.runs, blocks: p.blocks }} onCancel={() => setEditing(null)} onSave={(d) => {
                onProbe({ op: 'edit', key: p.key, name: d.name, runs: d.runs, ...(d.blocks !== p.blocks ? { blocks: d.blocks } : {}) }) // one change: two would each start from the same settings
                setEditing(null)
              }} />
            </td></tr>
          ) : (
            <tr key={p.key} className={p.on ? undefined : 'off'} title={p.fixed}>
              {onProbe && <td><input type="checkbox" aria-label={`Run ${p.name}`} checked={p.on} disabled={!!p.fixed} onChange={(e) => onProbe({ op: 'on', key: p.key, on: e.target.checked })} /></td>}
              <td>{p.name}</td>
              <td className="faint">{KIND[p.kind]}</td>
              <td className={p.kind === 'command' || p.kind === 'skill' ? 'mono' : undefined}>{p.runs}</td>
              <td>{onProbe && p.key !== 'criteria'
                ? <Blocks label={`When ${p.name} fails`} value={p.blocks} disabled={!p.on} onChange={(blocks) => onProbe({ op: 'blocks', key: p.key, blocks })} />
                : !p.on ? <Badge>off</Badge> : <Badge tone={p.blocks ? 'warn' : undefined}>{p.blocks ? 'blocks' : 'reports'}</Badge>}</td>
              {onProbe && <td className="step-probe-acts">{p.own && <button type="button" className="linkish" aria-label={`Edit the probe ${p.name}`} onClick={() => { setEditing(p.key); setAdding(false) }}>Edit</button>}
                {p.own && !p.fixed && <button type="button" className="linkish" aria-label={`Remove the probe ${p.name}`} onClick={() => onProbe({ op: 'remove', key: p.key })}>✕</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {onProbe && !adding && <button type="button" className="linkish small" aria-label={`Add a probe to ${step}`} onClick={() => { setAdding(true); setEditing(null) }}>Add a probe</button>}
      {onProbe && adding && <ProbeForm start={NEW} onCancel={() => setAdding(false)} onSave={(d) => { onProbe({ op: 'add', name: d.name, kind: d.kind, runs: d.runs, ...(d.blocks ? {} : { blocks: false }) }); setAdding(false) }} />}
    </>
  )
}
