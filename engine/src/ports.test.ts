/** The ports something running listens on, and which it was not given. One test runs a real process. */
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { listening, morePorts, portsIn, strays, straySays, straysOf } from './ports.js'

const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 300; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe('the ports it listens on', () => {
  it('are read from what lsof prints, whatever the address', () => {
    expect(portsIn('p123\nf21\nn*:5174\np124\nf9\nn127.0.0.1:6500\nn[::1]:6500\nnlocalhost:80\n')).toEqual([80, 5174, 6500])
    expect(portsIn('')).toEqual([])
  })
  it('one it was not given is a stray, and is said plainly', () => {
    expect(strays([5174, 6500, 6501], [6500, 6501, 6502])).toEqual([5174])
    expect(strays([6500], [6500])).toEqual([])
    expect(straySays([5174])).toContain('port 5174, which it chose itself')
    expect(straySays([5174, 9229])).toContain('ports 5174, 9229')
  })
  it('more than one port is handed out, each free: $PORT_2 and $PORT_3', async () => {
    const { env, ports } = await morePorts()
    expect(Object.keys(env)).toEqual(['PORT_2', 'PORT_3'])
    expect(ports.map(String)).toEqual([env.PORT_2, env.PORT_3])
    expect(new Set(ports).size).toBe(2)
  })
  it('a command that also serves on a port of its own choosing is caught, once, and one that keeps to what it was given is not', async () => {
    const { ports: [given, own] } = await morePorts() // two free ports: one it is given, one it picks for itself (sample)
    // The command a package manager would run: a shell that starts the server, in its own process group.
    const proc = spawn('sh', ['-c', `node -e "const h=require('http');h.createServer((q,s)=>s.end('a')).listen(process.env.PORT);h.createServer((q,s)=>s.end('b')).listen(${own})"`], { env: { ...process.env, PORT: String(given) }, stdio: 'ignore', detached: true })
    try {
      expect(await until(async () => (await listening(proc.pid!)).length === 2)).toBe(true)
      const said: number[][] = []
      const m = { proc, given: [given] }
      expect(await straysOf(m, (p) => { said.push(p) })).toEqual([own])
      expect(await straysOf(m, (p) => { said.push(p) })).toEqual([own])
      expect(said).toEqual([[own]]) // said the first time it is seen, not each time it is looked at
      expect(await straysOf({ proc, given: [given, own] })).toEqual([]) // given both: nothing strays
      expect(await straysOf({ proc })).toEqual([]) // started before ports were handed out: not judged
    } finally { try { process.kill(-proc.pid!, 'SIGTERM') } catch { proc.kill('SIGTERM') } }
  })
})
