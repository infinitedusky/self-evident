/**
 * What a mock answers with, endpoint by endpoint (Sandy, 2026-11-22: "in settings each service has, top to bottom,
 * definition, the default data source mock or real, then a place to add endpoints where you define endpoints and set
 * the mock data. Then on the data tab all of those would be set and you could override").
 *
 * Data sits on the endpoint. The app's settings hold each endpoint's data, and a task may put its own in place of
 * it for one endpoint without touching the others. An endpoint's data has up to two forms:
 *
 * - recorded: a real response as it came (given by a person, or recorded in a live run). This computer only.
 * - safe: a fake of the recorded one, or a file a person provided and states holds nothing real.
 *
 * A place that runs on the mock (mock-places.ts) says which form it is served: faked unless a person turns recorded
 * on for their own prototype or smoke test, and never recorded for a reviewer. A sensitive endpoint has no recorded
 * form at all: a real response of it is faked the moment it arrives and the original is not stored.
 *
 * Underneath, the data is where it was (mock-data.ts, recordings on disk); this module reads it per endpoint, and
 * writes the folder a server is given as $MOCK_DATA: the safe files written out, the recorded ones as links into
 * their recording, so deleting a real response takes it out of everything that served it.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue, mock, mockData, taskService } from './db/schema.js'
import { newId } from './ids.js'
import { appendEvent } from './events.js'
import { PlanError } from './issues.js'
import { dataNote, fakeData, fakeGiven, saveData, scopeKey, scopeOfRecording, type DataProvenance, type DataRow, type Scope } from './mock-data.js'
import { looksCsv, parseCsv } from './mock-leaks.js'
import { csvRecords, withFilePeople, type FromFile } from './mock-file-map.js'
import { testFileText, type UsePlace } from './test-files.js'
import { cleanEndpoints, endpointOfExchange, endpointOfFile, exchangesOf, keyed, type Endpoint } from './mock-endpoints.js'
import { day, giveRecording, isGiven, mocksHome, recordingsFor, rowOf, workspaceOf, type Row } from './mocks.js'
import { recordingsHome } from './recordings.js'
import { standInKey } from './stand-ins.js'

export type Form = 'faked' | 'recorded'
/** One endpoint's data at one level: the app's, or a task's own. */
export interface EndpointItem {
  /** The real response behind it on this computer. id: its folder from the recordings home. */ recorded: { id: string; at: string; how: 'given' | 'recorded'; files: string[] } | null
  /** What may leave this computer: a fake of the recorded one, or a file provided as holding nothing real. */ safe: { kind: 'faked' | 'provided'; set: string; files: string[]; note: string; /** Its other files, each for another fixture's people or for none: what a start from that fixture is served instead. */ also?: { set: string; fixture: string | null; who: string | null }[]; /** The column names of its first file: what can be set from a fixture. */ columns: string[]; /** The fixture person it was made for (fixtures.ts). */ madeFor?: { fixture: string; table: string; who: string; people: number; map: Record<string, string> }; /** Fields mapped from a file of the fixtures, worked out when it is served (mock-file-map.ts). */ fromFile?: FromFile; /** Faked from a response that is no longer the newest one. */ stale?: boolean } | null
}
export interface EndpointData { /** The app's: set in its settings. */ app: EndpointItem | null; /** This task's own, in place of the app's. */ task: EndpointItem | null; /** Do a person's own runs get its faked version? The app's answer (faked unless it says otherwise), and this task's own where it has one. A reviewer always gets the faked one. */ faked: { app: boolean; task: boolean | null } }

const visible = (dir: string) => { try { return readdirSync(dir).filter((f) => !f.startsWith('.') && !f.endsWith('.meta.json')).sort() } catch { return [] as string[] } }
const prov = (d: DataRow) => (d.provenance ?? {}) as DataProvenance
const filesOf = (endpoints: Endpoint[], e: string, names: string[]) => names.filter((f) => endpointOfFile(endpoints, f)?.key === e).sort()

/** A task's own answers to "the faked version?", endpoint by endpoint. */
async function taskFaked(mockId: string, issueId?: string | null): Promise<Record<string, boolean>> {
  if (!issueId) return {}
  const [t] = await db.select({ faked: taskService.faked }).from(taskService).where(and(eq(taskService.issueId, issueId), eq(taskService.mockId, mockId)))
  return t?.faked ?? {}
}
interface Read { m: Row; endpoints: Endpoint[]; sets: DataRow[]; recs: { dir: string; at: string; view: string; names: string[]; scope?: Scope; given: boolean }[] }
async function read(m: Row): Promise<Read> {
  const endpoints = cleanEndpoints(m.endpoints)
  const sets = (await db.select().from(mockData).where(eq(mockData.mockId, m.id)).orderBy(asc(mockData.key))).filter((d) => d.kind !== 'real')
  const recs = recordingsFor(m).map((r) => { const view = keyed(r.dir, endpoints, m.upstream); return { dir: r.dir, at: r.at, view, names: visible(view), scope: scopeOfRecording(r.dir), given: isGiven(r.dir) } })
  return { m, endpoints, sets, recs }
}
const newest = (a: DataRow, b: DataRow) => (b.updatedAt ?? b.createdAt ?? new Date(0)).getTime() - (a.updatedAt ?? a.createdAt ?? new Date(0)).getTime()

const columnsOfFirst = (files: Record<string, string>, names: string[]): string[] => { const t = files[names[0]] ?? ''; if (looksCsv(t)) return parseCsv(t.slice(0, 200_000).split(/\r?\n/)[0] ?? '')[0] ?? []; try { const v = JSON.parse(t) as unknown; const o = Array.isArray(v) ? v[0] : v; return o && typeof o === 'object' ? Object.keys(o as object).slice(0, 200) : [] } catch { return [] } }
/**
 * Which of an endpoint's data files is served (Sandy, 2026-11-24: "should you be able to do multiple of the same
 * endpoint tied to different fixtures?"). An endpoint may hold several: each made for one fixture's people, or for
 * none. The fixture a run starts from picks: the file made for it; else one made for no fixture; else whatever the
 * order gives. Started empty (null), a file made for no fixture comes first. Not said (undefined): the order alone,
 * as before there was a choice. `ordered` is the candidates, best first by the rules that were already there.
 */
export function pickForFixture<T>(ordered: T[], fixtureOf: (x: T) => string | null, fixture: string | null | undefined): T | undefined {
  if (fixture === undefined) return ordered[0]
  return (fixture ? ordered.find((x) => fixtureOf(x) === fixture) : undefined) ?? ordered.find((x) => fixtureOf(x) === null) ?? ordered[0]
}
const madeForOf = (d: DataRow) => (prov(d) as { madeFor?: NonNullable<NonNullable<EndpointItem['safe']>['madeFor']> }).madeFor ?? null

function itemOf(r: Read, e: string, task: string | null, fixture?: string | null): EndpointItem | null {
  const rec = r.recs.find((x) => (x.scope?.task ?? null) === task && filesOf(r.endpoints, e, x.names).length)
  const mine = r.sets.filter((d) => (prov(d).scope?.task ?? null) === task && filesOf(r.endpoints, e, Object.keys(d.files ?? {})).length)
  // The endpoint's own data first, then the mock's default set, then whatever was made last.
  const scoped = mine.filter((d) => prov(d).scope?.endpoint === e).sort(newest), dflt = mine.find((d) => d.key === r.m.defaultData), rest = [...mine].sort(newest)
  const ordered = [...new Set(task ? rest : [...scoped, ...(dflt ? [dflt] : []), ...rest])]
  const set = pickForFixture(ordered, (d) => madeForOf(d)?.fixture ?? null, fixture)
  // The endpoint's other files, by the fixture each is for: what a different start would be served.
  const also = ordered.filter((d) => d !== set).map((d) => ({ set: d.key, fixture: madeForOf(d)?.fixture ?? null, who: madeForOf(d)?.who ?? null }))
  if (!rec && !set) return null
  return {
    recorded: rec ? { id: relative(recordingsHome(), rec.dir), at: rec.at, how: rec.given ? 'given' : 'recorded', files: filesOf(r.endpoints, e, rec.names) } : null,
    safe: set ? { ...(also.length ? { also } : {}), kind: set.kind === 'faked' ? 'faked' : 'provided', set: set.key, files: filesOf(r.endpoints, e, Object.keys(set.files)), note: dataNote(set), columns: columnsOfFirst(set.files, filesOf(r.endpoints, e, Object.keys(set.files))), ...((prov(set) as { madeFor?: NonNullable<EndpointItem['safe']>['madeFor'] }).madeFor ? { madeFor: (prov(set) as { madeFor?: NonNullable<EndpointItem['safe']>['madeFor'] }).madeFor } : {}), ...((prov(set) as { fromFile?: FromFile }).fromFile ? { fromFile: (prov(set) as { fromFile?: FromFile }).fromFile } : {}), ...(set.kind === 'faked' && rec && set.recording && set.recording !== rec.dir ? { stale: true } : {}) } : null,
  }
}
/** Every endpoint's data: the app's, and (for a task) the task's own. */
export async function endpointData(m: Row, issueId?: string | null, /** The fixture in play: which of each endpoint's files is shown as served. Not said: the order alone. */ fixture?: string | null): Promise<Record<string, EndpointData>> {
  const r = await read(m), own = await taskFaked(m.id, issueId)
  return Object.fromEntries(r.endpoints.map((e) => [e.key, { app: itemOf(r, e.key, null, fixture), task: issueId ? itemOf(r, e.key, issueId, fixture) : null, faked: { app: !e.useReal || !!e.sensitive, task: e.sensitive ? null : own[e.key] ?? null } }]))
}

export interface Served {
  /** The files of $MOCK_DATA: text written out, or a link to a real response's file. */ files: { name: string; text?: string; link?: string }[]
  /** Endpoints answered with a real response as it is. '*': a mock with no endpoints listed, on its whole real response. */ real: string[]
  /** Endpoints with a real response and no fake of it yet, where a fake was asked for: nothing is served for them. */ unfaked: string[]
  /** Which kind each endpoint got. */ per: Record<string, { from: 'app' | 'task'; kind: 'recorded' | 'faked' | 'provided' | 'none' }>
}
/**
 * What a mock is given to answer with. form faked: every endpoint's faked (or provided) data, as a reviewer and an
 * export get. form recorded: a person's own run, where each endpoint says for itself whether it is answered with
 * its real response (the task's own answer, else the app's; faked unless it says otherwise; never for a sensitive one).
 */
export async function served(m: Row, o: { form: Form; issueId?: string | null; /** Where it is served: which version of a mapped file it answers for. Not said: a reviewer's, the fake. */ place?: UsePlace | 'review'; /** The fixture the run's database was built from (null: started empty): each endpoint serves the file made for it, where it has one. Not said: the order alone. */ fixture?: string | null } = { form: 'faked' }): Promise<Served> {
  const r = await read(m), ownFaked = o.form === 'recorded' ? await taskFaked(m.id, o.issueId) : {}
  const out: Served = { files: [], real: [], unfaked: [], per: {} }
  const put = (f: Served['files'][number]) => { out.files = [...out.files.filter((x) => x.name !== f.name), f] }
  const base = r.sets.filter((d) => !prov(d).scope?.task)
  const whole = base.find((d) => d.key === m.defaultData) ?? base.find((d) => d.key === 'faked') ?? base.sort(newest)[0]
  if (!r.endpoints.length) {
    // A mock from before endpoints were listed: its whole real response, or its whole safe set.
    const rec = r.recs.find((x) => !x.scope?.task)
    if (whole) for (const [n, t] of Object.entries(whole.files)) put({ name: n, text: t })
    else if (rec?.names.length) out.unfaked = ['*']
    return out
  }
  // Files that are no endpoint's (a mock built before a file was one endpoint's) still go with the set they are in.
  for (const e of r.endpoints) {
    const own = o.issueId ? itemOf(r, e.key, o.issueId, o.fixture) : null
    const item = own ?? itemOf(r, e.key, null, o.fixture), from = own ? 'task' as const : 'app' as const
    if (!item) { out.per[e.key] = { from, kind: 'none' }; continue }
    const level = own ? o.issueId! : null
    const real = o.form === 'recorded' && !e.sensitive && !(ownFaked[e.key] ?? !e.useReal)
    if (real && item.recorded) {
      const rec = r.recs.find((x) => relative(recordingsHome(), x.dir) === item.recorded!.id)!
      for (const n of item.recorded.files) put({ name: n, link: join(rec.view, n) })
      out.real.push(e.key); out.per[e.key] = { from, kind: 'recorded' }
    } else if (item.safe) {
      const set = r.sets.find((d) => d.key === item.safe!.set && (prov(d).scope?.task ?? null) === level)!
      // Fields mapped from a file: the file's people, in the version this place uses, are who it answers for.
      const p = prov(set) as DataProvenance & { fromFile?: FromFile; madeFor?: unknown; template?: Record<string, string> }
      const src = p.fromFile ? await testFileText(m.appId, o.issueId ?? null, o.place ?? 'review', p.fromFile.file) : null
      const people = src ? csvRecords(src.text).rows : []
      for (const n of item.safe.files) put({ name: n, text: people.length ? withFilePeople(p.template?.[n] ?? set.files[n], set.files[n], people, p.fromFile!.map, !!p.madeFor) : set.files[n] })
      if (people.length && src!.version === 'real') out.real.push(e.key) // a real person's name is in what it answers with: this computer only
      out.per[e.key] = { from, kind: item.safe.kind }
    } else { out.unfaked.push(e.key); out.per[e.key] = { from, kind: 'none' } }
  }
  // They are not mixed in with a real response: that is served as it came.
  if (whole && !out.real.length) for (const [n, t] of Object.entries(whole.files)) if (!endpointOfFile(r.endpoints, n) && !out.files.some((f) => f.name === n)) put({ name: n, text: t })
  return out
}
/** The folder a server is given as $MOCK_DATA, made once per content. None: it has no data, and answers with what its own files hold. */
export function servedDir(m: Pick<Row, 'appId' | 'key'>, s: Served): string | null {
  if (!s.files.length) return null
  const stamp = s.files.map((f) => [f.name, f.link ? `${f.link}@${(() => { try { return statSync(f.link).mtimeMs } catch { return 0 } })()}` : createHash('sha256').update(f.text ?? '').digest('hex')]).sort()
  const dir = join(mocksHome(), m.appId, m.key, 'data', `served-${createHash('sha256').update(JSON.stringify(stamp)).digest('hex').slice(0, 12)}`)
  if (existsSync(join(dir, '.complete'))) return dir
  rmSync(dir, { recursive: true, force: true })
  for (const f of s.files) {
    const p = join(dir, f.name)
    mkdirSync(dirname(p), { recursive: true })
    if (f.link) symlinkSync(f.link, p); else writeFileSync(p, f.text ?? '')
  }
  writeFileSync(join(dir, '.complete'), '')
  return dir
}

// ---- giving and taking away one endpoint's data ----------------------------------------------------------------------

async function endpointOf(appId: string, key: string, endpoint: string) {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no service "${key}"`)
  const e = cleanEndpoints(m.endpoints).find((x) => x.key === standInKey(endpoint))
  if (!e) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  return { m, e }
}
const textOf = (f: { name: string; bytes: Uint8Array }) => { if (f.bytes.includes(0)) throw new PlanError(`${f.name} is not text: give a response as the service sent it (JSON, CSV or other text)`); return Buffer.from(f.bytes).toString('utf8') }
const named = (e: Endpoint, files: { name: string; bytes: Uint8Array }[]) => files.map((f, i) => { const ext = /\.[A-Za-z0-9]{1,8}$/.exec(f.name)?.[0] ?? '.txt'; return { name: i ? `${e.key}.${i + 1}${ext}` : `${e.key}${ext}`, text: textOf(f) } })

/**
 * Data given for one endpoint: for the app (its settings), or for one task alone, in place of the app's.
 * real: a response the service sent. It is kept on this computer and faked by the task's agent; for a sensitive
 * endpoint it is faked here and now and not kept. Otherwise the person states it holds nothing real, and it is used
 * as it is (checked against the service's real responses on this computer where there are any).
 */
export async function giveEndpointData(appId: string, key: string, endpoint: string, files: { name: string; bytes: Uint8Array }[], o: { real: boolean; issueId?: string | null; /** Not real: a person states it holds nothing real. An agent cannot state that: what it writes is kept only when it could be checked against a real response. */ stated?: boolean }, actor = 'user') {
  const { m, e } = await endpointOf(appId, key, endpoint)
  if (!files.length) throw new PlanError('give at least one file')
  const scope: Scope = { endpoint: e.key, ...(o.issueId ? { task: o.issueId } : {}) }
  if (!o.real) {
    await saveData(appId, key, { dataKey: scopeKey('provided', scope), name: `Provided: ${e.method} ${e.path}`.slice(0, 80), files: Object.fromEntries(named(e, files).map((f) => [f.name, f.text])), stated: o.stated !== false, issueId: o.issueId ?? null, scope }, actor)
    return { kept: 'provided' as const, faked: false }
  }
  if (e.sensitive) { const r = await fakeGiven(appId, key, { endpoint: e.key, recorded: named(e, files), issueId: o.issueId ?? null }, actor); return { kept: 'faked' as const, faked: true, maybeStructure: r.maybeStructure } }
  const r = await giveRecording(appId, key, files, actor, e.key, o.issueId ?? null)
  return { kept: 'recorded' as const, faked: false, dir: r.dir, files: r.files.length, /** Whose agent makes the fake. */ issueId: o.issueId ?? r.issueId }
}

/**
 * Whether a person's own runs get an endpoint's faked version: the app's answer (its settings), or one task's own.
 * null: the task's own taken away, so it follows the app again (for the app: back to faked). A sensitive endpoint
 * is always faked.
 */
export async function setEndpointFaked(appId: string, key: string, endpoint: string, faked: boolean | null, issueId: string | null, actor = 'user') {
  const { m, e } = await endpointOf(appId, key, endpoint)
  if (faked === false && e.sensitive) throw new PlanError(`${e.method} ${e.path} is sensitive: it is always answered with its faked version, and no real response of it is kept`)
  const workspaceId = await workspaceOf(appId)
  if (issueId) {
    const [t] = await db.select({ id: issue.id }).from(issue).where(and(eq(issue.id, issueId), eq(issue.appId, appId)))
    if (!t) throw new PlanError('no such task')
  }
  await db.transaction(async (tx) => {
    if (issueId) {
      const [row] = await tx.select().from(taskService).where(and(eq(taskService.issueId, issueId), eq(taskService.mockId, m.id)))
      const next = { ...(row?.faked ?? {}) }
      if (faked === null) delete next[e.key]; else next[e.key] = faked
      if (row) await tx.update(taskService).set({ faked: next }).where(eq(taskService.id, row.id))
      else if (faked !== null) await tx.insert(taskService).values({ id: newId('run').replace(/^run_/, 'tsvc_'), issueId, mockId: m.id, faked: next })
    } else {
      const endpoints = cleanEndpoints(m.endpoints).map((x) => { if (x.key !== e.key) return x; const { useReal: _u, ...rest } = x; return faked === false ? { ...rest, useReal: true } : rest })
      await tx.update(mock).set({ endpoints, updatedAt: new Date() }).where(eq(mock.id, m.id))
    }
    await appendEvent(tx, { workspaceId, appId, issueId, actor, type: 'mock.endpoint_faked', payload: { key: m.key, endpoint: e.key, faked } })
  })
  return (await endpointData((await rowOf(appId, key))!, issueId))[e.key]
}

/** One endpoint's data taken away at one level: its safe data, and (real) the real response behind it, deleted from this computer. A task's own gone, the app's is what it gets again. */
export async function removeEndpointData(appId: string, key: string, endpoint: string, o: { issueId?: string | null; real?: boolean } = {}, actor = 'user') {
  const { m, e } = await endpointOf(appId, key, endpoint)
  const r = await read(m), task = o.issueId ?? null
  const workspaceId = await workspaceOf(appId)
  let sets = 0, real = 0
  await db.transaction(async (tx) => {
    for (const d of r.sets.filter((x) => (prov(x).scope?.task ?? null) === task)) {
      const mine = filesOf(r.endpoints, e.key, Object.keys(d.files))
      if (!mine.length) continue
      const rest = Object.fromEntries(Object.entries(d.files).filter(([n]) => !mine.includes(n)))
      if (Object.keys(rest).length) await tx.update(mockData).set({ files: rest, updatedAt: new Date() }).where(eq(mockData.id, d.id))
      else { await tx.delete(mockData).where(eq(mockData.id, d.id)); if (m.defaultData === d.key) await tx.update(mock).set({ defaultData: null }).where(eq(mock.id, m.id)) }
      sets++
    }
    await appendEvent(tx, { workspaceId, appId, issueId: task, actor, type: 'mock.endpoint_data_removed', payload: { key: m.key, endpoint: e.key, real: !!o.real } })
  })
  if (o.real) real = dropReal(r, e, task)
  return { removed: sets + real > 0, real }
}
/** An endpoint's real responses deleted from this computer, at one level (or every level): a folder given for it goes whole; from a recorded run, that call's files. */
function dropReal(r: Read, e: Endpoint, task: string | null | 'all'): number {
  let n = 0
  for (const rec of r.recs) {
    if (task !== 'all' && (rec.scope?.task ?? null) !== task) continue
    if (!filesOf(r.endpoints, e.key, rec.names).length) continue
    const calls = exchangesOf(rec.dir)
    if (!calls.length) {
      const others = rec.names.filter((f) => endpointOfFile(r.endpoints, f)?.key !== e.key)
      if (!others.length) rmSync(rec.dir, { recursive: true, force: true })
      else for (const f of filesOf(r.endpoints, e.key, rec.names)) rmSync(join(rec.dir, f), { force: true })
    } else {
      for (const x of calls) if (endpointOfExchange(r.endpoints, x, r.m.upstream)?.key === e.key) for (const f of readdirSync(rec.dir)) if (f.startsWith(`${x.no}.`)) rmSync(join(rec.dir, f), { force: true })
      for (const f of readdirSync(rec.dir)) if (f.startsWith('.by-endpoint-')) rmSync(join(rec.dir, f), { recursive: true, force: true }) // made again, without it
    }
    n++
  }
  return n
}

/**
 * An endpoint's saved real response faked now, at a person's press (Sandy, 2026-11-22: "add a button next to any
 * value that is saved, make fake version"). The task's own response where it has one, else the app's. No plan is
 * written: the one its fake already had is used again, else everything not plainly structure is replaced. Refused,
 * with what was found, while the leak check still finds a real value in it; then the task's agent says what is
 * structure, which a person cannot be asked to.
 */
export async function fakeEndpoint(appId: string, key: string, endpoint: string, issueId: string | null, actor = 'user') {
  const { m, e } = await endpointOf(appId, key, endpoint)
  const d = (await endpointData(m, issueId))[e.key]
  const item = issueId && d.task?.recorded ? d.task : d.app
  if (!item?.recorded) throw new PlanError(`${e.method} ${e.path} has no real response saved to make a fake of`)
  // A refusal lists what was found for the agent that reads the recording. A person reads this on a page, where a real value is never shown: they get how much, not what.
  const { report } = await fakeData(appId, key, { recording: item.recorded.id, samePlan: true, issueId: item === d.task ? issueId : null }, actor).catch((err: unknown) => {
    const said = /^refused: the fake still carries (\d+) values? of the real response/.exec((err as Error).message)
    if (said && err instanceof PlanError) throw new PlanError(`refused: the fake still carries ${said[1]} value${said[1] === '1' ? '' : 's'} of the real response, so nothing was made. Something that is someone's sits in a place the faker took for structure`)
    throw err
  })
  return { data: (await endpointData(m, issueId))[e.key], replaced: report.replaced, kept: report.kept }
}

/**
 * A sensitive endpoint keeps no real response: whatever of it is on this computer is faked (where it has no fake
 * yet) and deleted. Run when an endpoint is marked sensitive, and when a live run comes in. Says what it could not
 * fake: that response is deleted all the same.
 */
export async function scrubSensitive(appId: string, key: string, actor = 'engine'): Promise<{ faked: string[]; failed: { endpoint: string; why: string }[] }> {
  const m = await rowOf(appId, key)
  const out = { faked: [] as string[], failed: [] as { endpoint: string; why: string }[] }
  if (!m) return out
  const r = await read(m)
  for (const e of r.endpoints.filter((x) => x.sensitive)) {
    const levels = [...new Set(r.recs.filter((x) => filesOf(r.endpoints, e.key, x.names).length).map((x) => x.scope?.task ?? null))]
    for (const task of levels) {
      const rec = r.recs.find((x) => (x.scope?.task ?? null) === task && filesOf(r.endpoints, e.key, x.names).length)!
      const safe = itemOf(r, e.key, task)?.safe
      if (!safe || safe.stale) {
        try { await fakeGiven(appId, key, { endpoint: e.key, recorded: filesOf(r.endpoints, e.key, rec.names).map((n) => ({ name: n, text: readFileSync(join(rec.view, n), 'utf8') })), issueId: task, given: rec.given }, actor); out.faked.push(e.key) }
        catch (err) { out.failed.push({ endpoint: e.key, why: String((err as Error).message).split('\n')[0] }) }
      }
    }
    if (levels.length) dropReal(r, e, 'all')
  }
  if (out.faked.length || out.failed.length) { const workspaceId = await workspaceOf(appId); await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, actor, type: 'mock.sensitive_scrubbed', payload: { key: m.key, faked: out.faked, failed: out.failed.map((f) => f.endpoint) } })) }
  return out
}

/** In a line, for a page: what one endpoint is answered with at the level in force. */
export const itemSays = (i: EndpointItem | null): string => !i ? 'What its server makes up' : [i.recorded ? `a real response ${i.recorded.how === 'given' ? 'given' : 'recorded'} ${day(i.recorded.at)}` : null, i.safe ? (i.safe.kind === 'faked' ? 'a fake of it' : 'a file provided as holding nothing real') : i.recorded ? 'not faked yet' : null].filter(Boolean).join(', ')
