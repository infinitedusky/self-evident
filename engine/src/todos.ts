/**
 * To-dos: the work around the code. Getting approved by Apple, getting a tester set up, confirming the telemetry sees
 * her: not strategy, not dev tasks, but what decides whether the work counts. A to-do belongs to the app (beside its
 * projects, never inside one), is owned by the person or the agent, can point at the project it unblocks, and has a
 * checklist, one level deep. A checklist line can be waiting on someone else ("Apple's review"). The to-do is done
 * when every line is checked, or when a person says so; unchecking a line of a done to-do opens it again.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, backlogItem, checklistItem, project, todo } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'

export type TodoOwner = 'person' | 'agent'
export type NewChecklistItem = string | { text: string; waitingOn?: string }
export interface NewTodo { appId: string; title: string; notes?: string; owner?: TodoOwner; projectId?: string; checklist?: NewChecklistItem[] }

const clean = (items: NewChecklistItem[] = []) => items.map((i) => (typeof i === 'string' ? { text: i } : i))
  .map((i) => ({ text: i.text?.trim().replace(/\s+/g, ' ') ?? '', waitingOn: i.waitingOn?.trim() || null })).filter((i) => i.text)

async function load(tx: Tx | typeof db, todoId: string) {
  const [t] = await tx.select().from(todo).where(eq(todo.id, todoId))
  if (!t) throw new PlanError(`no to-do ${todoId}`)
  const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
  return { t, base: { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId ?? undefined } }
}

async function checkProject(tx: Tx | typeof db, appId: string, projectId?: string | null) {
  if (!projectId) return
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p || p.appId !== appId) throw new PlanError('that project is not in this app')
}

/** Every to-do of an app with its checklist and the project it unblocks: open first, then done and dropped, newest first. */
export async function listTodos(appId: string, opts: { projectId?: string } = {}) {
  const rows = await db.select().from(todo).where(opts.projectId ? and(eq(todo.appId, appId), eq(todo.projectId, opts.projectId)) : eq(todo.appId, appId))
  const ids = rows.map((t) => t.id)
  const items = ids.length ? await db.select().from(checklistItem).where(inArray(checklistItem.todoId, ids)).orderBy(asc(checklistItem.position), asc(checklistItem.id)) : []
  const pids = [...new Set(rows.map((t) => t.projectId).filter(Boolean))] as string[]
  const projects = pids.length ? await db.select({ id: project.id, title: project.title, status: project.status }).from(project).where(inArray(project.id, pids)) : []
  const rank = { open: 0, done: 1, dropped: 2 } as Record<string, number>
  return rows
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'open' ? a.number - b.number : (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0)))
    .map((t) => ({ ...t, checklist: items.filter((i) => i.todoId === t.id), project: projects.find((p) => p.id === t.projectId) ?? null }))
}

export async function getTodo(todoId: string) {
  const [t] = await db.select().from(todo).where(eq(todo.id, todoId))
  if (!t) throw new PlanError(`no to-do ${todoId}`)
  return (await listTodos(t.appId)).find((x) => x.id === todoId)!
}

/** Keep a to-do. Returns it with its checklist. */
export async function createTodo(input: NewTodo, actor = 'user') {
  const t = await db.transaction((tx) => insertTodo(tx, input, actor))
  return getTodo(t.id)
}

async function insertTodo(tx: Tx, input: NewTodo, actor: string) {
  if (!input.title?.trim()) throw new PlanError('a to-do needs a title')
  {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    await checkProject(tx, a.id, input.projectId)
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${todo.number}), 0)` }).from(todo).where(eq(todo.appId, a.id))
    const [t] = await tx.insert(todo).values({
      id: newId('todo'), appId: a.id, number: Number(max) + 1, title: input.title.trim(), notes: input.notes?.trim() || null,
      owner: input.owner ?? 'person', projectId: input.projectId ?? null, createdBy: actor,
    }).returning()
    const lines = clean(input.checklist)
    if (lines.length) await tx.insert(checklistItem).values(lines.map((l, i) => ({ appId: a.id, todoId: t.id, position: i, text: l.text, waitingOn: l.waitingOn })))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId ?? undefined, actor, type: 'todo.created', payload: { todoId: t.id, number: t.number, title: t.title, owner: t.owner, checklist: lines.length } })
    return t
  }
}

export async function updateTodo(todoId: string, input: { title?: string; notes?: string | null; owner?: TodoOwner; projectId?: string | null }, actor = 'user') {
  await db.transaction(async (tx) => {
    const { t, base } = await load(tx, todoId)
    if (input.projectId !== undefined) await checkProject(tx, t.appId, input.projectId)
    if (input.title !== undefined && !input.title.trim()) throw new PlanError('a to-do needs a title')
    const set = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.owner ? { owner: input.owner } : {}), ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}), updatedAt: new Date(),
    }
    await tx.update(todo).set(set).where(eq(todo.id, todoId))
    await appendEvent(tx, { ...base, projectId: (input.projectId ?? t.projectId) ?? undefined, actor, type: 'todo.updated', payload: { todoId, number: t.number, changed: Object.keys(set).filter((k) => k !== 'updatedAt') } })
  })
  return getTodo(todoId)
}

/** Add lines to the end of a to-do's checklist. A done to-do with new, unchecked lines is open again. */
export async function addChecklist(todoId: string, items: NewChecklistItem[], actor = 'user') {
  await db.transaction(async (tx) => {
    const { t, base } = await load(tx, todoId)
    const lines = clean(items)
    if (!lines.length) return
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${checklistItem.position}), -1)` }).from(checklistItem).where(eq(checklistItem.todoId, todoId))
    await tx.insert(checklistItem).values(lines.map((l, i) => ({ appId: t.appId, todoId, position: Number(max) + 1 + i, text: l.text, waitingOn: l.waitingOn })))
    await appendEvent(tx, { ...base, actor, type: 'todo.updated', payload: { todoId, number: t.number, added: lines.map((l) => l.text) } })
    if (t.status === 'done') await reopenIn(tx, t, base, actor, 'new checklist lines')
  })
  return getTodo(todoId)
}

/**
 * Change one checklist line: check it, uncheck it, mark it waiting on someone, or reword it. Checking the last open
 * line finishes the to-do; unchecking a line of a done to-do opens it again.
 */
export async function setChecklistItem(itemId: number, input: { done?: boolean; waitingOn?: string | null; text?: string }, actor = 'user') {
  const todoId = await db.transaction(async (tx) => {
    const [i] = await tx.select().from(checklistItem).where(eq(checklistItem.id, itemId))
    if (!i) throw new PlanError(`no checklist line ${itemId}`)
    const { t, base } = await load(tx, i.todoId)
    if (t.status === 'dropped') throw new PlanError('that to-do was dropped; reopen it first')
    if (input.text !== undefined && !input.text.trim()) throw new PlanError('a checklist line needs text')
    const set = {
      ...(input.done !== undefined ? { done: input.done, doneBy: input.done ? actor : null, doneAt: input.done ? new Date() : null } : {}),
      ...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn?.trim() || null } : {}),
      ...(input.text !== undefined ? { text: input.text.trim() } : {}),
    }
    if (!Object.keys(set).length) return t.id
    await tx.update(checklistItem).set(set).where(eq(checklistItem.id, itemId))
    await appendEvent(tx, { ...base, actor, type: 'todo.checked', payload: { todoId: t.id, number: t.number, item: input.text?.trim() ?? i.text, done: input.done ?? i.done, waitingOn: input.waitingOn !== undefined ? input.waitingOn?.trim() || null : i.waitingOn } })
    const lines = await tx.select().from(checklistItem).where(eq(checklistItem.todoId, t.id))
    if (t.status === 'open' && input.done && lines.every((l) => l.done)) await closeIn(tx, t, base, actor, 'done')
    if (t.status === 'done' && input.done === false) await reopenIn(tx, t, base, actor, `unchecked "${i.text}"`)
    return t.id
  })
  return getTodo(todoId)
}

export async function removeChecklistItem(itemId: number, actor = 'user') {
  const todoId = await db.transaction(async (tx) => {
    const [i] = await tx.select().from(checklistItem).where(eq(checklistItem.id, itemId))
    if (!i) throw new PlanError(`no checklist line ${itemId}`)
    const { t, base } = await load(tx, i.todoId)
    await tx.delete(checklistItem).where(eq(checklistItem.id, itemId))
    await appendEvent(tx, { ...base, actor, type: 'todo.updated', payload: { todoId: t.id, number: t.number, removed: i.text } })
    return t.id
  })
  return getTodo(todoId)
}

async function closeIn(tx: Tx, t: typeof todo.$inferSelect, base: { workspaceId: string; appId: string; projectId?: string }, actor: string, status: 'done' | 'dropped', reason?: string) {
  await tx.update(todo).set({ status, reason: status === 'dropped' ? reason! : null, closedBy: actor, closedAt: new Date(), updatedAt: new Date() }).where(eq(todo.id, t.id))
  await appendEvent(tx, { ...base, actor, type: status === 'done' ? 'todo.done' : 'todo.dropped', payload: { todoId: t.id, number: t.number, title: t.title, ...(reason ? { reason } : {}) } })
}

async function reopenIn(tx: Tx, t: typeof todo.$inferSelect, base: { workspaceId: string; appId: string; projectId?: string }, actor: string, why: string) {
  await tx.update(todo).set({ status: 'open', reason: null, closedBy: null, closedAt: null, updatedAt: new Date() }).where(eq(todo.id, t.id))
  await appendEvent(tx, { ...base, actor, type: 'todo.reopened', payload: { todoId: t.id, number: t.number, title: t.title, why } })
}

/** A person says it is done, whatever the checklist says (the list was wrong, or the rest no longer matters). */
export async function completeTodo(todoId: string, actor = 'user') {
  await db.transaction(async (tx) => {
    const { t, base } = await load(tx, todoId)
    if (t.status !== 'open') throw new PlanError(`to-do #${t.number} is already ${t.status}`)
    await closeIn(tx, t, base, actor, 'done')
  })
  return getTodo(todoId)
}

export async function dropTodo(todoId: string, reason: string, actor = 'user') {
  if (!reason?.trim()) throw new PlanError('say why it is dropped')
  await db.transaction(async (tx) => {
    const { t, base } = await load(tx, todoId)
    if (t.status !== 'open') throw new PlanError(`to-do #${t.number} is already ${t.status}`)
    await closeIn(tx, t, base, actor, 'dropped', reason.trim())
  })
  return getTodo(todoId)
}

export async function reopenTodo(todoId: string, actor = 'user') {
  await db.transaction(async (tx) => {
    const { t, base } = await load(tx, todoId)
    if (t.status !== 'open') await reopenIn(tx, t, base, actor, 'reopened')
  })
  return getTodo(todoId)
}

/** An open backlog item is work outside the code: it becomes a to-do of the app, unblocking the item's project. */
export async function itemToTodo(itemId: string, input: { title?: string; checklist?: NewChecklistItem[]; owner?: TodoOwner } = {}, actor = 'user') {
  const id = await db.transaction(async (tx) => {
    const [i] = await tx.select().from(backlogItem).where(eq(backlogItem.id, itemId))
    if (!i) throw new PlanError(`no backlog item ${itemId}`)
    if (i.state !== 'open') throw new PlanError(`that item is already ${i.state}`)
    const [p] = await tx.select().from(project).where(eq(project.id, i.projectId))
    if (['landed', 'stopped', 'superseded'].includes(p.status)) throw new PlanError(`project is ${p.status}; its backlog is closed`)
    const t = await insertTodo(tx, { appId: i.appId, title: input.title?.trim() || i.text, notes: i.body ?? undefined, owner: input.owner, projectId: i.projectId, checklist: input.checklist }, actor)
    await tx.update(backlogItem).set({ state: 'covered', todoId: t.id, resolvedBy: actor, resolvedAt: new Date() }).where(eq(backlogItem.id, itemId))
    const [a] = await tx.select().from(app).where(eq(app.id, i.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: i.projectId, actor, type: 'backlog.covered', payload: { itemId, text: i.text, todoNumber: t.number } })
    return t.id
  })
  return getTodo(id)
}

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['lines'],
  properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'waitingOn'], properties: { text: { type: 'string' }, waitingOn: { type: 'string' } } } } },
}

/**
 * The agent drafts a to-do's checklist (or what is missing from it): one model call that may search the web for how
 * the thing is done today (Apple's process changes), returning concrete lines in order. Appended; the person edits.
 */
export async function draftChecklist(todoId: string, opts: { model?: string; draft?: (prompt: string) => Promise<{ text: string; waitingOn: string }[]> } = {}) {
  const t = await getTodo(todoId)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const setup = (a.setup ?? {}) as { model?: string }
  const prompt = [
    `Draft the checklist for a to-do of the app "${a.name}": ${t.title}`,
    t.notes ? `Notes on it:\n${t.notes}` : '',
    t.project ? `It unblocks the project "${t.project.title}".` : '',
    t.checklist.length ? `It already has these lines; return only what is missing:\n${t.checklist.map((l) => `- ${l.text}`).join('\n')}` : '',
    '',
    'This is work outside the code: accounts, approvals, people, checks. Write the concrete steps a person (or an agent with a browser and an API key) takes, in order, so nothing is forgotten.',
    '- One action per line, short, plain words; name the place it happens (the site, the console, the person). No sub-steps.',
    '- Where a line waits on someone else (a review, a reply, a payment clearing), set waitingOn to who; otherwise an empty string.',
    '- Where the process is set by a company and may have changed (Apple, Google, payment providers), search the web first and follow what it says today.',
    '- Start from the beginning: do not assume an account, enrollment or earlier step is done unless the notes or existing lines say so.',
    '- Only real-world steps: no lines about this checklist, the to-do or the project itself (marking things done or unblocked happens on its own).',
    '- Usually four to twelve lines. Nothing speculative.',
  ].filter(Boolean).join('\n')
  let lines: { text: string; waitingOn: string }[]
  if (opts.draft) lines = await opts.draft(prompt)
  else {
    let out: unknown
    for await (const m of query({ prompt, options: { model: opts.model ?? setup.model, maxTurns: 12, tools: ['WebSearch', 'WebFetch'], allowedTools: ['WebSearch', 'WebFetch'], settingSources: [], outputFormat: { type: 'json_schema', schema: DRAFT_SCHEMA } } })) {
      if (m.type === 'result') { if ((m as any).subtype !== 'success') throw new PlanError(`drafting failed: ${(m as any).subtype}`); out = (m as any).structured_output }
    }
    lines = ((out as any)?.lines ?? []) as { text: string; waitingOn: string }[]
  }
  return addChecklist(todoId, lines.map((l) => ({ text: l.text, waitingOn: l.waitingOn || undefined })), 'agent')
}
