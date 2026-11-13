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

/**
 * A report has two readers (Sandy, 2026-11-13: "really comprehensive but they're really long … great context for the
 * next agent, but very hard for a human to read"): the body is the next agent's, the summary is the person's.
 */
export const SUMMARY = `summary: for the person, who will not read the report. At most eight bullets, one line each, in plain words, in this order: what they must decide, each with what you would choose; what is wrong or missing, each with what it costs to fix; what is risky and how we would know; then one line for everything that holds. Only what would change what they do: no restating the report's sections, no file paths unless they must open that file, no hedging. If nothing needs them, say so in one line`
const report = (key: StepKey, issueId: string) => `Record it with set_step: issueId ${issueId}, key ${key}, status done, body: the report in Markdown, written for the next agent and as long as it needs; ${SUMMARY}; detail: its one-line verdict. Then say in two or three lines what you found, and stop.`
const earlier = (f: CheckFacts) => (f.before.length ? `Read first, with get_step on this task: ${f.before.map((k) => `${k} (${step(k).label})`).join(', ')}. ` : '')
const proto = (f: CheckFacts) => (f.prototype ? `The prototype "${f.prototype.title}" is in ${f.prototype.path} on branch ${f.prototype.branch}, cut from ${f.base}: read it there (git -C ${f.prototype.path} log ${f.base}..HEAD, git -C ${f.prototype.path} diff ${f.base}...HEAD). It was built the way we would ship it, with only what is outside the system faked through seams; it is not merged. ` : '')

/** What each check's fresh agent is told: what to read and what to report. It starts from this and nothing else. */
export function checkBrief(key: StepKey, f: CheckFacts): string {
  const task = `Task ${f.identifier} "${f.title}" (${f.issueId}). Read the task and its brief with the task tool.`
  switch (key) {
    case 'analysis': return `**Prototype analysis.** ${task}
${proto(f)}Its agent was told to build it the way we would ship it: every requirement of the brief met end to end, by the repository's conventions, with fakes only at the system's edges and through seams. Do not take its word for that: check. Read every commit since ${f.base}, the diff, the sample data under .prototype/scenarios, the repository's conventions (AGENTS.md, CLAUDE.md, the code around it on ${f.base}), and the code it leans on.
Report, with file paths:
- **Requirements**: each acceptance criterion of the task (the task tool lists them, with what the prototype's agent recorded as shown; check its claim, do not repeat it; one marked FINAL BUILD ONLY was not the prototype's to show, so say "left to the build" and nothing more unless the prototype contradicts it) and any requirement of the brief that has no criterion, one line: met end to end (where: the integration point, the storage, the API, the screen), partly, or not met. Not met and partly first.
- **Against the conventions**: where the code departs from how the repository builds things (structure, naming, migrations, privacy rules), with the line and the convention it breaks. Say plainly when it holds. Duplication, clumsy structure and missing polish are expected of a prototype and are not defects here: they go under Cleaner.
- **Seams and stubs**: every place something outside the system is stood in for (a base URL pointed at a stub, an injected transport, a dependency override, a fixture), whether the seam already existed on ${f.base} or the prototype added it (the build needs each one it added), and whether the stub's data was recorded from the real service or its shape is assumed.
- **Faked inside the system**: anything that is not at an edge: a skipped layer, a hard-coded result, parsing that only handles the sample, logic on the wrong side. Each is a defect of the prototype; say what the build must do there.
- **Telemetry hook points** (Sandy, 2026-11-13: telemetry is "a key part of what we learn from the prototype. With that built we can select all the hook points"). With the real path built, say where production should report that the feature works and that it is used. First find the app's own telemetry channels and how the code around this already uses them (structured logs and the metrics and monitors made from them, error reporting, product analytics), and use only those. Then a table, one row per hook point: **where** (the file and function on the path the prototype built), **what it records** (counts and states, never names, links or other personal data), **the question it answers** ("did the vendor change its format?", "is anyone using it?"), **the alert** (what would page or notify, or "none: a dashboard"), and whether **the prototype already emits it** (its report lists the ones it claims; check them). Cover at least: data coming in (found, skipped, absent), writes (inserted, updated, removed), failures, the latency of new reads, and the user actions that show the feature is used. Say first which failure would otherwise be silent: the one where the feature quietly stops working and nothing says so. If the app has no channel for one of these, say so; do not invent one.
- **How it was built**: the parts, how they fit, the data's final shape, the migrations.
- **What was hard**: what took several tries or was changed and why (the commit history shows it).
- **What surprised**: what the mockup or the brief did not foresee.
- **Keep or leave**: which choices the build should follow as they are, and which it should not, with why.
- **Cleaner** (Sandy, 2026-11-12, and 2026-11-13: the prototype is built for speed on the real path and told not to tidy, so this is where its code is made good; start from the places its agent said it took the quick way, then find the ones it did not name) (Sandy, 2026-11-12: the build has nobody to ask and nothing to work out, so whatever would make this code simpler is found here). Read the prototype's code, and the code on ${f.base} it sits in, for how the real build should be cleaner than it, with the lines you mean:
  - *Repeats*: logic, markup or styles written two or three times (in the prototype, or already on ${f.base}) that should be one function, component or rule. Name it and say where it lives.
  - *Simpler*: anything done in a roundabout or wasteful way, with the plainer or more efficient way to do it.
  - *Refactor*: what in the existing code should change shape so this fits cleanly, and only that; no refactoring for its own sake.
  - *Leave out*: dead code, leftovers, debug hooks and stray files the build must not copy.
  One line each that a builder can act on. Say plainly when a part is already as simple as it should be.
Describe; do not decide the architecture: that is the draft ADR's, which reads this.
${report(key, f.issueId)}`
    case 'adr': return `**Draft ADR.** ${task}
${earlier(f)}${proto(f)}Propose the architecture for the real build, which starts from ${f.base}. The prototype was built the way we would ship it, so it is the reference for the build: say where the build should follow it as it is and where it should differ; its branch is not merged. Read the code on ${f.base} where the build would land.
Write it as a draft decision record: the context in a few lines; the options (the prototype's way among them, and at least one other); the choice you propose; why, against what the analysis found and how the code is built today; what follows from it (what the build must do, what it must not copy from the prototype); and what you are unsure of, with what would change the choice.
It is a draft. The planner settles it when it cuts the task into sub-tasks, and the final record is a file the build writes, so do not write any file and do not polish: be clear about the choice and honest about the doubts.
${report(key, f.issueId)}`
    case 'risk': return `**Blast radius.** ${task}
${earlier(f)}${proto(f)}Work out what the real build touches on ${f.base}, built the way the draft ADR proposes (or, with none, the way the brief says). Read the code it would change and what depends on that code.
Report: the files and modules it changes; what else uses them and could break; data and migrations; anything shared or outward-facing (APIs, jobs, other apps); and for each risk, how we would know it broke (the test, the log line, the page).
${report(key, f.issueId)}`
    case 'audit': return `**Brief audit.** ${task}
${earlier(f)}${proto(f)}The brief has just been brought up to date and is about to be approved; the build starts from it and from nothing else. Read it against the code on ${f.base}, the prototype and the reports above.
Report: gaps (what a builder would have to guess); wrong guesses (where the brief says something the code, the prototype or a report contradicts, with the file); things it asks for that nothing so far supports; references that do not resolve (a sketch file, a story id, a branch, a path). Say plainly when a section holds.
Then the **acceptance criteria** (the task tool shows them; the person approves them with the brief, and the build is done when they hold): are they sufficient? Report: requirements of the brief that no criterion covers; criteria nobody could check as written, or with no way given to check them; cases that are missing (empty, many, repeated, the wrong person, failure of something outside); guarantees the blast radius says matter that none states; telemetry: whether the brief's Telemetry section has every hook point the analysis found, whether a criterion holds the build to each kind, and whether the failure that would otherwise be silent is one of them; criteria the prototype did not show, and whether that is a gap in the prototype or in the criterion; criteria left to the final build only whose reason does not hold (a risk the prototype should have proved), since those are approved with no evidence. For each, the criterion you would add or the wording you would change. Say plainly when they are enough.
${report(key, f.issueId)}`
    default: throw new Error(`${key} is not a check`)
  }
}

/** Said to the conductor once the reports before the audit are in. */
export const finalizeBrief = (done: StepKey[], f: CheckFacts) => `The prototype is approved and the reports are in: ${done.map((k) => step(k).label).join(', ')}. Read each with get_step on this task, then bring the brief up to date with update_task so the build can start from it alone:
- a **Prototype** section: the branch ${f.prototype?.branch ?? '(none)'}, what the analysis found, what to keep and what to change, and that the build starts from ${f.base} with the prototype as a map, never as code to carry over;
- what the analysis says under Cleaner, as instructions to the builder: what to write once instead of twice, what to do the simpler way, what to refactor first, what to leave out;
- the draft ADR's proposed decision, in the brief's own words and marked as proposed (the planner settles it), and what the blast radius says to watch;
- a **Telemetry** section: the analysis's hook points as its table (where, what it records, the question it answers, the alert), so the build puts them in; leave none out without saying why;
- the assets each step left (sketch files, story ids, the reports), named so the brief points at them.
Then bring the acceptance criteria up to date with set_acceptance (the task tool shows them): every requirement of the brief has one, each can be checked as written and says how, what the analysis found not met or faked is recorded on its criterion (shown false, with what is missing), anything the reports show we must guarantee that no criterion covers is added, and the telemetry has criteria of its own (one per kind of hook point: the logs or metrics, the monitors, the product events and that they carry no personal data), each marked not shown unless the prototype emits it. Do not put them in the brief's text: they are kept beside it and approved with it.
Change nothing else, and do not ask the person anything: when your turn ends the brief audit reads the result.`
export const reportsIn = (done: StepKey[]) => `The checks are done: ${done.map((k) => step(k).label).join(', ')}. ${done.includes('audit') ? 'Read the brief audit with get_step and fix in the brief what it found (update_task); leave what it says holds. Then tell' : 'Tell'} the person in a few lines what the reports say, from each report's summary (a report with none: write it one now, set_step with summary alone), and that the brief is ready for them to approve.`

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
