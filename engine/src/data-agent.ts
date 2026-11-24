/**
 * A task's data agent (docs/reviewable-prs-brief.md, step 6; Sandy, 2026-11-21: "a data agent with instructions of
 * its own, called by the task's agent, that works in three steps and stops after each").
 *
 * One per task: a conversation of its own, in the task's worktree, which it only reads. The task's agent asks it
 * (the data_agent tool); it works one step and stops; the person lets it go on, on the task's Data step:
 *   1. What the task calls outside the app: its services and their calls (task-calls.ts).
 *   2. Where each service's data comes from: a real response the person gives and it fakes, data it writes from the
 *      code, what is already there; the files a tester brings; the fixture.
 *   3. Build what was approved, and only that; then say what it built.
 *
 * Decided 2026-11-23 (Sandy): the person approves each step on the Data step, and Evident refuses the agent's
 * building tools until the second is approved; a task's own agent no longer changes the task's calls, services or
 * data itself, only through this agent; what it may build is services and endpoints, fakes of real responses,
 * made-up data it writes itself, test files and an endpoint's data filled out for a fixture.
 *
 * Where it stands is read from the task's events (`data_agent.*`): nothing else keeps it. A round starts when it is
 * asked with none open, and ends when its third step is approved; asked again after that, it starts over from the
 * first step, with what is already there in front of it.
 */
import { and, asc, eq, like, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, issue, session } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'
import { standInKey } from './stand-ins.js'

export type Step = 1 | 2 | 3
export const STEPS: Record<Step, { name: string; does: string }> = {
  1: { name: 'What the task calls', does: 'lists each outside service the change calls and each call it makes to it' },
  2: { name: 'Where the data comes from', does: 'says, for each call, what answers it and what that is made from; the files a tester brings; the fixture' },
  3: { name: 'Build it', does: 'builds what was approved in step 2, and only that' },
}
export const SUMMARY_MAX = 8000

export interface Proposal { step: Step; /** What it proposes (steps 1 and 2) or what it built (step 3), in Markdown, as the person reads it. */ summary: string; /** Step 2: the services it will build for, by key. Step 3 is held to them. */ services: string[]; at: string }
export interface Round {
  /** none: never asked. working: on `step`. proposed: stopped, waiting for the person. done: all three approved. */
  state: 'none' | 'working' | 'proposed' | 'done'
  step: Step
  /** What waits for the person. */ proposal: Proposal | null
  /** This round's approved steps, in order. */ approved: Proposal[]
  /** What it was asked this round. */ asked: { text: string; by: string; at: string } | null
  /** What the person asked to be changed in the step it is on, since its last proposal. */ change: string | null
}
export interface DataAgentView extends Round { /** Its conversation. Null: the task has none yet. */ sessionId: string | null; busy: boolean }

type Ev = { type: string; payload: unknown; ts: Date | string }
const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d))
/** Where a round stands, from the task's events in order. */
export function reduce(events: Ev[]): Round {
  let r: Round = { state: 'none', step: 1, proposal: null, approved: [], asked: null, change: null }
  for (const e of events) {
    const p = (e.payload ?? {}) as { text?: string; from?: string | null; step?: number; summary?: string; services?: string[] }
    if (e.type === 'data_agent.asked') {
      if (r.state === 'none' || r.state === 'done') r = { state: 'working', step: 1, proposal: null, approved: [], asked: { text: String(p.text ?? ''), by: p.from ? 'the task\'s agent' : 'you', at: iso(e.ts) }, change: null }
    } else if (e.type === 'data_agent.proposed') {
      if (r.state === 'working' && p.step === r.step) r = { ...r, state: 'proposed', change: null, proposal: { step: r.step, summary: String(p.summary ?? ''), services: Array.isArray(p.services) ? p.services.map(String) : [], at: iso(e.ts) } }
    } else if (e.type === 'data_agent.approved') {
      if (r.state === 'proposed' && r.proposal && p.step === r.step) r = r.step === 3 ? { ...r, state: 'done', approved: [...r.approved, r.proposal], proposal: null } : { ...r, state: 'working', step: (r.step + 1) as Step, approved: [...r.approved, r.proposal], proposal: null }
    } else if (e.type === 'data_agent.change') {
      if (r.state === 'proposed' && p.step === r.step) r = { ...r, state: 'working', proposal: null, change: String(p.text ?? '') }
    }
  }
  return r
}

async function taskOf(issueId: string) {
  const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
  if (!t) throw new PlanError('no such task')
  if (t.parentId) throw new PlanError('a data agent is a task\'s, not a sub-task\'s')
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  return { t, a }
}
export const dataSession = async (issueId: string) => (await db.select().from(session).where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), sql`${session.subjectRef}->>'dataOf' = ${issueId}`)).orderBy(session.createdAt).limit(1))[0] ?? null
export async function roundOf(issueId: string): Promise<Round> {
  return reduce(await db.select({ type: event.type, payload: event.payload, ts: event.ts }).from(event).where(and(eq(event.issueId, issueId), like(event.type, 'data_agent.%'))).orderBy(asc(event.seq)))
}
export async function dataAgent(issueId: string): Promise<DataAgentView> {
  const s = await dataSession(issueId)
  const { talkBusy } = await import('./talk.js')
  return { ...(await roundOf(issueId)), sessionId: s?.id ?? null, busy: s ? talkBusy(s.id) : false }
}
const emit = async (issueId: string, type: string, payload: Record<string, unknown>, actor: string) => {
  const { t, a } = await taskOf(issueId)
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type, payload }))
}

/** The task's data agent, started if it has none: in the folder the task's own agent works in, which it only reads. */
export async function ensureDataAgent(issueId: string) {
  const there = await dataSession(issueId)
  if (there) return there
  const { t, a } = await taskOf(issueId)
  const { taskTalk } = await import('./talk.js')
  const home = await taskTalk(issueId)
  const cwd = home?.cwd ?? (await (await import('./workbench.js')).homeRepo(a.id))?.localPath
  if (!cwd) throw new PlanError('the task has no folder to read its code in: start the task\'s agent first')
  const [row] = await db.insert(session).values({
    id: newId('session'), appId: a.id, kind: 'talk', cwd, branch: home?.branch ?? null, worktreePath: null,
    subject: `Data for ${identifier(a.key, t.number)}`, subjectRef: { dataOf: issueId }, createdBy: 'engine', lastActiveAt: new Date(), autoApprove: 'moderate',
  }).returning()
  return row
}

const NEXT: Record<Step, string> = {
  1: 'Do step 1 now: read the task and the code on its branch, list what it calls outside the app (task_calls), then propose it (data_step, op propose, step 1) and stop.',
  2: 'Do step 2 now: for each call, say what will answer it and what that is made from; say the files a tester needs and the fixture. Change nothing. Propose it (data_step, op propose, step 2, with services) and stop.',
  3: 'Do step 3 now: build what was approved in step 2, and only that. Then say what you built and what is still missing (data_step, op propose, step 3) and stop.',
}

/**
 * The data agent is asked for something: by the task's agent (from: its conversation, where the answer goes back
 * when the data agent's turn ends) or by the person. With no round open, one starts at step 1. While it waits for
 * the person, what is said is passed on and the step is not left.
 */
export async function askDataAgent(issueId: string, text: string, o: { from?: string | null; actor?: string } = {}) {
  const said = text.trim()
  if (!said) throw new PlanError('say what the task needs of its data')
  const s = await ensureDataAgent(issueId)
  const was = await roundOf(issueId)
  const starts = was.state === 'none' || was.state === 'done'
  if (starts) await emit(issueId, 'data_agent.asked', { text: said.slice(0, 4000), from: o.from ?? null }, o.actor ?? (o.from ? 'agent' : 'user'))
  const { say } = await import('./talk.js')
  const lead = starts ? `${NEXT[1]}\n\nWhat is asked:\n` : was.state === 'proposed' ? `You are waiting for the person on step ${was.step}; stay there. Take this into account when you go on:\n` : `You are on step ${was.step}. Take this into account:\n`
  await say(s.id, lead + said, undefined, { author: 'engine', kind: 'brief', payload: { ...(o.from ? { from: o.from } : {}), label: o.from ? 'From this task\'s agent' : 'From you, on the Data step' } })
  return { sessionId: s.id, started: starts, step: starts ? 1 : was.step, next: 'It works one step and stops for the person, who lets it go on from the task\'s Data step. What it says comes back to you as a message when its turn ends; do not wait or poll.' }
}

/** The data agent says it has finished the step it is on: what it proposes, or (step 3) what it built. It then waits. */
export async function proposeStep(sessionId: string, i: { step: number; summary: string; services?: string[] }) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  const issueId = (s?.subjectRef as { dataOf?: string } | null)?.dataOf
  if (!issueId) throw new PlanError('only a task\'s data agent proposes a step')
  const r = await roundOf(issueId)
  if (r.state !== 'working') throw new PlanError(r.state === 'proposed' ? `step ${r.step} is proposed already and waits for the person: stop here` : 'nothing has been asked of you: wait to be asked')
  if (i.step !== r.step) throw new PlanError(`you are on step ${r.step} (${STEPS[r.step].name}), not step ${i.step}`)
  const summary = i.summary.trim()
  if (!summary) throw new PlanError('summary is what the person reads to approve the step: write it')
  if (summary.length > SUMMARY_MAX) throw new PlanError(`a step's summary is at most ${SUMMARY_MAX} characters: the person reads it before pressing`)
  const services = [...new Set((i.services ?? []).map(standInKey).filter(Boolean))]
  if (r.step === 2 && !services.length) throw new PlanError('step 2 names the services you will build for (services: their keys): step 3 is held to them')
  await emit(issueId, 'data_agent.proposed', { step: r.step, summary, services }, 'agent')
  return { step: r.step, waiting: true, next: 'Stop now. The person reads this on the task\'s Data step and approves it or says what to change; you are told which.' }
}

/** The person lets it go on: the step it proposed stands, and it is told to do the next (or, after the third, nothing). */
export async function approveStep(issueId: string, actor = 'user') {
  const r = await roundOf(issueId)
  if (r.state !== 'proposed') throw new PlanError('the data agent has nothing waiting to be approved')
  await emit(issueId, 'data_agent.approved', { step: r.step }, actor)
  if (r.step < 3) {
    const s = await ensureDataAgent(issueId)
    const { say, taskTalk } = await import('./talk.js')
    const home = await taskTalk(issueId)
    await say(s.id, `The person approved step ${r.step} (${STEPS[r.step].name}) as you proposed it. ${NEXT[(r.step + 1) as Step]}`, undefined, { author: 'engine', kind: 'brief', payload: { ...(home ? { from: home.id } : {}), label: `Step ${r.step} approved` } })
  }
  return dataAgent(issueId)
}

/** The person wants the step done differently: it is told what, does the step again and proposes again. */
export async function changeStep(issueId: string, text: string, actor = 'user') {
  const said = text.trim()
  if (!said) throw new PlanError('say what to change')
  const r = await roundOf(issueId)
  if (r.state !== 'proposed') throw new PlanError('the data agent has nothing waiting to be changed')
  await emit(issueId, 'data_agent.change', { step: r.step, text: said.slice(0, 4000) }, actor)
  const s = await ensureDataAgent(issueId)
  const { say, taskTalk } = await import('./talk.js')
  const home = await taskTalk(issueId)
  await say(s.id, `The person did not approve step ${r.step} (${STEPS[r.step].name}). What they want changed:\n\n${said}\n\n${r.step === 3 ? 'Change what you built to match, staying inside what step 2 approved; if this needs more than that, say so in your summary and build nothing beyond it.' : 'Do the step again with that.'} Then propose step ${r.step} again and stop.`, undefined, { author: 'engine', kind: 'brief', payload: { ...(home ? { from: home.id } : {}), label: `Step ${r.step}: a change` } })
  return dataAgent(issueId)
}

// ---- the wall: who may change a task's data, and when ---------------------------------------------------------------

/** The tools that change a task's calls, services, data and files, each with the ops that only read. */
export const DATA_TOOLS: Record<string, Set<string>> = { task_calls: new Set(['list']), service: new Set(['list', 'fixtures']), mock: new Set(), mock_data: new Set(), test_files: new Set(['list']) }
/** What a conversation is, for this wall. */
export type Caller = { kind: 'data'; round: Round } | { kind: 'task' } | { kind: 'other' }
/** Why a call is refused, or null when it may go on. Pure: the caller and the call say everything. */
export function refusal(c: Caller, tool: string, args: { op?: string; service?: string; mock?: string; key?: string }): string | null {
  const reads = DATA_TOOLS[tool]
  if (!reads || reads.has(String(args.op ?? ''))) return null
  if (c.kind === 'other') return null
  if (c.kind === 'task') return 'A task\'s calls, services, data and test files are changed by its data agent, not by you: ask it with the data_agent tool, saying what the task needs. It works in three steps and the person approves each on the Data step. You can still read all of it (the list ops, and mocks).'
  const r = c.round
  if (r.state === 'none' || r.state === 'done') return 'Nothing is asked of you now: your last round is finished. Wait to be asked.'
  if (r.state === 'proposed') return `You proposed step ${r.step} and the person has not answered yet. Change nothing; stop and wait.`
  if (r.step === 1) return tool === 'task_calls' ? null : 'Step 1 only lists what the task calls (task_calls). Services\' endpoints, data and files are step 3, after the person approves step 2.'
  if (r.step === 2) return 'Step 2 changes nothing: say where each call\'s data will come from and propose it (data_step). Building is step 3, after the person approves.'
  const allowed = r.approved.find((p) => p.step === 2)?.services ?? []
  const named = [args.service, args.mock, tool === 'service' || tool === 'mock' ? args.key : undefined].filter((x): x is string => !!x).map(standInKey)
  const out = named.find((k) => allowed.length && !allowed.includes(k))
  return out ? `"${out}" is not one of the services the person approved in step 2 (${allowed.join(', ')}). Build only what was approved; say in your summary that it is needed, and it can be asked for in another round.` : null
}
export async function callerOf(sessionId: string | null | undefined): Promise<Caller> {
  if (!sessionId) return { kind: 'other' }
  const [s] = await db.select({ ref: session.subjectRef, worktreePath: session.worktreePath }).from(session).where(eq(session.id, sessionId))
  const ref = s?.ref as { dataOf?: string; issueId?: string; app?: boolean; prototypeId?: string } | null
  if (ref?.dataOf) return { kind: 'data', round: await roundOf(ref.dataOf) }
  if (ref?.issueId && !ref.app && !ref.prototypeId) return { kind: 'task' }
  return { kind: 'other' }
}

// ---- what each agent is told -----------------------------------------------------------------------------------------------

/** The data agent's own instructions. */
export function dataPrompt(t: { id: string; title: string; description?: string | null; brief?: string | null }, ident: string, r: Round): string {
  return `

You are the data agent of one task, ${ident} "${t.title}" (issueId ${t.id}). Your whole job is what this task needs outside its own code in order to be tried: the outside services it calls, what answers each call when the real service must not, the files a tester brings to it, and the rows its database starts from. You write no code of the app and change no file in this folder: you read the code here, and you work through the engine's tools. The task's own agent asks you; a person approves your work.

You work in three steps, and you stop after each. The person reads what you propose on the task's Data step and either approves it or says what to change; you are told which. Never go on to the next step on your own, and never treat silence, or your own judgement that a step is obvious, as approval. The engine refuses the building tools until step 2 is approved, so trying early only wastes a turn.

Step 1, what the task calls. Read the task (the task tool), its brief and the code on this branch, and find every call the change makes outside the app: the client code, the address and key settings it reads, the paths. Set the task's services and calls (task_calls: op service for each outside service, named exactly as the app's settings name it; then op set with each call's method, path with {id} for a part that varies, and what this task needs from it: what must come back and the cases it has to show). A change that calls nothing outside is a real answer: say so. Then propose: data_step, op propose, step 1, with a summary the person can check against what they know, one line a call, and anything you were unsure of.

Step 2, where the data comes from. Change nothing in this step. An endpoint has a default response and may have a different one for any fixture (service, op fixtures lists the app's): a run started from a fixture is served that fixture's response where there is one, else the default. So first say which fixtures this task will be tried from, and for each call whether the default serves them all or a fixture needs a response of its own because its content must differ (how many people, how much each has: a company of hundreds wants most with nothing found and a few with a lot, not one person's full answer repeated). Then, for each response you name, say what will answer it and what that is made from, choosing the first of these that is true: an endpoint that already has safe data (say so and leave it); a real response on this computer that is not faked yet (you will fake it); a real response the person has to give (say exactly which call, and what kind of file would do: you never ask for its contents in a message); or nothing real to be had, so you will write made-up data from the code and the contract, marked as assumed. Say which calls answer with something that is someone's and must be marked sensitive. Say what a tester needs in their hands (a file to import, a picture to upload) and that you will write a made-up one. Say whether the task needs rows in the app's database before it can be tried, and from which fixture. Then propose: data_step, op propose, step 2, with services (the keys of every service you will build for) and a summary laid out service by service, call by call. What you list here is all you may build.

Step 3, build it. Build what step 2 approved and only that: services and their endpoints (the service tool), fakes of real responses (mock_data, op fake; the faker keeps structure and replaces values, and refuses while a real value is left: fix the plan, never the check), made-up data you write (service, op endpoint_data, stated as holding nothing real), test files (test_files, op add), a response for one fixture (the same ops with response: the fixture's name; given on this task, with issueId, it is this task's own and other tasks keep the app's), and, only where the app matches what comes back to who it sent, the columns that say who a response answers for set from a fixture's people (service, op endpoint_fixture). That last is an override of who, not a way to make a response: it never changes what a response says of each person, so it is no answer to a fixture that needs different content. If something approved cannot be built, do not build something else in its place: leave it and say why. Then propose: data_step, op propose, step 3, with a summary of what now answers each call, what you could not build, and what the person still has to do (a real response to give, a fixture to make).

What is real never leaves this computer and never enters a message. You may be shown that a real response exists, its file names, its columns and its size; never repeat a value from one, in a summary, a message to the task's agent or made-up data, and never copy one into data you write. Made-up people have invented names and example.com addresses. A reviewer is only ever given faked or made-up data: if a call cannot have either, say so plainly in step 2.

Keep each summary to what the person needs to press Approve: short lines, the calls by method and path, no account of how you worked. When your turn ends, what you last said goes back to the task's agent, so end each turn with one or two sentences saying which step you finished and that it waits for the person.

Where you stand now: ${r.state === 'none' || r.state === 'done' ? 'nothing is asked of you yet.' : r.state === 'proposed' ? `you proposed step ${r.step} and are waiting for the person.` : `you are on step ${r.step} (${STEPS[r.step].name}).`}${r.approved.length ? ` Approved so far this round: ${r.approved.map((p) => `step ${p.step}`).join(', ')}.` : ''} data_step, op state, says it again at any time.`
}

/** What a task's own agent is told: its data is the data agent's. */
export const DATA_AGENT_NOTE = `\n\nThis task's data is its data agent's, not yours. What the task calls outside the app, the services and their endpoints, what answers each call (its default response and any response for one fixture: fakes and made-up data), its test files and who a response answers for are all set by the data agent, a separate agent with its own instructions: you can read them (task_calls op list, service op list, mocks, test_files op list) and you cannot change them, whatever else in these instructions says you set them. When the task needs any of that (when you first reach its data, when the code comes to call something new, when a tester needs a file), ask it: data_agent, with issueId and message saying what the change does and what it needs. It works in three steps (what the task calls; where each call's data comes from; build) and stops after each for the person, who approves on the task's Data step: tell the person it is waiting there, and do not wait or poll. What it says comes back to you as a message.`
