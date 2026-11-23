/**
 * The general mock server (Sandy, 2026-11-22: "how mocks get used should be really just an issue of creating
 * endpoints and then pointing the application at it … the act of creating a service is also creating the server").
 *
 * One small program that comes with Evident and serves any service: it reads the service's endpoints and
 * answers each call with that endpoint's data file from $MOCK_DATA. So a service is usable the moment it has an
 * endpoint and the variable that points the app at it; nothing is written for it, and there is no state in which
 * a service waits to be "built".
 *
 * A written server (an agent's, kept on the service: mocks.ts) is the exception, for a service whose calls depend
 * on each other (a job started, then asked about, then its results fetched for what was sent). Where a service has
 * one, it is used instead.
 *
 * The program is one file with no dependencies, so it can be copied as it is to wherever the app is run: an export,
 * and (next) a reviewer's branch, which never needs Evident.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanEndpoints, type Endpoint } from './mock-endpoints.js'
import { mocksHome, type Row } from './mocks.js'

export const GENERAL_CMD = 'node server.mjs'
/** How a service's mock is served. general: by the program here, from its endpoints. written: by a server written for it. none: it has neither. */
export type ServedBy = 'general' | 'written' | 'none'
export const servedBy = (m: Pick<Row, 'cmd' | 'status' | 'endpoints'>): ServedBy => (m.cmd && m.status !== 'needs_recording' ? 'written' : cleanEndpoints(m.endpoints).length ? 'general' : 'none')

/** The program. It listens on $PORT, reads endpoints.json beside it and its data from $MOCK_DATA, and accepts any key. */
export const GENERAL_SERVER = `// A general mock server, from Evident. One file, no dependencies: node server.mjs
// It answers each call listed in endpoints.json with that endpoint's data file from the folder $MOCK_DATA
// (<key>.<ext>, or the file the endpoint names). It holds no data of its own and accepts any key.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const endpoints = JSON.parse(fs.readFileSync(path.join(here, 'endpoints.json'), 'utf8'))
const dataDir = process.env.MOCK_DATA || path.join(here, 'data')
const TYPES = { '.json': 'application/json', '.csv': 'text/csv', '.xml': 'application/xml', '.html': 'text/html', '.txt': 'text/plain', '.jsonl': 'application/x-ndjson', '.ndjson': 'application/x-ndjson' }
const parts = (p) => p.replace(/[?#].*$/, '').split('/').filter(Boolean)
const wild = (s) => /^(\\{[^}]*\\}|:[\\w-]+|\\*)$/.test(s)
// A second step: a call made to a link an earlier answer gives. The earlier (intermediate) answer is given a link back
// to this server, at /__step/<key>, in place of whatever link its data holds; the step is answered there.
const STEP = '/__step/'
const stepsOf = (e) => endpoints.filter((x) => x.follows === e.key)
const relink = (v, field, url) => Array.isArray(v) ? v.map((x) => relink(x, field, url)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === field && typeof x === 'string' ? url : relink(x, field, url)])) : v
const find = (method, url) => { const got = parts(url); if (url.startsWith(STEP)) return endpoints.find((e) => e.follows && e.key === got[1]); return endpoints.find((e) => e.method === method && e.path.startsWith('/') && (() => { const want = parts(e.path); return want.length === got.length && want.every((w, i) => wild(w) || w === got[i]) })()) }
const fileOf = (e) => { let names = []; try { names = fs.readdirSync(dataDir).sort() } catch { return null }
  return (e.file && names.includes(e.file) ? e.file : null) ?? names.find((n) => n.startsWith(e.key + '.') && n.split('.').length === 2) ?? names.find((n) => n.startsWith(e.key + '.')) ?? null }
const send = (res, status, type, body) => { res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' }); res.end(body) }
const sorry = (res, status, error) => send(res, status, 'application/json', JSON.stringify({ error, mock: true }))

http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    const method = (req.method || 'GET').toUpperCase()
    if (method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end() }
    const e = find(method, req.url || '/')
    if (!e) { console.log(method + ' ' + req.url + ' -> 404 (not one of its endpoints)'); return sorry(res, 404, 'this mock has no endpoint ' + method + ' ' + (req.url || '/') + '. It has: ' + endpoints.map((x) => x.method + ' ' + x.path).join(', ')) }
    const f = fileOf(e)
    const steps = stepsOf(e).filter((x) => x.linkField)
    if (steps.length) {
      // Intermediate: its own data with each link pointed back here; with no data, just the links.
      const here = 'http://' + (req.headers.host || '127.0.0.1') + STEP
      let body = Object.fromEntries(steps.map((x) => [x.linkField, here + x.key]))
      if (f) { try { body = steps.reduce((v, x) => relink(v, x.linkField, here + x.key), JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))) } catch { /* not JSON: the links alone */ } }
      console.log(method + ' ' + req.url + ' -> ' + (f || 'its links') + ' (intermediate: ' + steps.map((x) => x.key).join(', ') + ')')
      return send(res, 200, 'application/json', JSON.stringify(body))
    }
    if (!f) { console.log(method + ' ' + req.url + ' -> 501 (no data)'); return sorry(res, 501, 'this mock has no data for ' + e.method + ' ' + e.path + ' yet') }
    console.log(method + ' ' + req.url + ' -> ' + f)
    send(res, 200, TYPES[path.extname(f).toLowerCase()] || 'text/plain', fs.readFileSync(path.join(dataDir, f)))
  })
}).listen(Number(process.env.PORT || 4010), process.env.HOST || '127.0.0.1')
`

/** What the program reads of a service: its endpoints, as they are. */
export const endpointsFile = (endpoints: Endpoint[]) => JSON.stringify(endpoints.map((e) => ({ key: e.key, method: e.method, path: e.path, ...(e.file ? { file: e.file } : {}), ...(e.follows ? { follows: e.follows, ...(e.linkField ? { linkField: e.linkField } : {}) } : {}) })), null, 2) + '\n'
/** The program's files for one service, as they are run and exported. */
export const generalFiles = (m: Pick<Row, 'endpoints'>): Record<string, string> => ({ 'server.mjs': GENERAL_SERVER, 'endpoints.json': endpointsFile(cleanEndpoints(m.endpoints)) })
/** Written to a folder of their own (once per version); returns it. */
export function materializeGeneral(m: Pick<Row, 'appId' | 'key' | 'endpoints'>): string {
  const files = generalFiles(m)
  const dir = join(mocksHome(), m.appId, m.key, `general-${createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12)}`)
  if (existsSync(join(dir, '.complete'))) return dir
  mkdirSync(dir, { recursive: true })
  for (const [p, t] of Object.entries(files)) writeFileSync(join(dir, p), t)
  writeFileSync(join(dir, '.complete'), '')
  return dir
}
