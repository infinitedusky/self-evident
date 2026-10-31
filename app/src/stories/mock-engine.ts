/**
 * The engine, faked for stories with MSW: every GET the UI makes answers from the sample data, writes answer ok, and
 * the event stream stays open and silent. A story changes what the engine says with `beforeEach: withEngine({ now: quietNow })`.
 */
import { http, HttpResponse, delay, type RequestHandler } from 'msw'
import type { StoryContext } from '@storybook/react-vite'
import * as s from './sample'
import { rows } from '@self-evident/engine/steps'

export interface MockData {
  apps: typeof s.apps; now: typeof s.now; projects: typeof s.projects; graphs: Record<string, typeof s.graph>; issueRows: typeof s.issueRows
  issueDetails: typeof s.issueDetails; todos: typeof s.todos; ideas: typeof s.ideaRows; initiatives: typeof s.initiatives; cycles: typeof s.cycles
  summary: typeof s.summary; settings: typeof s.factorySettings; appSettings: typeof s.appSettings; talks: (typeof s.talkSession)[]; transcript: typeof s.transcript
  storybook: { url: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[] }
  prototypes: typeof s.prototypes
  claudeSessions: typeof s.claudeSessions
  check: { ok: boolean; detail: string }
  plan: typeof s.plan; workflows: typeof s.workflowRows; steps: Record<string, typeof s.taskStepsView>; stepWork: typeof s.researchWork | null
}

export const sampleData: MockData = {
  apps: s.apps, now: s.now, projects: s.projects, graphs: { proj_checkout: s.graph, proj_draft: s.draftGraph }, issueRows: s.issueRows, issueDetails: s.issueDetails,
  todos: s.todos, ideas: s.ideaRows, initiatives: s.initiatives, cycles: s.cycles, summary: s.summary, settings: s.factorySettings, appSettings: s.appSettings,
  talks: [s.talkSession], transcript: s.transcript,
  storybook: { url: 'http://localhost:6007', configured: true, startable: true, up: false, startedHere: false, log: [] },
  prototypes: s.prototypes,
  claudeSessions: s.claudeSessions,
  check: { ok: true, detail: 'Signed in as Sample Owner; team SHOP (Sample Shop) found.' },
  plan: s.plan, workflows: s.workflowRows, steps: { ideas: s.ideaStepsView, issues: s.taskStepsView, projects: s.projectStepsView }, stepWork: s.researchWork,
}

/** An event stream that opens and says nothing: pages subscribe without errors and never refetch. */
const silentStream = () => new HttpResponse(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })

export function mockEngine(overrides: Partial<MockData> = {}, opts: { latency?: number | 'infinite' } = {}) {
  const d = { ...sampleData, ...overrides }
  const reply = async <T,>(body: T) => { if (opts.latency) await delay(opts.latency); return HttpResponse.json(body as object) }
  const missing = (what: string) => HttpResponse.text(`no ${what}`, { status: 404 })
  const appGraph = () => {
    const gs = Object.values(d.graphs)
    return { app: d.apps[d.apps.length - 1], projects: gs.map((g) => ({ id: g.project.id, name: g.project.name, status: g.project.status, pr: g.pr })), issues: gs.flatMap((g) => g.issues), subIssues: gs.flatMap((g) => g.subIssues), conflicts: gs.flatMap((g) => g.conflicts), files: gs.flatMap((g) => g.files ?? []) }
  }
  return [
    http.get('/api/events', () => silentStream()),
    http.get('/api/apps', () => reply(d.apps)),
    http.get('/api/workspaces', () => reply([s.workspace])),
    http.get('/api/settings', () => reply(d.settings)),
    http.get('/api/apps/:id/settings', () => reply(d.appSettings)),
    http.post('/api/integrations/:key/check', () => reply(d.check)),
    http.get('/api/apps/:id/claude-sessions', () => reply(d.claudeSessions)),
    http.post('/api/talks/adopt', () => reply(d.talks[0])),
    http.post('/api/talks/:id/handoff', () => reply({ command: `cd "/Users/sample/code/sample-shop-worktrees/talk-sample" && claude --resume 00000000-sample --mcp-config '{"mcpServers":{"self-evident":{"type":"http","url":"http://localhost:4000/api/mcp/app_sample"}}}'` })),
    http.get('/api/apps/:id/storybook', () => reply(d.storybook)),
    http.get('/api/apps/:id/prototypes', () => reply(d.prototypes)),
    http.get('/api/prototypes/:id', ({ params }) => { const p = d.prototypes.find((x) => x.id === params.id); return p ? reply({ log: [], ...p, up: p.up ?? p.status === 'running' }) : missing('prototype') }),
    http.get('/api/apps/:id/summary', () => reply(d.summary)),
    http.get('/api/apps/:id/graph', () => reply(appGraph())),
    http.get('/api/now', () => reply(d.now)),
    http.get('/api/ideas', () => reply(d.ideas)),
    http.get('/api/projects', () => reply(d.projects)),
    http.get('/api/projects/:id/graph', ({ params }) => { const g = d.graphs[params.id as string]; return g ? reply(g) : missing('project') }),
    http.get('/api/issues', ({ request }) => {
      const q = new URL(request.url).searchParams
      if (q.get('view') === 'code') return reply(d.issueRows)
      const all = Object.values(d.issueDetails)
      return reply(all.filter((i) => (!q.get('kind') || i.kind === q.get('kind')) && (!q.get('project') || i.projectId === q.get('project')) && (!q.get('top') || !i.parentId)))
    }),
    http.get('/api/issues/:id', ({ params }) => { const i = d.issueDetails[params.id as string]; return i ? reply(i) : missing('issue') }),
    http.get('/api/todos', () => reply(d.todos)),
    http.get('/api/plan', () => reply(d.plan)),
    http.get('/api/workflows', () => reply(d.workflows)),
    http.get('/api/:kind/:id/steps', ({ params }) => { const v = d.steps[params.kind as string]; return v ? reply({ ...v, rows: rows(v.on, v.states, v.resolved.workflow) }) : missing('steps') }),
    http.get('/api/:kind/:id/steps/:key', () => reply(d.stepWork)),
    http.get('/api/initiatives', () => reply(d.initiatives)),
    http.get('/api/cycles', () => reply(d.cycles)),
    http.get('/api/talks', () => reply(d.talks)),
    http.get('/api/talks/:id', () => reply(d.transcript)),
    // Writes do nothing and say ok, so clicking around a story never shows an error.
    http.all('/api/*', () => HttpResponse.json({ ok: true })),
  ]
}

/** The live feed with these events in it, then quiet: for a page that shows what happened (a build's log). */
export const eventStream = (events: { seq: number; type: string }[]) => http.get('/api/events', () => new HttpResponse(new ReadableStream({
  start(c) { const enc = new TextEncoder(); for (const e of events) c.enqueue(enc.encode(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)) },
}), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } }))

/** The engine is down: every call fails the way a dead proxy does. */
export const engineDown = [http.all('/api/*', () => HttpResponse.text('engine unreachable', { status: 502 }))]

/** A story's engine: its handlers in front of the sample engine's. */
export const withEngine = (overrides: Partial<MockData> | RequestHandler[] = {}, opts: { latency?: number | 'infinite' } = {}) =>
  ({ msw }: StoryContext) => { msw.use(...(Array.isArray(overrides) ? overrides : mockEngine(overrides, opts))) }
