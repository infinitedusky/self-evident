/**
 * The engine server: the single writer. Everything else (CLI, UI, VS Code) talks to it over HTTP, and watches
 * the event log over SSE at GET /events.
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATABASE_URL, db, pool } from './db/client.js'
import { ensureDatabase } from './db/ensure.js'
import { app as appTable, BUILD_STATUSES, ISSUE_STATES, repo as repoTable, workspace, type BuildStatus, type IssueState } from './db/schema.js'
import { EventBus, eventsSince, latestSeq } from './events.js'
import { appKey, newId } from './ids.js'
import { createIdea, listIdeas, projectFromIdea } from './ideas.js'
import { approveBrief, convertIdea, getStep, guardComplete, guardDirect, listWorkflows, planView, saveWorkflow, setStep, stepsOf, useWorkflow, type Subject } from './work.js'
import { answerPermission, closeTalks, endTalk, interruptTalk, listTalks, renameTalk, say, setAutoApprove, showTalk, startTalk, talkTranscript, type SubjectRef, type TalkContext } from './talk.js'
import { describeProject } from './describe.js'
import { handleMcp } from './mcp.js'
import { lastSync, startSync, syncApp } from './github.js'
import { addChecklist, draftChecklist, completeTodo, createTodo, dropTodo, getTodo, itemToTodo, listTodos, removeChecklistItem, reopenTodo, setChecklistItem, updateTodo } from './todos.js'
import { addIdea, addItems, dropItem, listBacklog, markDuplicate, promote, reopenItem } from './backlog.js'
import { createCycle, createInitiative, listCycles, listInitiatives, updateInitiative } from './goals.js'
import { changeState, createIssue, listIssues, reorder, updateIssue } from './issues.js'
import { now } from './now.js'
import { latestFocus, startSummaries, writeFocus } from './summary.js'
import { startStorybook, stopStorybooks, storybookStatus } from './storybook.js'
import { discardPrototype, listPrototypes, prototypeStatus, resetPrototypeData, runPrototype, savePrototypeData, startPrototype, stopPrototype, stopPrototypes, talkFor } from './prototype.js'
import { answerQuestion, finishPlanning, preparePlanning, recoverPlanning } from './planner.js'
import { addIssue, addSubIssues, appGraph, clearSubIssues, createProject, issueDetail, listCodeIssues, listProjects, PlanError, projectGraph, setBuildStatus, tick } from './projects.js'
import { runner } from './runner.js'
import { cleanValues, effectiveIntegrations, INTEGRATIONS, type Values } from './integrations.js'
import { CATALOGUE } from './catalogue.js'
import { appSkills, describePlugins, fileSkill, forgetPlugin, installed, installPlugin, pluginOn, removePlugin, ROLES, type AppPlugins, type FactorySettings, type Role } from './skills.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

const planError = (c: any, err: unknown, status = 400) => {
  if (err instanceof PlanError) return c.json({ error: err.message }, status)
  throw err
}

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Self Evident',
    model: 'Shaped like Linear: initiative (a goal) → project (issues in order, one branch, one PR) → issue (code, or a to-do; HG-12) → sub-issue (under code: one agent, one worktree, one commit, its build; under a to-do: a checklist line) → step (the builder\'s todo list). Cycles hold the issues of a stretch of time.',
    routes: {
      'GET /health': 'database reachable?',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, key?, defaultBranch?, setup?}', 'POST /repos': '{appId, fullName, localPath?, baseBranch?}',
      'GET /apps': 'all apps, each with its repos', 'PATCH /apps/:id': '{name?, defaultBranch?, setup?}', 'PATCH /repos/:id': '{fullName?, localPath?, baseBranch?}', 'GET /workspaces': 'all workspaces',
      'GET /apps/:id/graph': 'the top-level graph: every sub-issue of every project in the app', 'GET /now': 'the front door: running, needs you, recent',
      'POST /projects': '{appId, name, content?, description?, ideaId?, issues: [{title, description?, brief?, subIssues?: [{key, title, brief?, dependsOn?, files?}]}]}',
      'GET /projects?app=': 'the app\'s projects with counts', 'GET /projects/:id/graph': 'issues in order, sub-issues with builds, edges, claims, held reasons, last run, steps, the PR, backlog, to-dos',
      'POST /projects/:id/issues': '{title, brief?, description?} — an issue at the end of the project',
      'GET /issues?app=&kind=&project=&top=1&open=1': 'issues, filtered (project=none: in no project)', 'GET /issues?app=&view=code': 'the Issues page: top-level code issues with builds and planning',
      'POST /issues': '{appId, title, kind?, description?, brief?, projectId?, parentId?, state?, priority?, cycleId?, workflowId?}', 'GET /issues/:id': 'one issue with its sub-issues as a list',
      'PATCH /issues/:id': '{title?, description?, brief?, priority?, estimate?, cycleId?, projectId?, sortOrder?}', 'POST /issues/:id/state': '{state, reason?}', 'POST /issues/reorder': '{ids} — siblings, in this order',
      'POST /issues/:id/sub-issues': '[{key, title, brief?, dependsOn?, files?}] — by hand', 'DELETE /issues/:id/sub-issues': 'a draft issue back to its brief',
      'POST /issues/:id/plan?wait=1': 'the planner: the issue\'s brief → sub-issues, decisions, questions (one read-only agent run); 202 at once, or wait',
      'POST /issues/:id/retry': '{fresh?} — a failed or cancelled build, three more attempts', 'POST /issues/:id/build': '{status} — by hand, for drafts',
      'POST /questions/:id/answer': '{answer}',
      'GET /plan?app=': 'Plan\'s page: open projects with their tasks and steps, tasks in no project, open to-dos, workflows',
      'GET /{ideas|issues|projects}/:id/steps': 'the workflow in force, each step\'s state, the order, what blocks completing', 'PUT /{ideas|issues|projects}/:id/steps/:key': '{status?, detail?, body?, refs?}',
      'POST /issues/:id/brief/approve': '{approve?} — a person approves the brief; a task completes only once it is', 'POST /ideas/:id/convert': '{as: task|project, title?, projectId?, why?}',
      'GET /workflows?app=': 'the app\'s workflows', 'POST /workflows': '{appId, name, steps: [{key, on, required}], ordered?}', 'PUT /workflows/:id': 'the same',
      'POST /talks/ask': '{appId, subjectRef?, text} — a new conversation, said to and brought to the front', 'POST /{apps|projects|issues}/:id/workflow': '{workflowId | null} — attach one, or inherit again',
      'GET /projects/:id/backlog': 'what the project has to cover', 'POST /projects/:id/backlog': '{text, body?} | {items: [{text, body?}]} | {ideaId}',
      'POST /backlog/:id/take': '{title?, brief?} — becomes Todo at the end', 'POST /backlog/:id/duplicate': '{of, reason?}', 'POST /backlog/:id/drop': '{reason}', 'POST /backlog/:id/reopen': '', 'POST /backlog/:id/todo': '{title?, checklist?} — work outside the code',
      'GET /todos?app=': 'the app\'s to-dos with their checklists', 'POST /todos': '{appId, title, notes?, owner?, projectId?, checklist?: [text | {text, waitingOn?}]}',
      'PATCH /todos/:id': '{title?, notes?, owner?, projectId?}', 'POST /todos/:id/checklist': '{items}', 'PATCH /checklist/:id': '{done?, waitingOn?, text?}', 'DELETE /checklist/:id': '',
      'POST /todos/:id/draft': 'the agent drafts the checklist, or what is missing from it', 'POST /todos/:id/done': '', 'POST /todos/:id/drop': '{reason}', 'POST /todos/:id/reopen': '',
      'GET /initiatives?app=': 'goals, with their projects', 'POST /initiatives': '{appId, name, description?, targetDate?, projectIds?}', 'PATCH /initiatives/:id': '{name?, description?, status?, targetDate?, addProjects?, removeProjects?}',
      'GET /cycles?app=': 'stretches of time with their issues', 'POST /cycles': '{appId, startsAt, endsAt, name?, description?, issueIds?}',
      'POST /projects/:id/start': 'run it: worktrees, agent runs, landing, PR', 'POST /projects/:id/tick?room=N': 'one dispatch pass for a draft (no launching)',
      'GET /apps/:id/summary': 'the summary page: the newest focus section (what everyone is on, goals near, mid, long), whether one is being written, whether it is stale',
      'POST /apps/:id/summary': 'write the focus section now (202); summary.written or summary.failed says when',
      'POST /apps/:id/sync': 'read GitHub now: our PRs (merged, review, checks), others\' PRs, main into open project branches (also every 2 minutes)',
      'POST /mcp/:appId': 'the engine as an MCP server for Claude Code, scoped to one app (pnpm se connect prints the command)',
      'GET /events?since=SEQ&app=&project=&issue=': 'SSE: replay from SEQ, then live',
    },
    cli: 'pnpm if --help  (engine/README.md)',
  }))

  const settle = <T>(v: T) => { void runner.dispatch(); return v } // a change to the plan can free work: one dispatch pass after it
  api.get('/health', async (c) => { await db.execute('select 1'); return c.json({ ok: true }) })
  api.get('/now', async (c) => { const a = c.req.query('app'); return a ? c.json({ ...(await now(a)), hold: runner.hold }) : c.json({ error: 'app is required: one app at a time' }, 400) }) // the front door: running, needs you, recent

  api.post('/workspaces', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    const [row] = await db.insert(workspace).values({ id: newId('workspace'), name }).returning()
    return c.json(row, 201)
  })

  api.get('/workspaces', async (c) => c.json(await db.select().from(workspace)))

  // Apps carry their repos; setup is the whole object (test_cmd, model, max_budget_usd, max_turns, …).
  api.get('/apps', async (c) => {
    const [apps, repos] = await Promise.all([db.select().from(appTable), db.select().from(repoTable)])
    return c.json(apps.map((a) => ({ ...a, repos: repos.filter((r) => r.appId === a.id) })))
  })
  // Settings: the workspace's integrations, plugins and the jobs their skills cover; an app's own view is the merge,
  // plus its repo's skills.
  api.get('/settings', async (c) => {
    const [w] = await db.select().from(workspace).limit(1)
    const f = (w?.settings ?? {}) as FactorySettings & { integrations?: Values }
    return c.json({ workspace: w ?? null, integrations: INTEGRATIONS, values: f.integrations ?? {}, plugins: describePlugins(f), catalogue: CATALOGUE })
  })
  // Plugins: installed by Claude Code's installer into the factory's own config dir (skills.ts); the switches and the
  // filing are workspace settings.
  const factory = async () => {
    const [w] = await db.select().from(workspace).limit(1)
    if (!w) throw new PlanError('no workspace')
    return { w, f: (w.settings ?? {}) as FactorySettings }
  }
  const saveFactory = (id: string, settings: object) => db.update(workspace).set({ settings }).where(eq(workspace.id, id))
  api.post('/plugins', async (c) => {
    const body = await c.req.json<{ marketplace?: string; name?: string }>()
    try { return c.json({ id: await installPlugin(body.marketplace ?? '', body.name ?? '') }, 201) } catch (err) { return planError(c, err) }
  })
  api.delete('/plugins/:id', async (c) => {
    try {
      const id = c.req.param('id')
      await removePlugin(id)
      const { w, f } = await factory()
      await saveFactory(w.id, forgetPlugin(f, id))
      return c.json({ ok: true })
    } catch (err) { return planError(c, err) }
  })
  api.patch('/plugins/:id', async (c) => {
    const body = await c.req.json<{ on?: boolean; roles?: Role[] }>()
    try {
      const id = c.req.param('id')
      if (!installed().some((p) => p.id === id)) throw new PlanError(`no plugin ${id}`)
      const { w, f } = await factory()
      const roles = body.roles?.filter((r) => ROLES.includes(r))
      const plugins = { ...(f.plugins ?? {}), [id]: { ...(f.plugins?.[id] ?? {}), ...(body.on !== undefined ? { on: body.on } : {}), ...(roles ? { roles } : {}) } }
      await saveFactory(w.id, { ...f, plugins })
      return c.json({ ok: true })
    } catch (err) { return planError(c, err) }
  })
  api.patch('/skills/:key{.+}', async (c) => {
    const body = await c.req.json<{ category?: string | null; on?: boolean }>()
    try {
      const { w, f } = await factory()
      const change = { ...('category' in body ? { category: body.category ?? null } : {}), ...(body.on !== undefined ? { on: body.on } : {}) }
      await saveFactory(w.id, fileSkill(f, c.req.param('key'), change, installed()))
      return c.json({ ok: true })
    } catch (err) { return planError(c, err) }
  })
  api.patch('/workspaces/:id', async (c) => {
    const body = await c.req.json<{ name?: string; integrations?: Values }>()
    const [w] = await db.select().from(workspace).where(eq(workspace.id, c.req.param('id')))
    if (!w) return c.json({ error: 'no such workspace' }, 404)
    const settings = { ...(w.settings as object), ...(body.integrations ? { integrations: cleanValues(body.integrations) } : {}) }
    const [row] = await db.update(workspace).set({ ...(body.name?.trim() ? { name: body.name.trim() } : {}), settings }).where(eq(workspace.id, w.id)).returning()
    return c.json(row)
  })
  api.get('/apps/:id/settings', async (c) => {
    const [a] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
    if (!a) return c.json({ error: 'no such app' }, 404)
    const [[w], [r]] = await Promise.all([db.select().from(workspace).where(eq(workspace.id, a.workspaceId)), db.select().from(repoTable).where(eq(repoTable.appId, a.id))])
    const f = (w?.settings ?? {}) as FactorySettings & { integrations?: Values }
    const setup = a.setup as { integrations?: Values; plugins?: AppPlugins }
    const plugins = installed().map((p) => ({ id: p.id, name: p.name, factoryOn: pluginOn(p.id, f), own: setup.plugins?.[p.id]?.on ?? null, on: pluginOn(p.id, f, setup.plugins) }))
    return c.json({ integrations: effectiveIntegrations(f.integrations, setup.integrations), plugins, skills: r?.localPath ? appSkills(r.localPath) : [] })
  })
  api.patch('/apps/:id', async (c) => {
    const body = await c.req.json<{ name?: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    if (body.setup && 'integrations' in body.setup) body.setup.integrations = cleanValues(body.setup.integrations)
    if (body.setup && 'plugins' in body.setup) { // an app's own switch per plugin; null inherits
      const known = new Set(installed().map((p) => p.id))
      body.setup.plugins = Object.fromEntries(Object.entries((body.setup.plugins ?? {}) as Record<string, { on?: unknown } | null>)
        .filter(([id, v]) => known.has(id) && typeof v?.on === 'boolean').map(([id, v]) => [id, { on: v!.on }]))
    }
    const [row] = await db.update(appTable).set({ ...(body.name ? { name: body.name } : {}), ...(body.defaultBranch ? { defaultBranch: body.defaultBranch } : {}), ...(body.setup ? { setup: body.setup } : {}) })
      .where(eq(appTable.id, c.req.param('id'))).returning()
    return row ? c.json(row) : c.json({ error: 'no such app' }, 404)
  })
  api.patch('/repos/:id', async (c) => {
    const body = await c.req.json<{ fullName?: string; localPath?: string | null; baseBranch?: string | null }>()
    const [row] = await db.update(repoTable).set({ ...(body.fullName !== undefined ? { fullName: body.fullName } : {}), ...(body.localPath !== undefined ? { localPath: body.localPath } : {}), ...(body.baseBranch !== undefined ? { baseBranch: body.baseBranch } : {}) })
      .where(eq(repoTable.id, c.req.param('id'))).returning()
    return row ? c.json(row) : c.json({ error: 'no such repo' }, 404)
  })
  api.post('/apps', async (c) => {
    const body = await c.req.json<{ workspaceId: string; name: string; key?: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    const taken = (await db.select({ key: appTable.key }).from(appTable).where(eq(appTable.workspaceId, body.workspaceId))).map((r) => r.key)
    const key = body.key?.trim().toUpperCase() || appKey(body.name, taken)
    if (taken.includes(key)) return c.json({ error: `the key ${key} is taken in this workspace` }, 400)
    const [row] = await db.insert(appTable).values({ id: newId('app'), workspaceId: body.workspaceId, name: body.name, key, defaultBranch: body.defaultBranch ?? 'main', setup: body.setup ?? {} }).returning()
    return c.json(row, 201)
  })
  api.get('/apps/:id/storybook', async (c) => { try { return c.json(await storybookStatus(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/storybook/start', async (c) => { try { return c.json(await startStorybook(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/prototypes', async (c) => c.json(await listPrototypes(c.req.param('id'))))
  api.post('/apps/:id/prototypes', async (c) => {
    const body = await c.req.json<{ title?: string; brief?: string; projectId?: string }>()
    if (!body.title?.trim()) return c.json({ error: 'a prototype needs a title' }, 400)
    try { return c.json(await startPrototype({ appId: c.req.param('id'), title: body.title.trim(), brief: body.brief, projectId: body.projectId }), 201) } catch (err) { return planError(c, err) }
  })
  api.get('/prototypes/:id', async (c) => { try { return c.json(await prototypeStatus(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/prototypes/:id/start', async (c) => { try { return c.json(await runPrototype(c.req.param('id'), 'person', { restart: c.req.query('restart') === '1' })) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/data/reset', async (c) => { const b = await c.req.json<{ scenario?: string | null }>().catch(() => ({ scenario: null })); try { return c.json(await resetPrototypeData(c.req.param('id'), b.scenario ?? null)) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/data/save', async (c) => { const b = await c.req.json<{ name?: string }>(); try { return c.json(await savePrototypeData(c.req.param('id'), b.name ?? '')) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/talk', async (c) => { try { return c.json(await talkFor(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/stop', async (c) => { try { return c.json(await stopPrototype(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/discard', async (c) => { try { return c.json(await discardPrototype(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/graph', async (c) => {
    const g = await appGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such app' }, 404)
  })

  api.post('/repos', async (c) => {
    const body = await c.req.json<{ appId: string; fullName: string; localPath?: string; baseBranch?: string }>()
    const [row] = await db.insert(repoTable).values({ id: newId('repo'), appId: body.appId, fullName: body.fullName, localPath: body.localPath ?? null, baseBranch: body.baseBranch ?? null }).returning()
    return c.json(row, 201)
  })

  // Talk: an interactive agent session, the conversation as rows and events, permissions answered from the UI.
  api.get('/talks', async (c) => c.json(await listTalks({ open: c.req.query('open') === '1' })))
  api.post('/talks', async (c) => {
    const body = await c.req.json<{ appId?: string; subjectRef?: SubjectRef }>().catch(() => ({} as { appId?: string; subjectRef?: SubjectRef }))
    if (!body.appId) return c.json({ error: 'appId is required: a conversation belongs to an app' }, 400)
    try { return c.json(await startTalk({ appId: body.appId, subjectRef: body.subjectRef, actor: 'user' }), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/ask', async (c) => { // a page hands the agent a job (a step to do, an idea to convert): a new conversation, brought to the front
    const body = await c.req.json<{ appId?: string; subjectRef?: SubjectRef; text?: string }>()
    if (!body.appId || !body.text?.trim()) return c.json({ error: 'appId and text are required' }, 400)
    try { const t = await startTalk({ appId: body.appId, subjectRef: body.subjectRef, actor: 'user' }); await say(t.id, body.text); await showTalk(t.id, body.appId); return c.json(t, 201) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/rename', async (c) => {
    const { subject } = await c.req.json<{ subject: string }>()
    try { return c.json(await renameTalk(c.req.param('id'), subject)) } catch (err) { return planError(c, err, 404) }
  })
  api.get('/talks/:id', async (c) => { try { return c.json(await talkTranscript(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/talks/:id/say', async (c) => {
    const { text, context } = await c.req.json<{ text: string; context?: TalkContext }>()
    try { return c.json(await say(c.req.param('id'), text, context), 202) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/permission', async (c) => {
    const { requestId, allow, always } = await c.req.json<{ requestId: string; allow: boolean; always?: boolean }>()
    try { return c.json(await answerPermission(c.req.param('id'), requestId, allow, always)) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/interrupt', async (c) => c.json(await interruptTalk(c.req.param('id'))))
  api.post('/talks/:id/auto', async (c) => { // the person's threshold: free | cheap | moderate
    const { level } = await c.req.json<{ level: 'free' | 'cheap' | 'moderate' }>()
    try { return c.json(await setAutoApprove(c.req.param('id'), level)) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/end', async (c) => c.json(await endTalk(c.req.param('id'))))

  // The inbox: capture an idea in a moment; make it a project when its time comes.
  api.get('/ideas', async (c) => { const a = c.req.query('app'); return a ? c.json(await listIdeas(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/ideas', async (c) => {
    try { return c.json(await createIdea({ ...(await c.req.json()), actor: 'user' }), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/ideas/:id/project', async (c) => {
    const body = await c.req.json<{ tasks?: { title: string; brief?: string }[] }>().catch(() => ({} as { tasks?: { title: string; brief?: string }[] }))
    try { return c.json(await projectFromIdea(c.req.param('id'), body.tasks), 201) } catch (err) { return planError(c, err) }
  })

  // Steps and workflows (LOG.md, 2026-10-29): what's been done on an idea, a task or a project, and the rules for it.
  const subject = (kind: string, id: string): Subject => (kind === 'ideas' ? { ideaId: id } : kind === 'issues' ? { issueId: id } : { projectId: id })
  for (const kind of ['ideas', 'issues', 'projects']) {
    api.get(`/${kind}/:id/steps`, async (c) => { try { return c.json(await stepsOf(subject(kind, c.req.param('id')))) } catch (err) { return planError(c, err, 404) } })
    api.get(`/${kind}/:id/steps/:key`, async (c) => c.json(await getStep(subject(kind, c.req.param('id')), c.req.param('key') as never)))
    api.put(`/${kind}/:id/steps/:key`, async (c) => {
      try { return c.json(await setStep(subject(kind, c.req.param('id')), c.req.param('key') as never, await c.req.json(), 'user')) } catch (err) { return planError(c, err) }
    })
  }
  api.post('/issues/:id/brief/approve', async (c) => {
    const { approve = true } = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }))
    try { return c.json(settle(await approveBrief(c.req.param('id'), 'user', approve))) } catch (err) { return planError(c, err) }
  })
  api.post('/ideas/:id/convert', async (c) => {
    const body = await c.req.json<{ as: 'task' | 'project'; title?: string; projectId?: string; why?: string }>()
    if (body.as !== 'task' && body.as !== 'project') return c.json({ error: 'as must be task or project' }, 400)
    try { return c.json(await convertIdea(c.req.param('id'), body.as, body, 'user'), 201) } catch (err) { return planError(c, err) }
  })
  api.get('/workflows', async (c) => { const a = c.req.query('app'); if (!a) return c.json({ error: 'app is required: one app at a time' }, 400); try { return c.json(await listWorkflows(a)) } catch (err) { return planError(c, err, 404) } })
  api.post('/workflows', async (c) => { try { return c.json(await saveWorkflow(await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) } })
  api.put('/workflows/:id', async (c) => { try { return c.json(await saveWorkflow({ ...(await c.req.json()), id: c.req.param('id') }, 'user')) } catch (err) { return planError(c, err) } })
  for (const [kind, key] of [['apps', 'appId'], ['projects', 'projectId'], ['issues', 'issueId']] as const) {
    api.post(`/${kind}/:id/workflow`, async (c) => {
      const { workflowId } = await c.req.json<{ workflowId: string | null }>()
      try { return c.json(await useWorkflow({ [key]: c.req.param('id') } as never, workflowId ?? null, 'user')) } catch (err) { return planError(c, err) }
    })
  }
  api.get('/plan', async (c) => { const a = c.req.query('app'); if (!a) return c.json({ error: 'app is required: one app at a time' }, 400); try { return c.json(await planView(a)) } catch (err) { return planError(c, err, 404) } })

  // Issues: the one unit of work, as Linear has it. Code or a to-do; in a project or not; ordered among their siblings.
  api.get('/issues', async (c) => {
    const a = c.req.query('app')
    if (!a) return c.json({ error: 'app is required: one app at a time' }, 400)
    if (c.req.query('view') === 'code') return c.json(await listCodeIssues(a))
    const project = c.req.query('project')
    return c.json(await listIssues(a, { kind: c.req.query('kind') as 'code' | 'todo' | undefined, projectId: project === 'none' ? null : project, topLevel: c.req.query('top') === '1', open: c.req.query('open') === '1' }))
  })
  api.post('/issues', async (c) => {
    const { appId, ...body } = await c.req.json()
    try {
      if (body.kind !== 'todo' && !body.parentId) await guardDirect(db, appId, body.projectId, body.workflowId)
      return c.json(settle(await createIssue(appId, { ...body, delegate: body.kind === 'todo' || body.parentId ? null : 'planner' }, 'user')), 201)
    } catch (err) { return planError(c, err) }
  })
  api.post('/issues/reorder', async (c) => { const { ids } = await c.req.json<{ ids: string[] }>(); try { return c.json(await reorder(ids ?? [], 'user')) } catch (err) { return planError(c, err) } })
  api.get('/issues/:id', async (c) => { try { return c.json(await issueDetail(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.patch('/issues/:id', async (c) => { try { return c.json(settle(await updateIssue(c.req.param('id'), await c.req.json(), 'user'))) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/state', async (c) => {
    const { state, reason } = await c.req.json<{ state: IssueState; reason?: string }>()
    if (!ISSUE_STATES.includes(state)) return c.json({ error: `state must be one of ${ISSUE_STATES.join(', ')}` }, 400)
    try {
      if (state === 'done') await guardComplete(db, c.req.param('id'))
      return c.json(settle(await changeState(c.req.param('id'), state, { actor: 'user', reason })))
    } catch (err) { return planError(c, err) }
  })
  api.get('/projects', async (c) => { const a = c.req.query('app'); return a ? c.json(await listProjects({ all: c.req.query('all') === '1', appId: a })) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/projects', async (c) => {
    try { const body = await c.req.json(); if (!body.ideaId) await guardDirect(db, body.appId, null, body.workflowId); return c.json(await createProject(body), 201) } catch (err) { return planError(c, err) }
  })
  api.get('/projects/:id/graph', async (c) => {
    const g = await projectGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such project' }, 404)
  })
  api.post('/projects/:id/start', async (c) => {
    try { return c.json(await runner.startProject(c.req.param('id'))) } catch (err) { return planError(c, err) }
  })
  api.post('/projects/:id/tick', async (c) => {
    const room = Number(c.req.query('room') ?? SESSIONS_MAX)
    try { return c.json(await tick(c.req.param('id'), room)) } catch (err) { return planError(c, err, 404) }
  })

  api.post('/issues/:id/sub-issues', async (c) => {
    try { return c.json(await addSubIssues(c.req.param('id'), await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) }
  })
  api.delete('/issues/:id/sub-issues', async (c) => { // a draft issue back to its brief, so it can be planned again
    try { return c.json(await clearSubIssues(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) }
  })
  api.post('/projects/:id/describe', async (c) => { // plain descriptions for issues and sub-issues that have none
    try { return c.json(await describeProject(c.req.param('id'))) } catch (err) { return planError(c, err) }
  })
  api.post('/projects/:id/cancel', async (c) => {
    try { return c.json(await runner.cancelProject(c.req.param('id'))) } catch (err) { return planError(c, err, 404) }
  })

  // The planner takes minutes: by default the request returns at once and the outcome arrives on the event stream
  // (issue.planned or issue.plan_failed, then the graph has the sub-issues); ?wait=1 holds the request until it is done.
  api.post('/issues/:id/plan', async (c) => {
    let ctx
    try { ctx = await preparePlanning(c.req.param('id'), { actor: 'user' }) } catch (err) { return planError(c, err) }
    const onPlanned = () => void runner.dispatch() // sub-issues planned into a running project start right away
    if (c.req.query('wait') === '1') { const out = await finishPlanning(ctx, { onPlanned }); return c.json(out, out.status === 'completed' ? 200 : 500) }
    void finishPlanning(ctx, { onPlanned })
    return c.json({ runId: ctx.runId }, 202)
  })

  // The backlog: what the project has to cover. Resolving one can let a waiting project land, or add an issue to
  // plan, so each change is followed by a dispatch pass.
  api.get('/projects/:id/backlog', async (c) => c.json(await listBacklog(c.req.param('id'))))
  api.post('/projects/:id/backlog', async (c) => {
    const body = await c.req.json<{ text?: string; body?: string; items?: { text: string; body?: string }[]; ideaId?: string }>()
    try {
      if (body.ideaId) return c.json(await addIdea(c.req.param('id'), body.ideaId, 'user'), 201)
      return c.json(await addItems(c.req.param('id'), body.items ?? [{ text: body.text ?? '', body: body.body }], 'user'), 201)
    } catch (err) { return planError(c, err) }
  })
  api.post('/projects/:id/issues', async (c) => {
    try { return c.json(settle(await addIssue(c.req.param('id'), await c.req.json(), 'user')), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/backlog/:id/take', async (c) => {
    const body = await c.req.json<{ title?: string; brief?: string }>().catch(() => ({}))
    try { return c.json(settle(await promote(c.req.param('id'), body, 'user'))) } catch (err) { return planError(c, err) }
  })
  api.post('/backlog/:id/duplicate', async (c) => {
    const { of, reason } = await c.req.json<{ of: string; reason?: string }>()
    try { return c.json(settle(await markDuplicate(c.req.param('id'), of, reason, 'user'))) } catch (err) { return planError(c, err) }
  })
  api.post('/backlog/:id/drop', async (c) => {
    const { reason } = await c.req.json<{ reason: string }>()
    try { return c.json(settle(await dropItem(c.req.param('id'), reason, 'user'))) } catch (err) { return planError(c, err) }
  })
  // To-dos: the work around the code, with a checklist. They belong to the app; a project shows the ones that unblock it.
  api.get('/todos', async (c) => { const a = c.req.query('app'); return a ? c.json(await listTodos(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/todos', async (c) => { try { return c.json(await createTodo(await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) } })
  api.get('/todos/:id', async (c) => { try { return c.json(await getTodo(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.patch('/todos/:id', async (c) => { try { return c.json(await updateTodo(c.req.param('id'), await c.req.json(), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/todos/:id/checklist', async (c) => { const { items } = await c.req.json<{ items: (string | { text: string; waitingOn?: string })[] }>(); try { return c.json(await addChecklist(c.req.param('id'), items ?? [], 'user')) } catch (err) { return planError(c, err) } })
  api.patch('/checklist/:id', async (c) => { try { return c.json(await setChecklistItem(c.req.param('id'), await c.req.json(), 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/checklist/:id', async (c) => { try { return c.json(await removeChecklistItem(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/todos/:id/draft', async (c) => { try { return c.json(await draftChecklist(c.req.param('id'))) } catch (err) { return planError(c, err) } }) // the agent drafts the checklist (a minute)
  api.post('/todos/:id/done', async (c) => { try { return c.json(await completeTodo(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/todos/:id/drop', async (c) => { const { reason } = await c.req.json<{ reason: string }>(); try { return c.json(await dropTodo(c.req.param('id'), reason, 'user')) } catch (err) { return planError(c, err) } })
  api.post('/todos/:id/reopen', async (c) => { try { return c.json(await reopenTodo(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/backlog/:id/todo', async (c) => {
    const body = await c.req.json<{ title?: string; checklist?: string[] }>().catch(() => ({}))
    try { return c.json(settle(await itemToTodo(c.req.param('id'), body, 'user')), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/backlog/:id/reopen', async (c) => { try { return c.json(await reopenItem(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })

  // Goals, stated: initiatives (long term, served by projects) and cycles (a stretch of time with its issues).
  api.get('/initiatives', async (c) => { const a = c.req.query('app'); return a ? c.json(await listInitiatives(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/initiatives', async (c) => { try { return c.json(await createInitiative(await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) } })
  api.patch('/initiatives/:id', async (c) => { try { return c.json(await updateInitiative(c.req.param('id'), await c.req.json(), 'user')) } catch (err) { return planError(c, err) } })
  api.get('/cycles', async (c) => { const a = c.req.query('app'); return a ? c.json(await listCycles(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/cycles', async (c) => { try { return c.json(await createCycle(await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) } })

  api.post('/questions/:id/answer', async (c) => {
    const { answer } = await c.req.json<{ answer: string }>()
    try { return c.json(await answerQuestion(c.req.param('id'), answer, 'user')) } catch (err) { return planError(c, err, 404) }
  })

  // By-hand transitions: how a person drives a draft's graph. The executor owns running projects.
  api.post('/projects/:id/pause', async (c) => { try { return c.json(await runner.pauseProject(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/projects/:id/resume', async (c) => { try { return c.json(await runner.resumeProject(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/sync', async (c) => c.json(await syncApp(c.req.param('id')))) // GitHub now: PRs, reviews, checks, main
  api.get('/apps/:id/summary', async (c) => c.json(await latestFocus(c.req.param('id'))))
  api.post('/apps/:id/summary', (c) => { // a model call of a minute or so: answer now, the event says when it is there
    const id = c.req.param('id')
    void writeFocus(id, { trigger: 'person' }).catch((err) => console.log(`[summary] ${id}: ${err.message}`))
    return c.json({ started: true }, 202)
  })
  api.get('/apps/:id/sync', (c) => c.json(lastSync.get(c.req.param('id')) ?? null))
  api.get('/engine', (c) => c.json({ hold: runner.hold })) // is the engine waiting for the model?
  api.post('/engine/release', async (c) => c.json(await runner.releaseHold())) // try the model now
  api.post('/issues/:id/retry', async (c) => { // a failed or cancelled build gets three more attempts; {fresh: true} starts over from the project's branch
    const body = await c.req.json<{ fresh?: boolean }>().catch(() => ({} as { fresh?: boolean }))
    try { return c.json(await runner.retry(c.req.param('id'), { fresh: !!body.fresh })) } catch (err) { return planError(c, err) }
  })
  api.post('/issues/:id/build', async (c) => {
    const { status } = await c.req.json<{ status: BuildStatus }>()
    if (!BUILD_STATUSES.includes(status)) return c.json({ error: `status must be one of ${BUILD_STATUSES.join(', ')}` }, 400)
    try { return c.json(await setBuildStatus(c.req.param('id'), status)) } catch (err) { return planError(c, err, 404) }
  })

  // Claude Code (VS Code or terminal) drives the engine through MCP: the same tools as the conversations here.
  api.all('/mcp/:appId', (c) => handleMcp(c.req.param('appId'), c.req.raw, Number(process.env.PORT ?? 4000)))

  // The live feed: replay from ?since=<seq>, then stream as events are committed.
  api.get('/events', async (c) => {
    const since = c.req.query('since') === 'now' ? await latestSeq() : Number(c.req.query('since') ?? 0) // now: only what happens from here on
    const filter = { workspaceId: c.req.query('workspace'), appId: c.req.query('app'), projectId: c.req.query('project'), issueId: c.req.query('issue') }
    return streamSSE(c, async (stream) => {
      let last = since
      let sending: Promise<void> = Promise.resolve()
      const send = () => (sending = sending.then(async () => {
        for (const row of await eventsSince(last, filter)) {
          await stream.writeSSE({ id: String(row.seq), event: row.type, data: JSON.stringify(row) })
          last = row.seq
        }
      }))
      bus.on('event', send)
      let open = true
      stream.onAbort(() => { open = false; bus.off('event', send) })
      await send()
      while (open) {
        await stream.sleep(15000)
        if (open) await stream.writeSSE({ event: 'ping', data: String(Date.now()) })
      }
    })
  })

  // One address: the API under /api, the built UI (app/dist) at everything else, with the SPA's index for deep
  // links. In development Vite serves the UI itself and proxies /api here.
  const root = new Hono()
  root.route('/api', api)
  const dist = resolve(fileURLToPath(import.meta.url), '../../../app/dist')
  if (existsSync(dist)) {
    const rel = relative(process.cwd(), dist) || '.'
    root.use('/assets/*', serveStatic({ root: rel }))
    root.get('*', serveStatic({ path: `${rel}/index.html` }))
  } else {
    root.get('*', (c) => c.text('The UI is not built. Run `pnpm build` at the repo root (or `pnpm dev` for Vite with live reload). The API is under /api.', 404))
  }
  return root
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  await ensureDatabase(DATABASE_URL)
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) }) // idempotent; `pnpm dev` just works
  const bus = new EventBus()
  await bus.start()
  const recovered = await runner.recover()
  const stranded = await recoverPlanning()
  if (stranded) console.log(`[engine] ${stranded} planner run(s) interrupted by the restart; project those tasks again`)
  if (recovered.projects || recovered.builds || recovered.reaped) console.log('recovered:', JSON.stringify(recovered))
  const port = Number(process.env.PORT ?? 4000)
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}  (API under /api; UI at / when built)`))
  const stopSync = process.env.GITHUB_SYNC === '0' ? () => undefined : startSync(Number(process.env.GITHUB_SYNC_MINUTES ?? 2)) // GitHub: reviews, checks, merges, main moving
  const stopSummaries = process.env.SUMMARY === '0' ? () => undefined : startSummaries(Number(process.env.SUMMARY_HOURS ?? 24)) // the summary page, rewritten when a day old and something moved
  const shutdown = async () => { stopSync(); stopSummaries(); stopStorybooks(); stopPrototypes(); closeTalks(); await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
