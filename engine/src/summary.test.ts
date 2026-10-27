/**
 * The summary's focus section: written from the app's facts, every line citing the rows it rests on; refs the model
 * made up are dropped, and so is a line left with none. It is stale once something happens after it, and the schedule
 * rewrites it only then.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, project, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { dueApps, focusFacts, latestFocus, writeFocus } from './summary.js'
import { createCycle, createInitiative, updateInitiative } from './goals.js'
import { createTodo } from './todos.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('summary', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'summary test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('gathers projects, issues and to-dos, each a ref the text may cite', async () => {
    const { project: p } = await createProject({ appId, name: 'Turn replay', content: 'catch regressions before callers do', issues: [{ title: 'Capture each turn' }] })
    const t = await createTodo({ appId, title: 'Ask for a test number', checklist: ['Email the carrier'] })
    const { facts, links } = await focusFacts(appId)
    expect(facts.projects[0]).toMatchObject({ id: p.id, name: 'Turn replay', why: 'catch regressions before callers do', issues: [{ title: 'Capture each turn' }] })
    expect(facts.todos[0]).toMatchObject({ id: t.id, owner: 'the person', next: 'Email the carrier' })
    expect(links[p.id]).toMatchObject({ kind: 'project', label: 'Turn replay' })
    expect(links[t.id]).toMatchObject({ kind: 'todo' })
  })

  it('stated goals come first: initiatives and the current cycle, cited like anything else', async () => {
    const before = await focusFacts(appId)
    expect(before.stated).toBe(false)
    const projectId = before.facts.projects[0].id
    const goal = await createInitiative({ appId, name: 'Catch regressions before callers do', projectIds: [projectId] })
    const today = new Date().toISOString().slice(0, 10)
    const week = await createCycle({ appId, startsAt: today, endsAt: today, name: 'This week', issueIds: [before.facts.projects[0].issues[0].id] })
    const { facts, links, stated } = await focusFacts(appId)
    expect(stated).toBe(true)
    expect(facts.statedGoals.initiatives).toEqual([expect.objectContaining({ id: goal.id, name: 'Catch regressions before callers do', projects: [projectId] })])
    expect(facts.statedGoals.cycles[0]).toMatchObject({ id: week.id, current: true, issues: [expect.objectContaining({ title: 'Capture each turn' })] })
    expect(links[goal.id]).toMatchObject({ kind: 'initiative' }); expect(links[week.id]).toMatchObject({ kind: 'cycle', label: 'This week' })
    let seen = ''
    const row = await writeFocus(appId, { write: async (p) => { seen = p; return { body: { headline: 'h', people: [], goals: { near: [], mid: [], long: [{ text: 'Catch regressions', refs: [goal.id] }] } } } } })
    expect(seen).toContain('stated by a person')
    expect(row!.body).toMatchObject({ stated: true, goals: { long: [{ refs: [goal.id] }] } })
    await updateInitiative(goal.id, { status: 'completed' })
    expect((await focusFacts(appId)).facts.statedGoals.initiatives).toEqual([])
  })

  it('keeps only lines that cite real rows, and is stale once something happens after it', async () => {
    const { facts } = await focusFacts(appId)
    const projectId = facts.projects[0].id, todoId = facts.todos[0].id
    let seen = ''
    const row = await writeFocus(appId, {
      write: async (p) => {
        seen = p
        return { body: {
          headline: ' Replay testing is planned; nothing is building. ',
          people: [{ who: 'You', doing: [{ text: 'Ask the carrier for a test number', refs: [todoId, 'todo_madeup'] }, { text: 'Something invented', refs: ['proj_nope'] }] }, { who: 'The builders', doing: [] }],
          goals: { near: [{ text: 'Start the replay project', refs: [projectId] }], mid: [], long: [{ text: 'No ref at all', refs: [] }] },
        }, costUsd: 0.02 }
      },
    })
    expect(seen).toContain('Turn replay')
    expect(row!.body).toMatchObject({
      headline: 'Replay testing is planned; nothing is building.',
      people: [{ who: 'You', doing: [{ text: 'Ask the carrier for a test number', refs: [todoId] }] }],
      goals: { near: [{ refs: [projectId] }], mid: [], long: [] },
    })
    expect(row!.costUsd).toBe('0.02')
    expect(await latestFocus(appId)).toMatchObject({ focus: { id: row!.id }, writing: false, stale: false })
    expect(await dueApps(0)).not.toContain(appId) // nothing happened since

    await createTodo({ appId, title: 'Something new' })
    expect((await latestFocus(appId)).stale).toBe(true)
    expect(await dueApps(0)).toContain(appId)
    expect(await dueApps(24)).not.toContain(appId) // stale, but not a day old
  })
})
