/**
 * Freeing ngrok's one address (Sandy, 2026-11-13: "There should be a free up ngrok option when you share"). A free
 * ngrok account has one address, so a share through ngrok is refused while any other ngrok tunnel is up on the
 * account. Often that tunnel is on this same computer: a login service someone set up once, or a terminal left
 * running. This finds those, stops them when the person says so, and puts back the ones that were services when
 * sharing ends, so freeing ngrok for a look does not quietly break what was there.
 *
 * A service (launchd) is stopped with `launchctl bootout`, since killing it only makes it start again; it is put back
 * with `launchctl bootstrap` from its own file. A plain process is asked to stop and is not started again: we do not
 * know how it was started. A tunnel on another computer cannot be seen or stopped from here.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export interface Holder { pid: number; /** What it is tunnelling, as it was started: "http 3000". */ what: string; /** The login service that keeps it running, when one does. */ service?: string }
export type Run = (cmd: string, args: string[]) => Promise<string>
const execFileP = promisify(execFile)
const real: Run = (cmd, args) => execFileP(cmd, args, { timeout: 10_000 }).then((r) => r.stdout, () => '')

/** `ps -axo pid=,command=`: the ngrok tunnels among it, without the ones that are ours. */
export function parsePs(out: string, ours: number[] = []): Holder[] {
  return out.split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+(\S*\bngrok)\s+((?:http|tcp|tls|start)\b.*)$/.exec(line)
    if (!m || ours.includes(Number(m[1]))) return []
    return [{ pid: Number(m[1]), what: m[3].replace(/--(authtoken|url|domain)[= ]\S+\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) }]
  })
}
/** `launchctl list`: "pid status label" per line; the label of the service a pid belongs to. */
export const serviceOf = (list: string, pid: number) => list.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[0] === String(pid))?.[2]

export async function ngrokHolders(ours: number[] = [], run: Run = real): Promise<Holder[]> {
  if (process.platform === 'win32') return []
  const found = parsePs(await run('ps', ['-axo', 'pid=,command=']), ours)
  if (!found.length || process.platform !== 'darwin') return found
  const list = await run('launchctl', ['list'])
  return found.map((h) => { const service = serviceOf(list, h.pid); return service && !service.startsWith('application.') ? { ...h, service } : h })
}

const plistOf = (label: string) => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const paused = new Set<string>() // services we stopped, to put back

/** Stop the other ngrok tunnels on this computer. Returns what was stopped; a service among them is remembered so it can be put back. */
export async function freeNgrok(ours: number[] = [], run: Run = real, kill: (pid: number) => void = (pid) => { try { process.kill(pid, 'SIGTERM') } catch { /* gone */ } }): Promise<Holder[]> {
  const holders = await ngrokHolders(ours, run)
  for (const h of holders) {
    if (h.service && existsSync(plistOf(h.service))) { await run('launchctl', ['bootout', `gui/${userInfo().uid}/${h.service}`]); paused.add(h.service) }
    else kill(h.pid)
  }
  if (holders.length) await new Promise((r) => setTimeout(r, Number(process.env.NGROK_FREE_WAIT_MS ?? 2000))) // ngrok's side takes a moment to let the address go
  return holders
}

export const pausedServices = () => [...paused]
/** Put back the services stopped for sharing. Safe to call when there are none. */
export async function restoreNgrok(run: Run = real): Promise<string[]> {
  const back = [...paused]
  for (const label of back) { paused.delete(label); await run('launchctl', ['bootstrap', `gui/${userInfo().uid}`, plistOf(label)]) }
  return back
}
/** The same, when the engine is going down and cannot wait. */
export function restoreNgrokNow() { for (const label of [...paused]) { paused.delete(label); spawnSync('launchctl', ['bootstrap', `gui/${userInfo().uid}`, plistOf(label)], { timeout: 5000 }) } }
