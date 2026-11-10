/**
 * The house configuration for tkt's lifecycle skills, written for an app in one press (Sandy, 2026-11-09, after the
 * first "Set up what's missing" sent a yes/no list back: "we need a way to do it fast and consistent"; "for all the
 * integrations there has to be a default where I can just put the integration and say set up"). /setup-rogs fills the
 * same seeds by asking the person; here every blank is a fact about the app or its repository, or the one house default
 * (SHAPE.md, "The house profile"), so two apps get the same configuration apart from their facts, in seconds.
 *
 * The seeds are docs/lifecycle/ (MIT, gitlab.com/rogs/skills); the tracker guide, issue-tracker.md, is tkt.ts's. tkt
 * itself reads two of the files (issue-tracker.md's ticket pattern, forge.md's remote and base branch: lifecycle.go in
 * tkt); the skills read them all. A file keeps being rewritten only while it carries the ownership line (OWNED): take
 * the line out and the file is the person's.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ticketKey, ticketUrl, trackerWords } from './linear-home.js'
import type { ReadText, Run, TktContext, Write } from './tkt.js'

export const OWNED = 'Self Evident wrote it'
export const BEGIN = '<!-- rogs-skills:begin config v1 -->'
export const END = '<!-- rogs-skills:end -->'
export const FILL = /\{\{FILL: ([^}]*)\}\}/g

/** The body under `## <heading>` in a guide, up to the next `## `, without the heading line. */
export function section(text: string, heading: string): string {
  const out: string[] = []
  let on = false
  for (const ln of text.split('\n')) {
    if (ln.startsWith('## ')) { if (on) break; on = ln === `## ${heading}`; continue }
    if (on) out.push(ln)
  }
  return out.join('\n').trim()
}

const readText: ReadText = (p) => readFile(p, 'utf8')
const seedsDir = fileURLToPath(new URL('../../docs/lifecycle/', import.meta.url))
const seed = (name: string, read: ReadText) => read(`${seedsDir}${name}`)

export type Pm = 'pnpm' | 'npm' | 'yarn' | 'bun'
/** What the repository says about itself: everything a blank needs that is not the app or the house default. */
export interface Facts {
  dir: string // the checkout's folder name: worktrees go beside it
  remote: { name: string; host: string; fullName: string } | null
  base: string
  mergeStyle: 'merge' | 'squash'
  prTemplate: string | null // the repository's own pull request template, as a path on the base branch
  ci: { file: string; paths: string[] }[] // the workflows that run on pull requests, each with its path filters
  pm: Pm | null
  scripts: Record<string, string>
  deps: string[]
  workspaces: { dir: string; name: string; scripts: Record<string, string> }[] // pnpm workspace packages; empty elsewhere
  hooks: string | null // the commit hook runner found, as a sentence
  glossary: string // GLOSSARY.md, or the CONTEXT.md the repo already keeps
  blockFile: string // where the Ticket lifecycle block goes: CLAUDE.md, or AGENTS.md when CLAUDE.md only points at it
}

const isGitHub = (host: string) => /(^|\.)github\.com$|\.ghe\.com$/.test(host)

/** The globs under a workflow's `paths:` keys (never `paths-ignore`), as list items or an inline list; crude on purpose. */
export function pathFilters(yaml: string): string[] {
  const out: string[] = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*paths:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const inline = /^\[(.*)\]\s*$/.exec(m[1])
    if (inline) { out.push(...inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)); continue }
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue
      const item = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(lines[j])
      if (!item) break
      out.push(item[1].trim())
    }
  }
  return [...new Set(out)]
}

/** The first remote (origin preferred), parsed, and the base branch: the remote's HEAD, else the app's default branch, else main. */
export async function remoteAndBase(root: string, fallbackBase: string | undefined, run: Run): Promise<{ remote: Facts['remote']; base: string }> {
  const tryRun = async (args: string[]) => { try { return (await run('git', args, root)).stdout.trim() } catch { return null } }
  const remotes = ((await tryRun(['remote'])) ?? '').split('\n').filter(Boolean)
  const remoteName = remotes.includes('origin') ? 'origin' : remotes[0]
  let remote: Facts['remote'] = null
  if (remoteName) {
    const url = await tryRun(['remote', 'get-url', remoteName])
    const m = url && /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)[/:](.+?)(?:\.git)?\/?$/.exec(url)
    if (m) remote = { name: remoteName, host: m[1], fullName: m[2] }
  }
  const base = (await tryRun(['symbolic-ref', '--short', `refs/remotes/${remoteName ?? 'origin'}/HEAD`]))?.replace(/^[^/]+\//, '') || fallbackBase || 'main'
  return { remote, base }
}

/** Reads the repository: git for the remote and the base, gh for how the forge merges, the files for the rest. Nothing here fails the set-up: what cannot be read falls back to the house default. */
export async function repoFacts(repoPath: string, fallbackBase: string | undefined, deps: { run: Run; read: ReadText }): Promise<Facts> {
  const root = repoPath.replace(/\/$/, '')
  const tryRun = async (file: string, args: string[]) => { try { return (await deps.run(file, args, root)).stdout.trim() } catch { return null } }
  const tryRead = async (p: string) => { try { return await deps.read(`${root}/${p}`) } catch { return null } }
  const files = new Set(((await tryRun('git', ['ls-files', '--cached', '--others', '--exclude-standard'])) ?? '').split('\n').filter(Boolean))
  const has = (p: string) => files.has(p)
  const under = (prefix: string) => [...files].filter((f) => f.startsWith(prefix))

  const rb = await remoteAndBase(root, fallbackBase, deps.run)
  const remote = rb.remote
  let base = rb.base
  let mergeStyle: Facts['mergeStyle'] = 'merge'
  const templates = ['.github/PULL_REQUEST_TEMPLATE.md', '.github/pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md', 'docs/PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md']
  let prTemplate = templates.find(has) ?? null
  if (remote && isGitHub(remote.host)) {
    const out = await tryRun('gh', ['repo', 'view', `${remote.host}/${remote.fullName}`, '--json', 'defaultBranchRef,mergeCommitAllowed,squashMergeAllowed,pullRequestTemplates'])
    try {
      const j = JSON.parse(out ?? '') as { defaultBranchRef?: { name?: string }; mergeCommitAllowed?: boolean; squashMergeAllowed?: boolean; pullRequestTemplates?: { filename?: string }[] }
      if (j.defaultBranchRef?.name) base = j.defaultBranchRef.name
      if (j.mergeCommitAllowed === false && j.squashMergeAllowed) mergeStyle = 'squash'
      const tpl = j.pullRequestTemplates?.[0]?.filename
      if (tpl) prTemplate = [...files].find((f) => basename(f).toLowerCase() === tpl.toLowerCase()) ?? prTemplate
    } catch { /* gh not there or not signed in: git and the files decide */ }
  }

  const ci: Facts['ci'] = []
  for (const f of under('.github/workflows/').filter((f) => /\.ya?ml$/.test(f))) {
    const text = await tryRead(f)
    if (text && /\bpull_request(_target)?\b/.test(text)) ci.push({ file: f, paths: pathFilters(text) })
  }

  const pkg = await tryRead('package.json')
  let scripts: Record<string, string> = {}
  let depNames: string[] = []
  if (pkg) {
    try { const p = JSON.parse(pkg) as { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object }; scripts = p.scripts ?? {}; depNames = Object.keys({ ...p.dependencies, ...p.devDependencies }) } catch { /* not JSON: no scripts */ }
  }
  const pm: Pm | null = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : pkg ? 'npm' : null
  const workspaces: Facts['workspaces'] = []
  const ws = pm === 'pnpm' ? await tryRead('pnpm-workspace.yaml') : null
  if (ws) {
    for (const [, g] of ws.matchAll(/^\s*-\s*['"]?([^'"#\n!]+?)['"]?\s*$/gm)) {
      const glob = g.trim().replace(/\/$/, '')
      const dirs = /\/\*\*?$/.test(glob)
        ? [...files].filter((f) => f.startsWith(glob.replace(/\/\*\*?$/, '/')) && basename(f) === 'package.json' && f.split('/').length === glob.split('/').length + 1).map(dirname)
        : [glob]
      for (const d of dirs) {
        const t = await tryRead(`${d}/package.json`)
        if (!t) continue
        try { const p = JSON.parse(t) as { name?: string; scripts?: Record<string, string> }; if (p.name) workspaces.push({ dir: d, name: p.name, scripts: p.scripts ?? {} }) } catch { /* skip */ }
      }
    }
  }
  const hooks = under('.husky/').some((f) => !f.startsWith('.husky/_/')) ? 'husky runs the scripts in .husky/ on commit; a failing hook aborts the commit'
    : ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml'].some(has) ? 'lefthook runs the hooks in its config on commit; a failing hook aborts the commit'
    : has('.pre-commit-config.yaml') ? 'pre-commit runs the hooks in .pre-commit-config.yaml on commit; a failing hook aborts the commit'
    : null
  const glossary = has('GLOSSARY.md') ? 'GLOSSARY.md' : has('CONTEXT.md') ? 'CONTEXT.md' : 'GLOSSARY.md'
  const claude = await tryRead('CLAUDE.md')
  const agents = await tryRead('AGENTS.md')
  const onlyPoints = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean).length <= 3 && /AGENTS\.md/.test(t)
  const blockFile = claude !== null && !(agents !== null && onlyPoints(claude)) ? 'CLAUDE.md' : agents !== null ? 'AGENTS.md' : 'CLAUDE.md'
  return { dir: basename(root), remote, base, mergeStyle, prTemplate, ci, pm, scripts, deps: depNames, workspaces, hooks, glossary, blockFile }
}

/** The configuration, composed: the files for docs/agents/ by name, the block, where it goes, and what could not be written and why. */
export interface House { files: Record<string, string>; block: string; blockFile: string; skipped: string[] }

type Answer = (what: string, line: string) => string | undefined
/** Fills every blank on every line, or throws: an unanswered blank is a bug here, never a file for the person to finish. */
function fillAll(text: string, answer: Answer): string {
  const out = text.split('\n').map((line) => line.replace(FILL, (whole, what: string) => answer(what, line) ?? whole)).join('\n')
  const left = out.match(FILL)
  if (left) throw new Error(`lifecycle seed: no answer for ${left.join(', ')}`)
  return out
}
/** Removes `## <name>` sections, heading to the line before the next `## `. */
export function dropSections(text: string, names: string[]): string {
  const out: string[] = []
  let dropping = false
  for (const ln of text.split('\n')) {
    if (ln.startsWith('## ')) dropping = names.includes(ln.slice(3).trim())
    if (!dropping) out.push(ln)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Running a script or a binary with the package manager at hand, so the commands in workflow.md are the project's own.
const runScript = (pm: Pm, script: string, extra = '') => pm === 'npm' ? `npm run ${script}${extra ? ` -- ${extra}` : ''}` : pm === 'bun' ? `bun run ${script}${extra ? ` ${extra}` : ''}` : `${pm} ${script}${extra ? ` ${extra}` : ''}`
const runBin = (pm: Pm, bin: string, extra: string) => ({ pnpm: `pnpm ${bin} ${extra}`, npm: `npx ${bin} ${extra}`, yarn: `yarn ${bin} ${extra}`, bun: `bunx ${bin} ${extra}` })[pm]
const install = (pm: Pm) => ({ pnpm: 'pnpm install --frozen-lockfile', npm: 'npm ci', yarn: 'yarn install --immutable', bun: 'bun install --frozen-lockfile' })[pm]
const listDeps = (pm: Pm) => ({ pnpm: 'pnpm list', npm: 'npm ls', yarn: 'yarn list --pattern', bun: 'bun pm ls' })[pm]

const forgeAnswers = (ctx: TktContext, facts: Facts, guide: string): Answer => {
  const r = facts.remote!
  const forge = fillAll(section(guide, 'Forge'), (what) => {
    if (/ghe\.com tenant/.test(what)) return r.host
    if (/^owner\/name$/.test(what)) return r.fullName
    if (/^remote name$/.test(what)) return r.name
    if (/^base branch$/.test(what)) return facts.base
    if (/^merge or squash$/.test(what)) return facts.mergeStyle
    return undefined
  })
  const ops = section(guide, 'Operations')
  const filtered = facts.ci.filter((w) => w.paths.length)
  return (what) => {
    if (/"## Forge" section/.test(what)) return forge
    if (/"## Operations" section/.test(what)) return ops
    if (/"every check reported for the head"/.test(what)) return facts.ci.length ? 'every check reported for the head' : 'none'
    if (/automated reviewers/.test(what)) return 'none'
    if (/paths that make the gate checks run/.test(what)) return !facts.ci.length ? 'none' : filtered.length ? filtered.map((w) => `${w.file}: ${w.paths.map((p) => `\`${p}\``).join(', ')}`).join('; ') : 'none: every change runs them'
    if (/"not applicable"/.test(what)) return facts.ci.length ? 'not applicable' : "this repository has no CI; write 'no CI configured' wherever CI evidence would go"
    if (/a bot commits generated docs/.test(what)) return 'none'
    if (/"the template at <path> on the base branch"/.test(what)) return facts.prTemplate ? `the template at ${facts.prTemplate} on the base branch` : 'docs/agents/pull-request.md'
    if (/Ticket: \[ACM-123\]/.test(what)) return `\`Ticket: [${ticketKey(ctx)}-123](${ticketUrl(ctx, `${ticketKey(ctx)}-123`)})\``
    if (/a login to assign/.test(what)) return 'none'
    if (/what the account the skills run as cannot do/.test(what)) return 'The skills run as the person\'s own gh login, the one that opens the pull requests, so it cannot approve or request changes on them (GitHub refuses a review verdict from the author): the verdicts the skills post are workflow evidence, not branch-protection approvals.'
    if (/the app's name/.test(what)) return ctx.app.name
    return undefined
  }
}

const FOCUSED_ROW = '| {{FILL: a glob}} | {{FILL: the command that checks that area}} |'
const workflowAnswers = (ctx: TktContext, facts: Facts): Answer => {
  const pm = facts.pm
  const script = (name: string) => (pm && facts.scripts[name] ? runScript(pm, name) : null)
  const checks = ['lint', 'typecheck', 'test'].map(script).filter((c): c is string => !!c)
  const full = checks.length ? checks.join(' && ') : 'not configured'
  const one = !pm ? null : facts.deps.includes('vitest') ? runBin(pm, 'vitest', 'run <file>') : facts.deps.includes('jest') ? runBin(pm, 'jest', '<file>') : facts.scripts.test ? runScript(pm, 'test', '<file>') : null
  const many = facts.workspaces.length > 0
  const repro = pm
    ? `one test: ${one ? `\`${one}\`` : 'not configured'}; a dependency's version: \`${listDeps(pm)} <name>\`${many ? ' in the package that depends on it' : ''}; a dependency's source: \`node_modules/<name>\`${many ? ' under that package, else at the root' : ''}`
    : 'not configured'
  return (what, line) => {
    if (/^on or off/.test(what)) return 'off'
    if (/~\/code\/worktrees/.test(what)) return `\`../${facts.dir}-wt/<ticket id>\`, beside the primary checkout`
    if (/^the command, or "not configured"$/.test(what)) return line.startsWith('| Format') ? (script('format') ?? 'not configured') : full
    if (/paths where behavior changes start with a failing test/.test(what)) return 'none'
    if (/a pre-commit hook runs the focused checks/.test(what)) return facts.hooks ?? 'none'
    if (/environment notes, such as services/.test(what)) return 'none'
    if (/paths that stay out of git beyond/.test(what)) return 'nothing beyond .gitignore'
    if (/"follow recent history"/.test(what)) return 'follow recent history'
    if (/project-specific sync notes/.test(what)) return pm ? `run \`${install(pm)}\` after a sync that changes the lockfile` : 'none'
    if (/each area or glob with the rule file/.test(what)) return 'none'
    if (/path, pinned version and terms of use/.test(what)) return 'none'
    if (/data that must never enter prompts/.test(what)) return 'none'
    if (/hard rules a review checks first/.test(what)) return 'none beyond the defaults'
    if (/review opinions specific to this project/.test(what)) return 'none'
    if (/how to run one test/.test(what)) return repro
    if (/the app's name/.test(what)) return ctx.app.name
    return undefined
  }
}
/** The focused-checks rows: one per pnpm workspace package with a test script, else one row for everything. */
const focusedRows = (facts: Facts, full: string) => {
  const rows = facts.workspaces.filter((w) => w.scripts.test).map((w) => `| ${w.dir}/** | pnpm --filter ${w.name} test |`)
  return rows.length ? rows.join('\n') : `| ** | ${full} |`
}

const domainAnswers = (ctx: TktContext, facts: Facts): Answer => (what) => {
  if (/"One context:/.test(what)) return `One context: \`${facts.glossary}\` at the repository root.`
  if (/docs\/adr\//.test(what)) return '`docs/adr/`'
  if (/the app's name/.test(what)) return ctx.app.name
  return undefined
}
const blockAnswers = (ctx: TktContext, facts: Facts): Answer => (what) => {
  if (/tracker and project in a few words/.test(what)) return trackerWords(ctx)
  if (/forge and repository in a few words/.test(what)) return facts.remote ? `GitHub, ${facts.remote.fullName}` : 'no forge yet'
  if (/the features that are on/.test(what)) return 'none'
  return undefined
}

/** Composes the configuration from the seeds; pure apart from reading them. */
export async function houseConfig(ctx: TktContext, facts: Facts, read: ReadText = readText): Promise<House> {
  const files: Record<string, string> = {}
  const skipped: string[] = []
  if (facts.remote && isGitHub(facts.remote.host)) files['forge.md'] = fillAll(await seed('forge.md', read), forgeAnswers(ctx, facts, await seed('forge-github.md', read)))
  else if (!facts.remote) skipped.push('docs/agents/forge.md: the checkout has no git remote, and tkt opens pull requests on a forge; push the repo to GitHub first')
  else skipped.push(`docs/agents/forge.md: ${facts.remote.host} isn't a forge Self Evident writes yet (GitHub only); /setup-rogs has guides for GitLab and Gitea`)
  const wf = await seed('workflow.md', read)
  const full = fillAll('{{FILL: the command, or "not configured"}}', workflowAnswers(ctx, facts)) // the full check, for the one-row table
  files['workflow.md'] = fillAll(wf.replace(FOCUSED_ROW, focusedRows(facts, full)), workflowAnswers(ctx, facts))
  files['domain.md'] = fillAll(await seed('domain.md', read), domainAnswers(ctx, facts))
  if (!facts.prTemplate) { // the browser pass and the changelog are off; the ownership line is a comment, since this file is a pull request body
    const pr = dropSections(await seed('pull-request.md', read), ['Screenshots', 'Changelog']).split('\n')
    files['pull-request.md'] = [pr[0], `<!-- ${OWNED} for the app ${ctx.app.name}: Set up what's missing under Integrations › tkt writes it again, and leaves the file alone once this line is gone. -->`, ...pr.slice(1)].join('\n')
  }
  const block = fillAll(await seed('agents-block.md', read), blockAnswers(ctx, facts))
  return { files, block, blockFile: facts.blockFile, skipped }
}

/** `wrote`: files whose bytes changed; `kept`: the person's, left alone; `paths`: everything to commit, relative to the checkout. */
export interface Written { wrote: string[]; kept: string[]; paths: string[]; blockChanged: boolean }
/** Writes the files that are Self Evident's (new, or carrying the ownership line) and the block, into the checkout. */
export async function writeHouse(repoPath: string, appName: string, house: House, deps: { read: ReadText; write: Write }): Promise<Written> {
  const root = repoPath.replace(/\/$/, '')
  const current = async (rel: string) => { try { return await deps.read(`${root}/${rel}`) } catch { return null } }
  const wrote: string[] = []
  const kept: string[] = []
  const paths: string[] = []
  for (const [name, text] of Object.entries(house.files)) {
    const rel = `docs/agents/${name}`
    const cur = await current(rel)
    if (cur !== null && !cur.includes(OWNED)) { kept.push(rel); continue }
    if (cur !== text) { await deps.write(`${root}/${rel}`, text); wrote.push(rel) }
    paths.push(rel)
  }
  const cur = (await current(house.blockFile)) ?? ''
  const block = house.block.trimEnd()
  const next = cur.includes(BEGIN) && cur.includes(END)
    ? `${cur.slice(0, cur.indexOf(BEGIN))}${block}${cur.slice(cur.indexOf(END) + END.length)}`
    : cur.trim() ? `${cur.trimEnd()}\n\n${block}\n` : `# ${appName}\n\n${block}\n`
  const blockChanged = next !== cur
  if (blockChanged) await deps.write(`${root}/${house.blockFile}`, next)
  paths.push(house.blockFile)
  return { wrote, kept, paths, blockChanged }
}
