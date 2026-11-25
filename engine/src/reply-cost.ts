/**
 * What one reply cost, and what the conversation has cost so far.
 *
 * The SDK's `total_cost_usd` on a result is a running total for the conversation, not the cost of the reply that
 * just ended, so the reply's own cost is the difference from the result before it. The running total can start
 * again from nothing (a `/clear`, or a result from a crash that carries zeroes): then the new figure is the
 * reply's cost, and the conversation's total keeps counting from where it was.
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
