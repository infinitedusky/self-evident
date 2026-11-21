/**
 * What a task calls outside the app, listed before any mock is thought of (Sandy, 2026-11-21: "the brief, research,
 * sketches, screens and mockup should all let us know by that point. The agent should know what endpoints are
 * required. In the data tab, it should list those endpoints, with some information about what it needs to do. And
 * then we should be able to … create mocks and link from the mock to the endpoints that are required. And you can
 * add additional endpoints if you think they're required and it's not listed").
 *
 * So the Data step starts from the task, not from the mocks the app happens to have. Each call is one row: the
 * service, the method and path, and what this task needs from it. A call is answered by an endpoint of that
 * service's mock (mock-endpoints.ts): found by its method and path, or linked by hand. Each row says where it
 * stands: answered, with a real response behind it or from the code; the service has a mock that lacks this call;
 * or the service has no mock at all. From there the mock is made, or the call added to it, and a real response can
 * be given for that one call.
 */
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue, mock, taskCall } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { cleanEndpoints, endpointFor, type Endpoint, type EndpointView } from './mock-endpoints.js'
import { getMock, listMocks, needsRecording, rowOf, workspaceOf, type MockView } from './mocks.js'
import { standInKey } from './stand-ins.js'

export const CALLS_MAX = 80
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)
export interface NewCall { service: string; method: string; path: string; what?: string }
export interface CallView {
  id: string; service: string; serviceName: string; method: string; path: string; what: string; by: 'agent' | 'user'
  /** answered: an endpoint of the service's mock answers it. no_endpoint: the mock is there and lacks this call. no_mock: the service has no mock. */ state: 'answered' | 'no_endpoint' | 'no_mock'
  /** The mock that answers the service, when there is one. */ mock: { key: string; name: string; status: MockView['status'] } | null
  /** The endpoint that answers it, with the real response behind it (or none: from the code) and its data files. */ endpoint: EndpointView | null
  /** Linked by hand, rather than found by its method and path. */ linked: boolean
}

async function taskOf(issueId: string) {
  const [t] = await db.select({ id: issue.id, appId: issue.appId }).from(issue).where(eq(issue.id, issueId))
  if (!t) throw new PlanError('no such task')
  return t
}
const cleanCall = (c: NewCall) => {
  const serviceName = clip(c.service, 80), service = standInKey(serviceName), path = clip(c.path, 300)
  if (!service) throw new PlanError('a call needs the service it is made to')
  if (!path) throw new PlanError('a call needs its path: /runs/{id}/status, or in words where it is reached by a link the service sends')
  return { service, serviceName, method: clip(c.method, 10).toUpperCase() || 'GET', path, what: clip(c.what, 400) }
}

/** The task's calls, each with what answers it now. */
export async function listCalls(issueId: string): Promise<CallView[]> {
  const t = await taskOf(issueId)
  const rows = await db.select().from(taskCall).where(eq(taskCall.issueId, issueId)).orderBy(asc(taskCall.serviceName), asc(taskCall.createdAt))
  const mocks = new Map((await listMocks(t.appId)).map((m) => [m.key, m]))
  return rows.map((r) => {
    const m = mocks.get(r.service) ?? null
    const byHand = r.endpoint ? m?.endpoints.find((e) => e.key === r.endpoint) ?? null : null
    const found = byHand ?? (m ? m.endpoints.find((e) => e.key === endpointFor(m.endpoints, r.method, r.path)?.key) ?? m.endpoints.find((e) => e.method === r.method && e.path === r.path) ?? null : null)
    return {
      id: r.id, service: r.service, serviceName: m?.name ?? r.serviceName, method: r.method, path: r.path, what: r.what, by: r.by === 'user' ? 'user' as const : 'agent' as const,
      state: found ? 'answered' as const : m ? 'no_endpoint' as const : 'no_mock' as const,
      mock: m ? { key: m.key, name: m.name, status: m.status } : null, endpoint: found, linked: !!byHand,
    }
  })
}

async function noted(issueId: string, appId: string, actor: string, type: string, payload: Record<string, unknown>) {
  const workspaceId = await workspaceOf(appId)
  await db.transaction((tx) => appendEvent(tx, { workspaceId, appId, issueId, actor, type, payload }))
}
/** One call added: by the person, or by the agent as it finds one. The same call twice is the one row, with what it needs brought up to date. */
export async function addCall(issueId: string, c: NewCall, actor = 'user') {
  const t = await taskOf(issueId), v = cleanCall(c)
  const [old] = await db.select().from(taskCall).where(and(eq(taskCall.issueId, issueId), eq(taskCall.service, v.service), eq(taskCall.method, v.method), eq(taskCall.path, v.path)))
  if (old) await db.update(taskCall).set({ what: v.what || old.what, serviceName: v.serviceName }).where(eq(taskCall.id, old.id))
  else {
    if ((await db.select({ id: taskCall.id }).from(taskCall).where(eq(taskCall.issueId, issueId))).length >= CALLS_MAX) throw new PlanError(`a task lists ${CALLS_MAX} calls at most`)
    await db.insert(taskCall).values({ id: newId('run').replace(/^run_/, 'tcall_'), issueId, ...v, by: actor.startsWith('user') ? 'user' : 'agent' })
  }
  await noted(issueId, t.appId, actor, 'task.call', { service: v.service, method: v.method, path: v.path })
  return listCalls(issueId)
}
/** The agent's whole list, as it reads the brief and the code: its own rows are replaced by these; the person's stay. */
export async function setCalls(issueId: string, calls: NewCall[], actor = 'agent') {
  const t = await taskOf(issueId)
  const clean = calls.slice(0, CALLS_MAX).map(cleanCall)
  const was = await db.select().from(taskCall).where(eq(taskCall.issueId, issueId))
  const same = (a: { service: string; method: string; path: string }, b: { service: string; method: string; path: string }) => a.service === b.service && a.method === b.method && a.path === b.path
  const now = Date.now()
  let n = 0
  await db.transaction(async (tx) => {
    for (const r of was) if (r.by !== 'user' && !clean.some((c) => same(c, r))) await tx.delete(taskCall).where(eq(taskCall.id, r.id))
    for (const c of clean) {
      const old = was.find((r) => same(c, r))
      if (old) await tx.update(taskCall).set({ what: c.what || old.what, serviceName: c.serviceName }).where(eq(taskCall.id, old.id))
      else await tx.insert(taskCall).values({ id: newId('run').replace(/^run_/, 'tcall_'), issueId, ...c, by: 'agent', createdAt: new Date(now + n++) }) // in the order they were listed
    }
  })
  await noted(issueId, t.appId, actor, 'task.calls', { calls: clean.length })
  return listCalls(issueId)
}
/** A call changed: the service, the call itself, or what the task needs from it. */
export async function editCall(issueId: string, id: string, c: Partial<NewCall>, actor = 'user') {
  const t = await taskOf(issueId)
  const [r] = await db.select().from(taskCall).where(and(eq(taskCall.id, id), eq(taskCall.issueId, issueId)))
  if (!r) throw new PlanError('no such call on this task')
  const v = cleanCall({ service: c.service ?? r.serviceName, method: c.method ?? r.method, path: c.path ?? r.path, what: c.what ?? r.what })
  const [same] = await db.select().from(taskCall).where(and(eq(taskCall.issueId, issueId), eq(taskCall.service, v.service), eq(taskCall.method, v.method), eq(taskCall.path, v.path)))
  if (same && same.id !== id) throw new PlanError(`this task already lists ${v.method} ${v.path} to ${v.serviceName}`)
  // What it was tied to by hand may be another service's, or no longer the same call: found again by its method and path.
  await db.update(taskCall).set({ ...v, ...(v.service !== r.service || v.method !== r.method || v.path !== r.path ? { endpoint: null } : {}) }).where(eq(taskCall.id, id))
  await noted(issueId, t.appId, actor, 'task.call_changed', { id })
  return listCalls(issueId)
}
/** The whole list emptied, the person's own among them: to start again. */
export async function clearCalls(issueId: string, actor = 'user') {
  const t = await taskOf(issueId)
  await db.delete(taskCall).where(eq(taskCall.issueId, issueId))
  await noted(issueId, t.appId, actor, 'task.calls_cleared', {})
  return listCalls(issueId)
}
export async function removeCall(issueId: string, id: string, actor = 'user') {
  const t = await taskOf(issueId)
  await db.delete(taskCall).where(and(eq(taskCall.id, id), eq(taskCall.issueId, issueId)))
  await noted(issueId, t.appId, actor, 'task.call_removed', { id })
  return listCalls(issueId)
}
/** A call tied by hand to one of its mock's endpoints (or, with none, left to be found by its method and path). */
export async function linkCall(issueId: string, id: string, endpoint: string | null, actor = 'user') {
  const t = await taskOf(issueId)
  const [r] = await db.select().from(taskCall).where(and(eq(taskCall.id, id), eq(taskCall.issueId, issueId)))
  if (!r) throw new PlanError('no such call on this task')
  if (endpoint) {
    const m = await rowOf(t.appId, r.service)
    if (!m) throw new PlanError(`${r.serviceName} has no mock to link to`)
    if (!cleanEndpoints(m.endpoints).some((e) => e.key === standInKey(endpoint))) throw new PlanError(`${m.name} has no endpoint "${endpoint}"`)
  }
  await db.update(taskCall).set({ endpoint: endpoint ? standInKey(endpoint) : null }).where(eq(taskCall.id, id))
  await noted(issueId, t.appId, actor, 'task.call_linked', { id, endpoint })
  return listCalls(issueId)
}

const keyFor = (c: { method: string; path: string }, taken: string[]) => {
  const parts = c.path.startsWith('/') ? c.path.replace(/[?#].*$/, '').split('/').filter((p) => p && !/^(\{.*\}|:.*|\*)$/.test(p)) : c.path.split(/\s+/).slice(0, 3)
  const base = standInKey(parts.slice(-2).join(' ') || c.method) || 'call'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`
  return key
}
/**
 * A call given something to answer it: the service's mock made if it has none (raised on the task, needing a real
 * response), and the call added to the mock's endpoints if it lacks it. Its server answers it once the task's agent
 * builds or changes it; a real response can be given for it straight away.
 */
export async function coverCall(issueId: string, id: string, actor = 'user') {
  const t = await taskOf(issueId)
  const [r] = await db.select().from(taskCall).where(and(eq(taskCall.id, id), eq(taskCall.issueId, issueId)))
  if (!r) throw new PlanError('no such call on this task')
  let m = await rowOf(t.appId, r.service)
  if (!m) { await needsRecording(t.appId, { name: r.serviceName, issueId, needs: { why: `this task calls ${r.method} ${r.path}` } }, actor); m = (await rowOf(t.appId, r.service))! }
  const endpoints = cleanEndpoints(m.endpoints)
  if (!endpointFor(endpoints, r.method, r.path) && !endpoints.some((e) => e.method === r.method && e.path === r.path)) {
    const added: Endpoint = { key: keyFor(r, endpoints.map((e) => e.key)), method: r.method, path: r.path, ...(r.what ? { what: r.what } : {}) }
    const workspaceId = await workspaceOf(t.appId)
    await db.transaction(async (tx) => {
      await tx.update(mock).set({ endpoints: [...endpoints, added], ...(m!.issueId ? {} : { issueId }), updatedAt: new Date() }).where(eq(mock.id, m!.id))
      await appendEvent(tx, { workspaceId, appId: t.appId, issueId, actor, type: 'mock.endpoint_added', payload: { key: m!.key, endpoint: added.key, method: added.method, path: added.path } })
    })
  }
  return { calls: await listCalls(issueId), mock: await getMock(t.appId, r.service).then(({ fileText: _f, ...v }) => v) }
}

/** What a task's agent is told of them. */
export function callsPrompt(calls: CallView[]): string {
  const line = (c: CallView) => `- ${c.serviceName}: ${c.method} ${c.path}${c.what ? ` — needs: ${c.what}` : ''} [${c.state === 'answered' ? `answered by its mock${c.endpoint?.real ? `, from a real response (${c.endpoint.real.how})` : ', from the code (no real response)'}` : c.state === 'no_endpoint' ? 'its mock lacks this call' : 'no mock'}]`
  return `\nWhat this task calls outside the app (its Data step; the task_calls tool): ${calls.length ? `\n${calls.map(line).join('\n')}` : 'not listed yet.'}\nKeep that list true. Once the brief and what came before it say what the change does, read the code it touches and list every call it makes to anything outside the app (task_calls, op set: service, method, path with {id} for a part that varies, and what this task needs from it: what must come back, and the cases it has to show). The person may add calls you missed; yours are replaced when you set the list again, theirs stay. A call whose mock lacks it: add it to the mock's endpoints and its server when you build or change the mock.`
}
