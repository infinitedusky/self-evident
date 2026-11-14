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
import { registerMachine } from './machine.js'
import { cleanReferences } from './references.js'
import { app as appTable, BUILD_STATUSES, ISSUE_STATES, repo as repoTable, workspace, type BuildStatus, type IssueState, issue as issueTable } from './db/schema.js'
import { EventBus, eventsSince, latestSeq, PAGE } from './events.js'
import { appKey, newId } from './ids.js'
import { createIdea, listIdeas, projectFromIdea } from './ideas.js'
import { advanceChecks } from './checks.js'
import { writeHandover } from './handover.js'
import { approveBrief, approveStep, convertIdea, getStep, guardComplete, guardDirect, listWorkflows, planView, saveWorkflow, setStep, stepsOf, useWorkflow, type Subject, createDefaultWorkflow } from './work.js'
import { adoptTalk, answerPermission, closeTalk, closeTalks, endTalk, ensureIdeaTalk, ensureTaskTalk, ideaAgents, ideaTalk, runLog, taskAgents, taskTalk, handOff, interruptTalk, listClaudeSessions, listTalks, renameTalk, reopenTalk, say, setAutoApprove, setupTalk, showTalk, startTalk, talkTranscript, watchTerminals, type SubjectRef, type TalkContext } from './talk.js'
import { describeProject } from './describe.js'
import { handleMcp } from './mcp.js'
import { lastSync, myRepos, startSync, syncApp } from './github.js'
import { prepareCheckout } from './checkout.js'
import { addChecklist, draftChecklist, completeTodo, createTodo, dropTodo, getTodo, itemToTodo, listTodos, removeChecklistItem, reopenTodo, setChecklistItem, updateTodo } from './todos.js'
import { addIdea, addItems, dropItem, listBacklog, markDuplicate, promote, reopenItem } from './backlog.js'
import { createCycle, createInitiative, listCycles, listInitiatives, updateInitiative } from './goals.js'
import { changeState, commentOnIssue, createIssue, listComments, identifier, listIssues, reorder, resolveIssue, updateIssue } from './issues.js'
import { now } from './now.js'
import { latestFocus, startSummaries, writeFocus } from './summary.js'
import { deleteReport, editReport, getReport, isWritingReport, listReports, setReportFormat, writeReport, type Period } from './reports.js'
import { listSketches, readSketch } from './sketches.js'
import { migrateStorybookSetup, startStorybook, stopStorybooks, storybookStatus, storybookValues, STORY_FLOW_CSS } from './storybook.js'
import { prototypeCode, prototypeFile, unshowInPrototype } from './prototype-code.js'
import { setAcceptance, type AcceptanceChange } from './acceptance.js'
import { mergeGuideOf } from './merge-guide.js'
import { autoSave, clearTaskBranches, deleteSavePoint, deleteTaskBranch, goBack, saveHere, switchTo, taskBranches } from './task-branches.js'
import { restoreAfterRestart, share, shared, ShareError, sharesOf, SHARE_KINDS, stopShares, unshare, type ShareKind } from './share.js'
import { discardPrototype, listPrototypes, prototypeStatus, resetPrototypeData, runPrototype, savePrototypeData, startPrototype, stopPrototype, stopPrototypes, talkFor } from './prototype.js'
import { answerQuestion, finishPlanning, preparePlanning, recoverPlanning } from './planner.js'
import { addIssue, addSubIssues, appGraph, clearSubIssues, createProject, issueDetail, listCodeIssues, listProjects, PlanError, projectGraph, setBuildStatus, tick } from './projects.js'
import { runner } from './runner.js'
import { homeRepo, inOrder } from './workbench.js'
import { chooseFolder } from './folders.js'
import { deleteIssue } from './delete-issue.js'
import { addAsset, listAssets, removeAsset, updateAsset } from './assets.js'
import { importTickets, linearTickets, type Scope } from './linear-import.js'
import { accountStatus, cleanAccount } from './account.js'
import { pullSkills, removeSkillSource, skillSources } from './skill-sources.js'
import { outsidePr, pr as prRows } from './db/schema.js'
import { checkIntegration, cleanValues, effectiveIntegrations, IntegrationError, INTEGRATIONS, setupIntegration, statuses, type Local, type SetupResult, type Values } from './integrations.js'
import { contextFor, delegateFor, trackerGuide } from './tkt.js'
import { linearFor } from './linear-home.js'
import { CATALOGUE } from './catalogue.js'
import { appSkills, describePlugins, fileSkill, forgetPlugin, installed, installPlugin, pluginOn, removePlugin, ROLES, type AppPlugins, type FactorySettings, type Role, cleanJobs, cleanStepSkills, describeJobs, usableSkills, writeSharedSkill, type AppJobs } from './skills.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

const planError = (c: any, err: unknown, status = 400) => {
  if (err instanceof PlanError) return c.json({ error: err.message }, status)
  throw err
}

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Self Evident',
    model: 'Shaped like Linear: initiative (a goal) → project (tasks in order, one branch, one PR) → task (Linear\'s issue: the routes and ids say issue; code, or a to-do; HG-12) → sub-task (under code: one agent, one worktree, one commit, its build; under a to-do: a checklist line) → step (the builder\'s todo list). Cycles hold the tasks of a stretch of time.',
    routes: {
      'GET /health': 'database reachable?',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, key?, defaultBranch?, setup?}', 'POST /repos': '{appId, fullName, localPath?, baseBranch?}',
      'GET /apps': 'all apps, each with its repos', 'PATCH /apps/:id': '{name?, defaultBranch?, setup?}', 'PATCH /repos/:id': '{fullName?, localPath?, baseBranch?}', 'DELETE /repos/:id': 'the repository leaves the app', 'GET /skills/sources': 'the repositories skills were pulled from', 'POST /skills/sources': '{url} → pulls that repository\'s skills into the shared skills, or brings them up to date: {source, added, updated, unchanged, removed, skipped}', 'DELETE /skills/sources?url=': 'stops pulling from it and removes its skills', 'POST /skills/shared': '{name, description, body} → one of your own skills, for every app (a SKILL.md outside every repo)', 'GET /apps/:id/account': 'which Claude account the app\'s agents run on: {kind: default|key|login, ok, note}', 'GET /apps/:id/linear/tickets?scope=mine|unassigned|all': 'the Linear team\'s open tickets, each with the task it already is here', 'POST /apps/:id/linear/import': '{identifiers: ["ENG-12"]} → {made, updated, missing}', 'GET /apps/:id/assets?project=': 'the app\'s assets, or one project\'s own', 'POST /assets': '{appId, projectId?, name, location, note?}', 'PATCH /assets/:id': '{name?, location?, note?}', 'DELETE /assets/:id': 'removes it',  'POST /folders/choose': '{path?} → {path, repos: [{name, path, fullName, branch}]}; no path opens the folder dialog', 'GET /workspaces': 'all workspaces',
      'GET /apps/:id/graph': 'the top-level graph: every sub-task of every project in the app', 'GET /now': 'the front door: running, needs you, recent',
      'POST /projects': '{appId, name, content?, description?, ideaId?, issues: [{title, description?, brief?, subIssues?: [{key, title, brief?, dependsOn?, files?}]}]}',
      'GET /projects?app=': 'the app\'s projects with counts', 'GET /projects/:id/graph': 'tasks in order, sub-tasks with builds, edges, claims, held reasons, last run, steps, the PR, backlog, to-dos',
      'POST /projects/:id/issues': '{title, brief?, description?} — a task at the end of the project',
      'GET /issues?app=&kind=&project=&top=1&open=1': 'tasks, filtered (project=none: in no project)', 'GET /issues?app=&view=code': 'the Tasks page: top-level code tasks with builds and planning',
      'POST /issues': '{appId, title, kind?, description?, brief?, projectId?, parentId?, state?, priority?, cycleId?, workflowId?}', 'GET /issues/:id': 'one task with its sub-tasks as a list',
      'PATCH /issues/:id': '{title?, description?, brief?, priority?, estimate?, cycleId?, projectId?, sortOrder?}', 'POST /issues/:id/state': '{state, reason?}', 'POST /issues/reorder': '{ids} — siblings, in this order',
      'POST /issues/:id/sub-issues': '[{key, title, brief?, dependsOn?, files?}] — by hand', 'DELETE /issues/:id/sub-issues': 'a draft task back to its brief', 'DELETE /issues/:id': 'a task with no work on it, with its sub-tasks; refused when it has runs, a pull request, checks or a prototype',
      'POST /issues/:id/plan?wait=1': 'the planner: the task\'s brief → sub-tasks, decisions, questions (one read-only agent run); 202 at once, or wait',
      'POST /issues/:id/retry': '{fresh?} — a failed or cancelled build, three more attempts', 'POST /issues/:id/build': '{status} — by hand, for drafts',
      'POST /questions/:id/answer': '{answer}',
      'GET /plan?app=': 'Plan\'s page: open projects with their tasks and steps, tasks in no project, open to-dos, workflows',
      'GET /{ideas|issues|projects}/:id/steps': 'the workflow in force, each step\'s state, the order, what blocks completing', 'PUT /{ideas|issues|projects}/:id/steps/:key': '{status?, detail?, body?, refs?}', 'POST /issues/:id/steps/:key/approve': '{approve?} — a person approves a step of a task (research, sketches, mockups, the prototype), or takes it back',
      'POST /issues/:id/brief/approve': '{approve?} — a person approves the brief; a task completes only once it is', 'POST /ideas/:id/convert': '{as: task|project, title?, projectId?, why?}',
      'GET /workflows?app=': 'the app\'s workflows', 'POST /workflows': '{appId, name, steps: [{key, on, required}], ordered?}', 'PUT /workflows/:id': 'the same',
      'GET /apps/:id/claude-sessions': 'the Claude Code sessions run on this app in a terminal or an editor, newest first', 'POST /talks/ask': '{appId, subjectRef?, text} — said to the task\'s own agent when subjectRef names a task (issueId), else to a new conversation brought to the front', 'GET /issues/:id/talk': 'the task\'s own agent: its one conversation, or null', 'POST /issues/:id/handover': '{again?} — what the conversation that made the task said about it, written from a copy of that conversation (once; again: true writes it anew); null when it was not made from one', 'POST /issues/:id/talk': 'the same, started if the task has none', 'GET /issues/:id/agents': 'the agents the task\'s conductor has out (a prototype\'s conversation): sessionId, what, title, busy', 'POST /{apps|projects|issues}/:id/workflow': '{workflowId | null} — attach one, or inherit again',
      'GET /projects/:id/backlog': 'what the project has to cover', 'POST /projects/:id/backlog': '{text, body?} | {items: [{text, body?}]} | {ideaId}',
      'POST /backlog/:id/take': '{title?, brief?} — becomes Todo at the end', 'POST /backlog/:id/duplicate': '{of, reason?}', 'POST /backlog/:id/drop': '{reason}', 'POST /backlog/:id/reopen': '', 'POST /backlog/:id/todo': '{title?, checklist?} — work outside the code',
      'GET /todos?app=': 'the app\'s to-dos with their checklists', 'POST /todos': '{appId, title, notes?, owner?, projectId?, checklist?: [text | {text, waitingOn?}]}',
      'PATCH /todos/:id': '{title?, notes?, owner?, projectId?}', 'POST /todos/:id/checklist': '{items}', 'PATCH /checklist/:id': '{done?, waitingOn?, text?}', 'DELETE /checklist/:id': '',
      'POST /todos/:id/draft': 'the agent drafts the checklist, or what is missing from it', 'POST /todos/:id/done': '', 'POST /todos/:id/drop': '{reason}', 'POST /todos/:id/reopen': '',
      'GET /initiatives?app=': 'goals, with their projects', 'POST /initiatives': '{appId, name, description?, targetDate?, projectIds?}', 'PATCH /initiatives/:id': '{name?, description?, status?, targetDate?, addProjects?, removeProjects?}',
      'GET /cycles?app=': 'stretches of time with their tasks', 'POST /cycles': '{appId, startsAt, endsAt, name?, description?, issueIds?}',
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
    return c.json(apps.map((a) => ({ ...a, repos: inOrder(repos.filter((r) => r.appId === a.id), a.setup) }))) // home first (workbench.ts)
  })
  // Settings: the workspace's integrations, plugins and the jobs their skills cover; an app's own view is the merge,
  // plus its repo's skills.
  api.get('/settings', async (c) => {
    const [w] = await db.select().from(workspace).limit(1)
    const f = (w?.settings ?? {}) as FactorySettings & { integrations?: Values }
    return c.json({ workspace: w ?? null, integrations: INTEGRATIONS, values: f.integrations ?? {}, status: statuses(f.integrations ?? {}), plugins: describePlugins(f), catalogue: CATALOGUE })
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
  // One of your own skills, outside every repo (skills.ts, sharedHome): written as a SKILL.md every app then gets.
  api.post('/skills/shared', async (c) => { try { return c.json(writeSharedSkill(await c.req.json().catch(() => ({}))), 201) } catch (err) { return planError(c, err) } })
  // Skills pulled from a repository into the shared skills (skill-sources.ts): pull or update one, list them, stop pulling one.
  api.get('/skills/sources', (c) => c.json(skillSources()))
  api.post('/skills/sources', async (c) => { const b = await c.req.json<{ url?: string }>().catch(() => ({} as { url?: string })); try { return c.json(await pullSkills(b.url ?? '')) } catch (err) { return planError(c, err) } })
  api.delete('/skills/sources', async (c) => { try { return c.json(removeSkillSource(c.req.query('url') ?? '')) } catch (err) { return planError(c, err) } })
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
    const setup = a.setup as { integrations?: Values; plugins?: AppPlugins; skills_by_job?: AppJobs }
    const plugins = installed().map((p) => ({ id: p.id, name: p.name, factoryOn: pluginOn(p.id, f), own: setup.plugins?.[p.id]?.on ?? null, on: pluginOn(p.id, f, setup.plugins) }))
    const integrations = effectiveIntegrations(f.integrations, setup.integrations)
    return c.json({ integrations, status: statuses(integrations), plugins, jobs: describeJobs(f, setup.skills_by_job), usable: await usableSkills(a.id, r?.localPath), skills: r?.localPath ? appSkills(r.localPath) : [] })
  })
  // Tries an integration's saved connection: the workspace's values, or an app's with its overrides.
  // An integration's effective values for an app (or the workspace's), and what its per-app check needs from the app.
  // tkt's context for an app, with its Linear team when the app's tickets live there (tkt's own switch).
  const tktContext = async (appId: string, shared: Values, own: Values) => {
    const ctx = await contextFor(appId)
    if (!ctx) return null
    const eff = effectiveIntegrations(shared, own)
    if (eff.tkt?.linear?.value !== 'true') return ctx
    return { ...ctx, ...(await linearFor({ team: eff.linear?.team?.value, key_env: eff.linear?.key_env?.value })) }
  }
  const integrationFor = async (key: string, appId?: string): Promise<{ values: Record<string, string | null>; local?: Local } | null> => {
    const [w] = await db.select().from(workspace).limit(1)
    const shared = ((w?.settings ?? {}) as { integrations?: Values }).integrations ?? {}
    let own: Values = {}
    let a: typeof appTable.$inferSelect | undefined
    if (appId) {
      ;[a] = await db.select().from(appTable).where(eq(appTable.id, appId))
      if (!a) return null
      own = (a.setup as { integrations?: Values }).integrations ?? {}
    }
    const values = Object.fromEntries(Object.entries(effectiveIntegrations(shared, own)[key] ?? {}).map(([k, v]) => [k, v.value]))
    let local: Local | undefined
    if (key === 'tkt' && appId) { const ctx = await tktContext(appId, shared, own); if (ctx) local = { tkt: { ctx } } }
    if (key === 'storybook' && a) {
      const [r] = await db.select().from(repoTable).where(eq(repoTable.appId, a.id))
      const v = await storybookValues({ integrations: { storybook: Object.fromEntries(Object.entries(values).filter(([, x]) => x != null)) } }, r?.localPath ?? null) // the app's values, else the repo's defaults
      local = { storybook: { ctx: { app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch ?? undefined }, repoPath: r?.localPath ?? null, url: v.url, cmd: v.cmd } } }
    }
    return { values, local }
  }
  api.post('/integrations/:key/check', async (c) => {
    const body = await c.req.json<{ appId?: string }>().catch(() => ({} as { appId?: string }))
    const found = await integrationFor(c.req.param('key'), body.appId)
    if (!found) return c.json({ error: 'no such app' }, 404)
    try { return c.json(await checkIntegration(c.req.param('key'), found.values, process.env, fetch, found.local)) } catch (err) {
      if (err instanceof IntegrationError) return c.json({ error: err.message }, 400)
      throw err
    }
  })
  const settingUp = new Map<string, Promise<SetupResult & { talkId: string | null }>>() // set-ups whose engine part is running, by integration and app
  // "Set up what's missing": the engine does its part, then hands the rest to the agent in a conversation in the repo.
  api.post('/integrations/:key/setup', async (c) => {
    const body = await c.req.json<{ appId?: string }>().catch(() => ({} as { appId?: string }))
    if (!body.appId) return c.json({ error: 'appId is required: an integration is set up for an app' }, 400)
    const found = await integrationFor(c.req.param('key'), body.appId)
    if (!found) return c.json({ error: 'no such app' }, 404)
    const key = c.req.param('key')
    const appId = body.appId
    const name = INTEGRATIONS.find((i) => i.key === key)?.name ?? key
    try {
      // One set-up per app at a time (Sandy, 2026-11-12: two presses started two agents on the same upgrade): a press
      // while an agent has it shows that conversation; a press while the engine's part still runs waits for the same answer.
      const open = await setupTalk(appId, name)
      if (open) { await showTalk(open.id, appId); return c.json({ done: false, did: [], ask: null, detail: `An agent is already setting ${name} up for this app: its conversation is open beside this.`, talkId: open.id }) }
      const slot = `${key}:${appId}`
      let going = settingUp.get(slot)
      if (!going) {
        going = (async () => {
          const r = await setupIntegration(key, found.values, process.env, found.local)
          let talkId: string | null = null
          if (r.ask) { const t = await startTalk({ appId, subjectRef: { setup: name }, actor: 'user' }); await say(t.id, r.ask); await showTalk(t.id, appId); talkId = t.id }
          return { ...r, talkId }
        })().finally(() => settingUp.delete(slot))
        settingUp.set(slot, going)
      }
      return c.json(await going)
    } catch (err) {
      if (err instanceof IntegrationError) return c.json({ error: err.message }, 400)
      return planError(c, err)
    }
  })
  // The repo's docs/agents/issue-tracker.md for this app, filled in: what tkt's skills read to find the app here.
  api.get('/apps/:id/tracker-guide', async (c) => {
    const [[w], [a]] = await Promise.all([db.select().from(workspace).limit(1), db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))])
    const ctx = a ? await tktContext(a.id, ((w?.settings ?? {}) as { integrations?: Values }).integrations ?? {}, (a.setup as { integrations?: Values }).integrations ?? {}) : null
    if (!ctx) return c.json({ error: 'no such app' }, 404)
    if (ctx.trackerProblem) return c.json({ error: ctx.trackerProblem }, 409)
    return c.text(await trackerGuide(ctx), 200, { 'content-type': 'text/markdown; charset=utf-8' })
  })
  api.patch('/apps/:id', async (c) => {
    const body = await c.req.json<{ name?: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    if (body.setup && 'integrations' in body.setup) body.setup.integrations = cleanValues(body.setup.integrations)
    if (body.setup && 'account' in body.setup) { try { const acct = cleanAccount(body.setup.account); if (acct) body.setup.account = acct; else delete body.setup.account } catch (err) { return planError(c, err) } }
    if (body.setup && 'step_skills' in body.setup) { const steps = cleanStepSkills(body.setup.step_skills); if (Object.keys(steps).length) body.setup.step_skills = steps; else delete body.setup.step_skills }
    if (body.setup && 'skills_by_job' in body.setup) { // an app's own skill per job; absent inherits
      const [of] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
      const [w] = of ? await db.select().from(workspace).where(eq(workspace.id, of.workspaceId)) : []
      const jobs = cleanJobs(body.setup.skills_by_job, (w?.settings ?? {}) as FactorySettings, installed())
      if (Object.keys(jobs).length) body.setup.skills_by_job = jobs; else delete body.setup.skills_by_job
    }
    if (body.setup && 'references' in body.setup) body.setup.references = cleanReferences(body.setup.references, c.req.param('id'))
    if (body.setup && 'plugins' in body.setup) { // an app's own switch per plugin; null inherits
      const known = new Set(installed().map((p) => p.id))
      body.setup.plugins = Object.fromEntries(Object.entries((body.setup.plugins ?? {}) as Record<string, { on?: unknown } | null>)
        .filter(([id, v]) => known.has(id) && typeof v?.on === 'boolean').map(([id, v]) => [id, { on: v!.on }]))
    }
    const [row] = await db.update(appTable).set({ ...(body.name ? { name: body.name } : {}), ...(body.defaultBranch ? { defaultBranch: body.defaultBranch } : {}), ...(body.setup ? { setup: body.setup } : {}) })
      .where(eq(appTable.id, c.req.param('id'))).returning()
    return row ? c.json(row) : c.json({ error: 'no such app' }, 404)
  })
  // A local checkout is made ready as it is set (a folder becomes a repository; the branch follows); the row comes back with a `note` saying what was done.
  // The app's default branch follows its home repository only; another of its repositories has its own base branch.
  const readyCheckout = async (appId: string, localPath: string, own: { repoId?: string; baseBranch?: string | null } = {}) => {
    const [a] = await db.select().from(appTable).where(eq(appTable.id, appId))
    if (!a) throw new PlanError('no such app')
    const home = await homeRepo(appId)
    const mate = !!home && home.id !== own.repoId
    const p = await prepareCheckout(localPath, mate ? own.baseBranch ?? a.defaultBranch : a.defaultBranch, a.name)
    if (!mate && p.branch !== a.defaultBranch) await db.update(appTable).set({ defaultBranch: p.branch }).where(eq(appTable.id, appId))
    return p.note
  }
  api.patch('/repos/:id', async (c) => {
    const body = await c.req.json<{ fullName?: string; localPath?: string | null; baseBranch?: string | null }>()
    const [was] = await db.select().from(repoTable).where(eq(repoTable.id, c.req.param('id')))
    if (!was) return c.json({ error: 'no such repo' }, 404)
    const localPath = body.localPath?.trim() || null
    let note: string | null = null
    try { if (localPath) note = await readyCheckout(was.appId, localPath, { repoId: was.id, baseBranch: body.baseBranch !== undefined ? body.baseBranch : was.baseBranch }) } catch (err) { return planError(c, err) }
    const [row] = await db.update(repoTable).set({ ...(body.fullName !== undefined ? { fullName: body.fullName } : {}), ...(body.localPath !== undefined ? { localPath } : {}), ...(body.baseBranch !== undefined ? { baseBranch: body.baseBranch } : {}) })
      .where(eq(repoTable.id, was.id)).returning()
    return c.json({ ...row, note })
  })
  api.get('/github/repos', async (c) => c.json(await myRepos()))
  api.post('/apps', async (c) => {
    const body = await c.req.json<{ workspaceId: string; name: string; key?: string; defaultBranch?: string; setup?: Record<string, unknown>; repo?: { fullName?: string; localPath?: string } }>()
    const taken = (await db.select({ key: appTable.key }).from(appTable).where(eq(appTable.workspaceId, body.workspaceId))).map((r) => r.key)
    const key = body.key?.trim().toUpperCase() || appKey(body.name, taken)
    if (taken.includes(key)) return c.json({ error: `the key ${key} is taken in this workspace` }, 400)
    // The code, when it is given at creation: the checkout is made ready before the app exists, so a refusal leaves nothing half-made.
    const fullName = body.repo?.fullName?.trim() ?? ''
    const localPath = body.repo?.localPath?.trim() || null
    let branch = body.defaultBranch?.trim() || 'main'
    let note: string | null = null
    if (localPath) { try { const p = await prepareCheckout(localPath, branch, body.name); branch = p.branch; note = p.note } catch (err) { return planError(c, err) } }
    const row = await db.transaction(async (tx) => { // with its default workflow: an app always has one
      const [made] = await tx.insert(appTable).values({ id: newId('app'), workspaceId: body.workspaceId, name: body.name, key, defaultBranch: branch, setup: body.setup ?? {} }).returning()
      const repos = fullName || localPath ? await tx.insert(repoTable).values({ id: newId('repo'), appId: made.id, fullName, localPath }).returning() : []
      return { ...made, repos, workflowId: await createDefaultWorkflow(tx, made.id), note }
    })
    return c.json(row, 201)
  })
  // ?session=: the conversation the person is in; its worktree's Storybook when it has one, else the app's.
  api.get('/apps/:id/storybook', async (c) => { try { return c.json(await storybookStatus(c.req.param('id'), c.req.query('session'), c.req.query('story'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/storybook/start', async (c) => { try { return c.json(await startStorybook(c.req.param('id'), c.req.query('session'))) } catch (err) { return planError(c, err) } })
  // Sketches: the HTML files under sketches/ in a conversation's worktree (scope: its id) or the app's checkout (scope: the app's id).
  api.get('/sketches/:scope', async (c) => { try { return c.json(await listSketches(c.req.param('scope'))) } catch (err) { return planError(c, err, 404) } })
  api.get('/sketches/:scope/file/*', async (c) => {
    const scope = c.req.param('scope')
    const file = decodeURIComponent(c.req.path.split(`/sketches/${scope}/file/`)[1] ?? '')
    const found = await readSketch(scope, file).catch(() => null)
    return found ? c.body(new Uint8Array(found.body), 200, found.headers) : c.text('No such sketch.', 404)
  })
  api.get('/storybook/story-flow.css', (c) => c.text(STORY_FLOW_CSS, 200, { 'content-type': 'text/css; charset=utf-8' })) // step 4 of "Set up the screen map"
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
  api.get('/prototypes/:id/code', async (c) => { try { return c.json(await prototypeCode(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/prototypes/:id/file', async (c) => { try { return c.json(await prototypeFile(c.req.param('id'), c.req.query('path') ?? '')) } catch (err) { return planError(c, err, 404) } })
  api.delete('/prototypes/:id/shown/:shownId', async (c) => { try { return c.json(await unshowInPrototype(c.req.param('id'), c.req.param('shownId'))) } catch (err) { return planError(c, err) } })
  // Sharing: a public address (a Cloudflare quick tunnel) for a prototype, a place's mockups or its sketches. id: the prototype's, or a conversation's or app's.
  const shareKind = (k: string) => { if (!(SHARE_KINDS as readonly string[]).includes(k)) throw new PlanError(`share a prototype, storybook or sketch, not ${k}`); return k as ShareKind }
  api.get('/apps/:id/shares', (c) => c.json(sharesOf(c.req.param('id'))))
  api.get('/shares/:kind/:id', (c) => { try { return c.json({ share: shared(shareKind(c.req.param('kind')), c.req.param('id')) }) } catch (err) { return planError(c, err) } })
  api.post('/shares/:kind/:id', async (c) => { // {freeNgrok?}: stop the other ngrok tunnels on this computer first
    const body = await c.req.json<{ freeNgrok?: boolean }>().catch(() => ({} as { freeNgrok?: boolean }))
    try { return c.json({ share: await share(shareKind(c.req.param('kind')), c.req.param('id'), 'user', { freeNgrok: !!body.freeNgrok }) }, 201) }
    catch (err) { if (err instanceof ShareError) return c.json({ error: err.message, code: err.code, holders: err.holders }, 409); return planError(c, err) }
  })
  api.delete('/shares/:kind/:id', async (c) => { try { return c.json(await unshare(shareKind(c.req.param('kind')), c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/talk', async (c) => { try { return c.json(await talkFor(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/stop', async (c) => { try { return c.json(await stopPrototype(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/discard', async (c) => { try { return c.json(await discardPrototype(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/graph', async (c) => {
    const g = await appGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such app' }, 404)
  })

  api.post('/repos', async (c) => {
    const body = await c.req.json<{ appId: string; fullName: string; localPath?: string; baseBranch?: string }>()
    const localPath = body.localPath?.trim() || null
    let note: string | null = null
    try { if (localPath) note = await readyCheckout(body.appId, localPath, { baseBranch: body.baseBranch }) } catch (err) { return planError(c, err) }
    const [row] = await db.insert(repoTable).values({ id: newId('repo'), appId: body.appId, fullName: body.fullName, localPath, baseBranch: body.baseBranch ?? null }).returning()
    return c.json({ ...row, note }, 201)
  })
  // A repository leaves the app: its row and the teammates' pull requests kept for it. Our own pull requests stay, without it. The checkout is not touched.
  api.delete('/repos/:id', async (c) => {
    const [was] = await db.select().from(repoTable).where(eq(repoTable.id, c.req.param('id')))
    if (!was) return c.json({ error: 'no such repo' }, 404)
    await db.transaction(async (tx) => {
      await tx.delete(outsidePr).where(eq(outsidePr.repoId, was.id))
      await tx.update(prRows).set({ repoId: null }).where(eq(prRows.repoId, was.id))
      await tx.delete(repoTable).where(eq(repoTable.id, was.id))
    })
    return c.json({ removed: was.id })
  })
  // Tasks from Linear tickets (linear-import.ts): the team's open tickets for the app, and bringing the ticked ones in. Reads Linear, never writes.
  // Which Claude account this app's agents run on (account.ts): the engine's default, or the app's own key or login.
  api.get('/apps/:id/account', async (c) => {
    const [a] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
    return a ? c.json(await accountStatus(a.setup)) : c.json({ error: 'no such app' }, 404)
  })
  api.get('/apps/:id/linear/tickets', async (c) => {
    const scope = (['mine', 'unassigned', 'all'] as Scope[]).find((s) => s === c.req.query('scope')) ?? 'mine'
    try { return c.json(await linearTickets(c.req.param('id'), scope)) } catch (err) { return planError(c, err) }
  })
  api.post('/apps/:id/linear/import', async (c) => {
    const body = await c.req.json<{ identifiers?: string[] }>().catch(() => ({} as { identifiers?: string[] }))
    try { return c.json(await importTickets(c.req.param('id'), body.identifiers ?? []), 201) } catch (err) { return planError(c, err) }
  })
  // Assets (assets.ts): what an app or a project is worked from. A name, a link or path, a note.
  api.get('/apps/:id/assets', async (c) => c.json(await listAssets(c.req.param('id'), c.req.query('project') || null)))
  api.post('/assets', async (c) => { try { return c.json(await addAsset(await c.req.json()), 201) } catch (err) { return planError(c, err) } })
  api.patch('/assets/:id', async (c) => { try { return c.json(await updateAsset(c.req.param('id'), await c.req.json())) } catch (err) { return planError(c, err, 404) } })
  api.delete('/assets/:id', async (c) => { try { return c.json(await removeAsset(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  // A folder on this computer and the repositories in it: the one named, or the one picked in the system's folder dialog (folders.ts).
  api.post('/folders/choose', async (c) => {
    const body = await c.req.json<{ path?: string }>().catch(() => ({} as { path?: string }))
    try { return c.json(await chooseFolder(body.path)) } catch (err) { return planError(c, err) }
  })

  // Talk: an interactive agent session, the conversation as rows and events, permissions answered from the UI.
  api.get('/talks', async (c) => c.json(await listTalks({ open: c.req.query('open') === '1' })))
  api.post('/talks', async (c) => {
    const body = await c.req.json<{ appId?: string; subjectRef?: SubjectRef }>().catch(() => ({} as { appId?: string; subjectRef?: SubjectRef }))
    if (!body.appId) return c.json({ error: 'appId is required: a conversation belongs to an app' }, 400)
    try { return c.json(body.subjectRef?.issueId ? await ensureTaskTalk(body.subjectRef.issueId) : await startTalk({ appId: body.appId, subjectRef: body.subjectRef, actor: 'user' }), 201) } catch (err) { return planError(c, err) }
  })
  // A task's own agent: its one conversation, or null; POST starts it if it has none.
  api.get('/issues/:id/talk', async (c) => c.json(await taskTalk(c.req.param('id'))))
  api.get('/runs/:id/log', async (c) => c.json(await runLog(c.req.param('id')))) // what a run read, did and said: the planner's tab
  api.get('/issues/:id/agents', async (c) => c.json(await taskAgents(c.req.param('id')))) // the agents its conductor has out
  // A task's hand-over from the conversation that made it: written if there is none, or again with {again: true}.
  api.post('/issues/:id/handover', async (c) => { try { const { again } = await c.req.json<{ again?: boolean }>().catch(() => ({ again: false })); return c.json(await writeHandover(c.req.param('id'), { again })) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/talk', async (c) => { try { return c.json(await ensureTaskTalk(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  // An idea's own agent, as a task's: its one conversation, or null; POST starts it (and cuts its worktree) if it has none.
  api.get('/ideas/:id/talk', async (c) => c.json(await ideaTalk(c.req.param('id'))))
  api.get('/ideas/:id/agents', async (c) => c.json(await ideaAgents(c.req.param('id'))))
  api.post('/ideas/:id/talk', async (c) => { try { return c.json(await ensureIdeaTalk(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/talks/ask', async (c) => { // a page hands the agent a job: a step on a task goes to the task's own agent; anything else (an idea to convert) starts a conversation, brought to the front
    const body = await c.req.json<{ appId?: string; subjectRef?: SubjectRef; text?: string; own?: boolean }>()
    if (!body.appId || !body.text?.trim()) return c.json({ error: 'appId and text are required' }, 400)
    try {
      if (body.subjectRef?.issueId) { const t = await ensureTaskTalk(body.subjectRef.issueId); await say(t.id, body.text); return c.json(t, 201) } // shown on the task's page, not in the left column
      if (body.subjectRef?.ideaId) { // an idea's step goes to the idea's own agent (own: started if it has none); anything else to it only if it has one
        const t = body.own ? await ensureIdeaTalk(body.subjectRef.ideaId) : await ideaTalk(body.subjectRef.ideaId)
        if (t) { await say(t.id, body.text); return c.json(t, 201) }
      }
      const t = await startTalk({ appId: body.appId, subjectRef: body.subjectRef, actor: 'user' }); await say(t.id, body.text); await showTalk(t.id, body.appId); return c.json(t, 201)
    } catch (err) { return planError(c, err) }
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
  // The tab only: closing leaves the conversation, its worktree and its branch; reopening puts the tab back.
  api.post('/talks/:id/close', async (c) => { try { return c.json(await closeTalk(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/talks/:id/reopen', async (c) => { try { return c.json(await reopenTalk(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  // The same conversation in a terminal: hand it there (the command to run), or bring one started there in.
  api.post('/talks/:id/handoff', async (c) => { try { return c.json(await handOff(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/claude-sessions', async (c) => c.json(await listClaudeSessions(c.req.param('id'))))
  api.post('/talks/adopt', async (c) => {
    const body = await c.req.json<{ appId?: string; cwd?: string; agentSessionId?: string }>()
    if (!body.appId || !body.cwd) return c.json({ error: 'appId and cwd are required' }, 400)
    try { return c.json(await adoptTalk({ appId: body.appId, cwd: body.cwd, agentSessionId: body.agentSessionId }), 201) } catch (err) { return planError(c, err) }
  })

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
  api.post('/issues/:id/steps/:key/approve', async (c) => {
    const { approve = true } = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }))
    try {
      const row = await approveStep(c.req.param('id'), c.req.param('key') as never, 'user', approve)
      if (approve && c.req.param('key') === 'prototype') await autoSave(c.req.param('id'), 'prototype_approved') // a point to come back to, before the checks and the brief move on
      if (approve && c.req.param('key') === 'prototype') void advanceChecks(c.req.param('id')).catch((err) => console.error('checks: could not start', err)) // the checks run by themselves from here
      return c.json(row)
    } catch (err) { return planError(c, err) }
  })
  api.put('/issues/:id/acceptance', async (c) => { // {add?, update?, remove?}: the task's acceptance criteria
    try { return c.json(await setAcceptance(c.req.param('id'), await c.req.json<AcceptanceChange>(), 'user')) } catch (err) { return planError(c, err) }
  })
  api.post('/issues/:id/brief/approve', async (c) => {
    const { approve = true } = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }))
    try {
      const row = await approveBrief(c.req.param('id'), 'user', approve)
      if (approve) await autoSave(c.req.param('id'), 'brief_approved') // before the plan and the build: "scrap the build" is going back to here
      return c.json(settle(row))
    } catch (err) { return planError(c, err) }
  })
  // Task branches and save points (task-branches.ts). A move tells the task's open conversations what happened.
  const moved = async <T extends { sessions: string[]; note: string }>(r: T) => {
    for (const id of r.sessions) await say(id, r.note, undefined, { author: 'engine', kind: 'brief', payload: { label: 'The task moved to another task branch' } }).catch(() => {})
    return settle(r)
  }
  api.get('/issues/:id/merge-guide', async (c) => { // what the pull request will open with, for whoever approves it
    try {
      const t = await resolveIssue(db, c.req.param('id'))
      const [a] = await db.select().from(appTable).where(eq(appTable.id, t.appId))
      const subs = await db.select().from(issueTable).where(eq(issueTable.parentId, t.id))
      const pending = subs.filter((x) => !['done', 'canceled', 'duplicate'].includes(x.state)).map((x) => identifier(a.key, x.number))
      return c.json({ guide: await mergeGuideOf(t.id, identifier(a.key, t.number), t.title, pending), subTasks: subs.length })
    } catch (err) { return planError(c, err) }
  })
  api.get('/issues/:id/branches', async (c) => { try { return c.json(await taskBranches(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/save-points', async (c) => { // {name}
    const { name = '' } = await c.req.json<{ name?: string }>().catch(() => ({ name: '' }))
    try { return c.json(await saveHere(c.req.param('id'), name, 'user')) } catch (err) { return planError(c, err) }
  })
  api.delete('/issues/:id/branches', async (c) => { try { return c.json(await clearTaskBranches(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/save-points/:id/go-back', async (c) => { // {name?, resetData?}: a new task branch from it, made current
    const body = await c.req.json<{ name?: string; resetData?: boolean }>().catch(() => ({} as { name?: string; resetData?: boolean }))
    try { return c.json(await moved(await goBack(c.req.param('id'), { ...body, by: 'user' }))) } catch (err) { return planError(c, err) }
  })
  api.delete('/save-points/:id', async (c) => { try { return c.json(await deleteSavePoint(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/task-branches/:id/switch', async (c) => { // {resetData?}: a set-aside one made current again
    const body = await c.req.json<{ resetData?: boolean }>().catch(() => ({} as { resetData?: boolean }))
    try { return c.json(await moved(await switchTo(c.req.param('id'), { ...body, by: 'user' }))) } catch (err) { return planError(c, err) }
  })
  api.delete('/task-branches/:id', async (c) => { try { return c.json(await deleteTaskBranch(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
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
    const states = c.req.query('state')?.split(',').map((s) => s.trim()).filter(Boolean) as IssueState[] | undefined
    if (states?.some((s) => !ISSUE_STATES.includes(s))) return c.json({ error: `state must be among ${ISSUE_STATES.join(', ')}` }, 400)
    return c.json(await listIssues(a, { kind: c.req.query('kind') as 'code' | 'todo' | undefined, projectId: project === 'none' ? null : project, topLevel: c.req.query('top') === '1', open: c.req.query('open') === '1', states, q: c.req.query('q') }))
  })
  api.post('/issues', async (c) => {
    const { appId, ...body } = await c.req.json()
    try {
      if (body.kind !== 'todo' && !body.parentId) await guardDirect(db, appId, body.projectId, body.workflowId)
      return c.json(settle(await createIssue(appId, { ...body, delegate: body.kind === 'todo' || body.parentId ? null : await delegateFor(appId) }, 'user')), 201)
    } catch (err) { return planError(c, err) }
  })
  api.post('/issues/reorder', async (c) => { const { ids } = await c.req.json<{ ids: string[] }>(); try { return c.json(await reorder(ids ?? [], 'user')) } catch (err) { return planError(c, err) } })
  // One issue, by its id or its identifier (SE-12): the identifier is what a ticket is called everywhere outside.
  api.get('/issues/:id', async (c) => { try { return c.json(await issueDetail((await resolveIssue(db, c.req.param('id'))).id)) } catch (err) { return planError(c, err, 404) } })
  api.patch('/issues/:id', async (c) => { try { return c.json(settle(await updateIssue((await resolveIssue(db, c.req.param('id'))).id, await c.req.json(), 'user'))) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/state', async (c) => {
    const { state, reason } = await c.req.json<{ state: IssueState; reason?: string }>()
    if (!ISSUE_STATES.includes(state)) return c.json({ error: `state must be one of ${ISSUE_STATES.join(', ')}` }, 400)
    try {
      const { id } = await resolveIssue(db, c.req.param('id'))
      if (state === 'done') await guardComplete(db, id)
      return c.json(settle(await changeState(id, state, { actor: 'user', reason })))
    } catch (err) { return planError(c, err) }
  })
  // Comments: what is written on a ticket as it moves (the plan, the handoff, the review, the completion), one per
  // heading; the same heading again replaces it. author names who wrote it (a skill, an agent, a person); else user.
  api.get('/issues/:id/comments', async (c) => { try { return c.json(await listComments(db, (await resolveIssue(db, c.req.param('id'))).id)) } catch (err) { return planError(c, err, 404) } })
  api.post('/issues/:id/comments', async (c) => {
    const body = await c.req.json<{ heading?: string; body: string; author?: string }>()
    const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 60) : 'user'
    try { return c.json(await commentOnIssue((await resolveIssue(db, c.req.param('id'))).id, { heading: body.heading, body: body.body }, author), 201) } catch (err) { return planError(c, err) }
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

  // A task with no work on it, gone with its sub-tasks (delete-issue.ts); one with work is refused: cancel it instead.
  api.delete('/issues/:id', async (c) => { try { return c.json(await deleteIssue(c.req.param('id'), 'user', endTalk)) } catch (err) { return planError(c, err) } })
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
  // Reports on an app's work over a period (reports.ts): the end-of-day note, the weekly status. Drafts; nothing is sent.
  api.get('/apps/:id/reports', async (c) => { try { return c.json(await listReports(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/reports', async (c) => { // {period: today|yesterday|this_week|last_week} or {from, to, kind?}; notes?: what the person adds. A model call of a minute or so: 202, report.written or report.failed says when
    const id = c.req.param('id')
    const body = await c.req.json<{ period?: Period; from?: string; to?: string; kind?: 'daily' | 'weekly'; notes?: string }>().catch(() => ({} as { period?: Period }))
    if (isWritingReport(id)) return c.json({ error: 'a report on this app is being written: wait for it' }, 409)
    if (!('period' in body && body.period) && !('from' in body && body.from)) return c.json({ error: 'say which period: today, yesterday, this_week, last_week, or from and to' }, 400)
    void writeReport(id, { ...body, actor: 'user' }).catch((err) => console.log(`[report] ${id}: ${err.message}`))
    return c.json({ writing: true }, 202)
  })
  api.put('/apps/:id/report-format', async (c) => { try { return c.json(await setReportFormat(c.req.param('id'), await c.req.json())) } catch (err) { return planError(c, err) } })
  api.get('/reports/:id', async (c) => { try { return c.json(await getReport(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.put('/reports/:id', async (c) => { try { return c.json(await editReport(c.req.param('id'), (await c.req.json<{ body: string }>()).body)) } catch (err) { return planError(c, err) } })
  api.delete('/reports/:id', async (c) => { try { return c.json(await deleteReport(c.req.param('id'))) } catch (err) { return planError(c, err) } })
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
        for (;;) { // a page at a time until caught up, so a long replay never leaves the live events behind it
          const rows = await eventsSince(last, filter)
          for (const row of rows) {
            await stream.writeSSE({ id: String(row.seq), event: row.type, data: JSON.stringify(row) })
            last = row.seq
          }
          if (rows.length < PAGE) break
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
  for (let waited = 0; ; waited++) { // the database may be on another machine, behind a proxy that starts after us: wait for it, never exit (nothing would start us again)
    try { await ensureDatabase(DATABASE_URL); break } catch (err) {
      if (waited % 15 === 0) console.warn(`[engine] waiting for the database: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) }) // idempotent; `pnpm dev` just works
  void restoreAfterRestart().then((back) => { if (back.length) console.log(`share: put back ${back.join(', ')}, stopped for a share before the engine restarted`) })
  const me = await registerMachine() // paths are stored from this computer's root (db/home-path.ts)
  console.log(`[engine] this computer: ${me.name}, user ${me.userName}, root ${me.root}`)
  const bus = new EventBus()
  await bus.start()
  const recovered = await runner.recover()
  const moved = await migrateStorybookSetup() // the Storybook command and URL, under the integration since 2026-11-09
  if (moved) console.log(`storybook setup moved under the integration for ${moved} app(s)`)
  const stranded = await recoverPlanning()
  if (stranded) console.log(`[engine] ${stranded} planner run(s) interrupted by the restart; project those tasks again`)
  if (recovered.projects || recovered.builds || recovered.reaped) console.log('recovered:', JSON.stringify(recovered))
  const port = Number(process.env.PORT ?? 4000)
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}  (API under /api; UI at / when built)`))
  void watchTerminals().catch(() => {}) // conversations still in a terminal: keep copying what's said there
  const stopSync = process.env.GITHUB_SYNC === '0' ? () => undefined : startSync(Number(process.env.GITHUB_SYNC_MINUTES ?? 2)) // GitHub: reviews, checks, merges, main moving
  const stopSummaries = process.env.SUMMARY === '0' ? () => undefined : startSummaries(Number(process.env.SUMMARY_HOURS ?? 24)) // the summary page, rewritten when a day old and something moved
  const shutdown = async () => { stopSync(); stopSummaries(); stopStorybooks(); stopShares(); stopPrototypes(); closeTalks(); await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
