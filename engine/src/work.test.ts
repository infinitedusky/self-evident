/**
 * Steps and workflows, stored: a workflow is checked against the fixed rules and inherited (task, else project,
 * else app); a task completes only with its required steps finished and its brief approved, and a changed brief is
 * approved again; a workflow that starts tasks as ideas refuses a task made directly; an idea converts into a task or
 * a project and its steps and prototypes go with it; planning waits for the approved brief.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, issue, project, prototype, workspace } from './db/schema.js'
import { createIdea } from './ideas.js'
import { newId } from './ids.js'
import { createIssue, updateIssue } from './issues.js'
import { preparePlanning } from './planner.js'
import { createProject } from './projects.js'
import { approveBrief, convertIdea, createDefaultWorkflow, guardComplete, guardDirect, ideaFirst, listWorkflows, planView, saveWorkflow, setStep, stepsOf, useWorkflow } from './work.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('steps and workflows', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'work test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('makes an app with its default workflow, "Default", only the brief required', async () => {
    const other = newId('app')
    await db.transaction(async (tx) => {
      await tx.insert(app).values({ id: other, workspaceId: wsId, name: 'with a default', key: other.slice(-6).toUpperCase() })
      await createDefaultWorkflow(tx, other)
    })
    const [w] = await listWorkflows(other)
    expect(w).toMatchObject({ name: 'Default', appDefault: true, ordered: false })
    expect(w.steps.filter((s) => s.required).map((s) => s.key)).toEqual(['brief'])
  })

  it('keeps a workflow to the fixed rules and refuses an order that breaks them', async () => {
    await expect(saveWorkflow({ appId, name: 'bad', steps: [{ key: 'brief', on: true, required: true }, { key: 'research', on: true, required: false }] })).rejects.toThrow(/order breaks the rules/)
    await expect(saveWorkflow({ appId, name: 'odd', steps: [{ key: 'deploy' as never, on: true, required: true }] })).rejects.toThrow(/no step "deploy"/)
    const w = await saveWorkflow({ appId, name: 'Brief off', steps: [{ key: 'idea', on: false, required: false }, { key: 'brief', on: false, required: false }] })
    expect(w.steps.find((s) => s.key === 'brief')).toMatchObject({ on: true, required: true })
    expect(w.steps.find((s) => s.key === 'idea')).toMatchObject({ on: true })
  })

  it('uses the task\'s workflow, else its project\'s, else the app\'s, and says where it came from', async () => {
    const appWf = await saveWorkflow({ appId, name: 'App default', steps: [{ key: 'idea', on: true, required: false }, { key: 'research', on: true, required: true }, { key: 'brief', on: true, required: true }] })
    const projWf = await saveWorkflow({ appId, name: 'Project', steps: [{ key: 'idea', on: true, required: false }, { key: 'brief', on: true, required: true }, { key: 'adr', on: true, required: true }], ordered: true })
    const taskWf = await saveWorkflow({ appId, name: 'Task', steps: [{ key: 'idea', on: true, required: false }, { key: 'brief', on: true, required: true }] })
    const { project: p, issues: [t] } = await createProject({ appId, name: 'Inherits', issues: [{ title: 'one' }] })

    expect((await stepsOf({ issueId: t.id })).resolved).toMatchObject({ workflow: { name: 'Default' }, from: 'app' }) // never none
    await useWorkflow({ appId }, appWf.id)
    expect((await stepsOf({ issueId: t.id })).resolved).toMatchObject({ workflow: { id: appWf.id }, from: 'app' })
    await useWorkflow({ projectId: p.id }, projWf.id)
    expect((await stepsOf({ issueId: t.id })).resolved).toMatchObject({ workflow: { id: projWf.id }, from: 'project' })
    expect((await stepsOf({ projectId: p.id })).resolved).toMatchObject({ workflow: { id: projWf.id }, from: 'task' }) // a project's own
    await useWorkflow({ issueId: t.id }, taskWf.id)
    expect((await stepsOf({ issueId: t.id })).resolved).toMatchObject({ workflow: { id: taskWf.id }, from: 'task' })
    await useWorkflow({ issueId: t.id }, null)
    expect((await stepsOf({ issueId: t.id })).resolved.from).toBe('project')
    expect((await listWorkflows(appId)).find((w) => w.id === appWf.id)).toMatchObject({ appDefault: true })
    await expect(useWorkflow({ appId }, null)).rejects.toThrow(/always has a default/)
    await db.update(app).set({ workflowId: null }).where(eq(app.id, appId)) // leave the app as the other tests expect
  })

  it('completes a task only with its brief approved and its required steps done; a changed brief is approved again', async () => {
    const wf = await saveWorkflow({ appId, name: 'Needs research', steps: [{ key: 'idea', on: true, required: false }, { key: 'research', on: true, required: true }, { key: 'brief', on: true, required: true }] })
    const t = await createIssue(appId, { title: 'Gated', kind: 'code' })
    await useWorkflow({ issueId: t.id }, wf.id)
    await expect(guardComplete(db, t.id)).rejects.toThrow(/Research isn't done; the brief isn't approved/)
    await expect(approveBrief(t.id, 'sam')).rejects.toThrow(/write the brief/)
    await updateIssue(t.id, { brief: 'Do the thing.' })
    expect((await stepsOf({ issueId: t.id })).states.find((s) => s.key === 'brief')).toMatchObject({ status: 'done', detail: 'waiting for approval' })
    await approveBrief(t.id, 'sam')
    await setStep({ issueId: t.id }, 'research', { status: 'done', body: 'notes' })
    await expect(guardComplete(db, t.id)).resolves.toBeUndefined()
    await updateIssue(t.id, { brief: 'Do the other thing.' })
    expect((await stepsOf({ issueId: t.id })).blocking).toEqual(['brief'])
  })

  it('in an enforced order, a step and the brief\'s approval wait for the required steps before them', async () => {
    const wf = await saveWorkflow({ appId, name: 'Mockup first', ordered: true, steps: [{ key: 'idea', on: true, required: false }, { key: 'mockup', on: true, required: true }, { key: 'brief', on: true, required: true }, { key: 'adr', on: true, required: false }] })
    const t = await createIssue(appId, { title: 'Ordered', kind: 'code', brief: 'Build it.' })
    await useWorkflow({ issueId: t.id }, wf.id)
    await expect(approveBrief(t.id, 'sam')).rejects.toThrow(/Brief waits for Mockups first/)
    await expect(setStep({ issueId: t.id }, 'adr', { status: 'started' })).rejects.toThrow(/ADR waits for Mockups first/)
    await setStep({ issueId: t.id }, 'mockup', { status: 'done', refs: ['pages-x--y'] })
    await approveBrief(t.id, 'sam')
    await expect(setStep({ issueId: t.id }, 'adr', { status: 'done' })).resolves.toMatchObject({ key: 'adr' })
  })

  it('lets a task be made directly under rules that don\'t need an idea; refuses only when every choice does', async () => {
    const first = await saveWorkflow({ appId, name: 'Ideas first', steps: [{ key: 'idea', on: true, required: true }, { key: 'brief', on: true, required: true }] })
    const quick = await saveWorkflow({ appId, name: 'Quick', steps: [{ key: 'idea', on: true, required: false }, { key: 'brief', on: true, required: true }] })
    const { project: p } = await createProject({ appId, name: 'Ideas first', issues: [{ title: 'x' }] })
    await useWorkflow({ projectId: p.id }, first.id)
    await expect(guardDirect(db, appId, p.id)).rejects.toThrow(/starts everything as an idea: choose other rules/)
    await expect(guardDirect(db, appId, p.id, quick.id)).resolves.toBeUndefined() // chosen rules win over the project's
    await expect(guardDirect(db, appId, null, 'wf_nope')).rejects.toThrow(/no workflow wf_nope/)
    await useWorkflow({ appId }, first.id)
    await expect(guardDirect(db, appId)).rejects.toThrow(/starts everything as an idea/)
    expect(await ideaFirst(db, appId)).toBeNull() // "Quick" (and others) are still a choice
    const t = await createIssue(appId, { title: 'Chosen rules', kind: 'code', workflowId: quick.id })
    expect((await stepsOf({ issueId: t.id })).resolved).toMatchObject({ workflow: { id: quick.id }, from: 'task' })
    await expect(useWorkflow({ appId }, null)).rejects.toThrow(/always has a default/)
    await db.update(app).set({ workflowId: null }).where(eq(app.id, appId)) // leave the app as the other tests expect
  })

  it('converts an idea into a task, taking its research, mockups, rough draft and prototype with it', async () => {
    const i = await createIdea({ appId, title: 'One-tap reorder' })
    await setStep({ ideaId: i.id }, 'research', { status: 'done', body: 'Three comps.' })
    await setStep({ ideaId: i.id }, 'mockup', { refs: ['pages-reorder--default'], detail: '1 story' })
    await setStep({ ideaId: i.id }, 'brief', { body: 'Rough: a button on past orders.' })
    await expect(setStep({ ideaId: i.id }, 'adr', {})).rejects.toThrow(/isn't done on an idea/)
    const protoId = newId('prototype')
    await db.insert(prototype).values({ id: protoId, appId, ideaId: i.id, title: 'reorder', branch: 'prototype/x', path: '/tmp/x', status: 'stopped' })

    const out = await convertIdea(i.id, 'task', { why: 'one thing to build' })
    expect(out.as).toBe('task')
    const issueId = (out as { issueId: string }).issueId
    const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
    expect(t).toMatchObject({ ideaId: i.id, brief: 'Rough: a button on past orders.', briefApprovedBy: null })
    const v = await stepsOf({ issueId })
    expect(Object.fromEntries(v.states.map((s) => [s.key, s.status]))).toMatchObject({ idea: 'done', research: 'done', mockup: 'started', prototype: 'started', brief: 'done' })
    expect(v.fromIdea).toMatchObject({ id: i.id, title: 'One-tap reorder' })
    expect((await stepsOf({ ideaId: i.id })).states).toEqual([])
    expect((await db.select().from(prototype).where(eq(prototype.id, protoId)))[0]).toMatchObject({ ideaId: null, issueId })
  })

  it('converts an idea into a project with no tasks yet, and Plan lists it', async () => {
    const i = await createIdea({ appId, title: 'Saved carts' })
    await setStep({ ideaId: i.id }, 'prototype', { status: 'done', detail: 'the whole flow' })
    const out = await convertIdea(i.id, 'project', {})
    const projectId = (out as { projectId: string }).projectId
    expect((await stepsOf({ projectId })).states.map((s) => s.key).sort()).toEqual(['idea', 'prototype'])
    const plan = await planView(appId)
    expect(plan.projects.find((p) => p.id === projectId)).toMatchObject({ name: 'Saved carts', tasks: [], steps: [{ key: 'prototype', status: 'done' }] })
    expect(plan.workflows.length).toBeGreaterThan(0)
  })

  it('plans a task only once its brief is approved', async () => {
    const { issues: [t] } = await createProject({ appId, name: 'Plan gate', issues: [{ title: 'Needs approval', brief: 'Build it.' }] })
    await expect(preparePlanning(t.id)).rejects.toThrow(/approve its brief before planning/)
  })
})
