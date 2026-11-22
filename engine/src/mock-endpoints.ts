/**
 * A mock's endpoints, and which response answers which (Sandy, 2026-11-21: "there's some data that we're storing …
 * that's a response. That has to map on to an endpoint, right? … I'm looking at one and there's nowhere that I can
 * see that it is linked to a specific endpoint. So if there were ten, how would it know which one this is?").
 *
 * Until now the link was inside the server's code: it served "the CSV in the data folder". With ten calls nobody
 * could see which had a real response behind it and which were taken from the code. So a mock lists the calls the
 * app makes to its service, each with a key, and a data file belongs to exactly one of them by its name:
 * `<key>.<ext>` is that endpoint's response, and `<key>.<anything>.<ext>` is more of the same added by hand (the
 * person with nothing found). An endpoint may instead name its file outright (`file`), for one kept under the name
 * it came with. A file that is no endpoint's is said to be unlinked.
 *
 * Where an endpoint's shape came from is read, not claimed: a real response given for it, one recorded in a live
 * run (the recorder notes every call's method and address), or neither, in which case it is taken from the code
 * that calls it. A recorded run's files are numbered in the order they came; `keyed` gives the same responses under
 * their endpoints' names, so the server and the faker read a recorded run and a given file the same way.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { standInKey } from './stand-ins.js'

export interface Endpoint {
  /** A short name: its data files are named by it. */ key: string
  method: string
  /** As the app calls it, from the service's address: /workflows/runs/{id}/live_status. One reached by a link the service sends (a signed download) says so in words instead. */ path: string
  /** What it answers with, in a line. */ what?: string
  /** Its response's file, when that is not named <key>.<ext>. */ file?: string
  /** Sensitive (Sandy, 2026-11-22): a real response of it is never stored. One that comes in is faked at once and the original deleted, so only a faked copy is ever kept or served. */ sensitive?: boolean
}
export const ENDPOINTS_MAX = 80
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

export function cleanEndpoints(given: unknown): Endpoint[] {
  if (!Array.isArray(given)) return []
  const out: Endpoint[] = []
  for (const x of given as Record<string, unknown>[]) {
    const key = standInKey(String(x?.key ?? '')), path = clip(x?.path, 300)
    if (!key || !path || out.some((e) => e.key === key)) continue
    out.push({ key, method: clip(x.method, 10).toUpperCase() || 'GET', path, ...(clip(x.what, 300) ? { what: clip(x.what, 300) } : {}), ...(clip(x.file, 200) ? { file: clip(x.file, 200) } : {}), ...(x.sensitive === true ? { sensitive: true } : {}) })
    if (out.length >= ENDPOINTS_MAX) break
  }
  return out
}
/** Is this file that endpoint's? */
export const isFileOf = (e: Endpoint, name: string) => name === e.file || name.startsWith(`${e.key}.`)
/** Which endpoint a data file answers, if any. An outright `file` wins over a name that happens to start alike. */
export const endpointOfFile = (endpoints: Endpoint[], name: string) => endpoints.find((e) => e.file === name) ?? endpoints.find((e) => isFileOf(e, name)) ?? null

const segments = (p: string) => p.replace(/[?#].*$/, '').split('/').filter(Boolean)
const wild = (s: string) => /^(\{[^}]*\}|:[\w-]+|\*)$/.test(s)
/** Which endpoint a call is: the same method, and the same path with {id}, :id or * standing for any one part. */
export function endpointFor(endpoints: Endpoint[], method: string, path: string): Endpoint | null {
  const got = segments(path)
  return endpoints.find((e) => {
    if (e.method !== method.toUpperCase() || !e.path.startsWith('/')) return false
    const want = segments(e.path)
    return want.length === got.length && want.every((w, i) => wild(w) || w === got[i])
  }) ?? null
}

export interface Exchange { no: string; method: string; address: string; status: number | null; response: string | null }
/** The calls a live run recorded there, in order (recorder.ts); none for a folder of files a person gave. */
export function exchangesOf(dir: string): Exchange[] {
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return [] }
  const out: Exchange[] = []
  for (const n of names.filter((f) => /^\d{3}-.*\.meta\.json$/.test(f)).sort()) {
    try {
      const meta = JSON.parse(readFileSync(join(dir, n), 'utf8')) as { method?: string; address?: string; status?: number }
      const no = n.slice(0, 3)
      out.push({ no, method: String(meta.method ?? 'GET').toUpperCase(), address: String(meta.address ?? ''), status: typeof meta.status === 'number' ? meta.status : null, response: names.find((f) => f.startsWith(`${no}.response.`)) ?? null })
    } catch { /* not one of ours */ }
  }
  return out
}
/** The endpoint a recorded call was to: by its path on the service's own address; one to another address (a link the service sent) is the endpoint described in words, when there is exactly one. */
export function endpointOfExchange(endpoints: Endpoint[], x: Exchange, upstream?: string | null): Endpoint | null {
  let u: URL
  try { u = new URL(x.address) } catch { return null }
  let home = true
  if (upstream) { try { home = new URL(upstream).host === u.host } catch { /* compare by path alone */ } }
  if (home) { const base = upstream ? segments(new URL(upstream).pathname).length : 0; const e = endpointFor(endpoints, x.method, `/${segments(u.pathname).slice(base).join('/')}`) ?? endpointFor(endpoints, x.method, u.pathname); if (e) return e }
  const linked = endpoints.filter((e) => !e.path.startsWith('/') && e.method === x.method)
  return !home && linked.length === 1 ? linked[0] : null
}

/**
 * A real response's folder as a server and the faker read it: a recorded run's responses under their endpoints'
 * names (the last answer of each as <key>.<ext>, the earlier ones as <key>.<n>.<ext>), in a folder of its own
 * inside the recording, made once per list of endpoints. A folder of given files, or a run with no endpoint matched,
 * is itself.
 */
export function keyed(dir: string, endpoints: Endpoint[], upstream?: string | null): string {
  const calls = exchangesOf(dir).filter((x) => x.response)
  if (!calls.length || !endpoints.length) return dir
  const named = new Map<string, Exchange[]>()
  for (const x of calls) { const e = endpointOfExchange(endpoints, x, upstream); if (e) named.set(e.key, [...(named.get(e.key) ?? []), x]) }
  if (!named.size) return dir
  const stamp = Buffer.from(JSON.stringify([endpoints.map((e) => [e.key, e.method, e.path]), calls.map((x) => x.no)])).toString('base64url').slice(-24)
  const out = join(dir, `.by-endpoint-${stamp}`)
  if (existsSync(join(out, '.complete'))) return out
  mkdirSync(out, { recursive: true })
  for (const [key, xs] of named) xs.forEach((x, i) => copyFileSync(join(dir, x.response!), join(out, i === xs.length - 1 ? `${key}${extname(x.response!)}` : `${key}.${i + 1}${extname(x.response!)}`)))
  writeFileSync(join(out, '.complete'), '')
  return out
}

export interface EndpointView extends Endpoint {
  /** The real response behind it, on this computer: given by a person or recorded in a live run. None: its shape is taken from the code that calls it. */ real: { at: string; how: 'given' | 'recorded' } | null
  /** Its files in the data the mock serves by default. */ files: string[]
}
/** Each endpoint with what is behind it: read from the real response's folder and the default data's file names. */
export function endpointViews(endpoints: Endpoint[], recording: string | null, dataFiles: string[], upstream?: string | null): { endpoints: EndpointView[]; /** Data files that are no endpoint's. */ unlinked: string[] } {
  let given: string[] = [], at = ''
  const calls = recording ? exchangesOf(recording) : []
  if (recording) { try { given = readdirSync(recording).filter((f) => !f.startsWith('.') && !f.endsWith('.meta.json')); at = statSync(recording).mtime.toISOString() } catch { /* not on this computer */ } }
  const recorded = new Set(calls.filter((x) => x.response).map((x) => endpointOfExchange(endpoints, x, upstream)?.key).filter(Boolean))
  return {
    endpoints: endpoints.map((e) => ({
      ...e,
      real: recorded.has(e.key) ? { at, how: 'recorded' as const } : !calls.length && given.some((f) => isFileOf(e, f)) ? { at, how: 'given' as const } : null,
      files: dataFiles.filter((f) => endpointOfFile(endpoints, f)?.key === e.key).sort(),
    })),
    unlinked: endpoints.length ? dataFiles.filter((f) => !endpointOfFile(endpoints, f)).sort() : [],
  }
}
