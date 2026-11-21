import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { redact, rewriteLinks, startRecorder, targetOf } from './recorder.js'

describe('the pure parts', () => {
  it('keeps no secret header', () => {
    expect(redact({ 'X-API-Key': 'k1', authorization: 'Bearer t', 'content-type': 'application/json', 'x-session-token': 's' })).toEqual({ 'x-api-key': '(sent, not kept)', authorization: '(sent, not kept)', 'content-type': 'application/json', 'x-session-token': '(sent, not kept)' })
  })
  it('sends a rewritten link back where it came from, and anything else under the base URL', () => {
    const via = rewriteLinks({ links: [{ download_url: 'https://storage.example.com/b/run.csv?sig=1' }], note: 'see https://x.example inside prose' }, 'http://host.docker.internal:5000') as { links: { download_url: string }[]; note: string }
    expect(via.note).toBe('see https://x.example inside prose')
    const path = via.links[0].download_url.replace('http://host.docker.internal:5000', '')
    expect(targetOf('https://api.example.com/v1', path)).toBe('https://storage.example.com/b/run.csv?sig=1')
    expect(targetOf('https://api.example.com/v1/', '/jobs?x=1')).toBe('https://api.example.com/v1/jobs?x=1')
  })
})

describe('a recorded run', () => {
  let upstream: Server, base = '', home = ''
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'rec-'))
    process.env.RECORDINGS_HOME = home
    upstream = createServer((req, res) => {
      if (req.headers['x-api-key'] !== 'secret-key') { res.writeHead(401); return res.end() }
      if (req.url === '/jobs') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ job_id: 'j1', download_url: `${base}/files/out.csv` })) }
      if (req.url === '/files/out.csv') { res.writeHead(200, { 'content-type': 'text/csv' }); return res.end('name,email\nSample Person,sample@acme.example\n') }
      res.writeHead(404); res.end()
    })
    await new Promise<void>((r) => upstream.listen(0, () => r()))
    base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  })
  afterAll(() => { upstream.close(); delete process.env.RECORDINGS_HOME; rmSync(home, { recursive: true, force: true }) })

  it('passes calls on, follows the download link through itself, and keeps both raw with no key', async () => {
    const rec = await startRecorder({ appId: 'app_t', issueId: 'iss_t', key: 'vendor', upstream: base })
    const self = `http://127.0.0.1:${rec.port}`
    const job = await (await fetch(`${self}/jobs`, { method: 'POST', headers: { 'x-api-key': 'secret-key', 'content-type': 'application/json' }, body: JSON.stringify([{ email: 'sample@acme.example' }]) })).json() as { download_url: string }
    expect(job.download_url.startsWith(`${self}/__via/`)).toBe(true)
    expect(await (await fetch(job.download_url, { headers: { 'x-api-key': 'secret-key' } })).text()).toContain('Sample Person')
    const { dir, exchanges } = await rec.stop()
    expect(exchanges).toBe(2)
    expect(dir!.startsWith(join(home, 'app_t', 'iss_t', 'vendor'))).toBe(true)
    const files = readdirSync(dir!).sort()
    expect(files).toHaveLength(5)
    expect(files).toEqual(expect.arrayContaining(['001-jobs.meta.json', '001.request.json', '001.response.json', '002.response.csv']))
    expect(files.some((f) => /^002-.*\.meta\.json$/.test(f))).toBe(true)
    expect(readFileSync(join(dir!, '001.response.json'), 'utf8')).toContain(`${base}/files/out.csv`) // as it came, not rewritten
    const all = files.map((f) => readFileSync(join(dir!, f), 'utf8')).join('\n')
    expect(all).not.toContain('secret-key')
    expect(JSON.parse(readFileSync(join(dir!, '001-jobs.meta.json'), 'utf8'))).toMatchObject({ method: 'POST', status: 200, request: { headers: { 'x-api-key': '(sent, not kept)' } } })
  })

  it('leaves no folder when nothing came through', async () => {
    const rec = await startRecorder({ appId: 'app_t', key: 'idle', upstream: base })
    expect(await rec.stop()).toEqual({ dir: null, exchanges: 0 })
  })
})
