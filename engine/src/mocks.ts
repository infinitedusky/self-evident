/**
 * Mocks: an app's library of stand-ins for the services outside it, one per service, used by its prototypes, smoke
 * tests, main and (next) review environments (Sandy, 2026-11-20, "Reviewable pull requests", step 1).
 *
 * Why: a pull request is reviewable only if the reviewer can try it on data they can trust, and ENT-322's findings
 * come only from a paid vendor scan, so a fresh checkout shows empty screens. The made-up data and the vendor
 * stand-in we used lived in Self Evident, per prototype, and a stand-in built on a guessed shape shows only that the
 * code handles the guess. Stand-ins, recordings and scenarios were three separate things per prototype or task.
 *
 * Mock mining: a real response, recorded once (recorder.ts) and kept privately with the task (recordings.ts),
 * becomes a mock with the same shape and none of the data. The mock keeps every column, nesting, format and edge
 * case the recording showed, replaces every value with an invented one marked as sample data, and adds the people
 * the recording did not have (nothing found, one of each, a lot), so every state can be reached. The task's agent
 * writes it; the engine refuses it while any value of the recording is in it (mock-leaks.ts).
 *
 * A mock is one of:
 * - needs_recording: a service a change depends on with no mock yet, raised on the task with what a real call needs
 *   (a consenting person, a key, the cost). A mined mock whose service changed shape keeps serving and has `needs`.
 * - assumed: written from a guessed shape until there is a recording, and labelled so everywhere it shows.
 * - mined: from a recording, with its provenance.
 *
 * Its files (the server and its invented data) are kept in the database, since they hold nothing private, and are
 * written to a folder of their own when it starts (mocksHome). The recording is never copied: the row names its
 * folder. A mock serves on $PORT, and is pointed at by variables, as a stand-in is; the engine starts every mock of
 * the app with a prototype, main and a smoke test, unless the prototype has its own stand-in of the same key.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { and, asc, desc, eq, like } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, issue, mock, mockData, MOCK_STATUSES } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { checkLeaks, keptRefused, LEAKS_SHOWN, type Leak } from './mock-leaks.js'
import { recordingsDir, recordingsHome } from './recordings.js'
import { dataFor, dataNote, exportable, listData, type DataKind, type DataView } from './mock-data.js'
import { cleanEndpoints, endpointViews, type Endpoint, type EndpointView } from './mock-endpoints.js'
import { GENERAL_CMD, generalFiles, materializeGeneral, servedBy, type ServedBy } from './mock-general.js'
import { endpointData, scrubSensitive, served, servedDir, type EndpointData, type Form } from './mock-serve.js'
import { standInKey, type StandIn } from './stand-ins.js'

export type MockStatus = (typeof MOCK_STATUSES)[number]
export const mocksHome = () => process.env.MOCKS_HOME ?? join(homedir(), '.self-evident', 'mocks')
export const FILES_MAX = 60
export const BYTES_MAX = 4_000_000
const RECORDED_FILE_MAX = 40_000_000

export interface Provenance {
  /** The service and version it stands in for. */ standsInFor?: string
  /** What it was mined from, never naming the person: "one person, 42 profiles, 55 scams, 8 doxxing posts". */ minedFrom?: string
  /** What is real: the shape, in a line. */ real?: string
  /** What is invented: the values, in a line. */ invented?: string
  /** What it cannot show: the real service's latency and failures, anything the recording did not contain. */ cannotShow?: string[]
  /** The states it makes reachable: "someone with nothing found", "one of each", "a lot". */ covers?: string[]
  /** What changed since the mock it replaced, when it was mined again. */ changed?: string
  /** Values kept as they were recorded because they are shape (a status, a category). Never a person's. */ kept?: string[]
  /** The engine's: the leak check it passed. */ checked?: { at: string; files: number; values: number }
}
export interface Needs { /** Who the real call is about, and that they agree. */ person?: string; /** The key or account it needs, by name. */ key?: string; /** What one call costs. */ cost?: string; /** Why a recording is needed now: no mock, or what changed. */ why?: string; /** A real response the person may already have that would do instead of a live run, as the app reads it: "the results CSV a finished workflow links to". */ file?: string }

export type Row = typeof mock.$inferSelect
const prov = (m: Row) => (m.provenance ?? {}) as Provenance
export const day = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null)

// ---- where each is in use: told by whoever starts one ---------------------------------------------------------------

const uses = new Map<string, { label: string; appId: string; keys: string[]; real: string[] }>()
/** A prototype, main or a smoke test started with these mocks; `real`: the services it has real data from (a real response served as it is, or the service itself). */
export function noteUse(id: string, appId: string, label: string, keys: string[], real: string[] = []) { if (keys.length || real.length) uses.set(id, { label, appId, keys, real }); else uses.delete(id) }
/** The services a running thing has real data from: it must not be shared while it has any. */
export const realIn = (id: string) => uses.get(id)?.real ?? []
export function dropUse(id: string) { uses.delete(id) }
const usedBy = (appId: string, key: string) => [...uses.values()].filter((u) => u.appId === appId && u.keys.includes(key)).map((u) => u.label)

// ---- reading --------------------------------------------------------------------------------------------------------

/** Every recording of a service in this app, newest first: <recordings>/<app>/<task>/<key>/<when>/. */
export function recordingsOfService(appId: string, key: string): { dir: string; at: string; files: number; issueId: string | null }[] {
  const root = join(recordingsHome(), appId), out: { dir: string; at: string; files: number; issueId: string | null }[] = []
  let subjects: string[] = []
  try { subjects = readdirSync(root) } catch { return out }
  for (const s of subjects) {
    const k = join(root, s, key)
    let runs: string[] = []
    try { runs = readdirSync(k) } catch { continue }
    for (const r of runs) { try { const d = join(k, r); if (!statSync(d).isDirectory()) continue; out.push({ dir: d, at: statSync(d).mtime.toISOString(), files: readdirSync(d).filter((f) => f !== 'given.meta.json').length, issueId: s.startsWith('iss_') ? s : null }) } catch { /* gone */ } }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * A mock's own real responses: those of its service that came in since the mock was made. One left on this computer
 * by a mock that was removed is never taken up by the next (Sandy, 2026-11-21: "it feels like there's legacy data
 * that's hanging around"; she had removed the mock, given nothing, and the new one showed a real response and was
 * built from it). The leak check still reads every one there is (recordingsOfService): more to check against is
 * never wrong.
 */
export const recordingsFor = (m: Pick<Row, 'appId' | 'key' | 'createdAt'>) => recordingsOfService(m.appId, m.key).filter((r) => !m.createdAt || r.at >= new Date(m.createdAt.getTime() - 1000).toISOString())

/** Its provenance as a note: on the Mocks page, beside an export, and (next) in a pull request. */
export function provenanceNote(m: Pick<Row, 'name' | 'status' | 'standsInFor' | 'recordedAt' | 'minedAt'> & { provenance: unknown }): string {
  const p = (m.provenance ?? {}) as Provenance
  const list = (head: string, items: string[]) => [head, ...items.map((c) => `- ${c}`)].join('\n')
  const parts = [`# ${m.name}: a mock`, `Stands in for: ${m.standsInFor || p.standsInFor || m.name}.`]
  if (m.status === 'mined') parts.push(`Mined from: a real response recorded ${day(m.recordedAt) ?? 'on a date not kept'}${p.minedFrom ? `, ${p.minedFrom}` : ''}. Mined ${day(m.minedAt)}.`)
  else if (m.status === 'assumed') parts.push('Mined from: nothing. Its shape is assumed, written before any real response was recorded; it shows only that the code handles the guess.')
  else parts.push('Not made yet: it needs a recording of the real service.')
  parts.push(`What is real: ${p.real || (m.status === 'mined' ? 'the shape (columns, nesting, formats and edge cases)' : 'nothing')}.`)
  parts.push(`What is invented: ${p.invented || 'every value'}. Values are sample data: .example domains, invented names, prose marked "Sample data:".`)
  if (p.covers?.length) parts.push(list('It covers:', p.covers))
  parts.push(list('What it cannot show:', [...(p.cannotShow ?? []), "the real service's latency and failures"].filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)))
  if (p.kept?.length) parts.push(`Kept as recorded, because they are shape: ${p.kept.map((k) => `"${k}"`).join(', ')}.`)
  if (p.changed) parts.push(`Changed since the last one: ${p.changed}`)
  if (p.checked) parts.push(`Checked ${day(p.checked.at)}: none of the ${p.checked.values} values in the recording's ${p.checked.files} files is in this mock.`)
  return parts.join('\n\n') + '\n'
}

export interface MockView {
  key: string; name: string; status: MockStatus; standsInFor: string; upstream: string | null
  env: Record<string, string>; cmd: string | null; files: { path: string; bytes: number }[]
  provenance: Provenance; note: string; needs: Needs | null
  issue: { id: string; identifier: string; title: string } | null
  recordedAt: string | null; minedAt: string | null
  /** The newest recording, when it is newer than what the mock was mined from: waiting to be mined. */ unmined: { at: string; files: number } | null
  usedBy: string[]
  /** How it is served (mock-general.ts): by the general server straight from its endpoints, by a server written for it, or not at all (no endpoints yet). pointed: the app can be pointed at it (its variable to override is set). */ served: ServedBy; pointed: boolean
  /** How the app connects to the real service: its address, and the app's settings that hold the address and the key. */ connection: Connection
  /** What it can answer with (mock-data.ts), and which of them it serves unless a run says otherwise. */ data: DataView[]; defaultData: string | null
  /** The calls it answers, each with the real response behind it (or none: taken from the code), its files in the default data, and its data (mock-serve.ts): the app's, and a task's own where one was asked about; and the data files that are no endpoint's. */ endpoints: (EndpointView & { data: EndpointData })[]; unlinked: string[]
}
async function viewOf(m: Row, ident?: (id: string) => Promise<{ id: string; identifier: string; title: string } | null>, issueId?: string | null): Promise<MockView> {
  const recs = recordingsFor(m)
  const newest = recs[0]
  const data = await listData(m)
  const views = endpointViews(cleanEndpoints(m.endpoints), m.recording ?? newest?.dir ?? null, (data.find((d) => d.isDefault) ?? data.find((d) => d.kind !== 'real'))?.files.map((f) => f.path) ?? [], m.upstream)
  const perEndpoint = await endpointData(m, issueId)
  const unmined = newest && newest.dir !== m.recording && (!m.minedAt || newest.at > m.minedAt.toISOString()) ? { at: newest.at, files: newest.files } : null
  return {
    key: m.key, name: m.name, status: m.status as MockStatus, standsInFor: m.standsInFor, upstream: m.upstream, env: m.env ?? {}, cmd: m.cmd,
    files: Object.entries(m.files ?? {}).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text) })).sort((a, b) => a.path.localeCompare(b.path)),
    provenance: prov(m), note: provenanceNote(m), needs: (m.needs as Needs | null) ?? null,
    issue: m.issueId && ident ? await ident(m.issueId) : null,
    recordedAt: m.recordedAt?.toISOString() ?? null, minedAt: m.minedAt?.toISOString() ?? null, unmined, usedBy: usedBy(m.appId, m.key), served: servedBy(m), pointed: Object.keys(m.env ?? {}).length > 0,
    connection: connectionOf(m), data, defaultData: m.defaultData,
    endpoints: views.endpoints.map((e) => ({ ...e, data: perEndpoint[e.key] ?? { app: null, task: null } })), unlinked: views.unlinked,
  }
}
const identOf = async (id: string) => {
  const [t] = await db.select({ id: issue.id, number: issue.number, title: issue.title, appId: issue.appId }).from(issue).where(eq(issue.id, id))
  if (!t) return null
  const [a] = await db.select({ key: app.key }).from(app).where(eq(app.id, t.appId))
  return { id: t.id, identifier: `${a?.key ?? ''}-${t.number}`, title: t.title }
}

export async function listMocks(appId: string, /** A task: each endpoint also says the task's own data. */ issueId?: string | null): Promise<MockView[]> {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.name))
  return Promise.all(rows.map((m) => viewOf(m, identOf, issueId)))
}
export async function rowOf(appId: string, key: string) {
  const [m] = await db.select().from(mock).where(and(eq(mock.appId, appId), eq(mock.key, standInKey(key))))
  return m ?? null
}
export async function getMock(appId: string, key: string): Promise<MockView & { fileText: Record<string, string> }> {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  return { ...(await viewOf(m, identOf)), fileText: m.files ?? {} }
}

// ---- writing --------------------------------------------------------------------------------------------------------

export async function workspaceOf(appId: string) {
  const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError('no such app')
  return a.workspaceId
}
export const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)
const cleanEnv = (e: unknown) => Object.fromEntries(Object.entries(e && typeof e === 'object' ? e : {}).filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).trim().slice(0, 1000)]).slice(0, 30))
const cleanUrl = (u: unknown) => { const s = clip(u, 500); if (!s) return null; try { const x = new URL(s); if (!/^https?:$/.test(x.protocol)) throw new Error(); return s } catch { throw new PlanError(`"${s}" is not an address (https://…)`) } }
const cleanNeeds = (n: unknown): Needs => { const x = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>; const out: Needs = {}; for (const k of ['person', 'key', 'cost', 'why', 'file'] as const) { const v = clip(x[k], 400); if (v) out[k] = v } return out }

/**
 * A service the change depends on has no mock, or its mock is out of date: raised on the task, with what a real
 * call needs. A mock it already has keeps serving until it is mined again.
 */
export async function needsRecording(appId: string, i: { key?: string; name: string; standsInFor?: string; upstream?: string; env?: Record<string, string>; issueId?: string | null; needs?: Needs }, actor = 'agent') {
  const name = clip(i.name, 80), key = standInKey(i.key || name)
  if (!key || !name) throw new PlanError('a mock needs a name: the service it stands in for')
  const workspaceId = await workspaceOf(appId), needs = { ...cleanNeeds(i.needs), at: new Date().toISOString() }
  const old = await rowOf(appId, key)
  const set = { name, ...(i.standsInFor ? { standsInFor: clip(i.standsInFor, 200) } : {}), ...(i.upstream ? { upstream: cleanUrl(i.upstream) } : {}), ...(i.env ? { env: cleanEnv(i.env) } : {}), needs, ...(i.issueId ? { issueId: i.issueId } : {}), updatedAt: new Date() }
  await db.transaction(async (tx) => {
    if (old) await tx.update(mock).set(set).where(eq(mock.id, old.id))
    else await tx.insert(mock).values({ id: newId('run').replace(/^run_/, 'mock_'), appId, key, status: 'needs_recording', standsInFor: '', ...set })
    await appendEvent(tx, { workspaceId, appId, issueId: i.issueId ?? null, actor, type: 'mock.needs_recording', payload: { key, name, ...needs } })
  })
  return getMock(appId, key).then(({ fileText: _f, ...v }) => v)
}

/**
 * How the app connects to the real service, said as it is (Sandy, 2026-11-21: "we don't have a mock yet, so the
 * service we should be defining the way the service actually works, not how to mock it"): its real address, the
 * app's setting that holds that address, and the setting that holds its key. Pointing the app at a mock is the
 * engine's own business, worked out from these: the address setting is given the mock's (or the recorder's) address,
 * and the key setting a made-up key, so the real one is never sent to a mock. Kept as the mock's variables (`env`),
 * which is what a run reads; `others` are the rest of them (a workflow id an agent set).
 */
export interface Connection { address: string | null; addressSetting: string | null; keySetting: string | null; others: Record<string, string> }
const PLACE = /\{(container_url|url)\}/
export function connectionOf(m: Pick<Row, 'upstream' | 'env'>): Connection {
  const env = m.env ?? {}
  const addressSetting = Object.keys(env).find((k) => PLACE.test(env[k])) ?? null
  const keySetting = Object.keys(env).find((k) => k !== addressSetting && /KEY|TOKEN|SECRET|PASSWORD/i.test(k)) ?? null
  return { address: m.upstream ?? null, addressSetting, keySetting, others: Object.fromEntries(Object.entries(env).filter(([k]) => k !== addressSetting && k !== keySetting)) }
}
const SETTING = /^[A-Za-z_][A-Za-z0-9_]*$/
/** The variables a run is given, from the connection as a person states it. An app tried in containers reaches this computer by another name than localhost: read from how the app is started, and kept as it was once an agent has set it. */
async function envFromConnection(appId: string, old: Record<string, string>, i: { addressSetting?: string | null; keySetting?: string | null }): Promise<Record<string, string>> {
  const was = connectionOf({ upstream: null, env: old })
  const env: Record<string, string> = { ...was.others }
  const addr = i.addressSetting === undefined ? was.addressSetting : i.addressSetting?.trim() || null
  const key = i.keySetting === undefined ? was.keySetting : i.keySetting?.trim() || null
  for (const [what, v] of [['address', addr], ['key', key]] as const) if (v && !SETTING.test(v)) throw new PlanError(`"${v}" is not a setting's name: the ${what} setting is the name of a variable the app reads, such as ${what === 'address' ? 'VENDOR_BASE_URL' : 'VENDOR_API_KEY'}`)
  if (addr) {
    let place = was.addressSetting ? old[was.addressSetting] : null
    if (!place) { const [a] = await db.select({ setup: app.setup }).from(app).where(eq(app.id, appId)); place = /docker|compose|container|make\s+up/i.test(JSON.stringify(a?.setup ?? {})) ? '{container_url}' : '{url}' }
    env[addr] = place
  }
  if (key) env[key] = (was.keySetting && old[was.keySetting]) || 'mock-key'
  return env
}

/** Two names that are the same service written differently: SixtyFour, sixty_four, "Sixty Four". */
const alike = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** One of the app's services, by its key or by its name however it is written. None: the app has no such service. */
export async function serviceFor(appId: string, given: string): Promise<Row | null> {
  const want = alike(given)
  if (!want) return null
  const rows = await db.select().from(mock).where(eq(mock.appId, appId))
  return rows.find((m) => m.key === standInKey(given)) ?? rows.find((m) => alike(m.name) === want || alike(m.key) === want) ?? null
}
/**
 * A service the app connects to, set up in its settings (Sandy, 2026-11-21: "the services could be configured in the
 * settings, and that way … the app only has certain services it can connect to. And if we look at the code and find
 * ones that aren't in the settings, then we set them up in the settings"; and "I don't like the idea that I could
 * write 64 with an underscore and it looks like it's a different service"). A service is its mock's row: there from
 * when it is named, its mock built later by a task. A name that is one already there, written differently, is
 * refused with the one it is.
 */
export async function addService(appId: string, i: { name: string; standsInFor?: string; upstream?: string; env?: Record<string, string>; addressSetting?: string | null; keySetting?: string | null; issueId?: string | null; why?: string }, actor = 'user') {
  const name = clip(i.name, 80)
  if (!standInKey(name)) throw new PlanError('a service needs a name')
  const there = await serviceFor(appId, name)
  if (there) throw new PlanError(`that is already one of this app's services, as "${there.name}"`)
  const env = i.addressSetting || i.keySetting ? await envFromConnection(appId, i.env ?? {}, i) : i.env
  return needsRecording(appId, { name, standsInFor: i.standsInFor, upstream: i.upstream, env, issueId: i.issueId ?? null, needs: i.why ? { why: i.why } : undefined }, actor)
}

/** Its name, what it stands in for, the real service's address and the variables that point the app at it: the person's to set on the page. */
export async function setMockDetails(appId: string, key: string, i: { name?: string; standsInFor?: string; upstream?: string | null; env?: Record<string, string>; addressSetting?: string | null; keySetting?: string | null }, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  if (i.addressSetting !== undefined || i.keySetting !== undefined) i = { ...i, env: await envFromConnection(appId, i.env ?? m.env ?? {}, i) }
  const workspaceId = await workspaceOf(appId)
  const set = { ...(i.name ? { name: clip(i.name, 80) } : {}), ...(i.standsInFor !== undefined ? { standsInFor: clip(i.standsInFor, 200) } : {}), ...(i.upstream !== undefined ? { upstream: i.upstream ? cleanUrl(i.upstream) : null } : {}), ...(i.env ? { env: cleanEnv(i.env) } : {}), updatedAt: new Date() }
  await db.transaction(async (tx) => {
    await tx.update(mock).set(set).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.changed', payload: { key: m.key } })
  })
  return getMock(appId, key).then(({ fileText: _f, ...v }) => v)
}

/** A recording folder, as given (absolute, or from the recordings home), if it is one of this app's. */
export function recordingDir(appId: string, given: string): string {
  const root = resolve(recordingsHome(), appId)
  const dir = resolve(given.startsWith(sep) || given.startsWith('~') ? given.replace(/^~(?=\/)/, homedir()) : join(recordingsHome(), given))
  if (dir !== root && !dir.startsWith(root + sep)) throw new PlanError(`a mock is mined from a recording of this app, under ${root}: "${given}" is not one`)
  if (!existsSync(dir)) throw new PlanError(`there is no recording at ${dir}`)
  return dir
}
/** What was recorded there, as text: bodies only (each exchange's .meta.json holds the headers and is left out). */
export function readRecording(dir: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  const walk = (d: string, depth: number) => {
    for (const n of readdirSync(d)) {
      if (n.startsWith('.') || n.endsWith('.meta.json')) continue
      const p = join(d, n), s = statSync(p)
      if (s.isDirectory()) { if (depth < 4) walk(p, depth + 1); continue }
      if (s.size > RECORDED_FILE_MAX) throw new PlanError(`${relative(dir, p)} is over ${RECORDED_FILE_MAX / 1e6} MB: too large to check a mock against`)
      out.push({ name: relative(dir, p), text: readFileSync(p, 'utf8') })
    }
  }
  if (statSync(dir).isDirectory()) walk(dir, 0); else out.push({ name: dir.split(sep).pop()!, text: readFileSync(dir, 'utf8') })
  return out
}

function cleanFiles(given: unknown): Record<string, string> {
  if (!given || typeof given !== 'object') throw new PlanError('a mock needs its files: { "path": "text" }, the server and its invented data')
  const out: Record<string, string> = {}
  let bytes = 0
  for (const [p, t] of Object.entries(given as Record<string, unknown>)) {
    const path = normalize(p).replace(/^(\.\/)+/, '')
    if (!path || path.startsWith('..') || path.startsWith(sep) || path.includes(`${sep}..`)) throw new PlanError(`"${p}" is not a path inside the mock`)
    if (typeof t !== 'string') throw new PlanError(`${p}: a mock's files are text`)
    bytes += Buffer.byteLength(t)
    out[path] = t
  }
  if (!Object.keys(out).length) throw new PlanError('a mock needs its files: the server and its invented data')
  if (Object.keys(out).length > FILES_MAX) throw new PlanError(`a mock has ${FILES_MAX} files at most`)
  if (bytes > BYTES_MAX) throw new PlanError(`a mock's files are ${BYTES_MAX / 1e6} MB at most: invent fewer rows, keep the states`)
  return out
}

export class LeakError extends PlanError { constructor(public leaks: Leak[], public count: number) { super(`refused: ${count} value${count === 1 ? '' : 's'} from the recording ${count === 1 ? 'is' : 'are'} in the mock. Replace each with an invented one (or, for one that is shape, such as a status, name it in provenance.kept):\n${leaks.map((l) => `- ${l.file}: ${l.kind} "${l.excerpt}"`).join('\n')}${count > LEAKS_SHOWN ? `\n…and ${count - LEAKS_SHOWN} more` : ''}`) } }

/** The leak check of a mock's files against its recording; throws with the hits. */
export function assertNoLeaks(dir: string, files: Record<string, string>, kept: string[] = []) {
  const refused = keptRefused(kept)
  if (refused.length) throw new PlanError(`provenance.kept is for values that are shape (a status, a category), never an email, an address, an id, a number or prose: ${refused.join(', ')}`)
  const recorded = readRecording(dir)
  if (!recorded.length) throw new PlanError(`the recording at ${dir} is empty`)
  const r = checkLeaks(recorded, Object.entries(files).map(([path, text]) => ({ path, text })), kept)
  if (!r.ok) throw new LeakError(r.leaks, r.count)
  return r.read
}

export interface SaveMock { key?: string; name: string; standsInFor?: string; upstream?: string; status: 'mined' | 'assumed'; cmd: string; env: Record<string, string>; files: Record<string, string>; provenance: Provenance; /** mined: the recording's folder. */ recording?: string; issueId?: string | null; /** The calls it answers (mock-endpoints.ts). Left out: as they were. */ endpoints?: Endpoint[] }
/**
 * A mock written: mined from a recording (refused while any of its values is in the files), or assumed. A mined one
 * replacing a mined one says what changed. Clears what it needed.
 */
export async function saveMock(appId: string, i: SaveMock, actor = 'agent') {
  const name = clip(i.name, 80), key = standInKey(i.key || name)
  if (!key || !name) throw new PlanError('a mock needs a name: the service it stands in for')
  const cmd = clip(i.cmd, 2000)
  if (!cmd) throw new PlanError('a mock needs a command that serves it on $PORT, run in the folder its files are written to (python3 server.py)')
  if (i.status !== 'mined' && i.status !== 'assumed') throw new PlanError('status is mined (from a recording) or assumed (a guessed shape, before there is one)')
  const files = cleanFiles(i.files), env = cleanEnv(i.env)
  if (!Object.keys(env).length) throw new PlanError('a mock needs the variables that point the app at it, such as {"VENDOR_BASE_URL":"{container_url}"}')
  const p = (i.provenance ?? {}) as Provenance
  const provenance: Provenance = {
    ...(p.standsInFor ? { standsInFor: clip(p.standsInFor, 200) } : {}), ...(p.minedFrom ? { minedFrom: clip(p.minedFrom, 300) } : {}),
    real: clip(p.real, 400), invented: clip(p.invented, 400),
    cannotShow: (p.cannotShow ?? []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 12), covers: (p.covers ?? []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 20),
    ...(p.changed ? { changed: clip(p.changed, 800) } : {}), kept: (p.kept ?? []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 40),
  }
  const old = await rowOf(appId, key)
  let recording: string | null = null, recordedAt: Date | null = null
  if (i.status === 'mined') {
    if (!i.recording) throw new PlanError('a mined mock names the recording it was mined from (its folder)')
    recording = recordingDir(appId, i.recording)
    if (!provenance.minedFrom) throw new PlanError('provenance.minedFrom: what the recording held, in counts, never naming the person ("one person, 42 profiles, 55 scams")')
    if (!provenance.covers?.length) throw new PlanError('provenance.covers: the states the mock makes reachable, the people the recording did not have among them (nothing found, one of each, a lot)')
    if (old?.status === 'mined' && old.recording !== recording && !provenance.changed) throw new PlanError(`provenance.changed: this replaces the mock mined ${day(old.minedAt)}; say what changed in the shape`)
    const read = assertNoLeaks(recording, files, provenance.kept)
    provenance.checked = { at: new Date().toISOString(), ...read }
    recordedAt = statSync(recording).mtime
  }
  if (!provenance.real && i.status === 'assumed') provenance.real = 'nothing: the shape is assumed'
  const workspaceId = await workspaceOf(appId)
  const values = { name, standsInFor: clip(i.standsInFor ?? old?.standsInFor ?? '', 200), ...(i.upstream ? { upstream: cleanUrl(i.upstream) } : {}), status: i.status, cmd, env, files, ...(i.endpoints ? { endpoints: cleanEndpoints(i.endpoints) } : {}), provenance: provenance as Record<string, unknown>, needs: null, recording, recordedAt, minedAt: i.status === 'mined' ? new Date() : null, ...(i.issueId ? { issueId: i.issueId } : {}), updatedAt: new Date() }
  await db.transaction(async (tx) => {
    if (old) await tx.update(mock).set(values).where(eq(mock.id, old.id))
    else await tx.insert(mock).values({ id: newId('run').replace(/^run_/, 'mock_'), appId, key, ...values })
    await appendEvent(tx, { workspaceId, appId, issueId: i.issueId ?? null, actor, type: 'mock.saved', payload: { key, name, status: i.status, files: Object.keys(files).length, ...(provenance.checked ? { checked: provenance.checked } : {}) } })
  })
  return getMock(appId, key).then(({ fileText: _f, ...v }) => v)
}

/** files: its service's real responses are deleted from this computer with it, every one, so nothing of it is left. */
export async function removeMock(appId: string, key: string, actor = 'user', opts: { files?: boolean } = {}) {
  const m = await rowOf(appId, key)
  if (!m) return { removed: false, files: 0 }
  const workspaceId = await workspaceOf(appId)
  const real = opts.files ? recordingsOfService(appId, m.key) : []
  await db.transaction(async (tx) => { await tx.delete(mock).where(eq(mock.id, m.id)); await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.removed', payload: { key: m.key, files: real.length } }) })
  for (const r of real) rmSync(r.dir, { recursive: true, force: true })
  rmSync(join(mocksHome(), appId, m.key), { recursive: true, force: true }) // its server and the data folders written for its runs: nothing of it is left
  return { removed: true, files: real.length }
}

/** One real response of a service on this computer, for a person to see what is there and delete it. Never its contents. */
export interface RealView { /** Its folder, from the recordings home: what it is deleted by. */ id: string; at: string; given: boolean; files: { name: string; bytes: number }[]; /** From before this mock was made: it is not used by it. */ before: boolean; issueId: string | null }
export async function listReal(appId: string, key: string): Promise<RealView[]> {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  const mine = new Set(recordingsFor(m).map((r) => r.dir))
  return recordingsOfService(appId, m.key).map((r) => {
    let files: { name: string; bytes: number }[] = []
    try { files = readdirSync(r.dir).filter((f) => !f.startsWith('.') && !f.endsWith('.meta.json')).map((f) => ({ name: f, bytes: statSync(join(r.dir, f)).size })) } catch { /* gone meanwhile */ }
    return { id: relative(recordingsHome(), r.dir), at: r.at, given: isGiven(r.dir), files, before: !mine.has(r.dir), issueId: r.issueId }
  })
}
/** A real response deleted from this computer. Data that serves it as it is goes with it; a fake made from it stays, and can no longer be checked against it. */
export async function removeReal(appId: string, key: string, id: string, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  const dir = recordingDir(appId, id)
  if (!recordingsOfService(appId, m.key).some((r) => r.dir === dir)) throw new PlanError(`that is not a real response of ${m.name}`)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    const sets = await tx.select().from(mockData).where(eq(mockData.mockId, m.id))
    for (const d of sets.filter((x) => x.recording === dir)) {
      if (d.kind === 'real') { await tx.delete(mockData).where(eq(mockData.id, d.id)); if (m.defaultData === d.key) await tx.update(mock).set({ defaultData: null }).where(eq(mock.id, m.id)) }
      else await tx.update(mockData).set({ recording: null, updatedAt: new Date() }).where(eq(mockData.id, d.id))
    }
    if (m.recording === dir) await tx.update(mock).set({ recording: null, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.real_removed', payload: { key: m.key } })
  })
  rmSync(dir, { recursive: true, force: true })
  return listReal(appId, key)
}

/** One endpoint changed (its method, its path, what it answers with), or taken off the mock. Its data files keep their names: they are its by its key, which does not change. */
export async function editEndpoint(appId: string, key: string, endpoint: string, i: { method?: string; path?: string; what?: string; sensitive?: boolean } | null, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  const all = cleanEndpoints(m.endpoints), at = all.findIndex((e) => e.key === standInKey(endpoint))
  if (at < 0) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  // Sensitive is a person's to take away: an agent may mark an endpoint sensitive, never the reverse.
  if (i?.sensitive === false && all[at].sensitive && !actor.startsWith('user')) throw new PlanError('only the person can take sensitive off an endpoint: ask them to, in Settings')
  const next = i === null ? all.filter((_, n) => n !== at) : cleanEndpoints(all.map((e, n) => (n === at ? { ...e, ...(i.method ? { method: i.method } : {}), ...(i.path ? { path: i.path } : {}), ...(i.what !== undefined ? { what: i.what } : {}), ...(i.sensitive !== undefined ? { sensitive: i.sensitive } : {}) } : e)))
  if (i !== null && next.length !== all.length) throw new PlanError('an endpoint needs a path')
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mock).set({ endpoints: next, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: i === null ? 'mock.endpoint_removed' : 'mock.endpoint_changed', payload: { key: m.key, endpoint: all[at].key, ...(i?.sensitive !== undefined ? { sensitive: i.sensitive } : {}) } })
  })
  // Marked sensitive: what real response of it is on this computer is faked and deleted now.
  const scrubbed = i?.sensitive ? await scrubSensitive(appId, key, actor) : null
  return getMock(appId, key).then(({ fileText: _f, ...v }) => ({ ...v, ...(scrubbed?.failed.length ? { scrubFailed: scrubbed.failed } : {}) }))
}
/** An endpoint added to a service in the app's settings: a call the app makes to it. */
export async function addEndpoint(appId: string, key: string, i: { method?: string; path?: string; what?: string; sensitive?: boolean }, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  const all = cleanEndpoints(m.endpoints), method = clip(i.method, 10).toUpperCase() || 'GET', path = clip(i.path, 300)
  if (!path) throw new PlanError('an endpoint needs its path: /runs/{id}/status, or in words where it is reached by a link the service sends')
  if (all.some((e) => e.method === method && e.path === path)) throw new PlanError(`${m.name} already has ${method} ${path}`)
  const stem = standInKey(path.replace(/\{[^}]*\}|:[\w-]+/g, '').split('/').filter(Boolean).slice(-2).join('-')) || 'call'
  let k = stem
  for (let n = 2; all.some((e) => e.key === k); n++) k = `${stem}-${n}`
  const next = cleanEndpoints([...all, { key: k, method, path, what: i.what, sensitive: i.sensitive === true }])
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mock).set({ endpoints: next, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.endpoint_added', payload: { key: m.key, endpoint: k, method, path } })
  })
  return getMock(appId, key).then(({ fileText: _f, ...v }) => v)
}

/** A recording came in through the recorder: the mock names it, waiting to be mined. */
export async function noteRecording(appId: string, key: string, dir: string, issueId: string | null, exchanges: number) {
  const m = await rowOf(appId, key)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    if (m) await tx.update(mock).set({ needs: m.status === 'needs_recording' || m.needs ? { ...(m.needs ?? {}), recorded: dir } : m.needs, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, issueId, actor: 'engine', type: 'mock.recorded', payload: { key, exchanges } })
  })
  // What came in for a sensitive endpoint is faked and deleted before anything else reads it.
  if (m && cleanEndpoints(m.endpoints).some((e) => e.sensitive)) await scrubSensitive(appId, key).catch(() => undefined)
}

/**
 * Real responses the person already has (any body the service sent: JSON saved from a call, the results CSV it
 * links to), given instead of a live run (Sandy, 2026-11-21: "I have a copy of a CSV that I got back from SixtyFour"). Kept as a live
 * recording is, with the task, outside every repository, untouched; given.meta.json says it was given, not recorded,
 * so the miner takes any call not given from the code that makes it and says so in the provenance.
 */
export async function giveRecording(appId: string, key: string, given: { name: string; bytes: Uint8Array }[], actor = 'user', /** The endpoint they are responses of: kept under its name, so they are its. */ endpoint?: string | null, /** A task they are for alone, in place of the app's (mock-serve.ts). */ forTask?: string | null): Promise<{ dir: string; issueId: string | null; files: string[] }> {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  if (!given.length) throw new PlanError('give at least one file: a response the service sent')
  if (given.length > 20) throw new PlanError('20 files at most')
  const of = endpoint ? cleanEndpoints(m.endpoints).find((e) => e.key === standInKey(endpoint)) : null
  if (endpoint && !of) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  const names = new Set<string>()
  const files = given.map((f) => {
    if (!f.bytes.length) throw new PlanError(`${f.name} is empty`)
    if (f.bytes.length > RECORDED_FILE_MAX) throw new PlanError(`${f.name} is over ${RECORDED_FILE_MAX / 1e6} MB: too large to check a mock against`)
    if (f.bytes.includes(0)) throw new PlanError(`${f.name} is not text: give a response as the service sent it (JSON, CSV or other text)`)
    let name = (f.name.split(/[\\/]/).pop() ?? '').replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'response.txt'
    const was = name
    if (of) { const ext = /\.[A-Za-z0-9]{1,8}$/.exec(name)?.[0] ?? '.txt'; name = names.size ? `${of.key}.${names.size + 1}${ext}` : `${of.key}${ext}` }
    if (name === 'given.meta.json' || name.endsWith('.meta.json')) name = name.replace(/\.meta\.json$/, '.json')
    while (names.has(name)) name = `1-${name}`
    names.add(name)
    return { name, bytes: f.bytes, was }
  })
  const dir = join(recordingsDir(appId, { issueId: m.issueId }), key, `given-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(dir, { recursive: true })
  for (const f of files) writeFileSync(join(dir, f.name), f.bytes)
  writeFileSync(join(dir, 'given.meta.json'), JSON.stringify({ given: true, by: actor, files: files.map((f) => ({ name: f.name, bytes: f.bytes.length, ...(f.was !== f.name ? { was: f.was } : {}) })), ...(of ? { endpoint: of.key } : {}), ...(of && forTask ? { forTask } : {}), at: new Date().toISOString(), what: m.needs?.file ?? null }, null, 2))
  await noteRecording(appId, key, dir, m.issueId, files.length)
  return { dir, issueId: m.issueId, files: files.map((f) => f.name) }
}
/** Was it given by the person (a file they had), rather than recorded on a live run? */
export const isGiven = (dir: string) => existsSync(join(dir, 'given.meta.json'))

/** One change to a mock, said for a person. */
export interface MockChange { at: string; by: string; /** The task it was made for. None: the app's own (Settings). */ issue: { id: string; identifier: string } | null; what: string }
const PLACE_SAYS: Record<string, string> = { prototype: 'a prototype', smoke: 'a smoke test', review: 'a reviewer' }
const SOURCE_SAYS: Record<string, string> = { default: 'the default', live: 'the real service', replay: 'the mock, with recorded responses as they are', fake: 'the mock, with faked data', data: 'the mock' }
const changeSays = (type: string, p: Record<string, unknown>): string | null => {
  switch (type) {
    case 'mock.needs_recording': return 'Raised: it needs a real response'
    case 'mock.saved': return p.status === 'mined' ? 'Its server was built from a real response' : 'Its server was written from an assumed shape'
    case 'mock.changed': return 'Its name, address or variables were changed'
    case 'mock.recorded': return 'A real response came in'
    case 'mock.data_saved': return `Data "${p.data}" (${p.kind}) was saved`
    case 'mock.data_removed': return `Data "${p.data}" was removed`
    case 'mock.default_data': return p.data ? `Its default data became "${p.data}"` : 'It was left with no default data'
    case 'mock.removed': return `Removed, with its data and every choice made for it${Number(p.files) ? `, and its ${p.files} real response${Number(p.files) === 1 ? '' : 's'} deleted from this computer` : ''}`
    case 'mock.real_removed': return 'A real response was deleted from this computer'
    case 'mock.endpoint_added': return `The call ${p.method} ${p.path} was added`
    case 'mock.endpoint_changed': return `The call "${p.endpoint}" was changed`
    case 'mock.endpoint_removed': return `The call "${p.endpoint}" was taken off`
    case 'mock.endpoint_data_removed': return `The data of the call "${p.endpoint}" was removed${p.real ? ', with its real response' : ''}`
    case 'mock.sensitive_scrubbed': return `Real responses of sensitive calls were faked and deleted${Array.isArray(p.failed) && p.failed.length ? ` (${p.failed.length} could not be faked, and were deleted all the same)` : ''}`
    case 'mock.data_renamed': return `Data "${p.data}" was renamed`
    case 'mock.place': return `For ${PLACE_SAYS[String(p.place)] ?? p.place}: ${SOURCE_SAYS[String(p.source)] ?? p.source}${p.data ? ` "${p.data}"` : ''}`
    default: return null
  }
}
/** What has changed on a mock, newest first: the app's own defaults (no task) and what tasks did to it. Kept in the event stream, so nothing is lost when it is changed again. */
export async function mockHistory(appId: string, key: string, limit = 60): Promise<MockChange[]> {
  const rows = await db.select().from(event).where(and(eq(event.appId, appId), like(event.type, 'mock.%'))).orderBy(desc(event.seq)).limit(2000)
  const out: MockChange[] = []
  const idents = new Map<string, { id: string; identifier: string } | null>()
  for (const e of rows) {
    const p = (e.payload ?? {}) as Record<string, unknown>
    if (p.key !== standInKey(key)) continue
    const what = changeSays(e.type, p)
    if (!what) continue
    if (e.issueId && !idents.has(e.issueId)) { const t = await identOf(e.issueId); idents.set(e.issueId, t ? { id: t.id, identifier: t.identifier } : null) }
    if (e.type === 'mock.removed' && out.length) { out.push({ at: e.ts.toISOString(), by: e.actor.startsWith('user') ? 'you' : 'an agent', issue: null, what }); break } // what came before is another mock's history: this one starts where it was added again
    out.push({ at: e.ts.toISOString(), by: e.actor.startsWith('user') ? 'you' : e.actor === 'engine' ? 'the engine' : 'an agent', issue: e.issueId ? idents.get(e.issueId) ?? null : null, what })
    if (out.length >= limit) break
  }
  return out
}

// ---- running and exporting ------------------------------------------------------------------------------------------

const versionOf = (m: Row) => createHash('sha256').update(JSON.stringify([m.files, m.cmd])).digest('hex').slice(0, 12)
/** Its files written to a folder of their own (once per version); returns it. */
export function materialize(m: Pick<Row, 'appId' | 'key' | 'files' | 'cmd'>): string {
  const dir = join(mocksHome(), m.appId, m.key, versionOf(m as Row))
  if (existsSync(join(dir, '.complete'))) return dir
  for (const [p, t] of Object.entries(m.files ?? {})) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t) }
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '.complete'), '')
  return dir
}
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * The app's mocks that can serve, as stand-ins: what a prototype, main or a smoke test starts. Each is given its data
 * as the folder $MOCK_DATA, put together endpoint by endpoint (mock-serve.ts) in the form a run picks for it
 * (`pick`, by the mock's key): faked unless it says recorded. `data` says when it is on a real response.
 */
export async function libraryStandIns(appId: string, except: string[] = [], pick: Record<string, { form: Form; issueId?: string | null }> = {}): Promise<(StandIn & { mock: MockStatus; data?: { kind: DataKind } })[]> {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.key))
  const out: (StandIn & { mock: MockStatus; data?: { kind: DataKind } })[] = []
  for (const m of rows) {
    // A service with a server written for it runs that; any other with endpoints runs the general one. One the app cannot be pointed at is not started.
    const by = servedBy(m)
    if (by === 'none' || except.includes(m.key) || !Object.keys(m.env ?? {}).length) continue
    const s = await served(m, pick[m.key] ?? { form: 'faked' }), dir = servedDir(m, s), real = s.real.length > 0
    out.push({
      key: m.key, name: `${m.name} (mock${by === 'written' && m.status === 'assumed' ? ', assumed shape' : ''}${real ? ', a real response' : ''})`, what: m.standsInFor || undefined, mock: m.status as MockStatus,
      cmd: `cd ${q(by === 'written' ? materialize(m) : materializeGeneral(m))} && ${dir ? `MOCK_DATA=${q(dir)} ` : by === 'general' ? `MOCK_DATA=${q(join(mocksHome(), m.appId, m.key, 'data', 'none'))} ` : ''}${by === 'written' ? m.cmd : GENERAL_CMD}`, env: m.env ?? {},
      ...(dir ? { data: { kind: real ? 'real' as const : 'faked' as const } } : {}),
    })
  }
  return out
}

/**
 * Its files as a repository can carry them: the server, its invented data, and PROVENANCE.md and mock.json beside
 * them. Only the invented copy, never the recording; checked against the recording again when it is still here.
 */
export async function exportMock(appId: string, key: string, outDir: string, dataKey?: string | null): Promise<{ dir: string; files: string[]; checked: boolean; data: string | null }> {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  const by = servedBy(m)
  if (by === 'none') throw new PlanError(`${m.name} has no endpoints yet, so there is nothing to export`)
  let checked = false
  if (by === 'written' && m.status === 'mined' && m.recording && existsSync(m.recording)) { assertNoLeaks(m.recording, m.files, prov(m).kept); checked = true }
  // Its data goes beside the server, in data/: the set named, else each endpoint's safe data as the app has it. Never a real response.
  const d = dataKey ? await dataFor(m, dataKey) : null
  const data: Record<string, string> = {}, notes: string[] = []
  if (d) { const e = exportable(m, d); checked = checked || e.checked; for (const [p, t] of Object.entries(e.files)) data[join('data', p)] = t }
  else {
    const sets = (await db.select().from(mockData).where(eq(mockData.mockId, m.id))).filter((x) => x.kind !== 'real' && !((x.provenance ?? {}) as { scope?: { task?: string } }).scope?.task)
    const out = await served(m, { form: 'faked' })
    for (const f of out.files) if (f.text !== undefined) data[join('data', f.name)] = f.text
    for (const x of sets.filter((x) => Object.entries(x.files).some(([n, t]) => data[join('data', n)] === t))) { checked = exportable(m, x).checked || checked; notes.push(`\nIts data ("${x.name}"): ${dataNote(x)}\n`) } // every fake in it checked once more
  }
  const carried = !d && Object.keys(data).length > 0
  const note = provenanceNote(m) + (d ? `\nIts data ("${d.name}"): ${dataNote(d)}\n` : notes.join(''))
  const files: Record<string, string> = { ...(by === 'written' ? m.files : generalFiles(m)), ...data, 'PROVENANCE.md': note, 'mock.json': JSON.stringify({ key: m.key, name: m.name, standsInFor: m.standsInFor, status: m.status, served: by, cmd: by === 'written' ? m.cmd : GENERAL_CMD, env: m.env, endpoints: cleanEndpoints(m.endpoints), ...(d ? { data: { key: d.key, kind: d.kind, dir: 'data', variable: 'MOCK_DATA' } } : carried ? { data: { kind: 'faked', dir: 'data', variable: 'MOCK_DATA' } } : {}) }, null, 2) + '\n' }
  for (const [p, t] of Object.entries(files)) { const f = join(outDir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t) }
  return { dir: outDir, files: Object.keys(files).sort(), checked, data: d?.key ?? (carried ? 'faked' : null) }
}

/** What the app's own agent (the conversation about the app as a whole) is told: it can set the services up with the person. */
export function servicesPrompt(list: Pick<MockView, 'key' | 'name' | 'served' | 'endpoints'>[]): string {
  return `\n\nThe app's outside services (Settings › Mocks) are yours to set up with the person, with the service tool: a service is a name, what it is, its real address and the environment variable the app reads that address from; under it are its endpoints, each one call the app makes to it, each with its own data. A service with an endpoint and its variable can be used at once by a prototype or a smoke test: a general server answers each call with that endpoint's data, and nothing is written for it. Read the code to find the calls, the address and the variable rather than asking for them; mark an endpoint sensitive when its answers hold what is someone's; never put a real response, or a value from one, in an endpoint's data or a message. ${list.length ? `The app has: ${list.map((m) => `${m.name} (${m.key}; ${m.endpoints.length} endpoint${m.endpoints.length === 1 ? '' : 's'}${m.served === 'written' ? ', a server written for it' : ''})`).join(', ')}.` : 'The app has none yet.'}`
}
/** What a prototype's agent (and a task's) is told of the library, before it builds. */
export function mocksPrompt(list: (Pick<MockView, 'key' | 'name' | 'status' | 'standsInFor' | 'needs' | 'recordedAt' | 'unmined' | 'data' | 'defaultData'> & { served?: ServedBy })[]): string {
  const dataSays = (m: (typeof list)[number]) => (m.data?.length ? `. Data: ${m.data.map((d) => `${d.key} (${d.kind}${d.key === m.defaultData ? ', the default' : ''})`).join(', ')}` : '')
  const says = (m: (typeof list)[number]) => `- ${m.name} (${m.key}): ${m.status === 'mined' ? `a server written for it, from a real response of ${day(m.recordedAt)}` : m.status === 'assumed' ? 'a server written for it from an assumed shape, no real response yet' : m.served === 'general' ? 'served by the general server, straight from its endpoints\' data' : 'no endpoints yet'}${m.needs && m.status !== 'needs_recording' ? '; out of date, needs a new one' : ''}${m.unmined ? '; a newer real response waits to be used' : ''}${m.standsInFor ? `. Stands in for ${m.standsInFor}` : ''}${dataSays(m)}`
  return `\n\nMocks: the app's own code is what goes live, and is never changed to be tried; what stands outside it is swapped by settings alone. For each outside service the app keeps a mock: a small server that behaves as the service does, and, apart from it, the data it answers with (read from $MOCK_DATA). A service needs no server written for it: once it has endpoints, a general server answers each call with that endpoint's data file as it is. Write a server (the mock tool, op save) only where that cannot be right, because the service's calls depend on each other (a job started, then asked about, then answered for exactly what was sent), and say so. The data which is a real response served as it is (this computer only), a fake of one, or invented. The engine starts every mock that can serve with each prototype, main and smoke test, pointing the app at it by its variables. ${list.length ? `The app has:\n${list.map(says).join('\n')}` : 'The app has none yet.'}\nThe app's services are set up in its settings, and the service tool reads and changes them as the person does there: add a service, its real address and the environment variable to override, its endpoints, and an endpoint's data. Research is where they are found: when you read the code and a service's documentation to research a change, add every call you find the app making (or about to make) to its service as an endpoint, with what it answers with, and mark one sensitive when its answers hold what is someone's. A service the code calls that the settings lack is added there. Say what you added in the research notes.\nBefore you build, name each outside service the change depends on. One that has a mock: use it, and do not set up a stand-in of your own for it; where this change needs data it lacks (a person with nothing found, a job that never finishes), add it with mock_data. One with no mock, or whose mock lacks the calls or fields the change needs: raise it with the mock tool, op needs_recording, saying what a real call needs (a consenting person, a key, the cost). First read the code that calls the service, to see how its answer reaches the app: say in needs.file which responses would do, in a line the person will recognise ("the results CSV a finished workflow links to", "the JSON a lookup returns"): they may already have one saved from a real run and can give it instead of paying for another, and the calls around it are taken from the code. A live run records the whole exchange, so ask for one when the flow itself is in question. Until then you may write one with op save, status assumed, from the service's documentation or the code that calls it, and say where the shape is assumed. Never put a real response, or any value from one, in a mock, its data or the repository.`
}
