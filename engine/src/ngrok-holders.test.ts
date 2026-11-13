/** Freeing ngrok's one address: which tunnels on this computer hold it, stopping them, and putting a service back. Nothing real is stopped here: ps, launchctl and kill are stand-ins. */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freeNgrok, ngrokHolders, parsePs, pausedServices, reloadPaused, restoreNgrok, serviceOf, type Run } from './ngrok-holders.js'

const PS = ` 1172 /opt/homebrew/bin/ngrok http --url=https://sample-made-up.ngrok-free.dev 3000
 2001 /bin/zsh -c grep ngrok
 3003 ngrok http 127.0.0.1:51234 --host-header 127.0.0.1:51234 --log stdout --log-format json
 4004 /opt/homebrew/bin/ngrok tcp 22 --authtoken sample-not-a-token
 5005 node server.js --name ngrok-proxy`
const LAUNCHCTL = `PID\tStatus\tLabel\n1172\t0\tcom.sample.ngrok-tunnel\n-\t0\tcom.sample.other\n4004\t0\tapplication.com.sample.terminal.123`

describe('other ngrok tunnels on this computer', () => {
  it('finds the tunnels in the process list, leaves ours out, and never repeats a token or an address', () => {
    expect(parsePs(PS, [3003])).toEqual([{ pid: 1172, what: 'http 3000' }, { pid: 4004, what: 'tcp 22' }])
    expect(parsePs(PS)).toHaveLength(3)
    expect(serviceOf(LAUNCHCTL, 1172)).toBe('com.sample.ngrok-tunnel')
    expect(serviceOf(LAUNCHCTL, 9)).toBeUndefined()
  })

  it.skipIf(process.platform !== 'darwin')('names the login service that keeps one running, and stops each the way that works: a plain process is asked to stop', async () => {
    const calls: string[] = []
    const run: Run = async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return cmd === 'ps' ? PS : cmd === 'launchctl' && args[0] === 'list' ? LAUNCHCTL : '' }
    expect(await ngrokHolders([3003], run)).toEqual([{ pid: 1172, what: 'http 3000', service: 'com.sample.ngrok-tunnel' }, { pid: 4004, what: 'tcp 22' }]) // an app's own process group is not a service
    const killed: number[] = []
    process.env.NGROK_FREE_WAIT_MS = '1'
    const stopped = await freeNgrok([3003], run, (pid) => killed.push(pid))
    delete process.env.NGROK_FREE_WAIT_MS
    expect(stopped.map((h) => h.pid)).toEqual([1172, 4004])
    expect(killed).toEqual([1172, 4004]) // the sample service has no file on this computer, so it cannot be put back: it is only asked to stop
    expect(pausedServices()).toEqual([])
    expect(await restoreNgrok(run)).toEqual([])
    expect(calls.some((c) => c.startsWith('launchctl bootout'))).toBe(false)
  })

  it('remembers a stopped service in a file, so an engine that restarts mid-share still puts it back', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'if-ngrok-')), 'paused.json')
    const was = process.env.NGROK_PAUSED_FILE
    process.env.NGROK_PAUSED_FILE = file
    try {
      writeFileSync(file, JSON.stringify(['com.sample.ngrok-tunnel'])) // what an engine killed mid-share left behind
      reloadPaused() // a new engine starting
      expect(pausedServices()).toEqual(['com.sample.ngrok-tunnel'])
      const calls: string[] = []
      expect(await restoreNgrok(async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return '' })).toEqual(['com.sample.ngrok-tunnel'])
      expect(calls).toHaveLength(1); expect(calls[0]).toMatch(/^launchctl bootstrap gui\/\d+ .*com\.sample\.ngrok-tunnel\.plist$/)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([]) // put back: forgotten
      expect(pausedServices()).toEqual([])
    } finally { process.env.NGROK_PAUSED_FILE = was; reloadPaused() }
  })
})
