/**
 * The other devices that have the page open (Sandy, 2026-11-18: "we need some indicator that shows that a phone is
 * connected"). A phone reaches the page over Tailscale (docs/running-it.md, "From a phone"); `tailscale serve` adds
 * the caller's address on that network to each request, and Tailscale knows each address's device by name. A device
 * is here while it holds a live feed open, and gone when it lets go (the phone sleeps, the tab closes).
 * Kept in memory only: nothing about a device is stored.
 */
import { execFile, spawn } from 'node:child_process'

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
const UI_PORT = Number(process.env.UI_PORT ?? 5180)

/** The page's address on the Tailscale network, from `tailscale serve status --json`; null when it is not served. */
export function addressIn(serveJson: string, port = UI_PORT): string | null {
  try {
    const web = (JSON.parse(serveJson) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }).Web ?? {}
    for (const [host, w] of Object.entries(web)) if (new RegExp(`^https?://(127\\.0\\.0\\.1|localhost):${port}/?$`).test(w.Handlers?.['/']?.Proxy ?? '')) return `https://${host.replace(/:443$/, '')}`
  } catch { /* not Tailscale's answer */ }
  return null
}

/** Where Tailscale stands on this computer: not installed, installed but not connected, or connected. */
export type Tailscale = 'missing' | 'off' | 'ready'
export interface Phone { tailscale: Tailscale; address: string | null }

/** Whether Tailscale is connected, from `tailscale status --json`. */
export const connectedIn = (statusJson: string) => { try { return (JSON.parse(statusJson) as { BackendState?: string }).BackendState === 'Running' } catch { return false } }

/** The first Tailscale that answers, with what it said to `args`; null when there is none on this computer. */
async function ask(args: string[]): Promise<{ bin: string; out: string } | null> {
  for (const bin of BINS) { const out = await run(bin, args); if (out !== null) return { bin, out } }
  return null
}

let phone: { at: number; value: Phone } | null = null
/** Tailscale's state and the address to open on a phone, asked at most twice a minute. */
export async function phoneState(fresh = false): Promise<Phone> {
  if (!fresh && phone && Date.now() - phone.at < 30_000) return phone.value
  const status = await ask(['status', '--json'])
  const value: Phone = !status ? { tailscale: 'missing', address: null }
    : !connectedIn(status.out) ? { tailscale: 'off', address: null }
    : { tailscale: 'ready', address: addressIn((await run(status.bin, ['serve', 'status', '--json'])) ?? '') }
  phone = { at: Date.now(), value }
  return value
}

/** The page Tailscale names when serving has to be allowed on the account first. */
export const enableIn = (said: string) => /https:\/\/login\.tailscale\.com\/\S+/.exec(said)?.[0] ?? null

/**
 * Put the page on the private network (`tailscale serve --bg`), the one press that replaces the terminal step
 * (Sandy, 2026-11-18: "that should be a button that starts it no?"). Only this computer's devices can open it;
 * nothing is made public. When the account has not allowed serving yet, Tailscale says where to allow it and waits:
 * `enable` is that page, and nothing is served.
 */
export async function servePhone(): Promise<Phone & { enable?: string }> {
  const status = await ask(['status', '--json'])
  if (!status || !connectedIn(status.out)) return phoneState(true)
  const said = await new Promise<string>((resolve) => {
    const child = spawn(status.bin, ['serve', '--bg', String(UI_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const end = () => { clearTimeout(t); resolve(out) }
    const t = setTimeout(() => { child.kill(); end() }, 12_000) // it waits forever when serving is not allowed yet
    child.stdout.on('data', (b) => { out += String(b); if (enableIn(out)) { child.kill(); end() } })
    child.stderr.on('data', (b) => { out += String(b) })
    child.on('close', end); child.on('error', end)
  })
  const now = await phoneState(true)
  const enable = now.address ? null : enableIn(said)
  return enable ? { ...now, enable } : now
}

/** Take the page off the private network again. */
export async function stopPhone(): Promise<Phone> {
  const status = await ask(['status', '--json'])
  if (status) await run(status.bin, ['serve', '--https=443', 'off'])
  return phoneState(true)
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
