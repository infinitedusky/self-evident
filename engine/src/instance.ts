/**
 * Two Evidents on one computer, and the way from one to the other (Sandy, 2026-11-25: "Evident can have a remote
 * database or local. I have some ones that have remote. Can I have them on the same Evident version and switch
 * between them?" and "we can create a button to switch between the 2").
 *
 * An engine reads one database, chosen when it starts, and that stays so: a second database is a second engine and a
 * second page, from the same checkout, on ports of their own (`pnpm local`: the engine on 4001, the page on 5181).
 * Each keeps its own apps running, and what is in the computer's own database stays there. Neither knows the other's
 * data. All one knows of the other is where its engine would be, and it asks there whether it is up and what it is
 * called, so the page can offer the way across.
 *
 * Which is which is told by the database: the checkout's own container is "This computer", anything else "Shared"
 * (EVIDENT_NAME says otherwise). Two engines that turn out to be on one database is the thing that must not happen
 * (both would schedule and build), so each says a mark of its database and the page says so when they match.
 */
import { createHash } from 'node:crypto'
import { DATABASE_URL, isLocalDatabase } from './db/client.js'

export interface Instance {
  name: string
  /** Its database: this computer's own, or one reached from several computers. */ kind: 'local' | 'shared'
  /** Where its page is opened. */ url: string
  /** A mark of its database (never its address or password): the same on two engines means one database. */ database: string
  /** It was started to run beside another (`pnpm local`). */ beside: boolean
}
export type Other =
  | { up: true; name: string; kind: Instance['kind']; url: string; /** Both engines are on one database. */ same: boolean }
  | { up: false; name: string; kind: Instance['kind']; /** What starts it, in the Evident folder. */ start: string }

const DEFAULT_ENGINE = 4000, BESIDE_ENGINE = 4001, DEFAULT_PAGE = 5180
export const enginePort = (env = process.env) => Number(env.PORT ?? DEFAULT_ENGINE)
/** The page's port (app/vite.config.ts reads the same variable). */
export const pagePort = (env = process.env) => Number(env.UI_PORT ?? DEFAULT_PAGE)
/** The page's address as people open it. */
export const pageUrl = (env = process.env) => env.UI_URL ?? `http://localhost:${pagePort(env)}`

/** A mark of a database: who serves it and its name, hashed. The user and password are not in it. */
export function databaseMark(url = DATABASE_URL): string {
  try { const u = new URL(url); return createHash('sha256').update(`${u.hostname}:${u.port}${u.pathname}`).digest('hex').slice(0, 12) } catch { return 'unknown' }
}

export function thisInstance(env = process.env, url = DATABASE_URL): Instance {
  const kind = isLocalDatabase(url) ? 'local' : 'shared'
  return { name: env.EVIDENT_NAME?.trim() || (kind === 'local' ? 'This computer' : 'Shared'), kind, url: pageUrl(env), database: databaseMark(url), beside: !!env.EVIDENT_BESIDE }
}

/** Where the other engine would be: said (OTHER_ENGINE_URL), or the other of the two ports. */
export const otherEngineUrl = (env = process.env) => (env.OTHER_ENGINE_URL?.trim() || `http://localhost:${enginePort(env) === DEFAULT_ENGINE ? BESIDE_ENGINE : DEFAULT_ENGINE}`).replace(/\/+$/, '')

type Ask = (url: string) => Promise<Instance | null>
const ask: Ask = (url) => fetch(`${url}/api/instance`, { signal: AbortSignal.timeout(800) }).then((r) => (r.ok ? r.json() as Promise<Instance> : null)).catch(() => null)

/** This Evident and the other one on this computer: up, with its name and page, or what would start it. */
export async function instances(deps: { env?: NodeJS.ProcessEnv; url?: string; ask?: Ask } = {}): Promise<{ here: Instance; other: Other }> {
  const env = deps.env ?? process.env, here = thisInstance(env, deps.url ?? DATABASE_URL)
  const there = await (deps.ask ?? ask)(otherEngineUrl(env))
  if (there?.name && there.url) return { here, other: { up: true, name: there.name, kind: there.kind, url: there.url, same: there.database === here.database } }
  // Not answering: it is the other kind, and each kind has its own way of starting.
  const kind = here.kind === 'local' ? 'shared' : 'local'
  return { here, other: { up: false, name: kind === 'local' ? 'This computer' : 'Shared', kind, start: kind === 'local' ? 'pnpm local' : 'pnpm arrive' } }
}
