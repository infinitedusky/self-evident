/**
 * What one reply of an agent used, under the reply: closed, it says the model, how long it took and the tokens;
 * opened, the tokens by kind for each model that ran, the cost estimate (this reply and the conversation so far)
 * and where the plan's limits stood when it ended. The engine works these out (`engine/src/reply-cost.ts`); a reply
 * recorded before it did shows what it has.
 */
import { Badge } from './Badge'

export interface ReplyTokens { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface ReplyLimit { status?: string; utilization?: number; resetsAt?: number; overage?: boolean }
export interface ReplyPayload {
  subtype?: string; turns?: number; durationMs?: number; model?: string
  costUsd?: number | string; stepUsd?: number | string; totalUsd?: number | string
  usage?: Record<string, ReplyTokens>; limits?: Record<string, ReplyLimit>
  /** The login the reply ran on: whose limits those are. */
  account?: { organization?: string; plan?: string }
}

const took = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} seconds` : `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`
const usd = (n: unknown) => `$${Number(n).toFixed(2)}`
const short = (model: string) => model.replace('claude-', '')
/** 950, 12k, 426k, 1.2M */
export const tokens = (n: number) => n < 1000 ? String(n) : n < 999_500 ? `${Math.round(n / 1000)}k` : `${(n / 1_000_000).toFixed(1)}M`
const all = (t: ReplyTokens) => t.input + t.output + t.cacheRead + t.cacheWrite

const LIMIT_NAMES: Record<string, string> = { five_hour: 'Five-hour limit', seven_day: 'Seven-day limit', seven_day_opus: 'Seven-day limit, Opus', seven_day_sonnet: 'Seven-day limit, Sonnet', seven_day_overage_included: 'Seven-day limit', overage: 'Usage budget', plan: 'Plan limit' }
/** The SDK gives a share of the limit; it does not say whether out of 1 or out of 100, so a figure up to 1 is read as a fraction. */
const share = (u: number) => Math.round(u <= 1 ? u * 100 : u)
const resets = (at: number) => {
  const d = new Date(at < 1e12 ? at * 1000 : at)
  const sameDay = d.toDateString() === new Date().toDateString()
  return d.toLocaleString(undefined, sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
const state = (l: ReplyLimit) => l.status === 'rejected' ? { tone: 'bad' as const, word: 'used up' } : l.status === 'allowed_warning' ? { tone: 'warn' as const, word: 'close' } : null

export function ReplyCard({ body, payload, open }: { body: string; payload: ReplyPayload | null; open?: boolean }) {
  const p = payload ?? {}
  const models = Object.entries(p.usage ?? {})
  const used = models.reduce((n, [, t]) => n + all(t), 0)
  const limits = Object.entries(p.limits ?? {})
  const account = [p.account?.organization, p.account?.plan].filter(Boolean).join(' · ')
  /** A login billed in dollars against a budget (an enterprise seat): Claude calls it extra usage, in use. */
  const byUse = !!p.limits?.overage?.overage
  const head = [
    body === 'done' && p.durationMs ? `Worked for ${took(Number(p.durationMs))}` : body,
    p.model ? short(p.model) : null,
    models.length ? `${tokens(used)} tokens` : null,
    p.stepUsd != null && (byUse || !models.length) ? usd(p.stepUsd) : !models.length && p.costUsd != null ? `${usd(p.costUsd)} total` : null, // dollars are the usage where the login is billed by use
  ].filter(Boolean).join(' · ')
  const worst = limits.map(([, l]) => state(l)).find((s) => s?.tone === 'bad') ?? limits.map(([, l]) => state(l)).find(Boolean)
  return (
    // The last reply's card sits at the bottom of the chat: opened, it grows below what is on screen, so it brings itself into view.
    <details className="msg engine reply-card" open={open} onToggle={(e) => { if (e.currentTarget.open) e.currentTarget.scrollIntoView({ block: 'nearest' }) }}>
      <summary className="faint">{head}{worst && <> <Badge tone={worst.tone} dot>limit {worst.word}</Badge></>}</summary>
      <dl className="reply-card-rows">
        {p.model && <><dt>Model</dt><dd>{short(p.model)}</dd></>}
        {(p.durationMs != null || p.turns != null) && <><dt>Time</dt><dd>{[p.durationMs != null ? took(Number(p.durationMs)) : null, p.turns != null ? `${p.turns} step${p.turns === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</dd></>}
        {models.length > 0 && <>
          <dt>Tokens</dt>
          <dd>
            {models.map(([model, t]) => (
              <div key={model}>
                {models.length > 1 && <span className="reply-card-model">{short(model)} </span>}
                <strong>{tokens(all(t))}</strong> <span className="faint">{[`${tokens(t.input)} read`, `${tokens(t.output)} written`, t.cacheRead ? `${tokens(t.cacheRead)} from the cache` : null, t.cacheWrite ? `${tokens(t.cacheWrite)} saved to the cache` : null].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </dd>
        </>}
        {(p.stepUsd != null || p.totalUsd != null || p.costUsd != null) && <>
          <dt>Cost estimate</dt>
          <dd>
            {p.stepUsd != null && <div><strong>{usd(p.stepUsd)}</strong> <span className="faint">this reply</span></div>}
            <div><strong>{usd(p.totalUsd ?? p.costUsd)}</strong> <span className="faint">this conversation so far</span></div>
          </dd>
        </>}
        {account && <><dt>Account</dt><dd>{account}</dd></>}
        {limits.length > 0 && <>
          <dt>Plan limits</dt>
          <dd>
            {limits.map(([which, l]) => {
              const s = state(l)
              const extra = which === 'overage'
              return (
                <div key={which}>
                  {LIMIT_NAMES[which] ?? which}{': '}
                  <strong>{l.utilization != null ? `${share(l.utilization)}% used` : s ? s.word : extra ? (l.overage ? 'billed by use' : 'allowed') : 'not close'}</strong>
                  {s && l.utilization != null && <> <Badge tone={s.tone}>{s.word}</Badge></>}
                  {l.overage && !extra && <> <Badge tone="warn">on extra usage</Badge></>}
                  {l.resetsAt != null && <span className="faint"> · starts again {resets(l.resetsAt)}</span>}
                </div>
              )
            })}
            {limits.every(([, l]) => l.utilization == null) && <div className="faint">{byUse
              ? 'This login is billed in dollars against a budget its organization sets. Claude does not say how much of it is used; the cost estimate above is what this reply took from it.'
              : 'Claude says how much is used only when a limit is close, so there is no figure for what is left.'}</div>}
          </dd>
        </>}
      </dl>
      <p className="faint reply-card-note">Tokens and cost are for this reply alone unless they say otherwise. The cost is an estimate at list prices, not a bill.</p>
    </details>
  )
}
