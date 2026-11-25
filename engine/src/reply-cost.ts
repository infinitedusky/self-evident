/**
 * What one reply used: its cost, its tokens, and where the plan's limits stood.
 *
 * The SDK's `total_cost_usd` and `modelUsage` on a result are running totals for the conversation, not what the
 * reply that just ended used, so the reply's own share is the difference from the result before it. A running
 * total can start again from nothing (a `/clear`, or a result from a crash that carries zeroes): then the new
 * figure is the reply's own, and the conversation's total keeps counting from where it was.
 */
export interface ReplyCost { stepUsd: number; totalUsd: number }

/** `before`: the last result of the conversation that had a cost above zero, if there is one. */
export function replyCost(before: { costUsd?: unknown; totalUsd?: unknown } | null | undefined, nowUsd: unknown): ReplyCost | null {
  const now = Number(nowUsd)
  if (nowUsd == null || !Number.isFinite(now)) return null
  const ran = Number(before?.costUsd ?? 0) || 0
  const total = Number(before?.totalUsd ?? before?.costUsd ?? 0) || 0
  const step = now >= ran ? now - ran : now
  return { stepUsd: round(step), totalUsd: round(total + step) }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Tokens by what they were: read fresh, written by the model, read from the cache, written to the cache. */
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }
/** Tokens for each model that ran, by the model's id. */
export type Usage = Record<string, Tokens>
const KINDS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const

/** The SDK's `modelUsage` (a running total), cut down to the four counts. */
export function usageSoFar(modelUsage: unknown): Usage | null {
  if (!modelUsage || typeof modelUsage !== 'object') return null
  const out: Usage = {}
  for (const [model, u] of Object.entries(modelUsage as Record<string, Record<string, unknown>>)) {
    if (!u || typeof u !== 'object') continue
    out[model] = { input: Number(u.inputTokens) || 0, output: Number(u.outputTokens) || 0, cacheRead: Number(u.cacheReadInputTokens) || 0, cacheWrite: Number(u.cacheCreationInputTokens) || 0 }
  }
  return Object.keys(out).length ? out : null
}

/**
 * The tokens one reply used, for each model that ran in it. `before` is the running total kept on the result
 * before this one; `first` says there was no result before. A result from before running totals were kept leaves
 * nothing to take away, so that one reply's tokens are not known (null).
 */
export function replyUsage(before: Usage | null | undefined, now: Usage | null, first: boolean): Usage | null {
  if (!now) return null
  if (!before) return first ? now : null
  const restarted = Object.entries(before).some(([model, b]) => KINDS.some((k) => (now[model]?.[k] ?? 0) < b[k]))
  if (restarted) return now
  const out: Usage = {}
  for (const [model, n] of Object.entries(now)) {
    const b = before[model]
    const step = { input: n.input - (b?.input ?? 0), output: n.output - (b?.output ?? 0), cacheRead: n.cacheRead - (b?.cacheRead ?? 0), cacheWrite: n.cacheWrite - (b?.cacheWrite ?? 0) }
    if (KINDS.some((k) => step[k] > 0)) out[model] = step
  }
  return out
}

/** Where one of the subscription's limits stands, as the SDK last said (a `rate_limit_event`). */
export interface Limit { status?: string; utilization?: number; resetsAt?: number; overage?: boolean }
/** By which limit: `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `overage`; `plan` where the SDK does not say. */
export type Limits = Record<string, Limit>

/** One `rate_limit_info`, as [which limit, where it stands]. Null when there is nothing in it. */
export function limitOf(info: unknown): [string, Limit] | null {
  if (!info || typeof info !== 'object') return null
  const i = info as Record<string, unknown>
  const limit: Limit = {
    ...(typeof i.status === 'string' ? { status: i.status } : {}),
    ...(typeof i.utilization === 'number' ? { utilization: i.utilization } : {}),
    ...(typeof i.resetsAt === 'number' ? { resetsAt: i.resetsAt } : {}),
    ...(i.isUsingOverage === true || i.overageInUse === true ? { overage: true } : {}),
  }
  return Object.keys(limit).length ? [typeof i.rateLimitType === 'string' ? i.rateLimitType : 'plan', limit] : null
}
