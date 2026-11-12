/**
 * `pnpm leave`, `pnpm arrive`, `pnpm handoff check`: moving between Macs (handoff.ts). Run under Doppler (the root
 * package.json does it), which supplies DATABASE_URL, STATE_REPO and FLY_DB_APP. This file is the part that knows the
 * machine: it reads the plan from the database, keeps the database's proxy and the engine as launchd agents, and
 * stops the engine before leaving and starts it after arriving. The agents' files hold no secrets: the engine's runs
 * `doppler run -- pnpm dev`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { git, hasUncommitted } from '../git.js'
import { machineName } from '../machine.js'
import { arrive, leave, openState, readHolder, type Line, type Options, type Plan } from '../handoff.js'

const ENGINE = 'com.thedusky.self-evident'
const PROXY = 'com.thedusky.self-evident-dbproxy'
const HOST = machineName()
const DATABASE_URL = process.env.DATABASE_URL
const here = fileURLToPath(new URL('../../..', import.meta.url))

function options(extra: Partial<Options> = {}): Options {
  const stateRepo = process.env.STATE_REPO
  if (!stateRepo) throw new Error('STATE_REPO is not set: the private repository the histories travel through. Set it in Doppler (project self-evident).')
  return { host: HOST, stateDir: process.env.STATE_DIR ?? join(homedir(), '.self-evident', 'state'), stateRepo, log: (l) => console.log(l), ...extra }
}

// launchd

const which = (bin: string) => execFileSync('/usr/bin/which', [bin], { encoding: 'utf8' }).trim()
const domain = `gui/${userInfo().uid}`
const plistPath = (label: string) => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const loaded = (label: string) => { try { execFileSync('launchctl', ['print', `${domain}/${label}`], { stdio: 'ignore' }); return true } catch { return false } }
const stop = (label: string) => { if (loaded(label)) execFileSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' }) }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function plist(label: string, args: string[], o: { cwd?: string; path?: string; log: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by Self Evident (pnpm arrive). No secrets here: they come from Doppler. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${esc(a)}</string>`).join('\n')}
  </array>${o.cwd ? `\n  <key>WorkingDirectory</key><string>${esc(o.cwd)}</string>` : ''}${o.path ? `\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>${esc(o.path)}</string>\n  </dict>` : ''}
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${esc(o.log)}</string>
  <key>StandardErrorPath</key><string>${esc(o.log)}</string>
</dict>
</plist>
`
}

/** Writes the agent's file when it differs and (re)starts the agent, so a changed file takes effect. */
async function keep(label: string, body: string, restart: boolean): Promise<void> {
  const path = plistPath(label)
  const same = existsSync(path) && readFileSync(path, 'utf8') === body
  if (same && loaded(label) && !restart) return
  if (!same) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body) }
  stop(label)
  for (let i = 0; ; i++) { // bootout returns before the agent is gone, and bootstrap fails until it is
    try { execFileSync('launchctl', ['bootstrap', domain, path], { stdio: 'ignore' }); return } catch (e) { if (i >= 10) throw e }
    await new Promise((r) => setTimeout(r, 500))
  }
}

const logFile = (name: string) => join(homedir(), 'Library', 'Logs', `${name}.log`)

// the database's proxy

const listening = (port: number) => new Promise<boolean>((done) => {
  const s = connect({ host: '127.0.0.1', port })
  s.once('connect', () => { s.destroy(); done(true) }).once('error', () => done(false))
})

/** The database is on Fly behind `fly proxy` (LOG.md, "The database moves to Fly"): keeps that proxy running as an agent and waits for it. */
async function ensureProxy(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set. Put it in Doppler (project self-evident, config dev) and run this through `pnpm leave` or `pnpm arrive`.')
  const u = new URL(DATABASE_URL)
  const flyApp = process.env.FLY_DB_APP
  if (!flyApp || !['localhost', '127.0.0.1'].includes(u.hostname)) return
  const port = Number(u.port)
  await keep(PROXY, plist(PROXY, [which('fly'), 'proxy', `${port}:5432`, '-a', flyApp], { log: logFile('self-evident-dbproxy') }), false)
  for (let i = 0; i < 40 && !(await listening(port)); i++) await new Promise((r) => setTimeout(r, 500))
  if (!(await listening(port))) throw new Error(`the database's proxy isn't answering on ${port}: see ${logFile('self-evident-dbproxy')} (is \`fly\` signed in?)`)
}

// the plan

let known: { name: string; userName: string; root: string; seenAt: Date }[] = []

async function readPlan(): Promise<Plan> {
  await ensureProxy()
  const { db, pool } = await import('../db/client.js')
  const { app, prototype, repo, session } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  try {
    const { registerMachine, machines } = await import('../machine.js')
    await registerMachine()
    known = await machines()
    const apps = await db.select().from(app)
    const repos = (await db.select().from(repo)).filter((r) => r.localPath)
    const protos = await db.select().from(prototype)
    const sessions = await db.select().from(session).where(eq(session.status, 'open'))
    const checkouts = repos.map((r) => { const a = apps.find((x) => x.id === r.appId)!; return { name: a.name, fullName: r.fullName || null, localPath: r.localPath!, defaultBranch: r.baseBranch ?? a.defaultBranch } })
    const places = sessions.flatMap((s) => {
      const r = repos.find((x) => x.appId === s.appId); const a = apps.find((x) => x.id === s.appId)
      if (!r || !a) return []
      const path = s.worktreePath ?? (s.cwd && s.cwd !== r.localPath ? s.cwd : null)
      const branch = s.branch ?? protos.find((p) => p.path === path)?.branch ?? null
      return [{ name: `${a.key} · ${s.title ?? s.subject ?? s.id}`, repo: r.localPath!, path, branch, cwd: s.cwd, agentSessionId: s.agentSessionId }]
    })
    return { checkouts, places }
  } finally { await pool.end() }
}

// the engine

async function busy(): Promise<string[]> {
  try {
    const res = await fetch('http://localhost:4000/api/talks?open=1', { signal: AbortSignal.timeout(5000) })
    return ((await res.json()) as { busy?: boolean; title?: string; subject?: string; id: string }[]).filter((t) => t.busy).map((t) => t.title ?? t.subject ?? t.id)
  } catch { return [] } // no engine running here
}

/** The main checkout, where the engine runs: never a worktree. */
async function mainCheckout(): Promise<string> {
  return dirname(resolve(here, (await git(here, ['rev-parse', '--git-common-dir'])).stdout))
}

async function startEngine(): Promise<void> {
  const cwd = await mainCheckout()
  const home = homedir()
  const path = [join(home, '.local', 'bin'), join(home, '.local', 'share', 'mise', 'shims'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':')
  const args = [which('doppler'), 'run', '--project', process.env.DOPPLER_PROJECT ?? 'self-evident', '--config', process.env.DOPPLER_CONFIG ?? 'dev', '--', which('pnpm'), 'dev']
  await keep(ENGINE, plist(ENGINE, args, { cwd, path, log: logFile('self-evident') }), true)
}

const report = (lines: Line[]) => { const bad = lines.filter((l) => !l.ok); if (bad.length) console.log(`\n${bad.length} not moved; see the ✗ lines above.`) }

const program = new Command('handoff').description('Move Self Evident between Macs')

program.command('check').description('what leaving would send, without changing anything').action(async () => {
  const plan = await readPlan()
  const o = options()
  await openState(o)
  const h = readHolder(o.stateDir)
  console.log(`This Mac: ${HOST}. The engine is held by: ${h?.holder ?? 'nobody'}${h ? ` (${h.at})` : ''}.`)
  for (const m of known) console.log(`  ${m.name}: user ${m.userName}, root ${m.root}, last seen ${m.seenAt.toISOString().slice(0, 16).replace('T', ' ')}${m.name === HOST ? ' (this one)' : ''}`)
  for (const c of plan.checkouts) console.log(`${existsSync(c.localPath) ? '✓' : '✗'} ${c.name}: ${c.localPath}${existsSync(c.localPath) ? '' : ' (not here)'}`)
  const seen = new Set<string>()
  for (const p of plan.places) {
    if (!p.path || !p.branch || seen.has(p.path)) continue
    seen.add(p.path)
    if (!existsSync(p.path)) { console.log(`✗ ${p.name}: no worktree here (${p.branch})`); continue }
    const dirty = await hasUncommitted(p.path)
    const ahead = (await git(p.path, ['rev-list', '--count', `origin/${p.branch}..HEAD`], { allowFail: true }))
    console.log(`  ${p.name}: ${p.branch}${dirty ? ', uncommitted work' : ''}${ahead.code !== 0 ? ', never pushed' : ahead.stdout !== '0' ? `, ${ahead.stdout} unpushed` : ', on GitHub'}`)
  }
})

program.command('leave').description('stop the engine here and send everything out').option('--except <branch...>', 'branches to leave on this Mac').option('--force', 'leave although an agent is working')
  .action(async (a: { except?: string[]; force?: boolean }) => {
    const working = await busy()
    if (working.length && !a.force) throw new Error(`An agent is working (${working.join(', ')}). Leaving stops the engine and cuts it off: wait, or \`pnpm leave --force\`.`)
    const plan = await readPlan()
    stop(ENGINE)
    console.log('✓ engine stopped on this Mac')
    report(await leave(plan, options({ except: a.except })))
    console.log('\nOn the other Mac: pnpm arrive')
  })

program.command('arrive').description('bring everything in and start the engine here').option('--force', 'take the engine although another Mac holds it')
  .action(async (a: { force?: boolean }) => {
    const plan = await readPlan()
    report(await arrive(plan, options({ force: a.force })))
    await startEngine()
    console.log(`✓ engine started on ${HOST} (log: ${logFile('self-evident')})`)
  })

program.parseAsync().catch((e) => { console.error(`\n${(e as Error).message}`); process.exit(1) })
