/**
 * A task's hand-over: asked of a fork of the conversation that made it, once, and kept on the task. The fork itself
 * (the model call) is swapped for a function here; that a fork answers from the conversation and leaves it alone was
 * tried for real on a scratch conversation (LOG.md, "A task starts with a hand-over").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, issue, session, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { issueDetail } from './projects.js'
import { handoverNote, handoverPrompt, writeHandover, type AskFork } from './handover.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a task\'s hand-over', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const talk = (extra: object = {}) => db.insert(session).values({ id: newId('session'), appId, kind: 'talk', cwd: '/tmp/none', title: 'Launch plans (test)', subject: 'x', createdBy: 'user', agentSessionId: 'cc-test', ...extra }).returning().then((r) => r[0])
  const made = (title: string, sessionId?: string) => createIssue(appId, { title, kind: 'code', description: 'What changes', source: sessionId ? 'agent' : 'person', sourceRef: sessionId ? { sessionId } : null })
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'hand-over test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await pool.end() })

  it('asks a fork of the conversation that made the task, once, and keeps the answer on the task', async () => {
    const s = await talk()
    const t = await made('Teal launch page', s.id)
    const asked: Parameters<AskFork>[0][] = []
    const ask: AskFork = async (i) => { asked.push(i); return '## What was decided\nTeal, not orange.' }
    const first = await writeHandover(t.id, { ask })
    expect(first.handover).toMatchObject({ text: '## What was decided\nTeal, not orange.', sessionId: s.id })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ agentSessionId: 'cc-test', cwd: '/tmp/none' })
    expect(asked[0].prompt).toContain('"Teal launch page"')
    await writeHandover(t.id, { ask }) // already written: not asked again
    expect(asked).toHaveLength(1)
    await writeHandover(t.id, { ask, again: true })
    expect(asked).toHaveLength(2)
    const d = await issueDetail(t.id)
    expect(d.handover?.text).toContain('Teal')
    expect(d.madeBy).toMatchObject({ sessionId: s.id, title: 'Launch plans (test)', open: true }) // which conversation made it: there can be several
  })

  it('is fine with nothing: a task a person made, a conversation with nothing to read, a conversation that said nothing', async () => {
    const never: AskFork = async () => { throw new Error('should not be asked') }
    const byHand = await made('Made on the Plan page')
    expect(await writeHandover(byHand.id, { ask: never })).toMatchObject({ handover: null, why: expect.stringContaining('not made from a conversation') })
    expect((await issueDetail(byHand.id)).madeBy).toBeNull()
    const unstarted = await talk({ agentSessionId: null })
    const t2 = await made('From a conversation never started', unstarted.id)
    expect(await writeHandover(t2.id, { ask: never })).toMatchObject({ handover: null })
    const s = await talk()
    const t3 = await made('Only its title was said', s.id)
    let n = 0
    const nothing: AskFork = async () => { n++; return 'NOTHING' }
    expect((await writeHandover(t3.id, { ask: nothing })).handover).toMatchObject({ text: null, sessionId: s.id })
    await writeHandover(t3.id, { ask: nothing }) // "nothing" is an answer too: not asked again
    expect(n).toBe(1)
    const [row] = await db.select().from(issue).where(eq(issue.id, t3.id))
    expect(handoverNote(row.handover, 'Launch plans (test)')).toBe('')
  })

  it('two starts at once write it once', async () => {
    const s = await talk()
    const t = await made('Pressed twice', s.id)
    let n = 0
    const slow: AskFork = async () => { n++; await new Promise((r) => setTimeout(r, 50)); return 'Said once.' }
    const [a, b] = await Promise.all([writeHandover(t.id, { ask: slow }), writeHandover(t.id, { ask: slow })])
    expect(n).toBe(1)
    expect(a.handover?.text).toBe('Said once.')
    expect(b.handover?.text).toBe('Said once.')
  })

  it('tells the task agent whose account it is and that the person outranks it', () => {
    const note = handoverNote({ text: 'Teal.', sessionId: 's', at: '2026-11-14T00:00:00Z' }, 'Launch plans (test)')
    expect(note).toContain('"Launch plans (test)"')
    expect(note).toContain('<hand-over>\nTeal.\n</hand-over>')
    expect(note).toContain('the person is right')
    expect(handoverPrompt({ identifier: 'SS-1', title: 'T', description: null })).toContain('NOTHING')
  })
})
