/** An app's own docs: pages a person keeps, written by them or by an agent at their word, read by agents. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editAppDoc, listAppDocs, PAGE_MAX, removeAppDoc, TITLE_MAX, writeAppDoc } from './app-docs.js'
import { db, pool } from './db/client.js'
import { app, event, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { learnBrief } from './learn.js'
import { riskOf } from './risk.js'
import { engineTools, READ_ONLY_TOOLS } from './tools.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('an app\'s own docs', () => {
  const wsId = newId('workspace'), appId = newId('app'), otherId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'app docs test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase() })
    await db.insert(app).values({ id: otherId, workspaceId: wsId, name: 'Other (sample)', key: otherId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { await pool.end() })

  it('starts with none; a page is written, changed in place and removed, each one an event', async () => {
    expect(await listAppDocs(appId)).toEqual([])
    const a = await writeAppDoc(appId, { title: '  How   orders flow ', body: 'The web calls the server; the tablet polls (sample).' })
    expect(a).toMatchObject({ title: 'How orders flow', by: 'user' })
    const b = await writeAppDoc(appId, { title: 'Payments', body: '' })
    const changed = await editAppDoc(a.id, { body: 'The web calls the server; the tablet is pushed to (sample).' }, 'user')
    expect(changed).toMatchObject({ id: a.id, title: 'How orders flow', body: 'The web calls the server; the tablet is pushed to (sample).' })
    expect((await listAppDocs(appId)).map((d) => d.title)).toEqual(['How orders flow', 'Payments']) // in the order first written
    expect(await listAppDocs(otherId)).toEqual([]) // another app's are its own
    await removeAppDoc(b.id)
    expect((await listAppDocs(appId)).map((d) => d.id)).toEqual([a.id])
    const types = (await db.select().from(event).where(eq(event.appId, appId))).map((e) => e.type)
    expect(types.filter((t) => t === 'doc.written')).toHaveLength(3); expect(types.filter((t) => t === 'doc.removed')).toHaveLength(1)
  })

  it('refuses a page with no title, one too long, a second page of the same title, and a page that is not this app\'s', async () => {
    await expect(writeAppDoc(appId, { title: '  ', body: 'x' })).rejects.toThrow(/needs a title/)
    await expect(writeAppDoc(appId, { title: 'x'.repeat(TITLE_MAX + 1), body: '' })).rejects.toThrow(/at most/)
    await expect(writeAppDoc(appId, { title: 'Long', body: 'x'.repeat(PAGE_MAX + 1) })).rejects.toThrow(/Make it two pages/)
    await expect(writeAppDoc(appId, { title: 'how orders FLOW', body: 'again' })).rejects.toThrow(/already has a page called "How orders flow"/)
    const [mine] = await listAppDocs(appId)
    await expect(writeAppDoc(otherId, { id: mine.id, title: 'Taken', body: '' })).rejects.toThrow(/no page/)
    await expect(editAppDoc('adoc_none', { title: 'x' })).rejects.toThrow(/no page/)
    expect(await listAppDocs(appId)).toHaveLength(1)
  })

  it('is an agent\'s to read and to write at the person\'s word, and says who wrote it last; no agent can remove one', async () => {
    const tools = engineTools({ appId })
    const call = async (name: string, args: Record<string, unknown>) => { const r = await tools.find((t) => t.name === name)!.handler(args); return { error: !!r.isError, out: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) } }
    const made = await call('write_app_doc', { title: 'Refunds', body: 'The button exists; nothing happens (sample).' })
    expect(made.error).toBe(false); expect(made.out).toMatchObject({ title: 'Refunds', by: 'agent' })
    expect((await call('write_app_doc', { title: 'Refunds', body: 'twice' })).out).toMatch(/already has a page/)
    expect((await call('write_app_doc', { id: made.out.id, title: 'Refunds', body: 'The button calls nothing (sample).' })).out).toMatchObject({ id: made.out.id, body: 'The button calls nothing (sample).' })
    const read = (await call('app_docs', {})).out as { title: string }[]
    expect(read.map((d) => d.title)).toEqual(['How orders flow', 'Refunds'])
    expect(tools.some((t) => /remove.*doc|delete.*doc/.test(t.name))).toBe(false)
    expect(READ_ONLY_TOOLS.has('app_docs')).toBe(true); expect(READ_ONLY_TOOLS.has('write_app_doc')).toBe(false)
    expect(riskOf('mcp__engine__app_docs', {}, { cwd: '/tmp' }).risk).toBe('free'); expect(riskOf('mcp__engine__write_app_doc', {}, { cwd: '/tmp' }).risk).toBe('cheap')
  })
})

describe('learning the code', () => {
  it('reads the person\'s pages first and reports where the code disagrees, without changing them', () => {
    const b = learnBrief({ name: 'Shop (sample)' }, ['acme/shop'])
    expect(b).toContain('app_docs'); expect(b).toContain('do not change their page')
  })
})
