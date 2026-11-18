/**
 * An app's steps, as Settings › Skills will show them (LOG.md, "Steps, stages and probes: what was decided"): each
 * step in the order it happens, what it needs, what it leaves and what done means, then its stages. A stage says who
 * runs it (the engine, an agent, a person) and what is attached there: skills where an agent works, probes where the
 * engine verifies. Closed, a step is one line with what is attached; opened, the whole contract.
 * After GitHub Actions' run view (jobs in order, each opening to its steps) and Linear's workflow settings (one calm
 * row per state). It takes the place of "Skills by workflow step", the skills by job and the requirements list.
 * A reading view: Add and Remove appear only where something can be attached, and only when handlers are given.
 */
import { Badge } from './Badge'

export type StageKey = 'prepare' | 'do' | 'verify' | 'report'
export type By = 'engine' | 'agent' | 'person'
/** How a probe reaches its verdict: a command's exit code, the check's agent judging a sentence, a skill run by a fresh read-only agent, or one the engine brings. */
export type ProbeKind = 'command' | 'judged' | 'skill' | 'built-in'
export interface AttachedSkill { name: string; from: string; missing?: boolean }
export interface Probe { key: string; name: string; kind: ProbeKind; /** The command, the sentence judged, or the skill. */ runs: string; /** false: reported, and the pull request is not held. */ blocks: boolean }
export interface Stage { key: StageKey; by: By; what: string; skills?: AttachedSkill[]; probes?: Probe[] }
export interface StepContract { key: string; icon: string; label: string; needs: string[]; leaves: string[]; done: string; stages: Stage[] }
export interface StepGroup { title: string; steps: StepContract[] }

const STAGE: Record<StageKey, string> = { prepare: 'Prepare', do: 'Do', verify: 'Verify', report: 'Report' }
const BY: Record<By, string> = { engine: 'the engine', agent: 'an agent', person: 'you' }
const KIND: Record<ProbeKind, string> = { command: 'command', judged: 'judged', skill: 'skill as reviewer', 'built-in': 'built in' }

export interface StepContractsProps {
  groups: StepGroup[]
  /** Steps shown open; the rest are one line each. */
  open?: string[]
  onAddSkill?: (step: string, stage: StageKey) => void
  onRemoveSkill?: (step: string, stage: StageKey, name: string) => void
  onAddProbe?: (step: string) => void
  onRemoveProbe?: (step: string, key: string) => void
}

export function StepContracts({ groups, open = [], onAddSkill, onRemoveSkill, onAddProbe, onRemoveProbe }: StepContractsProps) {
  return (
    <div className="step-contracts" data-component="StepContracts">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="settings-h3">{g.title}</h3>
          {g.steps.map((s) => {
            const skills = s.stages.flatMap((t) => (t.skills ?? []).map((k) => ({ ...k, stage: t.key })))
            const probes = s.stages.flatMap((t) => t.probes ?? [])
            return (
              <details key={s.key} className="step-contract" open={open.includes(s.key)}>
                <summary aria-label={s.label}>
                  <span className="step-contract-name">{s.icon} {s.label}</span>
                  <span className="step-contract-attached">
                    {skills.map((k) => <span key={`${k.stage}:${k.name}`} className={`badge ${k.missing ? 'warn' : 'accent'}`} title={`${STAGE[k.stage]}: from ${k.from}`}>{STAGE[k.stage]} · {k.name}{k.missing ? ' · missing' : ''}</span>)}
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
                  {s.stages.map((t) => (
                    <li key={t.key} aria-label={`${s.label}, ${STAGE[t.key]}`}>
                      <div className="step-stage-head"><strong>{STAGE[t.key]}</strong><span className="faint">{BY[t.by]}</span></div>
                      <div className="step-stage-what">
                        <span>{t.what}</span>
                        {t.by === 'agent' && (t.skills?.length || onAddSkill) ? (
                          <div className="step-stage-attached">
                            {(t.skills ?? []).map((k) => (
                              <span key={k.name} className={`badge ${k.missing ? 'warn' : 'accent'}`} title={k.missing ? 'This skill is no longer there, so it is not used.' : `From ${k.from}. The agent is told to use it here, and the run records that it did.`}>
                                {k.name}{k.missing ? ' · missing' : ''}
                                {onRemoveSkill && <button type="button" className="linkish" aria-label={`Remove ${k.name} from ${s.label}, ${STAGE[t.key]}`} onClick={() => onRemoveSkill(s.key, t.key, k.name)}>✕</button>}
                              </span>
                            ))}
                            {onAddSkill && <button type="button" className="linkish small" aria-label={`Add a skill to ${s.label}, ${STAGE[t.key]}`} onClick={() => onAddSkill(s.key, t.key)}>Add a skill</button>}
                          </div>
                        ) : null}
                        {t.key === 'verify' && (t.probes?.length || onAddProbe) ? (
                          <table className="step-probes">
                            <tbody>
                              {(t.probes ?? []).map((p) => (
                                <tr key={p.key}>
                                  <td>{p.name}</td>
                                  <td className="faint">{KIND[p.kind]}</td>
                                  <td className={p.kind === 'command' || p.kind === 'skill' ? 'mono' : undefined}>{p.runs}</td>
                                  <td><Badge tone={p.blocks ? 'warn' : undefined}>{p.blocks ? 'blocks' : 'reports'}</Badge></td>
                                  {onRemoveProbe && <td><button type="button" className="linkish" aria-label={`Remove the probe ${p.name}`} onClick={() => onRemoveProbe(s.key, p.key)}>✕</button></td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                        {t.key === 'verify' && onAddProbe && <button type="button" className="linkish small" aria-label={`Add a probe to ${s.label}`} onClick={() => onAddProbe(s.key)}>Add a probe</button>}
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )
          })}
        </section>
      ))}
    </div>
  )
}
