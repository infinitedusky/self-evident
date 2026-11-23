/**
 * The repository's own conventions for what a build leaves on GitHub: the branch's name and the commits' first lines
 * (the pull request's title is pr.ts). Found on CEB-79 (2026-11-18): the repository had a naming skill, and every
 * commit still came out as `feat(CEB-84): …`, because the builder was told only "commit with a clear message" and
 * knew only our own numbers: CEB-84 was a sub-task of ours, which means nothing outside Evident.
 *
 * Two settings beside `setup.pr_title`, set by the app's agent from the repository's rules (set_pr_rules) or by
 * hand under Settings › Landing:
 * - `branch_name`: a new task's branch, with {ticket} (the team's ticket id, else our task id), {id} (ours), {title}
 *   (as a slug) and {project} (as a slug). A task keeps the branch it was given (issue.branch); one already building
 *   keeps the name it had.
 * - `commit_format`: the first line of a commit, with {ticket} and {id} filled in and anything else in braces left
 *   for the builder to fill (`{type}({ticket}): {subject}`). The builder is told it, and every commit an agent makes
 *   is held to it: {type} is one lowercase word, any other name in braces is any text, the rest is exact. It is
 *   checked as the commit is made, by a git `commit-msg` hook, so a wrong one is refused and reworded on the spot: a
 *   check after the build would mean rewriting history that is already merged. One setting, not a format and a
 *   pattern: what a format cannot say (which types are allowed) is the repository's own commit hook's to refuse,
 *   and that still runs.
 *
 * The hook is ours and never in the repository: a folder under ~/.self-evident, named to git through the agent's
 * environment (GIT_CONFIG_*: core.hooksPath), so nothing is written to the repository or its config and the engine's
 * own git calls are not checked. The repository's own hooks (husky, lefthook) still run: each is passed on to.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { git } from './git.js'

export interface Named { /** The team's ticket id, when the task came from their tracker. */ ticket?: string | null; /** Our task id (CEB-79), never a sub-task's. */ id: string; title?: string; project?: string }

/** The ticket a task's branch, commits and pull request name: the team's when it has one, else ours. */
export const ticketOf = (t: { identifier: string; sourceRef?: unknown }) => (t.sourceRef as { linear?: { identifier?: string } } | null | undefined)?.linear?.identifier || t.identifier

export const slug = (s: string, max = 40) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')

const setting = (setup: unknown, key: 'branch_name' | 'commit_format') => ((setup as Record<string, unknown> | null)?.[key] as string | undefined)?.trim() || null

/** Whether git would take it as a branch's name (git check-ref-format, the rules that matter here). */
export const validBranch = (name: string) => /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(name) && !/\.\.|\/\/|\/\.|\.lock(\/|$)|[./]$|@\{/.test(name)

/** A new task's branch by the app's template; null when there is none, or it does not make a name git would take. */
export function branchName(setup: unknown, v: Named): string | null {
  const t = setting(setup, 'branch_name')
  if (!t) return null
  const vars: Record<string, string> = { ticket: v.ticket || v.id, id: v.id, title: slug(v.title ?? ''), project: slug(v.project ?? '') }
  const name = t.replace(/\{(ticket|id|title|project)\}/g, (_, k: string) => vars[k]).replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/[-/]+$/, '')
  return validBranch(name) ? name : null
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The app's rule for commits on one task: the format as the builder is told it, and the pattern its first lines are held to (made from the format). */
export function commitRule(setup: unknown, v: Named): { format: string | null; pattern: string | null } {
  const t = setting(setup, 'commit_format')
  if (!t) return { format: null, pattern: null }
  const known = (k: string) => (k === 'ticket' ? v.ticket || v.id : k === 'id' ? v.id : null)
  const format = t.replace(/\{(\w+)\}/g, (all, k: string) => known(k) ?? all)
  const pattern = '^' + t.split(/(\{\w+\})/).map((part) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1]
    return k ? (known(k) !== null ? escape(known(k)!) : k === 'type' ? '[a-z]+' : '.+') : escape(part)
  }).join('') + '$'
  return { format, pattern }
}

/**
 * What the builder put where the format left it to choose ({type}, {scope}, …), read back from a commit's first
 * line: the pull request's title is filled from it (pr.ts), so one convention covers both. Null when the line does
 * not follow the format, or there is none.
 */
export function commitParts(setup: unknown, v: Named, subject: string): Record<string, string> | null {
  const t = setting(setup, 'commit_format')
  if (!t) return null
  const known = (k: string) => (k === 'ticket' ? v.ticket || v.id : k === 'id' ? v.id : null)
  const seen = new Set<string>()
  const source = '^' + t.split(/(\{\w+\})/).map((part) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1]
    if (!k) return escape(part)
    if (known(k) !== null) return escape(known(k)!)
    if (seen.has(k)) return k === 'type' ? '[a-z]+' : '.*?'
    seen.add(k)
    return k === 'type' ? `(?<${k}>[a-z]+)` : `(?<${k}>.*?)`
  }).join('') + '$'
  const m = new RegExp(source).exec(subject.trim())
  return m ? { ...(m.groups ?? {}) } : null
}

/** What an agent's own git makes without a person's words: left alone. */
const PASSES = /^(Merge |Revert "|fixup! |squash! |amend! )/
export const commitOk = (subject: string, pattern: string) => PASSES.test(subject) || new RegExp(pattern).test(subject)

export const hooksHome = () => process.env.HOOKS_HOME ?? join(homedir(), '.self-evident', 'hooks')

/**
 * The hooks folder for one worktree's agent: a `commit-msg` that refuses a first line outside the pattern, saying the
 * format, and a pass-through for every hook the repository has of its own. Written again each time, so a changed
 * rule or a hook the repository gained is picked up. Returns the folder.
 */
export async function installCommitCheck(worktreePath: string, rule: { pattern: string; format?: string | null }): Promise<string> {
  const dir = join(hooksHome(), createHash('sha1').update(resolve(worktreePath)).digest('hex').slice(0, 16))
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  // The repository's own hooks, wherever it keeps them (asked without our override: this process does not have it).
  const said = (await git(worktreePath, ['rev-parse', '--git-path', 'hooks'], { allowFail: true })).stdout
  const theirs = said ? (isAbsolute(said) ? said : resolve(worktreePath, said)) : null
  const own = theirs && existsSync(theirs) ? readdirSync(theirs).filter((f) => !f.includes('.') && f !== '_' && isRunnable(join(theirs, f))) : []
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  for (const name of own) if (name !== 'commit-msg') put(join(dir, name), `#!/bin/sh\nexec ${q(join(theirs!, name))} "$@"\n`)
  writeFileSync(join(dir, 'check.cjs'), CHECK.replace('__RULE__', JSON.stringify({ pattern: rule.pattern, format: rule.format ?? null, passes: PASSES.source })))
  put(join(dir, 'commit-msg'), `#!/bin/sh\n${q(process.execPath)} ${q(join(dir, 'check.cjs'))} "$1" || exit 1\n${own.includes('commit-msg') ? `exec ${q(join(theirs!, 'commit-msg'))} "$@"\n` : ''}`)
  return dir
}

const isRunnable = (p: string) => { try { const s = statSync(p); return s.isFile() && (s.mode & 0o111) !== 0 } catch { return false } }
const put = (p: string, text: string) => { writeFileSync(p, text); chmodSync(p, 0o755) }

const CHECK = `const rule = __RULE__
const subject = (require('node:fs').readFileSync(process.argv[2], 'utf8').split('\\n').find((l) => l.trim() && !l.startsWith('#')) || '').trim()
if (new RegExp(rule.passes).test(subject) || new RegExp(rule.pattern).test(subject)) process.exit(0)
console.error('This commit is refused: its first line does not follow this repository\\'s convention.')
console.error('  yours:   ' + subject)
if (rule.format) console.error('  format:  ' + rule.format)
console.error('  pattern: ' + rule.pattern)
console.error('Nothing was committed. Commit again with a first line that fits.')
process.exit(1)
`

/** An agent's environment with git pointed at a hooks folder, on top of whatever git settings it already carried. */
export function hookEnv(dir: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const n = Number(env.GIT_CONFIG_COUNT ?? 0) || 0
  return { ...env, GIT_CONFIG_COUNT: String(n + 1), [`GIT_CONFIG_KEY_${n}`]: 'core.hooksPath', [`GIT_CONFIG_VALUE_${n}`]: dir }
}
