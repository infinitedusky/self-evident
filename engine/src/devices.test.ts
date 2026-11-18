/** Which other devices have the page open: told from the address Tailscale adds, named from Tailscale's own list. */
import { describe, expect, it } from 'vitest'
import { addressIn, connectedIn, deviceJoined, enableIn, devicesHere, namesIn, remoteIp } from './devices.js'

const from = (xff?: string) => (name: string) => (name === 'x-forwarded-for' ? xff : undefined)
const phone = async () => ({ name: 'Made-up phone', kind: 'phone' as const })

describe('devices here', () => {
  it('a request is remote only when it carries an address on the Tailscale network', () => {
    expect(remoteIp(from('100.101.1.2'))).toBe('100.101.1.2')
    expect(remoteIp(from('100.101.1.2, 127.0.0.1'))).toBe('100.101.1.2')
    expect(remoteIp(from('127.0.0.1'))).toBeNull()
    expect(remoteIp(from('100.1.2.3'))).toBeNull() // 100.x outside Tailscale's range
    expect(remoteIp(from())).toBeNull()
  })

  it("reads each address's device from Tailscale's list", () => {
    const names = namesIn(JSON.stringify({ Peer: { a: { HostName: 'Made-up phone', OS: 'iOS', TailscaleIPs: ['100.101.1.2'] }, b: { HostName: 'Made-up laptop', OS: 'macOS', TailscaleIPs: ['100.101.1.3'] } } }))
    expect(names.get('100.101.1.2')).toEqual({ name: 'Made-up phone', kind: 'phone' })
    expect(names.get('100.101.1.3')).toEqual({ name: 'Made-up laptop', kind: 'computer' })
    expect(namesIn('not json').size).toBe(0)
  })

  it("the address for a phone is the one Tailscale sends on to the page's port", () => {
    const serve = (proxy: string) => JSON.stringify({ Web: { 'made-up.tail0000.ts.net:443': { Handlers: { '/': { Proxy: proxy } } } } })
    expect(addressIn(serve('http://127.0.0.1:5180'))).toBe('https://made-up.tail0000.ts.net')
    expect(addressIn(serve('http://127.0.0.1:3000'))).toBeNull() // something else is served, not the page
    expect(addressIn('{}')).toBeNull()
  })

  it('knows connected from not, and where Tailscale says to allow serving', () => {
    expect(connectedIn(JSON.stringify({ BackendState: 'Running' }))).toBe(true)
    expect(connectedIn(JSON.stringify({ BackendState: 'NeedsLogin' }))).toBe(false)
    expect(connectedIn('')).toBe(false)
    expect(enableIn('Serve is not enabled on your tailnet.\nTo enable, visit:\n\n   https://login.tailscale.com/f/serve?node=madeup\n')).toBe('https://login.tailscale.com/f/serve?node=madeup')
    expect(enableIn('Serve started and running in the background.')).toBeNull()
  })

  it('a device is here while it holds a feed, once however many feeds, and gone when the last closes', async () => {
    const a = deviceJoined('100.101.1.2', phone), b = deviceJoined('100.101.1.2', phone)
    await new Promise((r) => setTimeout(r, 5))
    expect(devicesHere()).toMatchObject([{ ip: '100.101.1.2', name: 'Made-up phone', kind: 'phone' }])
    expect(devicesHere('100.101.1.2')).toEqual([]) // the one asking is not told about itself
    a()
    expect(devicesHere()).toHaveLength(1)
    b()
    expect(devicesHere()).toEqual([])
  })
})
