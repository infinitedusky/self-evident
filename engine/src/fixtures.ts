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
import { mock, mockData, scenario } from './db/schema.js'
import { appendEvent } from './events.js'
import { csvCell, fake, type FakePlan } from './fake.js'
import { PlanError } from './issues.js'
import type { DataProvenance } from './mock-data.js'
import { cleanEndpoints } from './mock-endpoints.js'
import { checkLeaks, looksCsv, parseCsv } from './mock-leaks.js'
import { endpointData } from './mock-serve.js'
import { readRecording, rowOf, workspaceOf } from './mocks.js'
import { existsSync } from 'node:fs'
import { standInKey } from './stand-ins.js'

export interface FixtureView { name: string; bytes: number; tables: { name: string; rows: number; columns: string[] }[] }
const shared = (appId: string) => db.select().from(scenario).where(and(eq(scenario.appId, appId), eq(scenario.scope, '')))
const columnsOf = (rows: unknown[]) => (rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0] as object) : [])

/** The app's fixtures: its shared scenarios, each with its tables and how many rows they hold. Never the rows. */
export async function listFixtures(appId: string): Promise<FixtureView[]> {
  return (await shared(appId)).map((s) => ({ name: s.name, bytes: JSON.stringify(s.tables).length, tables: Object.entries(s.tables).filter(([, r]) => r.length).map(([name, r]) => ({ name, rows: r.length, columns: columnsOf(r) })).sort((a, b) => b.rows - a.rows) })).sort((a, b) => a.name.localeCompare(b.name))
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
