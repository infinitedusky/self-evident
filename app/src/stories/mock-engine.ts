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
  summary: typeof s.summary; settings: typeof s.factorySettings; appSettings: typeof s.appSettings; talks: (typeof s.talkSession)[]; transcript: typeof s.transcript; /** A task's own agent, or null when it has none. */ taskTalk: typeof s.talkSession | null; /** The agents it has out. */ taskAgents?: import('../engine').TaskAgentOut[]; /** An idea's own agent, or null when it has none. */ ideaTalk?: typeof s.talkSession | null
  storybook: { url: string | null; frame?: string | null; configured: boolean; startable: boolean; up: boolean; startedHere: boolean; log: string[]; branch?: string | null; main?: boolean }
  sketches: { scope: string; branch: string | null; main: boolean; dir: string; sketches: { file: string; changedAt: number }[] }
  /** What a task's pull request will open with; none when left out. */ mergeGuide?: string
  /** The app's reports; none when left out. */ reports?: import('../engine').Reports
  /** A task's save points and task branches; none when left out. */ taskBranches?: import('../engine').TaskBranches; /** Why a move fails, when it should. */ moveError?: string
  /** What a run read and said, for the planner's tab. */ runLog?: import('../engine').RunLog
  /** What is public right now, by "kind:id". */ shares?: Record<string, import('../engine').Shared>; /** Why making a link fails, when it should. */ shareError?: string; /** ngrok's one address is held by these, until the person frees it. */ ngrokHolders?: import('../engine').NgrokHolder[]; /** What the guide tab of a shared prototype is given. */ visitorGuide?: { title: string; guide: import('../engine').Guide | null }
  prototypes: typeof s.prototypes; /** A prototype's changed files and what the agent shows. */ prototypeCode: typeof s.prototypeCode
  claudeSessions: typeof s.claudeSessions
  check: { ok: boolean; detail: string; links?: { label: string; href: string }[] }
  setup: { done: boolean; did: string[]; ask: string | null; detail: string; talkId: string | null }
  trackerGuide: string
  githubRepos: typeof s.githubRepos; repoNote: string | null; folder: typeof s.folder
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
  sketches: { scope: 'sess_sample', branch: 'talk/sample', main: false, dir: 'sketches', sketches: [{ file: 'home.html', changedAt: 1794250000000 }, { file: 'checkout.html', changedAt: 1794240000000 }] },
  prototypes: s.prototypes, prototypeCode: s.prototypeCode,
  claudeSessions: s.claudeSessions,
  check: { ok: true, detail: 'Signed in as Sample Owner; team SHOP (Sample Shop) found.' },
  setup: { done: false, did: ['Wrote docs/agents/issue-tracker.md, pointing at SS here.', 'Wrote docs/agents/forge.md, docs/agents/workflow.md, docs/agents/domain.md, docs/agents/pull-request.md and the Ticket lifecycle block in CLAUDE.md, from the app, the repo and the house profile.', 'Committed to main and pushed (abc1234).'], ask: 'Self Evident\'s tkt check for Sample Shop (SS) says: tkt doctor: fail herdr herdr is not installed. (sample)', detail: 'tkt doctor: fail  herdr  herdr is not installed. Get tkt working: https://gitlab.com/rogs/tkt', talkId: 'sess_sample_setup' },
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
    http.get('/api/apps/:id/linear/tickets', ({ request }) => {
      if (d.linearProblem) return HttpResponse.json({ error: d.linearProblem }, { status: 400 })
      const scope = new URL(request.url).searchParams.get('scope')
      return reply({ team: 'SHOP', tickets: d.linearTickets.filter((t) => (scope === 'mine' ? t.mine : scope === 'unassigned' ? !t.assignee : true)) })
    }),
    http.post('/api/apps/:id/linear/import', async ({ request }) => {
      const { identifiers } = await request.json() as { identifiers: string[] }
      return reply({ made: identifiers.map((l, i) => ({ id: `iss_sample_made${i}`, identifier: `SS-${50 + i}`, title: d.linearTickets.find((t) => t.identifier === l)?.title ?? l, linear: l })), updated: [], missing: [] })
    }),
    http.get('/api/apps/:id/tracker-guide', () => HttpResponse.text(d.trackerGuide, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })),
    http.get('/api/apps/:id/claude-sessions', () => reply(d.claudeSessions)),
    http.post('/api/talks/adopt', () => reply(d.talks[0])),
    http.post('/api/talks/:id/handoff', () => reply({ command: `cd "/Users/sample/code/sample-shop-worktrees/talk-sample" && claude --resume 00000000-sample --mcp-config '{"mcpServers":{"self-evident":{"type":"http","url":"http://localhost:4000/api/mcp/app_sample"}}}'` })),
    http.get('/api/apps/:id/storybook', () => reply(d.storybook)),
    http.get('/api/sketches/:scope', () => reply(d.sketches)),
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
    http.get('/api/prototypes/:id', ({ params }) => { const p = d.prototypes.find((x) => x.id === params.id); return p ? reply({ log: [], ...p, up: p.up ?? p.status === 'running' }) : missing('prototype') }),
    // Reports: the engine's rules, roughly. Writing one here answers at once.
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
    http.get('/api/projects', () => reply(d.projects)),
    http.get('/api/projects/:id/graph', ({ params }) => { const g = d.graphs[params.id as string]; return g ? reply(g) : missing('project') }),
    http.get('/api/issues', ({ request }) => {
      const q = new URL(request.url).searchParams
      if (q.get('view') === 'code') return reply(d.issueRows)
      const all = Object.values(d.issueDetails)
      return reply(all.filter((i) => (!q.get('kind') || i.kind === q.get('kind')) && (!q.get('project') || i.projectId === q.get('project')) && (!q.get('top') || !i.parentId)))
    }),
    // Task branches and save points: the engine's rules, roughly.
    http.get('/api/issues/:id/merge-guide', () => reply({ guide: d.mergeGuide ?? '', subTasks: 3 })),
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
    http.get('/api/:kind/:id/steps', ({ params }) => { const v = d.steps[params.kind as string]; return v ? reply({ ...v, rows: rows(v.on, v.states, v.resolved.workflow) }) : missing('steps') }),
    http.get('/api/:kind/:id/steps/:key', () => reply(d.stepWork)),
    http.get('/api/initiatives', () => reply(d.initiatives)),
    http.get('/api/cycles', () => reply(d.cycles)),
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
