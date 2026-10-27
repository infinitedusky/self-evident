/**
 * To-dos: the work around the code. Getting approved by Apple, getting a tester set up, confirming the telemetry sees
 * her: not strategy, not code, but what decides whether the work counts. Linear's way: an issue (kind `todo`), with
 * its checklist as sub-issues, one level deep. It belongs to the app, can sit in the project it unblocks, and is the
 * person's (assignee) or handed to the agent (delegate). A checklist line can be waiting on someone else ("Apple's
 * review"). The to-do is done when every line is, or when a person says so; unchecking a line of a done to-do opens
 * it again.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, issue, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { getIssue, identifier, insertIssues, nextSort, PlanError, setState, type Issue } from './issues.js'

export type TodoOwner = 'person' | 'agent'
export type NewChecklistItem = string | { text: string; waitingOn?: string }
export interface NewTodo { appId: string; title: string; notes?: string; owner?: TodoOwner; projectId?: string; checklist?: NewChecklistItem[] }

const clean = (items: NewChecklistItem[] = []) => items.map((i) => (typeof i === 'string' ? { text: i } : i))
  .map((i) => ({ text: i.text?.trim().replace(/\s+/g, ' ') ?? '', waitingOn: i.waitingOn?.trim() || null })).filter((i) => i.text)

const isOpen = (i: Issue) => !['done', 'canceled', 'duplicate'].includes(i.state)

async function load(tx: Tx | typeof db, todoId: string) {
  const t = await getIssue(tx, todoId)
  if (t.kind !== 'todo' || t.parentId) throw new PlanError(`${todoId} is not a to-do`)
  return t
}

async function checkProject(tx: Tx | typeof db, appId: string, projectId?: string | null) {
  if (!projectId) return
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p || p.appId !== appId) throw new PlanError('that project is not in this app')
}

/** A to-do as the page shows it: the issue, who has it, its checklist, and the project it unblocks. */
function view(t: Issue, key: string, lines: Issue[], projects: { id: string; name: string; status: string }[]) {
  return {
    ...t, identifier: identifier(key, t.number), notes: t.description, owner: (t.delegate === 'agent' ? 'agent' : 'person') as TodoOwner,
    status: t.state === 'done' ? 'done' : t.state === 'canceled' ? 'dropped' : 'open',
    checklist: lines.filter((l) => l.parentId === t.id).map((l) => ({ ...l, identifier: identifier(key, l.number), text: l.title, done: l.state === 'done', position: l.sortOrder })),
    project: projects.find((p) => p.id === t.projectId) ?? null,
  }
}

/** Every to-do of an app with its checklist and the project it unblocks: open first, then done and dropped, newest first. */
export async function listTodos(appId: string, opts: { projectId?: string } = {}) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const where = [eq(issue.appId, appId), eq(issue.kind, 'todo'), isNull(issue.parentId)]
  if (opts.projectId) where.push(eq(issue.projectId, opts.projectId))
  const rows = await db.select().from(issue).where(and(...where))
  const lines = rows.length ? await db.select().from(issue).where(inArray(issue.parentId, rows.map((t) => t.id))).orderBy(asc(issue.sortOrder), asc(issue.number)) : []
  const pids = [...new Set(rows.map((t) => t.projectId).filter(Boolean))] as string[]
  const projects = pids.length ? await db.select({ id: project.id, name: project.name, status: project.status }).from(project).where(inArray(project.id, pids)) : []
  const rank = (t: Issue) => (isOpen(t) ? 0 : t.state === 'done' ? 1 : 2)
  const closedAt = (t: Issue) => (t.completedAt ?? t.canceledAt)?.getTime() ?? 0
  return rows
    .sort((x, y) => rank(x) - rank(y) || (isOpen(x) ? x.number - y.number : closedAt(y) - closedAt(x)))
    .map((t) => view(t, a.key, lines, projects))
}

export async function getTodo(todoId: string) {
  const t = await load(db, todoId)
  return (await listTodos(t.appId)).find((x) => x.id === todoId)!
}

/** Keep a to-do. Returns it with its checklist. */
export async function createTodo(input: NewTodo, actor = 'user') {
  const t = await db.transaction((tx) => insertTodo(tx, input, actor))
  return getTodo(t.id)
}

async function insertTodo(tx: Tx, input: NewTodo, actor: string) {
  if (!input.title?.trim()) throw new PlanError('a to-do needs a title')
  await checkProject(tx, input.appId, input.projectId)
  const [t] = await insertIssues(tx, input.appId, [{
    kind: 'todo', title: input.title, description: input.notes, projectId: input.projectId ?? null, delegate: input.owner === 'agent' ? 'agent' : null,
    sortOrder: await nextSort(tx, { appId: input.appId, projectId: input.projectId ?? null }),
  }], actor)
  const lines = clean(input.checklist)
  await insertIssues(tx, input.appId, lines.map((l, i) => ({ kind: 'todo' as const, parentId: t.id, projectId: t.projectId, title: l.text, waitingOn: l.waitingOn, sortOrder: i })), actor)
  return t
}

export async function updateTodo(todoId: string, input: { title?: string; notes?: string | null; owner?: TodoOwner; projectId?: string | null }, actor = 'user') {
  await db.transaction(async (tx) => {
    const t = await load(tx, todoId)
    if (input.projectId !== undefined) await checkProject(tx, t.appId, input.projectId)
    if (input.title !== undefined && !input.title.trim()) throw new PlanError('a to-do needs a title')
    const set = {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.notes !== undefined ? { description: input.notes?.trim() || null } : {}),
      ...(input.owner ? { delegate: input.owner === 'agent' ? 'agent' : null } : {}), ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}),
    }
    if (!Object.keys(set).length) return
    await tx.update(issue).set({ ...set, updatedAt: new Date() }).where(eq(issue.id, todoId))
    if (input.projectId !== undefined) await tx.update(issue).set({ projectId: input.projectId || null }).where(eq(issue.parentId, todoId))
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: (input.projectId ?? t.projectId) ?? null, issueId: t.id, actor, type: 'issue.updated', payload: { identifier: identifier(a.key, t.number), changed: Object.keys(set) } })
  })
  return getTodo(todoId)
}

/** Add lines to the end of a to-do's checklist. A done to-do with new, unchecked lines is open again. */
export async function addChecklist(todoId: string, items: NewChecklistItem[], actor = 'user') {
  await db.transaction(async (tx) => {
    const t = await load(tx, todoId)
    const lines = clean(items)
    if (!lines.length) return
    const start = await nextSort(tx, { parentId: todoId })
    await insertIssues(tx, t.appId, lines.map((l, i) => ({ kind: 'todo' as const, parentId: t.id, projectId: t.projectId, title: l.text, waitingOn: l.waitingOn, sortOrder: start + i })), actor)
    if (t.state === 'done') await setState(tx, t, 'todo', { actor, reason: 'new checklist lines' })
  })
  return getTodo(todoId)
}

/**
 * Change one checklist line: check it, uncheck it, mark it waiting on someone, or reword it. Checking the last open
 * line finishes the to-do; unchecking a line of a done to-do opens it again.
 */
export async function setChecklistItem(lineId: string, input: { done?: boolean; waitingOn?: string | null; text?: string }, actor = 'user') {
  const todoId = await db.transaction(async (tx) => {
    const l = await getIssue(tx, lineId)
    if (!l.parentId) throw new PlanError(`${lineId} is not a checklist line`)
    const t = await load(tx, l.parentId)
    if (t.state === 'canceled') throw new PlanError('that to-do was dropped; reopen it first')
    if (input.text !== undefined && !input.text.trim()) throw new PlanError('a checklist line needs text')
    const set = { ...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn?.trim() || null } : {}), ...(input.text !== undefined ? { title: input.text.trim() } : {}) }
    if (Object.keys(set).length) {
      await tx.update(issue).set({ ...set, updatedAt: new Date() }).where(eq(issue.id, lineId))
      const [a] = await tx.select().from(app).where(eq(app.id, l.appId))
      await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: l.projectId, issueId: lineId, actor, type: 'issue.updated', payload: { identifier: identifier(a.key, l.number), changed: Object.keys(set), parentId: t.id, ...set } })
    }
    if (input.done !== undefined && input.done !== (l.state === 'done')) await setState(tx, await getIssue(tx, lineId), input.done ? 'done' : 'todo', { actor })
    const lines = await tx.select().from(issue).where(eq(issue.parentId, t.id))
    if (isOpen(t) && input.done && lines.every((x) => x.state === 'done' || x.state === 'canceled')) await setState(tx, t, 'done', { actor })
    if (t.state === 'done' && input.done === false) await setState(tx, t, 'todo', { actor, reason: `unchecked "${l.title}"` })
    return t.id
  })
  return getTodo(todoId)
}

export async function removeChecklistItem(lineId: string, actor = 'user') {
  const todoId = await db.transaction(async (tx) => {
    const l = await getIssue(tx, lineId)
    if (!l.parentId) throw new PlanError(`${lineId} is not a checklist line`)
    const t = await load(tx, l.parentId)
    await tx.delete(issue).where(eq(issue.id, lineId))
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId: t.projectId, issueId: t.id, actor, type: 'issue.updated', payload: { identifier: identifier(a.key, t.number), changed: ['checklist'], removed: l.title } })
    return t.id
  })
  return getTodo(todoId)
}

/** A person says it is done, whatever the checklist says (the list was wrong, or the rest no longer matters). */
export async function completeTodo(todoId: string, actor = 'user') {
  await db.transaction(async (tx) => {
    const t = await load(tx, todoId)
    if (!isOpen(t)) throw new PlanError(`that to-do is already ${t.state}`)
    await setState(tx, t, 'done', { actor })
  })
  return getTodo(todoId)
}

export async function dropTodo(todoId: string, reason: string, actor = 'user') {
  if (!reason?.trim()) throw new PlanError('say why it is dropped')
  await db.transaction(async (tx) => {
    const t = await load(tx, todoId)
    if (!isOpen(t)) throw new PlanError(`that to-do is already ${t.state}`)
    await setState(tx, t, 'canceled', { actor, reason })
  })
  return getTodo(todoId)
}

export async function reopenTodo(todoId: string, actor = 'user') {
  await db.transaction(async (tx) => {
    const t = await load(tx, todoId)
    if (!isOpen(t)) await setState(tx, t, 'todo', { actor, reason: 'reopened' })
  })
  return getTodo(todoId)
}

/** A backlog issue is work outside the code: it becomes a to-do, still in its project (which it unblocks). */
export async function itemToTodo(issueId: string, input: { title?: string; checklist?: NewChecklistItem[]; owner?: TodoOwner } = {}, actor = 'user') {
  await db.transaction(async (tx) => {
    const i = await getIssue(tx, issueId)
    if (i.state !== 'backlog' || !i.projectId) throw new PlanError(`that issue is ${i.state}, not in a project's backlog`)
    const [p] = await tx.select().from(project).where(eq(project.id, i.projectId))
    if (['landed', 'stopped', 'superseded'].includes(p.status)) throw new PlanError(`project is ${p.status}; its backlog is closed`)
    await tx.update(issue).set({ kind: 'todo', title: input.title?.trim() || i.title, delegate: input.owner === 'agent' ? 'agent' : null, updatedAt: new Date() }).where(eq(issue.id, issueId))
    const lines = clean(input.checklist)
    await insertIssues(tx, i.appId, lines.map((l, n) => ({ kind: 'todo' as const, parentId: i.id, projectId: i.projectId, title: l.text, waitingOn: l.waitingOn, sortOrder: n })), actor)
    await setState(tx, await getIssue(tx, issueId), 'todo', { actor })
  })
  return getTodo(issueId)
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
    t.project ? `It unblocks the project "${t.project.name}".` : '',
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
