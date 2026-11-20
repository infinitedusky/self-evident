/**
 * Where a piece of work came from, word for word (Sandy, 2026-11-20: "I don't want the agent building like off a
 * summary or a brief and not having access to the actual ticket … this should apply to all tickets, no matter where
 * they come from"). An origin is a ticket as its tracker has it: title, text, comments, what it links to, and the
 * images in it, kept on this computer. Linear is the first source (linear-import.ts); another tracker adds a source
 * and calls `keepOrigin` the same way.
 *
 * It is never edited here. The idea, project or task made from it may be rewritten, split or trimmed; the origin
 * stays as the source said it, and is brought up to date only from the source. Ideas, projects and tasks point at it
 * (`origin_id`), and a task with none of its own has its parent's, its project's or its idea's: so every task split
 * from one ticket has the whole ticket. Every agent working on one of them is given it (`originPrompt`): the idea's
 * and the task's own agents, the steps' agents, the planner and every builder.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { idea, issue, origin, project } from './db/schema.js'
import { newId } from './ids.js'

export type Origin = typeof origin.$inferSelect
export interface OriginInput {
  source: string; ref: string; url?: string | null; title: string; body?: string | null
  comments?: Origin['comments']; links?: Origin['links']; files?: Origin['files']
}

/** Where an origin's files are kept: one folder per app and ticket. */
export const originsHome = () => process.env.ORIGINS_HOME ?? join(homedir(), '.self-evident', 'origins')

/** Keep an origin, or bring the one this ticket already is up to date. */
export async function keepOrigin(tx: Tx | typeof db, appId: string, o: OriginInput): Promise<Origin> {
  const values = { title: o.title.slice(0, 500), url: o.url ?? null, body: o.body ?? null, comments: o.comments ?? [], links: o.links ?? [], files: o.files ?? [], fetchedAt: new Date() }
  const [row] = await tx.insert(origin).values({ id: newId('origin'), appId, source: o.source, ref: o.ref, ...values })
    .onConflictDoUpdate({ target: [origin.appId, origin.source, origin.ref], set: values }).returning()
  return row
}

/**
 * The origin of a task, sub-task, project or idea: its own, else (for a task) its parent's, its project's or its
 * idea's. Null when it was made here, from nothing outside.
 */
export async function originOf(of: { issueId?: string | null; ideaId?: string | null; projectId?: string | null }): Promise<Origin | null> {
  const byId = async (id: string | null | undefined) => (id ? (await db.select().from(origin).where(eq(origin.id, id)))[0] ?? null : null)
  if (of.issueId) {
    let [i] = await db.select().from(issue).where(eq(issue.id, of.issueId))
    for (let up = 0; i && !i.originId && i.parentId && up < 5; up++) [i] = await db.select().from(issue).where(eq(issue.id, i.parentId))
    if (i?.originId) return byId(i.originId)
    if (i?.projectId) { const [p] = await db.select().from(project).where(eq(project.id, i.projectId)); if (p?.originId) return byId(p.originId) }
    if (i?.ideaId) { const [d] = await db.select().from(idea).where(eq(idea.id, i.ideaId)); if (d?.originId) return byId(d.originId) }
    return null
  }
  if (of.projectId) {
    const [p] = await db.select().from(project).where(eq(project.id, of.projectId))
    if (p?.originId) return byId(p.originId)
    if (p?.ideaId) { const [d] = await db.select().from(idea).where(eq(idea.id, p.ideaId)); return byId(d?.originId) }
    return null
  }
  if (of.ideaId) { const [d] = await db.select().from(idea).where(eq(idea.id, of.ideaId)); return byId(d?.originId) }
  return null
}

const SOURCE: Record<string, string> = { linear: 'Linear' }
export const sourceName = (o: Pick<Origin, 'source'>) => SOURCE[o.source] ?? o.source

/** The origin as every agent working on it is given it: whole, with how to hold it beside the brief. */
export function originPrompt(o: Origin | null): string {
  if (!o) return ''
  const comments = o.comments.length
    ? `\n\n### Its comments, oldest first\n\n${o.comments.map((c) => `**${c.author ?? 'Someone'}**, ${c.at.slice(0, 10)}:\n\n${c.body.trim()}`).join('\n\n---\n\n')}`
    : ''
  const links = o.links.length ? `\n\n### What it links to\n\n${o.links.map((l) => `- ${l.title}: ${l.url}`).join('\n')}` : ''
  const files = o.files.length
    ? `\n\n### Its images and files\n\n${o.files.map((f) => (f.path ? `- ${f.url}: kept at ${f.path} (open it with Read)` : `- ${f.url}: could not be fetched${f.note ? ` (${f.note})` : ''}`)).join('\n')}`
    : ''
  return [
    '',
    `## Where this came from: ${sourceName(o)} ${o.ref}, word for word`,
    '',
    `This work came from ${sourceName(o)} ${o.ref}${o.url ? ` (${o.url})` : ''}, as the person who asked wrote it. A brief, a plan or a sub-task's instructions say how it is being done; this says what was asked. Read it before you start. Where what you were given leaves something out of it, or says something different, follow what you were given, and say so plainly in what you write back, naming the part of the ticket. Never quietly drop something the ticket asks for.${o.files.some((f) => f.path) ? ' Look at its images: they are part of what was asked.' : ''}`,
    '',
    `### ${o.title}`,
    '',
    o.body?.trim() || '(The ticket has no text beyond its title.)',
  ].join('\n') + comments + links + files + '\n'
}

/** The origin as a page shows it: what the agents are given. */
export const originView = (o: Origin | null) => (o ? { id: o.id, source: o.source, sourceName: sourceName(o), ref: o.ref, url: o.url, title: o.title, body: o.body, comments: o.comments, links: o.links, files: o.files.map((f) => ({ url: f.url, kept: !!f.path, note: f.note ?? null })), fetchedAt: o.fetchedAt } : null)

/**
 * The images and uploads a ticket's text links to, fetched and kept beside it so an agent can open them. `matches`
 * picks the source's own uploads (they need its key); `headers` is how to ask for them. A file that can't be fetched
 * is still listed, with why.
 */
export async function keepFiles(appId: string, source: string, ref: string, texts: (string | null | undefined)[], matches: (url: string) => boolean, headers: Record<string, string>, get: typeof fetch = fetch): Promise<Origin['files']> {
  const urls = [...new Set(texts.flatMap((t) => [...(t ?? '').matchAll(/https?:\/\/[^\s)<>"'\]]+/g)].map((m) => m[0])).filter(matches))]
  if (!urls.length) return []
  const dir = join(originsHome(), appId, `${source}-${ref}`.replace(/[^\w.-]/g, '_'))
  await mkdir(dir, { recursive: true })
  const out: Origin['files'] = []
  for (const [n, url] of urls.entries()) {
    try {
      const res = await get(url, { headers })
      if (!res.ok) { out.push({ url, path: null, note: `${res.status} ${res.statusText}`.trim() }); continue }
      const type = res.headers.get('content-type') ?? ''
      const ext = type.includes('png') ? '.png' : type.includes('jpeg') ? '.jpg' : type.includes('gif') ? '.gif' : type.includes('webp') ? '.webp' : type.includes('svg') ? '.svg' : type.includes('pdf') ? '.pdf' : (url.match(/\.(\w{2,5})(?:\?|$)/)?.[0].replace('?', '') ?? '')
      const path = join(dir, `${String(n + 1).padStart(2, '0')}${ext}`)
      await writeFile(path, Buffer.from(await res.arrayBuffer()))
      out.push({ url, path })
    } catch (e) { out.push({ url, path: null, note: String((e as Error)?.message ?? e).slice(0, 200) }) }
  }
  return out
}
