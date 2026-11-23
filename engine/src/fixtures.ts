/**
 * Fixtures: what is in the app's own database when it is tried, and the tie between that and what a mock answers
 * with (Sandy, 2026-11-22: "the mock should also mock what is sent … send the same users that we have results for
 * in our mock"; "we have Meridian … one of the Meridian people we assign as the person for the fake results from
 * the CSV that I submitted … once we have fixtures, then we can link the fixtures to the mocks").
 *
 * A fixture is one of the app's shared scenarios (prototype-data.ts): made-up rows by table, kept in Self Evident,
 * with the ids they were saved with. Because those ids do not change, an endpoint's faked data can be made for a
 * fixture's person: the columns the app matches on (an id, an email) are set from that person's row, and the rest
 * stays faked. The mock then answers with a fixed file and the app, started on that fixture, sends the people the
 * file is for. Nothing in the mock has to work out who was sent.
 *
 * A task's smoke test is built from the fixture its services' data was made for, so the two cannot drift apart.
 */
import { and, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, mock, mockData, prototype, scenario } from './db/schema.js'
import { appendEvent } from './events.js'
import { csvCell, fake, type FakePlan } from './fake.js'
import { PlanError } from './issues.js'
import type { DataProvenance } from './mock-data.js'
import { cleanEndpoints } from './mock-endpoints.js'
import { checkLeaks, looksCsv, parseCsv } from './mock-leaks.js'
import { endpointData } from './mock-serve.js'
import type { FromFile } from './mock-file-map.js'
import { testFileNamed } from './test-files.js'
import { readRecording, rowOf, workspaceOf } from './mocks.js'
import { existsSync } from 'node:fs'
import { standInKey } from './stand-ins.js'
import { newId } from './ids.js'
import { buildSeeded, dropDatabase, save, type PrototypeDb } from './prototype-data.js'
import { homeRepo } from './workbench.js'

export interface FixtureView { name: string; bytes: number; tables: { name: string; rows: number; columns: string[] }[]; /** How many endpoints' data is filled out for its people: what a rename carries along and a delete leaves behind. */ madeFor: number }
const shared = (appId: string) => db.select().from(scenario).where(and(eq(scenario.appId, appId), eq(scenario.scope, '')))
const columnsOf = (rows: unknown[]) => (rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0] as object) : [])

/** The app's fixtures: its shared scenarios, each with its tables and how many rows they hold. Never the rows. */
export async function listFixtures(appId: string): Promise<FixtureView[]> {
  const tied = await madeForRows(appId)
  return (await shared(appId)).map((s) => ({ name: s.name, madeFor: tied.filter((d) => d.madeFor.fixture === s.name).length, bytes: JSON.stringify(s.tables).length, tables: Object.entries(s.tables).filter(([, r]) => r.length).map(([name, r]) => ({ name, rows: r.length, columns: columnsOf(r) })).sort((a, b) => b.rows - a.rows) })).sort((a, b) => a.name.localeCompare(b.name))
}
/** Every set of endpoint data of the app that was filled out for a fixture's people. */
async function madeForRows(appId: string) {
  const out: { id: string; provenance: DataProvenance & { madeFor: MadeFor }; madeFor: MadeFor }[] = []
  for (const m of await db.select().from(mock).where(eq(mock.appId, appId))) {
    for (const d of await db.select().from(mockData).where(eq(mockData.mockId, m.id))) {
      const p = (d.provenance ?? {}) as DataProvenance & { madeFor?: MadeFor }
      if (p.madeFor) out.push({ id: d.id, provenance: p as DataProvenance & { madeFor: MadeFor }, madeFor: p.madeFor })
    }
  }
  return out
}

const NAME = /^[a-z0-9][a-z0-9-]*$/i
const dbOf = async (appId: string) => {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) throw new PlanError(`no app ${appId}`)
  const cfg = (a.setup as { prototype_db?: PrototypeDb } | null)?.prototype_db
  return { a, cfg: cfg?.url ? cfg : null }
}
/** Can a fixture be made from the app's seed, and if not, what is missing: said to the person where the button would be. */
export async function canMakeFixture(appId: string): Promise<{ ok: boolean; missing: string | null }> {
  const { cfg } = await dbOf(appId)
  if (!cfg) return { ok: false, missing: 'the app has no database set for its prototypes (Settings › the app › Prototype)' }
  if (!cfg.seed_cmd) return { ok: false, missing: 'the app has no seed command (Settings › the app › Prototype)' }
  if (!(await homeRepo(appId))?.localPath) return { ok: false, missing: 'the app\'s repository is not on this computer' }
  return { ok: true, missing: null }
}
const making = new Set<string>()
/**
 * A fixture made from the app's own seed (Sandy, 2026-11-22: "Add a seed command"): a database of its own is made
 * from nothing, the app's schema command and then its seed command are run in the app's checkout, what is in it is
 * kept as a fixture shared with the app, and the database is dropped. Nothing of a prototype or a task is touched.
 * Made again under the same name, the fixture is replaced: its ids are whatever the seed gives, so a seed with
 * fixed ids keeps the data that was filled out for its people true.
 */
export async function makeFixtureFromSeed(appId: string, name = 'seed', actor = 'user') {
  if (!NAME.test(name)) throw new PlanError('a fixture name is letters, numbers and dashes, like "meridian"')
  const can = await canMakeFixture(appId)
  if (!can.ok) throw new PlanError(`a fixture cannot be made from the seed yet: ${can.missing}`)
  if (making.has(appId)) throw new PlanError('a fixture is being made from the seed already: it takes a few minutes')
  const { cfg } = await dbOf(appId), path = (await homeRepo(appId))!.localPath!
  const slug = `fixture_${newId('scenario').slice(-8)}`
  making.add(appId)
  try {
    await buildSeeded(cfg!, slug, path)
    const saved = await save(cfg!, slug, { appId }, name, true)
    if (!Object.keys(saved.saved).length) throw new PlanError('the seed command ran and left every table empty: nothing to keep')
    const workspaceId = await workspaceOf(appId)
    await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, issueId: null, actor, type: 'fixture.made', payload: { name, tables: saved.saved } }))
    return { name, tables: saved.saved }
  } finally { making.delete(appId); await dropDatabase(cfg!, slug).catch(() => {}) }
}

/** A fixture under another name. The data filled out for its people, and the prototypes built from it, go on naming it. */
export async function renameFixture(appId: string, name: string, to: string, actor = 'user') {
  if (!NAME.test(to)) throw new PlanError('a fixture name is letters, numbers and dashes, like "meridian"')
  const all = await shared(appId), fx = all.find((s) => s.name === name)
  if (!fx) throw new PlanError(`this app has no fixture "${name}"`)
  if (to === name) return { name }
  if (all.some((s) => s.name === to)) throw new PlanError(`this app has a fixture "${to}" already`)
  const tied = (await madeForRows(appId)).filter((d) => d.madeFor.fixture === name)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(scenario).set({ name: to, updatedAt: new Date() }).where(eq(scenario.id, fx.id))
    for (const d of tied) await tx.update(mockData).set({ provenance: { ...d.provenance, madeFor: { ...d.madeFor, fixture: to } } }).where(eq(mockData.id, d.id))
    // A prototype built from it by that name follows, unless the name is one of its own scenarios.
    const own = new Set((await tx.select({ scope: scenario.scope }).from(scenario).where(and(eq(scenario.appId, appId), eq(scenario.name, name)))).map((r) => r.scope))
    for (const p of await tx.select({ id: prototype.id }).from(prototype).where(and(eq(prototype.appId, appId), eq(prototype.scenario, name)))) if (!own.has(p.id)) await tx.update(prototype).set({ scenario: to }).where(eq(prototype.id, p.id))
    await appendEvent(tx, { workspaceId, appId, issueId: null, actor, type: 'fixture.renamed', payload: { from: name, to, data: tied.length } })
  })
  return { name: to }
}

/** A fixture removed. Data that was filled out for its people stays as it is, and no longer says a task's runs are built from it. */
export async function deleteFixture(appId: string, name: string, actor = 'user') {
  const fx = (await shared(appId)).find((s) => s.name === name)
  if (!fx) throw new PlanError(`this app has no fixture "${name}"`)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.delete(scenario).where(eq(scenario.id, fx.id))
    await appendEvent(tx, { workspaceId, appId, issueId: null, actor, type: 'fixture.deleted', payload: { name } })
  })
  return { deleted: name }
}

/** A table of a fixture as it is: its first rows, every column, each value as text and cut short. Fixtures are made-up data. */
export async function fixtureSample(appId: string, name: string, table: string, limit = 50): Promise<{ columns: string[]; rows: string[][]; total: number }> {
  const fx = (await shared(appId)).find((s) => s.name === name)
  if (!fx) throw new PlanError(`this app has no fixture "${name}"`)
  const rows = (fx.tables[table] ?? []) as Record<string, unknown>[]
  if (!rows.length) throw new PlanError(`the fixture "${name}" has no rows in "${table}"`)
  const columns = columnsOf(rows)
  const text = (v: unknown) => { const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return t.length > 120 ? `${t.slice(0, 120)}…` : t }
  return { columns, rows: rows.slice(0, Math.max(1, Math.min(200, limit))).map((r) => columns.map((c) => text(r[c]))), total: rows.length }
}

const LABEL = /^(id|external_id|.*name|.*email|title|slug|key|code)$/i
/** One table's rows as a person picks from them: each by its place in the table, with the columns that say who or what it is. Fixtures are made-up data. */
export async function fixtureRows(appId: string, name: string, table: string): Promise<{ columns: string[]; rows: { index: number; label: string; values: Record<string, string> }[] }> {
  const fx = (await shared(appId)).find((s) => s.name === name)
  if (!fx) throw new PlanError(`this app has no fixture "${name}"`)
  const rows = (fx.tables[table] ?? []) as Record<string, unknown>[]
  if (!rows.length) throw new PlanError(`the fixture "${name}" has no rows in "${table}"`)
  const columns = columnsOf(rows), shown = columns.filter((c) => LABEL.test(c)).slice(0, 8)
  const text = (v: unknown) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v))
  return { columns, rows: rows.slice(0, 2000).map((r, index) => { const values = Object.fromEntries(shown.map((c) => [c, text(r[c])])); return { index, values, label: [[values.first_name, values.last_name].filter(Boolean).join(' ') || values.name || values.full_name, values.work_email || values.email, values.id].filter(Boolean).join(' · ') || `row ${index + 1}` } }) }
}

/** The column names of a data file: a CSV's header, or the keys of a JSON object (of the first, in a list). */
export function dataColumns(text: string): string[] {
  if (looksCsv(text)) return parseCsv(text)[0] ?? []
  try { const v = JSON.parse(text) as unknown; const o = Array.isArray(v) ? v[0] : v; return o && typeof o === 'object' ? Object.keys(o as object) : [] } catch { return [] }
}
/** A data file with named columns set to given values, in every row (CSV) or wherever the key holds a plain value (JSON). Everything else is left as it is. */
export function pin(text: string, set: Record<string, string>): { text: string; changed: number } {
  let changed = 0
  if (looksCsv(text)) {
    const rows = parseCsv(text), head = rows[0] ?? [], eol = text.includes('\r\n') ? '\r\n' : '\n'
    const at = Object.entries(set).map(([c, v]) => [head.indexOf(c), v] as const).filter(([i]) => i >= 0)
    const out = rows.map((r, n) => { if (n > 0 && r.length === head.length) for (const [i, v] of at) { if (r[i] !== v) changed++; r[i] = v } return r.map(csvCell).join(',') })
    return { text: out.join(eol) + (/\r?\n$/.test(text) ? eol : ''), changed }
  }
  try {
    const walk = (v: unknown): unknown => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => { if (k in set && (x === null || typeof x !== 'object')) { if (x !== set[k]) changed++; return [k, set[k]] } return [k, walk(x)] })) : v
    const pretty = /^\s*[[{]\s*\n/.test(text)
    return { text: JSON.stringify(walk(JSON.parse(text)), null, pretty ? 2 : undefined) + (text.endsWith('\n') ? '\n' : ''), changed }
  } catch { return { text, changed: 0 } }
}

/**
 * An endpoint's faked (or provided) data mapped from a file of the fixtures (mock-file-map.ts): which of its columns
 * are set from which columns of the file, for each person in the file. Only the mapping is kept; it is worked out
 * when the data is served, from the version of the file that place uses. file null: no longer mapped.
 */
export async function mapFromFile(appId: string, key: string, endpoint: string, i: { file: string | null; map?: Record<string, string> }, issueId: string | null, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no service "${key}"`)
  const e = cleanEndpoints(m.endpoints).find((x) => x.key === standInKey(endpoint))
  if (!e) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  const item = (await endpointData(m, issueId))[e.key]
  const safe = (issueId ? item.task : item.app)?.safe
  if (!safe) throw new PlanError(`${e.method} ${e.path} has no faked or provided data${issueId ? ' of this task\'s own' : ''} yet to map a file onto: the real response is faked first`)
  const [d] = await db.select().from(mockData).where(and(eq(mockData.mockId, m.id), eq(mockData.key, safe.set)))
  let fromFile: FromFile | undefined
  if (i.file) {
    // The app's data can be mapped from a task's own file: a task without that file is served the data as it is.
    const f = await testFileNamed(appId, i.file)
    if (!f) throw new PlanError(`there is no file "${i.file}" among the fixtures' files`)
    if (!f.columns?.length) throw new PlanError(`${f.name} has no columns to map from: only a CSV has fields`)
    if (!looksCsv(d.files[safe.files[0]] ?? '')) throw new PlanError(`the data of ${e.method} ${e.path} is not a CSV: a file's people are written as its rows`)
    const map: Record<string, string> = Object.fromEntries(Object.entries(i.map ?? {}).map(([c, from]) => [c.trim(), String(from ?? '').trim()] as [string, string]).filter(([c]) => c))
    if (!Object.values(map).some(Boolean)) throw new PlanError('say which columns of the data are set from which columns of the file: { work_email: "email" }')
    const unknown = Object.values(map).filter((from) => from && !f.columns!.includes(from))
    if (unknown.length) throw new PlanError(`${f.name} has no column ${unknown.map((u) => `"${u}"`).join(', ')} (it has ${f.columns.slice(0, 12).join(', ')})`)
    fromFile = { file: f.name, map }
  }
  const { fromFile: _was, ...rest } = (d.provenance ?? {}) as DataProvenance & { fromFile?: FromFile }
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mockData).set({ provenance: { ...rest, ...(fromFile ? { fromFile } : {}) }, updatedAt: new Date() }).where(eq(mockData.id, d.id))
    await appendEvent(tx, { workspaceId, appId, issueId, actor, type: 'mock.data_from_file', payload: { key: m.key, endpoint: e.key, file: fromFile?.file ?? null, columns: Object.keys(fromFile?.map ?? {}) } })
  })
  return { fromFile: fromFile ?? null }
}

/** How many of a fixture's people one endpoint's data is filled out for, at most. */
export const PEOPLE_MAX = 200
export interface MadeFor { fixture: string; table: string; /** Who, as the fixture names them: made-up. */ who: string; /** How many of the fixture's people it was filled out for. */ people: number; /** data column ← fixture column */ map: Record<string, string> }
/**
 * An endpoint's faked (or provided) data made for a fixture's people (Sandy, 2026-11-22: "you'd use the fixture to
 * create the fake data. The CSV that you upload is just a template to use to fill out people"). The data is the
 * template; the fixture supplies who. For each of `count` people, starting at one row of the fixture's table, the
 * template's rows are written once with the columns named in `map` set from that person. Where the real response
 * the fake came from is still here, each person gets a fake of it made afresh, so they do not all read alike;
 * otherwise the template's rows are used again for each. For the app (its settings), or one task's own data.
 * Checked against the real response, where that is still here.
 */
export async function assignFixture(appId: string, key: string, endpoint: string, i: { fixture: string; table: string; row?: number; where?: { column: string; value: string }; /** How many people, from that row on: 1 unless said. */ count?: number; map: Record<string, string> }, issueId: string | null, actor = 'user') {
  const m = await rowOf(appId, key)
  if (!m) throw new PlanError(`this app has no service "${key}"`)
  const e = cleanEndpoints(m.endpoints).find((x) => x.key === standInKey(endpoint))
  if (!e) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  const fx = (await shared(appId)).find((s) => s.name === i.fixture)
  if (!fx) throw new PlanError(`this app has no fixture "${i.fixture}"`)
  const rows = (fx.tables[i.table] ?? []) as Record<string, unknown>[]
  const start = i.where ? rows.findIndex((r) => String(r[i.where!.column] ?? '') === i.where!.value) : i.row ?? -1
  const people = rows.slice(start < 0 ? rows.length : start, (start < 0 ? rows.length : start) + Math.max(1, Math.min(PEOPLE_MAX, Math.floor(i.count ?? 1))))
  if (!people.length) throw new PlanError(`the fixture "${i.fixture}" has no such row in "${i.table}"`)
  const map = Object.fromEntries(Object.entries(i.map ?? {}).filter(([d, f]) => d && f))
  if (!Object.keys(map).length) throw new PlanError('say which columns of the data are set from which columns of the fixture: { tracking_id: "id", work_email: "work_email" }')
  const setOf = (row: Record<string, unknown>) => { const set: Record<string, string> = {}; for (const [dataCol, fxCol] of Object.entries(map)) { const v = row[fxCol]; if (v === null || v === undefined || typeof v === 'object') throw new PlanError(`the fixture's "${fxCol}" holds nothing to set "${dataCol}" from`); set[dataCol] = String(v) } return set }
  const sets = people.map(setOf)
  const item = (await endpointData(m, issueId))[e.key]
  const safe = (issueId ? item.task : item.app)?.safe
  if (!safe) throw new PlanError(`${e.method} ${e.path} has no faked or provided data${issueId ? ' of this task\'s own' : ''} yet to make for a fixture: the real response is faked first`)
  const [d] = await db.select().from(mockData).where(and(eq(mockData.mockId, m.id), eq(mockData.key, safe.set)))
  const files = { ...d.files }
  const prov = (d.provenance ?? {}) as DataProvenance & { template?: Record<string, string> }
  // The template is the data as it was before it was first filled out: filling it out again starts from that, not from the last filling.
  const template = { ...Object.fromEntries(safe.files.map((f) => [f, files[f]])), ...(prov.template ?? {}) }
  const real = d.kind === 'faked' && d.recording && existsSync(d.recording) ? readRecording(d.recording) : null
  let changed = 0, seen = 0
  for (const f of safe.files) {
    const cols = dataColumns(template[f]); seen += Object.keys(map).filter((c) => cols.includes(c)).length
    if (!looksCsv(template[f])) { const r = pin(template[f], sets[0]); files[f] = r.text; changed += r.changed; continue }
    const [head, ...own] = parseCsv(template[f]), eol = template[f].includes('\r\n') ? '\r\n' : '\n'
    const original = real?.find((x) => x.name === f)
    const out: string[][] = []
    sets.forEach((set, n) => {
      // Each person after the first gets the real response faked afresh (another salt, the same plan), so their rows differ; without it, the template's rows again.
      let mine = own
      if (n > 0 && original) { try { const again = fake([original], { ...(d.plan as FakePlan), salt: `${String((d.plan as FakePlan).salt ?? '')}:${n}` }).files[f]; const [h, ...r] = parseCsv(again); if (h.join() === head.join()) mine = r } catch { /* the template's rows */ } }
      for (const r of mine.filter((x) => x.length === head.length)) { const row = [...r]; for (const [c, v] of Object.entries(set)) { const at = head.indexOf(c); if (at >= 0) row[at] = v } out.push(row); changed++ }
    })
    files[f] = [head, ...out].map((r) => r.map(csvCell).join(',')).join(eol) + eol
  }
  if (!seen) throw new PlanError(`none of ${Object.keys(map).join(', ')} is a column of this endpoint's data (${dataColumns(template[safe.files[0]]).slice(0, 12).join(', ')}…)`)
  if (real) {
    const r = checkLeaks(real, Object.entries(files).map(([path, text]) => ({ path, text })), prov.kept ?? [])
    if (!r.ok) throw new PlanError(`refused: filled out for the fixture, ${r.count} value${r.count === 1 ? '' : 's'} of the real response would be in the data`)
  }
  const label = (row: Record<string, unknown>) => [[row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || row.full_name, row.work_email || row.email].filter(Boolean).join(', ') || `row ${rows.indexOf(row) + 1} of ${i.table}`
  const who = people.length === 1 ? String(label(people[0])) : `${people.length} people, from ${String(label(people[0]))}`
  const madeFor: MadeFor = { fixture: fx.name, table: i.table, who, people: people.length, map }
  const set = sets[0]
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.update(mockData).set({ files, plan: { ...(d.plan ?? {}), set }, provenance: { ...(d.provenance ?? {}), madeFor, template }, updatedAt: new Date() }).where(eq(mockData.id, d.id))
    await appendEvent(tx, { workspaceId, appId, issueId, actor, type: 'mock.data_for_fixture', payload: { key: m.key, endpoint: e.key, fixture: fx.name, people: people.length, columns: Object.keys(set) } })
  })
  return { madeFor, changed }
}

/** The fixture a task's runs are built from: the one its services' data was made for (the task's own data first, then the app's). None: nothing says. */
export async function fixtureForTask(appId: string, issueId: string | null): Promise<string | null> {
  const names = (await shared(appId)).map((s) => s.name)
  let app: string | null = null
  for (const m of await db.select().from(mock).where(eq(mock.appId, appId))) {
    for (const d of await db.select().from(mockData).where(eq(mockData.mockId, m.id))) {
      const p = (d.provenance ?? {}) as DataProvenance & { madeFor?: MadeFor }
      if (!p.madeFor || !names.includes(p.madeFor.fixture)) continue
      if (issueId && p.scope?.task === issueId) return p.madeFor.fixture
      if (!p.scope?.task) app = app ?? p.madeFor.fixture
    }
  }
  return app
}
