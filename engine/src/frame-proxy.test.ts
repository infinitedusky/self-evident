import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FRAME_SCRIPT_PATH, frameFor, localPort, stopFrames, withScript } from './frame-proxy.js'

describe('the proxy a view is shown through', () => {
  let app: http.Server, base = '', frame = ''
  beforeAll(async () => {
    app = http.createServer((req, res) => {
      if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><head><title>t</title></head><body>hi</body></html>'); return }
      if (req.url === '/away') { res.writeHead(302, { location: `${base}/orders` }); res.end(); return }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ path: req.url, host: req.headers.host }))
    })
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r))
    base = `http://localhost:${(app.address() as AddressInfo).port}`
    frame = (await frameFor(base))!
  })
  afterAll(() => { stopFrames(); app.close() })

  it('puts its script first in each page', async () => {
    const html = await (await fetch(`${frame}/`)).text()
    expect(html).toContain(`<head><script src="${FRAME_SCRIPT_PATH}"></script><title>`)
    expect(await (await fetch(`${frame}${FRAME_SCRIPT_PATH}`)).text()).toContain("selfEvident: 'at'")
  })
  it('passes everything else through as it is', async () => {
    expect(await (await fetch(`${frame}/api/x?y=1`)).json()).toMatchObject({ path: '/api/x?y=1' })
  })
  it('keeps a redirect to the app inside the proxy', async () => {
    const r = await fetch(`${frame}/away`, { redirect: 'manual' })
    expect(r.headers.get('location')).toBe(`${frame}/orders`)
  })
  it('is the same proxy each time, and only for this computer', async () => {
    expect(await frameFor(base)).toBe(frame)
    expect(await frameFor('https://example.com')).toBeNull()
    expect(localPort('http://127.0.0.1:5173/x')).toBe(5173)
  })
  it('puts the script in a page with no head too', () => {
    expect(withScript('<p>x</p>')).toBe(`<script src="${FRAME_SCRIPT_PATH}"></script><p>x</p>`)
  })
})
