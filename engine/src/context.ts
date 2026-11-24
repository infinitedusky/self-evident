/**
 * Context (docs/context-brief.md; Sandy, 2026-11-24): "a place to put things ahead of research, and to record
 * structured thoughts that guide every agent working on a piece of work". An idea, a project and a task each have
 * one, always. It holds three kinds of thing:
 *
 * - Reference docs. The ticket the work came from is the first (the origin it already points at, origins.ts): never
 *   edited here, brought up to date from its tracker. Beside it: another ticket by its id, text pasted in, a file
 *   brought in (text, Markdown, or a PDF or an HTML page kept as the file it was). Rows of `context_doc`.
 * - Notes and decisions. These are the app's notes (notes.ts): one set, so what is written here is also dated and in
 *   the reports. A decision is a question and its answer; one with no answer yet is open, and is shown and counted
 *   until it is made (nothing waits on it). An answer an agent proposed waits for the person, who accepts or rejects it; a rejected one is
 *   kept, so the agents are told and do not propose it again.
 *
 * A task in a project also sees its project's, read-only. When an idea becomes a task, its context goes to the task;
 * when it becomes a project, to the project, so every task in it has it (work.ts calls `moveContext`).
 *
 * What an agent is given (`contextPrompt`): every decision and note in full; the docs marked "in full", in full; the
 * others by title and description with where each is kept on this computer, to open when the work needs it. The
 * originating ticket is given whole by `originPrompt`, as before.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db, type Tx } from './db/client.js'
import { contextDoc, idea, issue, note, origin, project } from './db/schema.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'
import { keepTicket } from './linear-import.js'
import { addNote, dayOf, editNote, removeNote, type NoteStatus } from './notes.js'
import { originOf, originPrompt, originView, sourceName, type Origin } from './origins.js'
import { app } from './db/schema.js'

export type Subject = { ideaId: string } | { issueId: string } | { projectId: string }
/** In characters: the most a doc may hold, and the most one given to every agent in full may hold. A file: in bytes. */
export const LIMITS = { doc: 200_000, inFull: 20_000 }
const FILE_BYTES = 20 * 1024 * 1024
type DocRow = typeof contextDoc.$inferSelect
type NoteRow = typeof note.$inferSelect

/** Where the docs an agent opens are kept: one folder per app. */
export const contextHome = () => process.env.CONTEXT_HOME ?? join(homedir(), '.self-evident', 'context')

/** What it is of, found: its app, and for a task its project (a real one, not the one made to hold a single task). */
async function found(s: Subject) {
  if ('issueId' in s) {
    let [t] = await db.select().from(issue).where(eq(issue.id, s.issueId))
    for (let up = 0; t?.parentId && up < 5; up++) [t] = await db.select().from(issue).where(eq(issue.id, t.parentId)) // a sub-task has its task's
    if (!t) throw new PlanError('no such task')
    const [p] = t.projectId ? await db.select().from(project).where(eq(project.id, t.projectId)) : []
    return { on: 'task' as const, appId: t.appId, key: { issueId: t.id } as Subject, project: p && !p.solo ? { id: p.id, name: p.name, originId: p.originId } : null }
  }
  if ('ideaId' in s) {
    const [i] = await db.select().from(idea).where(eq(idea.id, s.ideaId))
    if (!i) throw new PlanError('no such idea')
    return { on: 'idea' as const, appId: i.appId, key: { ideaId: i.id } as Subject, project: null as null | { id: string; name: string; originId: string | null } }
  }
  const [p] = await db.select().from(project).where(eq(project.id, s.projectId))
  if (!p) throw new PlanError('no such project')
  return { on: 'project' as const, appId: p.appId, key: { projectId: p.id } as Subject, project: null as null | { id: string; name: string; originId: string | null } }
}
type Found = Awaited<ReturnType<typeof found>>
const docsOf = (k: Found['key']) => db.select().from(contextDoc).where('issueId' in k ? eq(contextDoc.issueId, k.issueId) : 'ideaId' in k ? eq(contextDoc.ideaId, k.ideaId) : eq(contextDoc.projectId, k.projectId)).orderBy(asc(contextDoc.createdAt))
const has = (col: AnyPgColumn, id: string) => sql`${col} @> ${JSON.stringify([id])}::jsonb`
const notesOf = (appId: string, k: Found['key']) => db.select().from(note).where(and(eq(note.appId, appId), 'issueId' in k ? has(note.issueIds, k.issueId) : 'ideaId' in k ? has(note.ideaIds, k.ideaId) : has(note.projectIds, k.projectId))).orderBy(asc(note.on), asc(note.createdAt))
const originChars = (o: Origin) => (o.body?.length ?? 0) + o.comments.reduce((n, c) => n + c.body.length, 0)

/** Everything a Context holds, with the project's for a task in one: the rows the view and the prompt are made from. */
async function gather(s: Subject) {
  const f = await found(s)
  const own = await originOf(f.key)
  const origins = new Map<string, Origin>()
  const byId = async (id: string | null) => { if (!id) return null; if (!origins.has(id)) { const [o] = await db.select().from(origin).where(eq(origin.id, id)); if (o) origins.set(id, o) } return origins.get(id) ?? null }
  const docs: { row: DocRow | null; origin: Origin | null; originating: boolean; fromProject: boolean }[] = []
  if (own) docs.push({ row: null, origin: own, originating: true, fromProject: false })
  for (const row of await docsOf(f.key)) docs.push({ row, origin: await byId(row.originId), originating: false, fromProject: false })
  const notes: { row: NoteRow; fromProject: boolean }[] = (await notesOf(f.appId, f.key)).map((row) => ({ row, fromProject: false }))
  if (f.project) {
    const theirs = await byId(f.project.originId)
    if (theirs && theirs.id !== own?.id) docs.push({ row: null, origin: theirs, originating: false, fromProject: true })
    for (const row of await docsOf({ projectId: f.project.id })) docs.push({ row, origin: await byId(row.originId), originating: false, fromProject: true })
    for (const row of await notesOf(f.appId, { projectId: f.project.id })) if (!notes.some((n) => n.row.id === row.id)) notes.push({ row, fromProject: true })
  }
  return { f, docs: docs.filter((d) => d.row?.kind !== 'ticket' || d.origin), notes }
}

/** A Context as its page shows it. */
export async function contextOf(s: Subject) {
  const { f, docs, notes } = await gather(s)
  const [a] = await db.select({ key: app.key }).from(app).where(eq(app.id, f.appId))
  const others = [...new Set(notes.flatMap((n) => n.row.issueIds ?? []))].filter((id) => !('issueId' in f.key) || id !== f.key.issueId)
  const tasks = others.length ? await db.select({ id: issue.id, number: issue.number, title: issue.title }).from(issue).where(and(eq(issue.appId, f.appId), inArray(issue.id, others))) : []
  return {
    on: f.on, project: f.project ? { id: f.project.id, name: f.project.name } : null, limits: LIMITS,
    docs: docs.map(({ row, origin: o, originating, fromProject }) => o
      ? { id: row?.id ?? o.id, title: o.title, description: row?.description ?? null, from: 'ticket' as const, ticket: { originating, origin: originView(o)! }, fileName: null, body: null, kept: false, chars: originChars(o), inFull: originating || !!row?.inFull, addedBy: row?.createdBy ?? null, addedAt: (row?.createdAt ?? o.createdAt).toISOString(), fromProject }
      : { id: row!.id, title: row!.title, description: row!.description, from: row!.kind as 'pasted' | 'file', ticket: null, fileName: row!.fileName, body: row!.body, kept: !!row!.filePath, chars: row!.body?.length ?? 0, inFull: row!.inFull, addedBy: row!.createdBy, addedAt: row!.createdAt.toISOString(), fromProject }),
    notes: notes.map(({ row: r, fromProject }) => ({ id: r.id, kind: r.kind as 'note' | 'decision', status: r.status as NoteStatus, ...qa(r), background: r.background, waitingOn: ['open', 'proposed'].includes(r.status) ? r.waitingOn : null, body: r.body, on: r.on, addedBy: r.createdBy, fromProject,
      alsoAbout: fromProject ? [] : (r.issueIds ?? []).flatMap((id) => { const t = tasks.find((x) => x.id === id); return t ? [{ id: t.id, name: identifier(a?.key ?? '', t.number), title: t.title }] : [] }) })),
  }
}
export type ContextView = Awaited<ReturnType<typeof contextOf>>

/** A decision as question and answer. One made as a single statement (before questions, or from the Reports page) is an answer with no question. */
const qa = (r: NoteRow) => (r.kind === 'decision' && r.status === 'settled' && !r.answer ? { title: '', answer: r.title } : { title: r.title, answer: r.answer })

/** How much it holds, for a nav: everything in it, the decisions that are the person's to make now, and the ones they are waiting on someone for. */
export async function contextCount(s: Subject) {
  const { docs, notes } = await gather(s)
  return { count: docs.length + notes.filter((n) => n.row.status === 'settled').length, proposed: notes.filter((n) => !n.fromProject && ['proposed', 'open'].includes(n.row.status) && !n.row.waitingOn).length, waiting: notes.filter((n) => !n.fromProject && ['proposed', 'open'].includes(n.row.status) && !!n.row.waitingOn).length }
}

const line = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
function textOf(v: unknown) {
  const body = String(v ?? '').replace(/\r\n/g, '\n').trim()
  if (!body) throw new PlanError('a doc needs its text')
  if (body.length > LIMITS.doc) throw new PlanError(`that is ${body.length.toLocaleString('en-US')} characters, and a doc holds up to ${LIMITS.doc.toLocaleString('en-US')}. Cut it down, or split it in two.`)
  return body
}
const fits = (inFull: boolean, chars: number) => { if (inFull && chars > LIMITS.inFull) throw new PlanError(`a doc given to every agent in full holds up to ${LIMITS.inFull.toLocaleString('en-US')} characters; this one is ${chars.toLocaleString('en-US')}. It stays listed, and an agent opens it when it needs it.`); return inFull }

/** Text pasted in. */
export async function addDoc(s: Subject, i: { title?: string; description?: string; body?: string; inFull?: boolean }, actor = 'user') {
  const f = await found(s)
  const title = line(i.title, 200)
  if (!title) throw new PlanError('a doc needs a title')
  const body = textOf(i.body)
  await db.insert(contextDoc).values({ id: newId('contextDoc'), appId: f.appId, ...f.key, kind: 'pasted', title, description: line(i.description, 300) || null, body, inFull: fits(!!i.inFull, body.length), createdBy: actor })
  return contextOf(s)
}

/** What a kept file is called, from its name. */
const keptAs = (name: string | null | undefined) => (/\.html?$/i.test(name ?? '') ? 'an HTML page' : 'a PDF')

/**
 * A file brought in. Text and Markdown become text that can be edited. A PDF and an HTML page (a mock-up, a Claude
 * artifact saved from the browser; Sandy, 2026-11-24: "HTML should be allowed") are kept as the file, for the agent
 * that needs it to open: an HTML page's markup is the thing itself, not words to edit here.
 */
export async function addFile(s: Subject, file: { name: string; type?: string; bytes: Buffer }, actor = 'user') {
  const f = await found(s)
  const name = line(file.name, 200) || 'file'
  const ext = name.toLowerCase().match(/\.(\w+)$/)?.[1] ?? ''
  const html = ['html', 'htm'].includes(ext) || file.type === 'text/html'
  const pdf = html || ext === 'pdf' || file.type === 'application/pdf' // kept as the file
  if (!pdf && !['txt', 'md', 'markdown', 'text'].includes(ext) && !file.type?.startsWith('text/')) throw new PlanError(`${name} is not a text, Markdown, PDF or HTML file. Paste what it says instead.`)
  if (file.bytes.length > FILE_BYTES) throw new PlanError(`${name} is larger than 20 MB.`)
  const id = newId('contextDoc')
  const title = name.replace(/\.\w+$/, '')
  if (pdf) {
    const dir = join(contextHome(), f.appId)
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${id}.${html ? 'html' : 'pdf'}`)
    await writeFile(path, file.bytes)
    await db.insert(contextDoc).values({ id, appId: f.appId, ...f.key, kind: 'file', title, fileName: name, filePath: path, createdBy: actor })
  } else {
    await db.insert(contextDoc).values({ id, appId: f.appId, ...f.key, kind: 'file', title, fileName: name, body: textOf(file.bytes.toString('utf8')), createdBy: actor })
  }
  return contextOf(s)
}

/** Another ticket, by its id in the tracker: kept whole as an origin, and listed here. */
export async function addTicket(s: Subject, ref: unknown, actor = 'user', keep: (appId: string, ref: string) => Promise<Origin> = keepTicket) {
  const f = await found(s)
  const o = await keep(f.appId, String(ref ?? ''))
  const own = await originOf(f.key)
  if (own?.id === o.id || (await docsOf(f.key)).some((d) => d.originId === o.id)) throw new PlanError(`${sourceName(o)} ${o.ref} is already in this context.`)
  await db.insert(contextDoc).values({ id: newId('contextDoc'), appId: f.appId, ...f.key, kind: 'ticket', originId: o.id, title: o.title.slice(0, 200), createdBy: actor })
  return contextOf(s)
}

/** One of its own docs, by id: never the project's, seen from a task. */
async function docOf(f: Found, id: string) {
  const row = (await docsOf(f.key)).find((d) => d.id === id)
  if (!row) throw new PlanError('no such doc in this context')
  return row
}

/** A ticket, as its tracker has it now: the one the work came from (its id is the origin's), or one added beside it. */
export async function refreshDoc(s: Subject, id: string, keep: (appId: string, ref: string) => Promise<Origin> = keepTicket) {
  const f = await found(s)
  const own = await originOf(f.key)
  const originId = own?.id === id ? id : (await docOf(f, id)).originId
  const [o] = originId ? await db.select().from(origin).where(eq(origin.id, originId)) : []
  if (!o) throw new PlanError('that doc is not a ticket: there is nothing to bring up to date')
  if (o.source !== 'linear') throw new PlanError(`${sourceName(o)} cannot be read again from here yet`)
  await keep(f.appId, o.ref)
  return contextOf(s)
}

export async function editDoc(s: Subject, id: string, i: { title?: string; description?: string; body?: string; inFull?: boolean }) {
  const f = await found(s)
  const own = await originOf(f.key)
  if (own?.id === id) throw new PlanError('the ticket the work came from is never edited here: it stays as its tracker has it')
  const r = await docOf(f, id)
  const ticket = r.kind === 'ticket', pdf = !!r.filePath
  if ((ticket || pdf) && i.body !== undefined) throw new PlanError(ticket ? 'a ticket stays as its tracker has it' : `${keptAs(r.fileName)} is kept as the file it was; its words are not edited here`)
  const title = i.title === undefined || ticket ? r.title : line(i.title, 200)
  if (!title) throw new PlanError('a doc needs a title')
  const body = i.body === undefined ? r.body : textOf(i.body)
  const [o] = ticket && r.originId ? await db.select().from(origin).where(eq(origin.id, r.originId)) : []
  const inFull = i.inFull === undefined ? r.inFull && (body?.length ?? 0) <= LIMITS.inFull : fits(i.inFull, o ? originChars(o) : body?.length ?? 0)
  if (inFull && pdf) throw new PlanError(`${keptAs(r.fileName)} is opened by the agent that needs it; it cannot be put in front of every agent`)
  await db.update(contextDoc).set({ title, description: i.description === undefined ? r.description : line(i.description, 300) || null, body, inFull, updatedAt: new Date() }).where(eq(contextDoc.id, r.id))
  return contextOf(s)
}

export async function removeDoc(s: Subject, id: string) {
  const f = await found(s)
  const own = await originOf(f.key)
  if (own?.id === id) throw new PlanError('the ticket the work came from stays: it is where this came from')
  await db.delete(contextDoc).where(eq(contextDoc.id, (await docOf(f, id)).id))
  return contextOf(s)
}

/** One of its own notes, by id. */
async function noteOf(f: Found, id: string) {
  const row = (await notesOf(f.appId, f.key)).find((n) => n.id === id)
  if (!row) throw new PlanError('no such note in this context')
  return row
}

/**
 * A note, or a decision, written into it. A decision is a question (title) and its answer. With no answer it is open:
 * anyone may ask one. A person's answer is settled. An agent's is settled only when it says the person agreed to it in
 * conversation (`agreed`); otherwise it is proposed, and waits for the person. An answer to a question that is already
 * open here goes onto that question.
 */
export async function addContextNote(s: Subject, i: { kind?: string; title?: string; answer?: string; body?: string; /** A decision's: why it is a question. */ background?: string; on?: string; agreed?: boolean }, actor = 'user') {
  const f = await found(s)
  const decision = i.kind === 'decision'
  const title = line(i.title, 200)
  if (!title) throw new PlanError(decision ? 'a decision needs its question' : 'a note needs a title: what it is about, in a line')
  const answer = decision ? line(i.answer, 500) : ''
  const agent = actor.startsWith('agent')
  const status: NoteStatus = !decision ? 'settled' : !answer ? 'open' : agent && !i.agreed ? 'proposed' : 'settled'
  if (decision) {
    const same = (await notesOf(f.appId, f.key)).filter((n) => n.kind === 'decision' && n.title.toLowerCase() === title.toLowerCase())
    if (agent && answer && same.some((n) => n.status === 'rejected' && (n.answer ?? '').toLowerCase() === answer.toLowerCase())) throw new PlanError('the person already turned that answer down; do not propose it again')
    if (agent && status === 'proposed' && same.some((n) => n.status === 'proposed')) throw new PlanError('an answer to that is already proposed and waits for the person')
    const asked = same.find((n) => n.status === 'open')
    if (asked && !answer) { if (agent) throw new PlanError('that is already asked and waits for the person'); return { status, view: await contextOf(s) } }
    if (asked) { // the answer goes onto the question that was waiting
      await editNote(f.appId, asked.id, { answer, body: i.body ?? asked.body, background: i.background?.trim() ? i.background : undefined, status, ...(status === 'settled' ? { on: i.on ?? dayOf(new Date()) } : {}) }, actor)
      return { status, view: await contextOf(s) }
    }
  }
  // With no answer there is no "why this answer": what is said beside a question is why it is asked, its background.
  const asking = status === 'open' && !i.background?.trim()
  await addNote(f.appId, { title, answer, body: status === 'open' ? '' : i.body, background: decision ? (asking ? i.body : i.background) : undefined, on: i.on, kind: decision ? 'decision' : 'note', status, ...('issueId' in f.key ? { issueIds: [f.key.issueId] } : 'ideaId' in f.key ? { ideaIds: [f.key.ideaId] } : { projectIds: [f.key.projectId] }) }, actor)
  return { status, view: await contextOf(s) }
}

/** Its words or its day changed; an open decision answered; or a proposed answer accepted (settled) or turned down (rejected). */
export async function editContextNote(s: Subject, id: string, i: { title?: string; answer?: string; body?: string; background?: string; on?: string; status?: string; /** An open decision: who the person asked and is waiting on; empty: nobody now. */ waitingOn?: string | null }, actor = 'user') {
  const f = await found(s)
  const r = await noteOf(f, id)
  const decision = r.kind === 'decision'
  if ((i.status !== undefined || i.answer !== undefined || i.background !== undefined) && !decision) throw new PlanError('only a decision has an answer, and is accepted or rejected')
  if (i.status !== undefined && actor.startsWith('agent')) throw new PlanError('accepting or rejecting a proposed decision is the person\'s')
  const legacy = decision && r.status === 'settled' && !r.answer // one statement, kept as its title
  if (i.waitingOn !== undefined && !(decision && ['open', 'proposed'].includes(r.status))) throw new PlanError('only a decision with no answer yet waits on someone')
  const answer = i.answer === undefined ? undefined : line(i.answer, 500)
  let status = i.status as NoteStatus | undefined
  if (status === undefined && answer && r.status === 'open') status = 'settled' // a person answering it makes it
  const will = status ?? (r.status as NoteStatus)
  if (decision && will === 'settled' && !(answer ?? r.answer) && !legacy) throw new PlanError('a decision is made by giving its answer')
  if (decision && answer === '' && will !== 'open') throw new PlanError('a decision that is made has an answer; delete it, or ask the question again, to take it back')
  if (legacy && (answer !== undefined || i.title !== undefined)) {
    // Given a question and an answer, it becomes one; given only new words, it stays the statement it was.
    const question = line(i.title, 200)
    await editNote(f.appId, r.id, question ? { title: question, answer: answer || r.title, body: i.body, background: i.background, on: i.on } : { title: answer || r.title, body: i.body, background: i.background, on: i.on }, actor)
    return contextOf(s)
  }
  await editNote(f.appId, r.id, { title: i.title === undefined ? undefined : line(i.title, 200), answer, body: i.body, background: i.background, on: i.on, status, waitingOn: ['open', 'proposed'].includes(will) ? i.waitingOn : null }, actor) // once it has an answer it waits on nobody
  return contextOf(s)
}

export async function removeContextNote(s: Subject, id: string, actor = 'user') {
  const f = await found(s)
  await removeNote(f.appId, (await noteOf(f, id)).id, actor)
  return contextOf(s)
}

/**
 * An idea became a task or a project: everything in its context goes along. To the task; or, for a project, to the
 * project, so each of its tasks has it.
 */
export async function moveContext(tx: Tx, ideaId: string, to: { issueId: string } | { projectId: string }) {
  await tx.update(contextDoc).set({ ideaId: null, ...to, updatedAt: new Date() }).where(eq(contextDoc.ideaId, ideaId))
  for (const n of await tx.select().from(note).where(has(note.ideaIds, ideaId))) {
    await tx.update(note).set({ ideaIds: n.ideaIds.filter((x) => x !== ideaId), ...('issueId' in to ? { issueIds: [...new Set([...n.issueIds, to.issueId])] } : { projectIds: [...new Set([...n.projectIds, to.projectId])] }) }).where(eq(note.id, n.id))
  }
}

/** A listed doc, written where an agent can open it: its text, or a ticket as an agent reads one. */
async function keptAt(appId: string, id: string, text: string) {
  const dir = join(contextHome(), appId)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${id}.md`)
  await writeFile(path, text)
  return path
}

/** The Context as every agent on the work is given it; nothing when it holds nothing beyond the originating ticket. */
export async function contextPrompt(s: { issueId?: string; ideaId?: string; projectId?: string }, opts: { canWrite?: boolean } = {}): Promise<string> {
  const of_ = s.issueId ? { issueId: s.issueId } : s.ideaId ? { ideaId: s.ideaId } : s.projectId ? { projectId: s.projectId } : null
  if (!of_) return ''
  const { f, docs, notes } = await gather(of_)
  const from = (p: boolean) => (p ? ' (from the project)' : '')
  const of = (kind: string, status: string) => notes.filter((n) => n.row.kind === kind && n.row.status === status)
  const out: string[] = []
  const settled = of('decision', 'settled'), proposed = of('decision', 'proposed'), rejected = of('decision', 'rejected'), undecided = of('decision', 'open'), said = of('note', 'settled')
  const why = (r: NoteRow) => (r.body ? ` Why: ${r.body.replace(/\s+/g, ' ')}` : '')
  const asked = (r: NoteRow) => (r.waitingOn && ['open', 'proposed'].includes(r.status) ? ` [the person asked ${r.waitingOn} and is waiting for the answer]` : '')
  const background = (r: NoteRow) => (r.background ? `\n  Background: ${r.background.trim().replace(/\n+/g, '\n  ')}` : '')
  const decision = ({ row: r, fromProject }: (typeof notes)[number]) => `- ${r.answer ? `${r.title} → ${r.answer}` : r.title}${why(r)}${asked(r)}${from(fromProject)}${background(r)}`
  if (settled.length) out.push('### Decisions', '', 'Each a question and the answer the person settled on. Work to each one. Do not reopen them, argue with them or ask about them again; if one makes the work impossible, say so plainly and stop.', '', ...settled.map(decision), '')
  if (undecided.length) out.push('### Not decided yet', '', 'Questions with no answer. Do not guess one and do not work as if one were given. Where your work does not turn on one, carry on. Where it does, say so plainly to the person and ask, or propose an answer.', '', ...undecided.map(({ row: r, fromProject }) => `- ${r.title}${asked(r)}${from(fromProject)}${background(r)}`), '')
  if (proposed.length) out.push('### Answers proposed, waiting for the person', '', 'Not settled. Do not work as if they were, and do not propose them again.', '', ...proposed.map(decision), '')
  if (rejected.length) out.push('### Answers proposed and turned down by the person', '', 'Do not do these, and do not propose them again.', '', ...rejected.map(decision), '')
  if (said.length) out.push('### Notes', '', 'What was said or found along the way.', '', ...said.map(({ row: r, fromProject }) => `**${r.title}** (${r.on})${from(fromProject)}${r.body ? `\n\n${r.body.trim()}` : ''}`).flatMap((t) => [t, '']))
  const rest = docs.filter((d) => !(d.originating && !d.fromProject)) // the ticket the work came from is given whole already (originPrompt)
  const whole = rest.filter((d) => d.row?.inFull), listed = rest.filter((d) => !d.row?.inFull)
  for (const d of whole) out.push(d.origin ? originPrompt(d.origin).replace('## Where this came from:', '### Reference, in full:').replace(/This work came from[^\n]*\n/, `A ticket the person put beside this work${from(d.fromProject)}. Read it as reference: it is not what was asked.\n`).trim() : `### Reference, in full: ${d.row!.title}${from(d.fromProject)}\n\n${d.row!.description ? `${d.row!.description}\n\n` : ''}${d.row!.body ?? ''}`, '')
  if (listed.length) {
    out.push('### Reference docs, to open when the work needs one', '', 'Each is kept on this computer. Open one with Read when what it is about bears on what you are doing; do not open them all to begin with.', '')
    for (const d of listed) {
      const path = d.row?.filePath ?? await keptAt(f.appId, d.row?.id ?? d.origin!.id, d.origin ? originPrompt(d.origin) : `# ${d.row!.title}\n\n${d.row!.body ?? ''}\n`)
      const what = d.origin ? `${sourceName(d.origin)} ${d.origin.ref}: ${d.origin.title}` : d.row!.title
      out.push(`- ${what}${d.row?.description ? `: ${d.row.description}` : ''}${from(d.fromProject)} (${d.row?.filePath ? `${keptAs(d.row.fileName)}, ` : ''}${path})`)
    }
    out.push('')
  }
  const how = opts.canWrite === false ? '' : `\nThe \`context\` tool adds to it (${'issueId' in f.key ? `issueId ${f.key.issueId}` : 'ideaId' in f.key ? `ideaId ${f.key.ideaId}` : `projectId ${f.key.projectId}`}): a note of something found or said, a doc, a decision. A decision is a question and its answer. When something needs deciding and you have no answer to offer, ask it: it waits for the person. Record an answer as decided only when the person has given it or agreed to it in this conversation, in their own words. When you have an answer to suggest and they have not said yes, propose it: it waits for them, and is not settled until they accept it.\n`
  if (!out.length) return how ? `\n## Context\n\nNothing has been put in this ${f.on}'s context yet beyond what is above.\n${how}` : ''
  return ['', `## Context: what the person has put beside this ${f.on}`, '', ...out].join('\n') + how
}
