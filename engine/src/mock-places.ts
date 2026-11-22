/**
 * Where a mock's data comes from, in each place a task runs (Sandy, 2026-11-21: "a more general setting in which we
 * can say, for a prototype, for smoke, for a reviewer, where is the data coming from? … each one of them are going to
 * come from the same CSV, but for the reviewer, fake it"; and any mix: "record and fake for all three … file we
 * provide directly for the reviewer, real API for our own").
 *
 * Since 2026-11-22 the choice is two things (Sandy: "Record and Replay seems like it is describing a step we would
 * do in the data tab. We either use real or mock, where the mock comes from is a separate concern"):
 * - the real service (stored as `live`): every run. A smoke run goes through the recorder, so what it sends is kept.
 * - the mock: each endpoint answering with its own data (mock-serve.ts), faked or provided (stored as `fake`), or,
 *   where a person turns it on for their own prototype or smoke test, recorded responses as they are (`replay`).
 * - default: what the app says for that place; and for the app, the mock with faked data.
 * Recording is no longer a source: a real response is given on its endpoint, or recorded in a live run.
 *
 * The app holds a default for each place (`mock.places`); a task changes only the rows it needs (`mock_choice`).
 * The reviewer's place never gets real data: the real service and recorded responses are not offered for it, and
 * its copy is refused while an endpoint has a real response and no fake of it.
 */
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { mock, mockChoice, mockData, MOCK_PLACES, MOCK_SOURCES } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { fakeData, scopeOfRecording, type DataRow } from './mock-data.js'
import { cleanEndpoints } from './mock-endpoints.js'
import { served, type Form } from './mock-serve.js'
import { day, recordingsFor, rowOf, workspaceOf, type Row } from './mocks.js'
import { standInKey } from './stand-ins.js'

export type Place = (typeof MOCK_PLACES)[number]
export type Source = (typeof MOCK_SOURCES)[number]
/** live: the real service. fake: the mock, with faked data. replay: the mock, with recorded responses as they are. default: what the app says; and for the app, the mock with faked data. (data: from before data sat on the endpoint; read as fake.) */
export interface Choice { source: Source; data?: string }
export const PLACE_NAMES: Record<Place, string> = { prototype: 'Prototype', smoke: 'Smoke test', review: 'Reviewer' }
/** What may be chosen for a place: nothing real for a reviewer. */
export const sourcesFor = (place: Place): Source[] => (place === 'review' ? ['default', 'fake'] : ['default', 'live', 'fake', 'replay'])

/** What a place gets now. */
export interface Plan {
  mock: string; name: string; place: Place
  /** live: the real service. data: the mock, with data. own: the mock, with what its server holds itself. none: nothing to run. */ how: 'live' | 'data' | 'own' | 'none'
  /** The mock: which form of each endpoint's data it is given (mock-serve.ts). */ form?: Form
  /** It answers with a real response as it is, for at least one call: this computer only. */ real?: boolean
  /** live: what it sends is kept (a smoke run, through the recorder). */ record?: boolean
  /** The choice in force, and whose it is. */ choice: Choice; from: 'task' | 'app' | 'none'
  /** What it comes to, in words. */ says: string
  /** What stands in the way of the choice, when it could not be had as chosen. */ note?: string
  /** Reviewer only: why its copy cannot be made as things stand. */ blocked?: string
}

const cleanChoice = (c: unknown): Choice | null => {
  const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
  if (!(MOCK_SOURCES as readonly string[]).includes(String(x.source)) || x.source === 'default') return null
  return { source: x.source as Source }
}
const canLive = (m: Row) => !!m.upstream && Object.keys(m.env ?? {}).length > 0
const dataOf = async (mockId: string, key: string): Promise<DataRow | null> => (await db.select().from(mockData).where(and(eq(mockData.mockId, mockId), eq(mockData.key, key))))[0] ?? null
/** The form a choice comes to: recorded only where a person turned it on for their own prototype or smoke test. */
export const formOf = (c: Choice, place: Place): Form => (c.source === 'replay' && place !== 'review' ? 'recorded' : 'faked')
const callSays = (m: Row, keys: string[]) => { const all = cleanEndpoints(m.endpoints); return keys.map((k) => { const e = all.find((x) => x.key === k); return e ? `${e.method} ${e.path}` : 'its response' }).join(', ') }

/**
 * What one mock gets in one place: the real service, or the mock with each endpoint's data in the form the place
 * asks for. dry: only say (for a page); otherwise a whole-run fake made with a plan is first made again from a
 * newer recorded run.
 */
export async function planOf(m: Row, place: Place, issueId?: string | null, opts: { dry?: boolean } = {}): Promise<Plan> {
  const [own] = issueId ? await db.select().from(mockChoice).where(and(eq(mockChoice.mockId, m.id), eq(mockChoice.issueId, issueId), eq(mockChoice.place, place))) : []
  const app = cleanChoice((m.places ?? {})[place])
  const choice: Choice = cleanChoice(own) ?? app ?? { source: 'default' }
  const base = { mock: m.key, name: m.name, place, choice, from: (cleanChoice(own) ? 'task' : app ? 'app' : 'none') as Plan['from'] }
  let plan: Plan
  if (choice.source === 'live' && (canLive(m) || place !== 'smoke')) {
    plan = canLive(m)
      ? { ...base, how: 'live', record: place === 'smoke', says: place === 'smoke' ? `The real ${m.name}, every run; what it sends is kept` : `The real ${m.name}, every run, by the app's own settings; not kept (a smoke run keeps it)` }
      : { ...base, how: 'live', record: false, says: `The real ${m.name}, every run, by the app's own settings; not kept` }
  } else {
    const form = formOf(choice, place)
    let note = choice.source === 'live' ? 'a live run needs its real address and the environment variable to override, so the mock is used' : undefined
    // A whole real response (a recorded run, or files given for no one endpoint), faked with a plan, is faked again when a newer one comes in.
    const whole = await dataOf(m.id, 'faked'), newest = recordingsFor(m).find((r) => !scopeOfRecording(r.dir))
    if (whole?.kind === 'faked' && whole.recording && newest && whole.recording !== newest.dir) {
      if (opts.dry) note = note ?? `a newer real response (${day(newest.at)}) is faked when this next runs`
      else try { await fakeData(m.appId, m.key, { recording: newest.dir, plan: whole.plan as Record<string, never>, dataKey: 'faked', issueId: issueId ?? null }, 'engine') } catch (err) { note = `a newer real response could not be faked with the plan it has, so the last fake is used: ${String((err as Error).message).split('\n')[0]}` }
    }
    const s = await served(m, { form, issueId })
    if (s.unfaked.length) note = note ?? `${s.unfaked[0] === '*' ? 'its real response' : `the real response of ${callSays(m, s.unfaked)}`} is not faked yet${form === 'faked' ? ', so nothing of it is served' : ''}: the task's agent makes the fake`
    const kinds = new Set(Object.values(s.per).map((p) => p.kind))
    if (!s.files.length) plan = m.cmd && m.status !== 'needs_recording' ? { ...base, how: 'own', form, says: 'The mock, answering with what its server makes up' } : { ...base, how: 'none', form, says: 'Nothing yet: its mock is not built' }
    else plan = { ...base, how: 'data', form, real: s.real.length > 0, says: s.real.length ? `The mock, with recorded responses as they are${s.real[0] === '*' ? '' : ` (${s.real.length} of its ${Object.keys(s.per).length} calls)`}: this computer only` : `The mock, with ${kinds.has('faked') || !kinds.has('provided') ? 'faked' : 'provided'} data${kinds.has('faked') && kinds.has('provided') ? ' and data you provided' : ''}` }
    if (form === 'recorded' && !s.real.length && plan.how !== 'none') note = note ?? 'there is no recorded response yet, so nothing real is served'
    if (note) plan.note = note
    if (place === 'review' && s.unfaked.length) plan.blocked = `${s.unfaked[0] === '*' ? `${m.name}'s real response` : `the real response of ${m.name}'s ${callSays(m, s.unfaked)}`} has no fake yet, and a reviewer is never given a real one`
  }
  if (place === 'review') {
    if (plan.how === 'live') plan.blocked = `a reviewer cannot be given the real ${m.name}`
    else if (plan.real) plan.blocked = `${m.name} would answer a reviewer with a real response, which never leaves this computer`
    else if (plan.how === 'none') plan.blocked = `${m.name} has no mock yet`
  }
  return plan
}

/** Every mock of the app in one place, for a run: the form each is served in, which are called for real, which are on real data. */
export async function plansFor(appId: string, place: Place, issueId?: string | null, opts: { dry?: boolean } = {}) {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.key))
  const plans: Plan[] = []
  for (const m of rows) plans.push(await planOf(m, place, issueId, opts))
  const blocked = plans.filter((p) => p.blocked)
  if (blocked.length && !opts.dry) throw new PlanError(blocked.map((p) => p.blocked).join('; '))
  return {
    plans,
    /** What each mock is given: its endpoints' data in this form, with this task's own where it has any. */ pick: Object.fromEntries(plans.filter((p) => p.how !== 'live').map((p) => [p.mock, { form: p.form ?? 'faked', issueId: issueId ?? null }])) as Record<string, { form: Form; issueId: string | null }>,
    /** Called for real: left out of the mocks that are started. */ live: plans.filter((p) => p.how === 'live').map((p) => p.mock),
    /** Of those, the ones whose answers are kept. */ record: plans.filter((p) => p.how === 'live' && p.record).map((p) => p.mock),
    /** Answering with a real response: this must not be shared. */ real: plans.filter((p) => p.how === 'live' || p.real).map((p) => p.mock),
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
  if (source === 'data') throw new PlanError('data sits on the endpoint now: choose the real service (live) or the mock (fake; replay for recorded responses as they are), and give each endpoint its data')
  if (!sourcesFor(p).includes(source)) throw new PlanError(`a reviewer is never given real data: for the reviewer the mock answers with faked data`)
  const data: string | null = null
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
  places: Record<Place, Plan & { /** The task's own choice, when it has one. */ own: Choice | null; /** The app's. */ app: Choice | null }>
}
/** The table: every mock, and what each place gets, for the app (no task) or for a task. Nothing is made. */
export async function placesTable(appId: string, issueId?: string | null): Promise<PlacesRow[]> {
  const rows = await db.select().from(mock).where(eq(mock.appId, appId)).orderBy(asc(mock.name))
  const out: PlacesRow[] = []
  for (const m of rows) {
    const own = issueId ? await db.select().from(mockChoice).where(and(eq(mockChoice.mockId, m.id), eq(mockChoice.issueId, issueId))) : []
    const places = {} as PlacesRow['places']
    for (const p of MOCK_PLACES) places[p] = { ...(await planOf(m, p, issueId, { dry: true })), own: cleanChoice(own.find((c) => c.place === p)), app: cleanChoice((m.places ?? {})[p]) }
    out.push({ mock: m.key, name: m.name, status: m.status, canLive: canLive(m), real: recordingsFor(m)[0]?.at ?? null, places })
  }
  return out
}

/** What an agent is told of a task's table. */
export function placesPrompt(table: PlacesRow[]): string {
  if (!table.length) return ''
  const line = (r: PlacesRow) => `- ${r.name} (${r.mock}): ${MOCK_PLACES.map((p) => `${PLACE_NAMES[p].toLowerCase()}: ${r.places[p].says}${r.places[p].note ? ` (${r.places[p].note})` : ''}${r.places[p].blocked ? ` [cannot be made: ${r.places[p].blocked}]` : ''}`).join('; ')}`
  return `\nWhere each mock's data comes from for this work, place by place (the person's to set on the task's Data step; you may set it with mock_data, op place, when they ask: source live is the real service, fake the mock with faked data, replay the mock with recorded responses as they are):\n${table.map(line).join('\n')}\nA reviewer is never given real data: what a reviewer's copy carries is a fake, or data that holds nothing real.`
}
