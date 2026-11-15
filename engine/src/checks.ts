/**
 * The checks, run by themselves once the person approves a task's prototype (SHAPE.md, "The prototype is read before
 * anything is decided from it"; Sandy, 2026-11-11). In order, each a fresh agent in a conversation of its own, read
 * only, shown as a tab in the task's agent column:
 *
 *   prototype analysis → ADR → the plan (the task cut into sub-tasks) → blast radius → audit → the conductor is told,
 *   and the task is built.
 *
 * The analysis and the ADR are what the plan is made from; the blast radius and the audit read the plan (Sandy,
 * 2026-11-14: "it analyzes the prototype and compares it to the brief, and then it creates an ADR and a plan …
 * then we do an audit on the whole thing"). The plan is made from an approved brief: if it is not approved when the
 * ADR is in, the conductor brings it up to date once and the line waits for the person.
 *
 * Only the checks the task's workflow has are run. Where the line stands is worked out from what is stored each time
 * (the steps' states, the open check conversations, two notes in the conductor's transcript), so an engine restart
 * loses nothing: the next turn that ends on the task carries it on. A check whose agent stopped without recording its
 * report waits; the person opens its tab and says so.
 */
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, prototype, repo, session, sessionMessage, stepWork } from './db/schema.js'
import { homeRepo } from './workbench.js'
import { withLock } from './landing.js'
import { BEFORE_PLAN, CHECKS, checksOwed, step, type StepKey } from './steps.js'
import { checkTalks, cutOff, onTurnEnd, say, startCheckTalk, taskTalk, type SubjectRef } from './talk.js'
import { stepsOf } from './work.js'
import { onAnyPlanned } from './planner.js'
import { BRIEF_FORM } from './brief.js'

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
${earlier(f)}${proto(f)}The task is planned: the task tool shows its sub-tasks, each with its brief, its files and what it waits on. Work out what that plan touches on ${f.base} when it is built. Read the code it would change and what depends on that code.
Report: the files and modules it changes; what else uses them and could break; data and migrations; anything shared or outward-facing (APIs, jobs, other apps); and for each risk, how we would know it broke (the test, the log line, the page).
${report(key, f.issueId)}`
    case 'audit': return `**Audit.** ${task}
${earlier(f)}${proto(f)}The task is planned and about to be built, with nobody pressing anything in between: this is the last read before agents start. Read the plan (the task tool shows the sub-tasks, each with its brief, its files and what it waits on) against the brief, the draft ADR, the code on ${f.base}, the prototype and the reports above.
Report: what the brief asks for that no sub-task does; sub-tasks that do something nobody asked for; wrong guesses (where a sub-task says something the code, the prototype or a report contradicts, with the file); sub-tasks in the wrong order, or two that change the same thing; where the plan departs from the draft ADR without saying why; what the blast radius says could break that no sub-task guards against; and what this app requires of every plan (the task tool shows the list and the plan's answer to each) that the plan claims and the sub-tasks do not actually do. Lead with whatever should stop the build.
Then the **acceptance criteria** (the task tool shows them; the person approves them with the brief, and the build is done when they hold): are they sufficient? Report: requirements of the brief that no criterion covers; criteria nobody could check as written, or with no way given to check them; cases that are missing (empty, many, repeated, the wrong person, failure of something outside); guarantees the blast radius says matter that none states; telemetry: whether the plan's sub-tasks put in every hook point the analysis found, whether a criterion holds the build to each kind, and whether the failure that would otherwise be silent is one of them; criteria the prototype did not show, and whether that is a gap in the prototype or in the criterion; criteria left to the final build only whose reason does not hold (a risk the prototype should have proved), since those are approved with no evidence. For each, the criterion you would add or the wording you would change. Say plainly when they are enough.
${report(key, f.issueId)}`
    case 'final': return `**Final ADR and plan.** ${task}
${earlier(f)}${proto(f)}The task is planned, and the blast radius and the audit have read the plan. You are the last step before agents build it, and the only one of these that changes anything: you put the ADR and the plan right from what those two found (Sandy, 2026-11-14: the audit and the blast radius "should analyze and make any changes they need to make to the ADR and the plan … and set out the … merge checklist. Only then do we build"). You change them through the task tools; you still write no files.
Do these in order:
1. **The ADR.** Read the draft (get_step, key adr) against the audit and the blast radius. Write the final one with set_step (issueId ${f.issueId}, key adr, status done; body: the decision record as it now stands: context, the decision, why, what was rejected, what follows; summary: for the person). Keep what holds, change what a finding contradicts, and end the body with a line saying what changed from the draft, or that nothing did.
2. **The plan.** The task tool shows its sub-tasks. For each finding of the audit and each risk of the blast radius that the plan does not already answer, change the plan: bring a sub-task's brief up to date (update_task with that sub-task's id) so it does the thing or guards the risk; add a sub-task (add_sub_task) only when no existing one can hold it; cancel one that nobody asked for (set_task_state canceled, with the reason). Leave every sub-task a finding does not touch exactly as it is, and do not plan the task again.
3. **The merge checklist.** What whoever approves the pull request must check before merging: one line each, something they can do and see (a page to open and what it shows, a command and its result, a log line to look for), the most important first, drawn from the risks, the acceptance criteria and what this app requires of every plan. Ten at most.
If a finding needs the person's decision because it changes **what** is built, not how, do not decide it and do not record this step as done: record set_step with key final, status started, and a summary that starts "NEEDS YOU:" with the question and what you would choose; then stop. The build waits for you. When they answer in this conversation, carry on from where you were.
When all three are done, record it with set_step: issueId ${f.issueId}, key final, status done; body: what you changed in the ADR and in the plan, finding by finding, and what you left alone and why; summary: the merge checklist, one item per line, each starting with "- ". Then stop.`
    default: throw new Error(`${key} is not a check`)
  }
}

/** Said to the conductor once the reports before the audit are in. */
export const finalizeBrief = (done: StepKey[], f: CheckFacts) => `The prototype is approved and the reports are in: ${done.map((k) => step(k).label).join(', ')}. The brief is not approved yet, and the plan is made from an approved brief. Read each report's summary with get_step on this task, then do two things and nothing else.
First, the brief. ${BRIEF_FORM} Nothing the reports found about how to build it goes into the brief: the planner reads the analysis and the draft ADR themselves. Change the brief only where the prototype changed **what** is being built or what is left out, and if it has grown past its size, cut it back to it with update_task.
Then bring the acceptance criteria up to date with set_acceptance (the task tool shows them): every requirement of the brief has one, each can be checked as written and says how, what the analysis found not met or faked is recorded on its criterion (shown false, with what is missing), anything the reports show we must guarantee that no criterion covers is added, and the telemetry has criteria of its own (one per kind of hook point: the logs or metrics, the monitors, the product events and that they carry no personal data).
When your turn ends, tell the person in two lines that the brief is ready for their approval and how many criteria it has: the plan, its audit and the build all follow from that approval by themselves.`
export const reportsIn = (done: StepKey[], briefApproved = false) => (briefApproved
  ? `The checks are done: ${done.map((k) => step(k).label).join(', ')}. The brief is approved, so do not change it: the task is being planned and built from it now. Read the reports with get_step. If one of them found something that would change what is built, say so to the person now, plainly and first; otherwise tell them in two lines what the checks found.`
  : `The checks are done: ${done.map((k) => step(k).label).join(', ')}. ${done.includes('audit') ? 'Read the audit with get_step and fix in the brief what it found (update_task); leave what it says holds. Then tell' : 'Tell'} the person in a few lines what the reports say, from each report's summary (a report with none: write it one now, set_step with summary alone), and that the brief is ready for them to approve.`)

const note = async (sessionId: string, stage: string) => (await db.select({ id: sessionMessage.id }).from(sessionMessage).where(and(eq(sessionMessage.sessionId, sessionId), sql`${sessionMessage.payload}->>'checks' = ${stage}`)).limit(1)).length > 0

export { BEFORE_PLAN }
/** Asked to plan a task (cut it into sub-tasks) when the line reaches that point; server.ts answers, since it knows the runner. */
const wantPlan = new Set<(issueId: string) => void>()
export function onPlanWanted(fn: (issueId: string) => void) { wantPlan.add(fn); return () => { wantPlan.delete(fn) } }

/** Told when a task's checks are all done: the build can go on from there. */
const whenDone = new Set<(issueId: string) => void>()
export function onChecksDone(fn: (issueId: string) => void) { whenDone.add(fn); return () => { whenDone.delete(fn) } }

/** What to do next on a task's checks, from what is stored; pure, so it is tested without agents. */
export function nextMove(i: { approved: boolean; checks: { key: StepKey; done: boolean; out: boolean }[]; hasPrototype: boolean; conductor: { busy: boolean; askedToFinalize: boolean; toldDone: boolean } | null; /** The brief is approved: the plan is made from it, and it is not rewritten from the reports. */ briefApproved?: boolean; /** The task has its sub-tasks. */ planned?: boolean }):
  { do: 'nothing' } | { do: 'run'; key: StepKey } | { do: 'finalize' } | { do: 'plan' } | { do: 'tell' } {
  if (!i.approved) return { do: 'nothing' }
  const list = i.checks.filter((c) => c.key !== 'analysis' || i.hasPrototype) // nothing to analyse without a prototype
  if (!list.length) return { do: 'nothing' }
  // What the plan is made from: the analysis, then the ADR.
  const before = list.filter((c) => BEFORE_PLAN.includes(c.key))
  const first = before.find((c) => !c.done)
  if (first) return first.out ? { do: 'nothing' } : { do: 'run', key: first.key }
  // What reads the plan: the blast radius, then the audit.
  const after = list.filter((c) => !BEFORE_PLAN.includes(c.key))
  const next = after.find((c) => !c.done)
  if (next) {
    if (!i.planned) {
      if (i.briefApproved) return { do: 'plan' }
      // The plan is made from an approved brief. Not approved yet: the conductor brings it up to date from the
      // reports so far, once, and then it is the person's to approve; the line carries on from their approval.
      return i.conductor && !i.conductor.askedToFinalize && before.length ? { do: 'finalize' } : { do: 'nothing' }
    }
    return next.out ? { do: 'nothing' } : { do: 'run', key: next.key }
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
      briefApproved: !!t.briefApprovedBy,
      planned: (await db.select({ id: issue.id }).from(issue).where(and(eq(issue.parentId, issueId), eq(issue.kind, 'code'), notInArray(issue.state, ['canceled', 'duplicate'])))).length > 0,
    })
    // Every check in: the task can be built, if its brief is approved (server.ts decides; it knows the runner).
    if (rows.every((r) => r.state.status === 'done')) for (const fn of whenDone) fn(issueId)
    if (move.do === 'nothing') return move
    if (move.do === 'plan') { for (const fn of wantPlan) fn(issueId); return move } // the planner's turn; it comes back here when the sub-tasks are in
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
      await say(conductor!.id, reportsIn(done, !!t.briefApprovedBy), undefined, { author: 'engine', kind: 'brief', payload: { checks: 'done', label: 'The checks are done' } })
    }
    return move
  })
}

/**
 * A plan is in: the checks that read it (the blast radius, the audit, the final ADR and plan) carry on, whoever
 * started the plan. A plan started by a running project used to end without telling the checks, and the line stopped
 * there (Sandy, 2026-11-15: "the blast radius, audit and final ADR aren't running even though they've all been
 * answered ... is that supposed to happen automatically").
 */
onAnyPlanned((issueId) => { void advanceChecks(issueId).catch((err) => console.error('checks: could not carry on after the plan', err)) })

/**
 * The engine has started: a line that was under way is carried on. Only tasks with a check written in the last day
 * and checks still owed, so a restart does not start, by surprise, the checks of a task nobody has touched.
 */
/** What a check's agent is told when the engine restarted under it. */
export const CUT_OFF = 'The engine restarted while you were in the middle of this. Nothing you had already saved is lost. Carry on from where you were: check what you have written so far, finish the step, and hand your report back as you were told to.'

export async function resumeChecks(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3_600_000)
  const recent = await db.selectDistinct({ issueId: stepWork.issueId }).from(stepWork).where(and(inArray(stepWork.key, CHECKS), sql`${stepWork.issueId} is not null`, sql`${stepWork.updatedAt} > ${since}`))
  const carried: string[] = []
  for (const { issueId } of recent) {
    if (!issueId) continue
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t || t.parentId || ['done', 'canceled', 'duplicate'].includes(t.state)) continue
    const v = await stepsOf({ issueId })
    if (!checksOwed(v.states, v.resolved.workflow).length) continue
    // A check whose agent was cut off mid-turn by the restart: its conversation is still open, so the line would
    // wait on it for good. It is told to carry on; when its turn ends the line moves as usual.
    const steps = new Map(v.states.map((x) => [x.key, x.status]))
    for (const s of await checkTalks(issueId)) {
      const key = (s.subjectRef as SubjectRef).check
      if (!key || steps.get(key) === 'done' || !(await cutOff(s.id))) continue
      await say(s.id, CUT_OFF, undefined, { author: 'engine', kind: 'brief', payload: { resumed: true, label: 'Carry on' } }).then(() => carried.push(`${issueId}: resumed ${key}`), (err) => console.error(`checks: could not resume ${key} of ${issueId}`, err))
    }
    const move = await advanceChecks(issueId).catch(() => ({ do: 'nothing' as const }))
    if (move.do !== 'nothing') carried.push(`${issueId}: ${move.do}${'key' in move ? ` ${move.key}` : ''}`)
  }
  if (carried.length) console.log(`[checks] carried on after a restart: ${carried.join('; ')}`)
  return carried
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
