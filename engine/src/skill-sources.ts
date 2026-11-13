/**
 * Skills pulled from a repository (Sandy, 2026-11-13: "point to a repo and pull all the skills of that repo, or update
 * if we already have them and the repo has changed"). A source is a git URL or a folder on this computer that is a
 * git repository. Pulling one clones it (shallow) beside the shared skills, finds every folder holding a SKILL.md,
 * and copies each into the shared skills (skills.ts, sharedHome), so every app gets them. Pulling it again fetches
 * the repository and brings the copies up to date: changed skills are replaced, new ones added, ones the repository
 * dropped are removed.
 *
 * Each copy carries a marker naming its source. A skill here that did not come from this source (written by hand, or
 * from another repository) is never overwritten or removed: it is reported as skipped. Nothing in the repository is
 * run; files are copied. What was pulled, and at which commit, is kept in `<shared>/sources.json`.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { PlanError } from './issues.js'
import { sharedHome } from './skills.js'

const execFileP = promisify(execFile)
const MARKER = '.self-evident-source.json'
const SKIP = new Set(['.git', 'node_modules', '.venv', 'dist', 'build'])

export interface SkillSource { url: string; commit: string; pulledAt: string; skills: string[] }
export interface Pulled { source: SkillSource; added: string[]; updated: string[]; unchanged: string[]; removed: string[]; /** Names taken here by a skill from somewhere else: left alone. */ skipped: string[] }

const recordFile = () => join(sharedHome(), 'sources.json')
export function skillSources(): SkillSource[] { try { return JSON.parse(readFileSync(recordFile(), 'utf8')) as SkillSource[] } catch { return [] } }
const save = (rows: SkillSource[]) => { mkdirSync(sharedHome(), { recursive: true }); writeFileSync(recordFile(), JSON.stringify(rows, null, 2) + '\n') }

/** A git URL as given, or a folder on this computer made absolute; anything git would read as an option is refused. */
function locate(given: string): string {
  const url = given.trim()
  if (!url) throw new PlanError('give a repository: a git URL (git@…, https://…), or a folder on this computer')
  if (url.startsWith('-')) throw new PlanError(`"${url.slice(0, 40)}" isn't a repository`)
  if (/^[\w.+-]+:\/\//.test(url) || /^[\w.-]+@[\w.-]+:/.test(url) || /^[\w.-]+:[\w./-]+$/.test(url) && !existsSync(url)) return url // a URL, scp form, or an ssh alias
  const path = url === '~' || url.startsWith('~/') ? join(homedir(), url.slice(1)) : resolve(url)
  if (!existsSync(join(path, '.git'))) throw new PlanError(`${path} isn't a git repository on this computer`)
  return path
}
const cloneDir = (url: string) => join(sharedHome(), 'sources', `${basename(url).replace(/\.git$/, '').replace(/[^\w.-]/g, '-').slice(0, 40) || 'repo'}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}`)
const git = (cwd: string, ...args: string[]) => execFileP('git', args, { cwd, timeout: 180_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).then((r) => r.stdout.trim())
const said = (e: unknown) => String((e as { stderr?: string; message?: string })?.stderr || (e as Error)?.message || e).trim().split('\n').slice(-2).join(' ').slice(0, 300)

/** Every folder under a checkout that holds a SKILL.md, shallowest first; where two share a name, the shallower wins. */
export function findSkills(root: string, depth = 5): Map<string, string> {
  const found: string[] = []
  const walk = (dir: string, left: number) => {
    let names: string[]
    try { names = readdirSync(dir) } catch { return }
    if (names.includes('SKILL.md') && dir !== root) { found.push(dir); return } // a skill's own sub-folders are its files
    if (left > 0) for (const n of names) if (!SKIP.has(n)) { const p = join(dir, n); try { if (statSync(p).isDirectory()) walk(p, left - 1) } catch { /* a broken link */ } }
  }
  walk(root, depth)
  const out = new Map<string, string>()
  for (const dir of found.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const name = basename(dir).toLowerCase()
    if (/^[a-z0-9][a-z0-9._-]{0,62}$/.test(name) && !out.has(name)) out.set(name, dir)
  }
  return out
}

/** A folder's files as one hash, the marker left out: the same hash means the same skill. */
function fingerprint(dir: string): string {
  const h = createHash('sha1')
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { if (n === MARKER || n === '.git') continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else h.update(relative(dir, p)).update('\0').update(readFileSync(p)) } }
  walk(dir)
  return h.digest('hex')
}
const sourceOf = (dir: string): string | null => { try { return (JSON.parse(readFileSync(join(dir, MARKER), 'utf8')) as { url?: string }).url ?? null } catch { return null } }

/** Pull a repository's skills, or bring the ones already pulled from it up to date. */
export async function pullSkills(given: string): Promise<Pulled> {
  const url = locate(given)
  const dir = cloneDir(url)
  try {
    if (existsSync(join(dir, '.git'))) { await git(dir, 'fetch', '--depth', '1', 'origin'); await git(dir, 'reset', '--hard', 'FETCH_HEAD') }
    else { mkdirSync(join(sharedHome(), 'sources'), { recursive: true }); rmSync(dir, { recursive: true, force: true }); await git(sharedHome(), 'clone', '--depth', '1', '--', url, dir) }
  } catch (e) { throw new PlanError(`Couldn't read ${url}: ${said(e)}`) }
  const commit = await git(dir, 'rev-parse', 'HEAD')
  const theirs = findSkills(dir)
  if (!theirs.size) throw new PlanError(`No skills in ${url}: no folder there holds a SKILL.md.`)
  const home = join(sharedHome(), 'skills')
  mkdirSync(home, { recursive: true })
  const out: Pulled = { source: { url, commit, pulledAt: new Date().toISOString(), skills: [] }, added: [], updated: [], unchanged: [], removed: [], skipped: [] }
  for (const [name, from] of [...theirs].sort(([x], [y]) => x.localeCompare(y))) { // by name, so what is reported reads the same each time
    const to = join(home, name)
    if (existsSync(to) && sourceOf(to) !== url) { out.skipped.push(name); continue }
    if (existsSync(to) && fingerprint(to) === fingerprint(from)) out.unchanged.push(name)
    else { (existsSync(to) ? out.updated : out.added).push(name); rmSync(to, { recursive: true, force: true }); cpSync(from, to, { recursive: true, filter: (p) => basename(p) !== '.git' }) }
    writeFileSync(join(to, MARKER), JSON.stringify({ url, commit }) + '\n')
    out.source.skills.push(name)
  }
  for (const name of readdirSync(home)) if (!theirs.has(name) && sourceOf(join(home, name)) === url) { rmSync(join(home, name), { recursive: true, force: true }); out.removed.push(name) }
  save([...skillSources().filter((s) => s.url !== url), out.source])
  return out
}

/** Stop pulling from a repository: its skills here are removed, with the clone and the record. */
export function removeSkillSource(given: string) {
  const url = skillSources().find((s) => s.url === given.trim())?.url
  if (!url) throw new PlanError(`no skills were pulled from ${given}`)
  const home = join(sharedHome(), 'skills')
  const removed = existsSync(home) ? readdirSync(home).filter((n) => sourceOf(join(home, n)) === url) : []
  for (const n of removed) rmSync(join(home, n), { recursive: true, force: true })
  rmSync(cloneDir(url), { recursive: true, force: true })
  save(skillSources().filter((s) => s.url !== url))
  return { removed }
}
