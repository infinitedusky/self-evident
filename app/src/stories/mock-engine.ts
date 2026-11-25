/**
 * The engine, faked for stories with MSW: every GET the UI makes answers from the sample data, writes answer ok, and
 * the event stream stays open and silent. A story changes what the engine says with `beforeEach: withEngine({ now: quietNow })`.
 */
import { http, HttpResponse, delay, type RequestHandler } from 'msw'
import type { StoryContext } from '@storybook/react-vite'
import * as s from './sample'
import { rows } from '@self-evident/engine/steps'

/** An app's main, off: it can be run here. Made-up (sample). */
export const MAIN_OFF: import('../engine').MainRunning = { appId: 'app_sample', branch: 'main', how: 'local', url: null, running: false, up: false, canRun: true, sha: null, tip: '4f2a9c1d0b7e', behind: false, log: [], standIns: [], database: null, idleMinutes: 30, stopsAt: null }
export interface MockData {
  apps: typeof s.apps; now: typeof s.now; projects: typeof s.projects; graphs: Record<string, typeof s.graph>; issueRows: typeof s.issueRows
  issueDetails: typeof s.issueDetails; todos: typeof s.todos; ideas: typeof s.ideaRows; initiatives: typeof s.initiatives; cycles: typeof s.cycles
  summary: typeof s.summary; settings: typeof s.factorySettings; appSettings: typeof s.appSettings; talks: (typeof s.talkSession)[]; transcript: typeof s.transcript; /** A task's own agent, or null when it has none. */ taskTalk: typeof s.talkSession | null; /** The agents it has out. */ taskAgents?: import('../engine').TaskAgentOut[]; /** An idea's own agent, or null when it has none. */ ideaTalk?: typeof s.talkSession | null
  storybook: { url: string | null; frame?: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[]; branch?: string | null; main?: boolean }
  /** A project's own agent, or none; and the agents it has out. */ projectTalk?: typeof s.talkSession | null; projectAgents?: import('../engine').TaskAgentOut[]
  /** The app's tickets, each with its tasks. */ tickets: import('../engine').TicketGroup[]
  /** The app's mock library. */ mocks: import('../engine').Mock[]
  /** Where each mock's data comes from: the app's defaults, and one task's. */ mockPlaces: import('../engine').MockPlacesRow[]; mockPlacesForTask: import('../engine').MockPlacesRow[]
  mockChanges: import('../engine').MockChange[]
  /** What the sample task calls outside the app. */ taskCalls: import('../engine').TaskCall[]
  /** A service's real responses on this computer. */ mockReal: import('../engine').MockReal[]
  /** Notes on the app. */ notes: import('../engine').Note[]
  /** The app's fixtures, and the one a task's runs are built from. */ /** Test files: the app's and the sample task's. */ testFiles: import('../engine').TestFile[]; fixtures: import('../engine').Fixture[]; fixtureUsed: string | null; /** Can a fixture be made from the app's seed. */ fixtureMake: { ok: boolean; missing: string | null }
  /** The services the sample task calls. */ taskServices: import('../engine').TaskService[]
  /** The stories under Screens/ and the Storybook that renders them. */ screens: import('../engine').ScreensView & { /** With the earlier tasks' ones, when asked for. */ all?: import('../engine').Screen[] }
  sketches: { scope: string; branch: string | null; main: boolean; dir: string; sketches: { file: string; changedAt: number }[]; earlier?: number; /** With the earlier tasks' ones, when asked for. */ all?: { file: string; changedAt: number }[] }
  /** A task's smoke test; left out, there is nothing for a person on it. */ smoke?: import('../engine').SmokeView
  /** Where a checklist task stands; left out, the task's workflow is staged and it has none. */ checklist?: import('../engine').Checklist
  /** A task's test trajectory; none written when left out. */ trajectory?: import('../engine').Trajectory
  /** What a task's pull request will open with; none when left out. */ mergeGuide?: string; /** The record folded away under it. */ mergeRecord?: string
  /** The last run of each command step of a prototype's guide; none when left out. */ prototypeRuns?: import('../engine').StepRun[]
  /** Nightly checks' last runs and the repository's workflows; none when left out. */ nightly?: Awaited<ReturnType<typeof import('../engine').engine.nightly>>
  /** Probes tried on past work, and the merged tasks a trial would run on; none when left out. */ trials?: import('../engine').Trial[]; trialTasks?: { issueId: string; identifier: string; title: string; pr: number | null }[]
  /** The apps put away; none when left out. */ removedApps?: import('../engine').AppHolds[]; /** Why an app can't be removed yet, as the engine says it. */ removeProblem?: string
  /** The app's reports; none when left out. */ reports?: import('../engine').Reports
  /** What was learned from the app's code; nothing yet when left out. */ learning?: import('../engine').Learning
  /** The person's own pages about the app; none when left out. */ appDocs?: import('../engine').AppDoc[]; /** Why writing a page fails, when it should. */ appDocError?: string
  /** Why submitting a pull request fails, when it should. */ submitPrError?: string
  /** A task's pull request as a step; not submitted (prSample) when left out. */ prView?: import('../engine').PrView
  /** A task's data agent; never asked (dataAgentSample) when left out. */ dataAgent?: import('../engine').DataAgentView
  /** An app's docs site; running (docsSiteSample) when left out. */ docsSite?: import('../engine').DocsSite; /** Why starting it fails, when it should. */ docsSiteError?: string
  /** An app's workbench folder and hooks; workbenchSample when left out. */ workbench?: import('../engine').WorkbenchView
  /** A task's review copy; not made yet (reviewCopySample) when left out. */ reviewCopy?: import('../engine').ReviewCopyView
  /** A pull request's finalizing; never run (finalizeNoneSample) when left out. */ finalize?: import('../engine').FinalizeView
  /** Making it is refused, with this. */ reviewCopyError?: string
  /** A task's save points and task branches; none when left out. */ taskBranches?: import('../engine').TaskBranches; /** Why a move fails, when it should. */ moveError?: string
  /** What a run read and said, for the planner's tab. */ runLog?: import('../engine').RunLog
  /** What is public right now, by "kind:id". */ shares?: Record<string, import('../engine').Shared>; /** Why making a link fails, when it should. */ shareError?: string; /** ngrok's one address is held by these, until the person frees it. */ ngrokHolders?: import('../engine').NgrokHolder[]; /** What the guide tab of a shared prototype is given. */ visitorGuide?: { title: string; guide: import('../engine').Guide | null }
  /** The app's main, running; off when left out. */ main?: import('../engine').MainRunning; /** The main that is turned on stops by itself straight away, leaving these last lines. */ mainDies?: string[]; /** Whose main a start must ask for, when a story checks it: '' the app's own, else the task's (or prototype's) id. */ mainFor?: string; /** Why turning it on fails, when it should. */ mainError?: string; /** Where it answers once on; this page's own address when left out. */ mainUrl?: string
  prototypes: typeof s.prototypes; /** A prototype's changed files and what the agent shows. */ prototypeCode: typeof s.prototypeCode
  claudeSessions: typeof s.claudeSessions
  check: { ok: boolean; detail: string; links?: { label: string; href: string }[] }
  setup: { done: boolean; did: string[]; ask: string | null; detail: string; talkId: string | null }
  trackerGuide: string
  githubRepos: typeof s.githubRepos; repoNote: string | null; folder: typeof s.folder
  /** The Context of an idea, a task and a project (Context.tsx); `contextProblem`: why a ticket can't be brought in. */ context?: Partial<Record<'ideas' | 'issues' | 'projects', import('../engine').ContextView>>; contextProblem?: string
  /** Why a task can't be deleted, as the engine says it; null when it can. */ deleteProblem: string | null
  /** Repositories skills were pulled from (made up). */ skillSources: { url: string; commit: string; pulledAt: string; skills: string[] }[]
  /** Which Claude account the app's agents run on, as the engine finds it. */ account: { kind: 'default' | 'key' | 'login'; ok: boolean; note: string }
  assets: typeof s.assets
  linearTickets: typeof s.linearTickets; /** Why Linear can't be read, as the engine says it; null when it can. */ linearProblem: string | null
  plan: typeof s.plan; workflows: typeof s.workflowRows; steps: Record<string, typeof s.taskStepsView>; stepWork: typeof s.researchWork | null
}

export const sampleData: MockData = {
  apps: s.apps, now: s.now, projects: s.projects, graphs: { proj_checkout: s.graph, proj_draft: s.draftGraph }, issueRows: s.issueRows, issueDetails: s.issueDetails,
  todos: s.todos, ideas: s.ideaRows, initiatives: s.initiatives, cycles: s.cycles, summary: s.summary, settings: s.factorySettings, appSettings: s.appSettings,
  talks: [s.talkSession], transcript: s.transcript, taskTalk: { ...s.talkSession, subject: 'SS-20 Address and payment on one page (sample)', subjectRef: { issueId: 'iss_sample20' } },
  storybook: { url: 'http://localhost:6007', configured: true, startable: true, up: false, startedHere: false, log: [], branch: 'talk/sample', main: false },
  screens: s.screensView,
  tickets: s.tickets,
  mocks: s.mocks,
  notes: s.notes, mockPlaces: s.mockPlaces, mockPlacesForTask: s.mockPlacesForTask, mockChanges: s.mockChanges, taskCalls: s.taskCalls, mockReal: s.mockReal, taskServices: s.taskServices, testFiles: s.testFiles, fixtures: s.fixtures, fixtureUsed: null, fixtureMake: { ok: true, missing: null },
  sketches: { scope: 'sess_sample', branch: 'talk/sample', main: false, dir: 'sketches', sketches: [{ file: 'home.html', changedAt: 1794250000000 }, { file: 'checkout.html', changedAt: 1794240000000 }] },
  prototypes: s.prototypes, prototypeCode: s.prototypeCode,
  claudeSessions: s.claudeSessions,
  check: { ok: true, detail: 'Signed in as Sample Owner; team SHOP (Sample Shop) found.' },
  setup: { done: false, did: ['Wrote docs/agents/issue-tracker.md, pointing at SS here.', 'Wrote docs/agents/forge.md, docs/agents/workflow.md, docs/agents/domain.md, docs/agents/pull-request.md and the Ticket lifecycle block in CLAUDE.md, from the app, the repo and the house profile.', 'Committed to main and pushed (abc1234).'], ask: 'Evident\'s tkt check for Sample Shop (SS) says: tkt doctor: fail herdr herdr is not installed. (sample)', detail: 'tkt doctor: fail  herdr  herdr is not installed. Get tkt working: https://gitlab.com/rogs/tkt', talkId: 'sess_sample_setup' },
  trackerGuide: s.trackerGuideSample,
  githubRepos: s.githubRepos, repoNote: s.repoNote, folder: s.folder, assets: s.assets, linearTickets: s.linearTickets, linearProblem: null, deleteProblem: null, skillSources: [],
  account: { kind: 'default', ok: true, note: "The engine's default, the Claude Code login on this machine: owner@sample.example · max." },
  plan: s.plan, workflows: s.workflowRows, steps: { ideas: s.ideaStepsView, issues: s.taskStepsView, projects: s.projectStepsView }, stepWork: s.researchWork,
}

/** An event stream that opens and says nothing: pages subscribe without errors and never refetch. */
const silentStream = () => new HttpResponse(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })

export function mockEngine(overrides: Partial<MockData> = {}, opts: { latency?: number | 'infinite' } = {}) {
  const d = { ...sampleData, ...overrides }
  const reply = async <T,>(body: T) => { if (opts.latency) await delay(opts.latency); return HttpResponse.json(body as object) }
  // The smoke test's terminal, made up: one stream, and what is typed is said back on it.
  let shell: ReadableStreamDefaultController | null = null
  const say = (text: string) => { try { shell?.enqueue(new TextEncoder().encode(`event: data\ndata: ${JSON.stringify(text)}\n\n`)) } catch { /* nobody is listening */ } }
  const missing = (what: string) => HttpResponse.text(`no ${what}`, { status: 404 })
  const appGraph = () => {
    const gs = Object.values(d.graphs)
    return { app: d.apps[d.apps.length - 1], projects: gs.map((g) => ({ id: g.project.id, name: g.project.name, status: g.project.status, pr: g.pr })), issues: gs.flatMap((g) => g.issues), subIssues: gs.flatMap((g) => g.subIssues), conflicts: gs.flatMap((g) => g.conflicts), files: gs.flatMap((g) => g.files ?? []) }
  }
  return [
    http.get('/api/events', () => silentStream()),
    http.get('/api/frame', () => HttpResponse.json({ frame: null })), // a story's views are shown as they are, not through the engine's proxy
    http.get('/api/devices', () => reply({ tailscale: 'missing', address: null, remote: false, devices: [] })),
    http.get('/api/apps', ({ request }) => reply(new URL(request.url).searchParams.get('removed') === '1' ? d.removedApps ?? [] : d.apps)),
    http.post('/api/apps/:id/remove', () => d.removeProblem ? HttpResponse.json({ error: d.removeProblem }, { status: 400 }) : reply({})),
    http.post('/api/apps/:id/restore', ({ params }) => { d.removedApps = (d.removedApps ?? []).filter((a) => a.id !== params.id); return reply({}) }),
    http.delete('/api/apps/:id', ({ params }) => { d.removedApps = (d.removedApps ?? []).filter((a) => a.id !== params.id); return reply({ deleted: params.id }) }),
    http.get('/api/workspaces', () => reply([s.workspace])),
    http.get('/api/settings', () => reply(d.settings)),
    http.get('/api/skills/sources', () => reply(d.skillSources)),
    http.post('/api/skills/sources', async ({ request }) => {
      const { url } = (await request.json()) as { url: string }
      const had = d.skillSources.find((x) => x.url === url)
      const source = { url, commit: had ? 'b2c3d4e5f6a7b8c9' : 'a1b2c3d4e5f6a7b8', pulledAt: '2026-11-13T10:00:00.000Z', skills: had?.skills ?? ['shop-design', 'shop-voice'] }
      d.skillSources = [...d.skillSources.filter((x) => x.url !== url), source]
      return reply(had ? { source, added: [], updated: [had.skills[0]], unchanged: had.skills.slice(1), removed: [], skipped: [] } : { source, added: source.skills, updated: [], unchanged: [], removed: [], skipped: [] })
    }),
    http.delete('/api/skills/sources', ({ request }) => { const url = new URL(request.url).searchParams.get('url'); const had = d.skillSources.find((x) => x.url === url); d.skillSources = d.skillSources.filter((x) => x.url !== url); return reply({ removed: had?.skills ?? [] }) }),
    http.post('/api/skills/shared', async ({ request }) => { const b = (await request.json()) as { name: string }; return reply({ key: `shared/${b.name}`, name: b.name, file: `/Users/sample/.self-evident/shared/skills/${b.name}/SKILL.md` }) }),
    http.get('/api/apps/:id/settings', () => reply(d.appSettings)),
    http.get('/api/apps/:id/nightly', () => reply(d.nightly ?? { checks: [], workflows: [] })),
    http.get('/api/apps/:id/trials', () => reply({ trials: d.trials ?? [], tasks: d.trialTasks ?? [] })),
    http.post('/api/apps/:id/trials', async ({ request }) => { const b = await request.json() as { key: string; probe: import('../engine').Trial['probe'] }; const t = { id: 'trial_sample', key: b.key, probe: b.probe, status: 'running' as const, tasks: (d.trialTasks ?? []).length, costUsd: null, error: null, createdAt: s.T0, results: [] }; d.trials = [t, ...(d.trials ?? []).filter((x) => x.key !== b.key)]; return reply(t) }),
    http.get('/api/apps/:id/account', () => reply(d.account)),
    http.post('/api/integrations/:key/check', () => reply(d.check)),
    http.post('/api/integrations/:key/setup', () => reply(d.setup)),
    http.get('/api/github/repos', () => reply(d.githubRepos)),
    http.post('/api/apps', async ({ request }) => { const b = await request.json() as { name: string }; return reply({ ...s.otherApp, id: 'app_new', name: b.name, key: 'NEW', note: d.repoNote }) }),
    http.post('/api/repos', () => reply({ ...s.sampleApp.repos![0], note: d.repoNote })),
    http.patch('/api/repos/:id', () => reply({ ...s.sampleApp.repos![0], note: d.repoNote })),
    http.delete('/api/issues/:id', () => (d.deleteProblem ? HttpResponse.json({ error: d.deleteProblem }, { status: 400 }) : reply({ deleted: 'SS-16', title: 'sample', subIssues: 0, talksEnded: 0 }))),
    http.get('/api/apps/:id/assets', ({ request }) => { const project = new URL(request.url).searchParams.get('project'); return reply(d.assets.filter((a) => (project ? a.projectId === project : !a.projectId))) }),
    http.post('/api/assets', async ({ request }) => { const b = await request.json() as { appId: string; projectId?: string; name: string; location: string; note?: string }; return reply({ id: 'asset_sample_new', appId: b.appId, projectId: b.projectId ?? null, name: b.name, location: b.location, note: b.note ?? null }) }),
    http.delete('/api/assets/:id', ({ params }) => reply({ removed: params.id })),
    http.post('/api/projects', () => reply({ project: { id: 'proj_checkout' } })),
    http.post('/api/talks/ask', () => reply(d.talks[0] ?? s.talkSession)),
    http.delete('/api/repos/:id', ({ params }) => reply({ removed: params.id })),
    http.post('/api/folders/choose', () => reply(d.folder)),
    http.get('/api/apps/:id/tickets', () => reply(d.tickets)),
    http.get('/api/apps/:id/tickets/:key', ({ params }) => { const t = d.tickets.find((x) => x.key === String(params.key).toUpperCase()); return t ? reply(t) : HttpResponse.json({ error: `no ticket ${String(params.key).toUpperCase()} here: no task is under it, and it was never read from its tracker` }, { status: 400 }) }),
    // Read from the tracker (made up): a ticket known by its key alone gains a title and a link.
    http.post('/api/apps/:id/tickets/:key/read', ({ params }) => { const t = d.tickets.find((x) => x.key === params.key); if (!t) return missing('ticket'); const read = { ...t, title: t.title ?? 'Takedown requests for protected people (sample)', url: t.url ?? `https://linear.app/sample-shop/issue/${t.key}`, source: 'linear', read: true }; d.tickets = d.tickets.map((x) => (x.key === t.key ? read : x)); return reply(read) }),
    http.get('/api/apps/:id/linear/tickets', ({ request }) => {
      if (d.linearProblem) return HttpResponse.json({ error: d.linearProblem }, { status: 400 })
      const scope = new URL(request.url).searchParams.get('scope')
      return reply({ team: 'SHOP', tickets: d.linearTickets.filter((t) => (scope === 'mine' ? t.mine : scope === 'unassigned' ? !t.assignee : true)) })
    }),
    http.post('/api/apps/:id/linear/import', async ({ request }) => {
      const { identifiers, as } = await request.json() as { identifiers: string[]; as?: 'idea' | 'task' }
      const title = (l: string) => d.linearTickets.find((t) => t.identifier === l)?.title ?? l
      return reply({ made: identifiers.map((l, i) => as === 'task'
        ? { kind: 'task', id: `iss_sample_made${i}`, identifier: `SS-${50 + i}`, title: title(l), linear: l }
        : { kind: 'idea', id: `idea_sample_made${i}`, identifier: `#${30 + i}`, title: title(l), linear: l }), updated: [], missing: [] })
    }),
    http.get('/api/apps/:id/tracker-guide', () => HttpResponse.text(d.trackerGuide, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })),
    http.get('/api/apps/:id/claude-sessions', () => reply(d.claudeSessions)),
    http.post('/api/talks/adopt', () => reply(d.talks[0])),
    http.post('/api/talks/:id/handoff', () => reply({ command: `cd "/Users/sample/code/sample-shop-worktrees/talk-sample" && claude --resume 00000000-sample --mcp-config '{"mcpServers":{"self-evident":{"type":"http","url":"http://localhost:4000/api/mcp/app_sample"}}}'` })),
    http.get('/api/apps/:id/storybook', () => reply(d.storybook)),
    http.get('/api/apps/:id/mocks', () => reply(d.mocks)),
    http.post('/api/apps/:id/mocks', async ({ request }) => { const b = await request.json() as { name: string; standsInFor?: string }; const alike = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, ''); const there = d.mocks.find((m) => alike(m.name) === alike(b.name)); if (there) return HttpResponse.json({ error: `that is already one of this app's services, as "${there.name}"` }, { status: 400 }); const m: import('../engine').Mock = { ...d.mocks[d.mocks.length - 1], key: b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: b.name, standsInFor: b.standsInFor ?? '', status: 'needs_recording', needs: { at: '2026-11-21T10:00:00Z' }, issue: null, files: [], data: [], endpoints: [], unlinked: [], cmd: null }; d.mocks = [...d.mocks, m]; return reply(m) }),
    http.get('/api/apps/:id/mocks/:key/real', () => reply(d.mockReal)),
    http.delete('/api/apps/:id/mocks/:key/real', ({ request }) => { d.mockReal = d.mockReal.filter((r) => r.id !== new URL(request.url).searchParams.get('id')); return reply(d.mockReal) }),
    http.post('/api/apps/:id/mocks/:key/endpoints', async ({ params, request }) => { const b = await request.json() as { method: string; path?: string; what?: string; sensitive?: boolean; follows?: string; linkField?: string }; d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: [...m.endpoints, { key: `e${m.endpoints.length + 1}`, method: b.method, path: b.path || `the link in ${b.linkField} that ${m.endpoints.find((e) => e.key === b.follows)?.method} ${m.endpoints.find((e) => e.key === b.follows)?.path} answers with`, what: b.what, ...(b.sensitive ? { sensitive: true } : {}), ...(b.follows ? { follows: b.follows, linkField: b.linkField } : {}), real: null, files: [], data: { app: null, task: null } }] } : m)); return reply(d.mocks.find((m) => m.key === params.key)) }),
    // One endpoint's data given: the app's, or one task's own. A sensitive endpoint's real response is faked at once and not kept.
    http.post('/api/apps/:id/mocks/:key/endpoints/:endpoint/data', async ({ params, request }) => {
      const f = await request.formData(), real = f.get('real') === 'true', task = !!f.get('issueId'), forFixture = f.get('fixture') as string | null
      if (forFixture) return reply({ kept: real ? 'recorded' : 'provided', asked: null }) // one fixture's response: the default, which the stories show, is as it was
      const name = (e: import('../engine').MockEndpoint) => `${e.key}.${((f.get('file') as File | null)?.name ?? 'x.json').split('.').pop()}`
      const item = (e: import('../engine').MockEndpoint): import('../engine').EndpointItem => (real && !e.sensitive
        ? { recorded: { id: `sample/given-${e.key}`, at: '2026-11-22T10:00:00Z', how: 'given', files: [name(e)] }, safe: null }
        : { recorded: null, safe: { kind: real ? 'faked' : 'provided', set: `${real ? 'faked' : 'provided'}-${e.key}`, files: [name(e)], note: real ? 'Faked from a real response that was not kept, because this call is marked sensitive.' : 'Provided by a person, who states it holds nothing real.' } })
      const put = (e: import('../engine').MockEndpoint) => (e.key === params.endpoint ? { ...e, data: task ? { ...e.data, task: item(e) } : { ...e.data, app: item(e) } } : e)
      const was = d.mocks.find((m) => m.key === params.key)?.endpoints.find((e) => e.key === params.endpoint)
      if (!task) d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map(put) } : m))
      d.taskServices = d.taskServices.map((x) => (x.key === params.key ? { ...x, calls: x.calls.map((c) => (c.endpoint ? { ...c, endpoint: put(c.endpoint) } : c)) } : x))
      return reply({ kept: !real ? 'provided' : was?.sensitive ? 'faked' : 'recorded', asked: real && !was?.sensitive ? 'iss_sample2' : null })
    }),
    // Test files: the app's alone in its settings, the task's own with them on a task. (sample) A file named real.csv is refused, as text with a real value in it would be.
    http.get('/api/apps/:id/test-files', ({ request }) => reply(d.testFiles.filter((f) => f.scope === 'app' || !!new URL(request.url).searchParams.get('issue')))),
    http.post('/api/apps/:id/test-files', async ({ request }) => {
      const form = await request.formData(), task = !!form.get('issueId')
      const files = form.getAll('file').filter((f): f is File => typeof f !== 'string')
      if (files.some((f) => f.name === 'real.csv')) return HttpResponse.json({ error: 'refused: real.csv holds 2 values of a real response on this computer. Replace each with an invented one:\n- an email from a real response of Fraud scan vendor (sample) (2)' }, { status: 400 })
      const real = form.get('real') === 'true'
      const made = files.map((f, n) => { const text = /csv|json|text/.test(f.type), fake = !real || text; return { id: `tfile_new${d.testFiles.length + n}`, name: f.name, what: String(form.get('what') ?? ''), mediaType: f.type || 'application/octet-stream', bytes: f.size, scope: task ? 'task' as const : 'app' as const, checked: text ? { at: '2026-11-23T10:00:00Z', against: 2, ...(real ? { faked: 3 } : {}) } : null, has: { fake, real }, use: { prototype: fake ? 'fake' as const : null, smoke: fake ? 'fake' as const : null, review: fake ? 'fake' as const : null }, here: true } })
      // (sample) One added under the name of one that is there takes its place, keeping a real version it had.
      d.testFiles = d.testFiles.filter((x) => !made.some((m) => m.name === x.name && !real && x.has.real && (m.has.real = true)) && !made.some((m) => m.name === x.name))
      d.testFiles = [...d.testFiles, ...made]
      return reply(made)
    }),
    http.patch('/api/apps/:id/test-files/:file', async ({ params, request }) => { const b = await request.json() as { what?: string; use?: Record<string, 'fake' | 'real'> }; d.testFiles = d.testFiles.map((f) => (f.id === params.file ? { ...f, what: b.what ?? f.what, use: { ...f.use, ...(b.use ?? {}) } } : f)); return reply(d.testFiles.find((f) => f.id === params.file) ?? null) }),
    http.delete('/api/apps/:id/test-files/:file', ({ params }) => { d.testFiles = d.testFiles.filter((f) => f.id !== params.file); return reply({ removed: String(params.file) }) }),
    // A picture is a small made-up one (a grey square), so a thumbnail has something to show.
    http.get('/api/apps/:id/test-files/:file/file', () => new HttpResponse(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)), { headers: { 'content-type': 'image/png' } })),
    http.get('/api/apps/:id/fixtures', () => reply({ fixtures: d.fixtures, used: d.fixtureUsed, make: d.fixtureMake })),
    // Made from the seed (at once here; minutes for real), looked into, renamed, deleted.
    http.post('/api/apps/:id/fixtures', async ({ request }) => {
      const b = await request.json().catch(() => ({})) as { name?: string }, name = b.name ?? 'seed'
      if (!d.fixtureMake.ok) return HttpResponse.json({ error: `a fixture cannot be made from the seed yet: ${d.fixtureMake.missing}` }, { status: 400 })
      d.fixtures = [...d.fixtures.filter((f) => f.name !== name), { ...s.fixtures[0], name, madeFor: 0 }].sort((x, y) => x.name.localeCompare(y.name))
      return reply({ name, tables: Object.fromEntries(s.fixtures[0].tables.map((t) => [t.name, t.rows])) })
    }),
    http.get('/api/apps/:id/fixtures/:name/:table/rows', ({ params }) => {
      const t = d.fixtures.find((f) => f.name === params.name)?.tables.find((x) => x.name === params.table)
      if (!t) return HttpResponse.json({ error: 'no such table' }, { status: 404 })
      return reply({ columns: t.columns, total: t.rows, rows: s.fixturePeople.slice(0, Math.min(t.rows, 4)).map((p, n) => t.columns.map((c) => (c === 'id' ? p.label.split(' · ')[2] ?? String(n + 1) : c === 'first_name' ? p.label.split(' ')[0] : c === 'last_name' ? 'Sample' : c === 'work_email' ? p.label.split(' · ')[1] ?? '' : `${c} ${n + 1} (sample)`))) })
    }),
    http.patch('/api/apps/:id/fixtures/:name', async ({ params, request }) => {
      const to = ((await request.json()) as { name: string }).name
      if (d.fixtures.some((f) => f.name === to)) return HttpResponse.json({ error: `this app has a fixture "${to}" already` }, { status: 400 })
      d.fixtures = d.fixtures.map((f) => (f.name === params.name ? { ...f, name: to } : f)); if (d.fixtureUsed === params.name) d.fixtureUsed = to
      return reply({ name: to })
    }),
    http.delete('/api/apps/:id/fixtures/:name', ({ params }) => { d.fixtures = d.fixtures.filter((f) => f.name !== params.name); if (d.fixtureUsed === params.name) d.fixtureUsed = null; return reply({ deleted: params.name }) }),
    http.get('/api/apps/:id/fixtures/:name/:table', ({ params }) => reply({ columns: d.fixtures.find((f) => f.name === params.name)?.tables.find((t) => t.name === params.table)?.columns ?? [], rows: s.fixturePeople })),
    // An endpoint's data filled out for a fixture's people.
    // (sample) A mapping from a file is said back as it was given.
    http.put('/api/apps/:id/mocks/:key/endpoints/:endpoint/file-map', async ({ request }) => { const b = await request.json() as { file: string | null; map?: Record<string, string> }; return reply({ fromFile: b.file ? { file: b.file, map: b.map ?? {} } : null }) }),
    http.put('/api/apps/:id/mocks/:key/endpoints/:endpoint/fixture', async ({ params, request }) => {
      const b = await request.json() as { fixture: string; table: string; row: number; count: number; map: Record<string, string>; issueId?: string | null }
      const first = s.fixturePeople[b.row]?.label.split(' · ').slice(0, 2).join(', ') ?? 'someone'
      const madeFor = { fixture: b.fixture, table: b.table, who: b.count === 1 ? first : `${b.count} people, from ${first}`, people: b.count, map: b.map }
      const set = (e: import('../engine').MockEndpoint) => (e.key !== params.endpoint ? e : { ...e, data: { ...e.data, ...(b.issueId && e.data.task?.safe ? { task: { ...e.data.task, safe: { ...e.data.task.safe, madeFor } } } : e.data.app?.safe ? { app: { ...e.data.app, safe: { ...e.data.app.safe, madeFor } } } : {}) } })
      d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map(set) } : m))
      d.taskServices = d.taskServices.map((x) => (x.key === params.key ? { ...x, calls: x.calls.map((c) => (c.endpoint ? { ...c, endpoint: set(c.endpoint) } : c)) } : x))
      d.fixtureUsed = b.fixture
      return reply({ madeFor, changed: b.count })
    }),
    // Which version a person's own runs get of one endpoint: the app's answer, or a task's own.
    // The saved real response of an endpoint, faked at a press. (sample) One named "refused" is, as a fake that still carries something real would be.
    http.post('/api/apps/:id/mocks/:key/endpoints/:endpoint/fake', ({ params }) => {
      if (params.endpoint === 'refused') return HttpResponse.json({ error: 'refused: the fake still carries 2 values of the real response. Change the plan (a column in keep that holds someone\'s), or name a column in text to replace it whole:\n  results.csv: "Sample Person (sample)" in person_summary' }, { status: 400 })
      const set = (e: import('../engine').MockEndpoint) => { const it = e.data.task?.recorded ? 'task' : 'app'; const was = e.data[it]; return e.key !== params.endpoint || !was?.recorded ? e : { ...e, data: { ...e.data, [it]: { ...was, safe: { kind: 'faked' as const, set: `faked-${e.key}`, files: was.recorded.files, note: 'Faked from the real response (sample).', columns: [] } } } } }
      d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map(set) } : m))
      d.taskServices = d.taskServices.map((x) => (x.key === params.key ? { ...x, calls: x.calls.map((c) => (c.endpoint ? { ...c, endpoint: set(c.endpoint) } : c)) } : x))
      return reply({ data: d.mocks.find((m) => m.key === params.key)?.endpoints.find((e) => e.key === params.endpoint)?.data ?? null, replaced: 41, kept: 12 })
    }),
    http.put('/api/apps/:id/mocks/:key/endpoints/:endpoint/faked', async ({ params, request }) => {
      const b = await request.json() as { faked: boolean | null; issueId?: string | null }
      const set = (e: import('../engine').MockEndpoint) => { if (e.key !== params.endpoint) return e; const was = e.data.faked ?? { app: true, task: null }; return { ...e, data: { ...e.data, faked: b.issueId ? { ...was, task: b.faked } : { ...was, app: b.faked ?? true } } } }
      d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map(set) } : m))
      d.taskServices = d.taskServices.map((x) => (x.key === params.key ? { ...x, calls: x.calls.map((c) => (c.endpoint ? { ...c, endpoint: set(c.endpoint) } : c)) } : x))
      return reply(d.mocks.find((m) => m.key === params.key)?.endpoints.find((e) => e.key === params.endpoint)?.data ?? null)
    }),
    http.delete('/api/apps/:id/mocks/:key/endpoints/:endpoint/data', ({ params, request }) => {
      const task = !!new URL(request.url).searchParams.get('issue')
      const drop = (e: import('../engine').MockEndpoint) => (e.key === params.endpoint ? { ...e, data: task ? { ...e.data, task: null } : { ...e.data, app: null } } : e)
      if (!task) d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map(drop) } : m))
      d.taskServices = d.taskServices.map((x) => (x.key === params.key ? { ...x, calls: x.calls.map((c) => (c.endpoint ? { ...c, endpoint: drop(c.endpoint) } : c)) } : x))
      return reply({ removed: true, real: 0 })
    }),
    http.patch('/api/apps/:id/mocks/:key/endpoints/:endpoint', async ({ params, request }) => { const b = await request.json() as { what?: string }; d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.map((e) => (e.key === params.endpoint ? { ...e, ...b } : e)) } : m)); return reply(d.mocks.find((m) => m.key === params.key)) }),
    http.delete('/api/apps/:id/mocks/:key/endpoints/:endpoint', ({ params }) => { d.mocks = d.mocks.map((m) => (m.key === params.key ? { ...m, endpoints: m.endpoints.filter((e) => e.key !== params.endpoint) } : m)); return reply(d.mocks.find((m) => m.key === params.key)) }),
    http.patch('/api/apps/:id/mocks/:key/data/:data', () => reply(d.mocks[0].data)),
    http.delete('/api/apps/:id/mocks/:key', ({ params }) => { d.mocks = d.mocks.filter((m) => m.key !== params.key); return reply({ removed: true, files: 2 }) }),
    http.get('/api/issues/:id/services', () => reply(d.taskServices)),
    http.post('/api/issues/:id/services', async ({ request }) => { const b = await request.json() as { service: string }; const m = d.mocks.find((x) => x.key === b.service || x.name === b.service); if (!m) return HttpResponse.json({ error: `"${b.service}" is not one of this app's services` }, { status: 400 }); if (!d.taskServices.some((x) => x.key === m.key)) d.taskServices = [...d.taskServices, { key: m.key, name: m.name, standsInFor: m.standsInFor, status: m.status, foundFor: null, calls: [] }]; return reply(d.taskServices) }),
    http.delete('/api/issues/:id/services/:service', ({ params }) => { d.taskServices = d.taskServices.filter((x) => x.key !== params.service); return reply(d.taskServices) }),
    http.get('/api/issues/:id/calls', () => reply(d.taskServices.flatMap((x) => x.calls))),
    http.post('/api/issues/:id/calls', async ({ request }) => { const b = await request.json() as { service: string; method: string; path: string; what?: string }; const sv = d.taskServices.find((x) => x.key === b.service); const c: import('../engine').TaskCall = { id: `tcall_new${Date.now()}`, service: b.service, serviceName: sv?.name ?? b.service, method: b.method, path: b.path, what: b.what ?? '', by: 'user', state: 'answered', mock: sv ? { key: sv.key, name: sv.name, status: sv.status } : null, endpoint: { ...(d.mocks.find((m) => m.key === b.service)?.endpoints.find((e) => e.method === b.method && e.path === b.path) ?? { key: 'new', method: b.method, path: b.path, what: b.what, real: null, files: [], data: { app: null, task: null } }) }, linked: false }; d.taskServices = d.taskServices.map((x) => (x.key === b.service ? { ...x, calls: [...x.calls, c] } : x)); return reply(d.taskServices.flatMap((x) => x.calls)) }),
    http.delete('/api/issues/:id/calls', () => { d.taskServices = d.taskServices.map((x) => ({ ...x, calls: [] })); return reply([]) }),
    http.patch('/api/issues/:id/calls/:call', async ({ params, request }) => { const b = await request.json() as Partial<import('../engine').TaskCall>; d.taskServices = d.taskServices.map((x) => ({ ...x, calls: x.calls.map((c) => (c.id === params.call ? { ...c, ...b, service: c.service } : c)) })); return reply(d.taskServices.flatMap((x) => x.calls)) }),
    http.put('/api/issues/:id/calls/:call/endpoint', () => reply(d.taskServices.flatMap((x) => x.calls))),
    http.post('/api/issues/:id/calls/:call/cover', () => reply({ calls: d.taskServices.flatMap((x) => x.calls), mock: d.mocks[0] })),
    http.get('/api/apps/:id/mock-places', ({ request }) => reply(new URL(request.url).searchParams.get('issue') ? d.mockPlacesForTask : d.mockPlaces)),
    http.get('/api/apps/:id/mocks/:key/history', () => reply(d.mockChanges)),
    // What a place is given, changed: the real service, the mock, or (a task) back to the app's.
    http.put('/api/apps/:id/mocks/:key/places/:place', async ({ params, request }) => {
      const b = await request.json() as { source: import('../engine').MockSource; issueId?: string | null }
      const place = params.place as import('../engine').MockPlace, task = !!b.issueId
      const change = (r: import('../engine').MockPlacesRow): import('../engine').MockPlacesRow => {
        if (r.mock !== params.key) return r
        const was = r.places[place], mine = b.source === 'default' ? null : { source: b.source }
        const choice = mine ?? (task ? was.app : null) ?? { source: 'default' as const }
        const live = choice.source === 'live', recorded = false
        return { ...r, places: { ...r.places, [place]: { ...was, ...(task ? { own: mine } : { app: mine }), choice, from: mine ? (task ? 'task' : 'app') : task && was.app ? 'app' : 'none', how: live ? 'live' : 'data', form: live ? undefined : recorded ? 'recorded' : 'faked', real: recorded,
          says: live ? `The real ${r.name}, every run; what it sends is kept` : recorded ? 'The mock, with recorded responses as they are (1 of its 4 calls): this computer only' : 'The mock, with faked data' } } }
      }
      if (task) d.mockPlacesForTask = d.mockPlacesForTask.map(change); else d.mockPlaces = d.mockPlaces.map(change)
      return reply((task ? d.mockPlacesForTask : d.mockPlaces).find((r) => r.mock === params.key)!.places[place])
    }),
    http.post('/api/apps/:id/mocks/:key/data', () => reply(d.mocks[0].data[1])),
    http.post('/api/apps/:id/mocks/:key/recording', () => reply({ files: ['response.json'], asked: 'iss_sample2' })),
    http.get('/api/apps/:id/screens', ({ request }) => { const { all, ...rest } = d.screens; return reply(new URL(request.url).searchParams.get('all') === '1' && all ? { ...rest, screens: all } : rest) }),
    http.get('/api/sketches/:scope', ({ request }) => { const { all, ...rest } = d.sketches; return reply(new URL(request.url).searchParams.get('all') === '1' && all ? { ...rest, sketches: all } : rest) }),
    http.get('/api/sketches/:scope/file/*', ({ request }) => HttpResponse.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;margin:0;padding:24px;background:#fbfaf7;color:#222"><p style="font:12px ui-monospace,monospace;color:#888;margin:0 0 16px">sample sketch · ${new URL(request.url).pathname.split('/file/')[1]} · made-up data</p><h1 style="font-size:22px;margin:0 0 12px">Sample Shop</h1><div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fff">A plain HTML screen, written fast, to react to.</div><button style="margin-top:16px;padding:10px 16px;border-radius:10px;border:0;background:#222;color:#fff">Continue</button></body>`)),
    http.get('/api/apps/:id/prototypes', () => reply(d.prototypes)),
    http.get('/api/shares/:kind/:id', ({ params }) => reply({ share: d.shares?.[`${params.kind}:${params.id}`] ?? null })),
    http.get('/__self-evident/guide.json', () => reply(d.visitorGuide ?? { title: 'Sample: one-tap checkout', guide: null })),
    http.post('/__self-evident/feedback', () => reply({ ok: true })),
    http.post('/api/shares/:kind/:id', async ({ params, request }) => {
      if (d.shareError) return HttpResponse.json({ error: d.shareError }, { status: 400 })
      const asked = await request.json().catch(() => ({})) as { freeNgrok?: boolean }
      if (d.ngrokHolders && !asked.freeNgrok) return HttpResponse.json({ error: 'This network does not let the Cloudflare tunnel connect. Tried ngrok instead: ngrok\'s address is already in use: another ngrok tunnel is running on this account, and a free account has one address.', code: 'ngrok_busy', holders: d.ngrokHolders }, { status: 409 })
      const made = { kind: params.kind as import('../engine').ShareKind, id: params.id as string, ...(d.ngrokHolders ? { via: 'ngrok' as const } : {}), url: d.ngrokHolders ? 'https://sample-made-up.ngrok-free.dev' : 'https://sample-made-up-words.trycloudflare.com', since: '2026-10-28T10:02:00Z', expiresAt: '2026-10-28T18:02:00Z', by: 'user' }
      d.shares = { ...d.shares, [`${params.kind}:${params.id}`]: made }
      return reply({ share: made })
    }),
    http.delete('/api/shares/:kind/:id', ({ params }) => { const { [`${params.kind}:${params.id}`]: _gone, ...rest } = d.shares ?? {}; d.shares = rest; return reply({ stopped: true }) }),
    http.get('/api/prototypes/:id/code', () => reply(d.prototypeCode)),
    http.get('/api/prototypes/:id/file', ({ request }) => { const f = s.prototypeFiles[new URL(request.url).searchParams.get('path') ?? '']; return f ? reply(f) : missing('file') }),
    http.delete('/api/prototypes/:id/shown/:shownId', ({ params }) => { d.prototypeCode = { ...d.prototypeCode, shown: d.prototypeCode.shown.filter((x) => x.id !== params.shownId) }; return reply({ shown: d.prototypeCode.shown }) }),
    http.get('/api/prototypes/:id/runs', () => reply(d.prototypeRuns ?? [])),
    http.post('/api/prototypes/:id/guide/:step/run', ({ params }) => { const run = { step: Number(params.step), command: '(sample)', status: 'running' as const, exitCode: null, startedAt: '2026-11-15T10:00:00Z', endedAt: null, lines: ['started (sample)'] }; d.prototypeRuns = [...(d.prototypeRuns ?? []).filter((r) => r.step !== run.step), run]; return reply(run) }),
    http.post('/api/prototypes/:id/guide/:step/stop', ({ params }) => { d.prototypeRuns = (d.prototypeRuns ?? []).map((r) => r.step === Number(params.step) ? { ...r, status: 'stopped' as const } : r); return reply({}) }),
    // mainDies: the one just turned on has stopped by itself by the time it is asked about again, with these last lines.
    http.get('/api/apps/:id/main', () => { if (d.mainDies && d.main?.running) d.main = { ...d.main, running: false, up: false, url: null, exited: { at: '2026-11-20T17:00:00Z', code: 1, log: d.mainDies } }; return reply(d.main ?? MAIN_OFF) }),
    http.post('/api/apps/:id/main/start', ({ request }) => { const asked = new URL(request.url).searchParams.get('for') ?? ''; const how = new URL(request.url).searchParams.get('data'); if (d.mainFor !== undefined && asked !== d.mainFor) return new Response(JSON.stringify({ error: `asked for the main of "${asked}", not "${d.mainFor}" (sample)` }), { status: 400, headers: { 'content-type': 'application/json' } }); if (d.mainError) return new Response(JSON.stringify({ error: d.mainError }), { status: 400, headers: { 'content-type': 'application/json' } }); const was = d.main ?? MAIN_OFF; if (was.running && !was.up) return reply(was); /* still coming up: asked for again, it is as it is */ d.main = was.how === 'local' ? { ...was, data: how === 'copy' || how === 'shared' ? { mode: how, beside: 'this one (sample)' } : was.data ?? null, running: true, up: true, url: d.mainUrl ?? window.location.origin, sha: was.tip, behind: false, stopsAt: '2026-11-19T18:30:00Z' } : was; return reply(d.main) }),
    http.post('/api/apps/:id/main/stop', () => { d.main = { ...(d.main ?? MAIN_OFF), running: false, up: false, url: null, sha: null, behind: false, stopsAt: null }; return reply(d.main) }),
    http.get('/api/prototypes/:id', ({ params }) => { const p = d.prototypes.find((x) => x.id === params.id); return p ? reply({ log: [], ...p, up: p.up ?? p.status === 'running' }) : missing('prototype') }),
    // Reports: the engine's rules, roughly. Writing one here answers at once.
    http.get('/api/apps/:id/learning', () => reply(d.learning ?? { docs: [], missing: ['What it is', 'The parts', 'Running and testing it', 'What is fragile'], working: null, sessionId: null, stale: 0 })),
    http.post('/api/apps/:id/learn', () => { const now = d.learning ?? { docs: [], missing: [], working: null, sessionId: null, stale: 0 }; d.learning = { ...now, working: { sessionId: 'talk_sample_learn' }, sessionId: 'talk_sample_learn' }; return reply({ sessionId: 'talk_sample_learn', started: true }) }),
    http.get('/api/apps/:id/docs', () => reply(d.appDocs ?? [])),
    http.post('/api/apps/:id/docs', async ({ request }) => { if (d.appDocError) return HttpResponse.json({ error: d.appDocError }, { status: 400 }); const b = await request.json() as { title: string; body: string }; const page = { id: `adoc_sample_${(d.appDocs ?? []).length + 1}`, title: b.title, body: b.body, by: 'user', createdAt: '2026-11-24T10:00:00Z', updatedAt: '2026-11-24T10:00:00Z' }; d.appDocs = [...(d.appDocs ?? []), page]; return reply(page) }),
    http.patch('/api/app-docs/:id', async ({ params, request }) => { const b = await request.json() as { title?: string; body?: string }; const old = (d.appDocs ?? []).find((x) => x.id === params.id); if (!old) return missing('page'); const page = { ...old, ...b, by: 'user', updatedAt: '2026-11-24T11:00:00Z' }; d.appDocs = (d.appDocs ?? []).map((x) => x.id === old.id ? page : x); return reply(page) }),
    http.delete('/api/app-docs/:id', ({ params }) => { d.appDocs = (d.appDocs ?? []).filter((x) => x.id !== params.id); return reply({ removed: params.id }) }),
    // Context: one view per kind of thing; every change answers with the view as it now is.
    ...(['ideas', 'issues', 'projects'] as const).flatMap((kind) => {
      const all: Record<typeof kind, import('../engine').ContextView> = { ideas: s.ideaContext, issues: s.taskContext, projects: s.projectContext, ...d.context }
      let v = structuredClone(all[kind])
      const at = `/api/${kind}/:id/context`
      const doc = (o: Partial<import('../engine').ContextDoc>): import('../engine').ContextDoc => ({ id: `cdoc_new${v.docs.length}`, title: '', description: null, from: 'pasted', ticket: null, fileName: null, body: null, chars: 0, inFull: false, addedBy: 'user', addedAt: new Date().toISOString(), fromProject: false, ...o })
      return [
        http.get(at, () => reply(v)),
        http.get(`${at}/count`, () => reply({ count: v.docs.length + v.notes.filter((n) => n.status === 'settled').length, proposed: v.notes.filter((n) => ['proposed', 'open'].includes(n.status) && !n.waitingOn).length, waiting: v.notes.filter((n) => ['proposed', 'open'].includes(n.status) && !!n.waitingOn).length })),
        http.post(`${at}/docs`, async ({ request }) => { const b = await request.json() as { title: string; description?: string; body: string; inFull?: boolean }; v = { ...v, docs: [...v.docs, doc({ title: b.title, description: b.description || null, body: b.body, chars: b.body.length, inFull: !!b.inFull })] }; return reply(v) }),
        http.post(`${at}/tickets`, async ({ request }) => { const b = await request.json() as { ref: string }; if (d.contextProblem) return HttpResponse.json({ error: d.contextProblem }, { status: 400 }); v = { ...v, docs: [...v.docs, doc({ id: `origin_new${v.docs.length}`, title: `A ticket brought in (sample)`, from: 'ticket', chars: 60, ticket: { originating: false, origin: { ...s.sampleOrigin, id: 'origin_new', ref: b.ref.toUpperCase(), title: 'A ticket brought in (sample)', body: 'Made up: what the ticket says.', comments: [], links: [], files: [] } } })] }; return reply(v) }),
        http.post(`${at}/files`, async ({ request }) => { const f = (await request.formData()).get('file') as File; const pdf = /\.(pdf|html?)$/.test(f.name); v = { ...v, docs: [...v.docs, doc({ title: f.name.replace(/\.\w+$/, ''), from: 'file', fileName: f.name, body: pdf ? null : 'Made up: the text read out of the file.', kept: pdf, chars: pdf ? 0 : f.size })] }; return reply(v) }),
        http.patch(`${at}/docs/:doc`, async ({ params, request }) => { const b = await request.json() as Partial<import('../engine').ContextDoc>; v = { ...v, docs: v.docs.map((x) => (x.id === params.doc ? { ...x, ...b, chars: b.body !== undefined && b.body !== null ? b.body.length : x.chars } : x)) }; return reply(v) }),
        http.post(`${at}/docs/:doc/refresh`, ({ params }) => { v = { ...v, docs: v.docs.map((x) => (x.id === params.doc && x.ticket ? { ...x, ticket: { ...x.ticket, origin: { ...x.ticket.origin, fetchedAt: '2026-11-24T16:00:00Z', comments: [...x.ticket.origin.comments, { author: 'Made-up Teammate', at: '2026-11-24T15:00:00Z', body: 'Added since it was last read (sample).' }] } } } : x)) }; return reply(v) }),
        http.delete(`${at}/docs/:doc`, ({ params }) => { v = { ...v, docs: v.docs.filter((x) => x.id !== params.doc) }; return reply(v) }),
        http.post(`${at}/notes`, async ({ request }) => { const b = await request.json() as { kind: 'note' | 'decision'; title: string; answer?: string; body: string; background?: string; options?: string; on?: string }; v = { ...v, notes: [...v.notes, { background: b.background || null, options: b.options || null, id: `note_new${v.notes.length}`, kind: b.kind, status: b.kind === 'decision' && !b.answer ? 'open' : 'settled', answer: b.answer || null, title: b.title, body: b.body, on: b.on ?? '2026-11-24', addedBy: 'user', fromProject: false, alsoAbout: [] }] }; return reply(v) }),
        http.patch(`${at}/notes/:note`, async ({ params, request }) => { const b = await request.json() as Partial<import('../engine').ContextNote>; v = { ...v, notes: v.notes.map((x) => (x.id === params.note ? { ...x, ...b, waitingOn: ['open', 'proposed'].includes(b.status ?? x.status) ? (b.waitingOn === undefined ? x.waitingOn : b.waitingOn || null) : null } : x)) }; return reply(v) }),
        http.delete(`${at}/notes/:note`, ({ params }) => { v = { ...v, notes: v.notes.filter((x) => x.id !== params.note) }; return reply(v) }),
      ]
    }),
    // Notes: the app's, or (?issue=) the ones about one task.
    http.get('/api/apps/:id/notes', ({ request }) => { const i = new URL(request.url).searchParams.get('issue'); return reply(d.notes.filter((n) => !i || n.tasks.some((t) => t.id === i))) }),
    http.post('/api/apps/:id/notes', async ({ request }) => { const b = await request.json() as { on: string; kind: 'note' | 'decision'; title: string; body: string; issueIds: string[] }; const n = { id: `note_new${d.notes.length}`, on: b.on, kind: b.kind, title: b.title, body: b.body, tasks: b.issueIds.map((id) => ({ id, name: id === 'iss_sample2' ? 'SS-2' : 'SS-5', title: 'A task (sample)' })), createdBy: 'user', updatedAt: null }; d.notes = [n, ...d.notes]; return reply(n) }),
    http.patch('/api/apps/:id/notes/:note', async ({ params, request }) => { const b = await request.json() as Partial<{ on: string; kind: 'note' | 'decision'; title: string; body: string }>; d.notes = d.notes.map((n) => (n.id === params.note ? { ...n, ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'issueIds')) } : n)); return reply(d.notes.find((n) => n.id === params.note) ?? null) }),
    http.delete('/api/apps/:id/notes/:note', ({ params }) => { d.notes = d.notes.filter((n) => n.id !== params.note); return reply({ removed: String(params.note) }) }),
    http.get('/api/apps/:id/reports', () => reply(d.reports ?? { writing: false, format: { daily: '', weekly: '' }, reports: [] })),
    http.post('/api/apps/:id/reports', async ({ params, request }) => {
      const b = await request.json() as { period: string; notes?: string }
      const t = d.reports ?? { writing: false, format: { daily: '', weekly: '' }, reports: [] }
      const weekly = b.period.endsWith('week')
      const made = { id: `rep_${t.reports.length + 1}`, appId: params.id as string, kind: weekly ? 'weekly' as const : 'daily' as const, fromAt: new Date().toISOString(), toAt: new Date().toISOString(), label: ({ today: 'Today, Nov 13', yesterday: 'Yesterday, Nov 12', this_week: 'Week of Nov 9', last_week: 'Week of Nov 2' } as Record<string, string>)[b.period], notes: b.notes ?? null, editedAt: null, createdAt: new Date().toISOString(), costUsd: '0.02',
        body: `${weekly ? 'Where it stands' : 'Today:'}\n- Written just now (sample)${b.notes ? `\n- ${b.notes}` : ''}` }
      d.reports = { ...t, reports: [made, ...t.reports] }
      return HttpResponse.json({ writing: true }, { status: 202 })
    }),
    http.put('/api/apps/:id/report-format', async ({ request }) => { const f = await request.json() as { daily?: string; weekly?: string }; const t = d.reports ?? { writing: false, format: { daily: '', weekly: '' }, reports: [] }; d.reports = { ...t, format: { ...t.format, ...f } }; return reply(d.reports.format) }),
    http.put('/api/reports/:id', async ({ params, request }) => { const { body } = await request.json() as { body: string }; const t = d.reports!; d.reports = { ...t, reports: t.reports.map((r) => (r.id === params.id ? { ...r, body, editedAt: new Date().toISOString() } : r)) }; return reply(d.reports.reports.find((r) => r.id === params.id)) }),
    http.delete('/api/reports/:id', ({ params }) => { const t = d.reports!; d.reports = { ...t, reports: t.reports.filter((r) => r.id !== params.id) }; return reply({ deleted: params.id }) }),
    http.get('/api/apps/:id/summary', () => reply(d.summary)),
    http.get('/api/apps/:id/graph', () => reply(appGraph())),
    http.get('/api/now', () => reply(d.now)),
    http.get('/api/ideas', () => reply(d.ideas)),
    http.get('/api/ideas/:id', ({ params }) => { const i = d.ideas.find((x) => x.id === params.id); return i ? reply(i) : missing('idea') }),
    http.get('/api/projects', () => reply(d.projects)),
    http.get('/api/projects/:id/graph', ({ params }) => { const g = d.graphs[params.id as string]; return g ? reply(g) : missing('project') }),
    http.post('/api/issues/:id/close', ({ params }) => { const t = d.issueDetails[params.id as string]; if (!t) return missing('task'); d.issueDetails = { ...d.issueDetails, [t.id]: { ...t, state: 'done', close: undefined } }; return reply({ id: t.id, state: 'done', projectClosed: false }) }),
    http.get('/api/issues', ({ request }) => {
      const q = new URL(request.url).searchParams
      if (q.get('view') === 'code') return reply(d.issueRows)
      const all = Object.values(d.issueDetails)
      return reply(all.filter((i) => (!q.get('kind') || i.kind === q.get('kind')) && (!q.get('project') || i.projectId === q.get('project')) && (!q.get('top') || !i.parentId)))
    }),
    // Task branches and save points: the engine's rules, roughly.
    http.get('/api/issues/:id/smoke', () => reply(d.smoke ?? { where: 'local', says: 'run here, like its prototypes', account: null, flag: null, branch: null, head: null, running: null, url: null, up: false, canRun: false, log: [], checks: [], owed: 0, failed: 0 })),
    http.post('/api/issues/:id/smoke/terminal', async ({ request }) => {
      const b = await request.json().catch(() => ({})) as { scratch?: boolean }
      if (b.scratch) { if (d.smoke) d.smoke = { ...d.smoke, scratch: { open: true } }; return reply({ setup: 'main@temp', cwd: '/tmp/smoke-ss-20-scratch-sample', folder: 'temp', fresh: true }) }
      if (d.smoke) d.smoke = { ...d.smoke, terminal: { folder: d.smoke.terminal?.folder ?? 'build', open: true }, ...(d.smoke.where === 'terminal' ? { up: true } : {}) }
      return reply({ setup: 'main', cwd: d.smoke?.terminal?.folder === 'temp' ? '/tmp/smoke-ss-20-sample' : '/sample/shop-worktrees/smoke--ss-20', folder: d.smoke?.terminal?.folder ?? 'build', fresh: true })
    }),
    http.get('/api/issues/:id/smoke/terminal/stream', () => new HttpResponse(new ReadableStream({ start(c) { shell = c; say('$ npm i ./bonkei-0.0.0.tgz (sample)\r\nadded 1 package (sample)\r\n$ ') } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })),
    http.post('/api/issues/:id/smoke/terminal/input', async ({ request }) => { const b = await request.json() as { data: string }; say(b.data.replace(/\r/g, '\r\n(sample output)\r\n$ ')); return reply({ ok: true }) }),
    http.post('/api/issues/:id/smoke/terminal/resize', () => reply({ ok: true })),
    http.post('/api/issues/:id/smoke/terminal/close', async ({ request }) => { const b = await request.json().catch(() => ({})) as { scratch?: boolean }; if (b.scratch) { if (d.smoke) d.smoke = { ...d.smoke, scratch: { open: false } }; return reply(d.smoke) } if (d.smoke) d.smoke = { ...d.smoke, terminal: { folder: d.smoke.terminal?.folder ?? 'build', open: false }, ...(d.smoke.where === 'terminal' ? { up: false } : {}) }; return reply(d.smoke) }),
    http.post('/api/issues/:id/smoke/start', async ({ request }) => {
      const b = await request.json().catch(() => ({})) as { clean?: boolean; setup?: string; fixture?: string; empty?: boolean }
      if (b.empty) b.fixture = undefined
      if (d.smoke && b.fixture) d.smoke = { ...d.smoke, ...(d.smoke.setups ? { setups: d.smoke.setups.map((x) => (x.data ? { ...x, data: { builtFrom: b.fixture!, ran: true } } : x)) } : {}), ...((d.smoke as { data?: unknown }).data ? { data: { builtFrom: b.fixture, ran: true } } : {}) }
      if (d.smoke && b.setup && d.smoke.setups) d.smoke = { ...d.smoke, setups: d.smoke.setups.map((x, n) => (x.key === b.setup ? { ...x, url: `http://localhost:${6500 + n}`, up: true, running: d.smoke!.head } : x)) }
      else if (d.smoke) d.smoke = { ...d.smoke, url: 'http://localhost:6500', up: true, running: d.smoke.head, log: b.clean ? ['started clean (sample)'] : d.smoke.log }
      return reply(d.smoke)
    }),
    // (sample) Its database kept as a fixture: said back, and listed among the app's.
    http.post('/api/issues/:id/smoke/keep', async ({ request }) => { const b = await request.json() as { name: string; real?: boolean }; d.fixtures = [...d.fixtures.filter((f) => f.name !== b.name), { name: b.name, real: !!b.real, bytes: 2_400, tables: [{ name: 'employees', rows: 1, columns: ['id', 'first_name'] }] }]; return reply({ fixture: b.name, real: !!b.real, saved: { employees: 1 } }) }),
    http.post('/api/issues/:id/smoke/files/reveal', () => reply({ opened: '/sample/smoke/test-files' })),
    http.post('/api/issues/:id/smoke/stop', async ({ request }) => {
      const b = await request.json().catch(() => ({})) as { setup?: string }
      if (d.smoke && b.setup && d.smoke.setups) d.smoke = { ...d.smoke, setups: d.smoke.setups.map((x) => (x.key === b.setup ? { ...x, url: null, up: false, running: null } : x)) }
      else if (d.smoke) d.smoke = { ...d.smoke, url: null, up: false, running: null }
      return reply(d.smoke)
    }),
    http.post('/api/issues/:id/smoke/accept', () => { if (d.smoke) d.smoke = { ...d.smoke, accepted: { by: 'user', at: '2026-11-23T12:00:00.000Z', sha: d.smoke.head } }; return reply(d.smoke) }),
    http.post('/api/issues/:id/release/:criterion', async ({ params, request }) => {
      const b = await request.json() as { done: boolean; note?: string }
      if (!b.done && !b.note?.trim()) return HttpResponse.json({ error: 'say what stands in the way: a release check that is not done is usually why production is wrong' }, { status: 400 })
      const v = d.prView ?? s.prSample
      const release = (v.release ?? []).map((r) => (r.id === params.criterion ? { ...r, done: b.done, note: b.note ?? '', by: 'user', at: '2026-11-23T12:00:00.000Z' } : r))
      d.prView = { ...v, release }
      return reply({ release })
    }),
    http.post('/api/issues/:id/smoke/:criterion/try', ({ params }) => { // the agent says at once here; the real one takes a few minutes
      if (d.smoke) d.smoke = { ...d.smoke, checks: d.smoke.checks.map((c) => (c.id === params.criterion ? { ...c, tried: { verdict: 'holds' as const, note: 'Opened it headless: the edge dips under the lip (sample)', sha: d.smoke!.head, at: '2026-11-18T12:00:00.000Z' } } : c)) }
      return reply(d.smoke)
    }),
    http.post('/api/issues/:id/smoke/:criterion', async ({ params, request }) => {
      const b = await request.json() as { pass?: boolean; note?: string; skip?: boolean }
      const checks = (d.smoke?.checks ?? []).map((c) => (c.id === params.criterion ? { ...c, mark: b.skip ? 'skip' as const : b.pass ? 'pass' as const : 'fail' as const, note: b.skip ? `Skipped, not tried${b.note ? `: ${b.note}` : '.'}` : b.note ?? '' } : c))
      const owed = checks.filter((c) => c.mark === 'todo').length, failed = checks.filter((c) => c.mark === 'fail').length
      d.smoke = { ...d.smoke!, checks, owed, failed }
      return reply({ ...d.smoke, sentBack: owed === 0 ? failed : 0 })
    }),
    http.get('/api/issues/:id/checklist', () => reply(d.checklist ?? null)),
    http.get('/api/issues/:id/trajectory', () => reply(d.trajectory ?? { plan: null, approved: false, changed: false, rows: [], holds: false, proven: 0, total: 0, canRun: true, stray: [] })),
    // The pull request step: the engine's rules, roughly. Submitting opens a draft; marking it ready opens it.
    http.get('/api/issues/:id/pr', () => reply(d.prView ?? s.prSample)),
    http.get('/api/issues/:id/data-agent', () => reply(d.dataAgent ?? s.dataAgentSample)),
    http.post('/api/issues/:id/data-agent', async ({ request }) => { const b = await request.json() as { message?: string }; if (!b.message?.trim()) return HttpResponse.json({ error: 'say what the task needs of its data' }, { status: 400 }); d.dataAgent = { ...s.dataAgentWorkingSample, asked: { text: b.message, by: 'you', at: '2026-11-23T15:00:00.000Z' } }; return reply(d.dataAgent) }),
    http.post('/api/issues/:id/data-agent/approve', () => { const v = d.dataAgent ?? s.dataAgentSample; if (v.state !== 'proposed' || !v.proposal) return HttpResponse.json({ error: 'the data agent has nothing waiting to be approved' }, { status: 400 }); d.dataAgent = v.step === 3 ? { ...v, state: 'done', approved: [...v.approved, v.proposal], proposal: null } : { ...v, state: 'working', step: (v.step + 1) as 2 | 3, approved: [...v.approved, v.proposal], proposal: null, busy: true }; return reply(d.dataAgent) }),
    http.post('/api/issues/:id/data-agent/change', async ({ request }) => { const b = await request.json() as { text?: string }; const v = d.dataAgent ?? s.dataAgentSample; if (!b.text?.trim()) return HttpResponse.json({ error: 'say what to change' }, { status: 400 }); d.dataAgent = { ...v, state: 'working', proposal: null, change: b.text, busy: true }; return reply(d.dataAgent) }),
    // The finalizing: the engine's rules, roughly. Running it gives the sample results at once; the press sends them and marks a draft ready.
    http.get('/api/issues/:id/finalize', () => reply(d.finalize ?? s.finalizeNoneSample)),
    http.post('/api/issues/:id/finalize', () => { d.finalize = s.finalizeReadySample; return reply(d.finalize) }),
    http.post('/api/issues/:id/finalize/survivors/:survivor', async ({ params, request }) => { const b = await request.json() as { reason?: string; equivalent?: boolean; undo?: boolean }; const v = d.finalize ?? s.finalizeSample; if (!b.undo && !b.reason?.trim()) return HttpResponse.json({ error: 'say why it is left as it is: the reason goes into the evidence, for the reviewer' }, { status: 400 }); d.finalize = { ...v, mutation: v.mutation && { ...v.mutation, survivors: v.mutation.survivors.map((x) => (x.id === params.survivor ? { ...x, accepted: b.undo ? null : { reason: b.reason!, ...(b.equivalent ? { equivalent: true } : {}), by: 'user' } } : x)) } }; return reply(d.finalize) }),
    http.post('/api/issues/:id/finalize/fix', async ({ request }) => { const b = await request.json() as { kind: string; id: string }; const v = d.finalize ?? s.finalizeSample; const fix = { subTask: 'iss_fix_sample', title: 'Fix what the finalizing found (sample)', landed: false }; d.finalize = { ...v, mutation: v.mutation && { ...v.mutation, survivors: v.mutation.survivors.map((x) => (b.kind === 'survivor' && x.id === b.id ? { ...x, fix } : x)) }, gate: v.gate.map((c) => (b.kind === 'gate' && c.key === b.id ? { ...c, sent: fix } : c)) }; return reply(d.finalize) }),
    http.post('/api/issues/:id/pr/send', () => { const f = d.finalize ?? s.finalizeNoneSample; if (!f.canPush) return HttpResponse.json({ error: `it cannot be sent yet. ${f.pushWaits.join(' ')}` }, { status: 400 }); const v = d.prView ?? s.prSample; const pr = v.pr ?? { number: 412, url: 'https://example.com/pull/412', status: 'draft' as const, title: v.message?.title ?? '', body: v.message?.body ?? '', review: null, mergeable: 'mergeable', checks: [], updatedAt: '2026-11-23T12:00:00Z' }; const body = `${v.message?.body ?? pr.body}\n\n## Evidence\n\n${f.evidence}`; d.prView = { ...v, behind: false, canSubmit: false, canReady: false, editedThere: 'none', pr: { ...pr, status: 'open', body }, message: v.message && { ...v.message, body } }; d.finalize = { ...f, press: 'update', sent: { sha: f.sha, at: '2026-11-23T12:00:00Z', same: true } }; return reply({ number: pr.number, url: pr.url, status: 'open', ready: true, review: null }) }),
    http.get('/api/apps/:id/docs-site', () => reply(d.docsSite ?? s.docsSiteSample)),
    http.post('/api/apps/:id/docs-site/start', () => { if (d.docsSiteError) return HttpResponse.json({ error: d.docsSiteError }, { status: 400 }); d.docsSite = { ...(d.docsSite ?? s.docsSiteSample), startedHere: true }; return reply(d.docsSite) }),
    http.get('/api/apps/:id/workbench', () => reply(d.workbench ?? s.workbenchSample)),
    http.put('/api/apps/:id/workbench', async ({ request }) => {
      const b = await request.json() as { dir?: string | null }
      if (b.dir && /nowhere/.test(b.dir)) return HttpResponse.json({ error: `there is no folder at ${b.dir} on this computer` }, { status: 400 })
      d.workbench = b.dir ? { ...s.workbenchSample, dir: b.dir } : s.workbenchNoneSample
      return reply(d.workbench)
    }),
    http.get('/api/issues/:id/review-copy', () => reply(d.reviewCopy ?? s.reviewCopySample)),
    http.post('/api/issues/:id/review-copy', async ({ request }) => {
      if (d.reviewCopyError) return HttpResponse.json({ error: d.reviewCopyError }, { status: 400 })
      const b = await request.json() as { fixture?: string | null; try?: string }; const v = d.reviewCopy ?? s.reviewCopySample
      d.reviewCopy = { ...v, byHand: false, made: { ...s.reviewCopyMadeSample.made!, from: v.pr?.head ?? '', fixture: b.fixture ?? null, try: b.try ?? '', pushed: true, inStep: true } }
      return reply(d.reviewCopy)
    }),
    http.put('/api/issues/:id/pr/message', async ({ request }) => { const b = await request.json() as { body?: string }; const v = d.prView ?? s.prSample; const written = b.body?.trim() || null; d.prView = { ...v, written, message: v.message && { ...v.message, body: written ? `${written}\n\n<details><summary>How this was built (sample)</summary>\n\nOur record (sample)\n\n</details>` : v.message.body } }; return reply({ written }) }),
    http.post('/api/issues/:id/pr/update', () => { const v = d.prView ?? s.prSample; if (!v.pr || v.pr.status === 'closed' || v.pr.status === 'merged') return HttpResponse.json({ error: 'there is no pull request to update yet: submit it first' }, { status: 400 }); d.prView = { ...v, behind: false, editedThere: 'none', pr: { ...v.pr, title: v.message?.title ?? v.pr.title, body: v.message?.body ?? v.pr.body } }; return reply({ number: v.pr.number, url: v.pr.url, status: v.pr.status }) }),
    http.post('/api/issues/:id/pr/ready', () => { const v = d.prView ?? s.prSample; if (!v.pr) return HttpResponse.json({ error: 'there is no pull request to mark ready: submit it first' }, { status: 400 }); d.prView = { ...v, canReady: false, pr: { ...v.pr, status: 'open' } }; return reply({ number: v.pr.number, url: v.pr.url, status: 'open' }) }),
    http.post('/api/issues/:id/pr/submit', () => (d.submitPrError ? HttpResponse.json({ error: d.submitPrError }, { status: 400 }) : (() => { const v = d.prView ?? s.prSample; d.prView = { ...v, canSubmit: false, canReady: true, pr: { number: 412, url: 'https://example.com/pull/412', status: 'draft', title: v.message?.title ?? '', body: v.message?.body ?? '', review: null, mergeable: null, checks: [], updatedAt: null } } })() ?? reply({ id: 'pr_sample', number: 412, url: 'https://example.com/pull/412', status: 'draft' }))),
    // Kept keys: the engine's rules, roughly. The key is taken and never given back.
    http.put('/api/secrets/:name', async ({ params, request }) => { const b = await request.json() as { value?: string; appId?: string }; if (!b.value?.trim()) return HttpResponse.json({ error: 'paste the key; to take one away, remove it' }, { status: 400 }); return reply({ name: params.name, set: true, from: b.appId ? 'app' : 'shared', last4: b.value.trim().slice(-4) }) }),
    http.delete('/api/secrets/:name', ({ params }) => reply({ name: params.name, set: false, from: null, last4: null })),
    http.get('/api/issues/:id/merge-guide', () => reply({ guide: d.mergeGuide ?? '', record: d.mergeRecord ?? '', subTasks: 3 })),
    http.get('/api/issues/:id/branches', ({ params }) => reply(d.taskBranches ?? { issueId: params.id as string, worktrees: [], branches: [], saves: [] })),
    http.post('/api/issues/:id/save-points', async ({ params, request }) => {
      const { name } = await request.json() as { name: string }
      const t = d.taskBranches ?? { issueId: params.id as string, worktrees: [], branches: [{ id: 'tb_main', name: 'Main', current: true, fromSave: null, createdAt: new Date().toISOString(), gitBranches: [], work: null }], saves: [] }
      const cur = t.branches.find((b) => b.current)!
      const save = { id: `save_${t.saves.length + 1}`, name: name.trim() || 'Saved just now', auto: null, branchId: cur.id, branchName: cur.name, onCurrent: true, changesSince: 0, createdBy: 'user', createdAt: new Date().toISOString(), gitBranches: [] }
      d.taskBranches = { ...t, saves: [...t.saves, save] }
      return reply({ id: save.id, name: save.name })
    }),
    http.post('/api/save-points/:id/go-back', async ({ params, request }) => {
      if (d.moveError) return HttpResponse.json({ error: d.moveError }, { status: 400 })
      const t = d.taskBranches!; const s = t.saves.find((x) => x.id === params.id)!; const cur = t.branches.find((b) => b.current)!
      const { name } = await request.json() as { name?: string }
      const to = { id: `tb_${t.branches.length + 1}`, name: name?.trim() || `From ${s.name}`, current: true, fromSave: s.name, createdAt: new Date().toISOString(), gitBranches: [], work: null }
      d.taskBranches = { ...t, branches: [...t.branches.map((b) => (b.current ? { ...b, current: false, work: { commits: s.changesSince ?? 0, comments: 0 } } : b)), to], saves: t.saves.map((x) => ({ ...x, onCurrent: false, changesSince: null })) }
      return reply({ now: { id: to.id, name: to.name }, setAside: { id: cur.id, name: cur.name, commits: s.changesSince ?? 0 }, switched: [], leftAlone: [], restarted: 1, problems: [] })
    }),
    http.post('/api/task-branches/:id/switch', ({ params }) => {
      const t = d.taskBranches!; const cur = t.branches.find((b) => b.current)!; const to = t.branches.find((b) => b.id === params.id)!
      d.taskBranches = { ...t, branches: t.branches.map((b) => (b.id === to.id ? { ...b, current: true, work: null } : b.current ? { ...b, current: false, work: { commits: 0, comments: 0 } } : b)), saves: t.saves.map((x) => ({ ...x, onCurrent: x.branchId === to.id, changesSince: x.branchId === to.id ? 0 : null })) }
      return reply({ now: { id: to.id, name: to.name }, setAside: { id: cur.id, name: cur.name, commits: 0 }, switched: [], leftAlone: [], restarted: 0, problems: [] })
    }),
    http.delete('/api/save-points/:id', ({ params }) => { const t = d.taskBranches!; d.taskBranches = { ...t, saves: t.saves.filter((x) => x.id !== params.id) }; return reply({ deleted: params.id }) }),
    http.delete('/api/task-branches/:id', ({ params }) => { const t = d.taskBranches!; d.taskBranches = { ...t, branches: t.branches.filter((b) => b.id !== params.id), saves: t.saves.filter((x) => x.branchId !== params.id) }; return reply({ deleted: params.id }) }),
    http.delete('/api/issues/:id/branches', () => { const t = d.taskBranches!; d.taskBranches = { ...t, branches: t.branches.filter((b) => b.current), saves: [] }; return reply({ taskBranches: 0, savePoints: 0 }) }),
    http.put('/api/issues/:id/acceptance', async ({ params, request }) => { // the engine's rules, roughly: add, change, remove
      const i = d.issueDetails[params.id as string]; if (!i) return missing('issue')
      const c = await request.json() as import('../engine').AcceptanceChange
      let list = (i.acceptance ?? []).filter((x) => !(c.remove ?? []).includes(x.id)).map((x) => { const u = (c.update ?? []).find((y) => y.id === x.id); return u ? { ...x, ...(u.text != null ? { text: u.text } : {}), check: u.check === undefined ? x.check : u.check ?? undefined, ...(u.built !== undefined ? { built: u.built ?? undefined } : {}), ...(u.buildOnly !== undefined ? { buildOnly: u.buildOnly || undefined, why: u.buildOnly ? u.why ?? undefined : undefined } : {}) } : x })
      list = [...list, ...(c.add ?? []).map((a, n) => ({ id: `ac_sample_new${list.length + n}`, text: a.text, check: a.check, by: 'user', at: '2026-10-28T12:00:00Z' }))]
      d.issueDetails = { ...d.issueDetails, [params.id as string]: { ...i, acceptance: list, briefApprovedBy: null, briefApprovedAt: null } }
      return reply({ acceptance: list })
    }),
    http.get('/api/issues/:id', ({ params }) => { const i = d.issueDetails[params.id as string]; return i ? reply(i) : missing('issue') }),
    http.get('/api/todos', () => reply(d.todos)),
    http.get('/api/plan', () => reply(d.plan)),
    http.get('/api/workflows', () => reply(d.workflows)),
    http.post('/api/:kind/:id/workflow', () => reply({ ok: true })),
    http.get('/api/apps/:id/requirements', () => reply([{ key: 'telemetry', name: 'Telemetry', what: 'Anything new can be seen with OpenTelemetry (sample).', on: true }, { key: 'tests', name: 'Tests', what: 'New behaviour has tests (sample).', on: true }])),
    http.post('/api/issues/:id/build', () => reply({ planning: false, started: true })),
    http.post('/api/issues/:id/handover', ({ params }) => reply({ handover: d.issueDetails[params.id as string]?.handover ?? null })),
    http.get('/api/:kind/:id/steps', ({ params }) => { const v = d.steps[params.kind as string]; return v ? reply({ ...v, rows: rows(v.on, v.states, v.resolved.workflow) }) : missing('steps') }),
    http.get('/api/:kind/:id/steps/:key', () => reply(d.stepWork)),
    http.put('/api/:kind/:id/steps/:key', () => reply(d.stepWork)),
    http.get('/api/initiatives', () => reply(d.initiatives)),
    http.get('/api/cycles', () => reply(d.cycles)),
    http.get('/api/projects/:id/agents', () => reply(d.projectAgents ?? [])),
    http.get('/api/projects/:id/talk', () => reply(d.projectTalk ?? null)),
    http.post('/api/projects/:id/talk', () => { d.projectTalk = d.projectTalk ?? { ...s.talkSession, subject: 'Checkout (sample)', subjectRef: { projectId: 'proj_checkout', app: true } }; return reply(d.projectTalk) }),
    http.get('/api/ideas/:id/agents', () => reply(d.taskAgents ?? [])),
    http.get('/api/ideas/:id/talk', () => reply(d.ideaTalk ?? null)),
    http.post('/api/ideas/:id/talk', () => reply(d.ideaTalk ?? s.talkSession)),
    http.get('/api/runs/:id/log', ({ params }) => reply(d.runLog ?? { runId: params.id as string, status: null, working: false, startedAt: null, endedAt: null, costUsd: null, lines: [] })),
    http.get('/api/issues/:id/agents', () => reply(d.taskAgents ?? [])),
    http.get('/api/issues/:id/talk', () => reply(d.taskTalk)),
    http.post('/api/issues/:id/talk', () => reply(d.taskTalk ?? s.talkSession)),
    http.get('/api/talks', () => reply(d.talks)),
    http.post('/api/talks/:id/close', ({ params }) => { d.talks = d.talks.map((t) => (t.id === params.id ? { ...t, closedAt: '2026-11-11T10:00:00.000Z' } : t)); return reply(d.talks.find((t) => t.id === params.id) ?? null) }),
    http.post('/api/talks/:id/reopen', ({ params }) => { d.talks = d.talks.map((t) => (t.id === params.id ? { ...t, closedAt: null } : t)); return reply(d.talks.find((t) => t.id === params.id) ?? null) }),
    http.get('/api/talks/:id', () => reply(d.transcript)),
    http.get('/api/talks/:id/images/:image', () => new HttpResponse('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e9e4d8"/><rect x="24" y="24" width="272" height="36" rx="6" fill="#cfc7b4"/><rect x="24" y="76" width="180" height="100" rx="6" fill="#d9d2c1"/><text x="160" y="190" font-family="system-ui" font-size="11" text-anchor="middle" fill="#666">sample screenshot · made up</text></svg>', { headers: { 'content-type': 'image/svg+xml' } })),
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
