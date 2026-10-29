/**
 * A project's backlog: issues in the Backlog state, kept once; an idea joins and leaves the inbox; each leaves the
 * backlog taken on, a duplicate of what covers it, or dropped with a reason (never silently); a closed project's backlog is closed, the planner's "later" joins it, and
 * a builder's "Later:" lines are read from its summary.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addIdea, addItems, dropItem, laterFrom, listBacklog, markDuplicate, promote, reopenItem } from './backlog.js'
import { db, pool } from './db/client.js'
import { app, idea, project, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIdea } from './ideas.js'
import { planIssue, type Propose } from './planner.js'
import { createProject, PlanError, projectGraph } from './projects.js'
import { approveBriefs } from './test-briefs.js'

describe('laterFrom', () => {
  it('reads the bullets under a Later: line, and nothing else', () => {
    expect(laterFrom('Changed the cart.\n\nTested with pnpm test.\n\nLater:\n- The header link 404s\n* Discount codes are case-sensitive\n')).toEqual(['The header link 404s', 'Discount codes are case-sensitive'])
    expect(laterFrom('Done.\n\n**Later:**\n1. Add a test for refunds\n\nThat is all.')).toEqual(['Add a test for refunds'])
    expect(laterFrom('Done. Nothing for later here.\n- a list that is not under Later')).toEqual([])
    expect(laterFrom('Later:\n- none')).toEqual([])
    expect(laterFrom(undefined)).toEqual([])
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('backlog', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'backlog test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'true' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: await mkdtemp(join(tmpdir(), 'if-backlog-')) })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('keeps items once, takes an idea out of the inbox, and every one leaves the backlog taken on, a duplicate, or dropped with a reason', async () => {
    const { project: p, issues } = await createProject({ appId, name: 'with a backlog', issues: [{ title: 'Checkout' }] })
    const added = await addItems(p.id, [{ text: '  Refunds  ' }, { text: 'refunds' }, { text: '' }, { text: 'Gift cards', body: 'people asked twice' }])
    expect(added.map((i) => [i.title, i.source, i.state, i.kind])).toEqual([['Refunds', 'person', 'backlog', 'code'], ['Gift cards', 'person', 'backlog', 'code']])
    expect(added[1].description).toBe('people asked twice')

    const i = await createIdea({ appId, title: 'Saved carts' })
    const fromIdea = await addIdea(p.id, i.id)
    expect(fromIdea).toMatchObject({ title: 'Saved carts', source: 'idea', ideaId: i.id, state: 'backlog' })
    expect((await db.select().from(idea).where(eq(idea.id, i.id)))[0].lane).toBe('build')
    await expect(addIdea(p.id, i.id)).rejects.toThrow(/already in this project/)

    const [refunds, gift] = added
    const taken = await promote(refunds.id)
    expect(taken).toMatchObject({ id: refunds.id, title: 'Refunds', state: 'todo', brief: 'Refunds', delegate: 'planner' })
    await expect(promote(refunds.id)).rejects.toThrow(/not in the backlog/)

    const dup = await markDuplicate(fromIdea.id, issues[0].id)
    expect(dup).toMatchObject({ state: 'duplicate' })
    expect(dup.reason).toMatch(/covered by .+-\d+ Checkout/)
    await expect(dropItem(gift.id, '  ')).rejects.toThrow(/why/)
    const dropped = await dropItem(gift.id, 'not this season')
    expect(dropped).toMatchObject({ state: 'canceled', reason: 'not this season' })
    expect((await reopenItem(gift.id))).toMatchObject({ state: 'backlog', reason: null })
    expect((await reopenItem(fromIdea.id))).toMatchObject({ state: 'backlog' })
    await markDuplicate(fromIdea.id, issues[0].id, 'checkout keeps the cart')

    const g = (await projectGraph(p.id))!
    expect(g.issues.map((t) => t.title)).toEqual(['Checkout', 'Refunds']) // taken on: it is work now, at the end
    expect(g.backlog.map((b) => [b.title, b.state, b.duplicateOf])).toEqual([['Gift cards', 'backlog', null], ['Saved carts', 'duplicate', issues[0].id]])

    await db.update(project).set({ status: 'landed' }).where(eq(project.id, p.id))
    await expect(addItems(p.id, [{ text: 'too late' }])).rejects.toThrow(PlanError)
    await expect(dropItem(gift.id, 'closed')).rejects.toThrow(/landed/)
  })

  it('what the planner noticed but left out joins the backlog', async () => {
    const { project: p, issues } = await createProject({ appId, name: 'planner later', issues: [{ title: 'Measure checkout' }] })
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'a', title: 'A', description: 'a', summary: 'a', depends_on: [], files: ['a.ts'], steps: [], checks: [], done_when: '' }],
      decisions: [], questions: [], notes: '',
      later: [{ text: 'The cart page has no empty state', why: 'seen while reading cart.tsx' }],
    } })
    await approveBriefs(appId)
    await planIssue(issues[0].id, { propose })
    expect((await listBacklog(p.id)).filter((b) => b.state === 'backlog').map((b) => [b.title, b.description, b.source, (b.sourceRef as any)?.issueId])).toEqual([['The cart page has no empty state', 'seen while reading cart.tsx', 'planner', issues[0].id]])
  })
})
