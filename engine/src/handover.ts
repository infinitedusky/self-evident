/**
 * The hand-over: what the conversation that created a task said about it, written down for the task's own agent
 * (Sandy, 2026-11-14: "the global agent is creating the tasks, which is why the task agent wants to first get as much
 * information as it can before it starts working"; LOG.md, "A task starts with a hand-over").
 *
 * A task made by an agent remembers the conversation it was made in (source_ref.sessionId). When the task's agent
 * starts, that conversation is forked, the fork is asked once for everything said about the task, and the fork is
 * thrown away: the conversation itself is not touched and gets no turn. The answer is kept on the task and goes into
 * the task agent's instructions. A task made by a person, or from a conversation with nothing to read, has none, and
 * that is fine.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { eq } from 'drizzle-orm'
import { accountEnv } from './account.js'
import { db } from './db/client.js'
import { app, issue, session } from './db/schema.js'
import { appendEvent } from './events.js'
import { withLock } from './landing.js'
import { PlanError } from './projects.js'

export type Handover = { text: string | null; sessionId: string; at: string }
/** Asks a fork of one conversation one question and returns its answer. Swapped out in tests. */
export type AskFork = (i: { cwd: string; agentSessionId: string; prompt: string; setup: unknown; model?: string }) => Promise<string>

const NOTHING = 'NOTHING'

export const handoverPrompt = (t: { identifier: string; title: string; description: string | null }) => [
  `Stop here: this is a side question, asked of a copy of this conversation. Nothing you say is seen by the person, and you have no tools.`,
  `A task was created from this conversation: ${t.identifier} "${t.title}"${t.description ? ` (${t.description})` : ''}. Its own agent is about to start work on it and has seen none of this conversation.`,
  `Write that agent's hand-over: everything said in this conversation that bears on that task, and nothing else. Use these headings, leaving out any with nothing under it:`,
  `## What it is for\n## What was decided\n## What was ruled out, and why\n## Constraints\n## Still open`,
  `Quote the person's own words where the wording matters. Name files, pages and other tasks exactly as they were named here. Only what was actually said: no guesses, no advice of your own, no plan. Markdown, short lines.`,
  `If this conversation says nothing about the task beyond its title and description, answer with the single word ${NOTHING}.`,
].join('\n\n')

const askFork: AskFork = async ({ cwd, agentSessionId, prompt, setup, model }) => {
  let out = ''
  // forkSession: the conversation's own file is read, never written; persistSession false: the fork leaves no file.
  for await (const m of query({ prompt, options: { ...accountEnv(setup), cwd, model, resume: agentSessionId, forkSession: true, persistSession: false, maxTurns: 1, tools: [], allowedTools: [], settingSources: [] } })) {
    if (m.type === 'result') { if (m.subtype !== 'success') throw new PlanError(`the hand-over could not be written: ${m.subtype}`); out = m.result }
  }
  return out
}

/**
 * Write a task's hand-over if it has none (or again, when asked). Returns it, or null with the reason there is none.
 * One at a time per task; a second caller waits and gets the first one's result.
 */
export async function writeHandover(issueId: string, opts: { again?: boolean; ask?: AskFork } = {}): Promise<{ handover: Handover | null; why?: string }> {
  return withLock(`handover:${issueId}`, async () => {
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    if (!t) throw new PlanError(`no task ${issueId}`)
    if (t.handover && !opts.again) return { handover: t.handover }
    const sid = (t.sourceRef as { sessionId?: string } | null)?.sessionId
    if (!sid) return { handover: null, why: 'It was not made from a conversation.' }
    const [s] = await db.select().from(session).where(eq(session.id, sid))
    if (!s?.agentSessionId || !s.cwd) return { handover: null, why: 'The conversation that made it has nothing to read.' }
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    const said = (await (opts.ask ?? askFork)({ cwd: s.cwd, agentSessionId: s.agentSessionId, setup: a.setup, model: (a.setup as { model?: string } | null)?.model,
      prompt: handoverPrompt({ identifier: `${a.key}-${t.number}`, title: t.title, description: t.description }) })).trim()
    const handover: Handover = { text: !said || said === NOTHING ? null : said, sessionId: sid, at: new Date().toISOString() }
    await db.transaction(async (tx) => {
      await tx.update(issue).set({ handover, updatedAt: new Date() }).where(eq(issue.id, issueId))
      await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId, actor: 'engine', type: 'issue.updated', payload: { identifier: `${a.key}-${t.number}`, number: t.number, changed: ['handover'] } })
    })
    return { handover }
  })
}

/** For the task agent's instructions: the hand-over, or nothing. */
export const handoverNote = (h: Handover | null | undefined, from: string | null) => (h?.text ? `

The conversation that created this task${from ? ` ("${from}")` : ''} said this about it. It is that conversation's account, written for you before you started; the person can see it on the task's page. Read it before asking the person anything it already answers, and where it and the person disagree, the person is right:

<hand-over>
${h.text}
</hand-over>
` : '')
