/**
 * Learn has two roles (Sandy, 2026-11-16: "1 is to analyze observations, the other is to analyze the codebase. The
 * latter would be the first step when you approach a new project. And you could get ideas from learn, the learn
 * agent can create ideas … it would also be the access point to the workbench docs").
 *
 * This is the second: an agent reads the app's code and writes down what it found, as a small fixed set of
 * documents, one of each per app. They are the workbench docs: what the app's repositories are and how they are
 * worked on, read on the Learn page and, later, by every agent that would otherwise read the code from nothing.
 * What it thinks should change, it keeps as ideas, which is how Learn feeds Ideate.
 *
 * Each document is in two parts, after the rule that what a person reads is short: `summary` is for the person
 * and held to a size; `body` is for agents, and may run long.
 */
import { and, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, learning, session } from './db/schema.js'
import { appendEvent } from './events.js'
import { headSha } from './git.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'
import { homeRepo } from './workbench.js'

export interface LearnDoc { key: string; title: string; asks: string }
/** The documents, in the order they are read. A fixed set: every app has the same ones, so agents know where to look. */
export const LEARN_DOCS: LearnDoc[] = [
  { key: 'what', title: 'What it is', asks: 'What the app does and for whom, as someone would say it who had used it. What is built and working, what is half there, what is only planned.' },
  { key: 'parts', title: 'The parts', asks: 'The repositories and the main folders in each, what each is for, and how they talk to each other (which calls which, over what). Where the data lives. What is shared between parts.' },
  { key: 'run', title: 'Running and testing it', asks: 'The exact commands to run it and to test it, and what each needs (services, secrets by name only, ports). How long the tests take and what makes them slow: say plainly if one command runs far more than a small change needs. Which tests fail now and then.' },
  { key: 'fragile', title: 'What is fragile', asks: 'What breaks easily or would hurt most if it broke: code many parts lean on, anything with no tests, anything done by hand, known debt. For each, how someone would notice.' },
]
export const SUMMARY_MAX = 700 // for the person: a short paragraph or five bullets
export const BODY_MAX = 8000 // for agents
export const IDEAS_MAX = 3

export interface Learned { key: string; title: string; summary: string; body: string; sha: string | null; updatedAt: string }
export interface Learning {
  docs: Learned[]
  /** The documents not written yet, by title. */
  missing: string[]
  /** The conversation that is reading the code, while it works. */
  working: { sessionId: string } | null
  /** Its conversation, working or not, to go back to. */
  sessionId: string | null
  /** The code has moved since they were written: how many documents were written at another commit. */
  stale: number
}

const openTalk = async (appId: string) => (await db.select().from(session).where(and(eq(session.appId, appId), eq(session.kind, 'talk'), eq(session.status, 'open'))))
  .filter((s) => (s.subjectRef as { learn?: string } | null)?.learn === 'codebase').sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null

export async function listLearning(appId: string, busy: (sessionId: string) => boolean = () => false): Promise<Learning> {
  const rows = await db.select().from(learning).where(eq(learning.appId, appId))
  const docs = LEARN_DOCS.flatMap((d) => { const r = rows.find((x) => x.key === d.key); return r ? [{ key: d.key, title: d.title, summary: r.summary, body: r.body, sha: r.sha, updatedAt: (r.updatedAt ?? r.createdAt).toISOString() }] : [] })
  const talk = await openTalk(appId)
  const r = await homeRepo(appId).catch(() => null)
  const head = r?.localPath ? await headSha(r.localPath).catch(() => null) : null
  return {
    docs, missing: LEARN_DOCS.filter((d) => !docs.some((x) => x.key === d.key)).map((d) => d.title),
    working: talk && busy(talk.id) ? { sessionId: talk.id } : null, sessionId: talk?.id ?? null,
    stale: head ? docs.filter((d) => d.sha && d.sha !== head).length : 0,
  }
}

/** Write one of the documents, replacing what was there. The summary is held to its size: too long is refused, not cut. */
export async function setLearning(appId: string, input: { key: string; summary: string; body: string }, actor = 'agent', sessionId: string | null = null) {
  const doc = LEARN_DOCS.find((d) => d.key === input.key)
  if (!doc) throw new PlanError(`no document "${input.key}"; they are ${LEARN_DOCS.map((d) => d.key).join(', ')}`)
  const summary = (input.summary ?? '').trim(), body = (input.body ?? '').trim()
  if (!summary) throw new PlanError('a document needs its summary: the short part a person reads')
  if (summary.length > SUMMARY_MAX) throw new PlanError(`the summary is ${summary.length} characters; a person reads it, so it is ${SUMMARY_MAX} at most. Say less; the detail goes in the body.`)
  if (body.length > BODY_MAX) throw new PlanError(`the body is ${body.length} characters; ${BODY_MAX} at most`)
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const r = await homeRepo(appId).catch(() => null)
  const sha = r?.localPath ? await headSha(r.localPath).catch(() => null) : null
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(learning).where(and(eq(learning.appId, appId), eq(learning.key, doc.key)))
    if (old) await tx.update(learning).set({ summary, body, sha, sessionId, updatedAt: new Date() }).where(eq(learning.id, old.id))
    else await tx.insert(learning).values({ id: newId('run').replace(/^run_/, 'learn_'), appId, key: doc.key, summary, body, sha, sessionId })
    await appendEvent(tx, { workspaceId: a.workspaceId, appId, sessionId, actor, type: 'learn.written', payload: { key: doc.key, title: doc.title } })
  })
  return { key: doc.key, title: doc.title, note: `Written. It shows on the Learn page as "${doc.title}".` }
}

/** What the agent is told. */
export const learnBrief = (a: { name: string }, repos: string[]) => [
  `Learn the codebase of ${a.name}, and write down what you find so that nobody has to read it from nothing again: not the person, and not the agents that plan and build here.`,
  ...(repos.length > 1 ? [`It is made of ${repos.length} repositories: ${repos.join(', ')}. Read all of them.`] : []),
  '',
  'Read, do not change anything. Run a command only to find something out (a test list, a dry run); do not run the whole test suite.',
  '',
  `Write these ${LEARN_DOCS.length} documents with set_learning, one call each:`,
  ...LEARN_DOCS.map((d) => `- ${d.key}: **${d.title}**. ${d.asks}`),
  '',
  'Each has two parts:',
  `- summary: for the person, who will read only this. Plain words, ${SUMMARY_MAX} characters at most, a short paragraph or up to five bullets. Lead with what would surprise them.`,
  `- body: for the agents that work here next. Exact paths, commands and names; ${BODY_MAX} characters at most. Say what you checked and what you only inferred.`,
  '',
  `Then, if you saw things that should change, keep up to ${IDEAS_MAX} of them as ideas with create_idea: the ones that would save the most time or risk. One sentence of why each, with the evidence. No ideas is a fine answer.`,
  '',
  'The person may keep pages of their own about this app (app_docs): how they understand it, in their words. Read them before you start. Where the code says otherwise, do not change their page: tell them which page, what it says and what you found, in your last message.',
  '',
  'Finish with three lines for the person: what you wrote, the idea or two you kept, and anything you could not find out.',
].join('\n')
