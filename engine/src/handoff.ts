/**
 * Moving between Macs (Sandy, 2026-11-11: "a command to sync everything, that way I can move back and forth between
 * laptops"). The data is already in one place (the database, LOG.md "The database moves to Fly") and so are the
 * settings (Doppler). What a Mac still holds by itself is the work in each open conversation's worktree and the
 * conversations' histories, which Claude Code keeps in the home folder. `leave` sends both out; `arrive` brings both
 * in:
 *
 * - a worktree's work goes through the app's own GitHub repository: anything uncommitted is committed as work in
 *   progress, and the branch is pushed. On the other Mac the checkout is cloned if it's missing and the worktree is
 *   made again from the branch, at the same path (the database stores paths, so both Macs use the same ones);
 * - the histories go through a private repository (STATE_REPO), kept in ~/.self-evident/state: each conversation's
 *   session file, and the memory Claude Code keeps beside each app's checkout;
 * - the same repository says which Mac holds the engine. Two engines on one database would both schedule and build,
 *   so `arrive` refuses while another Mac holds it, and `leave` lets go.
 *
 * Nothing here knows about the database or launchd: cli/handoff.ts reads the plan and starts and stops the engine.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { branchExists, commitAll, git, hasUncommitted, worktreeExists } from './git.js'
import { projectsDir, sessionDir } from './terminal.js'

/** An app's main checkout. */
export interface Checkout { name: string; fullName: string | null; localPath: string; defaultBranch: string }
/** Where one open conversation works: its worktree and branch (none when it works in the main checkout), and its session. */
export interface Place { name: string; repo: string; path: string | null; branch: string | null; cwd: string | null; agentSessionId: string | null }
export interface Plan { checkouts: Checkout[]; places: Place[] }

export interface Options {
  host: string
  stateDir: string
  stateRepo: string
  /** Branches to leave alone. */
  except?: string[]
  /** Arrive although another Mac holds the engine. */
  force?: boolean
  /** Where a repository is cloned from; GitHub unless a test says otherwise. */
  cloneUrl?: (fullName: string) => string
  log?: (line: string) => void
}

export const WIP = (host: string) => `Handoff: work in progress, from ${host}`
const MAX_FILE = 95 * 1024 * 1024 // GitHub refuses a file over 100 MB

export interface Holder { holder: string | null; by: string; at: string }
const holderFile = (stateDir: string) => join(stateDir, 'holder.json')
export function readHolder(stateDir: string): Holder | null {
  try { return JSON.parse(readFileSync(holderFile(stateDir), 'utf8')) as Holder } catch { return null }
}

/** The state repository, cloned or brought up to date. */
export async function openState(o: Pick<Options, 'stateDir' | 'stateRepo'>): Promise<void> {
  if (!existsSync(join(o.stateDir, '.git'))) {
    mkdirSync(dirname(o.stateDir), { recursive: true })
    await git(dirname(o.stateDir), ['clone', '-q', o.stateRepo, o.stateDir])
    return
  }
  await git(o.stateDir, ['pull', '-q', '--ff-only'], { allowFail: true }) // nothing to pull from a repository with no commits yet
}

async function saveState(stateDir: string, message: string): Promise<void> {
  await git(stateDir, ['add', '-A'])
  if ((await git(stateDir, ['status', '--porcelain'])).stdout !== '') await git(stateDir, ['commit', '-q', '-m', message])
  if ((await git(stateDir, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true })).code === 0) await git(stateDir, ['push', '-q', '-u', 'origin', 'HEAD'])
}

/** What Claude Code keeps for this plan, as [folder under projects/, file or folder in it]: each session's file and side folder, each checkout's memory. */
function kept(plan: Plan): [string, string][] {
  const out: [string, string][] = []
  for (const p of plan.places) if (p.cwd && p.agentSessionId) for (const f of [`${p.agentSessionId}.jsonl`, p.agentSessionId]) out.push([sessionDir(p.cwd), f])
  for (const c of plan.checkouts) out.push([sessionDir(c.localPath), 'memory'])
  return out
}

const tooBig = (path: string): boolean => {
  const st = statSync(path)
  return st.isDirectory() ? readdirSync(path).some((f) => tooBig(join(path, f))) : st.size > MAX_FILE
}

export interface Line { name: string; what: string; ok: boolean }

/**
 * Sends this Mac's work out: every conversation's worktree committed and pushed, the histories into the state
 * repository, and the engine let go. A branch that can't be pushed is reported and the rest goes on.
 */
export async function leave(plan: Plan, o: Options): Promise<Line[]> {
  const lines: Line[] = []
  const say = (l: Line) => { lines.push(l); o.log?.(`${l.ok ? '✓' : '✗'} ${l.name}: ${l.what}`) }
  const seen = new Set<string>()
  for (const p of plan.places) {
    if (!p.path || !p.branch || seen.has(p.path)) continue
    seen.add(p.path)
    if (!existsSync(p.path)) { say({ name: p.name, what: `no worktree on this Mac (${p.branch})`, ok: true }); continue }
    if (!plan.checkouts.find((c) => c.localPath === p.repo)?.fullName) { say({ name: p.name, what: `its app has no GitHub repository in Self Evident, so ${p.branch} stays on this Mac`, ok: false }); continue }
    if (o.except?.includes(p.branch)) { say({ name: p.name, what: `${p.branch} left alone, as asked: it stays on this Mac`, ok: false }); continue }
    try {
      const wip = await hasUncommitted(p.path)
      if (wip) await commitAll(p.path, WIP(o.host))
      const before = (await git(p.path, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${p.branch}`], { allowFail: true })).stdout
      await git(p.path, ['push', '-q', '-u', 'origin', p.branch])
      const head = (await git(p.path, ['rev-parse', 'HEAD'])).stdout
      say({ name: p.name, what: `${p.branch} ${before === head ? 'already on GitHub' : 'pushed'}${wip ? ', with its uncommitted work committed' : ''}`, ok: true })
    } catch (e) { say({ name: p.name, what: `${p.branch} not pushed: ${(e as Error).message.split('\n')[0]}`, ok: false }) }
  }
  for (const c of plan.checkouts) { // the main checkouts are the person's: reported, never committed or pushed for them
    if (!existsSync(join(c.localPath, '.git'))) continue
    const dirty = await hasUncommitted(c.localPath)
    const ahead = (await git(c.localPath, ['rev-list', '--count', '@{u}..HEAD'], { allowFail: true })).stdout
    if (dirty || (ahead && ahead !== '0')) say({ name: c.name, what: `the main checkout has ${[dirty && 'uncommitted files', ahead && ahead !== '0' && `${ahead} unpushed commits`].filter(Boolean).join(' and ')}: not moved`, ok: false })
  }

  await openState(o)
  let files = 0
  for (const [dir, f] of kept(plan)) {
    const from = join(dir, f)
    if (!existsSync(from)) continue
    if (tooBig(from)) { say({ name: f, what: 'history over 95 MB: GitHub would refuse it, so it stays on this Mac', ok: false }); continue }
    const to = join(o.stateDir, 'claude', dir.slice(projectsDir().length + 1), f)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true, force: true })
    files++
  }
  writeFileSync(holderFile(o.stateDir), JSON.stringify({ holder: null, by: o.host, at: new Date().toISOString() } satisfies Holder, null, 2) + '\n')
  await saveState(o.stateDir, `Left ${o.host}`)
  say({ name: 'histories', what: `${files} sent`, ok: true })
  return lines
}

/** Whether this Mac may take the engine: nobody holds it, or it does already. */
export function mayArrive(holder: Holder | null, host: string): boolean {
  return !holder?.holder || holder.holder === host
}

/**
 * Brings the work in: each app's checkout cloned or fetched, each conversation's worktree made from its branch, the
 * histories put where Claude Code looks, and the engine taken. Refuses while another Mac holds the engine.
 */
export async function arrive(plan: Plan, o: Options): Promise<Line[]> {
  const lines: Line[] = []
  const say = (l: Line) => { lines.push(l); o.log?.(`${l.ok ? '✓' : '✗'} ${l.name}: ${l.what}`) }
  await openState(o)
  const holder = readHolder(o.stateDir)
  if (!mayArrive(holder, o.host) && !o.force) throw new Error(`${holder!.holder} still holds the engine (since ${holder!.at}). Run \`pnpm leave\` there first, or \`pnpm arrive --force\` if that Mac is gone.`)
  const fresh = holder?.holder !== o.host // this Mac was away: what the state repository has is newer than what's here

  const url = o.cloneUrl ?? ((fullName: string) => `https://github.com/${fullName}.git`)
  for (const c of plan.checkouts) {
    try {
      if (!existsSync(c.localPath)) {
        if (!c.fullName) { say({ name: c.name, what: `no checkout at ${c.localPath} and no GitHub repository to clone it from`, ok: false }); continue }
        mkdirSync(dirname(c.localPath), { recursive: true })
        await git(dirname(c.localPath), ['clone', '-q', url(c.fullName), c.localPath])
        say({ name: c.name, what: `cloned to ${c.localPath}`, ok: true })
        continue
      }
      if (!c.fullName || (await git(c.localPath, ['remote'], { allowFail: true })).stdout === '') continue // only a repository Self Evident was given is fetched
      await git(c.localPath, ['fetch', '-q', '--prune', 'origin'])
      const on = (await git(c.localPath, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true })).stdout
      if (on === c.defaultBranch && !(await hasUncommitted(c.localPath))) await git(c.localPath, ['merge', '-q', '--ff-only', `origin/${c.defaultBranch}`], { allowFail: true })
      say({ name: c.name, what: 'up to date with GitHub', ok: true })
    } catch (e) { say({ name: c.name, what: (e as Error).message.split('\n')[0], ok: false }) }
  }

  const seen = new Set<string>()
  for (const p of plan.places) {
    if (!p.path || !p.branch || seen.has(p.path)) continue
    seen.add(p.path)
    try {
      if (!existsSync(join(p.repo, '.git'))) { say({ name: p.name, what: 'its app has no checkout here', ok: false }); continue }
      const remote = (await git(p.repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${p.branch}`], { allowFail: true })).code === 0
      if (!existsSync(p.path) || !(await worktreeExists(p.repo, p.path))) {
        if (!remote && !(await branchExists(p.repo, p.branch))) { say({ name: p.name, what: `${p.branch} isn't on GitHub: it was never sent from the other Mac`, ok: false }); continue }
        await git(p.repo, ['worktree', 'prune'])
        await git(p.repo, (await branchExists(p.repo, p.branch)) ? ['worktree', 'add', '-q', p.path, p.branch] : ['worktree', 'add', '-q', '--track', '-b', p.branch, p.path, `origin/${p.branch}`])
        say({ name: p.name, what: `worktree made from ${p.branch}`, ok: true })
        continue
      }
      if (!remote) { say({ name: p.name, what: `${p.branch} is only on this Mac`, ok: true }); continue }
      if (await hasUncommitted(p.path)) { say({ name: p.name, what: 'has uncommitted work here: left as it is', ok: false }); continue }
      const r = await git(p.path, ['merge', '-q', '--ff-only', `origin/${p.branch}`], { allowFail: true })
      say(r.code === 0 ? { name: p.name, what: `${p.branch} up to date`, ok: true } : { name: p.name, what: `${p.branch} here and on GitHub have gone different ways: left as it is`, ok: false })
    } catch (e) { say({ name: p.name, what: (e as Error).message.split('\n')[0], ok: false }) }
  }

  const from = join(o.stateDir, 'claude')
  if (fresh && existsSync(from)) { cpSync(from, projectsDir(), { recursive: true, force: true }); say({ name: 'histories', what: 'brought in', ok: true }) }
  writeFileSync(holderFile(o.stateDir), JSON.stringify({ holder: o.host, by: o.host, at: new Date().toISOString() } satisfies Holder, null, 2) + '\n')
  await saveState(o.stateDir, `Arrived on ${o.host}`)
  return lines
}
