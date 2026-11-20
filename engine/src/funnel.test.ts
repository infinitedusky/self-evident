/** Tailscale Funnel, the parts that only read: what it prints, what is taken, and what may never be reached. */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { FUNNEL_PORTS, funnelReady, funnelRefused, ownAddress, takenIn } from './funnel.js'
import { guideProxy } from './share-guide.js'

describe('Tailscale Funnel', () => {
  it('never offers 443, where Self Evident\'s own page is served to the phone', () => {
    expect(FUNNEL_PORTS).not.toContain(443)
  })

  it('reads the address once Funnel says it is up and reaching what was asked', () => {
    const said = 'Available on the internet:\n\nhttps://sample-computer.sample-net.ts.net:8443/\n|-- proxy http://127.0.0.1:39471\n\nPress Ctrl+C to exit.\n'
    expect(funnelReady(said, 'http://127.0.0.1:39471')).toBe('https://sample-computer.sample-net.ts.net:8443')
    expect(funnelReady(said, 'http://127.0.0.1:5180')).toBeNull() // reaching something else is not ready
    expect(funnelReady('https://sample-computer.sample-net.ts.net:8443/', 'http://127.0.0.1:39471')).toBeNull()
  })

  it('says where to allow Funnel when the account has not', () => {
    expect(funnelRefused('Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n  https://login.tailscale.com/f/funnel?node=sample\n')).toMatch(/Open https:\/\/login\.tailscale\.com\/f\/funnel\?node=sample, allow it/)
    expect(funnelRefused('Available on the internet:')).toBeNull()
  })

  it('counts every port Tailscale serves already, kept or in the foreground', () => {
    const status = JSON.stringify({ TCP: { 443: { HTTPS: true } }, Foreground: { abc: { TCP: { 8443: { HTTPS: true } } } } })
    expect([...takenIn(status)].sort()).toEqual([443, 8443])
    expect(takenIn('').size).toBe(0)
  })

  it('refuses Self Evident\'s own page and its engine as what a share reaches', () => {
    expect(ownAddress('http://127.0.0.1:5180')).toBe(true)
    expect(ownAddress(`http://127.0.0.1:${process.env.PORT ?? 4000}`)).toBe(true)
    expect(ownAddress('http://127.0.0.1:39471')).toBe(false)
  })

  it('passes things on through a proxy with no guide: asked as itself, nothing added to the page', async () => {
    const origin = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }).end(`<body>host ${q.headers.host}</body>`) })
    await new Promise<void>((ok) => origin.listen(0, '127.0.0.1', () => ok()))
    const port = (origin.address() as AddressInfo).port
    const p = await guideProxy(`http://127.0.0.1:${port}`, null)
    try {
      const r = await fetch(`http://localhost:${p.port}/`, { headers: { host: 'sample-computer.sample-net.ts.net:8443' } })
      expect(await r.text()).toBe(`<body>host 127.0.0.1:${port}</body>`)
      expect((await fetch(`http://localhost:${p.port}/__self-evident/guide.json`)).status).toBe(200) // not ours to answer: it goes to the origin like anything else
    } finally { p.server.close(); origin.close() }
  })
})
