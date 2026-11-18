/**
 * The other devices that have the page open (Sandy, 2026-11-18: "we need some indicator that shows that a phone is
 * connected"). A phone reaches the page over Tailscale (docs/running-it.md, "From a phone"); `tailscale serve` adds
 * the caller's address on that network to each request, and Tailscale knows each address's device by name. A device
 * is here while it holds a live feed open, and gone when it lets go (the phone sleeps, the tab closes).
 * Kept in memory only: nothing about a device is stored.
 */
import { execFile } from 'node:child_process'

export interface Device { ip: string; name: string; kind: 'phone' | 'computer'; since: string }

/** Tailscale's addresses: 100.64.0.0/10. */
const onTailnet = (ip: string) => { const m = /^100\.(\d+)\.\d+\.\d+$/.exec(ip); return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127 }

/** The device a request came from, by its Tailscale address; null when it came from this computer. */
export function remoteIp(header: (name: string) => string | undefined): string | null {
  const first = (header('x-forwarded-for') ?? '').split(',')[0].trim()
  return onTailnet(first) ? first : null
}

type Named = { name: string; kind: Device['kind'] }
const BINS = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']
const run = (bin: string, args = ['status', '--json']) => new Promise<string | null>((resolve) => execFile(bin, args, { timeout: 4000, maxBuffer: 8 << 20 }, (err, out) => resolve(err ? null : out)))

/** The page's port (app/vite.config.ts): the address to hand a phone is the one Tailscale sends on to it. */
const UI_PORT = 5180

/** The page's address on the Tailscale network, from `tailscale serve status --json`; null when it is not served. */
export function addressIn(serveJson: string, port = UI_PORT): string | null {
  try {
    const web = (JSON.parse(serveJson) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }).Web ?? {}
    for (const [host, w] of Object.entries(web)) if (new RegExp(`^https?://(127\\.0\\.0\\.1|localhost):${port}/?$`).test(w.Handlers?.['/']?.Proxy ?? '')) return `https://${host.replace(/:443$/, '')}`
  } catch { /* not Tailscale's answer */ }
  return null
}

let address: { at: number; value: string | null } | null = null
/** The address to open on a phone, asked of Tailscale at most twice a minute. */
export async function phoneAddress(): Promise<string | null> {
  if (address && Date.now() - address.at < 30_000) return address.value
  let value: string | null = null
  for (const bin of BINS) { const out = await run(bin, ['serve', 'status', '--json']); if (out) { value = addressIn(out); break } }
  address = { at: Date.now(), value }
  return value
}

/** Each address's device, as Tailscale has it. Exported so a test can read a made-up answer. */
export function namesIn(statusJson: string): Map<string, Named> {
  const names = new Map<string, Named>()
  try {
    const peers = Object.values((JSON.parse(statusJson) as { Peer?: Record<string, { HostName?: string; OS?: string; TailscaleIPs?: string[] }> }).Peer ?? {})
    for (const p of peers) for (const ip of p.TailscaleIPs ?? []) names.set(ip, { name: p.HostName || 'A device', kind: /ios|android/i.test(p.OS ?? '') ? 'phone' : 'computer' })
  } catch { /* not Tailscale's answer: no names */ }
  return names
}

async function nameOf(ip: string): Promise<Named> {
  for (const bin of BINS) { const out = await run(bin); if (out) return namesIn(out).get(ip) ?? { name: 'A device', kind: 'computer' } }
  return { name: 'A device', kind: 'computer' }
}

const here = new Map<symbol, Device>()

/** A device took up a live feed; call what comes back when it lets go. `name` is for tests. */
export function deviceJoined(ip: string, name: (ip: string) => Promise<Named> = nameOf): () => void {
  const id = Symbol(ip)
  const known = [...here.values()].find((d) => d.ip === ip)
  const device: Device = { ip, name: known?.name ?? 'A device', kind: known?.kind ?? 'computer', since: known?.since ?? new Date().toISOString() }
  here.set(id, device)
  if (!known) void name(ip).then((n) => { for (const d of here.values()) if (d.ip === ip) Object.assign(d, n) }).catch(() => {})
  return () => { here.delete(id) }
}

/** The devices with the page open, one line each, longest here first; `but` leaves out the one asking. */
export function devicesHere(but: string | null = null): Device[] {
  const one = new Map<string, Device>()
  for (const d of here.values()) if (d.ip !== but && !one.has(d.ip)) one.set(d.ip, d)
  return [...one.values()].sort((a, b) => a.since.localeCompare(b.since))
}
