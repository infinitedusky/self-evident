/**
 * One PR per project: the integration branch against the app's default branch, opened at the first landing and
 * updated as more issues land. The PR carries the support for the change: each sub-issue, its summary, its cost.
 */
import { execFile } from 'node:child_process'
import { commitParts } from './conventions.js'
import { promisify } from 'node:util'
import { push } from './git.js'

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

export interface Landed { identifier: string; title: string; summary?: string | null; costUsd?: number | null; sha?: string | null }

export function prBody(project: { name: string; content?: string | null; id: string }, landed: Landed[], pending: { identifier: string; title: string }[], backlog: { title: string; state: string; reason: string | null }[] = [], /** The merge guide, for whoever approves it (merge-guide.ts): first, and short. */ guide = '', /** Everything the guide left out: folded away under it, with what landed. */ record = ''): string {
  const lines = [
    `Built by Self Evident from project \`${project.id}\`: ${project.name}.`,
    landed.length + pending.length > 0 ? `\n**${landed.length} of ${landed.length + pending.length} sub-task${landed.length + pending.length === 1 ? ' has' : 's have'} landed${pending.length ? ': this pull request is still being built, and is not ready to review until they all have' : ''}.**` : '',
    project.content && !guide ? `\n${project.content}` : '', // the guide says what it does, per task
    guide ? `\n${guide}` : '',
    '',
    // With a guide, the rest is folded away: the guide is what to read, the record is for looking something up.
    guide ? `<details>\n<summary>The full record: every criterion and decision, and what each sub-task's builder reported</summary>\n\n${record ? `${record}\n\n` : ''}## What landed, sub-task by sub-task\n` : '## Landed',
    ...landed.map((t) => [`### ${t.identifier} ${t.title}` + (t.sha ? ` (\`${t.sha.slice(0, 7)}\`)` : ''),
      (t.summary?.trim() || '_No summary from the run._').slice(0, 4000),
      t.costUsd != null ? `_Run cost estimate: $${Number(t.costUsd).toFixed(2)}_` : ''].join('\n\n')),
    guide ? '\n</details>' : '',
    pending.length ? `\n## Still to land\n${pending.map((t) => `- ${t.identifier} ${t.title}`).join('\n')}` : '',
    backlog.some((b) => b.state === 'backlog') ? `\n## Backlog still open\n${backlog.filter((b) => b.state === 'backlog').map((b) => `- ${b.title}`).join('\n')}` : '',
    backlog.some((b) => b.state === 'canceled') ? `\n## Left out on purpose\n${backlog.filter((b) => b.state === 'canceled').map((b) => `- ${b.title}: ${b.reason}`).join('\n')}` : '',
    '',
    'Each sub-task was built in its own worktree and merged here one at a time. The app\'s whole test run is once per task, when its sub-tasks are all in.',
    '',
    'Rollback project: revert this PR. Off switch, guard metric and schema impact per task come in a later step.',
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code) via Self Evident',
  ]
  return lines.filter((l) => l !== null).join('\n')
}

/** Set how an app's work is named on GitHub: the pull request's title and whether it opens as a draft, and the branch and commit conventions (conventions.ts). Undefined leaves one; empty clears it. */
export async function setPrRules(appId: string, i: { titleTemplate?: string; draft?: boolean; branchTemplate?: string; commitFormat?: string; /** A task needs the team's own ticket before its branch is cut or its pull request opened (ticket.ts). */ ticketRequired?: boolean }) {
  const { db } = await import('./db/client.js'); const { app } = await import('./db/schema.js'); const { eq } = await import('drizzle-orm')
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new Error(`no app ${appId}`)
  const changes: Record<string, unknown> = {}
  if (i.draft !== undefined) changes.pr_draft = i.draft
  if (i.ticketRequired !== undefined) changes.ticket_required = i.ticketRequired
  for (const [given, key] of [[i.titleTemplate, 'pr_title'], [i.branchTemplate, 'branch_name'], [i.commitFormat, 'commit_format']] as const) if (given !== undefined) changes[key] = given.trim().slice(0, 250) || null
  const next = await (await import('./setup.js')).patchSetup(appId, changes)
  return { pr_title: (next.pr_title as string | undefined) ?? null, pr_draft: next.pr_draft !== false, branch_name: (next.branch_name as string | undefined) ?? null, commit_format: (next.commit_format as string | undefined) ?? null, ticket_required: next.ticket_required === true }
}
