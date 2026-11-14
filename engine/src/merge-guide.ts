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
}

const one = (s: string) => s.replace(/\s+/g, ' ').trim()
const bullets = (s: string) => s.trim().split('\n').map((l) => l.trimEnd()).filter(Boolean).map((l) => (/^\s*([-*]|\d+\.)\s/.test(l) ? l : `- ${l}`)).join('\n')

/** One task's part of the guide. Pure: tested without a database. */
export function taskGuide(t: GuideTask, opts: { heading?: boolean } = {}): string {
  const met = t.acceptance.filter((c) => c.built === true)
  const unmet = t.acceptance.filter((c) => c.built === false)
  const open = t.acceptance.filter((c) => c.built === undefined)
  const act = [
    unmet.length ? `**${unmet.length} acceptance ${unmet.length === 1 ? 'criterion is' : 'criteria are'} not met.** See "How to check it".` : '',
    t.pending.length ? `**Not finished:** ${t.pending.length} sub-task${t.pending.length === 1 ? '' : 's'} still to land (${t.pending.join(', ')}).` : '',
    !unmet.length && !t.pending.length && open.length ? `${open.length} acceptance ${open.length === 1 ? 'criterion has' : 'criteria have'} not been checked against the build yet.` : '',
    !unmet.length && !t.pending.length && !open.length && t.acceptance.length ? `All ${t.acceptance.length} acceptance criteria are met.` : '',
  ].filter(Boolean)
  const row = (c: Criterion) => {
    const mark = c.built === true ? '✅' : c.built === false ? '❌' : '⬜'
    const how = c.builtEvidence ? ` ${c.built === false ? 'Missing' : 'Seen'}: ${one(c.builtEvidence)}` : c.check ? ` How to check: ${one(c.check)}` : ''
    return `- ${mark} ${one(c.text)}.${how}`.replace(/\.\./g, '.')
  }
  return [
    opts.heading ? `### ${t.identifier} ${t.title}` : '',
    act.length ? act.join(' ') : '',
    t.description?.trim() ? `**What it does**\n\n${t.description.trim()}` : '',
    t.acceptance.length ? `**How to check it**\n\n${[...unmet, ...open, ...met].map(row).join('\n')}` : '**How to check it**\n\nThis task has no acceptance criteria, so there is no list to check it against.',
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

/** What the guide is made from, for these tasks, as stored. */
export async function guideTasks(tasks: { id: string; identifier: string; title: string }[], pending: { parentId: string | null; identifier: string }[] = []): Promise<GuideTask[]> {
  if (!tasks.length) return []
  const ids = tasks.map((t) => t.id)
  const rows = await db.select().from(issue).where(inArray(issue.id, ids))
  const subs = await db.select({ id: issue.id, parentId: issue.parentId }).from(issue).where(inArray(issue.parentId, ids))
  const steps = await db.select().from(stepWork).where(and(inArray(stepWork.issueId, ids), inArray(stepWork.key, ['adr', 'risk'])))
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
    }
  })
}

/** One task's guide, as the task's page shows it before there is a pull request. */
export async function mergeGuideOf(issueId: string, identifier: string, title: string, pending: string[] = []) {
  const [t] = await guideTasks([{ id: issueId, identifier, title }])
  return mergeGuide([{ ...t, pending }])
}
