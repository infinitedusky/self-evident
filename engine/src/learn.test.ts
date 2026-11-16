/** Learning a codebase: the documents an agent writes, the size a person's part is held to, and the brief it works from. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, session, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { BODY_MAX, IDEAS_MAX, LEARN_DOCS, learnBrief, listLearning, setLearning, SUMMARY_MAX } from './learn.js'
import { engineTools } from './tools.js'
import { riskOf } from './risk.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('the brief', () => {
  it('asks for every document in two parts, says to read and not change, and caps the ideas', () => {
    const b = learnBrief({ name: 'Shop (sample)' }, ['acme/shop', 'acme/shop-api'])
    for (const d of LEARN_DOCS) expect(b).toContain(`- ${d.key}: **${d.title}**`)
    expect(b).toContain('made of 2 repositories: acme/shop, acme/shop-api')
    expect(b).toContain('Read, do not change anything'); expect(b).toContain('do not run the whole test suite')
    expect(b).toContain(`${SUMMARY_MAX} characters at most`); expect(b).toContain(`up to ${IDEAS_MAX} of them as ideas with create_idea`)
    expect(learnBrief({ name: 'Solo (sample)' }, ['acme/solo'])).not.toContain('repositories:')
  })
})

describe.skipIf(!reachable)('learning, stored', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'learn test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await pool.end() })

  it('starts with every document missing; one written shows, and writing it again replaces it', async () => {
    expect(await listLearning(appId)).toMatchObject({ docs: [], missing: LEARN_DOCS.map((d) => d.title), working: null, sessionId: null, stale: 0 })
    await setLearning(appId, { key: 'run', summary: 'pnpm dev runs it; pnpm test takes nine minutes (sample).', body: 'web/: pnpm test draws every story eight times (sample).' })
    await setLearning(appId, { key: 'run', summary: 'pnpm dev runs it; pnpm test takes two minutes now (sample).', body: '' })
    const l = await listLearning(appId)
    expect(l.docs).toHaveLength(1)
    expect(l.docs[0]).toMatchObject({ key: 'run', title: 'Running and testing it', summary: 'pnpm dev runs it; pnpm test takes two minutes now (sample).', body: '' })
    expect(l.missing).toEqual(['What it is', 'The parts', 'What is fragile'])
    const written = (await db.select().from(event).where(eq(event.appId, appId))).filter((e) => e.type === 'learn.written')
    expect(written).toHaveLength(2); expect(written[0].payload).toMatchObject({ key: 'run' })
  })

  it('holds the person\'s part to its size, and refuses a document that is not one of the set', async () => {
    await expect(setLearning(appId, { key: 'what', summary: 'x'.repeat(SUMMARY_MAX + 1), body: '' })).rejects.toThrow(/a person reads it/)
    await expect(setLearning(appId, { key: 'what', summary: '  ', body: 'detail' })).rejects.toThrow(/needs its summary/)
    await expect(setLearning(appId, { key: 'what', summary: 'ok', body: 'x'.repeat(BODY_MAX + 1) })).rejects.toThrow(/at most/)
    await expect(setLearning(appId, { key: 'roadmap', summary: 'ok', body: '' })).rejects.toThrow(/no document "roadmap"/)
    expect((await listLearning(appId)).docs.map((d) => d.key)).toEqual(['run']) // nothing was written by the refused ones
  })

  it('is the agent\'s to read and write as tools; the conversation that is learning is found, and working only while it is', async () => {
    const sid = newId('session')
    await db.insert(session).values({ id: sid, appId, kind: 'talk', subject: 'Learn the codebase', subjectRef: { learn: 'codebase', app: true } })
    const tools = engineTools({ appId, sessionId: sid })
    const call = async (name: string, args: Record<string, unknown>) => { const r = await tools.find((t) => t.name === name)!.handler(args); return { error: !!r.isError, out: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) } }
    expect((await call('set_learning', { key: 'what', summary: 'A shop for one street (sample).', body: 'web/ is the storefront (sample).' })).error).toBe(false)
    expect((await call('set_learning', { key: 'what', summary: 'y'.repeat(SUMMARY_MAX + 5), body: '' })).error).toBe(true)
    const read = (await call('learning', {})).out
    expect(read.docs.map((d: { key: string }) => d.key)).toEqual(['what', 'run']) // in reading order
    expect(read.sessionId).toBe(sid); expect(read.working).toBeNull()
    expect((await listLearning(appId, (id) => id === sid)).working).toEqual({ sessionId: sid })
    expect(riskOf('mcp__engine__set_learning', {}, { cwd: '/tmp' }).risk).toBe('cheap'); expect(riskOf('mcp__engine__learning', {}, { cwd: '/tmp' }).risk).toBe('free')
  })
})
