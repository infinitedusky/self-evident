/**
 * Goals, stated, as Linear has them: an initiative is where the work is headed (long term), served by projects; a
 * cycle is a stretch of time (a week, a sprint) with the issues meant to be done by its end. Before these, the
 * Summary inferred goals from the work; now a person (or the agent, in conversation) can say them, and the Summary
 * reads them first.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, cycle, initiative, initiativeProject, issue, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'

async function appOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  return a
}

/** An app's initiatives (its own, and the workspace's that name no app), each with the projects that serve it. */
export async function listInitiatives(appId: string) {
  const a = await appOf(appId)
  const rows = await db.select().from(initiative).where(and(eq(initiative.workspaceId, a.workspaceId), or(eq(initiative.appId, appId), isNull(initiative.appId))))
    .orderBy(asc(initiative.sortOrder), asc(initiative.createdAt))
  const links = rows.length ? await db.select().from(initiativeProject).where(inArray(initiativeProject.initiativeId, rows.map((r) => r.id))) : []
  const projects = links.length ? await db.select({ id: project.id, name: project.name, status: project.status }).from(project).where(inArray(project.id, links.map((l) => l.projectId))) : []
  return rows.map((r) => ({ ...r, projects: links.filter((l) => l.initiativeId === r.id).map((l) => projects.find((p) => p.id === l.projectId)!).filter(Boolean) }))
}

export async function createInitiative(input: { appId: string; name: string; description?: string; targetDate?: string; projectIds?: string[] }, actor = 'user') {
  if (!input.name?.trim()) throw new PlanError('an initiative needs a name')
  const a = await appOf(input.appId)
  return db.transaction(async (tx) => {
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${initiative.sortOrder}), -1)` }).from(initiative).where(eq(initiative.workspaceId, a.workspaceId))
    const [row] = await tx.insert(initiative).values({
      id: newId('initiative'), workspaceId: a.workspaceId, appId: a.id, name: input.name.trim(), description: input.description?.trim() || null,
      targetDate: input.targetDate || null, sortOrder: Number(max) + 1, createdBy: actor,
    }).returning()
    for (const pid of input.projectIds ?? []) await tx.insert(initiativeProject).values({ initiativeId: row.id, projectId: pid }).onConflictDoNothing()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type: 'initiative.created', payload: { initiativeId: row.id, name: row.name } })
    return row
  })
}

export async function updateInitiative(initiativeId: string, input: { name?: string; description?: string | null; status?: 'planned' | 'active' | 'completed'; targetDate?: string | null; addProjects?: string[]; removeProjects?: string[] }, actor = 'user') {
  return db.transaction(async (tx) => {
    const [i] = await tx.select().from(initiative).where(eq(initiative.id, initiativeId))
    if (!i) throw new PlanError(`no initiative ${initiativeId}`)
    const set = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}), ...(input.targetDate !== undefined ? { targetDate: input.targetDate || null } : {}),
    }
    if (set.name === '') throw new PlanError('an initiative needs a name')
    const [row] = Object.keys(set).length ? await tx.update(initiative).set({ ...set, updatedAt: new Date() }).where(eq(initiative.id, initiativeId)).returning() : [i]
    for (const pid of input.addProjects ?? []) await tx.insert(initiativeProject).values({ initiativeId, projectId: pid }).onConflictDoNothing()
    for (const pid of input.removeProjects ?? []) await tx.delete(initiativeProject).where(and(eq(initiativeProject.initiativeId, initiativeId), eq(initiativeProject.projectId, pid)))
    await appendEvent(tx, { workspaceId: i.workspaceId, appId: i.appId ?? (await tx.select().from(app).where(eq(app.workspaceId, i.workspaceId)))[0].id, actor, type: 'initiative.updated', payload: { initiativeId, changed: [...Object.keys(set), ...(input.addProjects?.length ? ['projects'] : []), ...(input.removeProjects?.length ? ['projects'] : [])] } })
    return row
  })
}

/** An app's cycles, newest first, each with its issues; `current` is the one today falls in, if any. */
export async function listCycles(appId: string) {
  const a = await appOf(appId)
  const rows = await db.select().from(cycle).where(eq(cycle.appId, appId)).orderBy(desc(cycle.startsAt))
  const issues = rows.length ? await db.select().from(issue).where(inArray(issue.cycleId, rows.map((c) => c.id))) : []
  const today = new Date().toISOString().slice(0, 10)
  return rows.map((c) => ({
    ...c, current: c.startsAt <= today && today <= c.endsAt,
    issues: issues.filter((i) => i.cycleId === c.id).map((i) => ({ id: i.id, identifier: identifier(a.key, i.number), title: i.title, state: i.state, kind: i.kind })),
  }))
}

export async function createCycle(input: { appId: string; startsAt: string; endsAt: string; name?: string; description?: string; issueIds?: string[] }, actor = 'user') {
  const a = await appOf(input.appId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsAt) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endsAt)) throw new PlanError('dates as YYYY-MM-DD')
  if (input.endsAt < input.startsAt) throw new PlanError('a cycle ends after it starts')
  return db.transaction(async (tx) => {
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${cycle.number}), 0)` }).from(cycle).where(eq(cycle.appId, a.id))
    const [row] = await tx.insert(cycle).values({ id: newId('cycle'), appId: a.id, number: Number(max) + 1, name: input.name?.trim() || null, description: input.description?.trim() || null, startsAt: input.startsAt, endsAt: input.endsAt }).returning()
    if (input.issueIds?.length) await tx.update(issue).set({ cycleId: row.id, updatedAt: new Date() }).where(and(inArray(issue.id, input.issueIds), eq(issue.appId, a.id)))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, actor, type: 'cycle.created', payload: { cycleId: row.id, number: row.number, name: row.name, startsAt: row.startsAt, endsAt: row.endsAt, issues: input.issueIds?.length ?? 0 } })
    return row
  })
}
