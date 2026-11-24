/**
 * A task's review copy: a branch a reviewer checks out and starts with one command, to run the change on made-up
 * data with nothing real in it (docs/reviewable-prs-brief.md, step 5; LOG.md, "A review copy, made by hand for
 * CEB-90", whose six steps this does).
 *
 * The branch is the pull request's branch at its pushed head plus ONE commit that adds one folder, `review/`. It is
 * made again whole each time (never added to), so GitHub's comparison of the two branches always shows only added
 * files, all in that folder: that comparison is the reviewer's proof that what they run is what would merge. It is
 * only a branch, never merged, with no pull request of its own, named so it is found beside the pull request's:
 * `REVIEW-<the pull request's branch, the task's id moved to the end>` (Sandy, 2026-11-23).
 *
 * What is in the folder:
 * - the app's own part, copied from a folder on this computer the app names (`setup.review.kit`): its start and
 *   stop commands, what it layers over the app's own way of starting, a sign-in for a reviewer. Evident does not
 *   know how an app starts; the kit does. `{{ticket}}`, `{{project}}`, `{{pr}}`, `{{branch}}` and
 *   `{{review_branch}}` are filled in its text files. `kit.json` describes it and is not copied.
 * - `mocks/<service>/`: each outside service's mock server and, in `data/`, what a reviewer is served
 *   (mock-serve.ts, the faked form: never a real response).
 * - `mocks.env`: each service's settings pointing at its mock, with a key that is not one.
 * - `mocks.compose.yml`: the mocks as Compose services, for a kit that starts the app with Compose.
 * - `files/`: the fake versions of the task's test files.
 * - `fixture.sql`: the fixture chosen when the copy is made (Sandy: "we should define when we create the review
 *   branch what fixture it uses"). None chosen: the kit starts empty.
 * - `README.md`, and `made.json`: what it was made from, which is also where its state is read back from. Nothing
 *   about a review copy is kept in Evident's own database: the branch says.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { commitRule, ticketOf } from './conventions.js'
import { db } from './db/client.js'
import { app, mock, pr as prTable, scenario } from './db/schema.js'
import { appendEvent } from './events.js'
import { git } from './git.js'
import { getIssue, identifier, PlanError } from './issues.js'
import { GENERAL_CMD, generalFiles, servedBy } from './mock-general.js'
import { plansFor } from './mock-places.js'
import { served } from './mock-serve.js'
import { connectionOf } from './mocks.js'
import { scenarioTables, type Tables } from './prototype-data.js'
import { placeTestFiles } from './test-files.js'
import { teamTicket } from './ticket.js'
import { homeRepo } from './workbench.js'

export const MOCK_PORT = 8080
export const NOT_A_KEY = 'review-copy-not-a-key'
export const TRY_MAX = 4000

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `REVIEW-` up front, then the pull request's branch with the task's id moved to the end. */
export function reviewBranch(prBranch: string, taskId: string): string {
  const rest = prBranch.replace(new RegExp(`(^|[-_/])${escape(taskId)}(?=$|[-_/])`, 'i'), '$1').replace(/([-_/])[-_/]+/g, '$1').replace(/^[-_/]+|[-_/]+$/g, '')
  return `REVIEW-${rest ? `${rest}-` : ''}${taskId}`
}

// ---- the mocks, as a reviewer's computer runs them -----------------------------------------------------------------------

export interface ReviewMock { key: string; name: string; /** What serves it, run in its folder. */ cmd: string; /** The app's settings that point at it, as the service holds them ({url} where its address goes). */ env: Record<string, string>; /** Its server. */ files: Record<string, string>; /** What it answers with: faked or provided, never real. */ data: Record<string, string> }
export const mockHost = (key: string) => `${key}-mock`
const imageOf = (m: Pick<ReviewMock, 'name' | 'cmd'>) => {
  if (/^\s*python3?\b/.test(m.cmd)) return 'python:3.12-alpine'
  if (/^\s*node\b/.test(m.cmd)) return 'node:22-alpine'
  throw new PlanError(`${m.name}'s mock is started with "${m.cmd}", and a review copy only knows how to run one started with python or node`)
}
/** Each service's settings, pointing at its mock inside the review copy, with a key that is not one. */
export function mocksEnv(mocks: ReviewMock[]): string {
  const lines = ['# Made by Evident. Every outside service of the review copy, pointed at its mock; the keys are not keys.']
  for (const m of mocks) {
    const c = connectionOf({ upstream: null, env: m.env })
    for (const [k, v] of Object.entries(m.env)) lines.push(`${k}=${k === c.keySetting ? NOT_A_KEY : v.replace(/\{(container_url|url)\}/g, `http://${mockHost(m.key)}:${MOCK_PORT}`)}`)
  }
  return lines.join('\n') + '\n'
}
/** The mocks as Compose services. The kit's start command sets REVIEW_DIR to the review folder; REVIEW_DATA, when set, is where the data is read from when it is not kept on the branch. */
export function mocksCompose(mocks: ReviewMock[]): string {
  const out = ['# Made by Evident: one service for each outside service the app calls, answering with made-up data.', '# Layer it over the app\'s own Compose file, with REVIEW_DIR set to this folder (review/start.sh does both).', 'services:']
  for (const m of mocks) out.push(
    `  ${mockHost(m.key)}:`, `    image: ${imageOf(m)}`, '    working_dir: /mock', `    command: ["sh", "-c", ${JSON.stringify(m.cmd)}]`,
    '    environment:', `      PORT: "${MOCK_PORT}"`, '      MOCK_DATA: /mock/data', '      PYTHONUNBUFFERED: "1"',
    '    volumes:', `      - \${REVIEW_DIR:?start it with the review folder's start command}/mocks/${m.key}:/mock:ro`, `      - \${REVIEW_DATA:-\${REVIEW_DIR}/mocks}/${m.key}/data:/mock/data:ro`)
  if (!mocks.length) out.push('  {}')
  return out.join('\n').replace('services:\n  {}', 'services: {}') + '\n'
}

// ---- the fixture, as a file a database loads ----------------------------------------------------------------------------

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`
/** A fixture's rows as SQL for a database that already has the app's schema: what prototype-data.ts's load does, written down. */
export function fixtureSql(name: string, tables: Tables): string {
  const out = [`-- The fixture "${name}", from Evident: made-up rows for a database that already has the app's tables.`, 'begin;', "set local session_replication_role = 'replica';"]
  for (const t of Object.keys(tables).sort()) {
    const rows = tables[t]
    if (!rows.length) continue
    const json = JSON.stringify(rows)
    let tag = 'fx'; while (json.includes(`$${tag}$`)) tag += 'x'
    out.push(`insert into ${ident(t)} select * from jsonb_populate_recordset(null::${ident(t)}, $${tag}$${json}$${tag}$::jsonb) on conflict do nothing;`)
  }
  out.push('commit;',
    '-- Serial columns move past the rows just loaded.',
    "do $seq$ declare r record; begin for r in select c.table_name t, c.column_name col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) seq from information_schema.columns c where c.table_schema = 'public' and pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) is not null loop execute format('select setval(%L, coalesce((select max(%I) from %I), 1))', r.seq, r.col, r.t); end loop; end $seq$;")
  return out.join('\n') + '\n'
}

// ---- the app's own part ------------------------------------------------------------------------------------------------------

export interface Kit {
  dir: string
  /** The one command, from the repository's root. */ start: string
  /** Its undo. */ stop: string | null
  /** What a reviewer needs, where it opens and who they are signed in as: a few sentences. */ about: string
  /** What the copy cannot show, beyond the real services themselves. */ cannot: string[]
  /** What each of its files is, for the reader: name (or names) to a line. */ files: Record<string, string>
}
export const kitDirOf = (setup: unknown): string | null => ((setup as { review?: { kit?: string } } | null)?.review?.kit ?? '').trim() || null
export interface Vars { ticket: string; task: string; project: string; pr: string; branch: string; review_branch: string; /** The fixture its database starts from; empty: none. */ fixture?: string }
const fillVars = (text: string, v: Vars) => text.replace(/\{\{(\w+)\}\}/g, (all, k: string) => (v as unknown as Record<string, string>)[k] ?? all)
/** The app's kit, read from its folder with the task's names filled in. */
export function readKit(dir: string, v: Vars): Kit {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new PlanError(`the app's review kit is not at ${dir}`)
  let j: Partial<Kit> = {}
  if (existsSync(join(dir, 'kit.json'))) { try { j = JSON.parse(fillVars(readFileSync(join(dir, 'kit.json'), 'utf8'), v)) as Partial<Kit> } catch (err) { throw new PlanError(`the review kit's kit.json could not be read: ${(err as Error).message}`) } }
  return { dir, start: String(j.start ?? './review/start.sh'), stop: j.stop ? String(j.stop) : null, about: String(j.about ?? '').trim(), cannot: Array.isArray(j.cannot) ? j.cannot.map(String) : [], files: (j.files && typeof j.files === 'object' ? j.files : {}) as Record<string, string> }
}
/** The kit's files into the review folder: text with the task's names filled in, anything else as it is, modes kept. */
function copyKit(kit: Kit, out: string, v: Vars) {
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n), rel = relative(kit.dir, p)
      if (rel === 'kit.json' || n === '.DS_Store' || n === '.git') continue
      if (statSync(p).isDirectory()) { walk(p); continue }
      const to = join(out, rel)
      mkdirSync(join(to, '..'), { recursive: true })
      const bytes = readFileSync(p)
      if (bytes.includes(0)) cpSync(p, to); else writeFileSync(to, fillVars(bytes.toString('utf8'), v), { mode: statSync(p).mode })
    }
  }
  walk(kit.dir)
}

// ---- what a reviewer reads -------------------------------------------------------------------------------------------------

export interface Made {
  by: 'Evident'
  /** Our task, and the team's ticket where it has one. */ task: string; ticket: string
  /** The pull request it goes with. */ pr: number | null; branch: string; reviewBranch: string
  /** The pull request's commit it was made from. */ from: string
  /** The fixture its database starts from. None: it starts empty. */ fixture: string | null
  /** What to try, as the person wrote it: one step a line. */ try: string
  services: { key: string; name: string; files: number }[]; files: string[]
  at: string
}
const steps = (text: string) => text.split('\n').map((l) => l.replace(/^\s*(?:[-*]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/, '').trim()).filter(Boolean)
/** Two plain commands (Sandy, 2026-11-23): a reviewer's clone is an ordinary one, where checking out a branch it has not got makes it from origin's. */
const checkout = (b: string) => `git fetch origin\ngit checkout ${b}`
/** The branch is made again whole when the pull request moves, so one checked out before does not follow by a pull. */
const again = (b: string) => `Had it checked out before? It is made again when the pull request moves, so take it afresh: \`git fetch origin && git checkout -B ${b} origin/${b}\`.`
const servicesSay = (m: Made) => (m.services.length ? m.services.map((s) => s.name).join(', ') : null)

/** The folder's README: how to start it, what to try, what is real (nothing), what is in it. */
export function readme(m: Made, kit: Kit, title: string): string {
  const table: [string, string][] = [
    ...Object.entries(kit.files),
    ...m.services.map((s): [string, string] => [`\`mocks/${s.key}/\``, `${s.name}'s mock: its server and its made-up data`]),
    ...(m.services.length ? [['`mocks.env`, `mocks.compose.yml`', 'Each outside service pointed at its mock, with a key that is not one'] as [string, string]] : []),
    ...(m.files.length ? [['`files/`', `What to bring to it: ${m.files.map((f) => `\`${f}\``).join(', ')} (made up)`] as [string, string]] : []),
    ...(m.fixture ? [['`fixture.sql`', `The made-up rows its database starts from (the fixture "${m.fixture}")`] as [string, string]] : []),
    ['`made.json`', 'What this copy was made from'],
  ]
  return [
    `# Review copy of ${m.ticket}${m.pr ? ` (pull request #${m.pr})` : ''}`,
    `${title ? `${title}\n\n` : ''}This branch is the pull request's branch at \`${m.from.slice(0, 9)}\` plus this \`review/\` folder. It exists so a reviewer can run the change. **It is never merged**: it carries a sign-in for a reviewer and made-up data.`,
    '## Start it', '```\n' + checkout(m.reviewBranch) + '\n' + kit.start + '\n```',
    [kit.about, kit.stop ? `\`${kit.stop}\` removes it.` : ''].filter(Boolean).join(' '),
    again(m.reviewBranch),
    ...(steps(m.try).length ? ['## What to try', steps(m.try).map((s, i) => `${i + 1}. ${s}`).join('\n')] : []),
    '## What is real here',
    `Nothing. ${servicesSay(m) ? `${servicesSay(m)} ${m.services.length === 1 ? 'is' : 'are'} answered by ${m.services.length === 1 ? 'a mock' : 'mocks'} in this copy (\`review/mocks/\`) from made-up data: where it was made from a real response, the shape is real and every name, address, link, date and sentence is invented. The real ${m.services.length === 1 ? 'service is' : 'services are'} never called, whatever your own settings hold: the copy sets its own address${m.services.length === 1 ? '' : 'es'} and a key that is not one.` : 'It calls no outside service.'}${m.fixture ? ` Its database starts from the fixture "${m.fixture}", which is made up.` : ' Its database starts empty.'}`,
    '## What is in this folder', ['| File | What it is |', '|---|---|', ...table.map(([f, w]) => `| ${/`/.test(f) ? f : f.split(/,\s*/).map((x) => `\`${x}\``).join(', ')} | ${w} |`)].join('\n'),
    'Made by Evident. It is made again, whole, when the pull request\'s branch moves.',
  ].filter(Boolean).join('\n\n') + '\n'
}

/**
 * The pull request's "Review" section (Sandy, 2026-11-23: "a section called review, and under that we have run it
 * yourself, and then below that how the review copy works, which is collapsed by default").
 */
export function reviewSection(m: Made, kit: Kit, repo: string): string {
  const compare = `https://github.com/${repo}/compare/${m.branch}...${m.reviewBranch}`
  const adds: [string, string][] = [
    ...Object.entries(kit.files).map(([f, w]): [string, string] => [f.split(/,\s*/).map((x) => `\`review/${x}\``).join(', '), w]),
    ...m.services.map((s): [string, string] => [`\`review/mocks/${s.key}/\``, `A mock of ${s.name} and its made-up data, so the real one is never called and no key is needed`]),
    ...(m.files.length ? [['`review/files/`', `What to bring to it (${m.files.map((f) => `\`${f}\``).join(', ')}), made up`] as [string, string]] : []),
    ...(m.fixture ? [['`review/fixture.sql`', `The made-up rows its database starts from (the fixture "${m.fixture}")`] as [string, string]] : []),
  ]
  const cannot = [...m.services.map((s) => `The real ${s.name}: its latency, its failures, and anything its real answers hold that the made-up ones do not.`), ...kit.cannot]
  return [
    '## Review',
    '### Run it yourself',
    `A review copy of this pull request runs the change on your machine: this branch plus a \`review/\` folder (never merged)${servicesSay(m) ? `, with ${servicesSay(m)} answered by ${m.services.length === 1 ? 'a mock' : 'mocks'} on made-up data` : ''}.`,
    '```\n' + checkout(m.reviewBranch) + '\n' + kit.start + '\n```',
    [kit.about, kit.stop ? `\`${kit.stop}\` removes it.` : ''].filter(Boolean).join(' '),
    steps(m.try).map((s) => `- [ ] ${s}`).join('\n'),
    `<details>\n<summary><b>How the review copy works</b>, and why what you run is what would merge</summary>\n\n${[
      `**It is this pull request's code.** \`${m.reviewBranch}\` is this branch at \`${m.from.slice(0, 9)}\` plus one commit that adds one folder, \`review/\`. [GitHub's comparison of the two branches](${compare}) shows it: only added files, all in that folder. Not one line of the app differs, so what you run is what would merge. The app is pointed at the mock${m.services.length === 1 ? '' : 's'} by settings alone.`,
      `**What the folder adds, and why:**\n\n| Added | Why it is needed |\n|---|---|\n${adds.map(([f, w]) => `| ${f} | ${w} |`).join('\n')}`,
      `**What it cannot show:**\n\n${cannot.map((c) => `- ${c}`).join('\n')}`,
      `**Kept in step.** The review branch is made again, whole, from this branch's head whenever this pull request moves on. ${again(m.reviewBranch)} It is never merged and has no pull request of its own. Nothing real is in it: where the made-up data came from a real response, every value was replaced and checked against the original before it left the computer it was made on.`,
    ].join('\n\n')}\n\n</details>`,
  ].filter(Boolean).join('\n\n')
}

// ---- making it ---------------------------------------------------------------------------------------------------------------

const madeRef = (b: string) => `refs/evident/review/${b}`
const remoteRef = (b: string) => `refs/remotes/origin/${b}`
const shaOf = async (repo: string, ref: string) => { const r = await git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true }); return r.code === 0 ? r.stdout.trim() : null }

async function context(issueId: string) {
  const t = await getIssue(db, issueId)
  if (t.parentId) throw new PlanError('a review copy is a task\'s, not a sub-task\'s')
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const r = await homeRepo(t.appId)
  const rows = t.projectId ? await db.select().from(prTable).where(eq(prTable.projectId, t.projectId)) : []
  const row = rows.find((q) => q.issueId === t.id) ?? rows.find((q) => !q.issueId) ?? null
  const task = identifier(a.key, t.number)
  const ticket = (await teamTicket(t))?.ticket ?? ticketOf({ identifier: task, sourceRef: t.sourceRef })
  const branch = row?.headBranch ?? null
  const review = branch ? reviewBranch(branch, task) : null
  const vars: Vars | null = branch && review ? { ticket, task, project: `${ticket.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-review`, pr: row?.number ? String(row.number) : '', branch, review_branch: review, fixture: '' } : null
  return { t, a, r, row, task, ticket, branch, review, vars, title: (t as { teamTitle?: string | null }).teamTitle || t.title }
}

async function readMade(repo: string, sha: string): Promise<Made | null> {
  const r = await git(repo, ['show', `${sha}:review/made.json`], { allowFail: true })
  if (r.code !== 0) return null
  try { return JSON.parse(r.stdout) as Made } catch { return null }
}

export interface ReviewCopy {
  /** The branch a reviewer checks out. Null: the task has no pull request yet. */ branch: string | null
  /** The pull request's branch and its pushed head. */ pr: { branch: string; head: string | null; number: number | null } | null
  /** It exists: as last made here, and whether GitHub has that. */ made: (Made & { sha: string; pushed: boolean; /** It holds the pull request's head: a reviewer runs what would merge now. */ inStep: boolean }) | null
  /** A branch of that name exists that Evident did not make (made by hand): making it replaces it. */ byHand: boolean
  /** GitHub's comparison of the two branches. */ compare: string | null
  /** The app's kit. Null: the app has none, and no review copy can be made. */ kit: { dir: string; start: string } | null
  /** The fixtures it may start from: never one that holds something real. */ fixtures: string[]
  /** What it would hold now: each service and whether a reviewer can be given it, and the files. */ services: { key: string; name: string; says: string; blocked: string | null }[]
  /** Why it cannot be made as things stand. Empty: it can. */ waits: string[]
}

/** Where a task's review copy stands. Nothing is fetched or written unless `fresh`, which asks GitHub first. */
export async function reviewCopy(issueId: string, o: { fresh?: boolean } = {}): Promise<ReviewCopy> {
  const c = await context(issueId)
  const waits: string[] = []
  const kitDir = kitDirOf(c.a.setup)
  let kit: Kit | null = null
  if (!kitDir) waits.push('This app has no review kit: the folder that holds its own part of a review copy (how it starts, a sign-in for a reviewer). Name it in the app\'s settings as review.kit.')
  else if (c.vars) { try { kit = readKit(kitDir, c.vars) } catch (err) { waits.push(String((err as Error).message)) } }
  if (!c.r?.localPath) waits.push('This app\'s repository is not on this computer.')
  if (!c.branch || !c.review) waits.push('The task has no pull request yet: a review copy goes with one.')
  const { plans } = await plansFor(c.a.id, 'review', c.t.id, { dry: true })
  const services = plans.filter((p) => p.how !== 'none' || p.blocked).map((p) => ({ key: p.mock, name: p.name, says: p.says, blocked: p.blocked ?? null }))
  for (const s of services) if (s.blocked) waits.push(`${s.blocked[0].toUpperCase()}${s.blocked.slice(1)}.`)
  const fixtures = (await db.select().from(scenario).where(and(eq(scenario.appId, c.a.id), eq(scenario.scope, '')))).filter((s) => !s.real).map((s) => s.name).sort()
  const base: ReviewCopy = { branch: c.review, pr: c.branch ? { branch: c.branch, head: null, number: c.row?.number ?? null } : null, made: null, byHand: false, compare: null, kit: kit && { dir: kit.dir, start: kit.start }, fixtures, services, waits }
  if (!c.r?.localPath || !c.branch || !c.review) return base
  const repo = c.r.localPath
  if (o.fresh) await git(repo, ['fetch', '--quiet', 'origin', `+refs/heads/${c.branch}:${remoteRef(c.branch)}`, `+refs/heads/${c.review}:${remoteRef(c.review)}`], { allowFail: true })
  const head = await shaOf(repo, remoteRef(c.branch))
  if (!head) waits.push(`The pull request's branch (${c.branch}) is not on GitHub as this computer last saw it.`)
  const remote = await shaOf(repo, remoteRef(c.review)), local = await shaOf(repo, madeRef(c.review))
  const sha = local ?? remote
  const made = sha ? await readMade(repo, sha) : null
  return {
    ...base, pr: { branch: c.branch, head, number: c.row?.number ?? null },
    made: made && sha ? { ...made, sha, pushed: remote === sha, inStep: !!head && made.from === head } : null,
    byHand: !!remote && !(await readMade(repo, remote)),
    compare: c.r.fullName ? `https://github.com/${c.r.fullName}/compare/${c.branch}...${c.review}` : null,
  }
}

/**
 * The review copy made, or made again: the folder built, committed as one commit on the pull request's pushed head,
 * and (unless `push` is false) pushed over the branch of that name. Refused while anything a reviewer would be given
 * is real, or cannot be had.
 */
export async function makeReviewCopy(issueId: string, i: { /** The fixture its database starts from; null: empty. Not given: as it was last made. */ fixture?: string | null; /** What to try, a step a line. Not given: as it was last made. */ try?: string; push?: boolean } = {}, actor = 'user'): Promise<ReviewCopy> {
  const c = await context(issueId)
  const was = await reviewCopy(issueId, { fresh: true })
  const hard = was.waits
  if (hard.length) throw new PlanError(`The review copy cannot be made yet. ${hard.join(' ')}`)
  const repo = c.r!.localPath!, branch = c.branch!, review = c.review!, head = was.pr!.head!
  const fixture = i.fixture === undefined ? was.made?.fixture ?? null : i.fixture || null
  const vars: Vars = { ...c.vars!, fixture: fixture ?? '' } // the kit's own scripts are told which fixture: what they make of it is the app's business
  const kit = readKit(kitDirOf(c.a.setup)!, vars)
  const tryText = (i.try === undefined ? was.made?.try ?? '' : i.try).trim().slice(0, TRY_MAX)
  if (fixture && !was.fixtures.includes(fixture)) throw new PlanError(`"${fixture}" is not a fixture a reviewer can be given (${was.fixtures.join(', ') || 'the app has none that is made up'})`)
  if ((await git(repo, ['cat-file', '-e', `${head}:review`], { allowFail: true })).code === 0) throw new PlanError('the pull request\'s own branch already has a review/ folder, and a review copy would write over it')

  // What a reviewer is served, by each service: refused (plansFor throws) while any of it would be real.
  const { plans, pick } = await plansFor(c.a.id, 'review', c.t.id)
  const mocks: ReviewMock[] = []
  for (const p of plans) {
    if (p.how === 'none') continue
    const [m] = await db.select().from(mock).where(and(eq(mock.appId, c.a.id), eq(mock.key, p.mock)))
    const by = servedBy(m)
    if (by === 'none') continue
    const s = await served(m, pick[p.mock])
    if (s.real.length || s.unfaked.length || s.files.some((f) => f.link || f.text === undefined)) throw new PlanError(`${m.name} would answer a reviewer with a real response, which never leaves this computer`)
    if (!Object.keys(m.env ?? {}).length) throw new PlanError(`${m.name} has no setting to point the app at its mock, so a review copy would call the real one`)
    mocks.push({ key: m.key, name: m.name, cmd: by === 'written' ? m.cmd! : GENERAL_CMD, env: m.env ?? {}, files: by === 'written' ? m.files : generalFiles(m), data: Object.fromEntries(s.files.map((f) => [f.name, f.text!])) })
  }
  const tables = fixture ? await scenarioTables({ appId: c.a.id }, fixture) : null
  if (fixture && !tables) throw new PlanError(`the fixture "${fixture}" could not be read`)

  const tree = mkdtempSync(join(tmpdir(), 'review-copy-'))
  rmSync(tree, { recursive: true, force: true })
  let sha: string
  try {
    await git(repo, ['worktree', 'add', '--quiet', '--detach', tree, head])
    const out = join(tree, 'review')
    mkdirSync(out, { recursive: true })
    copyKit(kit, out, vars)
    for (const m of mocks) {
      for (const [p, t] of Object.entries(m.files)) { const f = join(out, 'mocks', m.key, p); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, t) }
      for (const [p, t] of Object.entries(m.data)) { const f = join(out, 'mocks', m.key, 'data', p); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, t) }
    }
    if (mocks.length) { writeFileSync(join(out, 'mocks.env'), mocksEnv(mocks)); writeFileSync(join(out, 'mocks.compose.yml'), mocksCompose(mocks)) }
    const placed = await placeTestFiles(c.a.id, c.t.id, 'review', join(out, 'files'))
    if (tables) writeFileSync(join(out, 'fixture.sql'), fixtureSql(fixture!, tables))
    const made: Made = { by: 'Evident', task: c.task, ticket: c.ticket, pr: c.row?.number ?? null, branch, reviewBranch: review, from: head, fixture, try: tryText, services: mocks.map((m) => ({ key: m.key, name: m.name, files: Object.keys(m.data).length })), files: placed.files.map((f) => f.name), at: new Date().toISOString() }
    writeFileSync(join(out, 'README.md'), readme(made, kit, c.title))
    writeFileSync(join(out, 'made.json'), JSON.stringify(made, null, 2) + '\n')
    await git(tree, ['add', '--force', '--', 'review'])
    const subject = `review copy of ${head.slice(0, 9)}, never merged`
    const format = commitRule(c.a.setup, { ticket: c.ticket, id: c.task }).format
    const message = format ? format.replace('{type}', 'chore').replace('{scope}', '(review)').replace('{subject}', subject).replace(/\{\w+\}/g, '') : `Review copy of ${head.slice(0, 9)}, never merged`
    await git(tree, ['commit', '--quiet', '--no-verify', '-m', message])
    sha = (await git(tree, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(repo, ['update-ref', madeRef(review), sha])
    if (i.push !== false) {
      // Over whatever is there: it is made whole each time, and nothing else is ever put on it.
      await git(repo, ['push', '--quiet', '--force', 'origin', `${sha}:refs/heads/${review}`])
      await git(repo, ['update-ref', remoteRef(review), sha])
    }
  } finally {
    await git(repo, ['worktree', 'remove', '--force', tree], { allowFail: true })
    rmSync(tree, { recursive: true, force: true })
  }
  await db.transaction((tx) => appendEvent(tx, { workspaceId: c.a.workspaceId, appId: c.a.id, projectId: c.t.projectId, issueId: c.t.id, actor, type: 'review_copy.made', payload: { branch: review, from: head, sha, fixture, services: mocks.map((m) => m.key), pushed: i.push !== false } }))
  return reviewCopy(issueId)
}

/** The Review section of a task's pull request, when it has a review copy on GitHub. Null: it has none. */
export async function reviewSectionFor(issueId: string): Promise<string | null> {
  try {
    const c = await context(issueId)
    const rc = await reviewCopy(issueId)
    const kitDir = kitDirOf(c.a.setup)
    if (!rc.made?.pushed || !kitDir || !c.vars || !c.r?.fullName) return null
    return reviewSection(rc.made, readKit(kitDir, { ...c.vars, fixture: rc.made.fixture ?? '' }), c.r.fullName)
  } catch { return null }
}

/** The pull request moved on: a review copy that exists is made again from its new head. One that does not is left to the person. */
export async function keepInStep(issueId: string): Promise<boolean> {
  const rc = await reviewCopy(issueId, { fresh: true }).catch(() => null)
  if (!rc?.made?.pushed || rc.made.inStep || rc.waits.length) return false
  await makeReviewCopy(issueId, {}, 'engine')
  return true
}
