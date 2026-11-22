/**
 * A mock's data, kept apart from its server (Sandy, 2026-11-21; SHAPE.md "A mock is a server plus data").
 *
 * The server behaves as the service does and is the same wherever the mock runs. What it answers with is read from
 * the folder $MOCK_DATA, and that is the only thing a prototype, a smoke test and a reviewer's copy differ by. A
 * mock has any number of data sets, each one of:
 *
 * - real: a real response (recorded in a live run, or a file the person gave), served as it is, straight from its
 *   folder under the recordings home. On this computer only: it has no files in the database, is never exported and
 *   never shared.
 * - faked: made from a real response by the faker (fake.ts), with the same file names, so the same server reads
 *   either. Checked against the response it came from (mock-leaks.ts) when it is made, when it is changed and when
 *   it is exported.
 * - invented: written by hand (an agent adding the person with nothing found), or given by a person who states it
 *   holds nothing real. Checked against every real response of that service on this computer; where there is none,
 *   the statement is all there is, and the provenance says so.
 *
 * One of them is the mock's default: what it serves unless a run says otherwise.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { mock, mockData, MOCK_DATA_KINDS } from './db/schema.js'
import { appendEvent } from './events.js'
import { fake, type FakePlan, type FakeReport } from './fake.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { checkLeaks, keptRefused, LEAKS_SHOWN, type Leak } from './mock-leaks.js'
import { clip, day, isGiven, mocksHome, readRecording, recordingDir, recordingsFor, recordingsOfService, rowOf, workspaceOf, type Row } from './mocks.js'
import { cleanEndpoints, keyed } from './mock-endpoints.js'
import { standInKey } from './stand-ins.js'

export type DataKind = (typeof MOCK_DATA_KINDS)[number]
export type DataRow = typeof mockData.$inferSelect
export const DATA_FILES_MAX = 60
export const DATA_BYTES_MAX = 16_000_000
/** How many of a service's real responses an invented set is checked against: the newest. */
const CHECKED_AGAINST = 5

/** Whose data it is, when it is one endpoint's alone: the app's (Settings), or one task's own, in place of the app's. */
export interface Scope { endpoint: string; task?: string }
/** The key such data is kept under. It is found by its scope, never by this name. */
export const scopeKey = (kind: 'faked' | 'provided', sc: Scope) => standInKey(`${kind}-${sc.endpoint.slice(0, 22)}-${createHash('sha256').update(`${sc.endpoint}|${sc.task ?? ''}`).digest('hex').slice(0, 8)}`)
/** What a folder of given responses says of itself: the endpoint they are responses of, and the task they are for alone. */
export function scopeOfRecording(dir: string): Scope | undefined {
  try { const meta = JSON.parse(readFileSync(join(dir, 'given.meta.json'), 'utf8')) as { endpoint?: string; forTask?: string }; return meta.endpoint ? { endpoint: meta.endpoint, ...(meta.forTask ? { task: meta.forTask } : {}) } : undefined } catch { return undefined }
}
export interface DataProvenance {
  /** One endpoint's data alone, and whose. None: a set across the mock's endpoints (a whole recorded run, faked together). */ scope?: Scope
  /** faked from a response that was not kept, because its endpoint is sensitive: when. */ discarded?: string
  /** The real response it is, or was made from. */ from?: { at: string; given: boolean; files: number }
  /** faked: the files the faker made. Any other file in the set was added by hand, and is kept when the fake is made again. */ fakedFiles?: string[]
  /** faked: what the faker did. */ faked?: { replaced: number; kept: number; byKind: Record<string, number> }
  /** Values left as they were because they are structure. */ kept?: string[]
  /** When it was last checked against a real response, and how much of one. */ checked?: { at: string; files: number; values: number; against: number }
  /** invented: a person said it holds nothing real. */ stated?: { by: string; at: string }
}
export interface DataView {
  key: string; name: string; kind: DataKind
  files: { path: string; bytes: number }[]
  provenance: DataProvenance; /** In a line, for a page and for a pull request. */ note: string
  /** May it leave this computer (a reviewer's copy, a public link)? Never a real one. */ shareable: boolean
  isDefault: boolean; issueId: string | null; updatedAt: string | null
}
const provOf = (d: DataRow) => (d.provenance ?? {}) as DataProvenance

/** What a data set is, in a line. */
export function dataNote(d: Pick<DataRow, 'kind' | 'provenance'>): string {
  const p = (d.provenance ?? {}) as DataProvenance
  const from = p.from ? `a real response ${p.from.given ? 'the person gave' : 'recorded'} ${day(p.from.at)}` : 'a real response'
  if (d.kind === 'real') return `${from[0].toUpperCase()}${from.slice(1)}, served as it is. On this computer only: never exported, never shared.`
  const checked = p.checked ? ` Checked ${day(p.checked.at)}: none of the ${p.checked.values} values of ${p.checked.against === 1 ? 'that response' : `the ${p.checked.against} real responses on this computer`} is in it.` : ''
  if (d.kind === 'faked') return `${p.discarded ? 'Faked from a real response that was not kept, because this call is marked sensitive' : `Faked from ${from}`}: its structure is real, and ${p.faked ? `${p.faked.replaced} values were replaced` : 'its values were replaced'}${p.kept?.length ? `. Kept as they were, because they are structure: ${p.kept.slice(0, 20).map((k) => `"${k}"`).join(', ')}` : ''}.${checked}`
  return `${p.stated ? `Provided by ${p.stated.by === 'user' ? 'a person' : p.stated.by}, who states it holds nothing real` : 'Written by hand, invented'}.${checked || (p.stated ? ' Not checked: there is no real response of this service on this computer to check it against.' : '')}`
}
function viewOf(d: DataRow, m: Pick<Row, 'defaultData'>): DataView {
  return {
    key: d.key, name: d.name, kind: d.kind as DataKind,
    files: Object.entries(d.files ?? {}).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text) })).sort((a, b) => a.path.localeCompare(b.path)),
    provenance: provOf(d), note: dataNote(d), shareable: d.kind !== 'real', isDefault: m.defaultData === d.key, issueId: d.issueId, updatedAt: (d.updatedAt ?? d.createdAt)?.toISOString() ?? null,
  }
}
const rowsOf = (mockId: string) => db.select().from(mockData).where(eq(mockData.mockId, mockId)).orderBy(asc(mockData.key))
export async function listData(m: Pick<Row, 'id' | 'defaultData'>): Promise<DataView[]> { return (await rowsOf(m.id)).map((d) => viewOf(d, m)) }
async function mockOf(appId: string, key: string) {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no mock "${key}"`)
  return m
}
const dataRow = async (mockId: string, key: string) => (await db.select().from(mockData).where(and(eq(mockData.mockId, mockId), eq(mockData.key, key))))[0] ?? null

function cleanData(given: unknown): Record<string, string> {
  if (!given || typeof given !== 'object') throw new PlanError('data is { "path": "text" }: the files a server finds under $MOCK_DATA')
  const out: Record<string, string> = {}
  let bytes = 0
  for (const [p, t] of Object.entries(given as Record<string, unknown>)) {
    const path = normalize(p).replace(/^(\.\/)+/, '')
    if (!path || path.startsWith('..') || path.startsWith(sep) || path.includes(`${sep}..`)) throw new PlanError(`"${p}" is not a path inside the data`)
    if (typeof t !== 'string') throw new PlanError(`${p}: data is text`)
    bytes += Buffer.byteLength(t)
    out[path] = t
  }
  if (!Object.keys(out).length) throw new PlanError('data needs at least one file')
  if (Object.keys(out).length > DATA_FILES_MAX) throw new PlanError(`data is ${DATA_FILES_MAX} files at most`)
  if (bytes > DATA_BYTES_MAX) throw new PlanError(`data is ${DATA_BYTES_MAX / 1e6} MB at most`)
  return out
}
const leaksSay = (leaks: Leak[], count: number) => `${leaks.map((l) => `- ${l.file}: ${l.kind} "${l.excerpt}"`).join('\n')}${count > LEAKS_SHOWN ? `\n…and ${count - LEAKS_SHOWN} more` : ''}`
/** The newest real response of a service on this computer, or the one named. */
function realOf(m: Pick<Row, 'appId' | 'key' | 'endpoints' | 'upstream' | 'createdAt'>, given?: string | null) {
  const appId = m.appId, key = m.key
  const dir = given ? recordingDir(appId, given) : recordingsFor(m)[0]?.dir // its own: never one left by a mock that was removed
  if (!dir) throw new PlanError(`there is no real response of ${key} on this computer: give one, or record a live run`)
  // A recorded run is read under its endpoints' names (mock-endpoints.ts), so a fake of it has the names a server looks for.
  const recorded = readRecording(keyed(dir, cleanEndpoints(m.endpoints), m.upstream))
  if (!recorded.length) throw new PlanError(`the real response at ${dir} is empty`)
  return { dir, recorded, from: { at: statSync(dir).mtime.toISOString(), given: isGiven(dir), files: recorded.length } }
}
async function keep(m: Row, key: string, values: { name: string; kind: DataKind; files: Record<string, string>; recording: string | null; plan: Record<string, unknown>; provenance: DataProvenance; issueId?: string | null }, actor: string, old: DataRow | null) {
  const workspaceId = await workspaceOf(m.appId)
  const { issueId, ...rest } = values
  const set = { ...rest, provenance: rest.provenance as Record<string, unknown>, ...(issueId ? { issueId } : {}), updatedAt: new Date() }
  await db.transaction(async (tx) => {
    if (old) await tx.update(mockData).set(set).where(eq(mockData.id, old.id))
    else await tx.insert(mockData).values({ id: newId('run').replace(/^run_/, 'mdata_'), mockId: m.id, key, ...set })
    // A mock with one data set serves it: the first one made is the default.
    if (!m.defaultData && !old && !values.provenance.scope?.task) await tx.update(mock).set({ defaultData: key, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId: m.appId, issueId: issueId ?? null, actor, type: 'mock.data_saved', payload: { key: m.key, data: key, kind: values.kind, files: Object.keys(values.files).length } })
  })
  const [fresh] = await db.select().from(mock).where(eq(mock.id, m.id))
  return viewOf((await dataRow(m.id, key))!, fresh)
}
const dataKeyOf = (given: string | undefined, fallback: string) => { const k = standInKey(given || fallback); if (!k) throw new PlanError('a data set needs a name'); return k }

/** A real response served as it is: this computer only. */
export async function useReal(appId: string, key: string, i: { recording?: string; dataKey?: string; name?: string; issueId?: string | null } = {}, actor = 'agent') {
  const m = await mockOf(appId, key), dk = dataKeyOf(i.dataKey, 'real')
  const old = await dataRow(m.id, dk)
  if (old && old.kind !== 'real') throw new PlanError(`"${dk}" is ${old.kind} data: a real response is kept under another name`)
  const { dir, from } = realOf(m, i.recording)
  return keep(m, dk, { name: clip(i.name, 80) || old?.name || 'The real response', kind: 'real', files: {}, recording: dir, plan: {}, provenance: { from }, issueId: i.issueId }, actor, old)
}

const strings = (x: unknown, max: number) => (Array.isArray(x) ? x.map((v) => clip(v, 120)).filter(Boolean).slice(0, max) : undefined)
/**
 * A fake made from a real response: the faker, then the leak check on what it made. Refused, with what was found,
 * while a real value is still in it; the plan is what to change (a column kept that holds someone's, a site kept).
 * The salt is made once and kept, so faking the same response again changes nothing that the plan did not.
 */
export async function fakeData(appId: string, key: string, i: { recording?: string; plan?: FakePlan; dataKey?: string; name?: string; issueId?: string | null } = {}, actor = 'agent'): Promise<{ data: DataView; report: Omit<FakeReport, 'keptValues'> }> {
  const m = await mockOf(appId, key)
  const { dir, recorded, from } = realOf(m, i.recording)
  // A response given for one endpoint is faked into that endpoint's own data (and a task's own, where it was given for the task alone).
  const scope = i.dataKey ? undefined : scopeOfRecording(dir)
  const dk = dataKeyOf(i.dataKey, scope ? scopeKey('faked', scope) : 'faked')
  const old = await dataRow(m.id, dk)
  if (old && old.kind !== 'faked') throw new PlanError(`"${dk}" is ${old.kind} data: a fake is kept under another name`)
  const given = (i.plan ?? {}) as FakePlan
  const plan: FakePlan = {
    keep: strings(given.keep, 200), keepValues: strings(given.keepValues, 200), keepHosts: strings(given.keepHosts, 60), text: strings(given.text, 200),
    ...(given.varyCounts === false ? { varyCounts: false } : {}), salt: typeof old?.plan?.salt === 'string' ? old.plan.salt : randomBytes(16).toString('hex'),
  }
  const { files: made, report } = fake(recorded, plan)
  // What was added to the fake by hand (the person with nothing found, in a file of their own) stays when it is made again.
  const was = old ? provOf(old).fakedFiles ?? Object.keys(old.files) : []
  const files = { ...(old ? Object.fromEntries(Object.entries(old.files).filter(([p]) => !was.includes(p) && !(p in made))) : {}), ...made }
  const refused = keptRefused(report.keptValues)
  if (refused.length) throw new PlanError(`the plan keeps values that are someone's, not structure: ${refused.slice(0, 10).map((r) => `"${r.slice(0, 30)}"`).join(', ')}. Take their column out of keep`)
  const r = checkLeaks(recorded, Object.entries(files).map(([path, text]) => ({ path, text })), report.keptValues)
  if (!r.ok) throw new PlanError(`refused: the fake still carries ${r.count} value${r.count === 1 ? '' : 's'} of the real response. Change the plan (a column in keep that holds someone's, a value in keepValues, a site in keepHosts whose address is the person's), or name a column in text to replace it whole:\n${leaksSay(r.leaks, r.count)}`)
  const { keptValues, ...rest } = report
  const data = await keep(m, dk, {
    name: clip(i.name, 80) || old?.name || (scope ? `Faked: ${scope.endpoint}` : 'Faked from the real response'), kind: 'faked', files: cleanData(files), recording: dir, plan: plan as Record<string, unknown>,
    provenance: { ...(scope ? { scope } : {}), from, fakedFiles: Object.keys(made).sort(), faked: { replaced: report.replaced, kept: report.kept, byKind: report.byKind }, kept: keptValues.slice(0, 200), checked: { at: new Date().toISOString(), files: r.read.files, values: r.read.values, against: 1 } },
    issueId: scope?.task ?? i.issueId,
  }, actor, old)
  return { data, report: rest }
}

/**
 * A real response of a sensitive endpoint: faked at once, and the original never stored (Sandy, 2026-11-22: "if
 * they're marked as sensitive, you aren't able to store non-faked"). The plan is the one this endpoint's fake
 * already had, else the mock's whole-run fake's, else none (everything not plainly structure is replaced). Refused,
 * with nothing kept at all, while the leak check finds a real value in what the faker made.
 */
export async function fakeGiven(appId: string, key: string, i: { endpoint: string; recorded: { name: string; text: string }[]; issueId?: string | null; given?: boolean }, actor = 'user'): Promise<{ data: DataView; maybeStructure: string[] }> {
  const m = await mockOf(appId, key)
  const scope: Scope = { endpoint: i.endpoint, ...(i.issueId ? { task: i.issueId } : {}) }
  const dk = scopeKey('faked', scope)
  const old = await dataRow(m.id, dk)
  const base = (old?.kind === 'faked' ? old : await dataRow(m.id, scopeKey('faked', { endpoint: i.endpoint })) ?? await dataRow(m.id, 'faked'))?.plan as FakePlan | undefined
  const plan: FakePlan = { keep: strings(base?.keep, 200), keepValues: strings(base?.keepValues, 200), keepHosts: strings(base?.keepHosts, 60), text: strings(base?.text, 200), ...(base?.varyCounts === false ? { varyCounts: false } : {}), salt: typeof old?.plan?.salt === 'string' ? old.plan.salt : randomBytes(16).toString('hex') }
  const { files: made, report } = fake(i.recorded, plan)
  const nothing = 'Nothing of it was kept: this call is sensitive, so a real response is never stored'
  if (keptRefused(report.keptValues).length) throw new PlanError(`the plan keeps values that are someone's, not structure. ${nothing}`)
  const r = checkLeaks(i.recorded, Object.entries(made).map(([path, text]) => ({ path, text })), report.keptValues)
  if (!r.ok) throw new PlanError(`refused: the fake would still carry ${r.count} value${r.count === 1 ? '' : 's'} of the real response. ${nothing}. Ask the task's agent to say what is structure, then give it again:\n${leaksSay(r.leaks, r.count)}`)
  const now = new Date().toISOString()
  const data = await keep(m, dk, {
    name: old?.name || `Faked: ${i.endpoint}`, kind: 'faked', files: cleanData(made), recording: null, plan: plan as Record<string, unknown>,
    provenance: { scope, discarded: now, from: { at: now, given: i.given !== false, files: i.recorded.length }, fakedFiles: Object.keys(made).sort(), faked: { replaced: report.replaced, kept: report.kept, byKind: report.byKind }, kept: report.keptValues.slice(0, 200), checked: { at: now, files: r.read.files, values: r.read.values, against: 1 } },
    issueId: i.issueId,
  }, actor, old)
  return { data, maybeStructure: report.maybeStructure }
}

/**
 * Data written or given as files. A faked set changed by hand (the person with nothing found, added) stays faked
 * and is checked against the response it came from. Anything else is invented: checked against the newest real
 * responses of the service on this computer, and where there is none, only `stated` (a person's word that it holds
 * nothing real) lets it be kept.
 */
export async function saveData(appId: string, key: string, i: { dataKey: string; name?: string; files: Record<string, string>; stated?: boolean; issueId?: string | null; /** One endpoint's data alone, and whose. */ scope?: Scope }, actor = 'agent') {
  const m = await mockOf(appId, key), dk = dataKeyOf(i.dataKey, '')
  const old = await dataRow(m.id, dk)
  if (old?.kind === 'real') throw new PlanError(`"${dk}" is a real response: it is not written over. Keep invented data under another name`)
  const files = cleanData(i.files), mine = Object.entries(files).map(([path, text]) => ({ path, text }))
  const now = new Date().toISOString()
  if (old?.kind === 'faked' && old.recording && existsSync(old.recording)) {
    const recorded = readRecording(old.recording), kept = provOf(old).kept ?? []
    const r = checkLeaks(recorded, mine, kept)
    if (!r.ok) throw new PlanError(`refused: ${r.count} value${r.count === 1 ? '' : 's'} of the real response ${r.count === 1 ? 'is' : 'are'} in it. Replace each with an invented one:\n${leaksSay(r.leaks, r.count)}`)
    return keep(m, dk, { name: clip(i.name, 80) || old.name, kind: 'faked', files, recording: old.recording, plan: old.plan ?? {}, provenance: { ...provOf(old), checked: { at: now, files: r.read.files, values: r.read.values, against: 1 } }, issueId: i.issueId }, actor, old)
  }
  const real = recordingsOfService(appId, m.key).slice(0, CHECKED_AGAINST)
  // What is structure for this service is already known: what the mock's server and its fakes were allowed to keep.
  const kept = [...new Set([...(((m.provenance ?? {}) as { kept?: string[] }).kept ?? []), ...(await rowsOf(m.id)).flatMap((d) => provOf(d).kept ?? [])])]
  let values = 0, read = 0
  for (const rec of real) {
    const recorded = readRecording(rec.dir)
    const r = checkLeaks(recorded, mine, kept)
    if (!r.ok) throw new PlanError(`refused: ${r.count} value${r.count === 1 ? '' : 's'} of a real response of ${m.name} ${r.count === 1 ? 'is' : 'are'} in it, so it is not invented. Replace each, or fake that response instead:\n${leaksSay(r.leaks, r.count)}`)
    values += r.read.values; read += r.read.files
  }
  if (!real.length && !i.stated) throw new PlanError(`there is no real response of ${m.name} on this computer to check this against: it is kept only when a person states it holds nothing real (stated: true, from the person, never assumed)`)
  const provenance: DataProvenance = { ...(i.scope ? { scope: i.scope } : old ? (provOf(old).scope ? { scope: provOf(old).scope } : {}) : {}), ...(real.length ? { checked: { at: now, files: read, values, against: real.length } } : {}), ...(i.stated ? { stated: { by: actor, at: now } } : {}) }
  return keep(m, dk, { name: clip(i.name, 80) || old?.name || dk, kind: 'invented', files, recording: null, plan: {}, provenance, issueId: i.issueId }, actor, old)
}

/** Which data the mock serves unless a run says otherwise. */
export async function setDefaultData(appId: string, key: string, dataKey: string | null, actor = 'user') {
  const m = await mockOf(appId, key)
  if (dataKey && !(await dataRow(m.id, standInKey(dataKey)))) throw new PlanError(`${m.name} has no data "${dataKey}"`)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mock).set({ defaultData: dataKey ? standInKey(dataKey) : null, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.default_data', payload: { key: m.key, data: dataKey } })
  })
  return listData((await rowOf(appId, key))!)
}
/** A set's name changed: what a person calls it. Its key, by which runs and tasks choose it, stays. */
export async function renameData(appId: string, key: string, dataKey: string, name: string, actor = 'user') {
  const m = await mockOf(appId, key), d = await dataRow(m.id, standInKey(dataKey))
  if (!d) throw new PlanError(`${m.name} has no data "${dataKey}"`)
  if (!clip(name, 80)) throw new PlanError('a data set needs a name')
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mockData).set({ name: clip(name, 80), updatedAt: new Date() }).where(eq(mockData.id, d.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.data_renamed', payload: { key: m.key, data: d.key } })
  })
  return listData((await rowOf(appId, key))!)
}
export async function removeData(appId: string, key: string, dataKey: string, actor = 'user') {
  const m = await mockOf(appId, key), d = await dataRow(m.id, standInKey(dataKey))
  if (!d) return { removed: false }
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.delete(mockData).where(eq(mockData.id, d.id))
    if (m.defaultData === d.key) await tx.update(mock).set({ defaultData: null, updatedAt: new Date() }).where(eq(mock.id, m.id))
    await appendEvent(tx, { workspaceId, appId, actor, type: 'mock.data_removed', payload: { key: m.key, data: d.key } })
  })
  return { removed: true }
}

/** The folder a server is given as $MOCK_DATA: a real response's own, or the set's files written out (once per version). */
export function dataDir(m: Pick<Row, 'appId' | 'key' | 'endpoints' | 'upstream'>, d: Pick<DataRow, 'key' | 'kind' | 'files' | 'recording'>): string {
  if (d.kind === 'real') {
    if (!d.recording || !existsSync(d.recording)) throw new PlanError(`the real response "${d.key}" of ${m.key} is not on this computer: it is never moved with the app. Use faked data, or give the response again`)
    return keyed(d.recording, cleanEndpoints(m.endpoints), m.upstream)
  }
  const dir = join(mocksHome(), m.appId, m.key, 'data', `${d.key}-${createHash('sha256').update(JSON.stringify(d.files)).digest('hex').slice(0, 12)}`)
  if (existsSync(join(dir, '.complete'))) return dir
  for (const [p, t] of Object.entries(d.files ?? {})) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t) }
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '.complete'), '')
  return dir
}
/** The data a mock is to serve: the one named, else its default; none when it has no data of its own. */
export async function dataFor(m: Row, dataKey?: string | null): Promise<DataRow | null> {
  const key = dataKey ? standInKey(dataKey) : m.defaultData
  if (!key) return null
  const d = await dataRow(m.id, key)
  if (!d && dataKey) throw new PlanError(`${m.name} has no data "${dataKey}"`)
  return d
}
/** Data as a repository may carry it: never a real response; a fake checked once more while what it came from is still here. */
export function exportable(m: Pick<Row, 'name'>, d: DataRow): { files: Record<string, string>; checked: boolean } {
  if (d.kind === 'real') throw new PlanError(`"${d.key}" of ${m.name} is a real response: it never leaves this computer. Fake it, and export the fake`)
  let checked = false
  if (d.kind === 'faked' && d.recording && existsSync(d.recording)) {
    const r = checkLeaks(readRecording(d.recording), Object.entries(d.files).map(([path, text]) => ({ path, text })), provOf(d).kept ?? [])
    if (!r.ok) throw new PlanError(`refused: ${r.count} value${r.count === 1 ? '' : 's'} of the real response ${r.count === 1 ? 'is' : 'are'} in "${d.key}":\n${leaksSay(r.leaks, r.count)}`)
    checked = true
  }
  return { files: d.files, checked }
}
