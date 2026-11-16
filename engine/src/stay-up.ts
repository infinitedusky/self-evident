/**
 * The engine stays up (Sandy, 2026-11-16: "engine down?", for the eleventh time). A promise nobody awaited that
 * fails ends a Node process, and under `tsx watch` nothing starts it again until a file changes: every agent and
 * every page is cut off until someone notices. The usual cause is the database connection dropping under a read
 * (the proxy to Fly resets idle connections), which is nothing the engine did and nothing to stop for.
 *
 * So an unhandled rejection is logged, loudly, and the engine carries on. The log is observed (PostHog, with
 * alerts), so a real bug still surfaces; it no longer takes everything down with it.
 */
const CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', '57P01', '57P02', '57P03', '08006', '08003', '08000'])
const SAYS = /Connection terminated|connection.*(closed|reset|lost)|timeout exceeded when trying to connect|socket hang up|read ECONNRESET/i

/** Whether an error, or anything it was caused by, is a connection dropping: the database's, or the network's. */
export function dropped(err: unknown, depth = 0): boolean {
  if (!err || depth > 5) return false
  const e = err as { code?: unknown; message?: unknown; cause?: unknown }
  if (typeof e.code === 'string' && CODES.has(e.code)) return true
  if (typeof e.message === 'string' && SAYS.test(e.message)) return true
  return dropped(e.cause, depth + 1)
}

/** What to say about one, in a line. */
export function said(err: unknown): string {
  const e = err as { message?: unknown; cause?: { message?: unknown } } | null
  const first = String(e?.message ?? err).split('\n')[0].slice(0, 300)
  const cause = e?.cause?.message ? ` (${String(e.cause.message).slice(0, 120)})` : ''
  return `${first}${cause}`
}

let on = false
/** Call once, at start. */
export function stayUp(log: Pick<Console, 'warn' | 'error'> = console) {
  if (on) return
  on = true
  process.on('unhandledRejection', (err) => {
    if (dropped(err)) log.warn(`[engine] a connection dropped under something nobody was waiting on; carrying on: ${said(err)}`)
    else log.error(`[engine] UNHANDLED REJECTION, carrying on. This is a bug to fix: ${said(err)}\n${(err as Error)?.stack ?? ''}`)
  })
}
