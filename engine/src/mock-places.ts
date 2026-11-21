/**
 * Where a mock's data comes from, in each place a task runs (Sandy, 2026-11-21: "a more general setting in which we
 * can say, for a prototype, for smoke, for a reviewer, where is the data coming from? … each one of them are going to
 * come from the same CSV, but for the reviewer, fake it"; and any mix: "record and fake for all three … file we
 * provide directly for the reviewer, real API for our own").
 *
 * For each mock and each place (prototype, smoke test, reviewer) one source:
 * - live: the real service, every run. A smoke run goes through the recorder, so what it sends is kept.
 * - replay: the newest real response, as it is. With none yet, a smoke run is live once (and kept), then replays.
 * - fake: a fake of the newest real response. With none yet, a smoke run is live once; the task's agent then makes
 *   the fake. A fake made with a plan is made again by itself when a newer real response comes in.
 * - data: one named set (a file we provide, or one written by hand).
 * - default: what the app says for that place; and for the app, the mock's default data.
 *
 * The app holds a default for each place (`mock.places`); a task changes only the rows it needs (`mock_choice`).
 * The reviewer's place never gets real data: live and replay are not offered for it, and a set that is a real
 * response is refused when the reviewer's copy is made. A recording made for one place serves the others.
 */
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { mock, mockChoice, mockData, MOCK_PLACES, MOCK_SOURCES } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { dataFor, fakeData, useReal, type DataKind, type DataRow } from './mock-data.js'
import { day, recordingsFor, rowOf, workspaceOf, type Row } from './mocks.js'
import { standInKey } from './stand-ins.js'

export type Place = (typeof MOCK_PLACES)[number]
export type Source = (typeof MOCK_SOURCES)[number]
export interface Choice { source: Source; /** source data: which set. */ data?: string }
export const PLACE_NAMES: Record<Place, string> = { prototype: 'Prototype', smoke: 'Smoke test', review: 'Reviewer' }
/** What may be chosen for a place: nothing real for a reviewer. */
export const sourcesFor = (place: Place): Source[] => (place === 'review' ? ['default', 'fake', 'data'] : [...MOCK_SOURCES])

/** What a place gets now. */
export interface Plan {
  mock: string; name: string; place: Place
  /** live: the real service. data: a set. own: what the server holds itself. none: nothing to run. */ how: 'live' | 'data' | 'own' | 'none'
  data?: { key: string; name: string; kind: DataKind }
  /** live: what it sends is kept (a smoke run, through the recorder). */ record?: boolean
  /** The choice in force, and whose it is. */ choice: Choice; from: 'task' | 'app' | 'none'
  /** What it comes to, in words. */ says: string
  /** What stands in the way of the choice, when it could not be had as chosen. */ note?: string
  /** Reviewer only: why its copy cannot be made as things stand. */ blocked?: string
  /** Said without making it (dry): the set it names is made when this next runs. */ pending?: boolean
}

const cleanChoice = (c: unknown): Choice | null => {
  const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
  if (!(MOCK_SOURCES as readonly string[]).includes(String(x.source)) || x.source === 'default') return null
  return { source: x.source as Source, ...(x.source === 'data' && typeof x.data === 'string' ? { data: x.data } : {}) }
}
const canLive = (m: Row) => !!m.upstream && Object.keys(m.env ?? {}).length > 0
const dataOf = async (mockId: string, key: string): Promise<DataRow | null> => (await db.select().from(mockData).where(and(eq(mockData.mockId, mockId), eq(mockData.key, key))))[0] ?? null
const brief = (d: DataRow) => ({ key: d.key, name: d.name, kind: d.kind as DataKind })
const fromOf = (d: DataRow) => day(((d.provenance ?? {}) as { from?: { at?: string } }).from?.at ?? null)
const saysData = (d: DataRow) => (d.kind === 'real' ? `A real response, as it is${fromOf(d) ? ` (${fromOf(d)})` : ''}: this computer only` : d.kind === 'faked' ? `A fake of the real response${fromOf(d) ? ` of ${fromOf(d)}` : ''}` : `"${d.name}", invented`)

/**
 * What one mock gets in one place. dry: only say (for a page); otherwise make what the choice needs first (the row
 * that serves a real response as it is; a fake made again from a newer response with the plan it has).
 */
export async function planOf(m: Row, place: Place, issueId?: string | null, opts: { dry?: boolean } = {}): Promise<Plan> {
  const [own] = issueId ? await db.select().from(mockChoice).where(and(eq(mockChoice.mockId, m.id), eq(mockChoice.issueId, issueId), eq(mockChoice.place, place))) : []
  const app = cleanChoice((m.places ?? {})[place])
  const choice: Choice = cleanChoice(own) ?? app ?? { source: 'default' }
  const base = { mock: m.key, name: m.name, place, choice, from: (cleanChoice(own) ? 'task' : app ? 'app' : 'none') as Plan['from'] }
  const fallback = async (note?: string): Promise<Plan> => {
    const d = await dataFor(m)
    if (d) return { ...base, how: 'data', data: brief(d), says: saysData(d), ...(note ? { note } : {}) }
    return m.cmd && m.status !== 'needs_recording' ? { ...base, how: 'own', says: 'What its server holds itself', ...(note ? { note } : {}) } : { ...base, how: 'none', says: 'Nothing yet: it has no mock', ...(note ? { note } : {}) }
  }
  const liveFirst = (then: string): Plan => ({ ...base, how: 'live', record: true, says: `The real ${m.name} on the first run, kept as it comes; ${then}` })
  const newest = recordingsFor(m)[0]
  let plan: Plan
  if (choice.source === 'live') {
    plan = canLive(m)
      ? { ...base, how: 'live', record: place === 'smoke', says: place === 'smoke' ? `The real ${m.name}, every run; what it sends is kept` : `The real ${m.name}, every run, by the app's own settings; not kept (a smoke run keeps it)` }
      : place === 'smoke' ? await fallback(`a live run needs the real service's address and the variables that point the app at it`) : { ...base, how: 'live', record: false, says: `The real ${m.name}, every run, by the app's own settings; not kept` }
  } else if (choice.source === 'data') {
    const d = choice.data ? await dataOf(m.id, standInKey(choice.data)) : null
    plan = d ? { ...base, how: 'data', data: brief(d), says: saysData(d) } : await fallback(`its data "${choice.data ?? ''}" is not there any more`)
  } else if (choice.source === 'replay') {
    if (newest) {
      let d = await dataOf(m.id, 'real')
      if (!opts.dry && (!d || d.recording !== newest.dir)) { await useReal(m.appId, m.key, { recording: newest.dir, issueId: issueId ?? null }, 'engine'); d = await dataOf(m.id, 'real') }
      plan = d ? { ...base, how: 'data', data: brief(d), says: saysData(d) } : { ...base, how: 'data', data: { key: 'real', name: 'The real response', kind: 'real' }, says: `A real response, as it is (${day(newest.at)}): this computer only`, pending: true }
    } else plan = place === 'smoke' && canLive(m) ? liveFirst('later runs replay it') : await fallback('there is no real response yet: give one, or make a live smoke run')
  } else if (choice.source === 'fake') {
    let d = await dataOf(m.id, 'faked')
    if (d?.kind !== 'faked') d = null
    let note: string | undefined
    if (d && newest && d.recording !== newest.dir) {
      if (opts.dry) note = `a newer real response (${day(newest.at)}) is faked when this next runs`
      else try { await fakeData(m.appId, m.key, { recording: newest.dir, plan: d.plan as Record<string, never>, issueId: issueId ?? null }, 'engine'); d = await dataOf(m.id, 'faked') } catch (err) { note = `a newer real response could not be faked with the plan it has, so the last fake is used: ${String((err as Error).message).split('\n')[0]}` }
    }
    if (d) plan = { ...base, how: 'data', data: brief(d), says: saysData(d), ...(note ? { note } : {}) }
    else if (newest) plan = await fallback('its fake is not made yet: the task\'s agent makes it from the real response')
    else plan = place === 'smoke' && canLive(m) ? liveFirst('the task\'s agent then makes the fake') : await fallback('there is no real response yet to fake: give one, or make a live smoke run')
  } else plan = await fallback()
  if (place === 'review') {
    if (plan.how === 'live') plan.blocked = `a reviewer cannot be given the real ${m.name}`
    else if (plan.data?.kind === 'real') plan.blocked = `${m.name} would answer a reviewer with a real response, which never leaves this computer: choose a fake, or data that holds nothing real`
    else if (plan.how === 'none') plan.blocked = `${m.name} has no mock yet`
  }
  return plan
}

/** Every mock of the app in one place, for a run: which set each serves, which are called for real, which are real data. */
export async function plansFor(appId: string, place: Place, issueId?: string | null, opts: { dry?: boolean } = {}) {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.key))
  const plans: Plan[] = []
  for (const m of rows) plans.push(await planOf(m, place, issueId, opts))
  const blocked = plans.filter((p) => p.blocked)
  if (blocked.length && !opts.dry) throw new PlanError(blocked.map((p) => p.blocked).join('; '))
  return {
    plans,
    /** The set each mock serves, where it is not simply its default. */ pick: Object.fromEntries(plans.filter((p) => p.how === 'data' && !p.pending).map((p) => [p.mock, p.data!.key])),
    /** Called for real: left out of the mocks that are started. */ live: plans.filter((p) => p.how === 'live').map((p) => p.mock),
    /** Of those, the ones whose answers are kept. */ record: plans.filter((p) => p.how === 'live' && p.record).map((p) => p.mock),
    /** Answering with a real response: this must not be shared. */ real: plans.filter((p) => p.how === 'live' || p.data?.kind === 'real').map((p) => p.mock),
  }
}

/** One choice set, for the app (no task) or for a task. `default` (or null) takes the task's own away, or the app's. */
export async function setChoice(appId: string, mockKey: string, place: string, given: Choice | null, issueId: string | null, actor = 'user') {
  const m = await rowOf(appId, mockKey)
  if (!m) throw new PlanError(`this app has no mock "${mockKey}"`)
  if (!(MOCK_PLACES as readonly string[]).includes(place)) throw new PlanError(`a place is one of ${MOCK_PLACES.join(', ')}`)
  const p = place as Place
  const source = given?.source ?? 'default'
  if (!(MOCK_SOURCES as readonly string[]).includes(source)) throw new PlanError(`a source is one of ${MOCK_SOURCES.join(', ')}`)
  if (!sourcesFor(p).includes(source)) throw new PlanError(`a reviewer is never given real data: for the reviewer choose a fake, or data that holds nothing real`)
  let data: string | null = null
  if (source === 'data') {
    const d = given?.data ? await dataOf(m.id, standInKey(given.data)) : null
    if (!d) throw new PlanError(`${m.name} has no data "${given?.data ?? ''}"`)
    if (p === 'review' && d.kind === 'real') throw new PlanError(`"${d.name}" is a real response: it never leaves this computer, so a reviewer cannot be given it`)
    data = d.key
  }
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    if (issueId) {
      await tx.delete(mockChoice).where(and(eq(mockChoice.mockId, m.id), eq(mockChoice.issueId, issueId), eq(mockChoice.place, p)))
      if (source !== 'default') await tx.insert(mockChoice).values({ id: newId('run').replace(/^run_/, 'mchoice_'), mockId: m.id, issueId, place: p, source, data, updatedAt: new Date() })
    } else {
      const places = { ...(m.places ?? {}) }
      if (source === 'default') delete places[p]; else places[p] = { source, ...(data ? { data } : {}) }
      await tx.update(mock).set({ places, updatedAt: new Date() }).where(eq(mock.id, m.id))
    }
    await appendEvent(tx, { workspaceId, appId, issueId, actor, type: 'mock.place', payload: { key: m.key, place: p, source, ...(data ? { data } : {}) } })
  })
  return planOf((await rowOf(appId, mockKey))!, p, issueId, { dry: true })
}

export interface PlacesRow {
  mock: string; name: string; status: string
  /** Can it be called for real through the recorder (it has the real address and its variables)? */ canLive: boolean
  /** Is there a real response of it on this computer, and from when? */ real: string | null
  data: { key: string; name: string; kind: DataKind }[]
  places: Record<Place, Plan & { /** The task's own choice, when it has one. */ own: Choice | null; /** The app's. */ app: Choice | null }>
}
/** The table: every mock, and what each place gets, for the app (no task) or for a task. Nothing is made. */
export async function placesTable(appId: string, issueId?: string | null): Promise<PlacesRow[]> {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.name))
  const out: PlacesRow[] = []
  for (const m of rows) {
    const sets = await db.select().from(mockData).where(eq(mockData.mockId, m.id)).orderBy(asc(mockData.key))
    const own = issueId ? await db.select().from(mockChoice).where(and(eq(mockChoice.mockId, m.id), eq(mockChoice.issueId, issueId))) : []
    const places = {} as PlacesRow['places']
    for (const p of MOCK_PLACES) places[p] = { ...(await planOf(m, p, issueId, { dry: true })), own: cleanChoice(own.find((c) => c.place === p)), app: cleanChoice((m.places ?? {})[p]) }
    out.push({ mock: m.key, name: m.name, status: m.status, canLive: canLive(m), real: recordingsFor(m)[0]?.at ?? null, data: sets.map(brief), places })
  }
  return out
}

/** What an agent is told of a task's table. */
export function placesPrompt(table: PlacesRow[]): string {
  if (!table.length) return ''
  const line = (r: PlacesRow) => `- ${r.name} (${r.mock}): ${MOCK_PLACES.map((p) => `${PLACE_NAMES[p].toLowerCase()}: ${r.places[p].says}${r.places[p].note ? ` (${r.places[p].note})` : ''}${r.places[p].blocked ? ` [cannot be made: ${r.places[p].blocked}]` : ''}`).join('; ')}`
  return `\nWhere each mock's data comes from for this work, place by place (the person's to set on the task's Data step; you may set it with mock_data, op place, when they ask):\n${table.map(line).join('\n')}\nA reviewer is never given real data: what a reviewer's copy carries is a fake, or data that holds nothing real.`
}
