/**
 * A prototype's code, to read beside it running (Sandy, 2026-11-13: "we should have the view of it functioning, and
 * we should have a diff view of all the files that changed. The agent should be able to add files to that view for
 * reference if the user asks a question. It can then highlight areas, or show docs pages"). A prototype is a sample
 * of what will be merged, so what it changed is worth reading as it is used.
 *
 * Two lists. What changed: every file that differs from where its branch left the app's default branch, committed or
 * not, each with its diff. What the agent is showing: files (changed or not) and pages on the web it put there to
 * answer a question, each with a line saying why and, for a file, the lines to look at. Those are kept on the
 * prototype's row; the diff is always read from git, never stored.
 *
 * After GitHub's "Files changed" (the list, the counts, one file's diff at a time) and the way a reviewer leaves a
 * note on a range of lines there.
 */
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, prototype } from './db/schema.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { newId } from './ids.js'
import { PlanError } from './projects.js'

export type Lines = { from: number; to: number }
export interface Shown { id: string; kind: 'file' | 'link'; /** A file, relative to the prototype's worktree. */ path?: string; url?: string; title?: string; /** Why it is here, in a line or two. */ note?: string; /** Lines of the file as it is now. */ lines?: Lines[]; by: string; at: string }
export interface Changed { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; added: number | null; removed: number | null; from?: string }

const MAX_BYTES = 400_000
const MAX_SHOWN = 40

async function rowOf(id: string) {
  const [p] = await db.select().from(prototype).where(eq(prototype.id, id))
  if (!p) throw new PlanError(`no prototype ${id}`)
  return p
}
const shownOf = (p: typeof prototype.$inferSelect) => (Array.isArray(p.shown) ? p.shown : []) as Shown[]

/** A path inside the worktree, as git names it; anything that leaves it is refused. */
export function inside(root: string, path: string) {
  const rel = relative(root, resolve(root, path.trim()))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new PlanError(`${path} is not a file in the prototype's worktree`)
  return rel
}

/** Where the prototype's branch left the app's default branch: what "changed" is measured from. */
async function baseOf(p: typeof prototype.$inferSelect) {
  const [a] = await db.select({ def: app.defaultBranch }).from(app).where(eq(app.id, p.appId))
  for (const ref of [`origin/${a?.def ?? 'main'}`, a?.def ?? 'main', 'origin/main', 'main', 'master']) {
    const r = await git(p.path, ['merge-base', 'HEAD', ref], { allowFail: true })
    if (r.code === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  throw new PlanError('cannot tell where this prototype\'s branch started: the app\'s default branch is not in its repository')
}

const STATUS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'added', T: 'modified' } as const

/** Every file that differs from the base, in the worktree as it is now (so uncommitted work shows), with new files nobody has added yet. */
export async function changedFiles(path: string, base: string): Promise<Changed[]> {
  const names = (await git(path, ['diff', '--name-status', '-M', base])).stdout.split('\n').filter(Boolean)
  const counts = new Map((await git(path, ['diff', '--numstat', '-M', base])).stdout.split('\n').filter(Boolean).map((l) => {
    const [a, r, ...rest] = l.split('\t')
    const name = rest.join('\t').replace(/\{(.*) => (.*)\}/, '$2').replace(/^.* => /, '') // a rename prints old => new
    return [name, { added: a === '-' ? null : Number(a), removed: r === '-' ? null : Number(r) }] as const
  }))
  const tracked = names.map((l): Changed => {
    const [code, a, b] = l.split('\t')
    const file = b ?? a
    return { path: file, status: STATUS[code[0] as keyof typeof STATUS] ?? 'modified', ...(counts.get(file) ?? { added: null, removed: null }), ...(b ? { from: a } : {}) }
  })
  const fresh = (await git(path, ['ls-files', '--others', '--exclude-standard'])).stdout.split('\n').filter(Boolean)
  const untracked = await Promise.all(fresh.map(async (file): Promise<Changed> => {
    const text = await readText(resolve(path, file))
    return { path: file, status: 'added', added: text == null ? null : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), removed: text == null ? null : 0 }
  }))
  return [...tracked, ...untracked].sort((x, y) => x.path.localeCompare(y.path))
}

/** A file's text, or null when it is missing, not text, or too big to show. */
async function readText(file: string): Promise<string | null> {
  const s = await stat(file).catch(() => null)
  if (!s?.isFile() || s.size > MAX_BYTES) return null
  const buf = await readFile(file)
  return buf.subarray(0, 8000).includes(0) ? null : buf.toString('utf8')
}

/** What the Code view lists: what changed, and what the agent is showing. */
export async function prototypeCode(id: string) {
  const p = await rowOf(id)
  if (p.status === 'discarded') throw new PlanError('this prototype was discarded; its worktree is gone')
  const base = await baseOf(p)
  return { prototypeId: p.id, branch: p.branch, base: base.slice(0, 9), files: await changedFiles(p.path, base), shown: shownOf(p) }
}

/** One file: its diff against the base when it changed, and its text as it is now. */
export async function prototypeFile(id: string, path: string) {
  const p = await rowOf(id)
  const rel = inside(p.path, path)
  const base = await baseOf(p)
  const tracked = (await git(p.path, ['ls-files', '--error-unmatch', '--', rel], { allowFail: true })).code === 0
  const content = await readText(resolve(p.path, rel))
  const there = !!(await stat(resolve(p.path, rel)).catch(() => null))?.isFile()
  let patch: string | null = null
  if (tracked || !there) patch = (await git(p.path, ['diff', '-M', base, '--', rel], { allowFail: true })).stdout || null
  else if (content != null) patch = [`--- /dev/null`, `+++ b/${rel}`, `@@ -0,0 +1,${content.split('\n').length - (content.endsWith('\n') ? 1 : 0)} @@`, ...content.replace(/\n$/, '').split('\n').map((l) => `+${l}`)].join('\n') // new and not added yet: all of it is the change
  if (!there && !patch) throw new PlanError(`no file ${rel} in the prototype's worktree`)
  return { path: rel, patch, content, missing: !there, unreadable: there && content == null }
}

const cleanLines = (lines?: Lines[]) => (lines ?? []).map((l) => ({ from: Math.max(1, Math.floor(l.from)), to: Math.max(1, Math.floor(l.to ?? l.from)) })).filter((l) => Number.isFinite(l.from) && Number.isFinite(l.to)).map((l) => (l.to < l.from ? { from: l.to, to: l.from } : l)).slice(0, 20)

async function tell(p: typeof prototype.$inferSelect, actor: string, payload: Record<string, unknown>) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, p.appId))
  const ws = a?.workspaceId ?? 'ws_none'
  await db.transaction((tx) => appendEvent(tx, { workspaceId: ws, appId: p.appId, projectId: p.projectId, actor, type: 'prototype.shown', payload: { prototypeId: p.id, title: p.title, ...payload } }))
  // Something new to look at: the person is taken to the prototype's step of its task (or idea), on its Code view, the way open_tab takes them to a sketch.
  const root = p.issueId ? `/tasks/${p.issueId}` : p.ideaId ? `/ideas/${p.ideaId}` : null
  if (root && payload.shownId) await db.transaction((tx) => appendEvent(tx, { workspaceId: ws, appId: p.appId, actor, type: 'ui.open', payload: { tab: { kind: 'page', path: `${root}/prototype?shown=${payload.shownId}` }, split: null, ...(p.issueId ? { issueId: p.issueId } : { ideaId: p.ideaId }) } }))
}

/**
 * Put a file or a page on the web into the Code view, and take the person to it. Showing the same file or address
 * again replaces what was said about it, so the list never repeats.
 */
export async function showInPrototype(id: string, i: { file?: string; url?: string; title?: string; note?: string; lines?: Lines[] }, actor = 'agent') {
  const p = await rowOf(id)
  if (!!i.file === !!i.url) throw new PlanError('show one thing: a file in the prototype\'s worktree, or a url')
  let made: Shown
  if (i.file) {
    const rel = inside(p.path, i.file)
    if (!(await stat(resolve(p.path, rel)).catch(() => null))?.isFile()) throw new PlanError(`no file ${rel} in the prototype's worktree (${p.path})`)
    made = { id: newId('run'), kind: 'file', path: rel, ...(i.note?.trim() ? { note: i.note.trim() } : {}), ...(cleanLines(i.lines).length ? { lines: cleanLines(i.lines) } : {}), by: actor, at: new Date().toISOString() }
  } else {
    if (!/^https?:\/\//.test(i.url!.trim())) throw new PlanError('a page to show needs an http(s) address')
    made = { id: newId('run'), kind: 'link', url: i.url!.trim(), ...(i.title?.trim() ? { title: i.title.trim() } : {}), ...(i.note?.trim() ? { note: i.note.trim() } : {}), by: actor, at: new Date().toISOString() }
  }
  const rest = shownOf(p).filter((s) => (made.kind === 'file' ? s.path !== made.path : s.url !== made.url))
  await db.update(prototype).set({ shown: [made, ...rest].slice(0, MAX_SHOWN) }).where(eq(prototype.id, id))
  await tell(p, actor, { shownId: made.id, ...(made.path ? { path: made.path } : { url: made.url }) })
  return { shown: made, note: 'It is in the Code view of the prototype, selected, and the person has been taken there.' }
}

/** Take one thing out of what is shown (or all of it, with no id). The changed files are never touched. */
export async function unshowInPrototype(id: string, shownId?: string, actor = 'person') {
  const p = await rowOf(id)
  const rest = shownId ? shownOf(p).filter((s) => s.id !== shownId && s.path !== shownId && s.url !== shownId) : []
  await db.update(prototype).set({ shown: rest }).where(eq(prototype.id, id))
  await tell(p, actor, { removed: shownId ?? 'all' })
  return { shown: rest }
}
