/**
 * An app's docs agent (Sandy, 2026-11-25: "we should have a subagent manages the docs. We can then give it skills and
 * any hooks that we need ensure we get what we want. Docs maintenance is a difficult thing to do well").
 *
 * One per app: a conversation of its own in the app's workbench folder, whose docs site (docs-site.ts) it alone
 * writes. Nobody else has a tool that writes a page: every other agent, and the person, asks it (`docs_agent`).
 *
 * The docs have two sections (Sandy, the same day):
 *   - `docs/system/`, "How the system works": what is true of the system now. It is added to when the codebase is
 *     learned (learn.ts): when Learn's agent has written, this one is asked to bring the section in line.
 *   - `docs/work/`, "Our work": a page per task, written when the task is closed (close.ts), and a page per project
 *     listing its tasks' pages (Sandy, later that day: "a simplified version of the actual user interface, but in
 *     the documentation that we can share with people"). A task's page has a set structure, which is a file of the
 *     workbench folder (`taskPage`): an introduction, the decisions, the questions, the call-outs, and what it
 *     changed in the system. That last part links each page of How the system works that is as it is because of the
 *     task, and the agent puts those pages right in the same turn.
 *
 * What it is given, so that we get what we want:
 *   - Skills: the workbench folder's own `.claude/skills/` arrive with the folder, as an app's do with its checkout.
 *   - A wall (`wall`): it edits pages under the two sections and nothing else, and runs nothing that leaves a mark.
 *   - A check when its turn ends (`checkPages`, then the site's own build): what fails is said back to it, twice at
 *     most. Then its pages are committed in the folder when that is a git repository, and the folder's
 *     `docs-written` hook is run (hooks.ts), which is where an app pushes them or tells someone.
 *
 * Where it stands is read from the app's events (`docs_agent.asked`, `docs_agent.wrote`): no table.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, decision, event, issue, pr, project, question, session } from './db/schema.js'
import { siteIn } from './docs-site.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { workbenchDirOf } from './hooks.js'
import { newId } from './ids.js'
import { identifier, PlanError } from './issues.js'
import { EDIT_TOOLS, type Risk } from './risk.js'

export const SECTIONS = [
  { key: 'system', dir: 'system', title: 'How the system works' },
  { key: 'work', dir: 'work', title: 'Our work' },
] as const
/** The one part of a task's page the engine holds whatever the app's own structure says: where it points back. */
export const CHANGED = 'What it changed in the system'
/** Where an app keeps the structure of a task's page: beside the skill that says how its pages are written. */
export const TASK_PAGE = join('.claude', 'skills', 'docs-pages', 'task-page.md')
/** The structure when the folder has none of its own. Each heading is a part of the page; under it, what goes there. */
export const DEFAULT_TASK_PAGE = `## Introduction

What the task was, for someone who was not there: what is different now that it is done, and the problem it answered. Take it from the task's description and brief. A few short paragraphs.

## Decisions

Each decision taken on the way, as its own third-level heading: the question, what was chosen, what was turned down, and why. Take them from the task's record, in the words used there. "None were recorded." when so.

## Questions

What was asked while it was planned and built, each with the answer that was given, and what is still open. "None." when so.

## Call-outs

What a reader should know before they rely on this or change it: what is fragile, what was left out on purpose, what surprised us.

## ${CHANGED}

A link to each page of How the system works that is as it is because of this task, each with a line saying what changed there.
`
/** The parts a project's page has. */
export const PROJECT_HEADINGS = ['Tasks']
/** The words a work page uses when it changed nothing a reader of How the system works would see. */
export const NOTHING_CHANGED = 'Nothing in how the system works changed'
const RETRIES = 2, ASK_MAX = 16_000

export type Why = 'learned' | 'work' | 'asked'
export interface DocsAgentView {
  /** The app has a docs site the agent can write in. */ ready: boolean
  /** Why not, in the person's words. */ problem: string | null
  /** Its conversation. Null: it has never been asked. */ sessionId: string | null
  busy: boolean
  /** Pages in each section, its index not counted. */ pages: { system: number; work: number }
  /** What it was last asked. */ asked: { why: Why; label: string; at: string } | null
  /** What its last turn left: the pages it changed, the commit they went into, and what the check still found. */ wrote: { files: string[]; commit: string | null; problems: string[]; at: string } | null
}

// ---- the folder -----------------------------------------------------------------------------------------------------------

async function placeOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const dir = workbenchDirOf(a.setup), site = siteIn(dir)
  const problem = !dir ? `${a.name} has no workbench folder (Settings › Workbench), so it has no docs to write`
    : !site.found ? `there is no folder at ${dir} on this computer`
    : !site.has ? `there is no docs site in ${dir}: a docs/ folder with VitePress in it` : null
  return { a, dir: problem ? null : dir, bin: site.bin, problem }
}

const pagesIn = (root: string): string[] => !existsSync(root) ? [] : readdirSync(root).sort().flatMap((f) => {
  const at = join(root, f)
  return statSync(at).isDirectory() ? pagesIn(at) : f.endsWith('.md') ? [at] : []
})

const noFences = (text: string) => text.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '').replace(/`[^`\n]*`/g, '')
const noFrontmatter = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n/, '')
/** The structure of a task's page in this folder: its own (`TASK_PAGE`) or the default, always ending where it points back. */
export function taskPage(dir: string | null): { headings: string[]; text: string } {
  const own = dir && existsSync(join(dir, TASK_PAGE)) ? noFrontmatter(readFileSync(join(dir, TASK_PAGE), 'utf8')) : ''
  const heads = (t: string) => [...noFences(t).matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1])
  let text = heads(own).length ? own.slice(own.search(/^## /m)).trim() + '\n' : DEFAULT_TASK_PAGE
  if (!heads(text).includes(CHANGED)) text += DEFAULT_TASK_PAGE.slice(DEFAULT_TASK_PAGE.indexOf(`## ${CHANGED}`)).replace(/^/, '\n')
  return { headings: heads(text), text }
}

// ---- the check: what its pages are held to --------------------------------------------------------------------------------

/** The file a link in a page leads to, or null when it leaves the site or stays on the page. */
export function linkedFile(docs: string, page: string, href: string): string | null {
  const to = href.split('#')[0].split('?')[0]
  if (!to || /^[a-z][a-z0-9+.-]*:/i.test(to) || to.startsWith('//')) return null
  const at = (to.startsWith('/') ? join(docs, to) : resolve(dirname(page), to)).replace(/\.html$/, '')
  if (/\.[a-z0-9]+$/i.test(at) && !at.endsWith('.md')) return existsSync(at) ? at : to.startsWith('/') ? join(docs, 'public', to) : at // a picture or a file: beside the page, or in public/
  const bare = at.replace(/\.md$/, '').replace(/[\\/]$/, '')
  return [`${bare}.md`, join(bare, 'index.md')].find((f) => existsSync(f)) ?? `${bare}.md`
}

/** What is wrong with the pages of the two sections, in words the agent can act on. Empty: nothing. Reads files only. */
export function checkPages(dir: string): string[] {
  const docs = join(dir, 'docs'), problems: string[] = []
  const name = (f: string) => relative(dir, f)
  for (const s of SECTIONS) {
    const root = join(docs, s.dir)
    if (!existsSync(join(root, 'index.md'))) { problems.push(`docs/${s.dir}/index.md is missing: the section "${s.title}" starts there, with a line for each of its pages`); continue }
    const links = new Map<string, string[]>() // an index, and the pages it links
    const linkedFrom = (index: string, f: string) => {
      if (!links.has(index)) links.set(index, [...noFences(readFileSync(index, 'utf8')).matchAll(/\]\(([^)\s]+)/g)].map((m) => linkedFile(docs, index, m[1]) ?? ''))
      return links.get(index)!.includes(f)
    }
    const structure = s.key === 'work' ? taskPage(dir).headings : []
    for (const f of pagesIn(root)) {
      const text = readFileSync(f, 'utf8'), body = noFences(noFrontmatter(text))
      // What VitePress would refuse, said before its build does and in plainer words.
      for (const line of (text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '').split('\n')) {
        const m = line.match(/^([A-Za-z_][\w-]*):\s+(.+?)\s*$/)
        if (m && !/^["'[{|>]/.test(m[2]) && /:\s|\s#/.test(m[2])) problems.push(`${name(f)}: in the frontmatter, the value of "${m[1]}" has a colon or a # in it and no quotes, which is not YAML and stops the whole site building. Put the value in double quotes`)
      }
      if (/\{\{/.test(body)) problems.push(`${name(f)} has "{{" outside a code span or a fenced block: VitePress runs what is between double curly braces as code when the page is drawn. Put it in a code span`)
      if ((body.match(/^# \S/gm) ?? []).length > 1) problems.push(`${name(f)} has more than one "# " title: a page has one, and its sections are "## "`)
      if (!/^# \S/m.test(body)) problems.push(`${name(f)} has no title: its first line of text is "# " and what the page is about`)
      for (const m of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const to = linkedFile(docs, f, m[1])
        if (to && !existsSync(to)) problems.push(`${name(f)} links to ${m[1]}, and there is no such page`)
      }
      if (f === join(root, 'index.md')) continue
      // A page has its line in its folder's index; a folder's index (a project's page) has its line in the index above.
      const folder = basename(f) === 'index.md', index = join(folder ? dirname(dirname(f)) : dirname(f), 'index.md')
      if (!existsSync(index)) problems.push(`${name(dirname(f))}/ has no index.md: a folder of pages starts with a page of its own${s.key === 'work' ? ' (the project\'s page, with a line for each of its tasks)' : ''}`)
      else if (!linkedFrom(index, f)) problems.push(`${name(f)} is not linked from ${name(index)}: every page has its line in the index of its folder`)
      if (s.key !== 'work') continue
      const heads = [...body.matchAll(/^## +(.+?)\s*$/gm)].map((m) => m[1])
      if (folder) { // a project's page
        for (const h of PROJECT_HEADINGS) if (!heads.includes(h)) problems.push(`${name(f)} has no "## ${h}" section: a project's page says what the project is for, then lists its tasks' pages under that heading`)
        continue
      }
      const missing = structure.filter((h) => !heads.includes(h))
      if (missing.length) problems.push(`${name(f)} has no ${missing.map((h) => `"## ${h}"`).join(', ')}: a task's page has these sections, in this order: ${structure.join(', ')}. Where one has nothing to say, it says so`)
      const changed = body.split(new RegExp(`^## +${CHANGED}\\s*$`, 'm'))[1]?.split(/^## /m)[0]
      if (changed === undefined) continue
      const points = [...changed.matchAll(/\]\(([^)\s]+)/g)].some((m) => (linkedFile(docs, f, m[1]) ?? '').startsWith(join(docs, 'system') + sep))
      if (!points && !changed.includes(NOTHING_CHANGED)) problems.push(`${name(f)}, under "${CHANGED}", links to no page of How the system works: link each part that is as it is because of this task, or write "${NOTHING_CHANGED}" and why`)
    }
  }
  return problems
}

/** The site's own build, into a folder that is thrown away: a page that cannot be drawn, or a link to nowhere, fails it. */
export async function buildCheck(dir: string, bin: string | null): Promise<string[]> {
  if (!bin) return []
  const out = mkdtempSync(join(tmpdir(), 'docs-build-'))
  try {
    const r = await new Promise<{ code: number; text: string }>((done) => {
      const p = spawn(bin, ['build', 'docs', '--outDir', out], { cwd: dir, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } })
      let text = ''
      const timer = setTimeout(() => { p.kill('SIGTERM'); text += '\nthe build took more than five minutes and was stopped' }, 300_000)
      p.stdout.on('data', (d) => { text += d }); p.stderr.on('data', (d) => { text += d })
      p.on('error', (e) => { clearTimeout(timer); done({ code: 1, text: String(e) }) })
      p.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, text }) })
    })
    if (r.code === 0) return []
    const lines = r.text.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trimEnd()).filter(Boolean)
    return [`the site does not build (vitepress build docs). Its last lines:\n${lines.slice(-12).join('\n')}`]
  } finally { rmSync(out, { recursive: true, force: true }) }
}

// ---- the wall: what it may touch ------------------------------------------------------------------------------------------

/** Where it writes: the two sections, and public/ for a picture a page shows. */
const WRITES = [...SECTIONS.map((s) => join('docs', s.dir)), join('docs', 'public')]
/** Whether a call of the docs agent's runs. Pure. It is never put to a person: nobody is watching it. */
export function wall(cwd: string, tool: string, input: Record<string, unknown>, risk: Risk): { allow: true } | { allow: false; why: string } {
  if (EDIT_TOOLS.has(tool)) {
    const file = String(input.file_path ?? input.notebook_path ?? '')
    const at = file ? resolve(cwd, file) : ''
    return at && WRITES.some((w) => at.startsWith(join(resolve(cwd), w) + sep)) ? { allow: true }
      : { allow: false, why: `You write pages under ${WRITES.map((w) => `${w}/`).join(', ')} of this folder and nothing else: not the site's configuration, not the app's code, not this folder's other files. If a page cannot be right without a change elsewhere, say what and why at the end of your turn.` }
  }
  if (risk === 'free' || risk === 'cheap') return { allow: true }
  return { allow: false, why: 'You read, and you write pages with the editing tools: a command or an action that leaves a mark is not yours to run, and nobody is here to allow it. The engine builds the site and commits your pages when your turn ends.' }
}

// ---- its conversation -----------------------------------------------------------------------------------------------------

async function docsSession(appId: string) {
  return (await db.select().from(session).where(and(eq(session.appId, appId), eq(session.kind, 'talk'), eq(session.status, 'open'))))
    .filter((s) => (s.subjectRef as { docsOf?: string } | null)?.docsOf === appId).sort((x, y) => +y.createdAt - +x.createdAt)[0] ?? null
}

/** The app's docs agent, started if it has none: in the workbench folder, where the docs are. */
export async function ensureDocsAgent(appId: string) {
  const there = await docsSession(appId)
  if (there) return there
  const { a, dir, problem } = await placeOf(appId)
  if (!dir) throw new PlanError(problem!)
  const [row] = await db.insert(session).values({
    id: newId('session'), appId: a.id, kind: 'talk', cwd: dir, branch: null, worktreePath: null,
    subject: `Docs for ${a.name}`, subjectRef: { docsOf: appId }, createdBy: 'engine', lastActiveAt: new Date(), autoApprove: 'moderate',
  }).returning()
  return row
}

/** Saying something to its conversation; a test gives its own, so no agent is started. */
export type Say = (sessionId: string, text: string, payload: Record<string, unknown>) => Promise<unknown>
const speak: Say = async (sessionId, text, payload) => (await import('./talk.js')).say(sessionId, text, undefined, { author: 'engine', kind: 'brief', payload })

const tries = new Map<string, number>() // the check's goes at a turn, by conversation; a new ask starts over

/**
 * Ask the docs agent for something: an agent (from: its conversation, where the answer goes back when the docs
 * agent's turn ends), the person, or the engine at one of its two moments. Returns at once.
 */
export async function askDocsAgent(appId: string, text: string, o: { why?: Why; label?: string; from?: string | null; actor?: string; issueId?: string | null; say?: Say } = {}) {
  const said = text.trim()
  if (!said) throw new PlanError('say what the docs should say, or what to check')
  const s = await ensureDocsAgent(appId)
  if (o.from === s.id) throw new PlanError('you are the docs agent: write the pages')
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const why = o.why ?? 'asked', label = o.label ?? (o.from ? 'From an agent' : 'From you')
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, issueId: o.issueId ?? null, sessionId: s.id, actor: o.actor ?? (o.from ? 'agent' : 'user'), type: 'docs_agent.asked', payload: { why, label, from: o.from ?? null } }))
  tries.delete(s.id)
  await (o.say ?? speak)(s.id, said.slice(0, ASK_MAX), { ...(o.from ? { from: o.from } : {}), label })
  return { sessionId: s.id, next: 'It writes the pages and the engine checks and commits them. What it says comes back to you as a message when its turn ends; do not wait or poll.' }
}

/** Where the docs agent stands. */
export async function docsAgent(appId: string, busy: (sessionId: string) => boolean = () => false): Promise<DocsAgentView> {
  const { dir, problem } = await placeOf(appId)
  const s = await docsSession(appId)
  const rows = await db.select({ type: event.type, payload: event.payload, ts: event.ts }).from(event)
    .where(and(eq(event.appId, appId), inArray(event.type, ['docs_agent.asked', 'docs_agent.wrote']))).orderBy(desc(event.seq)).limit(40)
  const asked = rows.find((r) => r.type === 'docs_agent.asked'), wrote = rows.find((r) => r.type === 'docs_agent.wrote')
  const ap = asked?.payload as { why?: Why; label?: string } | undefined, wp = wrote?.payload as { files?: string[]; commit?: string | null; problems?: string[] } | undefined
  const count = (d: string) => dir ? pagesIn(join(dir, 'docs', d)).filter((f) => !f.endsWith(`${sep}index.md`)).length : 0
  return {
    ready: !problem, problem, sessionId: s?.id ?? null, busy: !!s && busy(s.id), pages: { system: count('system'), work: count('work') },
    asked: asked ? { why: ap?.why ?? 'asked', label: ap?.label ?? '', at: new Date(asked.ts).toISOString() } : null,
    wrote: wrote ? { files: wp?.files ?? [], commit: wp?.commit ?? null, problems: wp?.problems ?? [], at: new Date(wrote.ts).toISOString() } : null,
  }
}

// ---- the two moments it is asked by itself -----------------------------------------------------------------------------------

/** Learn's agent finished a turn: if it wrote since the docs agent was last told, How the system works is brought in line. */
export async function afterLearning(sessionId: string, deps: { say?: Say } = {}): Promise<{ sessionId: string } | null> {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s?.appId || !(s.subjectRef as { learn?: string } | null)?.learn) return null
  if ((await placeOf(s.appId)).problem) return null
  const rows = await db.select({ type: event.type, payload: event.payload, seq: event.seq }).from(event)
    .where(and(eq(event.appId, s.appId), inArray(event.type, ['learn.written', 'docs_agent.asked']))).orderBy(desc(event.seq)).limit(60)
  const told = rows.find((r) => r.type === 'docs_agent.asked' && (r.payload as { why?: string }).why === 'learned')
  const written = rows.filter((r) => r.type === 'learn.written' && (!told || r.seq > told.seq)).map((r) => String((r.payload as { title?: string }).title ?? ''))
  if (!written.length) return null
  const titles = [...new Set(written)].filter(Boolean)
  return askDocsAgent(s.appId, [
    `The codebase was learned again: Learn's agent wrote ${titles.length ? titles.map((t) => `"${t}"`).join(', ') : 'its documents'}. Read all of what it wrote (the learning tool: each document's body is the part for agents).`,
    '',
    'Bring "How the system works" (docs/system/) in line with it. Learn\'s documents are your lead, not your text: for each thing you put on a page, read the code it is about first, and write the page for a person who wants to understand the system, with a diagram where a flow or a set of parts is easier seen than read. Add pages for what the section does not cover yet, correct what is no longer true, and leave alone what is still right. Keep docs/system/index.md listing every page.',
    '',
    'Change nothing under docs/work/ for this.',
  ].join('\n'), { why: 'learned', label: 'The codebase was learned', actor: 'engine', say: deps.say })
}

const cut = (text: string | null | undefined, max: number) => { const t = (text ?? '').trim(); return t.length > max ? `${t.slice(0, max)} …` : t }
/** A folder's name for a project: its name in small letters and hyphens. */
export const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '') || 'project'

/** What the engine holds about a closed task that its page is written from: its decisions and its questions, as they were recorded. */
async function recordOf(t: typeof issue.$inferSelect): Promise<string[]> {
  const ids = [t.id, ...(await db.select({ id: issue.id }).from(issue).where(eq(issue.parentId, t.id))).map((r) => r.id)]
  const decisions = await db.select().from(decision).where(inArray(decision.issueId, ids))
  const questions = await db.select().from(question).where(inArray(question.issueId, ids))
  const out: string[] = []
  if (t.description) out.push('What it was for, as the task says:', cut(t.description, 1500), '')
  out.push(decisions.length ? 'Its decisions, as recorded:' : 'No decision was recorded on it.')
  for (const d of decisions.slice(0, 20)) {
    const options = (Array.isArray(d.options) ? d.options : []) as { key?: string; text?: string; tradeoff?: string }[]
    const took = options.find((o) => o.key === d.chosen)
    out.push(`- ${cut(d.question, 300)}`,
      `  Chosen: ${took ? `${cut(took.text, 300)}${took.tradeoff ? ` (${cut(took.tradeoff, 200)})` : ''}` : d.chosen ? d.chosen : 'nothing yet'}${d.provisional ? ' (provisional: taken so the work could go on, not confirmed by a person)' : ''}`,
      ...options.filter((o) => o !== took).map((o) => `  Turned down: ${cut(o.text, 200)}${o.tradeoff ? ` (${cut(o.tradeoff, 160)})` : ''}`),
      ...(d.rationale ? [`  Why: ${cut(d.rationale, 400)}`] : []))
  }
  out.push('', questions.length ? 'The questions asked on it:' : 'No question was asked on it.')
  for (const q of questions.slice(0, 20)) out.push(`- ${cut(q.text, 300)}`, `  ${q.status === 'answered' ? `Answered: ${cut(q.answer, 400)}` : q.status === 'open' ? 'Still open.' : `Not answered (${q.status}).`}${q.reason ? ` Why: ${cut(q.reason, 300)}` : ''}`)
  return out
}

/** A task was closed: its page in Our work is written (and its project's), and How the system works is put right where the work changed it. */
export async function afterClose(issueId: string, deps: { say?: Say } = {}): Promise<{ sessionId: string } | null> {
  const [t] = await db.select().from(issue).where(eq(issue.id, issueId))
  if (!t || (await placeOf(t.appId)).problem) return null
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [p] = t.projectId ? await db.select().from(project).where(eq(project.id, t.projectId)) : []
  const prs = t.projectId ? await db.select().from(pr).where(eq(pr.projectId, t.projectId)) : []
  const pull = prs.find((x) => x.issueId === t.id) ?? prs.find((x) => !x.issueId) ?? null
  const ident = identifier(a.key, t.number)
  const of = p && !p.solo ? p : null, folder = of ? `docs/work/${slugOf(of.name)}` : 'docs/work' // a task on its own has no project's page
  return askDocsAgent(t.appId, [
    `${ident} "${t.title}" is closed: it was built, merged${pull?.number ? ` (pull request #${pull.number}${pull.url ? `, ${pull.url}` : ''})` : ''} and checked. Its id is ${t.id}.${of ? ` It is a task of the project "${of.name}".` : ''}`,
    '',
    ...(await recordOf(t)),
    '',
    `1. Read the rest of what was built and why: the task (the task tool: its brief and its acceptance), its steps (steps, get_step: the draft ADR and the prototype analysis when it has them) and the change itself${pull?.number ? ` (gh pr view ${pull.number} and gh pr diff ${pull.number} in the app's repository, or git log there)` : ' (git log in the app\'s repository)'}.`,
    `2. Put "How the system works" right where this task changed it: read each page of docs/system/ the change touches, and make it say what is true now. Add a page when the task made something the section has no page for.`,
    `3. Write the task's page: ${folder}/${ident}-<a few words>.md, with the sections a task's page has. The decisions and questions above are its record: put every one of them on the page. Under "${CHANGED}", and wherever else the page speaks of a part of the system, link the page (and heading, where one fits) of How the system works that describes it.`,
    of ? `4. The project's page is ${folder}/index.md. If it is not there, write it: frontmatter (project: the project's name), "# " and its name, what the project is for${of.content || of.description ? ` (as the project says: ${cut(of.content ?? of.description, 1200)})` : ''}, then "## Tasks". Under "## Tasks" add this task's line at the top, linked, saying in a few words what it did. Give the project its line in docs/work/index.md if it has none.`
      : `4. Give the task's page its line at the top of docs/work/index.md.`,
  ].join('\n'), { why: 'work', label: `${ident} was closed`, actor: 'engine', issueId: t.id, say: deps.say })
}

// ---- when its turn ends: the check, the commit, the hook -------------------------------------------------------------------

async function commitPages(dir: string, label: string): Promise<{ files: string[]; commit: string | null }> {
  const top = await git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true })
  if (top.code !== 0) return { files: [], commit: null }
  const status = (await git(dir, ['status', '--porcelain', '--untracked-files=all', '--', ...WRITES], { allowFail: true })).stdout
  const files = status.split('\n').map((l) => l.trim().replace(/^\S+\s+/, '')).filter(Boolean).sort() // the helper trims, so the two status letters are not at a fixed place
  if (!files.length) return { files, commit: null }
  await git(dir, ['add', '-A', '--', ...WRITES.filter((w) => existsSync(join(dir, w)))])
  const done = await git(dir, ['commit', '-m', `Docs: ${label}`, '--', ...WRITES.filter((w) => existsSync(join(dir, w)))], { allowFail: true })
  return { files, commit: done.code === 0 ? (await git(dir, ['rev-parse', '--short', 'HEAD'])).stdout.trim() : null }
}

/**
 * The docs agent finished a turn. What the check finds is said back to it (twice at most, then it is left as it is
 * and the problems are kept for the person); pages that pass are committed and the folder's hook is run.
 */
export async function afterDocsTurn(sessionId: string, deps: { build?: typeof buildCheck; say?: Say } = {}): Promise<{ problems: string[]; retried: boolean; commit: string | null } | null> {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  const appId = (s?.subjectRef as { docsOf?: string } | null)?.docsOf
  if (!s || !appId) return null
  const { a, dir, bin, problem } = await placeOf(appId)
  if (!dir) { console.error(`[engine] docs agent: ${problem}`); return null }
  const found = checkPages(dir)
  const problems = found.length ? found : await (deps.build ?? buildCheck)(dir, bin)
  const n = tries.get(sessionId) ?? 0
  if (problems.length && n < RETRIES) {
    tries.set(sessionId, n + 1)
    await (deps.say ?? speak)(sessionId, `Your pages were checked, and this has to be put right before they are kept:\n\n${problems.slice(0, 20).map((p) => `- ${p}`).join('\n')}\n\nFix it and end your turn; they are checked again.`, { label: 'The check on your pages' })
    return { problems, retried: true, commit: null }
  }
  tries.delete(sessionId)
  const [last] = await db.select({ payload: event.payload }).from(event).where(and(eq(event.appId, appId), eq(event.type, 'docs_agent.asked'))).orderBy(desc(event.seq)).limit(1)
  const label = String((last?.payload as { label?: string } | undefined)?.label ?? 'pages written')
  const { files, commit } = problems.length ? { files: [], commit: null } : await commitPages(dir, label) // pages that fail the check are left in the folder, uncommitted, for a person to see
  if (!files.length && !problems.length) return { problems, retried: false, commit }
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId, sessionId, actor: 'engine', type: 'docs_agent.wrote', payload: { files, commit, problems: problems.map((p) => p.slice(0, 600)) } }))
  if (!problems.length) void import('./hooks.js').then((h) => h.afterwards(appId, 'docs-written', { FILES: files.join('\n'), COMMIT: commit ?? '' }))
  return { problems, retried: false, commit }
}

// ---- what it is told ------------------------------------------------------------------------------------------------------

/** The docs agent's own instructions. */
export function docsPrompt(a: { name: string; key: string }, dir: string, repos: { name: string; path: string }[]): string {
  return `You are the docs agent of ${a.name}. You are in its workbench folder, ${dir}, and its docs are the site under docs/ there. You alone write them: the person and every other agent ask you, and you are also asked by the engine at two moments, when the codebase has been learned and when a task is closed. Keeping docs true is your whole job, and it is hard to do well: a page that is wrong is worse than no page, because it is believed.

The code is not in this folder. ${repos.length ? `Read it at ${repos.map((r) => `${r.path} (${r.name})`).join(', ')}` : 'Ask the engine where the app\'s repositories are (the now tool)'}; you change nothing there. A command that only reads is yours to run (git log, git diff, gh pr view, gh pr diff); nothing that leaves a mark is.

The docs have two sections, and every page you write is in one of them.

How the system works, docs/system/. What is true of the system now: what it is for, its parts and how they talk, the flows that matter end to end, where the data lives, how it is run and tested, what is fragile. Present tense, no history, no plans. One page per subject, named for the subject (sign-in.md, not KEY-12.md), each starting with "# " and its subject, then a short paragraph a person can stop after. Write only what you have read in the code in this turn or what Learn's documents say and you then checked; where you could not check something, say so on the page in those words. When the code and a page disagree, the code is right and the page changes.

Our work, docs/work/. A record of what we built and why, for people who were not there: what each task looked like, said simply, with its decisions and its questions. A task has one page, written once when the task is closed and afterwards changed only to correct a mistake. A task of a project is in the project's folder (docs/work/census-import/${a.key}-12-read-the-file.md); a task on its own is in docs/work/ itself. Name the page for the task and a few words. It starts with frontmatter (task: the task's name; date: the day it was closed, as YYYY-MM-DD; a value with a colon in it goes in double quotes, or the site does not build), then "# " and what was built, then exactly these sections, in this order. Under each is what goes there:

${taskPage(dir).text.trim()}

A section with nothing to say says so in a line; it is not left out. Decisions and questions are the part nobody can read back out of the code: take them from the task's record as the engine gives it, every one, and do not make any up. Under "${CHANGED}" link each page of How the system works (to its heading, where one fits: /system/sign-in#sessions) that is as it is because of this task, each with a line saying what changed there; when the task changed nothing a reader of that section would see, write "${NOTHING_CHANGED}" and why. Anywhere else on the page that names a part of the system, link its page too: the reader goes from what we did to how it works now. In the same turn, make those pages of How the system works true: the task's page points at them, so they must already say what the task left.

A project has a page too: the index.md of its folder (docs/work/census-import/index.md). Frontmatter (project: its name), "# " and its name, what the project is for in a short paragraph, then "## Tasks": a linked line for each of its tasks' pages, newest first, saying in a few words what the task did. It is written with the project's first closed task and added to with each one after.

Each index.md lists every page of its folder, a linked line each saying what the page is for. docs/work/index.md lists the projects and the tasks that are on their own, newest first. Write the index pages if they are not there. Link between pages from the site's root (/system/parts, /work/census-import/${a.key}-12-read-the-file), without .md.

Write for a person who is building up their own understanding of this system and will ask you about what they read. Plain words, short paragraphs, the surprising thing first. Where a flow, a sequence between parts or a set of parts is easier seen than read, draw it: a fenced block marked mermaid (flowchart or sequenceDiagram), with a sentence before it saying what it shows. Outside a code span or a fenced block never write a word in angle brackets (a placeholder like <port>): the site reads it as HTML and the page breaks; keep a code span on one line.

The site is VitePress, and you are expected to know it well: a page is compiled as a Vue template and its frontmatter is YAML, so a page that reads fine as Markdown can stop the whole site building. The ones that bite: a frontmatter value with a colon or a # in it must be in double quotes; a word in angle brackets or double curly braces outside a code span is read as HTML or run as code; a link to a page or a heading that is not there fails the build; every ":::" container that opens is closed. Use its containers (::: info, tip, warning, danger, details) for a call-out a reader must not miss. If a vitepress skill is in this folder, read it before your first page; where you are unsure what VitePress does with something, look it up (vitepress.dev) and do not guess.

This folder may hold skills of its own for these docs (.claude/skills/). Use them: where one differs from what is said here, the skill is this app's standard and wins.

You write files only under docs/system/, docs/work/ and docs/public/ (a picture a page shows); the engine refuses anything else, the site's configuration included. Do not commit. When your turn ends the engine checks your pages (every page titled and linked from its section's index, every link leading to a page, each task's page of Our work with its sections and pointing into How the system works, each project's page listing its tasks), then builds the site; what fails is said back to you. Pages that pass are committed for you.

When you are asked to write down something a person said, keep it theirs: put it where it belongs in the two sections, in their words where you can, and check it against the code; where the code says otherwise, write what the code does and tell them the difference at the end of your turn.

End each turn with at most three lines: the pages you wrote or changed, anything on them you could not check, and anything you were asked for that you did not do and why. That is what goes back to whoever asked.`
}
