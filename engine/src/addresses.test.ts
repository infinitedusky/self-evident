/** A page that calls an address fixed to this computer: what is read, what is left out, and what is said. Made-up pages (sample). */
import { describe, expect, it } from 'vitest'
import { fixedAddresses, fixedOf, fixedSays, forgetFixed, localAddresses, type Get } from './addresses.js'

describe('addresses fixed to this computer', () => {
  it('are read from a text: each origin with its first path segment, once, a dev server\'s own left out', () => {
    expect(localAddresses('env: {"PUBLIC_API_URL":"http://localhost:6500/api"}; fetch("http://127.0.0.1:6500/api/v1/employees")')).toEqual(['http://localhost:6500/api'])
    expect(localAddresses('const api = `http://localhost:3000/api`; ws = "http://localhost:6500/@vite/client"; x = "https://example.test/api"')).toEqual(['http://localhost:3000/api'])
    expect(localAddresses('nothing here, and /api is a path (sample)')).toEqual([])
  })

  const page = (over: Record<string, string | null>): Get => async (url) => ({
    'http://localhost:6500': '<html><link rel="canonical" href="http://localhost:6500"><script src="/assets/app.js"></script><script src="https://cdn.example.test/x.js"></script><script src="/@vite/client"></script></html>',
    'http://localhost:6500/assets/app.js': 'const API = "http://localhost:6500/api"; const OTHER = "http://localhost:3000/api"',
    ...over,
  }[url] ?? null)

  it('are found in the page and the scripts it names on its own address; its own home is not a call', async () => {
    const asked: string[] = []
    const get = page({}); const spy: Get = (u) => { asked.push(u); return get(u) }
    expect(await fixedAddresses('http://localhost:6500/', spy)).toEqual(['http://localhost:6500/api', 'http://localhost:3000/api'])
    expect(asked).toEqual(['http://localhost:6500', 'http://localhost:6500/assets/app.js']) // not another site's script, not the dev server's own
    expect(await fixedAddresses('http://localhost:6500', page({ 'http://localhost:6500/assets/app.js': 'fetch("/api/v1/employees")' }))).toEqual([]) // called by a path: nothing to say
    expect(await fixedAddresses('http://localhost:6500', async () => null)).toEqual([]) // not answering: nothing is claimed
  })

  it('are looked for once as it comes up, told the first time, and said with what to do', async () => {
    let looks = 0; const told: string[][] = []
    const get: Get = (u) => { if (u === 'http://localhost:6500') looks++; return page({})(u) }
    forgetFixed('smoke:sample')
    expect(await fixedOf('smoke:sample', 'http://localhost:6500', (f) => { told.push(f) }, get)).toHaveLength(2)
    expect(await fixedOf('smoke:sample', 'http://localhost:6500', (f) => { told.push(f) }, get)).toHaveLength(2)
    expect(looks).toBe(1); expect(told).toHaveLength(1)
    const says = fixedSays(['http://localhost:6500/api', 'http://localhost:3000/api'], 'http://localhost:6500')
    expect(says).toContain('`http://localhost:6500/api`, `http://localhost:3000/api`'); expect(says).toContain('1 of them is not on this run\'s port (6500), so it may be talking to another copy')
    expect(says).toContain('call it by a path (`/api`)')
    expect(fixedSays(['http://localhost:6500/api'], 'http://localhost:6500')).not.toContain('another copy')
  })
})
