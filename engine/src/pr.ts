/**
 * One PR per project: the integration branch against the app's default branch, opened at the first landing and
 * updated as more issues land. The PR carries the support for the change: each sub-issue, its summary, its cost.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { commitParts } from './conventions.js'
import { promisify } from 'node:util'
import { push } from './git.js'
import { withEvidence } from './evidence.js'

const execFileP = promisify(execFile)

export interface PrInput {
  repoPath: string
  fullName: string
  integrationBranch: string
  base: string
  title: string
  body: string
  /** Opened as a draft (the default): it opens at the first landing, long before it is ready to review. */
  draft?: boolean
}

/**
 * How an app's pull requests are opened (Sandy, 2026-11-16: one opened ready for review after the first of nine
 * sub-tasks, titled outside the repository's convention). `setup.pr_draft`: as a draft unless set false.
 * {title} is the task's name for the team when it has one (issue.team_title), else our title; {subject}, like any
 * name the commit format leaves to the builder, is read from the branch's first commit.
 * `setup.pr_title`: the title's template, in the repository's own convention, with {ticket} (the team's ticket id,
 * else ours), {id} (ours), {title}, {project}, {n} and {of} (the task's place in its project). Any other name in
 * braces ({type}, {scope}) is the builder's choice, as in the commit format (conventions.ts): it is read back from the
 * branch's first commit that follows that format, so `{type}{scope}[{ticket}]: {title}` opens as
 * `feat(scan)[ENT-481]: …` without an agent writing the title by hand. One that cannot be read is left out.
 */
/**
 * Whether a task's pull request is opened by the engine, as a draft, once the task is built and checked (Sandy,
 * 2026-11-17: "have the option added … and have it the default, to do draft PRs automatically so that we can do
 * proper smoke tests"). The day before, a pull request opened after the first of nine sub-tasks, so opening one
 * became a press. This is neither: not before the build is whole and checked, and only ever a draft. Marking it
 * ready for review stays the person's. Off (setup.pr_auto false): the press, as it was.
 */
export const prAuto = (setup: unknown) => (setup as { pr_auto?: boolean } | null)?.pr_auto !== false
export const prDraft = (setup: unknown) => (setup as { pr_draft?: boolean } | null)?.pr_draft !== false
export function prTitle(setup: unknown, v: { ticket?: string | null; id: string; title: string; project: string; n?: number; of?: number }, exact?: string | null, /** The branch's commits' first lines, oldest first. */ commits: string[] = []): string | null {
  if (exact?.trim()) return exact.trim().slice(0, 250)
  const t = (setup as { pr_title?: string } | null)?.pr_title?.trim()
  if (!t) return null
  const vars: Record<string, string> = { ticket: v.ticket || v.id, id: v.id, title: v.title, project: v.project, n: String(v.n ?? ''), of: String(v.of ?? '') }
  let chosen: Record<string, string> = {}
  if (/\{(?!(?:ticket|id|title|project|n|of)\})\w+\}/.test(t)) for (const c of commits) { const parts = commitParts(setup, { ticket: v.ticket, id: v.id }, c); if (parts) { chosen = parts; break } }
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? chosen[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, 250)
}

/**
 * The pull request for a branch: updated if it is open, opened (as a draft, unless told otherwise) if there is none.
 * One a person closed is reopened (and made a draft again) only when `reopen` is set: that is the person submitting
 * it again; otherwise it is left closed and said (`closed`), and no second one is opened.
 */
export async function ensureProjectPr(i: PrInput & { reopen?: boolean }): Promise<{ number: number; url: string; created: boolean; closed?: boolean }> {
  const gh = (args: string[]) => execFileP('gh', args, { cwd: i.repoPath }).then((r) => r.stdout.trim())
  const all: { number: number; url: string; state: string }[] = JSON.parse(await gh(['pr', 'list', '-R', i.fullName, '--head', i.integrationBranch, '--state', 'all', '--json', 'number,url,state']))
  const edit = (n: number) => gh(['pr', 'edit', String(n), '-R', i.fullName, '--title', i.title, '--body', i.body, '--base', i.base]) // a stacked PR retargets when the one below merges
  const open = all.find((x) => x.state === 'OPEN')
  const last = all.sort((x, y) => y.number - x.number)[0]
  if (!open && last?.state === 'CLOSED' && !i.reopen) return { number: last.number, url: last.url, created: false, closed: true } // closed by a person, not merged: nothing is pushed
  await push(i.repoPath, i.integrationBranch, { setUpstream: true })
  if (open) { await edit(open.number); return { number: open.number, url: open.url, created: false } }
  if (last?.state === 'CLOSED') {
    await gh(['pr', 'reopen', String(last.number), '-R', i.fullName])
    if (i.draft !== false) await gh(['pr', 'ready', String(last.number), '-R', i.fullName, '--undo']).catch(() => {}) // back to a draft, where the repository allows drafts
    await edit(last.number)
    return { number: last.number, url: last.url, created: false }
  }
  const url = await gh(['pr', 'create', '-R', i.fullName, '--base', i.base, '--head', i.integrationBranch, '--title', i.title, '--body', i.body, ...(i.draft === false ? [] : ['--draft'])])
  const number = Number(url.split('/').pop())
  return { number, url, created: true }
}

/**
 * A description with the engine's Review section in it: in place of a section the writer gave that name (or "Run it
 * yourself", the heading it had before), else at its end. What the writer said there is replaced: the commands and
 * the branch are facts the engine holds, and must not be a guess.
 */
export function withReview(written: string, section: string): string {
  const lines = written.split('\n')
  const at = lines.findIndex((l) => /^##\s+(review|run it yourself)\s*$/i.test(l))
  if (at < 0) return [written.trim(), section].filter(Boolean).join('\n\n')
  let end = lines.length
  let fenced = false
  for (let i = at + 1; i < lines.length; i++) { if (/^\s*```/.test(lines[i])) fenced = !fenced; if (!fenced && /^##\s/.test(lines[i])) { end = i; break } }
  return [lines.slice(0, at).join('\n').trim(), section, lines.slice(end).join('\n').trim()].filter(Boolean).join('\n\n')
}

/**
 * A description with the engine's deploy steps in it (smoke.ts, deploySteps): under the heading the writer gave for
 * what a deploy needs ("Merge Danger", "Deploy steps", "At deploy", "Release checks"), before what they wrote there;
 * else in a section of its own at the end. The engine's block is between its own marks, so an update replaces it and
 * leaves the writer's words. With no steps, a block left from before is taken out.
 */
const DEPLOY_HEADING = /^##+\s+(merge danger|deploy(ment)?( steps| notes| checklist)?|at deploy|release( checks| steps| notes)?|before (you )?(merge|deploy)(ing)?)\s*:?\s*$/i
export function withDeploy(written: string, steps: string): string {
  const clean = written.replace(/\n*<!-- evident:deploy -->[\s\S]*?<!-- \/evident:deploy -->\n*/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!steps) return clean.replace(/\n*## At deploy\s*$/i, '').trim()
  const lines = clean.split('\n')
  let fenced = false, at = -1
  for (let i = 0; i < lines.length; i++) { if (/^\s*```/.test(lines[i])) fenced = !fenced; if (!fenced && DEPLOY_HEADING.test(lines[i])) { at = i; break } }
  if (at < 0) return [clean, '## At deploy', steps].filter(Boolean).join('\n\n')
  return [lines.slice(0, at + 1).join('\n').trim(), steps, lines.slice(at + 1).join('\n').trim()].filter(Boolean).join('\n\n')
}

// ---- what was edited on GitHub -----------------------------------------------------------------------------------------------

const norm = (s: string) => s.replace(/\r\n/g, '\n').trim()
/** A text's mark, for telling whether it is the one last sent. */
export const markOf = (s: string) => createHash('sha1').update(norm(s)).digest('hex').slice(0, 16)
/** What the engine sent last, as marks: the whole body, and the description written here that it was made from. */
export interface Sent { body: string; written: string }
/**
 * Whether a pull request's description was edited on GitHub since the engine last sent it (Sandy, 2026-11-23: "Edits
 * made on GitHub directly are read back before an update, never overwritten silently"). `theirs`: only there, so it is
 * read back. `both`: there and here, which only a person can settle. Nothing recorded of the last send: it cannot be
 * told, and is taken as not edited. Pure.
 */
export function editsThere(last: Sent | null, thereBody: string, writtenNow: string): 'none' | 'theirs' | 'both' {
  if (!last || markOf(thereBody) === last.body) return 'none'
  return markOf(writtenNow) === last.written ? 'theirs' : 'both'
}
/**
 * The description a person wrote, read back from a pull request's body as GitHub has it: what is above the fine
 * print, without the line that says it is still being built and without the engine's own blocks (the evidence, the
 * deploy steps, the Review section), which are put back when it is sent.
 */
export function writtenFrom(body: string): string {
  let lead = norm(body).split(/\n## Fine print\s*\n/)[0].replace(/\n*🤖 Generated with \[Claude Code\][^\n]*$/, '')
  lead = lead.replace(/^\*\*\d+ of \d+ sub-tasks? ha(s|ve) landed:[^\n]*\*\*\n*/, '')
  // A block put straight under the writer's heading leaves their words where they were, straight under it.
  lead = lead.replace(/(^|\n)(#{1,6} [^\n]*\n)\n*<!-- evident:(\w+) -->[\s\S]*?<!-- \/evident:\3 -->\n*/g, '$1$2')
  lead = lead.replace(/\n*<!-- evident:(\w+) -->[\s\S]*?<!-- \/evident:\1 -->\n*/g, '\n\n')
  const lines = lead.split('\n'), out: string[] = []
  let fenced = false, skipping = false
  for (const l of lines) {
    if (/^\s*```/.test(l)) fenced = !fenced
    if (!fenced && /^##\s/.test(l)) skipping = /^##\s+(review|run it yourself)\s*$/i.test(l)
    if (!skipping) out.push(l)
  }
  // A heading the engine added for a block of its own, left with nothing under it.
  return out.join('\n').replace(/\n## (Evidence|At deploy)\s*(?=\n## |\s*$)/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export interface Landed { identifier: string; title: string; summary?: string | null; costUsd?: number | null; sha?: string | null }

/**
 * A pull request's description. What the team reads comes first and is all that shows: the description written for
 * them when the task has one (issue.pr_body: prose in their repository's own style), else the merge guide. Everything
 * of ours is folded away at the very bottom: which project and task of ours it is, the merge guide when a written
 * description leads, every criterion and decision, and what each sub-task's builder reported (a client's pull
 * request, 2026-11-20: the description was 511 lines of our build log, opening with our project's id).
 */
export function prBody(project: { name: string; content?: string | null; id: string }, landed: Landed[], pending: { identifier: string; title: string }[], backlog: { title: string; state: string; reason: string | null }[] = [], /** The merge guide, for whoever approves it (merge-guide.ts): short. */ guide = '', /** Everything the guide left out: folded away, with what landed. */ record = '', /** The description written for the team, when the task has one: it leads, and the guide joins the fold. */ written: string | null = null, /** The Review section, when the task has a review copy (review-copy.ts): the engine's own, in the description proper. */ review: string | null = null, /** What is owed at deploy, in order (smoke.ts, deploySteps): the engine's own, under the description's own heading for it. */ deploy = '', /** The Evidence section, as the person last sent it (finalize.ts): never a draft they have not pressed for. */ evidence = ''): string {
  const said = written?.trim() || guide || project.content?.trim() || ''
  const proven = evidence || /<!-- evident:evidence -->/.test(said) ? withEvidence(said, evidence) : said
  const reviewed = review ? withReview(proven, review) : proven
  const lead = deploy || /<!-- evident:deploy -->/.test(reviewed) ? withDeploy(reviewed, deploy) : reviewed
  const all = landed.length + pending.length
  const building = pending.length ? `**${landed.length} of ${all} sub-task${all === 1 ? ' has' : 's have'} landed: this pull request is still being built, and is not ready to review until they all have.**` : ''
  const ours = [
    `Built by Evident from project \`${project.id}\`: ${project.name}. ${landed.length} of ${all} sub-task${all === 1 ? ' has' : 's have'} landed.`,
    written?.trim() && guide ? guide : '',
    record,
    landed.length ? `## What landed, sub-task by sub-task\n\n${landed.map((t) => [`### ${t.identifier} ${t.title}` + (t.sha ? ` (\`${t.sha.slice(0, 7)}\`)` : ''),
      (t.summary?.trim() || '_No summary from the run._').slice(0, 4000),
      t.costUsd != null ? `_Run cost estimate: $${Number(t.costUsd).toFixed(2)}_` : ''].filter(Boolean).join('\n\n')).join('\n\n')}` : '',
    pending.length ? `## Still to land\n${pending.map((t) => `- ${t.identifier} ${t.title}`).join('\n')}` : '',
    backlog.some((x) => x.state === 'backlog') ? `## Backlog still open\n${backlog.filter((x) => x.state === 'backlog').map((x) => `- ${x.title}`).join('\n')}` : '',
    backlog.some((x) => x.state === 'canceled') ? `## Left out on purpose\n${backlog.filter((x) => x.state === 'canceled').map((x) => `- ${x.title}: ${x.reason}`).join('\n')}` : '',
    'Each sub-task was built in its own worktree and merged here one at a time. The app\'s whole test run is once per task, when its sub-tasks are all in.',
  ].filter(Boolean).join('\n\n')
  return [
    building,
    lead,
    // Our own record closes the description under a heading of its own, so a reader knows the description proper has
    // ended (Sandy, 2026-11-23: "in a final section called like fine print").
    '## Fine print',
    `<details>\n<summary>How this was built (Evident's record${written?.trim() && guide ? ': the merge guide, ' : ': '}every criterion and decision, and what each sub-task's builder reported)</summary>\n\n${ours}\n\n</details>`,
    '🤖 Generated with [Claude Code](https://claude.com/claude-code) via Evident',
  ].filter(Boolean).join('\n\n')
}

/**
 * The app's own form for a pull request's description (Sandy, 2026-11-20: "a way for us to say what needs to go
 * where and how it should be … a template and then a prompt"). Two settings: `setup.pr_description`, the sections as
 * text, and `setup.pr_description_how`, how to write them. Either may be set alone. They come before the
 * repository's own template: the person said so for this app.
 */
export function prDescription(setup: unknown): { template: string | null; how: string | null } {
  const v = (setup ?? {}) as { pr_description?: string; pr_description_how?: string }
  return { template: v.pr_description?.trim() || null, how: v.pr_description_how?.trim() || null }
}
/** What the task's agent is told about it, or nothing when the app has no form of its own. */
export function prDescriptionNote(setup: unknown): string {
  const d = prDescription(setup)
  if (!d.template && !d.how) return ''
  return `\n\nThis app has its own form for a pull request's description, set by the person (Settings › Landing). It comes before the repository's template and its past pull requests. When you write a description (set_pr_message):`
    + (d.template ? `\n\nThe template: keep its headings and their order, fill each from what is true of the code on the branch, and leave none out (under one with nothing to say, say so in a few words).\n<template>\n${d.template}\n</template>` : '')
    + (d.how ? `\n\nHow to write it:\n<how>\n${d.how}\n</how>` : '')
    + '\n\nThe rest still holds: nothing of ours in it (our ids, probes, fix rounds, what an agent did), and rollback from the blast radius, never a default.'
}

/** Set how an app's work is named on GitHub: the pull request's title and whether it opens as a draft, and the branch and commit conventions (conventions.ts). Undefined leaves one; empty clears it. */
export async function setPrRules(appId: string, i: { titleTemplate?: string; draft?: boolean; branchTemplate?: string; commitFormat?: string; /** A task needs the team's own ticket before its branch is cut or its pull request opened (ticket.ts). */ ticketRequired?: boolean; /** The description's sections, as text, and how to write them (prDescription). */ descriptionTemplate?: string; descriptionHow?: string }) {
  const { db } = await import('./db/client.js'); const { app } = await import('./db/schema.js'); const { eq } = await import('drizzle-orm')
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new Error(`no app ${appId}`)
  const changes: Record<string, unknown> = {}
  if (i.draft !== undefined) changes.pr_draft = i.draft
  if (i.ticketRequired !== undefined) changes.ticket_required = i.ticketRequired
  for (const [given, key] of [[i.titleTemplate, 'pr_title'], [i.branchTemplate, 'branch_name'], [i.commitFormat, 'commit_format']] as const) if (given !== undefined) changes[key] = given.trim().slice(0, 250) || null
  if (i.descriptionTemplate !== undefined) changes.pr_description = i.descriptionTemplate.trim().slice(0, 6000) || null
  if (i.descriptionHow !== undefined) changes.pr_description_how = i.descriptionHow.trim().slice(0, 3000) || null
  const next = await (await import('./setup.js')).patchSetup(appId, changes)
  return { pr_title: (next.pr_title as string | undefined) ?? null, pr_draft: next.pr_draft !== false, branch_name: (next.branch_name as string | undefined) ?? null, commit_format: (next.commit_format as string | undefined) ?? null, ticket_required: next.ticket_required === true, pr_description: prDescription(next).template, pr_description_how: prDescription(next).how }
}
