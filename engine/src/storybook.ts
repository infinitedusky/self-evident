/**
 * An app's Storybook, served from its own checkout so Mockups can show it inside Self Evident. The engine starts it
 * on request (the app's `storybook_cmd`, in its local checkout) and keeps it running; it is told apart from a
 * Storybook someone else started by simply asking the URL.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo } from './db/schema.js'
import { PlanError } from './projects.js'

const running = new Map<string, { proc: ChildProcess; startedAt: Date; log: string[] }>()

async function setupOf(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const [r] = await db.select().from(repo).where(eq(repo.appId, appId))
  const s = (a.setup ?? {}) as { storybook_url?: string; storybook_cmd?: string }
  return { a, cwd: r?.localPath ?? null, url: s.storybook_url ?? null, cmd: s.storybook_cmd ?? null }
}

const answers = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok || r.status < 500).catch(() => false)

export async function storybookStatus(appId: string) {
  const { url, cmd, cwd } = await setupOf(appId)
  const mine = running.get(appId)
  return { url, configured: !!url, startable: !!(cmd && cwd), up: url ? await answers(url) : false, startedHere: !!mine && mine.proc.exitCode === null, log: mine?.log.slice(-20) ?? [] }
}

export async function startStorybook(appId: string) {
  const { a, url, cmd, cwd } = await setupOf(appId)
  if (!url || !cmd || !cwd) throw new PlanError(`${a.name} has no Storybook command; set it in Settings`)
  if (await answers(url)) return storybookStatus(appId)
  const mine = running.get(appId)
  if (mine && mine.proc.exitCode === null) return storybookStatus(appId)
  const proc = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, BROWSER: 'none', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: false })
  const log: string[] = []
  const keep = (b: Buffer) => { for (const line of b.toString().split('\n')) if (line.trim()) log.push(line.slice(0, 300)); if (log.length > 200) log.splice(0, log.length - 200) }
  proc.stdout?.on('data', keep); proc.stderr?.on('data', keep)
  running.set(appId, { proc, startedAt: new Date(), log })
  return storybookStatus(appId)
}

/**
 * The app's stories, from its running Storybook's own index: each one's id (what opens it), the component or page
 * it belongs to, and its name. `match` keeps those whose id, title or name contains it (any case).
 */
export async function listStories(appId: string, match?: string) {
  const { a, url } = await setupOf(appId)
  if (!url) throw new PlanError(`${a.name} has no Storybook set; add its URL in Settings`)
  const res = await fetch(`${url.replace(/\/$/, '')}/index.json`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
  if (!res?.ok) throw new PlanError(`${a.name}'s Storybook is not answering at ${url}; opening the storybook tab offers to start it`)
  const index = (await res.json()) as { entries?: Record<string, { id: string; type?: string; title: string; name: string }> }
  const q = match?.toLowerCase()
  return Object.values(index.entries ?? {})
    .filter((e) => (e.type ?? 'story') === 'story')
    .map((e) => ({ id: e.id, title: e.title, name: e.name }))
    .filter((e) => !q || `${e.id} ${e.title} ${e.name}`.toLowerCase().includes(q))
    .slice(0, 200)
}

export function stopStorybooks() { for (const [, m] of running) m.proc.kill('SIGTERM'); running.clear() }
