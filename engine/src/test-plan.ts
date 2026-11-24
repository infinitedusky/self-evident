/**
 * The Test plan step, between an approved brief and the build (Sandy, 2026-11-23: "Test plan, approved by the
 * person", after the prototype; docs/proven-work.md, part 3). When a task's workflow has the step on, the build
 * does not start from the brief's approval: a fresh agent reads the code and writes the test trajectory
 * (trajectory.ts), the person approves it on the step's page, and the build is then made from it.
 *
 * `advanceTestPlan` is called wherever the build would otherwise start. It answers "build" when nothing holds it (no
 * such step on the task, or it is approved or skipped) and "wait" otherwise, sending the agent out the first time.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { acceptanceLines, acceptanceOf } from './acceptance.js'
import { db } from './db/client.js'
import { app, issue, prototype } from './db/schema.js'
import { withLock } from './landing.js'
import { step, testPlanOwed } from './steps.js'
import { checkTalks, say, startCheckTalk, taskTalk, type SubjectRef } from './talk.js'
import { LEVEL_SAYS, LEVELS, rowCommand, TESTS } from './trajectory.js'
import { homeRepo } from './workbench.js'
import { setStep, stepsOf } from './work.js'

export interface TestPlanFacts { identifier: string; title: string; issueId: string; base: string; criteria: string; prototype: { path: string; branch: string } | null; /** How the engine will run one row's test here, shown on a made-up file; null: the app has no test command. */ runs: string | null; /** The reports there are to read first. */ reports: string[] }

/** What the agent that drafts a test plan is told. It starts from this and nothing else. */
export function testPlanBrief(f: TestPlanFacts): string {
  return `**Test plan.** Task ${f.identifier} "${f.title}" (${f.issueId}). Read the task and its brief with the task tool.
${f.reports.length ? `Read first, with get_step on this task: ${f.reports.join(', ')}. ` : ''}${f.prototype ? `The approved prototype "${f.prototype.branch}" is in ${f.prototype.path}, cut from ${f.base}: read what it changed (git -C ${f.prototype.path} diff ${f.base}...HEAD) for what the real thing does and where it lands. ` : ''}Read the code on ${f.base} where the build will land, and how this repository already tests things like it (where its tests live, how they are named, what they run against).

You write the plan of this task's tests, before anything is built. The build is then made from it and held to it by the engine, which runs every test itself: a reviewer of the pull request will be shown, for each test, that it failed before its code was written and passed after. So this is a plan of what will be proven, not a list of files.

**The slices.** Cut the build into the fewest sub-tasks that each leave something working, in the order they are built; each is one builder's run. Give each a key (short, lower case), a title (what it builds, in a few words) and what: its instructions, as its builder will read them.

**The rows.** One row per test the build commits to:
- id: T1, T2, …
- asserts: what it proves, in one sentence a reviewer reads. Behaviour someone outside could see, not a function's name.
- level: the smallest that can prove it. ${LEVELS.map((l) => `${l} (${LEVEL_SAYS[l]})`).join('; ')}.
- criteria: the acceptance criteria it proves, by id.
- test: its file, from the repository's root, where this repository keeps such tests. One file is run alone${f.runs ? `, like this: \`${f.runs}\`` : ''}.
- name: the test's own name in that file, only when rows that share a file are written or turn green at different times.
- writableAt: "${TESTS}" (the test phase, before anything is built) or the key of the slice it can first be written in.
- passesAt: the key of the slice it turns green in.

**Write as many up front as you can.** The first sub-task of the build is the test phase: every row writable at "${TESTS}" is written there and must fail on its own assertion. A file that cannot load (it imports something not built yet) has not failed: the engine refuses it. So write early tests against a boundary that exists today: an HTTP call that will 404, a query on a table, a command. A unit test of a function that does not exist yet can still be written up front when its builder adds the smallest stub that lets the file load.
- A row that truly cannot be written in the test phase says why (deferred.why), and carries the test's code as you would write it (deferred.code), so a reader can check the promise. Read your reasons as a set: if several say "waits for the code", the tests belong earlier, at a boundary.
- A row that passes the moment it is written is a **regression guard**: it pins behaviour that exists and this change could break. Say why it is one (guard); its writableAt and passesAt are the same. Without that, a test that passes on its first run is refused: a guard and a rubber stamp look the same.

**Every acceptance criterion names its tests**, or is proven another way and says so on the criterion itself (set_acceptance, kind: smoke for what only the person can show on the built code, release for what is true only at deploy, watch for production health after it). The criteria:
${f.criteria || '(none written: say so to the person, and stop)'}
Do not write a test for what a test cannot show; tag the criterion instead. A slice at which no row turns green says why (none: schema only, a deletion, a refactor, set-up).

Sizing: three to five rows for a small change, ten to twenty-five for a large one. One test of a rule over many inputs is better than five examples of it. More rows than lines of new code is too many.

Record it with set_test_plan (issueId ${f.issueId}; slices; rows; notes: anything the table cannot say, such as what cannot be tested here and how we would know instead). It is refused, with every reason, while it breaks a rule: fix those and send it again. Change no file. When it is kept, say in three lines what the build will prove and what you left to the person, and stop: they approve it on the task's Test plan step, and the build starts from there.`
}

/** Whether a task's build may start, as far as its test plan goes; the agent is sent out the first time it is owed. */
export async function advanceTestPlan(issueId: string): Promise<'build' | 'wait'> {
  return withLock(`testplan:${issueId}`, async () => {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t || t.parentId || t.kind !== 'code') return 'build' as const
    const v = await stepsOf({ issueId })
    if (!testPlanOwed(v.states, v.resolved.workflow)) return 'build' as const
    const state = v.states.find((s) => s.key === 'testplan')
    if (state && state.status !== 'none') return 'wait' as const // written or being written: the person's approval is what it waits on
    if ((await checkTalks(issueId)).some((s) => (s.subjectRef as SubjectRef).check === 'testplan')) return 'wait' as const
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    const r = await homeRepo(t.appId)
    const conductor = await taskTalk(issueId)
    const cwd = conductor?.cwd ?? r?.localPath
    if (!cwd) return 'wait' as const // nowhere to read from: the step stays owed, and its page says it has not started
    const [p] = await db.select().from(prototype).where(and(eq(prototype.issueId, issueId), inArray(prototype.status, ['running', 'stopped']))).orderBy(desc(prototype.createdAt)).limit(1)
    const done = v.rows.filter((x) => step(x.key).place === 'check' && x.state.status === 'done').map((x) => `${x.key} (${step(x.key).label})`)
    const facts: TestPlanFacts = { identifier: `${a.key}-${t.number}`, title: t.title, issueId, base: a.defaultBranch, criteria: acceptanceLines(acceptanceOf(t)), prototype: p ? { path: p.path, branch: p.branch } : null, runs: rowCommand(a.setup, { test: 'path/to/the.test.file' }), reports: done }
    await setStep({ issueId }, 'testplan', { status: 'started', detail: 'Its agent is writing it' }, 'engine')
    const s = await startCheckTalk({ appId: t.appId, issueId, check: 'testplan', cwd, branch: conductor?.branch ?? null, subject: `Test plan: ${facts.identifier} ${t.title}` })
    await say(s.id, testPlanBrief(facts), undefined, { author: 'engine', kind: 'brief' })
    return 'wait' as const
  })
}
