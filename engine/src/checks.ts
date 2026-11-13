/**
 * The checks, run by themselves once the person approves a task's prototype (SHAPE.md, "The prototype is read before
 * anything is decided from it"; Sandy, 2026-11-11). In order, each a fresh agent in a conversation of its own, read
 * only, shown as a tab in the task's agent column:
 *
 *   prototype analysis → ADR → blast radius → the conductor brings the brief up to date → brief audit → the conductor
 *   is told the reports are in, and the person approves the brief.
 *
 * Only the checks the task's workflow has are run. Where the line stands is worked out from what is stored each time
 * (the steps' states, the open check conversations, two notes in the conductor's transcript), so an engine restart
 * loses nothing: the next turn that ends on the task carries it on. A check whose agent stopped without recording its
 * report waits; the person opens its tab and says so.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, prototype, repo, session, sessionMessage } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { withLock } from './landing.js'
import { CHECKS, step, type StepKey } from './steps.js'
import { checkTalks, onTurnEnd, say, startCheckTalk, taskTalk, type SubjectRef } from './talk.js'
import { stepsOf } from './work.js'

export interface CheckFacts { identifier: string; title: string; issueId: string; base: string; prototype: { path: string; branch: string; title: string } | null; before: StepKey[] }

const report = (key: StepKey, issueId: string) => `Record it with set_step: issueId ${issueId}, key ${key}, status done, body: the report in Markdown, detail: its one-line verdict. Then say in two or three lines what you found, and stop.`
const earlier = (f: CheckFacts) => (f.before.length ? `Read first, with get_step on this task: ${f.before.map((k) => `${k} (${step(k).label})`).join(', ')}. ` : '')
const proto = (f: CheckFacts) => (f.prototype ? `The prototype "${f.prototype.title}" is in ${f.prototype.path} on branch ${f.prototype.branch}, cut from ${f.base}: read it there (git -C ${f.prototype.path} log ${f.base}..HEAD, git -C ${f.prototype.path} diff ${f.base}...HEAD). It was built fast and is never merged. ` : '')

/** What each check's fresh agent is told: what to read and what to report. It starts from this and nothing else. */
export function checkBrief(key: StepKey, f: CheckFacts): string {
  const task = `Task ${f.identifier} "${f.title}" (${f.issueId}). Read the task and its brief with the task tool.`
  switch (key) {
    case 'analysis': return `**Prototype analysis.** ${task}
${proto(f)}Its agent was told to take the agreed mockup and make it work however it thought best, with shortcuts. Read how it did: every commit since ${f.base} (messages too: a line starting "shortcut:" marks something faked or skipped), the diff, the made-up data under .prototype/scenarios, and the code it leans on.
Report, with file paths:
- **How it was built**: the parts, how they fit, the data's final shape.
- **What was faked or skipped**: each shortcut, and what the real build has to do there.
- **What was hard**: what took several tries or was changed and why (the commit history shows it).
- **What surprised**: what the mockup or the brief did not foresee.
- **Keep or leave**: which choices are worth following in the real build, and which were only speed.
- **Cleaner** (Sandy, 2026-11-12: the build has nobody to ask and nothing to work out, so whatever would make this code simpler is found here). Read the prototype's code, and the code on ${f.base} it sits in, for how the real build should be cleaner than it, with the lines you mean:
  - *Repeats*: logic, markup or styles written two or three times (in the prototype, or already on ${f.base}) that should be one function, component or rule. Name it and say where it lives.
  - *Simpler*: anything done in a roundabout or wasteful way, with the plainer or more efficient way to do it.
  - *Refactor*: what in the existing code should change shape so this fits cleanly, and only that; no refactoring for its own sake.
  - *Leave out*: dead code, leftovers, debug hooks and stray files the build must not copy.
  One line each that a builder can act on. Say plainly when a part is already as simple as it should be.
Describe; do not decide the architecture: that is the ADR's, which reads this.
${report(key, f.issueId)}`
    case 'adr': return `**ADR.** ${task}
${earlier(f)}${proto(f)}Decide the architecture for the real build, which starts from ${f.base}, from scratch, with the prototype as a map to follow and improve on, never as code to carry over. Read the code on ${f.base} where the build would land.
Write the decision record: the context in a few lines; the options (the prototype's way among them, and at least one other); the choice; why, against what the analysis found and how the code is built today; what follows from it (what the build must do, what it must not copy from the prototype).
${report(key, f.issueId)}`
    case 'risk': return `**Blast radius.** ${task}
${earlier(f)}${proto(f)}Work out what the real build touches on ${f.base}, built the way the ADR says (or, with no ADR, the way the brief says). Read the code it would change and what depends on that code.
Report: the files and modules it changes; what else uses them and could break; data and migrations; anything shared or outward-facing (APIs, jobs, other apps); and for each risk, how we would know it broke (the test, the log line, the page).
${report(key, f.issueId)}`
    case 'audit': return `**Brief audit.** ${task}
${earlier(f)}${proto(f)}The brief has just been brought up to date and is about to be approved; the build starts from it and from nothing else. Read it against the code on ${f.base}, the prototype and the reports above.
Report: gaps (what a builder would have to guess); wrong guesses (where the brief says something the code, the prototype or a report contradicts, with the file); things it asks for that nothing so far supports; references that do not resolve (a sketch file, a story id, a branch, a path). Say plainly when a section holds.
${report(key, f.issueId)}`
    default: throw new Error(`${key} is not a check`)
  }
}

/** Said to the conductor once the reports before the audit are in. */
export const finalizeBrief = (done: StepKey[], f: CheckFacts) => `The prototype is approved and the reports are in: ${done.map((k) => step(k).label).join(', ')}. Read each with get_step on this task, then bring the brief up to date with update_task so the build can start from it alone:
- a **Prototype** section: the branch ${f.prototype?.branch ?? '(none)'}, what the analysis found, what to keep and what to change, and that the build starts from ${f.base} with the prototype as a map, never as code to carry over;
- what the analysis says under Cleaner, as instructions to the builder: what to write once instead of twice, what to do the simpler way, what to refactor first, what to leave out;
- the ADR's decision, in the brief's own words, and what the blast radius says to watch;
- the assets each step left (sketch files, story ids, the reports), named so the brief points at them.
Change nothing else, and do not ask the person anything: when your turn ends the brief audit reads the result.`
export const reportsIn = (done: StepKey[]) => `The checks are done: ${done.map((k) => step(k).label).join(', ')}. ${done.includes('audit') ? 'Read the brief audit with get_step and fix in the brief what it found (update_task); leave what it says holds. Then tell' : 'Tell'} the person in a few lines what the reports say and that the brief is ready for them to approve.`

const note = async (sessionId: string, stage: string) => (await db.select({ id: sessionMessage.id }).from(sessionMessage).where(and(eq(sessionMessage.sessionId, sessionId), sql`${sessionMessage.payload}->>'checks' = ${stage}`)).limit(1)).length > 0

/** What to do next on a task's checks, from what is stored; pure, so it is tested without agents. */
export function nextMove(i: { approved: boolean; checks: { key: StepKey; done: boolean; out: boolean }[]; hasPrototype: boolean; conductor: { busy: boolean; askedToFinalize: boolean; toldDone: boolean } | null }):
  { do: 'nothing' } | { do: 'run'; key: StepKey } | { do: 'finalize' } | { do: 'tell' } {
  if (!i.approved) return { do: 'nothing' }
  const list = i.checks.filter((c) => c.key !== 'analysis' || i.hasPrototype) // nothing to analyse without a prototype
  if (!list.length) return { do: 'nothing' }
  const first = list.filter((c) => c.key !== 'audit').find((c) => !c.done)
  if (first) return first.out ? { do: 'nothing' } : { do: 'run', key: first.key }
  const audit = list.find((c) => c.key === 'audit')
  if (audit && !audit.done) {
    if (audit.out) return { do: 'nothing' }
    if (!i.conductor) return { do: 'run', key: 'audit' } // no conductor to write the brief: audit it as it stands
    if (!i.conductor.askedToFinalize) return list.length > 1 ? { do: 'finalize' } : { do: 'run', key: 'audit' }
    return i.conductor.busy ? { do: 'nothing' } : { do: 'run', key: 'audit' }
  }
  return i.conductor && !i.conductor.toldDone ? { do: 'tell' } : { do: 'nothing' }
}

/** Carry a task's checks on by one move. Safe to call at any time, and more than once. */
export async function advanceChecks(issueId: string): Promise<ReturnType<typeof nextMove>> {
  return withLock(`checks:${issueId}`, async () => {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t || t.parentId || t.kind !== 'code') return { do: 'nothing' as const }
    const v = await stepsOf({ issueId })
    const rows = v.rows.filter((r) => step(r.key).place === 'check').sort((a, b) => CHECKS.indexOf(a.key) - CHECKS.indexOf(b.key))
    if (!rows.length) return { do: 'nothing' as const }
    const out = await checkTalks(issueId)
    const conductor = await taskTalk(issueId)
    const [p] = await db.select().from(prototype).where(and(eq(prototype.issueId, issueId), inArray(prototype.status, ['running', 'stopped']))).orderBy(desc(prototype.createdAt)).limit(1)
    const move = nextMove({
      approved: !!v.states.find((s) => s.key === 'prototype')?.approved,
      checks: rows.map((r) => ({ key: r.key, done: r.state.status === 'done', out: out.some((s) => (s.subjectRef as SubjectRef).check === r.key) })),
      hasPrototype: !!p,
      conductor: conductor ? { busy: conductor.busy, askedToFinalize: await note(conductor.id, 'finalize'), toldDone: await note(conductor.id, 'done') } : null,
    })
    if (move.do === 'nothing') return move
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    const r = await homeRepo(t.appId)
    const done = rows.filter((x) => x.state.status === 'done').map((x) => x.key)
    const facts: CheckFacts = { identifier: `${a.key}-${t.number}`, title: t.title, issueId, base: a.defaultBranch, prototype: p ? { path: p.path, branch: p.branch, title: p.title } : null, before: done }
    if (move.do === 'run') {
      const cwd = move.key === 'analysis' && p ? p.path : conductor?.cwd ?? r?.localPath
      if (!cwd) return { do: 'nothing' as const } // nowhere to read from
      const s = await startCheckTalk({ appId: t.appId, issueId, check: move.key, cwd, branch: move.key === 'analysis' && p ? p.branch : conductor?.branch ?? null, subject: `${step(move.key).label}: ${facts.identifier} ${t.title}` })
      await say(s.id, checkBrief(move.key, facts), undefined, { author: 'engine', kind: 'brief' })
    } else if (move.do === 'finalize') {
      await say(conductor!.id, finalizeBrief(done, facts), undefined, { author: 'engine', kind: 'brief', payload: { checks: 'finalize', label: 'The reports are in' } })
    } else {
      await say(conductor!.id, reportsIn(done), undefined, { author: 'engine', kind: 'brief', payload: { checks: 'done', label: 'The checks are done' } })
    }
    return move
  })
}

/** A turn ended: if it was the task's conductor or one of its checks, see what comes next. */
onTurnEnd((sessionId) => {
  void (async () => {
    const [s] = await db.select({ ref: session.subjectRef }).from(session).where(eq(session.id, sessionId))
    const ref = s?.ref as SubjectRef | null
    const issueId = ref?.checkOf ?? ref?.issueId
    if (issueId) await advanceChecks(issueId)
  })().catch((err) => console.error('checks: could not carry on', err))
})
