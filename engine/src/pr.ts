/**
 * One PR per project: the integration branch against the app's default branch, opened at the first landing and
 * updated as more issues land. The PR carries the support for the change: each sub-issue, its summary, its cost.
 */
import { execFile } from 'node:child_process'
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
}

export async function ensureProjectPr(i: PrInput): Promise<{ number: number; url: string; created: boolean }> {
  await push(i.repoPath, i.integrationBranch, { setUpstream: true })
  const gh = (args: string[]) => execFileP('gh', args, { cwd: i.repoPath }).then((r) => r.stdout.trim())
  const existing = JSON.parse(await gh(['pr', 'list', '-R', i.fullName, '--head', i.integrationBranch, '--state', 'open', '--json', 'number,url']))
  if (existing.length) {
    await gh(['pr', 'edit', String(existing[0].number), '-R', i.fullName, '--title', i.title, '--body', i.body, '--base', i.base]) // a stacked PR retargets when the one below merges
    return { number: existing[0].number, url: existing[0].url, created: false }
  }
  const url = await gh(['pr', 'create', '-R', i.fullName, '--base', i.base, '--head', i.integrationBranch, '--title', i.title, '--body', i.body])
  const number = Number(url.split('/').pop())
  return { number, url, created: true }
}

export interface Landed { identifier: string; title: string; summary?: string | null; costUsd?: number | null; sha?: string | null }

export function prBody(project: { name: string; content?: string | null; id: string }, landed: Landed[], pending: { identifier: string; title: string }[], backlog: { title: string; state: string; reason: string | null }[] = []): string {
  const lines = [
    `Built by Self Evident from project \`${project.id}\`: ${project.name}.`,
    project.content ? `\n${project.content}` : '',
    '',
    '## Landed',
    ...landed.map((t) => [`### ${t.identifier} ${t.title}` + (t.sha ? ` (\`${t.sha.slice(0, 7)}\`)` : ''),
      t.summary?.trim() || '_No summary from the run._',
      t.costUsd != null ? `_Run cost estimate: $${Number(t.costUsd).toFixed(2)}_` : ''].join('\n\n')),
    pending.length ? `\n## Still to land\n${pending.map((t) => `- ${t.identifier} ${t.title}`).join('\n')}` : '',
    backlog.some((b) => b.state === 'backlog') ? `\n## Backlog still open\n${backlog.filter((b) => b.state === 'backlog').map((b) => `- ${b.title}`).join('\n')}` : '',
    backlog.some((b) => b.state === 'canceled') ? `\n## Left out on purpose\n${backlog.filter((b) => b.state === 'canceled').map((b) => `- ${b.title}: ${b.reason}`).join('\n')}` : '',
    '',
    'Each sub-task was built in its own worktree, was merged with this branch, tested on the merged commit, and fast-forwarded here, one at a time.',
    '',
    'Rollback project: revert this PR. Off switch, guard metric and schema impact per task come in a later step.',
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code) via Self Evident',
  ]
  return lines.filter((l) => l !== null).join('\n')
}
