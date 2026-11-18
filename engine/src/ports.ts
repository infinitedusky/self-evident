/**
 * The ports a prototype or a smoke test listens on, and which of them it was not given.
 *
 * Bonkei's agent, passed on by Sandy, 2026-11-17: "the only test is whether the app answers on $PORT. A second
 * server the app starts on a fixed port, like Bonkei's viewer on 5174, passes that test while quietly sharing one
 * server between every prototype." So the engine looks: once the app answers, it lists every TCP port the command's
 * processes listen on, and any that is not one it handed out is a stray: a port the app chose itself, which a second
 * copy would share or fight over. It works for every app, whether or not anyone thought of it.
 *
 * An app that needs more than one port is given more: $PORT, and $PORT_2 and $PORT_3, each free when it starts.
 */
import { execFile, type ChildProcess } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'

/** How many ports a start hands out: $PORT, $PORT_2, $PORT_3. */
export const PORTS = 3

const free = (): Promise<number> => new Promise((done, reject) => {
  const s = createServer()
  s.once('error', reject)
  s.listen(0, () => { const { port } = s.address() as AddressInfo; s.close(() => done(port)) })
})

/** The ports beside $PORT, as the command's environment: PORT_2, PORT_3. */
export async function morePorts(): Promise<{ env: Record<string, string>; ports: number[] }> {
  const ports: number[] = []
  for (let n = 2; n <= PORTS; n++) ports.push(await free())
  return { env: Object.fromEntries(ports.map((p, i) => [`PORT_${i + 2}`, String(p)])), ports }
}

/** The ports in what lsof prints with -Fn: lines like `n*:5174`, `n127.0.0.1:5174`, `n[::1]:5174`. Pure. */
export function portsIn(out: string): number[] {
  const found = new Set<number>()
  for (const line of out.split('\n')) {
    const m = /^n.*:(\d+)$/.exec(line.trim())
    if (m) found.add(Number(m[1]))
  }
  return [...found].sort((a, b) => a - b)
}

/** Every TCP port the processes of a group listen on. Nothing when it cannot be told (no lsof, the group is gone). */
export function listening(pgid: number): Promise<number[]> {
  return new Promise((done) => {
    execFile('lsof', ['-nP', '-a', '-g', String(pgid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { timeout: 4000 }, (_err, stdout) => done(portsIn(String(stdout ?? ''))))
  })
}

/** The ones it was not given. Pure. */
export const strays = (found: number[], given: number[]) => found.filter((p) => !given.includes(p))

export interface Watched { proc: ChildProcess; /** The ports it was handed. */ given?: number[]; stray?: { at: number; ports: number[] } }

/**
 * The stray ports of something running, looked at again at most every ten seconds. `first` is called the first time
 * a run is seen to have any, so it is said once.
 */
export async function straysOf(m: Watched | undefined, first?: (ports: number[]) => unknown): Promise<number[]> {
  if (!m?.given || !m.proc.pid || m.proc.exitCode !== null || m.proc.signalCode !== null) return []
  if (m.stray && Date.now() - m.stray.at < 10_000) return m.stray.ports
  const had = m.stray?.ports.length ?? 0
  const ports = strays(await listening(m.proc.pid), m.given)
  m.stray = { at: Date.now(), ports }
  if (ports.length && !had) await Promise.resolve(first?.(ports)).catch(() => {})
  return ports
}

/** What a person and an agent are told about them. */
export const straySays = (ports: number[]) =>
  `It also listens on ${ports.length === 1 ? `port ${ports[0]}` : `ports ${ports.join(', ')}`}, which it chose itself. A second copy running beside it would share or fight over ${ports.length === 1 ? 'it' : 'them'}. Make ${ports.length === 1 ? 'it' : 'each'} follow $PORT_2 or $PORT_3, which are free and handed out with $PORT.`
