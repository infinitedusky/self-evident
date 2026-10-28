/**
 * The planner with a fake proposer against the test database: the proposal becomes sub-issues (with composed briefs,
 * dependencies and file claims), provisional decisions and open questions whose cost the server sets; the run row
 * and events record it; a failed proposal is a failed run and nothing else; a planned issue is not planned twice.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, project, repo, run, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { planIssue, questionCost, subIssueBrief, validateProposal, type Proposal, type Propose } from './planner.js'
import { addItems } from './backlog.js'
import { createIssue, getIssue } from './issues.js'
import { createProject, PlanError, projectGraph } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const proposal: Proposal = {
  phases: [
    { key: 'schema', title: 'Add the settings table', description: 'For a person.', summary: 'A table for the gate schedule.', depends_on: [], files: ['poc/hg/db.py'],
      steps: [{ text: 'Add the table', technical: 'db.py: CREATE TABLE settings' }, { text: 'Migrate on boot', technical: 'init_db()' }],
      checks: [{ statement: 'The app starts with a fresh database', command: 'pytest -q poc', expected: 'all passing' }], done_when: 'Settings persist across restarts.' },
    { key: 'ui', title: 'Parent page edits the schedule', description: 'For a person.', summary: 'A form.', depends_on: ['schema'], files: ['poc/hg/app.py', 'poc/hg/templates'],
      steps: [{ text: 'Render the form', technical: '' }], checks: [], done_when: 'A parent can set the unlock period.' },
  ],
  decisions: [{ title: 'Where the schedule lives', chosen: 'A settings table in SQLite', rejected: ['Environment variables', 'A JSON file'], reason: 'It changes at runtime from the parent page.' }],
  questions: [
    { question: 'Should the default unlock period be 3–10pm?', options: [{ label: 'Yes', description: 'Matches the current hard-coded default.', changes: [] }, { label: 'No default', description: 'Locked until a parent sets one.', changes: ['brief'] }], recommended: 'Yes', reason: 'It is what works today.', cost: 'cheap' },
    { question: 'Minutes or whole hours?', options: [{ label: 'Minutes', description: '', changes: [] }, { label: 'Hours', description: '', changes: [] }], recommended: 'Minutes', reason: 'Parents asked for 3:30.', cost: 'cheap' },
  ],
  notes: 'Assumed the parent page stays server-rendered.',
}

describe.skipIf(!reachable)('planner', () => {
  const wsId = newId('workspace')
  let appId: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-planner-'))
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'planner test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'true', model: 'claude-fake' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: dir })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  const fake = (p: Proposal | Error): Propose => async (i) => {
    await i.onEvent('run.message', { text: `planning ${i.issue.title} in ${i.repoPath}` })
    if (p instanceof Error) return { status: 'failed', error: p.message, costUsd: 0.1 }
    return { status: 'completed', proposal: p, costUsd: 0.42, agentSessionId: 'sess-plan', numTurns: 7 }
  }

  it('turns a proposal into sub-issues, decisions and questions, and records the run', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'planned', issues: [
      { title: 'Groundwork', subIssues: [{ key: 'g', title: 'G', files: ['README.md'] }] },
      { title: 'Settings and the gate', brief: 'Parents set when the gate is open.' },
    ] })
    const out = await planIssue(tasks[1].id, { propose: fake(proposal) })
    expect(out.status).toBe('completed')
    expect((await getIssue(db, tasks[1].id)).state).toBe('todo') // planned, not started: Todo until a sub-issue is built (Linear's way)
    expect(out.subIssues.map((x) => x.title)).toEqual(['Add the settings table', 'Parent page edits the schedule'])

    const g = (await projectGraph(p.id))!
    const mine = g.subIssues.filter((x) => x.parentId === tasks[1].id)
    expect(mine).toHaveLength(2)
    const [schema, ui] = mine
    expect(ui.dependsOn).toEqual([schema.id])
    expect(ui.files).toEqual(['poc/hg/app.py', 'poc/hg/templates'])
    expect(schema.brief).toContain('A table for the gate schedule.')
    expect(schema.brief).toContain('1. Add the table\n   - db.py: CREATE TABLE settings')
    expect(schema.brief).toContain('- The app starts with a fresh database — `pytest -q poc` → all passing')
    expect(schema.description).toBe('For a person.')
    expect(schema.brief).toContain('**Done when:** Settings persist across restarts.')
    expect(schema).toMatchObject({ createdBy: 'planner', delegate: 'builder' })

    expect(g.decisions).toHaveLength(1)
    expect(g.decisions[0]).toMatchObject({ issueId: tasks[1].id, question: 'Where the schedule lives', chosen: 'A', provisional: true, rationale: 'It changes at runtime from the parent page.' })
    expect((g.decisions[0].options as any[]).map((o) => o.text)).toEqual(['A settings table in SQLite', 'Environment variables', 'A JSON file'])

    expect(g.questions.map((q) => [q.text, q.cost, q.status])).toEqual([
      ['Should the default unlock period be 3–10pm?', 'expensive', 'open'], // an option changes the brief: the server raised it
      ['Minutes or whole hours?', 'cheap', 'open'],
    ])
    expect((g.questions[0].options as any[]).find((o) => o.recommended).label).toBe('Yes')
    expect(g.questions[0].reason).toBe('It is what works today.')

    const [r] = await db.select().from(run).where(eq(run.id, out.runId))
    expect(r).toMatchObject({ kind: 'plan', issueId: tasks[1].id, status: 'completed', agentSessionId: 'sess-plan', model: 'claude-fake', attempt: 1 })
    expect(Number(r.costUsd)).toBe(0.42)
    expect(r.summary).toContain('Assumed the parent page stays server-rendered.')

    const types = (await db.select().from(event).where(eq(event.issueId, tasks[1].id)).orderBy(asc(event.seq))).map((e) => e.type)
    expect(types).toContain('issue.planning'); expect(types).toContain('run.message')
    expect(types.filter((t) => t === 'question.asked')).toHaveLength(2); expect(types.at(-1)).toBe('issue.planned')
  })

  it('a failed proposal is a failed run: no sub-issues, an issue.plan_failed event, and the issue can be planned again', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'failing', issues: [{ title: 'T', brief: 'b' }] })
    const out = await planIssue(tasks[0].id, { propose: fake(new Error('error_max_turns')) })
    expect(out).toMatchObject({ status: 'failed', error: 'error_max_turns', subIssues: [] })
    expect((await projectGraph(p.id))!.subIssues).toHaveLength(0)
    const [r] = await db.select().from(run).where(eq(run.id, out.runId))
    expect(r).toMatchObject({ status: 'failed', error: 'error_max_turns' })
    const types = (await db.select().from(event).where(eq(event.issueId, tasks[0].id)).orderBy(asc(event.seq))).map((e) => e.type)
    expect(types.at(-1)).toBe('issue.plan_failed')
    const again = await planIssue(tasks[0].id, { propose: fake(proposal) })
    expect(again.status).toBe('completed')
    expect((await db.select().from(run).where(eq(run.id, again.runId)))[0].attempt).toBe(2)
  })

  it('refuses an issue that already has sub-issues, one in the backlog or in no project, and a proposal that does not hold together', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'twice', issues: [{ title: 'T', subIssues: [{ key: 'x', title: 'X' }] }] })
    await expect(planIssue(tasks[0].id, { propose: fake(proposal) })).rejects.toThrow(PlanError)
    const [inBacklog] = await addItems(p.id, [{ text: 'later' }])
    await expect(planIssue(inBacklog.id, { propose: fake(proposal) })).rejects.toThrow(/backlog/)
    const loose = await createIssue(appId, { title: 'in no project' })
    await expect(planIssue(loose.id, { propose: fake(proposal) })).rejects.toThrow(/add it to a project/)
    const bad = (patch: Partial<Proposal>) => () => validateProposal({ ...proposal, ...patch })
    expect(bad({ phases: [] })).toThrow('no sub-issues')
    expect(bad({ phases: [{ ...proposal.phases[0] }, { ...proposal.phases[0] }] })).toThrow('used twice')
    expect(bad({ phases: [{ ...proposal.phases[1] }] })).toThrow('unknown sub-issue schema')
    expect(bad({ questions: [{ ...proposal.questions[1], recommended: 'Days' }] })).toThrow('does not offer')
    expect(bad({ questions: [{ ...proposal.questions[1], options: proposal.questions[1].options.slice(0, 1) }] })).toThrow('at least two options')
  })

  it('losing the model while planning is not a failure: it waits, then projects again by itself', async () => {
    const { project: p, issues: tasks } = await createProject({ appId, name: 'outage while planning', issues: [{ title: 'T', brief: 'b' }] })
    let calls = 0
    const propose: Propose = async () => (++calls === 1 ? { status: 'failed', error: 'API Error: 529 overloaded_error', costUsd: 0.01 } : { status: 'completed', proposal, costUsd: 0.1 })
    const out = await planIssue(tasks[0].id, { propose, retryAfterMs: () => 50 })
    expect(out.status).toBe('waiting')
    expect((await db.select().from(run).where(eq(run.id, out.runId)))[0].status).toBe('interrupted')
    const t0 = Date.now()
    while ((await projectGraph(p.id))!.subIssues.length === 0) { if (Date.now() - t0 > 10_000) throw new Error('not re-planned'); await new Promise((r) => setTimeout(r, 50)) }
    const types = (await db.select().from(event).where(eq(event.issueId, tasks[0].id)).orderBy(asc(event.seq))).map((e) => e.type)
    expect(types).toContain('issue.plan_waiting'); expect(types).not.toContain('issue.plan_failed'); expect(types.at(-1)).toBe('issue.planned')
  })

  it('composes briefs and sets costs', () => {
    expect(subIssueBrief({ key: 'k', title: 't', description: 'For a person.', summary: 'Just this.', depends_on: [], files: [], steps: [], checks: [], done_when: '' })).toBe('Just this.')
    expect(questionCost({ ...proposal.questions[1], cost: 'moderate' })).toBe('moderate')
    expect(questionCost({ ...proposal.questions[1], cost: 'cheap', options: [{ label: 'a', description: '', changes: ['gate'] }, { label: 'b', description: '', changes: [] }] })).toBe('expensive')
  })
})
