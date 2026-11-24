/**
 * The engine server: the single writer. Everything else (CLI, UI, VS Code) talks to it over HTTP, and watches
 * the event log over SSE at GET /events.
 */
import './own-scope.js' // first: the engine's own Doppler scope is not handed to what it starts
import { stayUp } from './stay-up.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { imageFile, saveImages, type ImageIn } from './uploads.js'
import { listLearning } from './learn.js'
import { checklistOf } from './checklist.js'
import { closeTask, closeView, reopenUnclosed } from './close.js'
import { acceptSmoke, askToMine, keepSmokeDatabase, markRelease, revealSmokeFiles, markSmoke, smokeView, startSmoke, stopSmoke, stopSmokes, trySmoke } from './smoke.js'
import { closeTerminal, closeTerminals, openTerminal, ownPage, resizeTerminal, scratchKey, typeInTerminal, watchTerminal } from './smoke-terminal.js'
import { startLearning, talkBusy } from './talk.js'
import { serve } from '@hono/node-server'
import { frameFor } from './frame-proxy.js'
import { appendEvent } from './events.js'
import { serveStatic } from '@hono/node-server/serve-static'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { deviceJoined, devicesHere, phoneState, remoteIp, servePhone, stopPhone } from './devices.js'
import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATABASE_URL, db, pool } from './db/client.js'
import { ensureDatabase } from './db/ensure.js'
import { registerMachine } from './machine.js'
import { cleanReferences } from './references.js'
import { app as appTable, BUILD_STATUSES, ISSUE_STATES, repo as repoTable, workspace, type BuildStatus, type IssueState, issue as issueTable, project as projectTable, question as questionTable } from './db/schema.js'
import { EventBus, eventsSince, latestSeq, PAGE } from './events.js'
import { appKey, cleanKey, newId } from './ids.js'
import { createIdea, getIdea, listIdeas, projectFromIdea } from './ideas.js'
import { advanceChecks, onChecksDone, onPlanWanted, resumeChecks } from './checks.js'
import { checksOwed, step } from './steps.js'
import { writeHandover } from './handover.js'
import { skipUntouched, approveBrief, approveStep, convertIdea, getStep, guardComplete, guardDirect, listWorkflows, planView, saveWorkflow, setStep, speedIntoWorkflows, ensureMain, stepsOf, useWorkflow, type Subject, createDefaultWorkflow } from './work.js'
import { adoptTalk, answerPermission, busyAmong, releaseTalks, closeTalk, closeTalks, endTalk, ensureIdeaTalk, ensureTaskTalk, ideaAgents, ideaTalk, runLog, taskAgents, taskTalk, handOff, interruptTalk, listClaudeSessions, listTalks, renameTalk, reopenTalk, say, setAutoApprove, setupTalk, showTalk, startTalk, talkTranscript, watchTerminals, type SubjectRef, type TalkContext } from './talk.js'
import { describeProject } from './describe.js'
import { handleMcp } from './mcp.js'
import { lastSync, myRepos, startSync, syncApp } from './github.js'
import { prepareCheckout } from './checkout.js'
import { addChecklist, draftChecklist, completeTodo, createTodo, dropTodo, getTodo, itemToTodo, listTodos, removeChecklistItem, reopenTodo, setChecklistItem, updateTodo } from './todos.js'
import { addIdea, addItems, dropItem, listBacklog, markDuplicate, promote, reopenItem } from './backlog.js'
import { createCycle, createInitiative, listCycles, listInitiatives, updateInitiative } from './goals.js'
import { getIssue, changeState, commentOnIssue, createIssue, listComments, identifier, listIssues, reorder, resolveIssue, updateIssue } from './issues.js'
import { now } from './now.js'
import { latestFocus, startSummaries, writeFocus } from './summary.js'
import { addNote, editNote, listNotes, removeNote } from './notes.js'
import { deleteReport, editReport, getReport, isWritingReport, listReports, setReportFormat, writeReport, type Period } from './reports.js'
import { listSketches, readSketch } from './sketches.js'
import { listScreens } from './screens.js'
import { migrateStorybookSetup, startStorybook, stopStorybookAt, stopStorybooks, storybookStatus, storybookValues, STORY_FLOW_CSS } from './storybook.js'
import { prototypeCode, prototypeFile, unshowInPrototype } from './prototype-code.js'
import { setAcceptance, type AcceptanceChange } from './acceptance.js'
import { mergeGuideAndRecord } from './merge-guide.js'
import { autoSave, clearTaskBranches, deleteSavePoint, deleteTaskBranch, goBack, saveHere, switchTo, taskBranches } from './task-branches.js'
import { restoreAfterRestart, share, shared, ShareError, sharesOf, SHARE_KINDS, stopShares, unshare, type ShareKind } from './share.js'
import { runsOf, runStep, stopStep, stopStepRuns } from './prototype-run.js'
import { mainStatus, startMain, stopMain, stopMains, type MainData } from './main-running.js'
/** What a task's main is to run on, from the page's choice: ?data=copy|shared and ?beside=prototype:<id> or smoke:<task id>[:<set-up>]. Left out: as it was. */
async function mainDataOf(mode?: string, beside?: string): Promise<MainData | undefined> {
  if ((mode !== 'copy' && mode !== 'shared') || !beside) return undefined
  const [kind, id, setup] = beside.split(':')
  if (kind === 'prototype' && id) { const d = await (await import('./prototype.js')).prototypeDataOf(id); return { mode, beside: d.beside, slug: d.slug } }
  if (kind === 'smoke' && id) { const t = await resolveIssue(db, id); const d = await (await import('./smoke.js')).smokeDataOf(t.id, setup); return { mode, beside: d.beside, slug: d.slug, cmd: d.cmd, stop: d.stop, env: d.env } }
  return undefined
}
import { discardPrototype, listPrototypes, prototypeStatus, resetPrototypeData, runPrototype, savePrototypeData, startPrototype, stopPrototype, stopPrototypes, talkFor } from './prototype.js'
import { answerQuestion, finishPlanning, preparePlanning, recoverPlanning } from './planner.js'
import { activeApps, appHolds, bringBack, deleteForGood, putAway, putAwayApps } from './apps.js'
import { addIssue, addSubIssues, appGraph, clearSubIssues, createProject, issueDetail, listCodeIssues, listProjects, PlanError, projectGraph, setBuildStatus, tick } from './projects.js'
import { requirementsOf } from './requirements.js'
import { patchSetup } from './setup.js'
import { setHeld } from './probes.js'
import { endStrayTrials, pastTasks, startTrial, trialsOf } from './trials.js'
import { nightlyView } from './nightly.js'
import { diffsOf, hasLegacy, type HeldChange } from './held.js'
import { autoBuild } from './branches.js'
import { runner } from './runner.js'
import { homeRepo, inOrder } from './workbench.js'
import { chooseFolder } from './folders.js'
import { deleteIssue } from './delete-issue.js'
import { addAsset, listAssets, removeAsset, updateAsset } from './assets.js'
import { importTickets, linearTickets, type Scope } from './linear-import.js'
import { originOf, originView } from './origins.js'
import { accountStatus, cleanAccount } from './account.js'
import { pullSkills, removeSkillSource, skillSources } from './skill-sources.js'
import { outsidePr, pr as prRows } from './db/schema.js'
import { dropSecret, envFor, keepSecret, keptAs, moveSecrets, SecretError } from './secrets.js'
import { checkIntegration, cleanValues, effectiveIntegrations, IntegrationError, INTEGRATIONS, setupIntegration, statuses, type Local, type SetupResult, type Values } from './integrations.js'
import { contextFor, delegateFor, trackerGuide } from './tkt.js'
import { linearFor } from './linear-home.js'
import { CATALOGUE } from './catalogue.js'
import { removeData, renameData, saveData, setDefaultData } from './mock-data.js'
import { placesTable, setChoice, type Choice } from './mock-places.js'
import { addCall, addTaskService, clearCalls, coverCall, editCall, linkCall, listCalls, listTaskServices, removeCall, removeTaskService, type NewCall } from './task-calls.js'
import { assignFixture, mapFromFile, canMakeFixture, deleteFixture, fixtureForTask, fixtureRows, fixtureSample, listFixtures, makeFixtureFromSeed, renameFixture } from './fixtures.js'
import { addTestFile, editTestFile, listTestFiles, removeTestFile, testFilePath } from './test-files.js'
import { fakeEndpoint, giveEndpointData, removeEndpointData, setEndpointFaked } from './mock-serve.js'
import { addEndpoint, editEndpoint, listReal, mockHistory, recordingsFor, removeReal, rowOf } from './mocks.js'
import { exportMock, getMock, giveRecording, listMocks, addService, needsRecording, recordingsOfService, removeMock, setMockDetails, type Needs } from './mocks.js'
import { appSkills, describePlugins, fileSkill, forgetPlugin, installed, installPlugin, pluginOn, removePlugin, ROLES, type AppPlugins, type FactorySettings, type Role, cleanJobs, cleanStepSkills, describeJobs, usableSkills, writeSharedSkill, type AppJobs } from './skills.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

const planError = (c: any, err: unknown, status = 400) => {
  if (err instanceof PlanError) return c.json({ error: err.message }, status)
  throw err
}

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Evident',
    model: 'Shaped like Linear: initiative (a goal) → project (tasks in order, one branch, one PR) → task (Linear\'s issue: the routes and ids say issue; code, or a to-do; HG-12) → sub-task (under code: one agent, one worktree, one commit, its build; under a to-do: a checklist line) → step (the builder\'s todo list). Cycles hold the tasks of a stretch of time.',
    routes: {
      'GET /health': 'database reachable?', 'POST /devices/serve': 'put the page on the Tailscale network (this computer\'s page only); the same answer as GET /devices, plus enable (a page on Tailscale) when the account must allow serving first', 'POST /devices/serve/stop': 'take it off again', 'GET /devices': '{tailscale: missing | off | ready, address, remote, devices} — the page\'s address on the Tailscale network (null when not served), whether the one asking came over it, and the other devices with the page open: ip, name, kind (phone | computer), since',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, key?, defaultBranch?, setup?}', 'POST /repos': '{appId, fullName, localPath?, baseBranch?}',
      'GET /apps': 'the apps in use, each with its repos; ?removed=1: the ones put away, with what each holds', 'POST /apps/:id/remove': 'put it away: out of every list, nothing of it runs, can be brought back', 'POST /apps/:id/restore': 'bring a put-away app back', 'DELETE /apps/:id': '{name}: delete a put-away app and every row of it, for good', 'PATCH /apps/:id': '{name?, defaultBranch?, setup?}', 'PATCH /repos/:id': '{fullName?, localPath?, baseBranch?}', 'DELETE /repos/:id': 'the repository leaves the app', 'GET /skills/sources': 'the repositories skills were pulled from', 'POST /skills/sources': '{url} → pulls that repository\'s skills into the shared skills, or brings them up to date: {source, added, updated, unchanged, removed, skipped}', 'DELETE /skills/sources?url=': 'stops pulling from it and removes its skills', 'POST /skills/shared': '{name, description, body} → one of your own skills, for every app (a SKILL.md outside every repo)', 'GET /apps/:id/account': 'which Claude account the app\'s agents run on: {kind: default|key|login, ok, note}', 'GET /apps/:id/linear/tickets?scope=mine|unassigned|all': 'the Linear team\'s open tickets, each with the task or idea it already is here', 'POST /apps/:id/linear/import': '{identifiers: ["ENG-12"], as?: idea|task} → each ticket an idea (or a task) here: {made, updated, missing}', 'GET /apps/:id/assets?project=': 'the app\'s assets, or one project\'s own', 'POST /assets': '{appId, projectId?, name, location, note?}', 'PATCH /assets/:id': '{name?, location?, note?}', 'DELETE /assets/:id': 'removes it',  'POST /folders/choose': '{path?} → {path, repos: [{name, path, fullName, branch}]}; no path opens the folder dialog', 'GET /workspaces': 'all workspaces',
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
  // The other devices with the page open (a phone, over Tailscale); the one asking is left out.
  api.get('/devices', async (c) => { const from = remoteIp((n) => c.req.header(n)); return c.json({ ...(await phoneState()), remote: !!from, devices: devicesHere(from) }) })
  // Put the page on the private network, or take it off: from the page on this computer only, never from the phone.
  const local = (c: { req: { header: (n: string) => string | undefined; method: string } }) => ownPage({ origin: c.req.header('origin'), site: c.req.header('sec-fetch-site'), contentType: c.req.header('content-type'), method: c.req.method }) && !remoteIp((n) => c.req.header(n))
  api.post('/devices/serve', async (c) => (local(c) ? c.json({ ...(await servePhone()), remote: false, devices: devicesHere() }) : c.json({ error: 'only from the page on this computer' }, 403)))
  api.post('/devices/serve/stop', async (c) => (local(c) ? c.json({ ...(await stopPhone()), remote: false, devices: devicesHere() }) : c.json({ error: 'only from the page on this computer' }, 403)))
  api.get('/now', async (c) => { const a = c.req.query('app'); return a ? c.json({ ...(await now(a)), hold: runner.hold }) : c.json({ error: 'app is required: one app at a time' }, 400) }) // the front door: running, needs you, recent

  api.post('/workspaces', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    const [row] = await db.insert(workspace).values({ id: newId('workspace'), name }).returning()
    return c.json(row, 201)
  })

  api.get('/workspaces', async (c) => c.json(await db.select().from(workspace)))

  // Apps carry their repos; setup is the whole object (test_cmd, model, max_budget_usd, max_turns, …).
  api.get('/apps', async (c) => {
    if (c.req.query('removed') === '1') return c.json(await Promise.all((await putAwayApps()).map((a) => appHolds(a.id)))) // Settings: the ones put away, with what each holds
    const [apps, repos] = await Promise.all([activeApps(), db.select().from(repoTable)])
    return c.json(apps.map((a) => ({ ...a, repos: inOrder(repos.filter((r) => r.appId === a.id), a.setup) }))) // home first (workbench.ts)
  })
  // Removing an app (apps.ts): put away first, which can be undone; a put-away app can be deleted for good with its name typed.
  const putAwayDeps = { busy: busyAmong, release: releaseTalks, pauseProject: (id: string) => runner.pauseProject(id), stopPrototype: (id: string) => stopPrototype(id, 'engine'), stopStorybookAt }
  // Learn, the codebase half (learn.ts): the documents an agent wrote from reading the code, and the press that starts it.
  api.get('/apps/:id/learning', async (c) => { try { return c.json(await listLearning(c.req.param('id'), talkBusy)) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/learn', async (c) => { try { return c.json(await startLearning(c.req.param('id'), 'user'), 202) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/holds', async (c) => { try { return c.json(await appHolds(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/remove', async (c) => { try { return c.json(await putAway(c.req.param('id'), putAwayDeps)) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/restore', async (c) => { try { return c.json(await bringBack(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id', async (c) => { try { return c.json(await deleteForGood(c.req.param('id'), (await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }))).name ?? '')) } catch (err) { return planError(c, err) } })
  // Settings: the workspace's integrations, plugins and the jobs their skills cover; an app's own view is the merge,
  // plus its repo's skills.
  // For each integration with a key: whether it is set and where from (the app's file, the shared one, the environment), never the key (secrets.ts).
  const keysOf = async (values: (key: string) => Record<string, string | { value: string | null } | null | undefined> | undefined, appKey?: string) => Object.fromEntries((await Promise.all(INTEGRATIONS.map(async (i) => {
    const field = i.fields.find((x) => x.secret); const v = field ? values(i.key)?.[field.key] : null
    return [i.key, await keptAs(typeof v === 'string' ? v : v?.value, appKey)] as const
  }))).filter(([, k]) => k))
  api.put('/secrets/:name', async (c) => { // {value, appId?}: keep a key in the app's file, or the shared one with no app. Never read back.
    const body = await c.req.json<{ value?: string; appId?: string }>().catch(() => ({} as { value?: string; appId?: string }))
    const [a] = body.appId ? await db.select().from(appTable).where(eq(appTable.id, body.appId)) : []
    if (body.appId && !a) return c.json({ error: 'no such app' }, 404)
    try { return c.json(await keepSecret(c.req.param('name'), body.value ?? '', a?.key)) } catch (err) { if (err instanceof SecretError) return c.json({ error: err.message }, 400); throw err }
  })
  api.delete('/secrets/:name', async (c) => {
    const appId = c.req.query('app')
    const [a] = appId ? await db.select().from(appTable).where(eq(appTable.id, appId)) : []
    if (appId && !a) return c.json({ error: 'no such app' }, 404)
    return c.json(await dropSecret(c.req.param('name'), a?.key))
  })
  api.get('/settings', async (c) => {
    const [w] = await db.select().from(workspace).limit(1)
    const f = (w?.settings ?? {}) as FactorySettings & { integrations?: Values }
    return c.json({ workspace: w ?? null, integrations: INTEGRATIONS, values: f.integrations ?? {}, status: statuses(f.integrations ?? {}, await envFor()), keys: await keysOf((k) => f.integrations?.[k]), plugins: describePlugins(f), catalogue: CATALOGUE })
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
    return c.json({ integrations, status: statuses(integrations, await envFor(a.key)), keys: await keysOf((k) => integrations[k], a.key), plugins, jobs: describeJobs(f, setup.skills_by_job), usable: await usableSkills(a.id, r?.localPath), skills: r?.localPath ? appSkills(r.localPath) : [] })
  })
  // Tries an integration's saved connection: the workspace's values, or an app's with its overrides.
  // An integration's effective values for an app (or the workspace's), and what its per-app check needs from the app.
  // tkt's context for an app, with its Linear team when the app's tickets live there (tkt's own switch).
  const tktContext = async (appId: string, shared: Values, own: Values) => {
    const ctx = await contextFor(appId)
    if (!ctx) return null
    const eff = effectiveIntegrations(shared, own)
    if (eff.tkt?.linear?.value !== 'true') return ctx
    const [own_] = await db.select({ key: appTable.key }).from(appTable).where(eq(appTable.id, appId))
    return { ...ctx, ...(await linearFor({ team: eff.linear?.team?.value, key_env: eff.linear?.key_env?.value }, await envFor(own_?.key))) }
  }
  const integrationFor = async (key: string, appId?: string): Promise<{ values: Record<string, string | null>; local?: Local; env: Record<string, string | undefined> } | null> => {
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
    const env = await envFor(a?.key) // the keys kept for this app, over the shared ones, over the engine's environment
    let local: Local | undefined
    if (key === 'tkt' && appId) { const ctx = await tktContext(appId, shared, own); if (ctx) local = { tkt: { ctx } } }
    if (key === 'storybook' && a) {
      const [r] = await db.select().from(repoTable).where(eq(repoTable.appId, a.id))
      const v = await storybookValues({ integrations: { storybook: Object.fromEntries(Object.entries(values).filter(([, x]) => x != null)) } }, r?.localPath ?? null) // the app's values, else the repo's defaults
      local = { storybook: { ctx: { app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch ?? undefined }, repoPath: r?.localPath ?? null, url: v.url, cmd: v.cmd, outside: v.outside } } }
    }
    return { values, local, env }
  }
  api.post('/integrations/:key/check', async (c) => {
    const body = await c.req.json<{ appId?: string }>().catch(() => ({} as { appId?: string }))
    const found = await integrationFor(c.req.param('key'), body.appId)
    if (!found) return c.json({ error: 'no such app' }, 404)
    try { return c.json(await checkIntegration(c.req.param('key'), found.values, found.env, fetch, found.local)) } catch (err) {
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
          const r = await setupIntegration(key, found.values, found.env, found.local)
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
    // `setup` is the settings that change, not all of them: a key with a value is set, one with null is removed, the rest stay (setup.ts).
    // `held` is changes to what a build is held to (held.ts), applied in order to the list as it is now.
    const body = await c.req.json<{ name?: string; key?: string; defaultBranch?: string; setup?: Record<string, unknown>; held?: HeldChange[] }>()
    // Its abbreviation can be changed after it is made: every task's name follows at once (MER-50 becomes BON-50),
    // since a task's name is the abbreviation and its number. What was already written elsewhere keeps the old one:
    // branch names, pull request titles, text in comments and briefs.
    let key: string | undefined
    if (body.key !== undefined) {
      try { key = cleanKey(body.key) } catch (err) { return c.json({ error: (err as Error).message }, 400) }
      const [me] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
      if (!me) return c.json({ error: 'no such app' }, 404)
      const taken = (await activeApps()).filter((r) => r.workspaceId === me.workspaceId && r.id !== me.id).map((r) => r.key) // a put-away app's abbreviation is free
      if (taken.includes(key)) return c.json({ error: `the abbreviation ${key} is another app's` }, 400)
    }
    if (body.setup?.integrations != null) body.setup.integrations = cleanValues(body.setup.integrations)
    if (body.setup?.account != null) { try { const acct = cleanAccount(body.setup.account); body.setup.account = acct ?? null } catch (err) { return planError(c, err) } }
    if (body.setup && 'step_skills' in body.setup) { const steps = cleanStepSkills(body.setup.step_skills); body.setup.step_skills = Object.keys(steps).length ? steps : null }
    if (body.setup?.skills_by_job != null) { // an app's own skill per job; absent inherits
      const [of] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
      const [w] = of ? await db.select().from(workspace).where(eq(workspace.id, of.workspaceId)) : []
      const jobs = cleanJobs(body.setup.skills_by_job, (w?.settings ?? {}) as FactorySettings, installed())
      body.setup.skills_by_job = Object.keys(jobs).length ? jobs : null
    }
    if (body.setup?.references != null) body.setup.references = cleanReferences(body.setup.references, c.req.param('id'))
    if (body.setup?.plugins != null) { // an app's own switch per plugin; null inherits
      const known = new Set(installed().map((p) => p.id))
      body.setup.plugins = Object.fromEntries(Object.entries((body.setup.plugins ?? {}) as Record<string, { on?: unknown } | null>)
        .filter(([id, v]) => known.has(id) && typeof v?.on === 'boolean').map(([id, v]) => [id, { on: v!.on }]))
    }
    const [was] = key ? await db.select({ key: appTable.key }).from(appTable).where(eq(appTable.id, c.req.param('id'))) : []
    if (body.setup) for (const k of ['held', 'requirements', 'probes', 'requirements_added']) delete body.setup[k] // what a build is held to is changed by `held`, a change at a time
    if (body.held?.length) { try { await setHeld(c.req.param('id'), body.held) } catch { return c.json({ error: 'no such app' }, 404) } }
    if (body.setup && Object.keys(body.setup).length) { try { await patchSetup(c.req.param('id'), body.setup) } catch { return c.json({ error: 'no such app' }, 404) } }
    const fields = { ...(body.name ? { name: body.name } : {}), ...(key ? { key } : {}), ...(body.defaultBranch ? { defaultBranch: body.defaultBranch } : {}) }
    const [row] = Object.keys(fields).length ? await db.update(appTable).set(fields).where(eq(appTable.id, c.req.param('id'))).returning() : await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
    if (key && was && was.key !== key) await moveSecrets(was.key, key).catch((err) => console.error(`secrets: could not follow ${was.key} to ${key}`, err)) // its kept keys go with its key
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
    const taken = (await activeApps()).filter((r) => r.workspaceId === body.workspaceId).map((r) => r.key) // a put-away app's abbreviation is free
    let key: string
    try { key = body.key?.trim() ? cleanKey(body.key) : appKey(body.name, taken) } catch (err) { return c.json({ error: (err as Error).message }, 400) }
    if (taken.includes(key)) return c.json({ error: `the abbreviation ${key} is another app's` }, 400)
    // The code, when it is given at creation: the checkout is made ready before the app exists, so a refusal leaves nothing half-made.
    const fullName = body.repo?.fullName?.trim() ?? ''
    const localPath = body.repo?.localPath?.trim() || null
    let branch = body.defaultBranch?.trim() || 'main'
    let note: string | null = null
    if (localPath) { try { const p = await prepareCheckout(localPath, branch, body.name); branch = p.branch; note = p.note } catch (err) { return planError(c, err) } }
    const row = await db.transaction(async (tx) => { // with its default workflow: an app always has one
      const [made] = await tx.insert(appTable).values({ id: newId('app'), workspaceId: body.workspaceId, name: body.name, key, defaultBranch: branch, setup: body.setup ?? {} }).returning()
      const repos = fullName || localPath ? await tx.insert(repoTable).values({ id: newId('repo'), appId: made.id, fullName, localPath }).returning() : []
      await createDefaultWorkflow(tx, made.id)
      await ensureMain({ tx, appId: made.id }) // Main, built in one go, is its default; what createDefaultWorkflow made is its Legacy
      const [now] = await tx.select({ workflowId: appTable.workflowId }).from(appTable).where(eq(appTable.id, made.id))
      return { ...made, repos, workflowId: now.workflowId, note }
    })
    return c.json(row, 201)
  })
  // ?session=: the conversation the person is in; its worktree's Storybook when it has one, else the app's.
  api.get('/apps/:id/storybook', async (c) => { try { return c.json(await storybookStatus(c.req.param('id'), c.req.query('session'), c.req.query('story'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/storybook/start', async (c) => { try { return c.json(await startStorybook(c.req.param('id'), c.req.query('session'))) } catch (err) { return planError(c, err) } })
  // Screens: the stories under Screens/ in the Storybook of the conversation's worktree (?session=), else the app's; ?all=1 with earlier tasks' ones.
  // The app's mocks (mocks.ts): Settings › Mocks.
  api.get('/apps/:id/mocks', async (c) => { try { return c.json(await listMocks(c.req.param('id'), c.req.query('issue') || null)) } catch (err) { return planError(c, err, 404) } })
  api.get('/apps/:id/mocks/:key', async (c) => { try { return c.json(await getMock(c.req.param('id'), c.req.param('key'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/mocks', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { name?: string; standsInFor?: string; upstream?: string; env?: Record<string, string>; issueId?: string; needs?: Needs ; addressSetting?: string | null; keySetting?: string | null }; return c.json(await addService(c.req.param('id'), { name: String(b.name ?? ''), standsInFor: b.standsInFor, upstream: b.upstream, env: b.env, addressSetting: b.addressSetting, keySetting: b.keySetting, issueId: b.issueId ?? null, why: b.needs?.why }, 'user'), 201) } catch (err) { return planError(c, err) } })
  api.patch('/apps/:id/mocks/:key', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { name?: string; standsInFor?: string; upstream?: string | null; env?: Record<string, string>; addressSetting?: string | null; keySetting?: string | null }; return c.json(await setMockDetails(c.req.param('id'), c.req.param('key'), b, 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/mocks/:key', async (c) => { try { return c.json(await removeMock(c.req.param('id'), c.req.param('key'), 'user', { files: c.req.query('files') === '1' })) } catch (err) { return planError(c, err) } })
  // What can be changed or taken away on a mock, piece by piece: its real responses on this computer, an endpoint, a data set's name.
  api.get('/apps/:id/mocks/:key/real', async (c) => { try { return c.json(await listReal(c.req.param('id'), c.req.param('key'))) } catch (err) { return planError(c, err, 404) } })
  api.delete('/apps/:id/mocks/:key/real', async (c) => { try { return c.json(await removeReal(c.req.param('id'), c.req.param('key'), c.req.query('id') ?? '', 'user')) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/mocks/:key/endpoints', async (c) => { try { return c.json(await addEndpoint(c.req.param('id'), c.req.param('key'), await c.req.json().catch(() => ({})), 'user'), 201) } catch (err) { return planError(c, err) } })
  // One endpoint's data (mock-serve.ts): the app's, or (issueId) one task's own in place of it. real: a response the service sent; otherwise the person states it holds nothing real.
  api.post('/apps/:id/mocks/:key/endpoints/:endpoint/data', async (c) => { try {
    const appId = c.req.param('id'), key = c.req.param('key')
    const body = await c.req.parseBody({ all: true })
    const given = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
    const r = await giveEndpointData(appId, key, c.req.param('endpoint'), await Promise.all(given.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), { real: body.real === 'true', issueId: typeof body.issueId === 'string' && body.issueId ? body.issueId : null }, 'user')
    if (r.kept === 'recorded' && r.issueId) await askToMine(r.issueId, key, r.dir, r.files)
    return c.json({ kept: r.kept, asked: r.kept === 'recorded' ? r.issueId : null, ...('maybeStructure' in r ? { maybeStructure: r.maybeStructure } : {}) }, 201)
  } catch (err) { return planError(c, err) } })
  // Test files (test-files.ts): what a person needs in their hands to try a change. The app's, and a task's own.
  api.get('/apps/:id/test-files', async (c) => { try { return c.json(await listTestFiles(c.req.param('id'), c.req.query('issue') || null)) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/test-files', async (c) => { try {
    const body = await c.req.parseBody({ all: true })
    const given = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
    if (!given.length) throw new PlanError('choose a file')
    const o = { what: typeof body.what === 'string' ? body.what : '', issueId: typeof body.issueId === 'string' && body.issueId ? body.issueId : null, stated: body.stated === 'true', real: body.real === 'true' }
    const out = []
    for (const f of given) out.push(await addTestFile(c.req.param('id'), { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mediaType: f.type, ...o }, 'user'))
    return c.json(out, 201)
  } catch (err) { return planError(c, err) } })
  api.patch('/apps/:id/test-files/:file', async (c) => { try { return c.json(await editTestFile(c.req.param('id'), c.req.param('file'), await c.req.json().catch(() => ({})), 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/test-files/:file', async (c) => { try { return c.json(await removeTestFile(c.req.param('id'), c.req.param('file'), 'user')) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/test-files/:file/file', async (c) => { try {
    const v = c.req.query('version')
    const f = await testFilePath(c.req.param('id'), c.req.param('file'), v === 'real' || v === 'fake' ? v : undefined)
    // A picture is shown in the page; anything else is handed over as a file to keep. Never run as a page of ours.
    const inline = /^image\/(png|jpeg|gif|webp)$/.test(f.mediaType) && c.req.query('show') === '1'
    return new Response(await readFile(f.path), { headers: { 'content-type': inline ? f.mediaType : 'application/octet-stream', 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`, 'x-content-type-options': 'nosniff' } })
  } catch (err) { return planError(c, err, 404) } })
  // Fixtures (fixtures.ts): the app's shared scenarios, a table's rows to pick a person from, and an endpoint's data made for one of them.
  api.get('/apps/:id/fixtures', async (c) => { try { const issueId = c.req.query('issue') || null; return c.json({ fixtures: await listFixtures(c.req.param('id')), used: await fixtureForTask(c.req.param('id'), issueId), make: await canMakeFixture(c.req.param('id')) }) } catch (err) { return planError(c, err, 404) } })
  // Made from the app's seed (minutes: its schema and seed commands run), looked into, renamed, deleted.
  api.post('/apps/:id/fixtures', async (c) => { const b = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string })); try { return c.json(await makeFixtureFromSeed(c.req.param('id'), b.name?.trim() || undefined)) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/fixtures/:name/:table/rows', async (c) => { try { return c.json(await fixtureSample(c.req.param('id'), c.req.param('name'), c.req.param('table'))) } catch (err) { return planError(c, err, 404) } })
  api.patch('/apps/:id/fixtures/:name', async (c) => { const b = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string })); try { return c.json(await renameFixture(c.req.param('id'), c.req.param('name'), b.name?.trim() ?? '')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/fixtures/:name', async (c) => { try { return c.json(await deleteFixture(c.req.param('id'), c.req.param('name'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/fixtures/:name/:table', async (c) => { try { return c.json(await fixtureRows(c.req.param('id'), c.req.param('name'), c.req.param('table'))) } catch (err) { return planError(c, err, 404) } })
  api.put('/apps/:id/mocks/:key/endpoints/:endpoint/fixture', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { fixture?: string; table?: string; row?: number; count?: number; map?: Record<string, string>; issueId?: string | null }; return c.json(await assignFixture(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), { fixture: String(b.fixture ?? ''), table: String(b.table ?? ''), row: b.row, count: b.count, map: b.map ?? {} }, b.issueId || null, 'user')) } catch (err) { return planError(c, err) } })
  // Fields of an endpoint's data mapped from a file of the fixtures (mock-file-map.ts). file null: no longer.
  api.put('/apps/:id/mocks/:key/endpoints/:endpoint/file-map', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { file?: string | null; map?: Record<string, string>; issueId?: string | null }; return c.json(await mapFromFile(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), { file: b.file || null, map: b.map ?? {} }, b.issueId || null, 'user')) } catch (err) { return planError(c, err) } })
  // The saved real response of one endpoint, faked now.
  api.post('/apps/:id/mocks/:key/endpoints/:endpoint/fake', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { issueId?: string | null }; return c.json(await fakeEndpoint(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), b.issueId || null, 'user')) } catch (err) { return planError(c, err) } })
  api.put('/apps/:id/mocks/:key/endpoints/:endpoint/faked', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { faked?: boolean | null; issueId?: string | null }; return c.json(await setEndpointFaked(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), b.faked ?? null, b.issueId || null, 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/mocks/:key/endpoints/:endpoint/data', async (c) => { try { return c.json(await removeEndpointData(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), { issueId: c.req.query('issue') || null, real: c.req.query('real') === '1' }, 'user')) } catch (err) { return planError(c, err) } })
  api.patch('/apps/:id/mocks/:key/endpoints/:endpoint', async (c) => { try { return c.json(await editEndpoint(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), await c.req.json().catch(() => ({})), 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/mocks/:key/endpoints/:endpoint', async (c) => { try { return c.json(await editEndpoint(c.req.param('id'), c.req.param('key'), c.req.param('endpoint'), null, 'user')) } catch (err) { return planError(c, err) } })
  api.patch('/apps/:id/mocks/:key/data/:data', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { name?: string }; return c.json(await renameData(c.req.param('id'), c.req.param('key'), c.req.param('data'), String(b.name ?? ''), 'user')) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/mocks/:key/mine', async (c) => { try {
    const appId = c.req.param('id'), m = await getMock(appId, c.req.param('key'))
    const row = await rowOf(appId, m.key)
    const newest = row ? recordingsFor(row)[0] : undefined // its own: never one left by a mock that was removed
    if (!newest) return c.json({ error: `${m.name} has no recording yet: make a live smoke run of a task that calls it` }, 409)
    if (!newest.issueId) return c.json({ error: `the newest recording of ${m.name} is not a task's, so there is no task agent to mine it` }, 409)
    await askToMine(newest.issueId, m.key, newest.dir, newest.files)
    return c.json({ asked: newest.issueId }, 202)
  } catch (err) { return planError(c, err) } })
  // Real responses the person already has (a saved JSON, the results CSV), given instead of a live run: kept with the task, then mined by its agent.
  api.post('/apps/:id/mocks/:key/recording', async (c) => { try {
    const appId = c.req.param('id'), key = c.req.param('key')
    const body = await c.req.parseBody({ all: true })
    const given = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
    const r = await giveRecording(appId, key, await Promise.all(given.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), 'user', typeof body.endpoint === 'string' && body.endpoint ? body.endpoint : null)
    if (r.issueId) await askToMine(r.issueId, key, r.dir, r.files.length)
    return c.json({ files: r.files, asked: r.issueId }, 201)
  } catch (err) { return planError(c, err) } })
  // What a task calls outside the app (task-calls.ts): its Data step starts from these.
  // The services a task calls, each one of the app's (set up in its settings), with the task's calls of it.
  api.get('/issues/:id/services', async (c) => { try { return c.json(await listTaskServices(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/issues/:id/services', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { service?: string }; return c.json(await addTaskService(c.req.param('id'), String(b.service ?? ''), 'user'), 201) } catch (err) { return planError(c, err) } })
  api.delete('/issues/:id/services/:service', async (c) => { try { return c.json(await removeTaskService(c.req.param('id'), c.req.param('service'), 'user')) } catch (err) { return planError(c, err) } })
  api.get('/issues/:id/calls', async (c) => { try { return c.json(await listCalls(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/issues/:id/calls', async (c) => { try { return c.json(await addCall(c.req.param('id'), await c.req.json() as NewCall, 'user'), 201) } catch (err) { return planError(c, err) } })
  api.delete('/issues/:id/calls', async (c) => { try { return c.json(await clearCalls(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) } })
  api.patch('/issues/:id/calls/:call', async (c) => { try { return c.json(await editCall(c.req.param('id'), c.req.param('call'), await c.req.json().catch(() => ({})) as Partial<NewCall>, 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/issues/:id/calls/:call', async (c) => { try { return c.json(await removeCall(c.req.param('id'), c.req.param('call'), 'user')) } catch (err) { return planError(c, err) } })
  api.put('/issues/:id/calls/:call/endpoint', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { endpoint?: string | null }; return c.json(await linkCall(c.req.param('id'), c.req.param('call'), b.endpoint || null, 'user')) } catch (err) { return planError(c, err) } })
  // Something to answer it: the service's mock made if it has none, and the call added to the mock if it lacks it.
  api.post('/issues/:id/calls/:call/cover', async (c) => { try { return c.json(await coverCall(c.req.param('id'), c.req.param('call'), 'user')) } catch (err) { return planError(c, err) } })
  // Where each mock's data comes from, place by place (mock-places.ts): the app's defaults, or (?issue=) a task's.
  api.get('/apps/:id/mock-places', async (c) => { try { return c.json(await placesTable(c.req.param('id'), c.req.query('issue') || null)) } catch (err) { return planError(c, err, 404) } })
  api.put('/apps/:id/mocks/:key/places/:place', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { source?: string; data?: string; issueId?: string | null }; return c.json(await setChoice(c.req.param('id'), c.req.param('key'), c.req.param('place'), b.source ? { source: b.source, data: b.data } as Choice : null, b.issueId || null, 'user')) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/mocks/:key/history', async (c) => { try { return c.json(await mockHistory(c.req.param('id'), c.req.param('key'))) } catch (err) { return planError(c, err, 404) } })
  // Data a person provides and states holds nothing real (a sample written by hand): kept as invented. A file that may hold real data goes to /recording instead, and is faked.
  api.post('/apps/:id/mocks/:key/data', async (c) => { try {
    const body = await c.req.parseBody({ all: true })
    const given = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
    if (body.stated !== 'yes') return c.json({ error: 'a file is kept as invented data only when you state it holds nothing real; one that may hold real data is given as a real response, and faked' }, 400)
    const files: Record<string, string> = {}
    for (const f of given) { const bytes = new Uint8Array(await f.arrayBuffer()); if (bytes.includes(0)) return c.json({ error: `${f.name} is not text` }, 400); files[f.name.split(/[\\/]/).pop() || 'data.txt'] = new TextDecoder().decode(bytes) }
    const name = String(body.name ?? '').trim() || (given[0]?.name ?? 'provided')
    return c.json(await saveData(c.req.param('id'), c.req.param('key'), { dataKey: name, name, files, stated: true, issueId: typeof body.issueId === 'string' && body.issueId ? body.issueId : null }, 'user'), 201)
  } catch (err) { return planError(c, err) } })
  // A mock's data (mock-data.ts): which it serves by default, and removing a set. Making one is an agent's (the mock_data tool).
  api.put('/apps/:id/mocks/:key/data/default', async (c) => { try { const b = await c.req.json().catch(() => ({})) as { data?: string | null }; return c.json(await setDefaultData(c.req.param('id'), c.req.param('key'), b.data || null, 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/mocks/:key/data/:data', async (c) => { try { return c.json(await removeData(c.req.param('id'), c.req.param('key'), c.req.param('data'), 'user')) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/mocks/:key/export', async (c) => { try {
    const appId = c.req.param('id'), key = c.req.param('key')
    const dir = await mkdtemp(join(tmpdir(), 'mock-export-'))
    try {
      await exportMock(appId, key, join(dir, key))
      const file = join(dir, `${key}.tar.gz`)
      await new Promise<void>((done, fail) => { const p = spawn('tar', ['-czf', file, '-C', dir, key]); p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`tar exited with ${code}`)))); p.on('error', fail) })
      return new Response(await readFile(file), { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${key}-mock.tar.gz"` } })
    } finally { await rm(dir, { recursive: true, force: true }) }
  } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/screens', async (c) => { try { return c.json(await listScreens(c.req.param('id'), c.req.query('session'), { all: c.req.query('all') === '1' })) } catch (err) { return planError(c, err, 404) } })
  // Sketches: the HTML files under sketches/ in a conversation's worktree (scope: its id) or the app's checkout (scope: the app's id).
  api.get('/sketches/:scope', async (c) => { try { return c.json(await listSketches(c.req.param('scope'), { all: c.req.query('all') === '1' })) } catch (err) { return planError(c, err, 404) } })
  api.get('/sketches/:scope/file/*', async (c) => {
    const scope = c.req.param('scope')
    const file = decodeURIComponent(c.req.path.split(`/sketches/${scope}/file/`)[1] ?? '')
    const found = await readSketch(scope, file).catch(() => null)
    return found ? c.body(new Uint8Array(found.body), 200, found.headers) : c.text('No such sketch.', 404)
  })
  api.get('/storybook/story-flow.css', (c) => c.text(STORY_FLOW_CSS, 200, { 'content-type': 'text/css; charset=utf-8' })) // step 4 of "Set up the screen map"
  api.get('/apps/:id/prototypes', async (c) => c.json(await listPrototypes(c.req.param('id'))))
  api.post('/apps/:id/prototypes', async (c) => {
    const body = await c.req.json<{ title?: string; brief?: string; projectId?: string; depth?: 'full' | 'rough' }>()
    if (!body.title?.trim()) return c.json({ error: 'a prototype needs a title' }, 400)
    try { return c.json(await startPrototype({ appId: c.req.param('id'), title: body.title.trim(), brief: body.brief, projectId: body.projectId, depth: body.depth }), 201) } catch (err) { return planError(c, err) }
  })
  // A view of something running on this computer, through a proxy that lets it say where it is (frame-proxy.ts).
  api.get('/frame', async (c) => { const frame = await frameFor(c.req.query('url') ?? '').catch(() => null); return c.json({ frame }) })
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
  // A step of its guide that is a command (prototype-run.ts): run it, stop it, and what each step last printed.
  api.get('/prototypes/:id/runs', (c) => c.json(runsOf(c.req.param('id'))))
  api.post('/prototypes/:id/guide/:step/run', async (c) => { try { return c.json(await runStep(c.req.param('id'), Number(c.req.param('step')))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/guide/:step/stop', (c) => { try { return c.json(stopStep(c.req.param('id'), Number(c.req.param('step')))) } catch (err) { return planError(c, err) } })
  api.post('/prototypes/:id/talk', async (c) => { try { return c.json(await talkFor(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  // The app's main, running (main-running.ts): turned on and off by the person; a look at it (touch=1) keeps it from turning itself off.
  // ?for=<task or prototype id>: the main that piece of work has of its own for comparing, not the app's.
  api.get('/apps/:id/main', async (c) => { try { return c.json(await mainStatus(c.req.param('id'), c.req.query('touch') === '1', c.req.query('for'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/main/start', async (c) => { try { return c.json(await startMain(c.req.param('id'), 'person', { update: c.req.query('update') === '1', for: c.req.query('for'), data: await mainDataOf(c.req.query('data'), c.req.query('beside')) })) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/main/stop', async (c) => { try { return c.json(await stopMain(c.req.param('id'), 'person', undefined, c.req.query('for'))) } catch (err) { return planError(c, err) } })
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
  const envOfApp = async (appId: string) => { const [a] = await db.select({ key: appTable.key }).from(appTable).where(eq(appTable.id, appId)); return envFor(a?.key) }
  // Linear tickets brought in (linear-import.ts): the team's open tickets for the app, and bringing the ticked ones in as ideas (or, from a project's Add tasks, as tasks). Reads Linear, never writes.
  // Which Claude account this app's agents run on (account.ts): the engine's default, or the app's own key or login.
  api.get('/apps/:id/account', async (c) => {
    const [a] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id')))
    return a ? c.json(await accountStatus(a.setup)) : c.json({ error: 'no such app' }, 404)
  })
  api.get('/apps/:id/linear/tickets', async (c) => {
    const scope = (['mine', 'unassigned', 'all'] as Scope[]).find((s) => s === c.req.query('scope')) ?? 'mine'
    try { return c.json(await linearTickets(c.req.param('id'), scope, await envOfApp(c.req.param('id')))) } catch (err) { return planError(c, err) }
  })
  api.post('/apps/:id/linear/import', async (c) => {
    const body = await c.req.json<{ identifiers?: string[]; as?: string }>().catch(() => ({} as { identifiers?: string[]; as?: string }))
    try { return c.json(await importTickets(c.req.param('id'), body.identifiers ?? [], 'user', await envOfApp(c.req.param('id')), undefined, body.as === 'task' ? 'task' : 'idea'), 201) } catch (err) { return planError(c, err) }
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
    const { text, context, images } = await c.req.json<{ text: string; context?: TalkContext; images?: ImageIn[] }>()
    try { return c.json(await say(c.req.param('id'), text ?? '', context, undefined, await saveImages(c.req.param('id'), images)), 202) } catch (err) { return planError(c, err) }
  })
  api.get('/talks/:id/images/:image', async (c) => { // a picture dropped on the conversation, for its transcript
    const f = await imageFile(c.req.param('id'), c.req.param('image'))
    if (!f) return c.json({ error: 'no such image' }, 404)
    return new Response(await readFile(f.path), { headers: { 'content-type': f.mediaType, 'cache-control': 'private, max-age=31536000, immutable' } })
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
  api.get('/ideas/:id', async (c) => { const i = await getIdea(c.req.param('id')); return i ? c.json({ ...i, origin: originView(await originOf({ ideaId: i.id })) }) : c.json({ error: 'no such idea' }, 404) }) // one idea: what a tab on it is named after
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
      // One approval, not two (Sandy, 2026-11-14: "I approve the brief, which basically ends with the prototype"): approving the
      // prototype approves the brief with it when the brief is ready for that. Where it is not (not written, a step still
      // owed or undecided), the prototype stands approved and the brief stays the person's, as before.
      let brief: { approved: boolean; why?: string } | undefined
      if (approve && c.req.param('key') === 'prototype') {
        const [t] = await db.select().from(issueTable).where(eq(issueTable.id, c.req.param('id')))
        if (t && !t.briefApprovedBy) {
          await skipUntouched(t.id).catch(() => {}) // the optional steps the person went past: skipped, so they do not hold the brief
          try { await approveBrief(t.id, 'user'); await autoSave(t.id, 'brief_approved'); brief = { approved: true }; void maybeBuild(t.id) }
          catch (err) { brief = { approved: false, why: err instanceof Error ? err.message : String(err) } }
        }
      }
      if (approve && c.req.param('key') === 'prototype') void advanceChecks(c.req.param('id')).catch((err) => console.error('checks: could not start', err)) // the checks run by themselves from here
      return c.json(brief ? { ...row, brief } : row)
    } catch (err) { return planError(c, err) }
  })
  api.put('/issues/:id/acceptance', async (c) => { // {add?, update?, remove?}: the task's acceptance criteria
    try { return c.json(await setAcceptance(c.req.param('id'), await c.req.json<AcceptanceChange>(), 'user')) } catch (err) { return planError(c, err) }
  })
  // A task builds by itself once two things are true, whichever comes last: its brief is approved, and the checks that
  // follow its prototype are done (Sandy, 2026-11-14: "once we've approved the prototype … it should all just be
  // automated from that point forward"). No prototype in play: there are no checks, and the brief's approval is enough.
  const maybeBuild = async (issueId: string) => {
    try {
      const [t] = await db.select().from(issueTable).where(eq(issueTable.id, issueId))
      if (!t?.briefApprovedBy || t.parentId || t.kind !== 'code') return
      const [a] = await db.select().from(appTable).where(eq(appTable.id, t.appId))
      if (!autoBuild(a?.setup)) return
      const v = await stepsOf({ issueId })
      if (checksOwed(v.states, v.resolved.workflow).length) return // the prototype's checks first; they call back here when they are in
      await runner.buildTask(issueId, 'engine')
    } catch (err) { console.error(`[engine] building ${issueId} by itself: ${err instanceof Error ? err.message : err}`) }
  }
  onChecksDone((issueId) => void maybeBuild(issueId))
// A workflow changed, or another one chosen: what follows the prototype may be different now (fewer checks, or more),
  // so every task of the app that is under way is carried on at once, as its own speed switch used to do.
  const carryOn = async (appId: string) => {
    const open = await db.select({ id: issueTable.id }).from(issueTable).where(and(eq(issueTable.appId, appId), isNull(issueTable.parentId), eq(issueTable.kind, 'code'), inArray(issueTable.state, ['todo', 'in_progress'])))
    for (const t of open.slice(0, 100)) { void maybeBuild(t.id); void advanceChecks(t.id).catch(() => {}) }
  }
  // After a prototype the plan comes before the blast radius and the audit, which read it: when the line reaches that
  // point the task is planned, and the line is carried on once the sub-tasks are in. An app that waits plans by hand.
  onPlanWanted((issueId) => void (async () => {
    const [t] = await db.select().from(issueTable).where(eq(issueTable.id, issueId))
    if (!t) return
    const [a] = await db.select().from(appTable).where(eq(appTable.id, t.appId))
    if (!autoBuild(a?.setup)) return
    await runner.planTask(issueId, () => void advanceChecks(issueId).catch(() => {}))
  })().catch((err) => console.error(`[engine] planning ${issueId} after its prototype: ${err instanceof Error ? err.message : err}`)))
  api.post('/issues/:id/brief/approve', async (c) => {
    const { approve = true } = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }))
    try {
      if (approve) await skipUntouched((await resolveIssue(db, c.req.param('id'))).id).catch(() => {}) // after an approved prototype, untouched optional steps do not hold the brief
      const row = await approveBrief(c.req.param('id'), 'user', approve)
      if (approve) await autoSave(c.req.param('id'), 'brief_approved') // before the plan and the build: "scrap the build" is going back to here
      if (approve) { void maybeBuild(row.id); void advanceChecks(row.id).catch(() => {}) } // no prototype: planned and built now. With one: the line after it carries on from here (the plan, its audit, the build)
      return c.json(settle(row))
    } catch (err) { return planError(c, err) }
  })
  // Task branches and save points (task-branches.ts). A move tells the task's open conversations what happened.
  const moved = async <T extends { sessions: string[]; note: string }>(r: T) => {
    for (const id of r.sessions) await say(id, r.note, undefined, { author: 'engine', kind: 'brief', payload: { label: 'The task moved to another task branch' } }).catch(() => {})
    return settle(r)
  }
  // The smoke test (smoke.ts): the checks left to a person on a built task, where it runs, and their marks.
  api.get('/issues/:id/smoke', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await smokeView(t.id)) } catch (err) { return planError(c, err, 404) } })
  // The smoke test's terminal (smoke-terminal.ts): a shell on this computer, so only Evident's own page may reach it.
  const term = async (c: any, fn: (issueId: string, /** The terminal: a set-up's own, or its throwaway one. */ key: string, body: Record<string, unknown>, which: { setup: string; scratch: boolean }) => unknown) => {
    if (!ownPage({ origin: c.req.header('origin'), site: c.req.header('sec-fetch-site'), contentType: c.req.header('content-type'), method: c.req.method })) return c.json({ error: 'the terminal takes requests from Evident\'s own page only' }, 403)
    try {
      const t = await resolveIssue(db, c.req.param('id'))
      const body = c.req.method === 'GET' ? {} : await c.req.json().catch(() => ({})) as Record<string, unknown>
      const setup = typeof body.setup === 'string' ? body.setup : c.req.query('setup') ?? (await smokeView(t.id)).setups[0].key
      const scratch = body.scratch === true || c.req.query('scratch') === '1'
      return await fn(t.id, scratch ? scratchKey(setup) : setup, body, { setup, scratch })
    } catch (err) { return planError(c, err, 400) }
  }
  api.post('/issues/:id/smoke/terminal', (c) => term(c, async (id, _key, b, which) => c.json(await openTerminal(id, which.setup, { cols: Number(b.cols) || undefined, rows: Number(b.rows) || undefined }, which.scratch))))
  api.post('/issues/:id/smoke/terminal/input', (c) => term(c, (id, setup, b) => { typeInTerminal(id, setup, String(b.data ?? '').slice(0, 20_000)); return c.json({ ok: true }) }))
  api.post('/issues/:id/smoke/terminal/resize', (c) => term(c, (id, setup, b) => { resizeTerminal(id, setup, Number(b.cols), Number(b.rows)); return c.json({ ok: true }) }))
  api.post('/issues/:id/smoke/terminal/close', (c) => term(c, async (id, setup) => { await closeTerminal(id, setup); return c.json(await smokeView(id)) }))
  api.get('/issues/:id/smoke/terminal/stream', (c) => term(c, (id, setup) => streamSSE(c, async (stream) => {
    let stop = () => {}
    await new Promise<void>((done) => {
      let sending: Promise<unknown> = Promise.resolve()
      const say = (event: string, data: string) => { sending = sending.then(() => stream.writeSSE({ event, data })).catch(() => done()) }
      try { stop = watchTerminal(id, setup, (d) => say('data', JSON.stringify(d)), (code) => { say('exit', String(code)); void sending.then(() => done()) }) } catch (err) { say('gone', String((err as Error).message)); void sending.then(() => done()) }
      stream.onAbort(() => done())
    })
    stop()
  })))
  api.post('/issues/:id/smoke/start', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const body = await c.req.json().catch(() => ({})) as { clean?: boolean; setup?: string; live?: unknown; fixture?: string; empty?: boolean }; return c.json(await startSmoke(t.id, 'user', { empty: body.empty === true, fixture: typeof body.fixture === 'string' && body.fixture ? body.fixture : undefined, clean: body.clean === true, setup: typeof body.setup === 'string' ? body.setup : undefined, live: Array.isArray(body.live) ? body.live.filter((x): x is string => typeof x === 'string') : undefined }), 202) } catch (err) { return planError(c, err) } })
  // Its database as it is now, kept as a fixture of the app's. real: it holds something real, this computer only.
  api.post('/issues/:id/smoke/keep', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json().catch(() => ({})) as { name?: string; setup?: string; real?: boolean }; return c.json(await keepSmokeDatabase(t.id, { name: String(b.name ?? ''), setup: typeof b.setup === 'string' ? b.setup : undefined, real: b.real === true }, 'user'), 201) } catch (err) { return planError(c, err) } })
  // The folder of files it was given, opened in this computer's file manager.
  api.post('/issues/:id/smoke/files/reveal', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json().catch(() => ({})) as { setup?: string }; return c.json(await revealSmokeFiles(t.id, typeof b.setup === 'string' ? b.setup : undefined)) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/smoke/stop', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const body = await c.req.json().catch(() => ({})) as { setup?: string }; await stopSmoke(t.id, typeof body.setup === 'string' ? body.setup : undefined); return c.json(await smokeView(t.id)) } catch (err) { return planError(c, err) } })
  // An agent tries one check and says what it saw; it marks nothing (smoke.ts, trySmoke).
  // The person accepts the smoke test: the built code is what goes to review (smoke.ts, acceptSmoke).
  api.post('/issues/:id/smoke/accept', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await acceptSmoke(t.id, 'user')) } catch (err) { return planError(c, err) } })
  // A release check, said done (or not, with why) by whoever deployed (smoke.ts, markRelease).
  api.post('/issues/:id/release/:criterion', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json().catch(() => ({})) as { done?: boolean; note?: string }; if (typeof b.done !== 'boolean') return c.json({ error: 'done is true or false' }, 400); return c.json(await markRelease(t.id, c.req.param('criterion'), { done: b.done, note: b.note }, 'user')) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/smoke/:criterion/try', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json((await trySmoke(t.id, c.req.param('criterion'), 'user')).view) } catch (err) { return planError(c, err, 400) } })
  api.post('/issues/:id/smoke/:criterion', async (c) => {
    const body = await c.req.json<{ pass?: boolean; note?: string; skip?: boolean }>().catch(() => ({} as { pass?: boolean; note?: string; skip?: boolean }))
    if (typeof body.pass !== 'boolean' && body.skip !== true) return c.json({ error: 'pass is true or false, or skip is true' }, 400)
    try {
      const t = await resolveIssue(db, c.req.param('id'))
      const view = await markSmoke(t.id, c.req.param('criterion'), { pass: body.pass === true, note: body.note, skip: body.skip === true }, 'user')
      const { sentBack } = await runner.afterSmoke(t.id) // every check marked: what failed goes back, or the task carries on
      return c.json({ ...view, sentBack })
    } catch (err) { return planError(c, err) }
  })
  api.get('/issues/:id/checklist', async (c) => { // where a checklist task stands: its stages and each item's mark; null for a staged task
    try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await checklistOf(t.id)) } catch (err) { return planError(c, err, 404) }
  })
  // A pull request is never opened by the engine on its own (Sandy, 2026-11-16: one opened after the first of nine
  // sub-tasks, before the person's own checks). The person submits it, once every sub-task has landed.
  api.post('/issues/:id/pr/submit', async (c) => {
    try { const t = await resolveIssue(db, c.req.param('id')); if (!t.projectId) throw new PlanError('this task has not been planned or built yet'); return c.json(await runner.submitPr(t.projectId, t.id)) } catch (err) { return planError(c, err) }
  })
  // A task's pull request as a step of its own (pr-view.ts): where it stands, its message, what was said on it. Marking a draft ready is the person's.
  api.get('/issues/:id/pr', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await (await import('./pr-view.js')).prView(t.id, { preview: (p, i) => runner.previewPr(p, i) })) } catch (err) { return planError(c, err, 404) } })
  api.put('/issues/:id/pr/message', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json() as { body?: string | null }; return c.json(await (await import('./pr-view.js')).setPrMessage(t.id, b.body ?? null)) } catch (err) { return planError(c, err) } })
  // Bring an open pull request up to date now: its title and description as they stand. The person's, like submitting.
  api.post('/issues/:id/check', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await runner.checkAgain(t.id, 'user')) } catch (err) { return planError(c, err) } }) // the check again, of what is not checked yet: a person's press (the task's agent has check_again)
  api.post('/issues/:id/test', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await runner.testAgain(t.id)) } catch (err) { return planError(c, err) } }) // the whole test run again, on the task's branch as it is now: a person's press
  api.post('/issues/:id/pr/update', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); if (!t.projectId) throw new PlanError('this task has not been planned or built yet'); const [p] = await db.select().from(projectTable).where(eq(projectTable.id, t.projectId)); const rows = await db.select().from(prRows).where(eq(prRows.projectId, t.projectId)); return c.json(await runner.refreshPr(t.projectId, rows.some((q) => q.issueId === t.id) || (p?.prMode ?? 'issue') === 'issue' ? t.id : undefined)) } catch (err) { return planError(c, err) } })
  // A task's review copy (review-copy.ts): where it stands, and making it (again). Made, it is pushed, and the pull request's description is brought up to date to name it.
  api.get('/issues/:id/review-copy', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await (await import('./review-copy.js')).reviewCopy(t.id, { fresh: c.req.query('fresh') === '1' })) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/review-copy', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json().catch(() => ({})) as { fixture?: string | null; try?: string; push?: boolean }; const made = await (await import('./review-copy.js')).makeReviewCopy(t.id, { fixture: b.fixture, try: b.try, push: b.push }); if (b.push !== false && t.projectId) await runner.refreshPr(t.projectId, t.id).catch(() => null); return c.json(made) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/pr/ready', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); return c.json(await (await import('./pr-view.js')).markReady(t.id)) } catch (err) { return planError(c, err) } })
  api.post('/projects/:id/pr/submit', async (c) => { try { return c.json(await runner.submitPr(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/issues/:id/merge-guide', async (c) => { // what the pull request will open with, for whoever approves it
    try {
      const t = await resolveIssue(db, c.req.param('id'))
      const [a] = await db.select().from(appTable).where(eq(appTable.id, t.appId))
      const subs = await db.select().from(issueTable).where(eq(issueTable.parentId, t.id))
      const pending = subs.filter((x) => !['done', 'canceled', 'duplicate'].includes(x.state)).map((x) => identifier(a.key, x.number))
      return c.json({ ...(await mergeGuideAndRecord(t.id, identifier(a.key, t.number), t.title, pending)), subTasks: subs.length })
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
  api.put('/workflows/:id', async (c) => { try { const body = await c.req.json<{ appId: string }>(); const w = await saveWorkflow({ ...(body as never as Parameters<typeof saveWorkflow>[0]), id: c.req.param('id') }, 'user'); void carryOn(body.appId).catch(() => {}); return c.json(w) } catch (err) { return planError(c, err) } })
  for (const [kind, key] of [['apps', 'appId'], ['projects', 'projectId'], ['issues', 'issueId']] as const) {
    api.post(`/${kind}/:id/workflow`, async (c) => {
      const { workflowId } = await c.req.json<{ workflowId: string | null }>()
      try {
        const out = await useWorkflow({ [key]: c.req.param('id') } as never, workflowId ?? null, 'user')
        if (kind === 'apps') void carryOn(c.req.param('id')).catch(() => {})
        else if (kind === 'issues') { const t = await resolveIssue(db, c.req.param('id')).catch(() => null); if (t) { void maybeBuild(t.id); void advanceChecks(t.id).catch(() => {}) } }
        else { const [p] = await db.select().from(projectTable).where(eq(projectTable.id, c.req.param('id'))); if (p) void carryOn(p.appId).catch(() => {}) }
        return c.json(out)
      } catch (err) { return planError(c, err) }
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
  api.get('/issues/:id', async (c) => { try { const d = await issueDetail((await resolveIssue(db, c.req.param('id'))).id); return c.json(!d.parentId && d.kind === 'code' && d.state === 'in_review' ? { ...d, close: await closeView(d.id) } : d) } catch (err) { return planError(c, err, 404) } })
  // A person closes a task: it is Done. Only once its pull request is merged and every check of theirs is passed or skipped (close.ts).
  api.post('/issues/:id/close', async (c) => { try { return c.json(await closeTask((await resolveIssue(db, c.req.param('id'))).id, 'user')) } catch (err) { return planError(c, err) } })
  // A task's team ticket and its name for the team (ticket.ts): set by the person on its page; a build held for want of a ticket carries on.
  api.put('/issues/:id/team', async (c) => { try { const t = await resolveIssue(db, c.req.param('id')); const b = await c.req.json() as { ticket?: string | null; title?: string | null }; const out = await (await import('./ticket.js')).setTeamNames(t.id, b); void runner.dispatch(); return c.json(out) } catch (err) { return planError(c, err) } })
  api.patch('/issues/:id', async (c) => { try { return c.json(settle(await updateIssue((await resolveIssue(db, c.req.param('id'))).id, await c.req.json(), 'user'))) } catch (err) { return planError(c, err) } })
  api.post('/issues/:id/state', async (c) => {
    const { state, reason } = await c.req.json<{ state: IssueState; reason?: string }>()
    if (!ISSUE_STATES.includes(state)) return c.json({ error: `state must be one of ${ISSUE_STATES.join(', ')}` }, 400)
    try {
      const { id } = await resolveIssue(db, c.req.param('id'))
      if (state === 'done') await guardComplete(db, id)
      if (state === 'done') { const t = await getIssue(db, id); if (!t.parentId && t.kind === 'code' && t.state === 'in_review') { const w = await closeView(id); if (!w.can) throw new PlanError(`this task cannot be closed yet: ${w.waits.join(' ')}`) } } // a built task is done by being closed, by the same rule
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
  api.get('/projects', async (c) => { const a = c.req.query('app'); return a ? c.json(await listProjects({ all: c.req.query('all') === '1', solo: c.req.query('solo') === '1', appId: a })) : c.json({ error: 'app is required: one app at a time' }, 400) })
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
  // Nightly checks (nightly.ts): each one's last run on the default branch, and the checkout's workflows to pick one from.
  api.get('/apps/:id/nightly', async (c) => { try { return c.json(await nightlyView(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  // Trying a probe on past work (trials.ts): the latest trial of each probe, the tasks one would run on, and starting one.
  api.get('/apps/:id/trials', async (c) => { try { return c.json({ trials: await trialsOf(c.req.param('id'), true), tasks: (await pastTasks(c.req.param('id'))).map(({ acceptance: _, ...t }) => t) }) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/trials', async (c) => { try { const { trial } = await startTrial(c.req.param('id'), await c.req.json()); return c.json(trial) } catch (err) { return planError(c, err) } })
  // Requirements (requirements.ts): the app's list is in its settings (setup.requirements); a project switches one on or off for its own tasks.
  api.get('/apps/:id/requirements', async (c) => { const [a] = await db.select().from(appTable).where(eq(appTable.id, c.req.param('id'))); return a ? c.json(requirementsOf(a.setup)) : c.json({ error: 'no such app' }, 404) })
  api.get('/projects/:id/requirements', async (c) => {
    const [p] = await db.select().from(projectTable).where(eq(projectTable.id, c.req.param('id')))
    if (!p) return c.json({ error: 'no such project' }, 404)
    const [a] = await db.select().from(appTable).where(eq(appTable.id, p.appId))
    return c.json({ requirements: requirementsOf(a.setup, p.requirements), own: p.requirements ?? {} })
  })
  api.put('/projects/:id/requirements', async (c) => { // {key: true | false | null}: null goes back to the app's
    const [p] = await db.select().from(projectTable).where(eq(projectTable.id, c.req.param('id')))
    if (!p) return c.json({ error: 'no such project' }, 404)
    const next: Record<string, boolean> = { ...(p.requirements ?? {}) }
    for (const [k, v] of Object.entries(await c.req.json<Record<string, boolean | null>>())) { if (typeof v === 'boolean') next[k] = v; else delete next[k] }
    await db.update(projectTable).set({ requirements: Object.keys(next).length ? next : null, updatedAt: new Date() }).where(eq(projectTable.id, p.id))
    const [a] = await db.select().from(appTable).where(eq(appTable.id, p.appId))
    return c.json({ requirements: requirementsOf(a.setup, next), own: next })
  })
  api.post('/projects/:id/cancel', async (c) => {
    try { return c.json(await runner.cancelProject(c.req.param('id'))) } catch (err) { return planError(c, err, 404) }
  })

  // The planner takes minutes: by default the request returns at once and the outcome arrives on the event stream
  // (issue.planned or issue.plan_failed, then the graph has the sub-issues); ?wait=1 holds the request until it is done.
  // Build one task: planned if it is not, then started. What approving its brief does by itself; here for a task approved before that, or an app that waits.
  api.post('/issues/:id/build', async (c) => {
    try {
      const { id } = await resolveIssue(db, c.req.param('id'))
      const v = await stepsOf({ issueId: id })
      const left = checksOwed(v.states, v.resolved.workflow) // after a prototype the plan is read first: nobody builds around that
      if (left.length) throw new PlanError(`it is built once the steps after its prototype are in; still to come: ${left.map((k) => step(k).label).join(', ')}`)
      return c.json(await runner.buildTask(id, 'user'))
    } catch (err) { return planError(c, err) }
  })
  api.post('/issues/:id/plan', async (c) => {
    let ctx
    try { ctx = await preparePlanning(c.req.param('id'), { actor: 'user' }) } catch (err) { return planError(c, err) }
    const onPlanned = () => { void runner.dispatch(); void advanceChecks(c.req.param('id')).catch(() => {}) } // sub-issues planned into a running project start right away; after a prototype, the blast radius and the audit read the plan next
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
    try {
      const out = await answerQuestion(c.req.param('id'), answer, 'user')
      const [q] = await db.select({ issueId: questionTable.issueId }).from(questionTable).where(eq(questionTable.id, c.req.param('id')))
      if (q?.issueId) void advanceChecks(q.issueId).catch(() => {}) // the last answer may be all the line was waiting to be reminded of
      return c.json(out)
    } catch (err) { return planError(c, err, 404) }
  })

  // By-hand transitions: how a person drives a draft's graph. The executor owns running projects.
  api.post('/projects/:id/pause', async (c) => { try { return c.json(await runner.pauseProject(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/projects/:id/resume', async (c) => { try { return c.json(await runner.resumeProject(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/sync', async (c) => c.json(await syncApp(c.req.param('id')))) // GitHub now: PRs, reviews, checks, main
  // Notes (notes.ts): dated, the app's, attached to the tasks they are about. ?issue= a task's; ?from=&to= days; ?kind=decision.
  api.get('/apps/:id/notes', async (c) => { try { return c.json(await listNotes(c.req.param('id'), { issueId: c.req.query('issue') || null, from: c.req.query('from') || null, to: c.req.query('to') || null, kind: c.req.query('kind') || null })) } catch (err) { return planError(c, err) } })
  api.post('/apps/:id/notes', async (c) => { try { return c.json(await addNote(c.req.param('id'), await c.req.json().catch(() => ({})), 'user'), 201) } catch (err) { return planError(c, err) } })
  api.patch('/apps/:id/notes/:note', async (c) => { try { return c.json(await editNote(c.req.param('id'), c.req.param('note'), await c.req.json().catch(() => ({})), 'user')) } catch (err) { return planError(c, err) } })
  api.delete('/apps/:id/notes/:note', async (c) => { try { return c.json(await removeNote(c.req.param('id'), c.req.param('note'), 'user')) } catch (err) { return planError(c, err) } })
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
    // A browser that lost the stream and came back says what it last saw (Last-Event-ID): carry on from there, so
    // nothing committed in the gap is missed. Otherwise ?since: a number, or now for only what happens from here on.
    const seen = Number(c.req.header('last-event-id'))
    const since = Number.isFinite(seen) && seen > 0 ? seen : c.req.query('since') === 'now' ? await latestSeq() : Number(c.req.query('since') ?? 0)
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
      }).catch((err) => {
        // A read that fails (the database connection dropped under it) must not end the engine: nobody awaits this
        // when an event sets it off, so the rejection had nowhere to go and took the process down (eleven times by
        // 2026-11-16). `last` has not moved, so the next event, or the browser's own retry, reads from the same place.
        console.warn(`[engine] the live feed could not read events after ${last}: ${String((err as Error)?.cause ?? (err as Error)?.message ?? err).slice(0, 200)}`)
      }))
      await stream.writeSSE({ id: String(since), event: 'ping', data: String(Date.now()) }) // where this stream starts: a page that loses it before any event still knows where to resume
      bus.on('event', send)
      let open = true
      const from = remoteIp((n) => c.req.header(n)) // a phone over Tailscale: here while it holds this feed
      const left = from ? deviceJoined(from) : null
      stream.onAbort(() => { open = false; bus.off('event', send); left?.() })
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
  stayUp() // a failure nobody was waiting on is logged, and the engine carries on
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}  (API under /api; UI at / when built)`))
  void reopenUnclosed().then((ids) => { if (ids.length) console.log(`[engine] ${ids.length} task${ids.length === 1 ? '' : 's'} marked done by a merge, with checks of yours unmarked, put back in review to be closed`) }).catch((err) => console.error('reopening unclosed tasks failed', err))
  void endStrayTrials().catch(() => {})
  // Apps from before there was one list (held.ts): their two stores become it, once.
  void (async () => { for (const a of await db.select().from(appTable)) if (hasLegacy(a.setup)) await patchSetup(a.id, (now) => (hasLegacy(now) ? { requirements: null, probes: null, requirements_added: null, held: diffsOf(now).length ? diffsOf(now) : null } : {})) })().catch((err) => console.error('moving apps to one list failed', err))
  void ensureMain().then((r) => { if (r.made) console.log(`[engine] ${r.made} app${r.made === 1 ? '' : 's'} given a Main workflow; what they had is Legacy`) }).catch((err) => console.error('workflows: could not make Main', err))
  void speedIntoWorkflows().then((r) => { if (r.moved) console.log(`[engine] ${r.moved} app${r.moved === 1 ? '' : 's'} set to Fast moved onto a fast workflow`) }).catch((err) => console.error('workflows: could not move the old speed setting', err))
  setTimeout(() => void resumeChecks().catch((err) => console.error('checks: could not resume after the restart', err)), 8_000) // a task's checks that were under way carry on
  void watchTerminals().catch(() => {}) // conversations still in a terminal: keep copying what's said there
  const stopSync = process.env.GITHUB_SYNC === '0' ? () => undefined : startSync(Number(process.env.GITHUB_SYNC_MINUTES ?? 2)) // GitHub: reviews, checks, merges, main moving
  const stopSummaries = process.env.SUMMARY === '0' ? () => undefined : startSummaries(Number(process.env.SUMMARY_HOURS ?? 24)) // the summary page, rewritten when a day old and something moved
  const shutdown = async () => { stopSync(); stopSummaries(); stopStorybooks(); stopShares(); stopPrototypes(); stopMains(); stopSmokes(); void closeTerminals(); stopStepRuns(); closeTalks(); await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
