/**
 * The merge guide: the top of a pull request, for whoever approves it (Sandy, 2026-11-13: "an explanation of what's
 * been built, what the risks are, decisions we made … really easy for someone who's actually approving this thing to
 * be able to understand and act on"). It is put together from what the task already holds, so nothing in it is
 * written for the occasion: what the task is for (its description), how we know it is done (its acceptance criteria
 * and the build's mark on each), what was decided (the ADR's summary and the planner's decisions), what could break
 * and how we would know (the blast radius's summary), and what is not in it.
 *
 * After a pull request template's "What / Why / How to test / Risks" and a release note's "known issues": short, the
 * same headings every time, the thing to act on first.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { decision, issue, stepWork } from './db/schema.js'
import { acceptanceOf, type Criterion } from './acceptance.js'
import { coveredLines, type Covered } from './requirements.js'

export interface GuideTask {
  identifier: string; title: string; description?: string | null
  acceptance: Criterion[]
  /** The draft ADR and the blast radius: the summary written for a person, else the one-line verdict. */
  adr?: string | null; risk?: string | null
  decisions: { question: string; chosen: string; why?: string | null }[]
  /** Sub-tasks not landed yet. */
  pending: string[]
  /** How the plan covers what the app requires of every plan (requirements.ts). */
  requirements?: Covered[]
  /** The merge checklist, written by the last step before the build (checks.ts, final): one item per line. */
  checklist?: string | null
}

const one = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number) => { const t = one(s); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t }
const bullets = (s: string) => s.trim().split('\n').map((l) => l.trimEnd()).filter(Boolean).map((l) => (/^\s*([-*]|\d+\.)\s/.test(l) ? l : `- ${l}`)).join('\n')
const count = (n: number, one_: string, many: string) => `${n} ${n === 1 ? one_ : many}`

/**
 * The most one task's guide may be, in characters: about a screen (Sandy, 2026-11-16: "The merge guide is way way too
 * long … The point is to make a reviewer faster"; one ran to 13,000). Everything it leaves out is in the record below
 * it, folded away. Enforced here and by a test, not asked of anyone.
 */
export const GUIDE_MAX = 1500

/**
 * One task's part of the guide: what to act on, and no more. The criteria the build met are a count, not a list; the
 * ones that are not met, or that only a person can judge, are listed. Three decisions, one line of risk. Pure.
 */
export function taskGuide(t: GuideTask, opts: { heading?: boolean } = {}): string {
  const met = t.acceptance.filter((c) => c.built === true)
  const unmet = t.acceptance.filter((c) => c.built === false)
  const open = t.acceptance.filter((c) => c.built === undefined)
  const all = t.acceptance.length
  const act = [
    t.pending.length ? `**Not finished:** ${count(t.pending.length, 'sub-task', 'sub-tasks')} still to land (${clip(t.pending.join(', '), 80)}).` : '',
    unmet.length ? `**${unmet.length} of ${count(all, 'acceptance criterion is', 'acceptance criteria are')} not met.**` : '',
    !all ? 'This task has no acceptance criteria, so nothing was checked against a list.'
      : !unmet.length && !open.length ? `All ${count(all, 'acceptance criterion was', 'acceptance criteria were')} checked against the build and met.`
      : !met.length && !unmet.length && !open.some((c) => c.builtEvidence) ? `The ${count(all, 'acceptance criterion has', 'acceptance criteria have')} not been checked against the build yet.`
      : `${met.length} of ${all} acceptance criteria were checked against the build and met.${open.length ? ` ${count(open.length, 'is', 'are')} left for you.` : ''}`,
  ].filter(Boolean).join(' ')
  const row = (c: Criterion) => c.built === false
    ? `- ❌ ${clip(c.text, 110)}${c.builtEvidence ? ` Missing: ${clip(c.builtEvidence, 110)}` : ''}`
    : `- ⬜ ${clip(c.text, 110)}${c.builtEvidence || c.check ? ` ${c.builtEvidence ? '' : 'How: '}${clip(c.builtEvidence ?? c.check!, 110)}` : ''}`
  const listed = [...unmet, ...open]
  const mine = (t.checklist ?? '').split('\n').map((l) => l.trim().replace(/^([-*]|\d+\.)\s+(\[.\]\s*)?/, '')).filter(Boolean)
  const firstLine = (s?: string | null) => (s ?? '').split('\n').map((l) => l.replace(/^\s*([-*]|\d+\.)\s+/, '').trim()).find(Boolean) ?? ''
  const build = (n: { rows: number; boxes: number; decisions: number; risk: boolean; needs: boolean; what: number }) => [
    opts.heading ? `### ${t.identifier} ${clip(t.title, 90)}` : '',
    act,
    t.description?.trim() && n.what ? `**What it does:** ${clip(t.description, n.what)}` : '',
    mine.length && n.boxes ? `**Before you merge**\n\n${mine.slice(0, n.boxes).map((l) => `- [ ] ${clip(l, 120)}`).join('\n')}${mine.length > n.boxes ? `\n- and ${mine.length - n.boxes} more in the record below` : ''}` : '',
    listed.length && n.rows ? `**For you to check**\n\n${listed.slice(0, n.rows).map(row).join('\n')}${listed.length > n.rows ? `\n- and ${listed.length - n.rows} more in the record below` : ''}` : '',
    t.decisions.length && n.decisions ? `**Decisions**\n\n${t.decisions.slice(0, n.decisions).map((d) => `- ${clip(d.question, 70)} → **${clip(d.chosen, 90)}**`).join('\n')}${t.decisions.length > n.decisions ? `\n- and ${t.decisions.length - n.decisions} more in the record below` : ''}` : '',
    firstLine(t.risk) && n.risk ? `**Risk:** ${clip(firstLine(t.risk), 200)}` : '',
    t.requirements?.length && n.needs ? `**Required of every change:** ${t.requirements.map((c) => `${!c.how ? '⬜' : c.applies ? '✅' : '➖'} ${c.name}`).join(' · ')}` : '',
  ].filter(Boolean).join('\n\n')
  // From the fullest that fits to the leanest: what is cut first is what matters least to someone about to merge.
  const tries = [
    { rows: 5, boxes: 4, decisions: 3, risk: true, needs: true, what: 280 }, { rows: 4, boxes: 3, decisions: 3, risk: true, needs: true, what: 240 },
    { rows: 4, boxes: 3, decisions: 2, risk: true, needs: false, what: 200 }, { rows: 3, boxes: 2, decisions: 1, risk: true, needs: false, what: 160 },
    { rows: 3, boxes: 2, decisions: 0, risk: true, needs: false, what: 120 }, { rows: 2, boxes: 1, decisions: 0, risk: false, needs: false, what: 100 },
    { rows: 1, boxes: 0, decisions: 0, risk: false, needs: false, what: 0 },
  ]
  for (const n of tries) { const g = build(n); if (g.length <= GUIDE_MAX) return g }
  return build(tries[tries.length - 1]).slice(0, GUIDE_MAX - 1) + '…'
}

/** Everything the guide left out, for one task: every criterion with its mark, every decision with its reason, the risks, the requirements. */
export function taskRecord(t: GuideTask, opts: { heading?: boolean } = {}): string {
  const met = t.acceptance.filter((c) => c.built === true)
  const unmet = t.acceptance.filter((c) => c.built === false)
  const open = t.acceptance.filter((c) => c.built === undefined)
  const row = (c: Criterion) => {
    const mark = c.built === true ? '✅' : c.built === false ? '❌' : '⬜'
    const how = c.builtEvidence ? ` ${c.built === false ? 'Missing' : c.built === true ? 'Seen' : 'For a person'}: ${one(c.builtEvidence)}` : c.check ? ` How to check: ${one(c.check)}` : ''
    return `- ${mark} ${one(c.text)}.${how}`.replace(/\.\./g, '.')
  }
  return [
    opts.heading ? `### ${t.identifier} ${t.title}` : '',
    t.checklist?.trim() ? `**Before you merge**\n\n${t.checklist.trim().split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `- [ ] ${l.replace(/^([-*]|\d+\.)\s+(\[.\]\s*)?/, '')}`).join('\n')}` : '',
    t.description?.trim() ? `**What it does**\n\n${t.description.trim()}` : '',
    t.acceptance.length ? `**Every acceptance criterion**\n\n${[...unmet, ...open, ...met].map(row).join('\n')}` : '',
    t.adr?.trim() || t.decisions.length ? `**Decisions made**\n\n${[t.adr?.trim() ? bullets(t.adr) : '', ...t.decisions.map((d) => `- ${one(d.question)} → **${one(d.chosen)}**${d.why?.trim() ? `. ${one(d.why)}` : ''}`)].filter(Boolean).join('\n')}` : '',
    t.risk?.trim() ? `**Risks, and how we would know**\n\n${bullets(t.risk)}` : '',
    t.requirements?.length ? `**What this app requires of every change**\n\n${coveredLines(t.requirements)}` : '',
  ].filter(Boolean).join('\n\n')
}

/** The guide for a pull request of one task or several (a project's). Empty when there is nothing to say. */
export function mergeGuide(tasks: GuideTask[]): string {
  if (!tasks.length) return ''
  return ['## Merge guide', ...tasks.map((t) => taskGuide(t, { heading: tasks.length > 1 })), '**To undo:** revert this pull request.'].join('\n\n')
}

/** The record under the guide: all of it, for whoever wants to look something up. */
export function mergeRecord(tasks: GuideTask[]): string {
  return tasks.map((t) => taskRecord(t, { heading: tasks.length > 1 })).filter(Boolean).join('\n\n')
}

/** What the guide is made from, for these tasks, as stored. */
export async function guideTasks(tasks: { id: string; identifier: string; title: string }[], pending: { parentId: string | null; identifier: string }[] = []): Promise<GuideTask[]> {
  if (!tasks.length) return []
  const ids = tasks.map((t) => t.id)
  const rows = await db.select().from(issue).where(inArray(issue.id, ids))
  const subs = await db.select({ id: issue.id, parentId: issue.parentId }).from(issue).where(inArray(issue.parentId, ids))
  const steps = await db.select().from(stepWork).where(and(inArray(stepWork.issueId, ids), inArray(stepWork.key, ['adr', 'risk', 'final'])))
  const decided = await db.select().from(decision).where(and(inArray(decision.issueId, [...ids, ...subs.map((s) => s.id)]), isNotNull(decision.chosen)))
  return tasks.map((t) => {
    const i = rows.find((r) => r.id === t.id)
    const mine = new Set([t.id, ...subs.filter((s) => s.parentId === t.id).map((s) => s.id)])
    const said = (key: string) => { const w = steps.find((s) => s.issueId === t.id && s.key === key); return w?.summary?.trim() || w?.detail?.trim() || null }
    return {
      identifier: t.identifier, title: t.title, description: i?.description, acceptance: i ? acceptanceOf(i) : [], adr: said('adr'), risk: said('risk'),
      decisions: decided.filter((d) => d.issueId && mine.has(d.issueId)).map((d) => ({ question: d.question, chosen: (d.options as { key: string; text: string }[] | null)?.find((o) => o.key === d.chosen)?.text ?? d.chosen!, why: d.rationale })),
      pending: pending.filter((p) => p.parentId === t.id).map((p) => p.identifier),
      requirements: i?.requirements ?? undefined,
      checklist: steps.find((x) => x.issueId === t.id && x.key === 'final' && x.status === 'done')?.summary ?? null,
    }
  })
}

/** One task's guide and its record, as the task's page shows them before there is a pull request. */
export async function mergeGuideOf(issueId: string, identifier: string, title: string, pending: string[] = []) {
  const [t] = await guideTasks([{ id: issueId, identifier, title }])
  return mergeGuide([{ ...t, pending }])
}
export async function mergeGuideAndRecord(issueId: string, identifier: string, title: string, pending: string[] = []) {
  const [t] = await guideTasks([{ id: issueId, identifier, title }])
  return { guide: mergeGuide([{ ...t, pending }]), record: mergeRecord([{ ...t, pending }]) }
}
