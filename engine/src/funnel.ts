/**
 * Tailscale Funnel as a tunnel for sharing (Sandy, 2026-11-19: "since we have Tailscale running now, should we be
 * using that? And would that allow us to share more things at the same time?"). Funnel makes one port of this
 * computer public at its Tailscale name: `https://<computer>.<tailnet>.ts.net:8443`. It goes out on the ordinary
 * HTTPS port, so it gets through where Cloudflare's tunnel does not, and it shows the visitor no notice page.
 *
 * Funnel allows three public ports: 443, 8443 and 10000. **443 is never used here**: it is where Self Evident's own
 * page is served to the phone (devices.ts), which has no sign-in, and a Funnel on that port would make whatever is
 * served there public. So two things at once, on 8443 and 10000. Self Evident's own page and its engine are refused
 * as targets outright.
 *
 * Run in the foreground (`tailscale funnel --https=8443 <target>`): the address lasts as long as the process does,
 * like the other tunnels. The `tailscale` on the path may be a shell wrapper around the app's program, and stopping
 * the wrapper leaves the program, and the public address, up (seen 2026-11-19): so the app's own program is asked
 * first, and every stop is followed by a sweep for what is left.
 */
import { execFile, spawnSync } from 'node:child_process'

/** The public ports a share may use. Never 443: see above. */
export const FUNNEL_PORTS = [8443, 10000] as const
const BINS = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', 'tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']
const bins = () => (process.env.TAILSCALE_BIN ? [process.env.TAILSCALE_BIN] : BINS)
const ask = (bin: string, args: string[]) => new Promise<string | null>((ok) => execFile(bin, args, { timeout: 4000, maxBuffer: 8 << 20 }, (err, out) => ok(err ? null : out)))

/** The Tailscale program on this computer and what it says of itself, or null when there is none. */
export async function tailscale(): Promise<{ bin: string; running: boolean; taken: Set<number> } | null> {
  for (const bin of bins()) {
    const status = await ask(bin, ['status', '--json'])
    if (status === null) continue
    let running = false
    try { running = (JSON.parse(status) as { BackendState?: string }).BackendState === 'Running' } catch { /* not running */ }
    return { bin, running, taken: takenIn((await ask(bin, ['funnel', 'status', '--json'])) ?? '') }
  }
  return null
}

/** The ports Tailscale already serves on this computer, kept or in the foreground: a share takes none of them. */
export function takenIn(statusJson: string): Set<number> {
  const taken = new Set<number>()
  const add = (c: { TCP?: Record<string, unknown> } | undefined) => { for (const p of Object.keys(c?.TCP ?? {})) taken.add(Number(p)) }
  try {
    const j = JSON.parse(statusJson) as { TCP?: Record<string, unknown>; Foreground?: Record<string, { TCP?: Record<string, unknown> }> }
    add(j); for (const f of Object.values(j.Foreground ?? {})) add(f)
  } catch { /* nothing served */ }
  return taken
}

/** The public address, once Funnel says it is up and reaching what was asked. */
export function funnelReady(all: string, target: string): string | null {
  if (!/Available on the internet/.test(all) || !all.includes(`proxy ${target}`)) return null
  return /https:\/\/[a-z0-9.-]+\.ts\.net(?::\d+)?/.exec(all)?.[0] ?? null
}

/** Why Funnel will not start, when it says so: it is not allowed on the account yet, and where to allow it. */
export function funnelRefused(all: string): string | null {
  const link = /https:\/\/login\.tailscale\.com\/\S+/.exec(all)?.[0]
  return link ? `Tailscale's public links (Funnel) are not switched on for this account yet. Open ${link}, allow it, then share again.` : null
}

/** A local address a share must never reach: Self Evident's own page or its engine. Neither has a sign-in. */
export function ownAddress(target: string): boolean {
  const port = Number(new URL(target).port)
  return port === 5180 || port === Number(process.env.PORT ?? 4000) || (!!process.env.UI_URL && port === Number(new URL(process.env.UI_URL).port || 0))
}

/**
 * Stop whatever still holds a share's public port: the program a wrapper left behind. With a target, only the funnel
 * to that address; without, any funnel of ours on that port (at the engine's start, when no share can be alive).
 */
export function sweepFunnel(port: number, target?: string) {
  const to = target ? target.replace(/[.]/g, '\\.') : 'http://127\\.0\\.0\\.1:'
  try { spawnSync('pkill', ['-f', `funnel --https=${port} ${to}`], { timeout: 3000 }) } catch { /* nothing to stop */ }
}
