/**
 * Notes: what a person wants kept that the engine cannot know (Sandy, 2026-11-23: "I am having a convo and I want to
 * include that I had it and the outcome in my daily report"; "you should be able to attach it to a task, and in the
 * task we should have a notes section. The date will let us know when to include it in a report"; "This could also
 * be part of the decisions that we make … if we want to enumerate them").
 *
 * A note is the app's. It has the day it is about, a title, a body, and the tasks it is about: none, one or
 * several. A task shows the notes attached to it; a report on a period includes the notes dated in it (reports.ts).
 * A note can be marked a decision, so what was settled along the way can be listed apart from what merely happened.
 * (The planner's decision cards, a question with options and the one chosen, are their own thing: the `decision`
 * table.)
 *
 * They are also what a Context holds (context.ts; Sandy, 2026-11-24, "one set"): a note can be in an idea's or a
 * project's context as well as about tasks, and a decision an agent proposed waits as `proposed` until the person
 * accepts it (settled) or turns it down (rejected). Only settled ones are listed here and reach a report.
 */
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, note } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'

export const NOTE_KINDS = ['note', 'decision'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
export const NOTE_STATUSES = ['settled', 'proposed', 'rejected', 'open'] as const
export type NoteStatus = (typeof NOTE_STATUSES)[number]
export interface NoteView { id: string; on: string; kind: NoteKind; status: NoteStatus; title: string; /** A decision's answer, when it was asked as a question (context.ts). */ answer: string | null; /** An open decision: who the person is waiting on for its answer. */ waitingOn: string | null; /** A decision's background: why it is a question. */ background: string | null; body: string; tasks: { id: string; name: string; title: string }[]; createdBy: string | null; updatedAt: string | null }
type Row = typeof note.$inferSelect

/** A day as the person's calendar has it, in this computer's time. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const aDay = (s: unknown): string => { const t = String(s ?? '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(+new Date(`${t}T12:00:00`))) throw new PlanError('a note\'s day is written YYYY-MM-DD'); return t }

async function views(appId: string, rows: Row[]): Promise<NoteView[]> {
  const ids = [...new Set(rows.flatMap((r) => r.issueIds ?? []))]
  const [a] = await db.select({ key: app.key }).from(app).where(eq(app.id, appId))
  const tasks = ids.length ? await db.select({ id: issue.id, number: issue.number, title: issue.title }).from(issue).where(and(eq(issue.appId, appId), inArray(issue.id, ids))) : []
  return rows.map((r) => ({ id: r.id, on: r.on, kind: r.kind as NoteKind, status: r.status as NoteStatus, title: r.title, answer: r.answer, waitingOn: r.waitingOn, background: r.background, body: r.body, createdBy: r.createdBy, updatedAt: (r.updatedAt ?? r.createdAt)?.toISOString() ?? null,
    tasks: (r.issueIds ?? []).flatMap((id) => { const t = tasks.find((x) => x.id === id); return t ? [{ id: t.id, name: identifier(a?.key ?? '', t.number), title: t.title }] : [] }) }))
}

/** The app's notes, newest day first. issueId: those attached to that task. from, to: days, both included. kind: only decisions, say. Settled ones only, unless `all`. */
export async function listNotes(appId: string, o: { issueId?: string | null; from?: string | null; to?: string | null; kind?: string | null; all?: boolean } = {}): Promise<NoteView[]> {
  const rows = await db.select().from(note).where(and(eq(note.appId, appId), o.from ? gte(note.on, aDay(o.from)) : undefined, o.to ? lte(note.on, aDay(o.to)) : undefined, o.kind ? eq(note.kind, o.kind) : undefined, o.all ? undefined : eq(note.status, 'settled'))).orderBy(desc(note.on), desc(note.createdAt))
  return views(appId, o.issueId ? rows.filter((r) => (r.issueIds ?? []).includes(o.issueId!)) : rows)
}

/**
 * The app's decisions that are not made yet, oldest first: each question, the day it was asked, who it waits on if the
 * person asked someone, and the tasks it is on. For a report, which says them as open (reports.ts).
 */
export async function openDecisions(appId: string) {
  const rows = await db.select().from(note).where(and(eq(note.appId, appId), eq(note.kind, 'decision'), inArray(note.status, ['open', 'proposed']))).orderBy(note.on, note.createdAt)
  return (await views(appId, rows)).map((n) => ({ question: n.title, askedOn: n.on, waitingOn: n.waitingOn, background: n.background ? (n.background.length > 800 ? `${n.background.slice(0, 800)}…` : n.background) : null, proposedAnswer: n.status === 'proposed' ? n.answer : null, tasks: n.tasks.map((t) => t.name) }))
}

async function tasksOf(appId: string, ids: unknown): Promise<string[]> {
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 30)
  if (!want.length) return []
  const have = (await db.select({ id: issue.id }).from(issue).where(and(eq(issue.appId, appId), inArray(issue.id, want)))).map((t) => t.id)
  const missing = want.filter((id) => !have.includes(id))
  if (missing.length) throw new PlanError(`no such task in this app: ${missing.join(', ')}`)
  return want
}
const kindOf = (k: unknown): NoteKind => { if (!(NOTE_KINDS as readonly string[]).includes(String(k))) throw new PlanError(`a note is one of: ${NOTE_KINDS.join(', ')}`); return k as NoteKind }
const statusOf = (v: unknown): NoteStatus => { if (!(NOTE_STATUSES as readonly string[]).includes(String(v))) throw new PlanError(`a decision is one of: ${NOTE_STATUSES.join(', ')}`); return v as NoteStatus }
async function said(appId: string, actor: string, type: string, r: Row) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
  // Once for the app, and once for each task it is about, so a task's history has it too.
  await db.transaction(async (tx) => { for (const issueId of r.issueIds?.length ? r.issueIds : [null]) await appendEvent(tx, { workspaceId: a.workspaceId, appId, issueId, ...(issueId ? {} : { ideaId: r.ideaIds?.[0] ?? null, projectId: r.projectIds?.[0] ?? null }), actor, type, payload: { noteId: r.id, on: r.on, kind: r.kind, status: r.status, heading: r.title } }) })
}

/** A note written down: for today unless it says which day. */
export async function addNote(appId: string, i: { title: string; body?: string; on?: string; kind?: string; issueIds?: string[]; /** A Context's (context.ts): checked there. */ ideaIds?: string[]; projectIds?: string[]; status?: NoteStatus; answer?: string | null; background?: string | null }, actor = 'user'): Promise<NoteView> {
  const title = String(i.title ?? '').trim().slice(0, 200)
  if (!title) throw new PlanError('a note needs a title: what it is about, in a line')
  const [row] = await db.insert(note).values({ id: newId('note'), appId, on: i.on ? aDay(i.on) : dayOf(new Date()), kind: i.kind ? kindOf(i.kind) : 'note', title, body: String(i.body ?? '').trim().slice(0, 20_000), issueIds: await tasksOf(appId, i.issueIds), ideaIds: i.ideaIds ?? [], projectIds: i.projectIds ?? [], status: i.status ?? 'settled', answer: String(i.answer ?? '').trim().slice(0, 500) || null, background: String(i.background ?? '').trim().slice(0, 20_000) || null, createdBy: actor }).returning()
  await said(appId, actor, 'note.added', row)
  return (await views(appId, [row]))[0]
}
async function rowOf(appId: string, id: string) {
  const [r] = await db.select().from(note).where(and(eq(note.appId, appId), eq(note.id, id)))
  if (!r) throw new PlanError('no such note')
  return r
}
/** Any of it changed: what it says, its day, what kind it is, the tasks it is about. */
export async function editNote(appId: string, id: string, i: { title?: string; body?: string; on?: string; kind?: string; issueIds?: string[]; status?: NoteStatus; answer?: string | null; waitingOn?: string | null; background?: string | null }, actor = 'user'): Promise<NoteView> {
  const r = await rowOf(appId, id)
  const title = i.title === undefined ? r.title : String(i.title).trim().slice(0, 200)
  if (!title && !(i.answer ?? r.answer)) throw new PlanError('a note needs a title')
  const [row] = await db.update(note).set({ title, body: i.body === undefined ? r.body : String(i.body).trim().slice(0, 20_000), on: i.on === undefined ? r.on : aDay(i.on), kind: i.kind === undefined ? r.kind : kindOf(i.kind), issueIds: i.issueIds === undefined ? r.issueIds : await tasksOf(appId, i.issueIds), status: i.status === undefined ? r.status : statusOf(i.status), answer: i.answer === undefined ? r.answer : String(i.answer ?? '').trim().slice(0, 500) || null, waitingOn: i.waitingOn === undefined ? r.waitingOn : String(i.waitingOn ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) || null, background: i.background === undefined ? r.background : String(i.background ?? '').trim().slice(0, 20_000) || null, updatedAt: new Date() }).where(eq(note.id, id)).returning()
  await said(appId, actor, 'note.changed', row)
  return (await views(appId, [row]))[0]
}
export async function removeNote(appId: string, id: string, actor = 'user') {
  const r = await rowOf(appId, id)
  await db.delete(note).where(eq(note.id, id))
  await said(appId, actor, 'note.removed', r)
  return { removed: r.title }
}
